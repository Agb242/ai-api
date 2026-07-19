import { Context } from 'koa';
import { PassThrough } from 'stream';
import { apiKeyService } from '../services/api-key.service';
import { gatewayService } from '../services/gateway.service';
import { llmRouter } from '../services/llm/router';
import { Organization } from '../models/Organization';
import { walletService } from '../services/wallet.service';
import { t } from '../i18n/messages';
import { realtimeHub } from '../services/realtime.service';
import logger from '../config/logger';

function ok(ctx: Context, data: unknown, status = 200) {
  ctx.status = status;
  ctx.body = { success: true, data };
}

function fail(ctx: Context, code: string, status: number, vars?: Record<string, string>) {
  const locale = ctx.state.locale || 'fr';
  ctx.status = status;
  ctx.body = { success: false, error: { message: t(locale, code, vars), code } };
}

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

export const playgroundController = {
  async chatCompletions(ctx: Context) {
    const locale = (ctx.state.locale || 'fr') as 'fr' | 'en';
    const body = (ctx.request.body || {}) as any;
    const apiKeyId = String(body.api_key_id || '');
    const started = Date.now();

    if (!apiKeyId || !body.model) {
      return fail(ctx, 'MISSING_FIELDS', 400);
    }

    const key = await apiKeyService.getById(ctx.state.orgId!, apiKeyId);
    if (!key) return fail(ctx, 'NOT_FOUND', 404);
    if (key.status !== 'active') {
      return fail(ctx, key.status === 'disabled' ? 'KEY_DISABLED' : 'KEY_REVOKED', 403);
    }

    const organization = await Organization.query().findById(ctx.state.orgId!);
    if (!organization) return fail(ctx, 'NOT_FOUND', 404);

    const chatBody = {
      model: body.model,
      messages: body.messages,
      stream: body.stream !== false,
      temperature: body.temperature,
      max_tokens: body.max_tokens,
    };

    try {
      const { model, payload, filterResult } = await gatewayService.prepare(
        { apiKey: key, organization, locale },
        chatBody,
      );

      // Session proxy: forward with LiteLLM master key; logs still bound to org api_key_id.
      const result = await llmRouter.forward(payload, model);

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
            apiKey: key,
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
            apiKey: key,
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
          apiKey: key,
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
        apiKey: key,
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
      if (code === 'REQUEST_BLOCKED') {
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
      logger.error('Playground error', { code, message: err.message });
      errorBody(ctx, 'PROVIDER_ERROR', 502);
    }
  },

  async context(ctx: Context) {
    const wallet = await walletService.getByOrg(ctx.state.orgId!);
    ok(ctx, {
      wallet_balance: wallet ? Number(wallet.balance) : 0,
      currency: 'credits',
    });
  },
};
