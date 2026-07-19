import { Context } from 'koa';
import { PassThrough } from 'stream';
import { gatewayService } from '../services/gateway.service';
import { llmRouter } from '../services/llm/router';
import { t } from '../i18n/messages';
import { realtimeHub } from '../services/realtime.service';
import logger from '../config/logger';

function errorBody(ctx: Context, code: string, status: number, vars?: Record<string, string>) {
  const locale = ctx.state.locale || 'fr';
  ctx.status = status;
  ctx.body = {
    error: {
      message: t(locale, code, vars),
      code,
    },
  };
}

export const gatewayController = {
  async chatCompletions(ctx: Context): Promise<void> {
    const locale = ctx.state.locale || 'fr';
    const apiKey = ctx.state.apiKey!;
    const organization = ctx.state.organization!;
    const body = (ctx.request.body || {}) as any;
    const started = Date.now();

    if (!body.model) {
      errorBody(ctx, 'MISSING_FIELDS', 400);
      return;
    }

    try {
      const { model, payload, filterResult } = await gatewayService.prepare(
        { apiKey, organization, locale },
        body,
      );

      // Prefer the caller's virtual key so LiteLLM spend/model ACL match the issued key.
      const result = await llmRouter.forward(payload, model, {
        bearerKey: ctx.state.rawApiKey || undefined,
      });

      if (result.stream) {
        ctx.status = result.status;
        ctx.set('Content-Type', result.headers['content-type'] || 'text/event-stream');
        ctx.set('Cache-Control', 'no-cache');
        ctx.set('Connection', 'keep-alive');

        const pass = new PassThrough();
        ctx.body = pass;

        let collected = '';
        result.stream.on('data', (chunk: Buffer) => {
          collected += chunk.toString('utf8');
          pass.write(chunk);
        });
        result.stream.on('end', async () => {
          pass.end();
          const latencyMs = Date.now() - started;
          let prompt_tokens = 0;
          let completion_tokens = 0;
          const usageMatch = collected.match(/"usage"\s*:\s*\{[^}]+\}/);
          if (usageMatch) {
            try {
              const usage = JSON.parse(`{${usageMatch[0]}}`).usage;
              prompt_tokens = usage.prompt_tokens || 0;
              completion_tokens = usage.completion_tokens || 0;
            } catch {
              /* ignore */
            }
          }
          const { log, cost } = await gatewayService.finalize({
            organization,
            apiKey,
            model,
            body: payload,
            responseData: { usage: { prompt_tokens, completion_tokens } },
            latencyMs,
            backend: result.backend,
            filterAction: filterResult.action === 'redact' ? 'redact' : undefined,
            ruleId: filterResult.rule?.id,
            status: result.status >= 400 ? 'error' : 'success',
          });
          realtimeHub.emitRequest(organization.id, {
            id: log.id,
            model: model.model_id,
            status: log.status,
            latency_ms: latencyMs,
            cost,
            created_at: log.created_at,
            filter_action: log.filter_action,
          });
        });
        result.stream.on('error', async () => {
          pass.end();
          await gatewayService.logError({
            organization,
            apiKey,
            model,
            latencyMs: Date.now() - started,
            errorCode: 'PROVIDER_ERROR',
            streamed: true,
          });
        });
        return;
      }

      if (result.status >= 400) {
        await gatewayService.logError({
          organization,
          apiKey,
          model,
          latencyMs: Date.now() - started,
          errorCode: 'PROVIDER_ERROR',
        });
        ctx.status = result.status;
        ctx.body = result.data;
        return;
      }

      const latencyMs = Date.now() - started;
      const { log, cost } = await gatewayService.finalize({
        organization,
        apiKey,
        model,
        body: payload,
        responseData: result.data,
        latencyMs,
        backend: result.backend,
        filterAction: filterResult.action === 'redact' ? 'redact' : undefined,
        ruleId: filterResult.rule?.id,
        status: filterResult.action === 'redact' ? 'redacted' : 'success',
      });

      realtimeHub.emitRequest(organization.id, {
        id: log.id,
        model: model.model_id,
        status: log.status,
        latency_ms: latencyMs,
        cost,
        created_at: log.created_at,
        filter_action: log.filter_action,
      });

      ctx.status = 200;
      ctx.body = result.data;
    } catch (err: any) {
      const code = err.code || 'PROVIDER_ERROR';
      const latencyMs = Date.now() - started;

      if (code === 'REQUEST_BLOCKED') {
        realtimeHub.emitRequest(organization.id, {
          id: err.logId,
          model: body.model,
          status: 'blocked',
          latency_ms: latencyMs,
          cost: 0,
          created_at: new Date().toISOString(),
          filter_action: 'block',
          rule: err.ruleName,
        });
        errorBody(ctx, 'REQUEST_BLOCKED', 422, { rule: err.ruleName || 'filter' });
        return;
      }

      if (code === 'INSUFFICIENT_BALANCE') {
        errorBody(ctx, 'INSUFFICIENT_BALANCE', 402);
        return;
      }
      if (code === 'KEY_BUDGET_EXCEEDED') {
        errorBody(ctx, 'KEY_BUDGET_EXCEEDED', 402);
        return;
      }
      if (code === 'MODEL_NOT_FOUND') {
        errorBody(ctx, 'MODEL_NOT_FOUND', 404);
        return;
      }
      if (code === 'MODEL_UNAVAILABLE') {
        errorBody(ctx, 'MODEL_UNAVAILABLE', 503);
        return;
      }
      if (code === 'LITELLM_UNAVAILABLE' || code === 'LITELLM_NOT_CONFIGURED') {
        errorBody(ctx, code, 503);
        return;
      }

      logger.error('Gateway error', { code, message: err.message, stack: err.stack });
      await gatewayService.logError({
        organization,
        apiKey,
        modelId: body.model,
        latencyMs,
        errorCode: code,
      });
      errorBody(ctx, 'PROVIDER_ERROR', 502);
    }
  },

  async listModels(ctx: Context): Promise<void> {
    try {
      const { litellmSyncService } = await import('../services/litellm-sync.service');
      const live = await litellmSyncService.liveModels();
      if (!live.litellm_healthy) {
        errorBody(ctx, 'LITELLM_UNAVAILABLE', 503);
        return;
      }
      ctx.status = 200;
      ctx.body = {
        object: 'list',
        data: Array.isArray((live as any).data) ? (live as any).data : [],
      };
    } catch {
      errorBody(ctx, 'LITELLM_UNAVAILABLE', 503);
    }
  },
};
