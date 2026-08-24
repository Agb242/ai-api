import { Organization } from '../models/Organization';
import { knex } from '../config/database';
import { litellmAdmin } from './litellm-admin.service';
import { auditService } from './audit.service';
import logger from '../config/logger';

/** Resolve allowed model ids for an org from MoMo pack claim or open catalog. */
export const catalogService = {
  async getAllowedModelsForOrg(organizationId: string): Promise<string[] | null> {
    // Active claimed MoMo pack with models → restrict catalogue
    const tx = await knex('momo_transactions')
      .where({ organization_id: organizationId })
      .whereNotNull('claimed_at')
      .orderBy('claimed_at', 'desc')
      .first();

    if (tx?.pack_id) {
      const pack = await knex('packs').where({ id: tx.pack_id }).first();
      const models = pack?.models;
      if (Array.isArray(models) && models.length > 0) {
        return models.map(String);
      }
      if (typeof models === 'string') {
        try {
          const parsed = JSON.parse(models);
          if (Array.isArray(parsed) && parsed.length) return parsed.map(String);
        } catch {
          /* ignore */
        }
      }
    }

    // No pack restriction
    return null;
  },

  filterModelList<T extends { id?: string; model_id?: string }>(
    models: T[],
    allowlist: string[] | null,
  ): T[] {
    if (!allowlist || allowlist.length === 0) return models;

    const normalize = (s: string) =>
      s
        .toLowerCase()
        .replace(/^[^/]+\//, '') // strip provider prefix
        .replace(/[^a-z0-9]+/g, '');

    const allowedNorm = allowlist.map((a) => ({ raw: a, norm: normalize(a) }));

    return models.filter((m) => {
      const id = String(m.id || m.model_id || '');
      if (!id) return false;
      const idNorm = normalize(id);
      return allowedNorm.some(
        ({ raw, norm }) =>
          id === raw ||
          id.includes(raw) ||
          raw.includes(id) ||
          (norm.length >= 4 && (idNorm.includes(norm) || norm.includes(idNorm))),
      );
    });
  },

  assertModelsAllowed(requested: string[] | null | undefined, allowlist: string[] | null) {
    if (!allowlist || !requested || requested.length === 0) return;
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .replace(/^[^/]+\//, '')
        .replace(/[^a-z0-9]+/g, '');
    const allowedNorm = allowlist.map((a) => ({ raw: a, norm: normalize(a) }));
    const bad = requested.filter((m) => {
      const idNorm = normalize(m);
      return !allowedNorm.some(
        ({ raw, norm }) =>
          m === raw ||
          m.includes(raw) ||
          raw.includes(m) ||
          (norm.length >= 4 && (idNorm.includes(norm) || norm.includes(idNorm))),
      );
    });
    if (bad.length) {
      throw Object.assign(new Error('MODEL_NOT_FOUND'), {
        code: 'MODEL_NOT_FOUND',
        models: bad,
      });
    }
  },
};

export const guardrailService = {
  async enableForOrg(params: {
    organizationId: string;
    actorUserId: string;
  }) {
    const org = await Organization.query().findById(params.organizationId);
    if (!org) return null;

    let guardrailId = org.litellm_guardrail_id;
    if (!guardrailId) {
      const registered = await litellmAdmin.registerGuardrail({
        guardrailName: `knotflow-org-${params.organizationId.slice(0, 8)}`,
        litellmParams: {
          guardrail: 'presidio',
          mode: 'pre_call',
        },
      });
      guardrailId =
        registered?.guardrail_id ||
        registered?.guardrail_name ||
        `knotflow-org-${params.organizationId.slice(0, 8)}`;
    }

    const updated = await org.$query().patchAndFetch({
      litellm_guardrail_id: guardrailId,
      enterprise_guardrail_enabled: true,
    } as any);

    await auditService.record({
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      action: 'guardrail.enable',
      resourceType: 'organization',
      resourceId: params.organizationId,
    });

    return updated;
  },

  async disableForOrg(params: { organizationId: string; actorUserId: string }) {
    const org = await Organization.query().findById(params.organizationId);
    if (!org) return null;
    const updated = await org.$query().patchAndFetch({
      enterprise_guardrail_enabled: false,
    } as any);
    await auditService.record({
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      action: 'guardrail.disable',
      resourceType: 'organization',
      resourceId: params.organizationId,
    });
    return updated;
  },

  async status(organizationId: string) {
    const org = await Organization.query().findById(organizationId);
    if (!org) return null;
    const remote = await litellmAdmin.listGuardrails();
    return {
      enabled: !!org.enterprise_guardrail_enabled,
      configured: Boolean(org.litellm_guardrail_id),
      remote_count: Array.isArray(remote) ? remote.length : null,
    };
  },

  /** Best-effort pre-call check; returns true if blocked. */
  async shouldBlock(organizationId: string, text: string): Promise<boolean> {
    const org = await Organization.query().findById(organizationId);
    if (!org?.enterprise_guardrail_enabled || !org.litellm_guardrail_id) return false;
    try {
      const result = await litellmAdmin.applyGuardrail({
        guardrailName: org.litellm_guardrail_id,
        text: text.slice(0, 8000),
      });
      return !!result?.blocked;
    } catch (err) {
      logger.warn('guardrail apply failed — pass through', { organizationId, err });
      return false;
    }
  },
};
