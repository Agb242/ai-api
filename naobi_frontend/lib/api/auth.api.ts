import { apiClient } from './client';
import { syncAuthToken } from '../auth-token';

export const authService = {
  setAuthToken(token: string) {
    syncAuthToken(token);
  },

  async requestOtp(payload: { email: string; full_name?: string; locale?: string }) {
    return apiClient.post('/auth/request-otp', payload, {
      headers: payload.locale ? { 'Accept-Language': payload.locale } : undefined,
    });
  },

  async verifyOtp(payload: { email: string; code: string }) {
    return apiClient.postRaw('/auth/verify-otp', payload);
  },

  async googleAuth(id_token: string) {
    return apiClient.postRaw('/auth/google', { id_token });
  },

  async me() {
    return apiClient.get('/auth/me');
  },

  async logout() {
    return apiClient.post('/auth/logout');
  },

  async refresh() {
    return apiClient.postRaw('/auth/refresh');
  },
};
