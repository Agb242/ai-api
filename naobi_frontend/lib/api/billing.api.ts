import { apiClient } from './client';

export const billingApi = {
  listPacks() {
    return apiClient.get('/billing/packs');
  },
  initiate(payload: {
    pack_id: string;
    phone: string;
    pseudo: string;
    operator?: string;
    country?: string;
  }) {
    return apiClient.post('/billing/collections/initiate', payload);
  },
  status(ref: string) {
    return apiClient.get(`/billing/collections/${encodeURIComponent(ref)}/status`);
  },
  claim(key: string, name?: string) {
    return apiClient.post('/billing/claim', { key, name });
  },
  history() {
    return apiClient.get('/billing/history');
  },
  /** Upstream inference health — path kept for API compatibility. */
  platformHealth() {
    return apiClient.get('/billing/litellm/health');
  },
  platformUsage(key: string) {
    return apiClient.post('/billing/litellm/usage', { key });
  },
  platformModels() {
    return apiClient.get('/billing/litellm/models');
  },
};
