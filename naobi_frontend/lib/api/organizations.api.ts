import { apiClient } from './client';

export const organizationsApi = {
  list() {
    return apiClient.get('/organizations');
  },
  create(name: string) {
    return apiClient.post('/organizations', { name });
  },
};
