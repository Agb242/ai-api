import { Context } from 'koa';
import { auditService } from '../services/audit.service';
import { litellmAdmin } from '../services/litellm-admin.service';
import { Organization } from '../models/Organization';
import { OrganizationMember } from '../models/OrganizationMember';
import { ApiKey } from '../models/ApiKey';
import { knex } from '../config/database';
import { t } from '../i18n/messages';
import { config } from '../config/server';

function ok(ctx: Context, data: unknown, status = 200) {
  ctx.status = status;
  ctx.body = { success: true, data };
}

function fail(ctx: Context, code: string, status: number) {
  const locale = ctx.state.locale || 'fr';
  ctx.status = status;
  ctx.body = { success: false, error: { message: t(locale, code), code } };
}

export const auditController = {
  async list(ctx: Context) {
    const from = typeof ctx.query.from === 'string' ? ctx.query.from : undefined;
    const to = typeof ctx.query.to === 'string' ? ctx.query.to : undefined;
    const page = parseInt(String(ctx.query.page || '1'), 10);
    const limit = parseInt(String(ctx.query.limit || '50'), 10);
    const data = await auditService.list(ctx.state.orgId!, { from, to, page, limit });
    ok(ctx, data);
  },

  async exportCsv(ctx: Context) {
    if (ctx.state.membership?.role !== 'owner') {
      return fail(ctx, 'FORBIDDEN', 403);
    }
    const from = typeof ctx.query.from === 'string' ? ctx.query.from : undefined;
    const to = typeof ctx.query.to === 'string' ? ctx.query.to : undefined;
    const csv = await auditService.exportCsv(ctx.state.orgId!, { from, to });
    ctx.set('Content-Type', 'text/csv; charset=utf-8');
    ctx.set('Content-Disposition', 'attachment; filename="noabi-audit.csv"');
    ctx.status = 200;
    ctx.body = csv;
  },
};

export const platformController = {
  async getPricing(ctx: Context) {
    const margin = await litellmAdmin.getCostMarginConfig();
    const discount = await litellmAdmin.getCostDiscountConfig();
    ok(ctx, {
      margin,
      discount,
      provider_configured: litellmAdmin.configured(),
    });
  },

  async putPricing(ctx: Context) {
    const body = (ctx.request.body || {}) as {
      margin?: unknown;
      discount?: unknown;
    };
    const result: Record<string, unknown> = {};
    try {
      if (body.margin !== undefined) {
        result.margin = await litellmAdmin.setCostMarginConfig(body.margin);
      }
      if (body.discount !== undefined) {
        result.discount = await litellmAdmin.setCostDiscountConfig(body.discount);
      }
      ok(ctx, result);
    } catch (err: any) {
      ctx.status = 502;
      ctx.body = {
        success: false,
        error: { message: err.message || t(ctx.state.locale || 'fr', 'PROVIDER_ERROR'), code: 'PROVIDER_ERROR' },
      };
    }
  },

  async listAdmins(ctx: Context) {
    const { platformAdminService } = await import('../services/platform-admin.service');
    ok(ctx, await platformAdminService.list());
  },

  async inviteAdmin(ctx: Context) {
    const { platformAdminService } = await import('../services/platform-admin.service');
    const body = (ctx.request.body || {}) as { email?: string };
    if (!body.email?.trim()) return fail(ctx, 'MISSING_FIELDS', 400);
    try {
      const row = await platformAdminService.invite({
        email: body.email,
        invitedByUserId: ctx.state.user!.id,
      });
      ok(ctx, row, 201);
    } catch (err: any) {
      if (err?.code === 'ALREADY_EXISTS') {
        ctx.status = 409;
        ctx.body = {
          success: false,
          error: {
            message:
              ctx.state.locale === 'en'
                ? 'This email is already a platform admin'
                : 'Cet email est déjà admin plateforme',
            code: 'ALREADY_EXISTS',
          },
        };
        return;
      }
      if (err?.code === 'MISSING_FIELDS') return fail(ctx, 'MISSING_FIELDS', 400);
      throw err;
    }
  },
};

export const complianceController = {
  async export(ctx: Context) {
    if (ctx.state.membership?.role !== 'owner') {
      return fail(ctx, 'FORBIDDEN', 403);
    }
    const orgId = ctx.state.orgId!;
    const members = await OrganizationMember.query()
      .where({ organization_id: orgId })
      .withGraphFetched('user');
    const keys = await ApiKey.query()
      .where({ organization_id: orgId })
      .whereNot({ status: 'revoked' });
    const requestSummary = await knex('request_logs')
      .where({ organization_id: orgId })
      .select(
        knex.raw('count(*)::int as requests'),
        knex.raw("count(*) filter (where status = 'blocked')::int as blocked"),
        knex.raw('coalesce(sum(cost),0)::float as cost'),
      )
      .first();
    const filterAudit = await knex('filter_audit_logs')
      .where({ organization_id: orgId })
      .orderBy('created_at', 'desc')
      .limit(500);
    const auditCsv = await auditService.exportCsv(orgId);

    const membersCsv = [
      'email,role,status',
      ...members.map((m) =>
        [(m as any).user?.email || '', m.role, m.status].join(','),
      ),
    ].join('\n');

    const keysCsv = [
      'id,name,prefix,status,budget_max,created_at',
      ...keys.map((k) =>
        [k.id, k.name, k.key_prefix, k.status, k.budget_max ?? '', k.created_at].join(','),
      ),
    ].join('\n');

    let litellmGdpr: unknown = null;
    let litellmEu: unknown = null;
    try {
      litellmGdpr = await litellmAdmin.complianceCheck('gdpr');
      litellmEu = await litellmAdmin.complianceCheck('eu-ai-act');
    } catch {
      /* soft-fail */
    }

    ok(ctx, {
      organization_id: orgId,
      generated_at: new Date().toISOString(),
      retention_days: auditService.retentionDays(),
      checklist: {
        gdpr_informative: true,
        eu_ai_act_informative: true,
        note: 'Checklist informative — not legal advice',
      },
      provider_compliance: { gdpr: litellmGdpr, eu_ai_act: litellmEu },
      summary: requestSummary,
      exports: {
        members_csv: membersCsv,
        keys_csv: keysCsv,
        audit_csv: auditCsv,
        filter_audit: filterAudit,
      },
    });
  },

  async checklist(ctx: Context) {
    ok(ctx, {
      items: [
        {
          id: 'data_minimization',
          fr: 'Minimiser le stockage des prompts (retain_request_content)',
          en: 'Minimize prompt storage (retain_request_content)',
        },
        {
          id: 'access_control',
          fr: 'Rôles org (owner/admin/developer/viewer) et clés limitées',
          en: 'Org roles and scoped API keys',
        },
        {
          id: 'audit_trail',
          fr: 'Journal d’audit exportable (CSV)',
          en: 'Exportable audit trail (CSV)',
        },
        {
          id: 'filters',
          fr: 'Filtres locaux + guardrail entreprise optionnel',
          en: 'Local filters + optional enterprise guardrail',
        },
      ],
      provider: {
        gdpr: await litellmAdmin.complianceCheck('gdpr'),
        eu_ai_act: await litellmAdmin.complianceCheck('eu-ai-act'),
      },
      domain: config.domain,
    });
  },
};
