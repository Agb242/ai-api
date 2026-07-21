import { apiClient } from './client';

export type OrgBudget = {
  id: string;
  organization_id?: string | null;
  period: 'day' | 'week' | 'month';
  ceiling: number;
  consumed: number;
  remaining: number;
  soft_limit_pct: number;
  overage_action: 'block' | 'alert';
  usage_ratio: number;
  soft_limit_hit: boolean;
  hard_limit_hit: boolean;
  period_starts_at: string;
  period_ends_at: string;
  litellm_budget_id?: string | null;
};

export const budgetsApi = {
  list() {
    return apiClient.get<OrgBudget[]>('/budgets');
  },
  create(payload: {
    ceiling: number;
    period?: 'day' | 'week' | 'month';
    soft_limit_pct?: number;
    overage_action?: 'block' | 'alert';
  }) {
    return apiClient.post<OrgBudget>('/budgets', payload);
  },
  update(
    id: string,
    payload: { ceiling?: number; soft_limit_pct?: number; overage_action?: 'block' | 'alert' },
  ) {
    return apiClient.patch<OrgBudget>(`/budgets/${id}`, payload);
  },
  remove(id: string) {
    return apiClient.delete<{ id: string }>(`/budgets/${id}`);
  },
};
