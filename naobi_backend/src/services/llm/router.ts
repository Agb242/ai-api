import { Readable } from 'stream';
import axios, { AxiosError } from 'axios';
import FormData from 'form-data';
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
  /** Raw buffer for binary responses (audio/speech, file content) */
  buffer?: Buffer;
}

export interface ProxyOptions {
  method: string;
  /** Path starting with / (e.g. /v1/embeddings) */
  path: string;
  body?: unknown;
  /** When set, sends multipart instead of JSON */
  formData?: FormData;
  query?: Record<string, string | undefined>;
  stream?: boolean;
  bearerKey?: string;
  /** Expect binary body (audio, file download) */
  binary?: boolean;
  timeoutMs?: number;
}

const CIRCUIT_KEY = 'nexusia:litellm:circuit';
const FAILURES_KEY = 'nexusia:litellm:failures';

async function getCircuitState(): Promise<'closed' | 'open' | 'half-open'> {
  try {
    const state = await redisClient.get(CIRCUIT_KEY);
    if (state === 'open') return 'open';
    if (state === 'half-open') return 'half-open';
  } catch {
    /* redis optional */
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

function buildUrl(path: string, query?: Record<string, string | undefined>): string {
  const base = config.litellm.baseUrl.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${base}${p}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, v);
    }
  }
  return url.toString();
}

async function proxyLiteLlm(opts: ProxyOptions): Promise<RouterResult> {
  if (!config.litellm.apiKey || !config.litellm.baseUrl) {
    throw Object.assign(new Error('LITELLM_NOT_CONFIGURED'), { code: 'LITELLM_NOT_CONFIGURED' });
  }

  const circuit = await getCircuitState();
  if (circuit === 'open') {
    logger.warn('LiteLLM circuit open — attempting request anyway (half-open)');
  }

  const bearer = (opts.bearerKey || config.litellm.apiKey).trim();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${bearer}`,
  };

  const url = buildUrl(opts.path, opts.query);
  const method = (opts.method || 'POST').toUpperCase();
  const timeout = opts.timeoutMs ?? 120000;

  const axiosConfig: Record<string, unknown> = {
    method,
    url,
    headers,
    timeout,
    validateStatus: () => true,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  };

  if (opts.formData) {
    Object.assign(headers, opts.formData.getHeaders());
    axiosConfig.data = opts.formData;
  } else if (opts.body !== undefined && method !== 'GET' && method !== 'DELETE') {
    headers['Content-Type'] = 'application/json';
    axiosConfig.data = opts.body;
  }

  if (opts.stream) {
    axiosConfig.responseType = 'stream';
  } else if (opts.binary) {
    axiosConfig.responseType = 'arraybuffer';
  }

  const res = await axios(axiosConfig as any);

  if (res.status >= 500) {
    await recordLiteLlmFailure();
    throw Object.assign(new Error('LITELLM_UNAVAILABLE'), {
      code: 'LITELLM_UNAVAILABLE',
      status: res.status,
    });
  }
  await recordLiteLlmSuccess();

  const contentType = String(res.headers['content-type'] || '');

  if (opts.stream) {
    return {
      backend: 'litellm',
      status: res.status,
      headers: { 'content-type': contentType || 'text/event-stream' },
      stream: res.data as Readable,
    };
  }

  if (opts.binary || contentType.includes('audio/') || contentType.includes('octet-stream')) {
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

function wrapProxyError(err: unknown, context: { path?: string; model?: string }): never {
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
    path: context.path,
    model: context.model,
    timedOut,
  });
  // fire-and-forget circuit update
  void recordLiteLlmFailure();
  throw Object.assign(new Error(timedOut ? 'PROVIDER_ERROR' : 'LITELLM_UNAVAILABLE'), {
    code: timedOut ? 'PROVIDER_ERROR' : 'LITELLM_UNAVAILABLE',
    cause: err instanceof Error ? err.message : String(err),
  });
}

export const llmRouter = {
  /** Generic path proxy to LiteLLM (allowlisted by callers). */
  async proxy(opts: ProxyOptions): Promise<RouterResult> {
    try {
      return await proxyLiteLlm(opts);
    } catch (err) {
      wrapProxyError(err, { path: opts.path });
    }
  },

  /** Chat completions — thin wrapper kept for existing callers. */
  async forward(
    body: ChatCompletionRequest,
    _catalogModel?: LlmModel,
    opts?: { bearerKey?: string },
  ): Promise<RouterResult> {
    try {
      return await proxyLiteLlm({
        method: 'POST',
        path: '/v1/chat/completions',
        body,
        stream: !!body.stream,
        bearerKey: opts?.bearerKey,
      });
    } catch (err) {
      wrapProxyError(err, { path: '/v1/chat/completions', model: body.model });
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

export function isAxiosNetworkError(err: unknown): boolean {
  return err instanceof AxiosError && !err.response;
}
