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
  guardrailStatus() {
    return apiClient.get<{ enabled: boolean; configured: boolean }>('/filters/guardrail');
  },
  enableGuardrail() {
    return apiClient.post('/filters/guardrail/enable');
  },
  disableGuardrail() {
    return apiClient.post('/filters/guardrail/disable');
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

export const auditApi = {
  list(params?: { page?: number; limit?: number; from?: string; to?: string }) {
    return apiClient.get('/audit', { params });
  },
  async exportCsv(): Promise<{ success: boolean; blob?: Blob; error?: { message: string; code: string } }> {
    const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3018/api/v1';
    const { getAuthToken } = await import('../auth-token');
    const { useAuthStore } = await import('../stores/auth.store');
    const token = getAuthToken();
    const orgId = useAuthStore.getState().org?.id;
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (orgId) headers['X-Org-ID'] = orgId;
    try {
      const res = await fetch(`${base}/audit/export`, { headers });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        return {
          success: false,
          error: {
            message: json?.error?.message || 'Export failed',
            code: json?.error?.code || 'EXPORT_FAILED',
          },
        };
      }
      const blob = await res.blob();
      return { success: true, blob };
    } catch {
      return { success: false, error: { message: 'Network error', code: 'NETWORK_ERROR' } };
    }
  },
};

export const complianceApi = {
  checklist() {
    return apiClient.get('/compliance/checklist');
  },
  export() {
    return apiClient.get('/compliance/export');
  },
};

export const platformApi = {
  getPricing() {
    return apiClient.get('/platform/pricing');
  },
  putPricing(payload: { margin?: unknown; discount?: unknown }) {
    return apiClient.put('/platform/pricing', payload);
  },
  listAdmins() {
    return apiClient.get('/platform/admins');
  },
  inviteAdmin(email: string) {
    return apiClient.post('/platform/admins/invite', { email });
  },
};
