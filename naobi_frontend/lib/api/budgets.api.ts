import { apiClient } from './client';

export type OrgBudget = {
  id: string;
  organization_id: string;
  period: 'day' | 'week' | 'month';
  ceiling: number;
  consumed: number;
  overage_action: 'block' | 'alert';
  period_starts_at: string;
  period_ends_at: string;
  usage_ratio: number;
  message?: string;
};

export const budgetsApi = {
  list() {
    return apiClient.get<OrgBudget[]>('/budgets');
  },
  active() {
    return apiClient.get<OrgBudget | null>('/budgets/active');
  },
  upsert(payload: {
    period: 'day' | 'week' | 'month';
    ceiling: number;
    overage_action?: 'block' | 'alert';
  }) {
    return apiClient.post<OrgBudget>('/budgets', payload);
  },
};

export const analyticsApi = {
  spendTags(from?: string, to?: string) {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    const qs = q.toString();
    return apiClient.get<{
      from: string;
      to: string;
      tags: any[];
      empty: boolean;
      team_activity?: unknown;
    }>(`/analytics/spend-tags${qs ? `?${qs}` : ''}`);
  },
  endUsers(days = 30) {
    return apiClient.get<{
      days: number;
      items: Array<{ end_user_id: string; requests: number; cost: number }>;
    }>(`/analytics/end-users?days=${days}`);
  },
};
