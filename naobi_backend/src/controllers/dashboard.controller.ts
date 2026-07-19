import { Context } from 'koa';
import { apiKeyService } from '../services/api-key.service';
import { keyAnalyticsService } from '../services/key-analytics.service';
import { walletService } from '../services/wallet.service';
import { filterService } from '../services/filter.service';
import { organizationService } from '../services/organization.service';
import { RequestLog } from '../models/RequestLog';
import { OrganizationMember } from '../models/OrganizationMember';
import { Invitation } from '../models/Invitation';
import { llmRouter } from '../services/llm/router';
import { t } from '../i18n/messages';
import crypto from 'crypto';
import { knex } from '../config/database';

function ok(ctx: Context, data: unknown, status = 200) {
  ctx.status = status;
  ctx.body = { success: true, data };
}

function fail(ctx: Context, code: string, status: number, vars?: Record<string, string>) {
  const locale = ctx.state.locale || 'fr';
  ctx.status = status;
  ctx.body = { success: false, error: { message: t(locale, code, vars), code } };
}

export const orgController = {
  async listMine(ctx: Context) {
    const orgs = await organizationService.listForUser(ctx.state.user!.id);
    ok(ctx, orgs);
  },

  async create(ctx: Context) {
    const { name } = (ctx.request.body || {}) as { name?: string };
    if (!name?.trim()) return fail(ctx, 'MISSING_FIELDS', 400);
    const created = await organizationService.createForUser(ctx.state.user!.id, name.trim());
    ok(
      ctx,
      {
        organization: created.organization,
        membership: created.member,
        wallet: created.wallet,
      },
      201,
    );
  },
};

export const keysController = {
  async list(ctx: Context) {
    const keys = await apiKeyService.list(ctx.state.orgId!);
    ok(ctx, keys.map((k) => apiKeyService.publicKeyFields(k)));
  },

  async get(ctx: Context) {
    const key = await apiKeyService.getById(ctx.state.orgId!, ctx.params.id);
    if (!key) return fail(ctx, 'NOT_FOUND', 404);
    const analytics = await keyAnalyticsService.analytics(ctx.state.orgId!, ctx.params.id);
    ok(ctx, {
      ...apiKeyService.publicKeyFields(key),
      ...(analytics?.litellm ? { litellm: analytics.litellm } : {}),
      ...(analytics?.sources ? { sources: analytics.sources } : {}),
    });
  },

  async create(ctx: Context) {
    const body = (ctx.request.body || {}) as {
      name?: string;
      description?: string;
      scope?: string;
      budget_max?: number;
      expires_at?: string;
    };
    if (!body.name?.trim()) return fail(ctx, 'MISSING_FIELDS', 400);

    const { record, plaintext } = await apiKeyService.create({
      organizationId: ctx.state.orgId!,
      userId: ctx.state.user!.id,
      name: body.name.trim(),
      description: body.description ?? null,
      scope: body.scope,
      budgetMax: body.budget_max ?? null,
      expiresAt: body.expires_at ? new Date(body.expires_at) : null,
    });

    ok(
      ctx,
      {
        ...apiKeyService.publicKeyFields(record),
        key: plaintext,
        message: t(ctx.state.locale || 'fr', 'KEY_CREATED'),
      },
      201,
    );
  },

  async update(ctx: Context) {
    const body = (ctx.request.body || {}) as { name?: string; description?: string | null };
    if (body.name === undefined && body.description === undefined) {
      return fail(ctx, 'MISSING_FIELDS', 400);
    }
    const key = await apiKeyService.update(ctx.state.orgId!, ctx.params.id, {
      name: body.name,
      description: body.description,
    });
    if (!key) return fail(ctx, 'NOT_FOUND', 404);
    if (key.status === 'revoked') return fail(ctx, 'KEY_REVOKED', 400);
    ok(ctx, apiKeyService.publicKeyFields(key));
  },

  async disable(ctx: Context) {
    const body = (ctx.request.body || {}) as { confirm?: boolean };
    if (body.confirm !== true) return fail(ctx, 'CONFIRM_REQUIRED', 400);
    const key = await apiKeyService.disable(ctx.state.orgId!, ctx.params.id);
    if (!key) return fail(ctx, 'NOT_FOUND', 404);
    if (key.status === 'revoked') return fail(ctx, 'KEY_REVOKED', 400);
    if (key.status === 'expired') return fail(ctx, 'KEY_EXPIRED', 400);
    ok(ctx, { ...apiKeyService.publicKeyFields(key), message: t(ctx.state.locale || 'fr', 'KEY_DISABLED_OK') });
  },

  async enable(ctx: Context) {
    const body = (ctx.request.body || {}) as { confirm?: boolean };
    if (body.confirm !== true) return fail(ctx, 'CONFIRM_REQUIRED', 400);
    const existing = await apiKeyService.getById(ctx.state.orgId!, ctx.params.id);
    if (!existing) return fail(ctx, 'NOT_FOUND', 404);
    if (existing.status === 'revoked') return fail(ctx, 'KEY_REVOKED', 400);
    if (existing.status === 'expired') return fail(ctx, 'KEY_EXPIRED', 400);
    const key = await apiKeyService.enable(ctx.state.orgId!, ctx.params.id);
    if (!key) return fail(ctx, 'NOT_FOUND', 404);
    ok(ctx, { ...apiKeyService.publicKeyFields(key), message: t(ctx.state.locale || 'fr', 'KEY_ENABLED_OK') });
  },

  async revoke(ctx: Context) {
    const body = (ctx.request.body || {}) as { confirm?: boolean };
    if (body.confirm !== true) return fail(ctx, 'CONFIRM_REQUIRED', 400);
    const key = await apiKeyService.revoke(ctx.state.orgId!, ctx.params.id);
    if (!key) return fail(ctx, 'NOT_FOUND', 404);
    ok(ctx, { id: key.id, status: key.status, message: t(ctx.state.locale || 'fr', 'KEY_REVOKED_OK') });
  },

  async metrics(ctx: Context) {
    const data = await apiKeyService.metrics(ctx.state.orgId!, ctx.params.id);
    if (!data) return fail(ctx, 'NOT_FOUND', 404);
    ok(ctx, data);
  },

  async logs(ctx: Context) {
    const page = parseInt(String(ctx.query.page || '1'), 10);
    const limit = parseInt(String(ctx.query.limit || '50'), 10);
    const status = typeof ctx.query.status === 'string' ? ctx.query.status : undefined;
    const model = typeof ctx.query.model === 'string' ? ctx.query.model : undefined;
    const sourceRaw = typeof ctx.query.source === 'string' ? ctx.query.source : 'auto';
    const source =
      sourceRaw === 'litellm' || sourceRaw === 'gateway' || sourceRaw === 'auto'
        ? sourceRaw
        : 'auto';
    const data = await keyAnalyticsService.logs(ctx.state.orgId!, ctx.params.id, {
      page,
      limit,
      status,
      model,
      source,
    });
    if (!data) return fail(ctx, 'NOT_FOUND', 404);
    ok(ctx, data);
  },

  async analytics(ctx: Context) {
    const data = await keyAnalyticsService.analytics(ctx.state.orgId!, ctx.params.id);
    if (!data) return fail(ctx, 'NOT_FOUND', 404);
    ok(ctx, data);
  },

  async usage(ctx: Context) {
    const days = parseInt(String(ctx.query.days || '14'), 10);
    const data = await keyAnalyticsService.usage(ctx.state.orgId!, ctx.params.id, days);
    if (!data) return fail(ctx, 'NOT_FOUND', 404);
    ok(ctx, data);
  },

  async models(ctx: Context) {
    const data = await keyAnalyticsService.models(ctx.state.orgId!, ctx.params.id);
    if (!data) return fail(ctx, 'NOT_FOUND', 404);
    ok(ctx, data);
  },

  async providers(ctx: Context) {
    const data = await keyAnalyticsService.providers(ctx.state.orgId!, ctx.params.id);
    if (!data) return fail(ctx, 'NOT_FOUND', 404);
    ok(ctx, data);
  },

  async errors(ctx: Context) {
    const data = await keyAnalyticsService.errors(ctx.state.orgId!, ctx.params.id);
    if (!data) return fail(ctx, 'NOT_FOUND', 404);
    if (!data.total) {
      ctx.status = 404;
      ctx.body = {
        success: false,
        error: { message: t(ctx.state.locale || 'fr', 'NOT_FOUND'), code: 'NO_ERRORS' },
      };
      return;
    }
    ok(ctx, data);
  },
};

export const walletController = {
  async get(ctx: Context) {
    const wallet = await walletService.getByOrg(ctx.state.orgId!);
    if (!wallet) return fail(ctx, 'NOT_FOUND', 404);
    const transactions = await walletService.listTransactions(wallet.id);
    ok(ctx, {
      ...wallet,
      balance: Number(wallet.balance),
      below_alert: walletService.isBelowAlert(wallet),
      transactions,
    });
  },

  async topUp(ctx: Context) {
    // Stub top-ups removed — credit only via MoMo packs / confirmed payments
    fail(ctx, 'TOPUP_DISABLED', 410);
  },
};

export const filtersController = {
  async list(ctx: Context) {
    ok(ctx, await filterService.list(ctx.state.orgId!));
  },

  async create(ctx: Context) {
    const body = (ctx.request.body || {}) as any;
    if (!body.name || !body.type || !body.pattern || !body.action) {
      return fail(ctx, 'MISSING_FIELDS', 400);
    }
    const rule = await filterService.create({
      organizationId: ctx.state.orgId!,
      userId: ctx.state.user!.id,
      name: body.name,
      type: body.type,
      pattern: body.pattern,
      action: body.action,
      active: body.active,
    });
    ok(ctx, rule, 201);
  },

  async update(ctx: Context) {
    const rule = await filterService.update(ctx.state.orgId!, ctx.params.id, ctx.request.body as any);
    if (!rule) return fail(ctx, 'NOT_FOUND', 404);
    ok(ctx, rule);
  },

  async remove(ctx: Context) {
    const n = await filterService.remove(ctx.state.orgId!, ctx.params.id);
    if (!n) return fail(ctx, 'NOT_FOUND', 404);
    ok(ctx, { deleted: true });
  },

  async test(ctx: Context) {
    const body = (ctx.request.body || {}) as any;
    if (!body.sample || !body.type || !body.pattern || !body.action) {
      return fail(ctx, 'MISSING_FIELDS', 400);
    }
    ok(ctx, filterService.test(body.sample, body.type, body.pattern, body.action));
  },
};

export const logsController = {
  async list(ctx: Context) {
    const limit = Math.min(parseInt(String(ctx.query.limit || '50'), 10), 200);
    const logs = await RequestLog.query()
      .where({ organization_id: ctx.state.orgId! })
      .orderBy('created_at', 'desc')
      .limit(limit);
    ok(ctx, logs);
  },
};

export const metricsController = {
  async dashboard(ctx: Context) {
    const orgId = ctx.state.orgId!;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const todayCount = await knex('request_logs')
      .where({ organization_id: orgId })
      .where('created_at', '>=', startOfDay)
      .count({ count: 'id' })
      .first();

    const tokensRow = await knex('request_logs')
      .where({ organization_id: orgId })
      .where('created_at', '>=', startOfDay)
      .sum({ input: 'tokens_input', output: 'tokens_output' })
      .first();

    const latencyRow = await knex('request_logs')
      .where({ organization_id: orgId })
      .where('created_at', '>=', startOfDay)
      .whereNotNull('latency_ms')
      .avg({ avg: 'latency_ms' })
      .first();

    const monthCost = await knex('request_logs')
      .where({ organization_id: orgId })
      .where('created_at', '>=', startOfMonth)
      .sum({ cost: 'cost' })
      .first();

    const recent = await RequestLog.query()
      .where({ organization_id: orgId })
      .orderBy('created_at', 'desc')
      .limit(20);

    const wallet = await walletService.getByOrg(orgId);
    const routerHealth = await llmRouter.health();

    const keys = await knex('api_keys')
      .where({ organization_id: orgId, status: 'active' })
      .select(
        'id',
        'name',
        'key_prefix',
        'litellm_spend',
        'litellm_synced_at',
        'budget_consumed',
        'budget_max',
      );

    const litellmSpendTotal = keys.reduce((s, k) => s + Number(k.litellm_spend || 0), 0);
    const budgetRow = await knex('budgets')
      .where({ organization_id: orgId })
      .where('period_ends_at', '>=', new Date())
      .orderBy('period_ends_at', 'desc')
      .first();

    const { litellmSyncService } = await import('../services/litellm-sync.service');
    const liveModels = await litellmSyncService.liveModels();

    ok(ctx, {
      metrics: {
        requests_today: Number((todayCount as any)?.count || 0),
        tokens_today:
          Number((tokensRow as any)?.input || 0) + Number((tokensRow as any)?.output || 0),
        latency_avg_ms: Math.round(Number((latencyRow as any)?.avg || 0)),
        cost_month: Number((monthCost as any)?.cost || 0),
        litellm_spend_total: litellmSpendTotal,
      },
      wallet: wallet
        ? { balance: Number(wallet.balance), status: wallet.status, below_alert: walletService.isBelowAlert(wallet) }
        : null,
      recent,
      models: Array.isArray((liveModels as any)?.data) ? (liveModels as any).data : [],
      litellm: liveModels,
      keys,
      router: routerHealth,
      budget: budgetRow
        ? {
            ceiling: Number(budgetRow.ceiling),
            consumed: Number(budgetRow.consumed),
            period: budgetRow.period,
          }
        : {
            ceiling: null,
            consumed: litellmSpendTotal,
            period: 'month',
          },
    });
  },
};

export const modelsController = {
  async list(ctx: Context) {
    const { litellmSyncService } = await import('../services/litellm-sync.service');
    const live = await litellmSyncService.liveModels();
    // Return enriched catalog even from cache; FE can show degraded banner via litellm_healthy.
    if (!live.data?.length && !live.litellm_healthy) {
      return fail(ctx, 'LITELLM_UNAVAILABLE', 503);
    }
    ok(ctx, live);
  },
};

export const membersController = {
  async list(ctx: Context) {
    const members = await OrganizationMember.query()
      .where({ organization_id: ctx.state.orgId! })
      .withGraphFetched('user');
    ok(ctx, members);
  },

  async invite(ctx: Context) {
    const { email, role } = (ctx.request.body || {}) as { email?: string; role?: string };
    if (!email) return fail(ctx, 'MISSING_FIELDS', 400);
    const token = crypto.randomBytes(24).toString('hex');
    const expires = new Date();
    expires.setDate(expires.getDate() + 7);

    const invite = await Invitation.query().insert({
      organization_id: ctx.state.orgId!,
      invited_by: ctx.state.user!.id,
      email: email.toLowerCase().trim(),
      role: role || 'developer',
      token,
      status: 'pending',
      expires_at: expires.toISOString(),
    });

    ok(ctx, invite, 201);
  },

  async acceptInvite(ctx: Context) {
    const token = ctx.params.token as string;
    if (!token || !ctx.state.user) return fail(ctx, 'MISSING_FIELDS', 400);

    const invite = await Invitation.query().findOne({ token, status: 'pending' });
    if (!invite) return fail(ctx, 'NOT_FOUND', 404);
    if (new Date(invite.expires_at) < new Date()) {
      await invite.$query().patch({ status: 'expired' });
      return fail(ctx, 'INVITE_EXPIRED', 410);
    }

    const email = ctx.state.user.email.toLowerCase();
    if (invite.email.toLowerCase() !== email) {
      return fail(ctx, 'FORBIDDEN', 403);
    }

    const existing = await OrganizationMember.query().findOne({
      organization_id: invite.organization_id,
      user_id: ctx.state.user.id,
    });
    if (!existing) {
      await OrganizationMember.query().insert({
        organization_id: invite.organization_id,
        user_id: ctx.state.user.id,
        role: invite.role as any,
        status: 'active',
      });
    }

    await invite.$query().patch({ status: 'accepted' });
    ok(ctx, { organization_id: invite.organization_id, role: invite.role });
  },
};
