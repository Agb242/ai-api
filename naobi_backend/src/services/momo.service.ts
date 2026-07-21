import crypto from 'crypto';
import { Pack } from '../models/Pack';
import { MomoTransaction } from '../models/MomoTransaction';
import { ApiKey } from '../models/ApiKey';
import { config } from '../config/server';
import { litellmAdmin, hashApiKey } from './litellm-admin.service';
import { encryptionService } from './encryption.service';
import { walletService } from './wallet.service';
import logger from '../config/logger';

function genRef(prefix: string) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
}

export const momoService = {
  async listPacks() {
    return Pack.query().where({ active: true }).orderBy('price_xof', 'asc');
  },

  async initiate(params: {
    packSlug: string;
    phone: string;
    pseudo: string;
    operator?: string;
    country?: string;
    userId?: string;
    organizationId?: string;
    hostBaseUrl?: string;
  }) {
    const pack = await Pack.query().findOne({ slug: params.packSlug, active: true });
    if (!pack) throw Object.assign(new Error('PACK_INVALID'), { code: 'PACK_INVALID' });

    const externalRef = genRef(`PACK-${pack.slug}`);
    const tx = await MomoTransaction.query().insert({
      external_reference: externalRef,
      pack_id: pack.id,
      phone: params.phone,
      pseudo: params.pseudo.trim(),
      operator: params.operator || 'mtn',
      country: params.country || 'BJ',
      status: 'pending',
      simulated: config.momo.mode === 'simulate',
      user_id: params.userId || null,
      organization_id: params.organizationId || null,
      metadata: {},
    });

    if (config.momo.mode === 'simulate') {
      setTimeout(() => {
        this.approveAndProvision(externalRef).catch((err) =>
          logger.error('Simulate approve failed', { err, externalRef }),
        );
      }, config.momo.simulateApproveMs);

      return {
        success: true,
        mode: 'simulate' as const,
        external_reference: externalRef,
        status: 'pending',
        provider_link: null,
        transaction_id: tx.id,
      };
    }

    if (!config.momo.publicKey || !config.momo.secretKey) {
      throw Object.assign(new Error('MOMO_NOT_CONFIGURED'), { code: 'MOMO_NOT_CONFIGURED' });
    }

    const callbackUrl = `${params.hostBaseUrl || config.domain}/api/v1/billing/webhook/collectes`;
    const response = await fetch(`${config.momo.apiUrl}/collections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Public-Key': config.momo.publicKey,
        'X-Secret-Key': config.momo.secretKey,
      },
      body: JSON.stringify({
        amount: pack.price_xof,
        currency: pack.currency,
        phone: params.phone,
        operator: params.operator || 'mtn',
        country: params.country || 'BJ',
        external_reference: externalRef,
        callback_url: callbackUrl,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as any;
    if (!response.ok) {
      await tx.$query().patch({ status: 'failed', error: data.message || 'Collectes error' });
      throw Object.assign(new Error(data.message || 'COLLECTES_ERROR'), { code: 'COLLECTES_ERROR' });
    }

    await tx.$query().patch({
      provider_transaction_id: data.data?.transaction_id || null,
      status: data.data?.status || 'pending',
    });

    return {
      success: true,
      mode: 'live' as const,
      external_reference: externalRef,
      status: data.data?.status || 'pending',
      provider_link: data.data?.provider_link || null,
      transaction_id: data.data?.transaction_id,
    };
  },

  async approveAndProvision(externalRef: string) {
    const tx = await MomoTransaction.query().findOne({ external_reference: externalRef });
    if (!tx || tx.status === 'approved') return tx;

    const pack = tx.pack_id ? await Pack.query().findById(tx.pack_id) : null;
    if (!pack) {
      await tx.$query().patch({ status: 'failed', error: 'Pack missing' });
      return null;
    }

    try {
      let models: string[] = Array.isArray(pack.models)
        ? pack.models
        : typeof pack.models === 'string'
          ? JSON.parse(pack.models)
          : [];

      if (pack.litellm_access_group_id) {
        const group = await litellmAdmin.accessGroupGet(pack.litellm_access_group_id);
        const fromGroup =
          (Array.isArray((group as any)?.models) && (group as any).models) ||
          (Array.isArray((group as any)?.model_names) && (group as any).model_names) ||
          (Array.isArray((group as any)?.data?.models) && (group as any).data.models) ||
          null;
        if (fromGroup?.length) {
          models = fromGroup.map(String);
        }
      }

      const prov = await litellmAdmin.provisionUserAndKey({
        pseudo: tx.pseudo || 'user',
        phone: tx.phone,
        externalRef,
        models,
        maxBudget: Number(pack.max_budget_usd),
        duration: pack.duration,
        rpmLimit: pack.rpm_limit || undefined,
        tpmLimit: pack.tpm_limit || undefined,
        packId: pack.slug,
      });

      const keyHash = hashApiKey(prov.key);
      await tx.$query().patch({
        status: 'approved',
        litellm_user_id: prov.user_id,
        litellm_key_hash: keyHash,
        litellm_key_prefix: prov.key.slice(0, 12),
        litellm_key_encrypted: encryptionService.encryptApiKey(prov.key),
        error: null,
        metadata: { litellm_key_id: prov.litellm_key_id },
      });

      // Credit org wallet with pack budget converted roughly (1 USD ≈ credit unit for MVP)
      if (tx.organization_id) {
        try {
          await walletService.topUp({
            organizationId: tx.organization_id,
            amount: Number(pack.max_budget_usd),
            paymentMethod: 'momo',
            confirm: true,
            reference: externalRef,
          });
        } catch (err) {
          logger.warn('Wallet credit after MoMo failed', { err });
        }
      }

      return MomoTransaction.query().findOne({ external_reference: externalRef });
    } catch (err: any) {
      await tx.$query().patch({ status: 'rejected', error: err.message });
      throw err;
    }
  },

  async status(externalRef: string) {
    let tx = await MomoTransaction.query()
      .findOne({ external_reference: externalRef })
      .withGraphFetched('pack');

    if (!tx) return null;

    if (tx.status === 'approved') {
      return this.publicStatus(tx, true);
    }

    if (tx.simulated) {
      return this.publicStatus(tx, false);
    }

    // Live: poll Collectes
    try {
      const response = await fetch(`${config.momo.apiUrl}/collections/${externalRef}`, {
        headers: {
          'X-Public-Key': config.momo.publicKey,
          'X-Secret-Key': config.momo.secretKey,
        },
      });
      const data = (await response.json().catch(() => ({}))) as any;
      const newStatus = data.data?.status || tx.status;
      if (newStatus === 'approved' && tx.status !== 'approved') {
        tx = (await this.approveAndProvision(externalRef)) as MomoTransaction;
      } else if (newStatus !== tx.status) {
        await tx.$query().patch({ status: newStatus });
        tx.status = newStatus;
      }
    } catch (err) {
      logger.warn('Collectes status poll failed', { err });
    }

    return this.publicStatus(tx!, tx!.status === 'approved');
  },

  publicStatus(tx: MomoTransaction, includeKey: boolean) {
    const pack = (tx as any).pack as Pack | undefined;
    let key: string | null = null;
    if (includeKey && tx.litellm_key_encrypted && !tx.claimed_at) {
      try {
        key = encryptionService.decryptApiKey(tx.litellm_key_encrypted);
      } catch {
        key = null;
      }
    }
    return {
      status: tx.status,
      external_reference: tx.external_reference,
      key,
      key_prefix: tx.litellm_key_prefix,
      user_id: tx.litellm_user_id,
      user_alias: tx.pseudo,
      pack_name: pack?.name,
      models: pack?.models || [],
      model_labels: pack?.model_labels || {},
      max_budget: pack ? Number(pack.max_budget_usd) : 0,
      duration: pack?.duration,
      claimed: Boolean(tx.claimed_at),
      created_at: tx.created_at,
    };
  },

  /** Link purchased LiteLLM key to org as ApiKey row (reveal already happened). */
  async claim(params: {
    rawKey: string;
    userId: string;
    organizationId: string;
    name?: string;
  }) {
    const keyHash = hashApiKey(params.rawKey);
    const tx = await MomoTransaction.query().findOne({ litellm_key_hash: keyHash });
    if (!tx || tx.status !== 'approved') {
      throw Object.assign(new Error('KEY_UNKNOWN'), { code: 'KEY_UNKNOWN' });
    }
    if (tx.claimed_at && tx.api_key_id) {
      throw Object.assign(new Error('KEY_ALREADY_CLAIMED'), { code: 'KEY_ALREADY_CLAIMED' });
    }

    const existing = await ApiKey.query().findOne({ key_hash: keyHash });
    if (existing) {
      await tx.$query().patch({
        claimed_at: new Date().toISOString(),
        api_key_id: existing.id,
        user_id: params.userId,
        organization_id: params.organizationId,
        litellm_key_encrypted: null,
      });
      return existing;
    }

    const record = await ApiKey.query().insert({
      organization_id: params.organizationId,
      created_by: params.userId,
      name: params.name || `MoMo ${tx.pseudo || 'pack'}`,
      key_prefix: params.rawKey.slice(0, 12),
      key_hash: keyHash,
      scope: 'organization',
      budget_max: null,
      budget_consumed: 0,
      status: 'active',
      litellm_user_id: tx.litellm_user_id,
      litellm_key_id: (tx.metadata as any)?.litellm_key_id || null,
      litellm_spend: 0,
    } as any);

    await tx.$query().patch({
      claimed_at: new Date().toISOString(),
      api_key_id: record.id,
      user_id: params.userId,
      organization_id: params.organizationId,
      litellm_key_encrypted: null,
    });

    return record;
  },

  async handleWebhook(body: any) {
    const ref = body?.external_reference || body?.data?.external_reference;
    const status = body?.status || body?.data?.status;
    if (!ref) return;
    if (status === 'approved') {
      await this.approveAndProvision(ref);
    } else if (status === 'rejected' || status === 'failed') {
      await MomoTransaction.query()
        .findOne({ external_reference: ref })
        .patch({ status });
    }
  },
};
