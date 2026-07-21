import { Context } from 'koa';
import { PassThrough } from 'stream';
import fs from 'fs';
import FormData from 'form-data';
import { apiKeyService } from '../services/api-key.service';
import { gatewayService } from '../services/gateway.service';
import { llmRouter } from '../services/llm/router';
import type { ClassifiedEndpoint } from '../services/llm/endpoint-class';
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

async function resolvePlaygroundKey(ctx: Context, apiKeyId: string) {
  const key = await apiKeyService.getById(ctx.state.orgId!, apiKeyId);
  if (!key) return { error: 'NOT_FOUND' as const };
  if (key.status !== 'active') {
    return { error: key.status === 'disabled' ? ('KEY_DISABLED' as const) : ('KEY_REVOKED' as const) };
  }
  const organization = await Organization.query().findById(ctx.state.orgId!);
  if (!organization) return { error: 'NOT_FOUND' as const };
  return { key, organization };
}

function mapGatewayError(ctx: Context, err: any) {
  const code = err.code || 'PROVIDER_ERROR';
  if (code === 'REQUEST_BLOCKED') {
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
  logger.error('Playground error', { code, message: err.message });
  errorBody(ctx, 'PROVIDER_ERROR', 502);
}

async function playgroundProxy(
  ctx: Context,
  opts: {
    litellmPath: string;
    classified: ClassifiedEndpoint;
    body: Record<string, unknown>;
    stream?: boolean;
    binary?: boolean;
    formData?: FormData | null;
  },
) {
  const locale = (ctx.state.locale || 'fr') as 'fr' | 'en';
  const apiKeyId = String(opts.body.api_key_id || '');
  const started = Date.now();

  if (!apiKeyId) return fail(ctx, 'MISSING_FIELDS', 400);

  const resolved = await resolvePlaygroundKey(ctx, apiKeyId);
  if ('error' in resolved && resolved.error) {
    return fail(ctx, resolved.error, resolved.error === 'NOT_FOUND' ? 404 : 403);
  }
  if (!('key' in resolved) || !resolved.key || !resolved.organization) {
    return fail(ctx, 'NOT_FOUND', 404);
  }

  const { key, organization } = resolved;
  const { api_key_id: _omit, ...upstreamBody } = opts.body;

  try {
    const { model, payload, filterResult } = await gatewayService.prepareForClass(
      { apiKey: key, organization, locale },
      upstreamBody,
      opts.classified,
    );

    const result = await llmRouter.proxy({
      method: 'POST',
      path: opts.litellmPath,
      body: opts.formData ? undefined : payload,
      formData: opts.formData || undefined,
      stream: !!opts.stream,
      binary: !!opts.binary,
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
        if (!model) return;
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
          endpointClass: opts.classified.class,
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
      return;
    }

    if (result.buffer) {
      if (model && result.status < 400) {
        const latencyMs = Date.now() - started;
        await gatewayService.finalize({
          organization,
          apiKey: key,
          model,
          body: payload,
          responseData: {},
          latencyMs,
          backend: result.backend,
          status: 'success',
          endpointClass: opts.classified.class,
        });
      }
      ctx.status = result.status;
      ctx.set('Content-Type', result.headers['content-type'] || 'application/octet-stream');
      ctx.body = result.buffer;
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
    if (model) {
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
        endpointClass: opts.classified.class,
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

    ctx.status = 200;
    ctx.body = result.data;
  } catch (err: any) {
    mapGatewayError(ctx, err);
  }
}

export const playgroundController = {
  async chatCompletions(ctx: Context) {
    const body = (ctx.request.body || {}) as Record<string, unknown>;
    await playgroundProxy(ctx, {
      litellmPath: '/v1/chat/completions',
      classified: {
        class: 'chat',
        applyFilters: true,
        requireModel: true,
        binaryResponse: false,
        multipart: false,
      },
      body: {
        ...body,
        stream: body.stream !== false,
      },
      stream: body.stream !== false,
    });
  },

  async embeddings(ctx: Context) {
    const body = (ctx.request.body || {}) as Record<string, unknown>;
    await playgroundProxy(ctx, {
      litellmPath: '/v1/embeddings',
      classified: {
        class: 'embeddings',
        applyFilters: true,
        requireModel: true,
        binaryResponse: false,
        multipart: false,
      },
      body,
    });
  },

  async imageGenerations(ctx: Context) {
    const body = (ctx.request.body || {}) as Record<string, unknown>;
    await playgroundProxy(ctx, {
      litellmPath: '/v1/images/generations',
      classified: {
        class: 'images',
        applyFilters: true,
        requireModel: false,
        binaryResponse: false,
        multipart: false,
      },
      body,
    });
  },

  async audioSpeech(ctx: Context) {
    const body = (ctx.request.body || {}) as Record<string, unknown>;
    await playgroundProxy(ctx, {
      litellmPath: '/v1/audio/speech',
      classified: {
        class: 'audio',
        applyFilters: true,
        requireModel: true,
        binaryResponse: true,
        multipart: false,
      },
      body,
      binary: true,
    });
  },

  async audioTranscriptions(ctx: Context) {
    const body = (ctx.request.body || {}) as Record<string, unknown>;
    const files = (ctx.request as any).files as
      | Record<string, { filepath?: string; path?: string; originalFilename?: string; mimetype?: string; size?: number }>
      | undefined;
    const form = new FormData();
    for (const [k, v] of Object.entries(body)) {
      if (k === 'api_key_id') continue;
      if (v !== undefined && v !== null) form.append(k, String(v));
    }
    const file = files?.file || files?.audio;
    if (file) {
      const filepath = file.filepath || file.path;
      if (filepath && fs.existsSync(filepath)) {
        form.append('file', fs.createReadStream(filepath), {
          filename: file.originalFilename || 'audio.webm',
          contentType: file.mimetype || 'application/octet-stream',
        });
      }
    }
    await playgroundProxy(ctx, {
      litellmPath: '/v1/audio/transcriptions',
      classified: {
        class: 'audio',
        applyFilters: false,
        requireModel: false,
        binaryResponse: false,
        multipart: true,
      },
      body,
      formData: form,
    });
  },

  async context(ctx: Context) {
    const wallet = await walletService.getByOrg(ctx.state.orgId!);
    ok(ctx, {
      wallet_balance: wallet ? Number(wallet.balance) : 0,
      currency: 'credits',
    });
  },
};
