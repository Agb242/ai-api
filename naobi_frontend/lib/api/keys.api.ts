import { apiClient } from './client';
import type {
  ApiKey,
  ApiKeyCreated,
  ApiKeyLogs,
  ApiKeyMetrics,
  CreateApiKeyPayload,
  KeyAnalytics,
  KeyErrors,
  KeyModels,
  KeyProviders,
  KeyUsage,
} from '@/lib/types/api-key';

export const keysApi = {
  list() {
    return apiClient.get<ApiKey[]>('/keys');
  },
  get(id: string) {
    return apiClient.get<ApiKey>(`/keys/${id}`);
  },
  create(payload: CreateApiKeyPayload) {
    return apiClient.post<ApiKeyCreated>('/keys', payload);
  },
  update(id: string, payload: {
    name?: string;
    description?: string | null;
    budget_max?: number | null;
  }) {
    return apiClient.patch<ApiKey>(`/keys/${id}`, payload);
  },
  disable(id: string) {
    return apiClient.post<ApiKey>(`/keys/${id}/disable`, { confirm: true });
  },
  enable(id: string) {
    return apiClient.post<ApiKey>(`/keys/${id}/enable`, { confirm: true });
  },
  revoke(id: string) {
    return apiClient.post<{ id: string; status: string }>(`/keys/${id}/revoke`, { confirm: true });
  },
  rotate(id: string) {
    return apiClient.post<ApiKeyCreated>(`/keys/${id}/rotate`, { confirm: true });
  },
  resetSpend(id: string) {
    return apiClient.post<ApiKey>(`/keys/${id}/reset-spend`, { confirm: true });
  },
  metrics(id: string) {
    return apiClient.get<ApiKeyMetrics>(`/keys/${id}/metrics`);
  },
  analytics(id: string) {
    return apiClient.get<KeyAnalytics>(`/keys/${id}/analytics`);
  },
  usage(id: string, days = 14) {
    return apiClient.get<KeyUsage>(`/keys/${id}/usage?days=${days}`);
  },
  models(id: string) {
    return apiClient.get<KeyModels>(`/keys/${id}/models`);
  },
  providers(id: string) {
    return apiClient.get<KeyProviders>(`/keys/${id}/providers`);
  },
  logs(
    id: string,
    params?: {
      page?: number;
      limit?: number;
      status?: string;
      model?: string;
      source?: 'litellm' | 'gateway' | 'auto';
    },
  ) {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.status) q.set('status', params.status);
    if (params?.model) q.set('model', params.model);
    if (params?.source) q.set('source', params.source);
    const qs = q.toString();
    return apiClient.get<ApiKeyLogs>(`/keys/${id}/logs${qs ? `?${qs}` : ''}`);
  },
  errors(id: string) {
    return apiClient.get<KeyErrors>(`/keys/${id}/errors`);
  },
};
