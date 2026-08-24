import { Organization } from '../models/Organization';
import { OrgRole } from '../models/OrganizationMember';
import { litellmAdmin } from './litellm-admin.service';
import logger from '../config/logger';

export function orgTeamAlias(orgId: string): string {
  return `org:${orgId}`;
}

export function litellmUserIdForMember(orgId: string, userId: string): string {
  return `org-${orgId.slice(0, 8)}-u-${userId.slice(0, 8)}`;
}

export function mapOrgRoleToLiteLLM(role: OrgRole | string): 'admin' | 'user' {
  if (role === 'owner' || role === 'admin') return 'admin';
  return 'user';
}

export const litellmTeamService = {
  /**
   * Ensure a LiteLLM team exists for the org (alias org:{uuid}).
   * Idempotent; stores litellm_team_id on the org row.
   */
  async ensureTeamForOrg(org: Organization): Promise<string | null> {
    if (!litellmAdmin.configured()) return org.litellm_team_id || null;

    if (org.litellm_team_id) {
      try {
        await litellmAdmin.teamInfo(org.litellm_team_id);
        return org.litellm_team_id;
      } catch {
        /* recreate below */
      }
    }

    try {
      await litellmAdmin.assertHealthy();
      const alias = orgTeamAlias(org.id);
      const created = await litellmAdmin.teamNew({
        teamAlias: alias,
        teamId: alias,
        metadata: {
          organization_id: org.id,
          organization_slug: org.slug,
          organization_name: org.name,
        },
      });
      const teamId = created.team_id || alias;
      await org.$query().patch({ litellm_team_id: teamId });
      org.litellm_team_id = teamId;
      return teamId;
    } catch (err) {
      logger.warn('ensureTeamForOrg failed', { orgId: org.id, err });
      return org.litellm_team_id || null;
    }
  },

  async ensureTeamByOrgId(orgId: string): Promise<string | null> {
    const org = await Organization.query().findById(orgId);
    if (!org) return null;
    return this.ensureTeamForOrg(org);
  },

  async syncMember(params: {
    organizationId: string;
    userId: string;
    role: OrgRole | string;
    email?: string;
  }) {
    if (!litellmAdmin.configured()) return;
    try {
      const org = await Organization.query().findById(params.organizationId);
      if (!org) return;
      const teamId = await this.ensureTeamForOrg(org);
      if (!teamId) return;

      const userId = litellmUserIdForMember(params.organizationId, params.userId);
      await litellmAdmin.ensureUser({
        userId,
        userAlias: params.email || userId,
        userEmail: params.email || `${userId}@knotflow.local`,
      });
      await litellmAdmin.teamMemberAdd({
        teamId,
        userId,
        role: mapOrgRoleToLiteLLM(params.role),
      });
    } catch (err) {
      logger.warn('syncMember to LiteLLM team failed', {
        organizationId: params.organizationId,
        err,
      });
    }
  },
};
