import { apiClient } from './client';
import { getAuthToken } from '../auth-token';
import { useAuthStore } from '../stores/auth.store';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3018/api/v1';

function sessionHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getAuthToken();
  const orgId = useAuthStore.getState().org?.id;
  const headers: Record<string, string> = { ...extra };
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
    },
    signal?: AbortSignal,
  ): Promise<Response> {
    return fetch(`${API_BASE}/playground/chat/completions`, {
      method: 'POST',
      headers: sessionHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ ...body, stream: body.stream !== false }),
      signal,
    });
  },

  async embeddings(body: {
    api_key_id: string;
    model: string;
    input: string | string[];
  }) {
    const res = await fetch(`${API_BASE}/playground/embeddings`, {
      method: 'POST',
      headers: sessionHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`);
    return json as {
      data?: Array<{ embedding: number[]; index: number }>;
      usage?: { prompt_tokens?: number; total_tokens?: number };
    };
  },

  async imageGenerations(body: {
    api_key_id: string;
    model?: string;
    prompt: string;
    n?: number;
    size?: string;
  }) {
    const res = await fetch(`${API_BASE}/playground/images/generations`, {
      method: 'POST',
      headers: sessionHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`);
    return json as { data?: Array<{ url?: string; b64_json?: string }> };
  },

  async audioSpeech(
    body: {
      api_key_id: string;
      model: string;
      input: string;
      voice?: string;
    },
    signal?: AbortSignal,
  ): Promise<Blob> {
    const res = await fetch(`${API_BASE}/playground/audio/speech`, {
      method: 'POST',
      headers: sessionHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `HTTP ${res.status}`);
    }
    return res.blob();
  },

  async audioTranscriptions(params: {
    api_key_id: string;
    model?: string;
    file: File;
  }) {
    const form = new FormData();
    form.append('api_key_id', params.api_key_id);
    if (params.model) form.append('model', params.model);
    form.append('file', params.file);

    const res = await fetch(`${API_BASE}/playground/audio/transcriptions`, {
      method: 'POST',
      headers: sessionHeaders(),
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `HTTP ${res.status}`);
    }
    return res.json() as Promise<{ text?: string }>;
  },
};
