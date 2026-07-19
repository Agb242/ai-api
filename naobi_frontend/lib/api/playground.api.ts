import { apiClient } from './client';
import { getAuthToken } from '../auth-token';
import { useAuthStore } from '../stores/auth.store';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3018/api/v1';

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
    const token = getAuthToken();
    const orgId = useAuthStore.getState().org?.id;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (orgId) headers['X-Org-ID'] = orgId;

    return fetch(`${API_BASE}/playground/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...body, stream: body.stream !== false }),
      signal,
    });
  },
};
