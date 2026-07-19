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
  litellmHealth() {
    return apiClient.get('/billing/litellm/health');
  },
  litellmUsage(key: string) {
    return apiClient.post('/billing/litellm/usage', { key });
  },
  litellmModels() {
    return apiClient.get('/billing/litellm/models');
  },
};
