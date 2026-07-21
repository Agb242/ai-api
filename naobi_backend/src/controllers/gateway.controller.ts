import { Context } from 'koa';
import { PassThrough } from 'stream';
import fs from 'fs';
import FormData from 'form-data';
import { gatewayService } from '../services/gateway.service';
import { llmRouter } from '../services/llm/router';
import {
  classifyEndpoint,
  normalizeGatewayPath,
  wantsStream,
} from '../services/llm/endpoint-class';
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

function litellmPathFromCtx(ctx: Context): string {
  // Prefer path under /v1 (router prefix stripped from ctx.path in some setups —
  // use originalUrl without query).
  const raw = (ctx.request.path || ctx.path || '').split('?')[0];
  if (raw.startsWith('/v1/') || raw === '/v1') return raw;
  // Mounted at /v1 with relative routes like /embeddings → rebuild
  if (raw.startsWith('/')) return raw.startsWith('/v1') ? raw : `/v1${raw}`;
  return `/v1/${raw}`;
}

function buildMultipartForm(ctx: Context): FormData | null {
  const files = (ctx.request as any).files as
    | Record<string, { filepath?: string; path?: string; originalFilename?: string; newFilename?: string; mimetype?: string; size?: number } | Array<any>>
    | undefined;
  const body = (ctx.request.body || {}) as Record<string, unknown>;
  if (!files && !Object.keys(body).length) return null;

  const form = new FormData();
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null) continue;
    form.append(key, String(value));
  }
  if (files) {
    for (const [field, fileOrArr] of Object.entries(files)) {
      const list = Array.isArray(fileOrArr) ? fileOrArr : [fileOrArr];
      for (const f of list) {
        if (!f) continue;
        const filepath = f.filepath || f.path;
        if (!filepath || !fs.existsSync(filepath)) continue;
        form.append(field, fs.createReadStream(filepath), {
          filename: f.originalFilename || f.newFilename || 'upload',
          contentType: f.mimetype || 'application/octet-stream',
        });
      }
    }
  }
  return form;
}

async function handleProxy(ctx: Context): Promise<void> {
  const locale = (ctx.state.locale || 'fr') as 'fr' | 'en';
  const apiKey = ctx.state.apiKey!;
  const organization = ctx.state.organization!;
  const method = ctx.method.toUpperCase();
  const path = normalizeGatewayPath(litellmPathFromCtx(ctx));
  const classified = classifyEndpoint(method, path);
  const started = Date.now();

  if (!classified) {
    errorBody(ctx, 'NOT_FOUND', 404);
    return;
  }

  const rawBody = (ctx.request.body || {}) as Record<string, unknown>;
  const isMultipart =
    classified.multipart &&
    String(ctx.request.headers['content-type'] || '').includes('multipart/form-data');

  try {
    const { model, payload, filterResult } = await gatewayService.prepareForClass(
      { apiKey, organization, locale },
      rawBody,
      classified,
    );

    const stream = wantsStream(payload, classified, path);
    const formData = isMultipart ? buildMultipartForm(ctx) : null;

    const binary =
      classified.binaryResponse &&
      (path.endsWith('/content') ||
        path.includes('/audio/speech') ||
        (classified.class === 'audio' && !path.includes('transcription')));

    const result = await llmRouter.proxy({
      method,
      path,
      body: formData ? undefined : payload,
      formData: formData || undefined,
      stream,
      binary: binary && !stream,
      bearerKey: ctx.state.rawApiKey || undefined,
      query: Object.fromEntries(
        Object.entries(ctx.query as Record<string, string | string[]>).map(([k, v]) => [
          k,
          Array.isArray(v) ? v[0] : v,
        ]),
      ),
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
        if (model) {
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
            endpointClass: classified.class,
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
        }
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
      } else if (model) {
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
          endpointClass: classified.class,
        });
        realtimeHub.emitRequest(organization.id, {
          id: log.id,
          model: model.model_id,
          status: log.status,
          latency_ms: latencyMs,
          cost,
          created_at: log.created_at,
        });
      }
      ctx.status = result.status;
      ctx.set('Content-Type', result.headers['content-type'] || 'application/octet-stream');
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
    if (model || classified.class === 'files' || classified.class === 'batches') {
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
        endpointClass: classified.class,
      });
      if (model) {
        realtimeHub.emitRequest(organization.id, {
          id: log.id,
          model: model.model_id,
          status: log.status,
          latency_ms: latencyMs,
          cost,
          created_at: log.created_at,
          filter_action: log.filter_action,
        });
      }
    }

    ctx.status = result.status || 200;
    ctx.body = result.data;
  } catch (err: any) {
    const code = err.code || 'PROVIDER_ERROR';
    const latencyMs = Date.now() - started;
    const body = rawBody;

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
    if (code === 'MISSING_FIELDS') {
      errorBody(ctx, 'MISSING_FIELDS', 400);
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

    logger.error('Gateway error', { code, message: err.message, path, stack: err.stack });
    await gatewayService.logError({
      organization,
      apiKey,
      modelId: typeof body.model === 'string' ? body.model : undefined,
      latencyMs,
      errorCode: code,
    });
    errorBody(ctx, 'PROVIDER_ERROR', 502);
  }
}

export const gatewayController = {
  /** Shared allowlisted OpenAI-compatible proxy */
  proxy: handleProxy,

  /** @deprecated use proxy — kept as alias */
  chatCompletions: handleProxy,

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
