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
  audits(page = 1, limit = 50) {
    return apiClient.get('/filters/audits', { params: { page, limit } });
  },
  stats(days = 14) {
    return apiClient.get('/filters/stats', { params: { days } });
  },
};

export const guardrailsApi = {
  list() {
    return apiClient.get('/guardrails');
  },
  bind(guardrail_ids: string[]) {
    return apiClient.post('/guardrails/bind', { guardrail_ids });
  },
  test(guardrail_id: string, sample: string) {
    return apiClient.post('/guardrails/test', { guardrail_id, sample });
  },
};

export const logsApi = {
  list(limit = 50, filters?: { tag?: string; end_user?: string }) {
    return apiClient.get('/logs', {
      params: { limit, tag: filters?.tag, end_user: filters?.end_user },
    });
  },
};

export const metricsApi = {
  dashboard() {
    return apiClient.get('/metrics/dashboard');
  },
  tags(days = 30) {
    return apiClient.get('/metrics/tags', { params: { days } });
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
