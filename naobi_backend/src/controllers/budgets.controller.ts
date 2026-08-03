import { Context } from 'koa';
import { budgetService, publicBudget } from '../services/budget.service';
import { litellmAdmin } from '../services/litellm-admin.service';
import { Organization } from '../models/Organization';
import { knex } from '../config/database';
import { t } from '../i18n/messages';

function ok(ctx: Context, data: unknown, status = 200) {
  ctx.status = status;
  ctx.body = { success: true, data };
}

function fail(ctx: Context, code: string, status: number) {
  const locale = ctx.state.locale || 'fr';
  ctx.status = status;
  ctx.body = { success: false, error: { message: t(locale, code), code } };
}

export const budgetsController = {
  async list(ctx: Context) {
    const rows = await budgetService.listForOrg(ctx.state.orgId!);
    ok(ctx, rows.map(publicBudget));
  },

  async getActive(ctx: Context) {
    const row = await budgetService.getActiveOrgBudget(ctx.state.orgId!);
    ok(ctx, row ? publicBudget(row) : null);
  },

  async upsert(ctx: Context) {
    const body = (ctx.request.body || {}) as {
      period?: 'day' | 'week' | 'month';
      ceiling?: number;
      overage_action?: 'block' | 'alert';
    };
    if (!body.period || body.ceiling == null || Number(body.ceiling) <= 0) {
      return fail(ctx, 'MISSING_FIELDS', 400);
    }
    if (!['day', 'week', 'month'].includes(body.period)) {
      return fail(ctx, 'MISSING_FIELDS', 400);
    }
    const budget = await budgetService.upsertOrgBudget({
      organizationId: ctx.state.orgId!,
      period: body.period,
      ceiling: Number(body.ceiling),
      overageAction: body.overage_action,
      actorUserId: ctx.state.user!.id,
    });
    ok(ctx, {
      ...publicBudget(budget),
      message: t(ctx.state.locale || 'fr', 'BUDGET_SAVED'),
    });
  },

  async patch(ctx: Context) {
    return budgetsController.upsert(ctx);
  },
};

export const analyticsController = {
  async spendTags(ctx: Context) {
    const from =
      typeof ctx.query.from === 'string'
        ? ctx.query.from
        : new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const to =
      typeof ctx.query.to === 'string'
        ? ctx.query.to
        : new Date().toISOString().slice(0, 10);

    const tags = await litellmAdmin.spendTags({ startDate: from, endDate: to });
    const org = await Organization.query().findById(ctx.state.orgId!);
    let teamActivity: Record<string, unknown> | null = null;
    if (org?.litellm_team_id) {
      teamActivity = await litellmAdmin.teamDailyActivity({
        teamId: org.litellm_team_id,
        startDate: from,
        endDate: to,
      });
    }

    ok(ctx, {
      from,
      to,
      tags: tags || [],
      team_activity: teamActivity,
      empty: !tags || tags.length === 0,
    });
  },

  async endUsers(ctx: Context) {
    const days = Math.min(90, Math.max(1, parseInt(String(ctx.query.days || '30'), 10)));
    const rows = await knex('request_logs')
      .where({ organization_id: ctx.state.orgId! })
      .where('created_at', '>=', knex.raw(`now() - interval '${days} days'`))
      .whereRaw(`metadata->>'end_user_id' is not null`)
      .select(
        knex.raw(`metadata->>'end_user_id' as end_user_id`),
        knex.raw('count(*)::int as requests'),
        knex.raw('coalesce(sum(cost),0)::float as cost'),
      )
      .groupByRaw(`metadata->>'end_user_id'`)
      .orderByRaw('cost desc')
      .limit(100);

    ok(ctx, {
      days,
      items: (rows as any[]).map((r) => ({
        end_user_id: r.end_user_id,
        requests: Number(r.requests || 0),
        cost: Number(r.cost || 0),
      })),
    });
  },
};
