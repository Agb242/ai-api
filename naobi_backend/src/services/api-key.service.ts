import crypto from 'crypto';
import { transaction } from 'objection';
import { ApiKey, ApiKeyStatus } from '../models/ApiKey';
import { RequestLog } from '../models/RequestLog';
import { knex } from '../config/database';
import { litellmAdmin, hashApiKey } from './litellm-admin.service';
import { encryptionService } from './encryption.service';
import { litellmTeamService, litellmUserIdForMember } from './litellm-team.service';
import logger from '../config/logger';

function publicKeyFields(k: ApiKey) {
  return {
    id: k.id,
    name: k.name,
    description: k.description ?? null,
    key_prefix: k.key_prefix,
    scope: k.scope,
    budget_max: k.budget_max,
    budget_consumed: k.budget_consumed,
    rpm_limit: k.rpm_limit ?? null,
    tpm_limit: k.tpm_limit ?? null,
    models_allowlist: k.models_allowlist ?? null,
    expires_at: k.expires_at,
    status: k.status,
    last_used_at: k.last_used_at,
    litellm_spend: (k as any).litellm_spend,
    litellm_synced_at: (k as any).litellm_synced_at,
    created_by: k.created_by,
    organization_id: k.organization_id,
    created_at: k.created_at,
    updated_at: k.updated_at,
  };
}

export const apiKeyService = {
  publicKeyFields,

  /**
   * Create an API key via LiteLLM Proxy, then mirror metadata locally for org binding.
   * The plaintext key is returned once and never stored.
   */
  async create(params: {
    organizationId: string;
    userId: string;
    name: string;
    description?: string | null;
    scope?: string;
    budgetMax?: number | null;
    expiresAt?: Date | null;
    models?: string[];
    rpmLimit?: number | null;
    tpmLimit?: number | null;
  }) {
    await litellmAdmin.assertHealthy();

    const teamId = await litellmTeamService.ensureTeamByOrgId(params.organizationId);
    const litellmUserId = litellmUserIdForMember(params.organizationId, params.userId);
    await litellmAdmin.ensureUser({
      userId: litellmUserId,
      userAlias: params.name,
      userEmail: `${litellmUserId}@nexusai.local`,
    });

    const generated = await litellmAdmin.generateKey({
      userId: litellmUserId,
      keyAlias: `${params.name}-${crypto.randomBytes(3).toString('hex')}`.slice(0, 64),
      models: params.models,
      maxBudget: params.budgetMax ?? null,
      duration: params.expiresAt ? undefined : '365d',
      teamId,
      rpmLimit: params.rpmLimit,
      tpmLimit: params.tpmLimit,
      metadata: {
        organization_id: params.organizationId,
        created_by: params.userId,
        name: params.name,
      },
    });

    const raw = generated.key;
    const key_hash = hashApiKey(raw);
    const key_prefix = raw.slice(0, 12);

    const record = await ApiKey.query().insert({
      organization_id: params.organizationId,
      created_by: params.userId,
      name: params.name,
      description: params.description?.trim() || null,
      key_prefix,
      key_hash,
      scope: params.scope || 'organization',
      budget_max: params.budgetMax ?? null,
      budget_consumed: 0,
      expires_at: params.expiresAt ?? generated.expires ?? null,
      status: 'active',
      litellm_key_id: generated.token_id || generated.key_name || null,
      litellm_user_id: litellmUserId,
      litellm_spend: 0,
      litellm_key_encrypted: encryptionService.encryptApiKey(raw),
      rpm_limit: params.rpmLimit ?? null,
      tpm_limit: params.tpmLimit ?? null,
      models_allowlist: params.models ?? null,
    } as any);

    return { record, plaintext: raw };
  },

  /** Decrypt virtual key for playground proxy — never expose via HTTP responses. */
  resolveVirtualKeyPlaintext(key: ApiKey): string | null {
    if (!key.litellm_key_encrypted) return null;
    try {
      return encryptionService.decryptApiKey(key.litellm_key_encrypted);
    } catch (err) {
      logger.warn('Failed to decrypt api key ciphertext', { id: key.id, err });
      return null;
    }
  },

  async list(organizationId: string) {
    return ApiKey.query()
      .where({ organization_id: organizationId })
      .whereNot({ status: 'revoked' })
      .orderBy('created_at', 'desc');
  },

  async getById(organizationId: string, keyId: string) {
    return ApiKey.query().findOne({ id: keyId, organization_id: organizationId });
  },

  async update(
    organizationId: string,
    keyId: string,
    patch: {
      name?: string;
      description?: string | null;
      budgetMax?: number | null;
      rpmLimit?: number | null;
      tpmLimit?: number | null;
      models?: string[] | null;
    },
  ) {
    const key = await this.getById(organizationId, keyId);
    if (!key) return null;
    if (key.status === 'revoked') return key;

    const data: Partial<ApiKey> = {};
    if (typeof patch.name === 'string' && patch.name.trim()) {
      data.name = patch.name.trim();
    }
    if (patch.description !== undefined) {
      data.description = patch.description?.trim() || null;
    }
    if (patch.budgetMax !== undefined) {
      data.budget_max = patch.budgetMax;
    }
    if (patch.rpmLimit !== undefined) {
      data.rpm_limit = patch.rpmLimit;
    }
    if (patch.tpmLimit !== undefined) {
      data.tpm_limit = patch.tpmLimit;
    }
    if (patch.models !== undefined) {
      data.models_allowlist = patch.models;
    }

    const limitsChanged =
      patch.budgetMax !== undefined ||
      patch.rpmLimit !== undefined ||
      patch.tpmLimit !== undefined ||
      patch.models !== undefined;

    if (limitsChanged) {
      const raw = this.resolveVirtualKeyPlaintext(key);
      if (raw) {
        try {
          await litellmAdmin.updateKey({
            key: raw,
            maxBudget: patch.budgetMax !== undefined ? patch.budgetMax : undefined,
            rpmLimit: patch.rpmLimit !== undefined ? patch.rpmLimit : undefined,
            tpmLimit: patch.tpmLimit !== undefined ? patch.tpmLimit : undefined,
            models: patch.models !== undefined ? patch.models : undefined,
          });
        } catch (err) {
          logger.warn('LiteLLM key/update failed', { id: key.id, err });
          throw Object.assign(new Error('PROVIDER_ERROR'), { code: 'PROVIDER_ERROR' });
        }
      }
    }

    if (Object.keys(data).length === 0) return key;
    return key.$query().patchAndFetch(data as any);
  },

  /**
   * Rotate virtual key: regenerate (or delete+generate), re-hash, re-encrypt.
   * Returns plaintext once.
   */
  async rotate(organizationId: string, keyId: string) {
    const key = await this.getById(organizationId, keyId);
    if (!key) return null;
    if (key.status !== 'active' && key.status !== 'disabled') return null;

    await litellmAdmin.assertHealthy();
    const oldRaw = this.resolveVirtualKeyPlaintext(key);
    let newRaw: string | null = null;
    let tokenId = key.litellm_key_id;

    if (oldRaw) {
      const regenerated = await litellmAdmin.regenerateKey(oldRaw);
      if (regenerated?.key) {
        newRaw = regenerated.key;
        tokenId = regenerated.token_id || regenerated.key_name || tokenId;
      }
    }

    if (!newRaw) {
      // Fallback: delete old + generate new under same user/team
      if (oldRaw) {
        try {
          await litellmAdmin.deleteKey(oldRaw);
        } catch {
          /* continue */
        }
      }
      const teamId = await litellmTeamService.ensureTeamByOrgId(organizationId);
      const litellmUserId =
        key.litellm_user_id || litellmUserIdForMember(organizationId, key.created_by);
      await litellmAdmin.ensureUser({
        userId: litellmUserId,
        userAlias: key.name,
        userEmail: `${litellmUserId}@nexusai.local`,
      });
      const generated = await litellmAdmin.generateKey({
        userId: litellmUserId,
        keyAlias: `${key.name}-rot-${crypto.randomBytes(2).toString('hex')}`.slice(0, 64),
        models: key.models_allowlist || undefined,
        maxBudget: key.budget_max != null ? Number(key.budget_max) : null,
        teamId,
        rpmLimit: key.rpm_limit,
        tpmLimit: key.tpm_limit,
        metadata: { organization_id: organizationId, rotated_from: key.id },
      });
      newRaw = generated.key;
      tokenId = generated.token_id || generated.key_name || null;
    }

    const updated = await key.$query().patchAndFetch({
      key_hash: hashApiKey(newRaw),
      key_prefix: newRaw.slice(0, 12),
      litellm_key_id: tokenId,
      litellm_key_encrypted: encryptionService.encryptApiKey(newRaw),
      status: 'active',
      budget_consumed: 0,
      litellm_spend: 0,
    } as any);

    return { record: updated, plaintext: newRaw };
  },

  async resetSpend(organizationId: string, keyId: string) {
    const key = await this.getById(organizationId, keyId);
    if (!key) return null;
    if (key.status === 'revoked') return key;

    const raw = this.resolveVirtualKeyPlaintext(key);
    if (raw) {
      try {
        await litellmAdmin.resetKeySpend(raw);
      } catch (err) {
        logger.warn('LiteLLM reset spend failed', { id: key.id, err });
      }
    }

    return key.$query().patchAndFetch({
      budget_consumed: 0,
      litellm_spend: 0,
    } as any);
  },

  async disable(organizationId: string, keyId: string) {
    const key = await this.getById(organizationId, keyId);
    if (!key) return null;
    if (key.status === 'revoked' || key.status === 'expired') return key;
    if (key.status === 'disabled') return key;

    const raw = this.resolveVirtualKeyPlaintext(key);
    if (raw) {
      try {
        await litellmAdmin.blockKey(raw);
      } catch (err) {
        logger.warn('LiteLLM blockKey failed — local disable proceeds', { id: key.id, err });
      }
    }

    return key.$query().patchAndFetch({ status: 'disabled' as ApiKeyStatus });
  },

  async enable(organizationId: string, keyId: string) {
    const key = await this.getById(organizationId, keyId);
    if (!key) return null;
    if (key.status === 'revoked' || key.status === 'expired') return key;
    if (key.status !== 'disabled') return key;

    const raw = this.resolveVirtualKeyPlaintext(key);
    if (raw) {
      try {
        await litellmAdmin.unblockKey(raw);
      } catch (err) {
        logger.warn('LiteLLM unblockKey failed — local enable proceeds', { id: key.id, err });
      }
    }

    return key.$query().patchAndFetch({ status: 'active' as ApiKeyStatus });
  },

  async revoke(organizationId: string, keyId: string) {
    const key = await ApiKey.query().findOne({ id: keyId, organization_id: organizationId });
    if (!key) return null;
    if (key.status === 'revoked') return key;

    if (key.litellm_key_id) {
      try {
        await litellmAdmin.deleteKeysByAlias([key.litellm_key_id]);
      } catch {
        /* local revoke still proceeds */
      }
    }

    return key.$query().patchAndFetch({ status: 'revoked' });
  },

  /** Authenticate any LiteLLM-issued key mirrored in api_keys (hash lookup). */
  async authenticate(rawKey: string): Promise<ApiKey | null> {
    if (!rawKey || rawKey.length < 8) return null;
    const key_hash = hashApiKey(rawKey);
    const key = await ApiKey.query().findOne({ key_hash });
    if (!key) return null;

    if (key.status === 'revoked' || key.status === 'disabled') return null;

    if (key.expires_at && new Date(key.expires_at) < new Date()) {
      if (key.status !== 'expired') {
        await key.$query().patch({ status: 'expired' });
      }
      return null;
    }

    if (key.status !== 'active') return null;

    await key.$query().patch({ last_used_at: new Date().toISOString() });
    return key;
  },

  async metrics(organizationId: string, keyId: string) {
    const key = await this.getById(organizationId, keyId);
    if (!key) return null;

    const base = RequestLog.query().where({ organization_id: organizationId, api_key_id: keyId });

    const [totals] = await base
      .clone()
      .select(
        knex.raw('count(*)::int as requests'),
        knex.raw('coalesce(sum(tokens_input),0)::int as tokens_input'),
        knex.raw('coalesce(sum(tokens_output),0)::int as tokens_output'),
        knex.raw('coalesce(sum(cost),0)::float as cost'),
        knex.raw('coalesce(avg(latency_ms),0)::float as avg_latency_ms'),
        knex.raw(
          "count(*) filter (where status in ('error','blocked'))::int as error_count",
        ),
      );

    const series = await RequestLog.query()
      .where({ organization_id: organizationId, api_key_id: keyId })
      .where('created_at', '>=', knex.raw("now() - interval '14 days'"))
      .select(
        knex.raw("date_trunc('day', created_at)::date as day"),
        knex.raw('count(*)::int as requests'),
        knex.raw('coalesce(sum(cost),0)::float as cost'),
        knex.raw('coalesce(sum(tokens_input + tokens_output),0)::int as tokens'),
      )
      .groupByRaw("date_trunc('day', created_at)::date")
      .orderByRaw('day asc');

    return {
      key: publicKeyFields(key),
      totals: {
        requests: Number((totals as any)?.requests || 0),
        tokens_input: Number((totals as any)?.tokens_input || 0),
        tokens_output: Number((totals as any)?.tokens_output || 0),
        cost: Number((totals as any)?.cost || 0),
        avg_latency_ms: Number((totals as any)?.avg_latency_ms || 0),
        error_count: Number((totals as any)?.error_count || 0),
        litellm_spend: Number((key as any).litellm_spend || 0),
      },
      series: (series as any[]).map((r) => ({
        day: r.day,
        requests: Number(r.requests || 0),
        cost: Number(r.cost || 0),
        tokens: Number(r.tokens || 0),
      })),
    };
  },

  async logs(
    organizationId: string,
    keyId: string,
    opts: { page?: number; limit?: number; status?: string },
  ) {
    const key = await this.getById(organizationId, keyId);
    if (!key) return null;

    const page = Math.max(1, opts.page || 1);
    const limit = Math.min(100, Math.max(1, opts.limit || 50));
    const offset = (page - 1) * limit;

    let q = RequestLog.query().where({
      organization_id: organizationId,
      api_key_id: keyId,
    });

    if (opts.status) {
      q = q.where({ status: opts.status });
    }

    const countRow = (await q
      .clone()
      .clearOrder()
      .count('* as count')
      .first()) as unknown as { count: string | number };
    const total = Number(countRow?.count || 0);
    const rows = await q.clone().orderBy('created_at', 'desc').offset(offset).limit(limit);

    return {
      items: rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
    };
  },

  async addBudgetConsumed(keyId: string, amount: number) {
    await transaction(knex, async (trx) => {
      const key = await ApiKey.query(trx).findById(keyId).forUpdate();
      if (!key) return;
      const next = Number(key.budget_consumed) + amount;
      await key.$query(trx).patch({ budget_consumed: next });
    });
  },

  isBudgetExceeded(key: ApiKey): boolean {
    if (key.budget_max == null) return false;
    return Number(key.budget_consumed) >= Number(key.budget_max);
  },
};
