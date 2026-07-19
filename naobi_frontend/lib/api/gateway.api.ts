import { apiClient } from './client';

export const walletApi = {
  get() {
    return apiClient.get('/wallet');
  },
  topUp(_amount: number, _payment_method = 'momo') {
    return apiClient.post('/wallet/topup', { amount: _amount, payment_method: _payment_method });
  },
};

export const filtersApi = {
  list() {
    return apiClient.get('/filters');
  },
  create(payload: {
    name: string;
    type: 'regex' | 'keyword';
    pattern: string;
    action: 'block' | 'redact';
    active?: boolean;
  }) {
    return apiClient.post('/filters', payload);
  },
  update(id: string, payload: Record<string, unknown>) {
    return apiClient.patch(`/filters/${id}`, payload);
  },
  remove(id: string) {
    return apiClient.delete(`/filters/${id}`);
  },
  test(payload: {
    sample: string;
    type: 'regex' | 'keyword';
    pattern: string;
    action: 'block' | 'redact';
  }) {
    return apiClient.post('/filters/test', payload);
  },
};

export const logsApi = {
  list(limit = 50) {
    return apiClient.get('/logs', { params: { limit } });
  },
};

export const metricsApi = {
  dashboard() {
    return apiClient.get('/metrics/dashboard');
  },
};

export const modelsApi = {
  list() {
    return apiClient.get('/models');
  },
};

export const membersApi = {
  list() {
    return apiClient.get('/members');
  },
  invite(email: string, role = 'developer') {
    return apiClient.post('/members/invite', { email, role });
  },
  acceptInvite(token: string) {
    return apiClient.post(`/members/invite/${encodeURIComponent(token)}/accept`);
  },
};
