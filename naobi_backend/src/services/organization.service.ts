import crypto from 'crypto';
import slugify from 'slugify';
import { transaction } from 'objection';
import { Organization } from '../models/Organization';
import { OrganizationMember } from '../models/OrganizationMember';
import { Wallet } from '../models/Wallet';
import { knex } from '../config/database';

export const organizationService = {
  async createForUser(
    userId: string,
    name: string,
    opts?: { currency?: string },
  ): Promise<{ organization: Organization; member: OrganizationMember; wallet: Wallet }> {
    const baseSlug = slugify(name, { lower: true, strict: true }) || 'org';
    const slug = `${baseSlug}-${crypto.randomBytes(3).toString('hex')}`;

    return transaction(knex, async (trx) => {
      const organization = await Organization.query(trx).insert({
        name,
        slug,
        status: 'trial',
        currency: opts?.currency || 'CREDITS',
      });

      const member = await OrganizationMember.query(trx).insert({
        organization_id: organization.id,
        user_id: userId,
        role: 'owner',
        status: 'active',
      });

      const wallet = await Wallet.query(trx).insert({
        organization_id: organization.id,
        balance: 0,
        alert_threshold_ratio: 0.1,
        status: 'active',
      });

      return { organization, member, wallet };
    });
  },

  async listForUser(userId: string) {
    const memberships = await OrganizationMember.query()
      .where({ user_id: userId, status: 'active' })
      .withGraphFetched('organization');

    return memberships
      .filter((m) => m.organization)
      .map((m) => ({
        ...m.organization!,
        role: m.role,
        membership_id: m.id,
      }));
  },

  async getMembership(userId: string, organizationId: string) {
    return OrganizationMember.query().findOne({
      user_id: userId,
      organization_id: organizationId,
      status: 'active',
    });
  },

  async ensureDefaultOrg(userId: string, email: string, fullName?: string | null) {
    const existing = await this.listForUser(userId);
    if (existing.length > 0) return existing[0];

    const name =
      fullName?.trim() ||
      `${email.split('@')[0]}'s organization`;
    const created = await this.createForUser(userId, name);
    return { ...created.organization, role: 'owner' as const, membership_id: created.member.id };
  },
};
