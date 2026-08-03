import { Budget } from '../models/Budget';
import { Organization } from '../models/Organization';
import { OrganizationMember } from '../models/OrganizationMember';
import { litellmAdmin } from './litellm-admin.service';
import { litellmTeamService } from './litellm-team.service';
import { emailService } from './email.service';
import { auditService } from './audit.service';
import logger from '../config/logger';

function periodBounds(period: 'day' | 'week' | 'month', from = new Date()) {
  const start = new Date(from);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  if (period === 'day') {
    end.setUTCDate(end.getUTCDate() + 1);
  } else if (period === 'week') {
    const day = start.getUTCDay();
    const diff = (day + 6) % 7; // Monday-based
    start.setUTCDate(start.getUTCDate() - diff);
    end.setTime(start.getTime());
    end.setUTCDate(end.getUTCDate() + 7);
  } else {
    start.setUTCDate(1);
    end.setTime(start.getTime());
    end.setUTCMonth(end.getUTCMonth() + 1);
  }
  return { start, end };
}

export function publicBudget(b: Budget) {
  return {
    id: b.id,
    organization_id: b.organization_id,
    api_key_id: b.api_key_id ?? null,
    period: b.period,
    ceiling: Number(b.ceiling),
    consumed: Number(b.consumed),
    overage_action: b.overage_action,
    period_starts_at: b.period_starts_at,
    period_ends_at: b.period_ends_at,
    usage_ratio: Number(b.ceiling) > 0 ? Number(b.consumed) / Number(b.ceiling) : 0,
  };
}

export const budgetService = {
  async listForOrg(organizationId: string) {
    return Budget.query()
      .where({ organization_id: organizationId })
      .whereNull('api_key_id')
      .orderBy('created_at', 'desc');
  },

  async getActiveOrgBudget(organizationId: string): Promise<Budget | null> {
    const now = new Date();
    const row = await Budget.query()
      .where({ organization_id: organizationId })
      .whereNull('api_key_id')
      .where('period_starts_at', '<=', now.toISOString())
      .where('period_ends_at', '>', now.toISOString())
      .orderBy('period_ends_at', 'desc')
      .first();
    return row || null;
  },

  async upsertOrgBudget(params: {
    organizationId: string;
    period: 'day' | 'week' | 'month';
    ceiling: number;
    overageAction?: 'block' | 'alert';
    actorUserId?: string | null;
  }) {
    const { start, end } = periodBounds(params.period);
    const overage = params.overageAction || 'block';

    let budget = await this.getActiveOrgBudget(params.organizationId);
    if (budget && budget.period === params.period) {
      budget = await budget.$query().patchAndFetch({
        ceiling: params.ceiling,
        overage_action: overage,
        period_starts_at: start.toISOString(),
        period_ends_at: end.toISOString(),
        alert_80_sent_at: null,
      } as any);
    } else {
      budget = await Budget.query().insertAndFetch({
        organization_id: params.organizationId,
        api_key_id: null,
        period: params.period,
        ceiling: params.ceiling,
        consumed: 0,
        overage_action: overage,
        period_starts_at: start.toISOString(),
        period_ends_at: end.toISOString(),
      } as any);
    }

    // Mirror to LiteLLM team max_budget
    try {
      const teamId = await litellmTeamService.ensureTeamByOrgId(params.organizationId);
      if (teamId) {
        await litellmAdmin.teamUpdate({
          teamId,
          maxBudget: params.ceiling,
        });
      }
    } catch (err) {
      logger.warn('Failed to mirror org budget to LiteLLM team', {
        organizationId: params.organizationId,
        err,
      });
    }

    await auditService.record({
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      action: 'budget.upsert',
      resourceType: 'budget',
      resourceId: budget.id,
      metadata: { period: params.period, ceiling: params.ceiling },
    });

    return budget;
  },

  async isOrgBudgetBlocked(organizationId: string): Promise<boolean> {
    const budget = await this.getActiveOrgBudget(organizationId);
    if (!budget) return false;
    if (budget.overage_action !== 'block') return false;
    return Number(budget.consumed) >= Number(budget.ceiling);
  },

  /** Sync consumed from sum of key litellm_spend (or gateway costs) and alert at 80%. */
  async syncConsumedFromKeys(organizationId: string, spendTotal: number) {
    const budget = await this.getActiveOrgBudget(organizationId);
    if (!budget) return;

    const ceiling = Number(budget.ceiling);
    const prev = Number(budget.consumed);
    await budget.$query().patch({ consumed: spendTotal } as any);

    if (ceiling > 0 && spendTotal / ceiling >= 0.8 && !budget.alert_80_sent_at) {
      await budget.$query().patch({ alert_80_sent_at: new Date().toISOString() } as any);
      try {
        const owners = await OrganizationMember.query()
          .where({ organization_id: organizationId, role: 'owner', status: 'active' })
          .withGraphFetched('user');
        const org = await Organization.query().findById(organizationId);
        for (const m of owners) {
          const email = (m as any).user?.email;
          if (email) {
            await emailService.sendBudgetAlertEmail(email, {
              orgName: org?.name || organizationId,
              ratio: Math.round((spendTotal / ceiling) * 100),
              ceiling,
              consumed: spendTotal,
            });
          }
        }
      } catch (err) {
        logger.warn('Budget 80% alert email failed', { organizationId, err });
      }
      logger.info('Org budget 80% alert', { organizationId, spendTotal, ceiling, prev });
    }
  },
};
