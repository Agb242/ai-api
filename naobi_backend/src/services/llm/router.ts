import axios, { AxiosError } from 'axios';
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
  // Align with litellmAdmin.health: try several paths; do NOT trip the circuit on probe alone.
  const { litellmAdmin } = await import('../litellm-admin.service');
  try {
    return await litellmAdmin.health();
  } catch {
    return false;
  }
}

async function callLiteLlm(
  body: ChatCompletionRequest,
  opts?: { bearerKey?: string },
): Promise<RouterResult> {
  if (!config.litellm.apiKey || !config.litellm.baseUrl) {
    throw Object.assign(new Error('LITELLM_NOT_CONFIGURED'), { code: 'LITELLM_NOT_CONFIGURED' });
  }

  const circuit = await getCircuitState();
  // Half-open: still attempt the request when circuit is open (models list can be up while
  // a previous completion timed out). Only hard-fail after repeated completion failures.
  if (circuit === 'open') {
    logger.warn('LiteLLM circuit open — attempting request anyway (half-open)');
  }

  const base = config.litellm.baseUrl.replace(/\/$/, '');
  const bearer = (opts?.bearerKey || config.litellm.apiKey).trim();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${bearer}`,
  };
  // OpenAI-compatible path (same surface as /v1/models)
  const url = `${base}/v1/chat/completions`;

  if (body.stream) {
    const res = await axios.post(url, body, {
      headers,
      responseType: 'stream',
      timeout: 120000,
      validateStatus: () => true,
    });
    if (res.status >= 500) {
      await recordLiteLlmFailure();
      throw Object.assign(new Error('LITELLM_UNAVAILABLE'), {
        code: 'LITELLM_UNAVAILABLE',
        status: res.status,
      });
    }
    await recordLiteLlmSuccess();
    return {
      backend: 'litellm',
      status: res.status,
      headers: { 'content-type': String(res.headers['content-type'] || 'text/event-stream') },
      stream: res.data as Readable,
    };
  }

  const res = await axios.post(url, body, {
    headers,
    timeout: 120000,
    validateStatus: () => true,
  });
  if (res.status >= 500) {
    await recordLiteLlmFailure();
    throw Object.assign(new Error('LITELLM_UNAVAILABLE'), {
      code: 'LITELLM_UNAVAILABLE',
      status: res.status,
    });
  }
  await recordLiteLlmSuccess();
  return {
    backend: 'litellm',
    status: res.status,
    headers: { 'content-type': 'application/json' },
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
      if ((err as any)?.code === 'LITELLM_UNAVAILABLE' || (err as any)?.code === 'LITELLM_NOT_CONFIGURED') {
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
