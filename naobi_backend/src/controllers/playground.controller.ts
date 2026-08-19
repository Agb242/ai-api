import { Context } from 'koa';
import { PassThrough } from 'stream';
import { apiKeyService } from '../services/api-key.service';
import { gatewayService } from '../services/gateway.service';
import { llmRouter } from '../services/llm/router';
import { classifyEndpoint } from '../services/llm/endpoint-class';
import { Organization } from '../models/Organization';
import { walletService } from '../services/wallet.service';
import { t } from '../i18n/messages';
import { realtimeHub } from '../services/realtime.service';
import { litellmAdmin } from '../services/litellm-admin.service';
import { playgroundCapabilitiesService } from '../services/playground-capabilities.service';
import logger from '../config/logger';

const CHAT_PASSTHROUGH = [
  'temperature',
  'max_tokens',
  'top_p',
  'stream',
  'tools',
  'tool_choice',
  'response_format',
  'reasoning_effort',
  'thinking',
  'mock_testing_fallbacks',
  'fallbacks',
] as const;

function buildChatBody(body: Record<string, unknown>) {
  const chatBody: Record<string, unknown> = {
    model: body.model,
    messages: body.messages,
    stream: body.stream !== false,
  };
  for (const key of CHAT_PASSTHROUGH) {
    if (key === 'stream') continue;
    if (body[key] !== undefined && body[key] !== null) {
      chatBody[key] = body[key];
    }
  }
  return chatBody;
}

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

    const chatBody = buildChatBody(body);

    try {
      const { model, payload, filterResult } = await gatewayService.prepare(
        { apiKey: key, organization, locale },
        chatBody,
      );

      if (!model) return fail(ctx, 'MISSING_FIELDS', 400);

      const virtualKey = apiKeyService.resolveVirtualKeyPlaintext(key);
      if (!virtualKey) {
        return fail(ctx, 'KEY_PLAINTEXT_UNAVAILABLE', 400);
      }

      const { parseStreamUsage, withStreamUsageOptions } = await import('../services/llm/router');
      const outbound = withStreamUsageOptions(payload as Record<string, unknown>);
      const result = await llmRouter.forward(outbound as any, model, { bearerKey: virtualKey });

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
          const latencyMs = Date.now() - started;
          const { prompt_tokens, completion_tokens } = parseStreamUsage(collected);
          try {
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
            pass.write(
              `data: ${JSON.stringify({
                type: 'usage',
                prompt_tokens,
                completion_tokens,
                total_tokens: prompt_tokens + completion_tokens,
                cost,
              })}\n\n`,
            );
            realtimeHub.emitRequest(organization.id, {
              id: log.id,
              model: model.model_id,
              status: log.status,
              latency_ms: latencyMs,
              cost,
              created_at: log.created_at,
              filter_action: log.filter_action,
              tokens_input: prompt_tokens,
              tokens_output: completion_tokens,
            });
          } catch (err) {
            logger.warn('Playground stream finalize failed', { err });
            pass.write(
              `data: ${JSON.stringify({
                type: 'usage',
                prompt_tokens,
                completion_tokens,
                total_tokens: prompt_tokens + completion_tokens,
              })}\n\n`,
            );
          }
          pass.write('data: [DONE]\n\n');
          pass.end();
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
      const { extractUsage } = await import('../services/llm/router');
      const usage = extractUsage(result.data);
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
        tokens_input: usage.input,
        tokens_output: usage.output,
      });

      const base =
        result.data && typeof result.data === 'object'
          ? (result.data as Record<string, unknown>)
          : { data: result.data };
      const existingUsage = (base as any).usage || {};
      ctx.status = 200;
      ctx.body = {
        ...base,
        usage: {
          prompt_tokens: Number(
            existingUsage.prompt_tokens ?? existingUsage.input_tokens ?? usage.input ?? 0,
          ),
          completion_tokens: Number(
            existingUsage.completion_tokens ??
              existingUsage.output_tokens ??
              usage.output ??
              0,
          ),
        },
      };
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

  async capabilities(ctx: Context) {
    const model = typeof ctx.query.model === 'string' ? ctx.query.model : '';
    const data = await playgroundCapabilitiesService.forModel(ctx.state.orgId!, model);
    ok(ctx, data);
  },

  async tokenCount(ctx: Context) {
    const body = (ctx.request.body || {}) as {
      model?: string;
      messages?: unknown[];
      prompt?: string;
      text?: string;
    };
    const result = await litellmAdmin.tokenCounter({
      model: body.model,
      messages: body.messages,
      prompt: body.prompt || body.text,
    });
    if (!result) return fail(ctx, 'LITELLM_UNAVAILABLE', 503);
    ok(ctx, result);
  },

  async transformRequest(ctx: Context) {
    const body = ctx.request.body;
    const result = await litellmAdmin.transformRequest(body);
    if (!result) return fail(ctx, 'LITELLM_UNAVAILABLE', 503);
    ok(ctx, result);
  },

  async fallbackTest(ctx: Context) {
    const locale = (ctx.state.locale || 'fr') as 'fr' | 'en';
    const body = (ctx.request.body || {}) as any;
    const apiKeyId = String(body.api_key_id || '');
    const model = String(body.model || '');
    if (!apiKeyId || !model) return fail(ctx, 'MISSING_FIELDS', 400);

    const caps = await playgroundCapabilitiesService.forModel(ctx.state.orgId!, model);
    const chain = caps.fallback?.models || [];
    if (!chain.length) return fail(ctx, 'NOT_FOUND', 404);

    const params = new Set((caps.params || []).map((p) => p.toLowerCase()));
    const testBody: Record<string, unknown> = {
      api_key_id: apiKeyId,
      model: params.has('mock_testing_fallbacks') ? model : chain[0],
      messages: body.messages?.length
        ? body.messages
        : [{ role: 'user', content: 'Reply with a single word: ok' }],
      stream: false,
      max_tokens: 16,
    };
    if (params.has('mock_testing_fallbacks')) {
      testBody.mock_testing_fallbacks = true;
    }

    ctx.request.body = testBody;
    ctx.state.locale = locale;
    return playgroundController.chatCompletions(ctx);
  },

  /** Embeddings / images / audio via virtual key (session auth). */
  async modality(ctx: Context) {
    const locale = (ctx.state.locale || 'fr') as 'fr' | 'en';
    const body = (ctx.request.body || {}) as any;
    const apiKeyId = String(body.api_key_id || '');
    const modality = String(body.modality || ctx.params.modality || '');
    const started = Date.now();

    const pathByModality: Record<string, string> = {
      embeddings: '/v1/embeddings',
      images: '/v1/images/generations',
      'audio-speech': '/v1/audio/speech',
    };
    const upstreamPath = pathByModality[modality];
    if (!apiKeyId || !upstreamPath) return fail(ctx, 'MISSING_FIELDS', 400);

    const key = await apiKeyService.getById(ctx.state.orgId!, apiKeyId);
    if (!key) return fail(ctx, 'NOT_FOUND', 404);
    if (key.status !== 'active') {
      return fail(ctx, key.status === 'disabled' ? 'KEY_DISABLED' : 'KEY_REVOKED', 403);
    }

    const organization = await Organization.query().findById(ctx.state.orgId!);
    if (!organization) return fail(ctx, 'NOT_FOUND', 404);

    const virtualKey = apiKeyService.resolveVirtualKeyPlaintext(key);
    if (!virtualKey) return fail(ctx, 'KEY_PLAINTEXT_UNAVAILABLE', 400);

    const classified = classifyEndpoint('POST', upstreamPath);
    const requestBody = { ...body };
    delete requestBody.api_key_id;
    delete requestBody.modality;

    try {
      const { model, payload } = await gatewayService.prepareForClass(
        { apiKey: key, organization, locale },
        classified,
        requestBody,
      );

      const binary = classified.binaryResponse;
      const result = await llmRouter.proxy({
        method: 'POST',
        path: upstreamPath,
        body: payload,
        bearerKey: virtualKey,
        binaryResponse: binary,
      });

      if (result.buffer) {
        if (result.status >= 400) {
          ctx.status = result.status;
          ctx.body = result.buffer;
          return;
        }
        await gatewayService.finalize({
          organization,
          apiKey: key,
          model,
          body: payload,
          responseData: {},
          latencyMs: Date.now() - started,
          backend: result.backend,
          status: 'success',
          modelIdFallback: String(payload.model || ''),
        });
        ctx.status = 200;
        ctx.set('Content-Type', result.headers['content-type'] || 'audio/mpeg');
        ctx.body = result.buffer;
        return;
      }

      if (result.status >= 400) {
        ctx.status = result.status;
        ctx.body = result.data;
        return;
      }

      await gatewayService.finalize({
        organization,
        apiKey: key,
        model,
        body: payload,
        responseData: result.data,
        latencyMs: Date.now() - started,
        backend: result.backend,
        status: 'success',
        modelIdFallback: String(payload.model || ''),
      });

      ok(ctx, result.data);
    } catch (err: any) {
      const code = err.code || 'PROVIDER_ERROR';
      if (code === 'INSUFFICIENT_BALANCE') return fail(ctx, code, 402);
      if (code === 'KEY_BUDGET_EXCEEDED') return fail(ctx, code, 402);
      if (code === 'MODEL_NOT_FOUND') return fail(ctx, code, 404);
      if (code === 'LITELLM_UNAVAILABLE' || code === 'LITELLM_NOT_CONFIGURED') {
        return fail(ctx, code, 503);
      }
      logger.error('Playground modality error', { code, message: err.message, modality });
      fail(ctx, 'PROVIDER_ERROR', 502);
    }
  },
};
