import { apiClient } from './client';

export const attributionApi = {
  tags(days = 30) {
    return apiClient.get('/metrics/tags', { params: { days } });
  },
  endUsers(days = 30) {
    return apiClient.get('/metrics/end-users', { params: { days } });
  },
  listEndUsers() {
    return apiClient.get('/end-users');
  },
  blockEndUser(id: string) {
    return apiClient.post(`/end-users/${encodeURIComponent(id)}/block`);
  },
};
