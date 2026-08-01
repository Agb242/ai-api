import { Context, Next } from 'koa';
import { organizationService } from '../services/organization.service';
import { OrgRole } from '../models/OrganizationMember';
import { t } from '../i18n/messages';

declare module 'koa' {
  interface DefaultState {
    membership?: import('../models/OrganizationMember').OrganizationMember;
    orgId?: string;
  }
}

const ROLE_RANK: Record<OrgRole, number> = {
  viewer: 1,
  developer: 2,
  admin: 3,
  owner: 4,
};

/** Attach org when X-Org-ID is present and user is a member (no hard fail). */
export async function optionalOrg(ctx: Context, next: Next) {
  const userId = ctx.state.user?.id;
  if (userId) {
    const orgId = (ctx.get('X-Org-ID') || (ctx.query.org_id as string) || '') as string;
    if (orgId) {
      const membership = await organizationService.getMembership(userId, orgId);
      if (membership) {
        ctx.state.orgId = orgId;
        ctx.state.membership = membership;
      }
    }
  }
  await next();
}

export function requireOrg(minRole: OrgRole = 'viewer') {
  return async (ctx: Context, next: Next) => {
    const locale = ctx.state.locale || 'fr';
    const userId = ctx.state.user?.id;
    if (!userId) {
      ctx.status = 401;
      ctx.body = { error: { message: t(locale, 'UNAUTHORIZED'), code: 'UNAUTHORIZED' } };
      return;
    }

    const orgId =
      (ctx.get('X-Org-ID') ||
        (ctx.params as any).orgId ||
        (ctx.query.org_id as string) ||
        '') as string;

    if (!orgId) {
      ctx.status = 400;
      ctx.body = { error: { message: t(locale, 'ORG_REQUIRED'), code: 'ORG_REQUIRED' } };
      return;
    }

    const membership = await organizationService.getMembership(userId, orgId);
    if (!membership) {
      ctx.status = 403;
      ctx.body = { error: { message: t(locale, 'FORBIDDEN'), code: 'FORBIDDEN' } };
      return;
    }

    if (ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
      ctx.status = 403;
      ctx.body = { error: { message: t(locale, 'FORBIDDEN'), code: 'FORBIDDEN' } };
      return;
    }

    ctx.state.orgId = orgId;
    ctx.state.membership = membership;

    // Soft backfill: ensure LiteLLM team exists for legacy orgs
    try {
      const { litellmTeamService } = await import('../services/litellm-team.service');
      void litellmTeamService.ensureTeamByOrgId(orgId);
    } catch {
      /* ignore */
    }

    await next();
  };
}
