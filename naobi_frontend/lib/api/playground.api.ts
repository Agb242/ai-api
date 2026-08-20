import { apiClient } from './client';
import { getAuthToken } from '../auth-token';
import { useAuthStore } from '../stores/auth.store';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3018/api/v1';

function sessionHeaders(): Record<string, string> {
  const token = getAuthToken();
  const orgId = useAuthStore.getState().org?.id;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (orgId) headers['X-Org-ID'] = orgId;
  return headers;
}

export const playgroundApi = {
  context() {
    return apiClient.get<{ wallet_balance: number; currency: string }>('/playground/context');
  },

  /**
   * Stream chat completions via session-authenticated playground proxy.
   * Returns the raw Response for SSE parsing.
   */
  async chatCompletionsStream(
    body: {
      api_key_id: string;
      model: string;
      messages: Array<{ role: string; content: string }>;
      stream?: boolean;
      temperature?: number;
      max_tokens?: number;
      top_p?: number;
      tools?: unknown[];
      tool_choice?: string;
      response_format?: unknown;
      reasoning_effort?: string;
      thinking?: unknown;
    },
    signal?: AbortSignal,
  ): Promise<Response> {
    return fetch(`${API_BASE}/playground/chat/completions`, {
      method: 'POST',
      headers: sessionHeaders(),
      body: JSON.stringify(body),
      signal,
    });
  },

  embeddings(body: { api_key_id: string; model: string; input: string | string[] }) {
    return apiClient.post('/playground/embeddings', body);
  },

  imagesGenerations(body: {
    api_key_id: string;
    model: string;
    prompt: string;
    size?: string;
    n?: number;
  }) {
    return apiClient.post('/playground/images/generations', body);
  },

  async audioSpeech(
    body: {
      api_key_id: string;
      model: string;
      input: string;
      voice?: string;
    },
    signal?: AbortSignal,
  ): Promise<Response> {
    return fetch(`${API_BASE}/playground/audio/speech`, {
      method: 'POST',
      headers: sessionHeaders(),
      body: JSON.stringify(body),
      signal,
    });
  },

  capabilities(model: string) {
    const q = model ? `?model=${encodeURIComponent(model)}` : '';
    return apiClient.get(`/playground/capabilities${q}`);
  },

  tokenCount(body: { model?: string; messages?: unknown[]; prompt?: string }) {
    return apiClient.post('/playground/token-count', body);
  },

  transformRequest(body: unknown) {
    return apiClient.post('/playground/transform-request', body);
  },

  fallbackTest(body: { api_key_id: string; model: string; messages?: unknown[] }) {
    return apiClient.post('/playground/fallback-test', body);
  },
};
