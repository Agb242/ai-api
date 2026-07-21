import { Budget } from '../models/Budget';
import { Organization } from '../models/Organization';
import { litellmAdmin } from './litellm-admin.service';
import { organizationService } from './organization.service';
import logger from '../config/logger';
import { realtimeHub } from './realtime.service';

function periodBounds(period: 'day' | 'week' | 'month'): {
  starts: Date;
  ends: Date;
  duration: string;
} {
  const starts = new Date();
  const ends = new Date(starts);
  if (period === 'day') {
    ends.setDate(ends.getDate() + 1);
    return { starts, ends, duration: '1d' };
  }
  if (period === 'week') {
    ends.setDate(ends.getDate() + 7);
    return { starts, ends, duration: '7d' };
  }
  ends.setMonth(ends.getMonth() + 1);
  return { starts, ends, duration: '30d' };
}

function publicBudget(b: Budget) {
  const ceiling = Number(b.ceiling);
  const consumed = Number(b.consumed);
  const softPct = Number(b.soft_limit_pct ?? 80);
  const ratio = ceiling > 0 ? consumed / ceiling : 0;
  return {
    id: b.id,
    organization_id: b.organization_id,
    api_key_id: b.api_key_id,
    period: b.period,
    ceiling,
    consumed,
    remaining: Math.max(0, ceiling - consumed),
    soft_limit_pct: softPct,
    overage_action: b.overage_action,
    period_starts_at: b.period_starts_at,
    period_ends_at: b.period_ends_at,
    litellm_budget_id: b.litellm_budget_id ?? null,
    usage_ratio: ratio,
    soft_limit_hit: ratio >= softPct / 100,
    hard_limit_hit: ceiling > 0 && consumed >= ceiling,
    created_at: b.created_at,
    updated_at: b.updated_at,
  };
}

export const budgetService = {
  publicBudget,

  async list(organizationId: string) {
    const rows = await Budget.query()
      .where({ organization_id: organizationId })
      .whereNull('api_key_id')
      .orderBy('created_at', 'desc');
    return rows.map(publicBudget);
  },

  async getById(organizationId: string, budgetId: string) {
    return Budget.query().findOne({ id: budgetId, organization_id: organizationId });
  },

  /** Active org-level budget (most recent non-expired or any with hard ceiling). */
  async getActiveOrgBudget(organizationId: string): Promise<Budget | null> {
    const now = new Date();
    const row = await Budget.query()
      .where({ organization_id: organizationId })
      .whereNull('api_key_id')
      .where('overage_action', 'block')
      .where('period_ends_at', '>', now.toISOString())
      .orderBy('created_at', 'desc')
      .first();
    return row || null;
  },

  async assertOrgAffordable(organizationId: string, additionalCost = 0) {
    const budget = await this.getActiveOrgBudget(organizationId);
    if (!budget) return;
    const ceiling = Number(budget.ceiling);
    const consumed = Number(budget.consumed) + additionalCost;
    if (ceiling > 0 && consumed >= ceiling) {
      throw Object.assign(new Error('ORG_BUDGET_EXCEEDED'), { code: 'ORG_BUDGET_EXCEEDED' });
    }
  },

  async addConsumed(organizationId: string, amount: number) {
    if (amount <= 0) return;
    const budget = await this.getActiveOrgBudget(organizationId);
    if (!budget) return;

    const next = Number(budget.consumed) + amount;
    const softPct = Number(budget.soft_limit_pct ?? 80);
    const ceiling = Number(budget.ceiling);
    const prevRatio = ceiling > 0 ? Number(budget.consumed) / ceiling : 0;
    const nextRatio = ceiling > 0 ? next / ceiling : 0;

    await budget.$query().patch({ consumed: next });

    if (prevRatio < softPct / 100 && nextRatio >= softPct / 100) {
      logger.warn('Org budget soft limit reached', {
        organizationId,
        budgetId: budget.id,
        ratio: nextRatio,
      });
      try {
        realtimeHub.emitRequest(organizationId, {
          id: budget.id,
          model: 'budget',
          status: 'alert',
          latency_ms: 0,
          cost: next,
          created_at: new Date().toISOString(),
          filter_action: 'budget_soft_limit',
        } as any);
      } catch {
        /* ignore */
      }
    }
  },

  async create(params: {
    organizationId: string;
    ceiling: number;
    period?: 'day' | 'week' | 'month';
    softLimitPct?: number;
    overageAction?: 'block' | 'alert';
  }) {
    const period = params.period || 'month';
    const { starts, ends, duration } = periodBounds(period);
    const softPct = params.softLimitPct ?? 80;
    const softBudget =
      params.ceiling > 0 ? (params.ceiling * softPct) / 100 : null;

    const org = await Organization.query().findById(params.organizationId);
    if (!org) throw Object.assign(new Error('NOT_FOUND'), { code: 'NOT_FOUND' });

    await organizationService.ensureLiteLlmTeam(org);

    let litellmBudgetId: string | null = null;
    if (litellmAdmin.configured()) {
      try {
        const budgetId = `org-budget-${params.organizationId.slice(0, 8)}-${Date.now().toString(36)}`;
        const created = await litellmAdmin.budgetNew({
          budgetId,
          maxBudget: params.ceiling,
          softBudget,
          budgetDuration: duration,
        });
        litellmBudgetId = String(created.budget_id || budgetId);
      } catch (err) {
        logger.warn('LiteLLM budget/new failed — storing local only', {
          err: err instanceof Error ? err.message : err,
        });
      }
    }

    const row = await Budget.query().insert({
      organization_id: params.organizationId,
      api_key_id: null,
      period,
      ceiling: params.ceiling,
      consumed: 0,
      overage_action: params.overageAction || 'block',
      period_starts_at: starts.toISOString(),
      period_ends_at: ends.toISOString(),
      litellm_budget_id: litellmBudgetId,
      soft_limit_pct: softPct,
    } as any);

    return publicBudget(row);
  },

  async update(
    organizationId: string,
    budgetId: string,
    patch: {
      ceiling?: number;
      softLimitPct?: number;
      overageAction?: 'block' | 'alert';
    },
  ) {
    const row = await this.getById(organizationId, budgetId);
    if (!row) return null;

    const data: Partial<Budget> = {};
    if (typeof patch.ceiling === 'number') data.ceiling = patch.ceiling;
    if (typeof patch.softLimitPct === 'number') data.soft_limit_pct = patch.softLimitPct;
    if (patch.overageAction) data.overage_action = patch.overageAction;

    const updated = await row.$query().patchAndFetch(data);

    if (updated.litellm_budget_id && litellmAdmin.configured()) {
      try {
        const ceiling = Number(updated.ceiling);
        const softPct = Number(updated.soft_limit_pct ?? 80);
        await litellmAdmin.budgetUpdate({
          budgetId: updated.litellm_budget_id,
          maxBudget: ceiling,
          softBudget: (ceiling * softPct) / 100,
        });
      } catch (err) {
        logger.warn('LiteLLM budget/update failed', {
          err: err instanceof Error ? err.message : err,
        });
      }
    }

    return publicBudget(updated);
  },

  async remove(organizationId: string, budgetId: string) {
    const row = await this.getById(organizationId, budgetId);
    if (!row) return false;

    if (row.litellm_budget_id && litellmAdmin.configured()) {
      try {
        await litellmAdmin.budgetDelete([row.litellm_budget_id]);
      } catch (err) {
        logger.warn('LiteLLM budget/delete failed', {
          err: err instanceof Error ? err.message : err,
        });
      }
    }

    await row.$query().delete();
    return true;
  },
};
