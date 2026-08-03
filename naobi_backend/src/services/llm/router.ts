import axios, { AxiosError } from 'axios';
import fs from 'fs';
import { Readable } from 'stream';
import { redisClient } from '../../config/redis';
import { config } from '../../config/server';
import { LlmModel } from '../../models/LlmModel';
import logger from '../../config/logger';

export type RouterBackend = 'litellm';

export interface ChatCompletionRequest {
  model: string;
  messages?: unknown[];
  stream?: boolean;
  [key: string]: unknown;
}

export interface RouterResult {
  backend: RouterBackend;
  status: number;
  headers: Record<string, string>;
  data?: unknown;
  stream?: Readable;
  /** Binary body (e.g. TTS audio) */
  buffer?: Buffer;
}

export interface ProxyRequest {
  method: string;
  path: string;
  body?: unknown;
  /** When set, send multipart form (fields + optional file paths) */
  multipart?: {
    fields: Record<string, string>;
    files?: Array<{ field: string; filepath: string; filename?: string; contentType?: string }>;
  };
  bearerKey?: string;
  stream?: boolean;
  binaryResponse?: boolean;
  extraHeaders?: Record<string, string>;
}

const CIRCUIT_KEY = 'nexusia:litellm:circuit';
const FAILURES_KEY = 'nexusia:litellm:failures';

async function getCircuitState(): Promise<'closed' | 'open' | 'half-open'> {
  try {
    const state = await redisClient.get(CIRCUIT_KEY);
    if (state === 'open') return 'open';
    if (state === 'half-open') return 'half-open';
  } catch {
    /* redis optional for routing decision */
  }
  return 'closed';
}

async function recordLiteLlmFailure() {
  try {
    const failures = await redisClient.incr(FAILURES_KEY);
    await redisClient.expire(FAILURES_KEY, config.litellm.circuitOpenSeconds);
    if (failures >= config.litellm.circuitFailureThreshold) {
      await redisClient.set(
        CIRCUIT_KEY,
        'open',
        'EX',
        config.litellm.circuitOpenSeconds,
      );
      logger.warn('LiteLLM circuit opened', { failures });
    }
  } catch (err) {
    logger.warn('Could not update LiteLLM circuit', { err });
  }
}

async function recordLiteLlmSuccess() {
  try {
    await redisClient.del(FAILURES_KEY);
    const state = await redisClient.get(CIRCUIT_KEY);
    if (state === 'open' || state === 'half-open') {
      await redisClient.del(CIRCUIT_KEY);
      logger.info('LiteLLM circuit closed');
    }
  } catch {
    /* ignore */
  }
}

export async function probeLiteLlm(): Promise<boolean> {
  if (!config.litellm.apiKey || !config.litellm.baseUrl) return false;
  const { litellmAdmin } = await import('../litellm-admin.service');
  try {
    return await litellmAdmin.health();
  } catch {
    return false;
  }
}

function requireLiteLlm() {
  if (!config.litellm.apiKey || !config.litellm.baseUrl) {
    throw Object.assign(new Error('LITELLM_NOT_CONFIGURED'), { code: 'LITELLM_NOT_CONFIGURED' });
  }
}

async function callLiteLlm(
  body: ChatCompletionRequest,
  opts?: { bearerKey?: string },
): Promise<RouterResult> {
  return proxyLiteLlm({
    method: 'POST',
    path: '/v1/chat/completions',
    body,
    bearerKey: opts?.bearerKey,
    stream: !!body.stream,
  });
}

async function proxyLiteLlm(req: ProxyRequest): Promise<RouterResult> {
  requireLiteLlm();

  const circuit = await getCircuitState();
  if (circuit === 'open') {
    logger.warn('LiteLLM circuit open — attempting request anyway (half-open)');
  }

  const base = config.litellm.baseUrl.replace(/\/$/, '');
  const path = req.path.startsWith('/') ? req.path : `/${req.path}`;
  const url = `${base}${path}`;
  const bearer = (req.bearerKey || config.litellm.apiKey).trim();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${bearer}`,
    ...(req.extraHeaders || {}),
  };

  let data: unknown = req.body;
  if (req.multipart) {
    const form = new FormData();
    for (const [k, v] of Object.entries(req.multipart.fields)) {
      form.append(k, v);
    }
    for (const f of req.multipart.files || []) {
      const buf = fs.readFileSync(f.filepath);
      const blob = new Blob([buf], {
        type: f.contentType || 'application/octet-stream',
      });
      form.append(f.field, blob, f.filename || 'file');
    }
    data = form;
    // Let axios set multipart boundary from FormData
  } else if (
    data !== undefined &&
    data !== null &&
    !headers['Content-Type'] &&
    !headers['content-type']
  ) {
    headers['Content-Type'] = 'application/json';
  }

  const method = (req.method || 'POST').toUpperCase();
  const wantsStream = !!req.stream;
  const wantsBinary = !!req.binaryResponse;

  const res = await axios.request({
    url,
    method,
    headers,
    data: method === 'GET' || method === 'HEAD' ? undefined : data,
    responseType: wantsStream ? 'stream' : wantsBinary ? 'arraybuffer' : 'json',
    timeout: 180000,
    validateStatus: () => true,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  if (res.status >= 500) {
    await recordLiteLlmFailure();
    throw Object.assign(new Error('LITELLM_UNAVAILABLE'), {
      code: 'LITELLM_UNAVAILABLE',
      status: res.status,
    });
  }
  await recordLiteLlmSuccess();

  const contentType = String(res.headers['content-type'] || '');

  if (wantsStream) {
    return {
      backend: 'litellm',
      status: res.status,
      headers: { 'content-type': contentType || 'text/event-stream' },
      stream: res.data as Readable,
    };
  }

  if (wantsBinary) {
    const buf = Buffer.isBuffer(res.data)
      ? res.data
      : Buffer.from(res.data as ArrayBuffer);
    return {
      backend: 'litellm',
      status: res.status,
      headers: {
        'content-type': contentType || 'application/octet-stream',
        ...(res.headers['content-disposition']
          ? { 'content-disposition': String(res.headers['content-disposition']) }
          : {}),
      },
      buffer: buf,
    };
  }

  return {
    backend: 'litellm',
    status: res.status,
    headers: { 'content-type': contentType || 'application/json' },
    data: res.data,
  };
}

export const llmRouter = {
  /** LiteLLM Proxy is the only inference backend. No provider fallback. */
  async forward(
    body: ChatCompletionRequest,
    _catalogModel?: LlmModel,
    opts?: { bearerKey?: string },
  ): Promise<RouterResult> {
    try {
      return await callLiteLlm(body, opts);
    } catch (err) {
      if (
        (err as any)?.code === 'LITELLM_UNAVAILABLE' ||
        (err as any)?.code === 'LITELLM_NOT_CONFIGURED'
      ) {
        throw err;
      }
      const ax = err as AxiosError;
      const timedOut =
        ax?.code === 'ECONNABORTED' ||
        /timeout/i.test(ax?.message || '') ||
        (err instanceof Error && /timeout/i.test(err.message));
      logger.warn('LiteLLM forward failed', {
        error: err instanceof Error ? err.message : err,
        code: ax?.code,
        model: body.model,
        timedOut,
      });
      await recordLiteLlmFailure();
      throw Object.assign(new Error(timedOut ? 'PROVIDER_ERROR' : 'LITELLM_UNAVAILABLE'), {
        code: timedOut ? 'PROVIDER_ERROR' : 'LITELLM_UNAVAILABLE',
        cause: err instanceof Error ? err.message : String(err),
      });
    }
  },

  /** Generic path/method proxy to LiteLLM (embeddings, images, audio, …). */
  async proxy(req: ProxyRequest): Promise<RouterResult> {
    try {
      return await proxyLiteLlm(req);
    } catch (err) {
      if (
        (err as any)?.code === 'LITELLM_UNAVAILABLE' ||
        (err as any)?.code === 'LITELLM_NOT_CONFIGURED'
      ) {
        throw err;
      }
      const ax = err as AxiosError;
      const timedOut =
        ax?.code === 'ECONNABORTED' ||
        /timeout/i.test(ax?.message || '') ||
        (err instanceof Error && /timeout/i.test(err.message));
      logger.warn('LiteLLM proxy failed', {
        error: err instanceof Error ? err.message : err,
        code: ax?.code,
        path: req.path,
        method: req.method,
        timedOut,
      });
      await recordLiteLlmFailure();
      throw Object.assign(new Error(timedOut ? 'PROVIDER_ERROR' : 'LITELLM_UNAVAILABLE'), {
        code: timedOut ? 'PROVIDER_ERROR' : 'LITELLM_UNAVAILABLE',
        cause: err instanceof Error ? err.message : String(err),
      });
    }
  },

  async health(): Promise<{ litellm: boolean; circuit: string }> {
    const litellm = await probeLiteLlm();
    const circuit = await getCircuitState();
    return { litellm, circuit };
  },
};

export function extractUsage(data: unknown): { input: number; output: number } {
  const usage = (data as any)?.usage;
  return {
    input: Number(usage?.prompt_tokens || usage?.input_tokens || 0),
    output: Number(usage?.completion_tokens || usage?.output_tokens || 0),
  };
}

/** Parse usage from SSE / chat stream body (OpenAI + LiteLLM field names). */
export function parseStreamUsage(collected: string): {
  prompt_tokens: number;
  completion_tokens: number;
} {
  let prompt_tokens = 0;
  let completion_tokens = 0;
  if (!collected) return { prompt_tokens, completion_tokens };

  // Prefer last usage object (stream_options.include_usage puts it on the final chunk)
  const idx = collected.lastIndexOf('"usage"');
  if (idx >= 0) {
    const slice = collected.slice(idx);
    const brace = slice.indexOf('{');
    if (brace >= 0) {
      let depth = 0;
      let end = -1;
      for (let i = brace; i < slice.length; i++) {
        const c = slice[i];
        if (c === '{') depth++;
        else if (c === '}') {
          depth--;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      if (end > brace) {
        try {
          const usage = JSON.parse(slice.slice(brace, end + 1));
          prompt_tokens = Number(usage?.prompt_tokens || usage?.input_tokens || 0);
          completion_tokens = Number(
            usage?.completion_tokens || usage?.output_tokens || 0,
          );
          return { prompt_tokens, completion_tokens };
        } catch {
          /* fall through */
        }
      }
    }
  }

  const loose = collected.match(
    /"prompt_tokens"\s*:\s*(\d+)[\s\S]*?"completion_tokens"\s*:\s*(\d+)/,
  );
  if (loose) {
    prompt_tokens = Number(loose[1] || 0);
    completion_tokens = Number(loose[2] || 0);
  }
  return { prompt_tokens, completion_tokens };
}

/** Ensure streaming responses include a final usage chunk when supported. */
export function withStreamUsageOptions(
  body: Record<string, unknown>,
): Record<string, unknown> {
  if (!body?.stream) return body;
  const existing =
    body.stream_options && typeof body.stream_options === 'object'
      ? (body.stream_options as Record<string, unknown>)
      : {};
  return {
    ...body,
    stream_options: { ...existing, include_usage: true },
  };
}

export function isAxiosNetworkError(err: unknown): boolean {
  return err instanceof AxiosError && !err.response;
}
