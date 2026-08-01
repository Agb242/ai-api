import { Context } from 'koa';
import { PassThrough } from 'stream';
import { gatewayService } from '../services/gateway.service';
import { llmRouter } from '../services/llm/router';
import { classifyEndpoint } from '../services/llm/endpoint-class';
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

function multipartFromCtx(ctx: Context): {
  fields: Record<string, string>;
  files: Array<{ field: string; filepath: string; filename?: string; contentType?: string }>;
} | null {
  const contentType = ctx.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) return null;

  const body = (ctx.request.body || {}) as Record<string, unknown>;
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined || v === null) continue;
    fields[k] = typeof v === 'string' ? v : String(v);
  }

  const filesRaw = (ctx.request as any).files || {};
  const files: Array<{
    field: string;
    filepath: string;
    filename?: string;
    contentType?: string;
  }> = [];

  for (const [field, value] of Object.entries(filesRaw)) {
    const list = Array.isArray(value) ? value : [value];
    for (const f of list) {
      if (!f) continue;
      const filepath = (f as any).filepath || (f as any).path;
      if (!filepath) continue;
      files.push({
        field,
        filepath,
        filename: (f as any).originalFilename || (f as any).name || 'file',
        contentType: (f as any).mimetype || (f as any).type,
      });
    }
  }

  return { fields, files };
}

async function handleGatewayErrors(
  ctx: Context,
  err: any,
  opts: {
    organization: any;
    apiKey: any;
    body: any;
    started: number;
    modelId?: string;
  },
) {
  const code = err.code || 'PROVIDER_ERROR';
  const latencyMs = Date.now() - opts.started;

  if (code === 'REQUEST_BLOCKED') {
    realtimeHub.emitRequest(opts.organization.id, {
      id: err.logId,
      model: opts.modelId || opts.body?.model,
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
  if (code === 'ORG_BUDGET_EXCEEDED') {
    errorBody(ctx, 'ORG_BUDGET_EXCEEDED', 402);
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
    organization: opts.organization,
    apiKey: opts.apiKey,
    modelId: opts.modelId || opts.body?.model,
    latencyMs,
    errorCode: code,
  });
  errorBody(ctx, 'PROVIDER_ERROR', 502);
}

export const gatewayController = {
  async chatCompletions(ctx: Context): Promise<void> {
    ctx.state.gatewayPath = '/v1/chat/completions';
    return gatewayController.proxy(ctx);
  },

  /** Generic allowlisted proxy — JSON, multipart, streaming, binary TTS. */
  async proxy(ctx: Context): Promise<void> {
    const locale = ctx.state.locale || 'fr';
    const apiKey = ctx.state.apiKey!;
    const organization = ctx.state.organization!;
    const started = Date.now();

    const path =
      (ctx.state.gatewayPath as string) ||
      ctx.path ||
      ctx.request.path;
    const classified = classifyEndpoint(ctx.method, path);

    if (classified.class === 'unsupported') {
      errorBody(ctx, 'NOT_FOUND', 404);
      return;
    }

    if (classified.class === 'models' && ctx.method === 'GET') {
      return gatewayController.listModels(ctx);
    }

    const body = (ctx.request.body || {}) as Record<string, unknown>;
    const multipart = multipartFromCtx(ctx);
    const endUserId =
      ctx.get('X-User-Id') ||
      ctx.get('X-End-User-Id') ||
      (typeof body.user === 'string' ? body.user : '') ||
      '';

    const needsModel = ['chat', 'completions', 'embeddings', 'images'].includes(
      classified.class,
    );
    if (needsModel && !multipart && !body.model) {
      errorBody(ctx, 'MISSING_FIELDS', 400);
      return;
    }
    if (
      needsModel &&
      multipart &&
      !multipart.fields.model &&
      !body.model
    ) {
      errorBody(ctx, 'MISSING_FIELDS', 400);
      return;
    }

    try {
      const prepareBody = multipart
        ? { ...multipart.fields, ...(body.model ? body : {}) }
        : body;

      const { model, payload, filterResult } = await gatewayService.prepareForClass(
        { apiKey, organization, locale: locale as 'fr' | 'en' },
        classified,
        prepareBody,
      );

      const wantsStream = !!(payload as any).stream && !classified.binaryResponse;
      const extraHeaders: Record<string, string> = {};
      if (endUserId) {
        extraHeaders['X-User-Id'] = endUserId;
        // LiteLLM OpenAI-compatible end-user field often mirrored via header
        extraHeaders['x-litellm-end-user'] = endUserId;
      }
      const result = await llmRouter.proxy({
        method: ctx.method,
        path: classified.upstreamPath,
        body: multipart ? undefined : { ...payload, ...(endUserId && !payload.user ? { user: endUserId } : {}) },
        multipart: multipart || undefined,
        bearerKey: ctx.state.rawApiKey || undefined,
        stream: wantsStream,
        binaryResponse: classified.binaryResponse,
        extraHeaders,
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
            ruleId: (filterResult as any).rule?.id,
            status: result.status >= 400 ? 'error' : 'success',
            modelIdFallback: String(payload.model || ''),
            endUserId: endUserId || null,
          });
          realtimeHub.emitRequest(organization.id, {
            id: log.id,
            model: model?.model_id || String(payload.model || ''),
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

      if (result.buffer) {
        if (result.status >= 400) {
          await gatewayService.logError({
            organization,
            apiKey,
            model,
            latencyMs: Date.now() - started,
            errorCode: 'PROVIDER_ERROR',
          });
          ctx.status = result.status;
          ctx.set('Content-Type', result.headers['content-type'] || 'application/json');
          ctx.body = result.buffer;
          return;
        }

        const latencyMs = Date.now() - started;
        const { log, cost } = await gatewayService.finalize({
          organization,
          apiKey,
          model,
          body: payload,
          responseData: {},
          latencyMs,
          backend: result.backend,
          status: 'success',
          modelIdFallback: String(payload.model || multipart?.fields?.model || ''),
          endUserId: endUserId || null,
        });
        realtimeHub.emitRequest(organization.id, {
          id: log.id,
          model: model?.model_id || String(payload.model || ''),
          status: log.status,
          latency_ms: latencyMs,
          cost,
          created_at: log.created_at,
        });

        ctx.status = result.status;
        ctx.set('Content-Type', result.headers['content-type'] || 'audio/mpeg');
        if (result.headers['content-disposition']) {
          ctx.set('Content-Disposition', result.headers['content-disposition']);
        }
        ctx.body = result.buffer;
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
        ruleId: (filterResult as any).rule?.id,
        status: filterResult.action === 'redact' ? 'redacted' : 'success',
        modelIdFallback: String(payload.model || ''),
        endUserId: endUserId || null,
      });

      realtimeHub.emitRequest(organization.id, {
        id: log.id,
        model: model?.model_id || String(payload.model || ''),
        status: log.status,
        latency_ms: latencyMs,
        cost,
        created_at: log.created_at,
        filter_action: log.filter_action,
      });

      ctx.status = result.status || 200;
      ctx.body = result.data;
    } catch (err: any) {
      await handleGatewayErrors(ctx, err, {
        organization,
        apiKey,
        body,
        started,
        modelId: typeof body.model === 'string' ? body.model : undefined,
      });
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
