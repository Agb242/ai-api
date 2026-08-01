import { Context } from 'koa';
import { momoService } from '../services/momo.service';
import { litellmSyncService } from '../services/litellm-sync.service';
import { litellmAdmin } from '../services/litellm-admin.service';
import { MomoTransaction } from '../models/MomoTransaction';
import { t } from '../i18n/messages';
import { config } from '../config/server';
import { encryptionService } from '../services/encryption.service';
import logger from '../config/logger';

function ok(ctx: Context, data: unknown, status = 200) {
  ctx.status = status;
  ctx.body = { success: true, data };
}

function fail(ctx: Context, code: string, status: number, vars?: Record<string, string>) {
  const locale = ctx.state.locale || 'fr';
  ctx.status = status;
  ctx.body = { success: false, error: { message: t(locale, code, vars), code } };
}

export const billingController = {
  async listPacks(ctx: Context) {
    const packs = await momoService.listPacks();
    ok(
      ctx,
      packs.map((p) => ({
        id: p.slug,
        slug: p.slug,
        name: p.name,
        tagline: p.tagline,
        price: p.price_xof,
        price_xof: p.price_xof,
        currency: p.currency,
        models: p.models,
        model_labels: p.model_labels,
        max_budget: Number(p.max_budget_usd),
        duration: p.duration,
        rpm_limit: p.rpm_limit,
        tpm_limit: p.tpm_limit,
        advantages: p.advantages,
        limits: p.limits,
      })),
    );
  },

  async initiate(ctx: Context) {
    const body = (ctx.request.body || {}) as {
      pack_id?: string;
      pack_slug?: string;
      phone?: string;
      pseudo?: string;
      operator?: string;
      country?: string;
    };
    const packSlug = body.pack_slug || body.pack_id;
    if (!packSlug || !body.phone?.trim() || !body.pseudo?.trim()) {
      return fail(ctx, 'MISSING_FIELDS', 400);
    }

    try {
      const result = await momoService.initiate({
        packSlug,
        phone: body.phone.trim(),
        pseudo: body.pseudo.trim(),
        operator: body.operator,
        country: body.country,
        userId: ctx.state.user?.id,
        organizationId: ctx.state.orgId,
        hostBaseUrl: config.domain,
      });
      ok(ctx, result, 201);
    } catch (err: any) {
      const code = err.code || 'COLLECTES_ERROR';
      logger.error('MoMo initiate failed', { err: err.message, code });
      fail(ctx, code === 'PACK_INVALID' ? 'PACK_INVALID' : 'COLLECTES_ERROR', code === 'PACK_INVALID' ? 400 : 502);
    }
  },

  async status(ctx: Context) {
    const ref = ctx.params.ref as string;
    if (!ref) return fail(ctx, 'MISSING_FIELDS', 400);
    const data = await momoService.status(ref);
    if (!data) return fail(ctx, 'NOT_FOUND', 404);
    ok(ctx, data);
  },

  async claim(ctx: Context) {
    const body = (ctx.request.body || {}) as { key?: string; name?: string };
    if (!body.key?.trim()) return fail(ctx, 'MISSING_FIELDS', 400);
    if (!ctx.state.user || !ctx.state.orgId) return fail(ctx, 'ORG_REQUIRED', 400);

    try {
      const record = await momoService.claim({
        rawKey: body.key.trim(),
        userId: ctx.state.user.id,
        organizationId: ctx.state.orgId,
        name: body.name,
      });
      ok(ctx, {
        id: record.id,
        name: record.name,
        key_prefix: record.key_prefix,
        message: t(ctx.state.locale || 'fr', 'KEY_CLAIMED'),
      });
    } catch (err: any) {
      const map: Record<string, number> = {
        KEY_UNKNOWN: 404,
        KEY_ALREADY_CLAIMED: 409,
      };
      fail(ctx, err.code || 'KEY_UNKNOWN', map[err.code] || 400);
    }
  },

  async history(ctx: Context) {
    if (!ctx.state.orgId) return fail(ctx, 'ORG_REQUIRED', 400);
    const rows = await MomoTransaction.query()
      .where((qb) => {
        qb.where({ organization_id: ctx.state.orgId }).orWhere({ user_id: ctx.state.user!.id });
      })
      .withGraphFetched('pack')
      .orderBy('created_at', 'desc')
      .limit(50);
    ok(
      ctx,
      rows.map((tx) => ({
        id: tx.id,
        external_reference: tx.external_reference,
        status: tx.status,
        phone: tx.phone,
        pseudo: tx.pseudo,
        pack_name: (tx as any).pack?.name,
        claimed: Boolean(tx.claimed_at),
        created_at: tx.created_at,
      })),
    );
  },

  async webhook(ctx: Context) {
    const secret = config.momo.webhookSecret;
    if (!secret) {
      ctx.status = 503;
      ctx.body = { error: { message: 'Webhook secret not configured', code: 'MOMO_NOT_CONFIGURED' } };
      return;
    }

    const signature =
      ctx.get('X-Collectes-Signature') ||
      ctx.get('X-Signature') ||
      ctx.get('X-Webhook-Signature') ||
      '';

    // Prefer raw body when middleware captured it; else stable JSON stringify.
    const reqAny = ctx.request as any;
    const rawBody: string =
      (typeof reqAny.rawBody === 'string' && reqAny.rawBody) ||
      (typeof reqAny.body?.[Symbol.for('unparsedBody')] === 'string' &&
        reqAny.body[Symbol.for('unparsedBody')]) ||
      JSON.stringify(ctx.request.body || {});

    const valid = encryptionService.verifyWebhookSignature(rawBody, signature, secret);

    const auth = ctx.get('Authorization') || '';
    const bearerToken = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
    const bearerOk = encryptionService.equalStrings(bearerToken, secret);
    const headerSecret = ctx.get('X-Secret-Key') || '';
    const headerOk = encryptionService.equalStrings(headerSecret, secret);

    if (!valid && !bearerOk && !headerOk) {
      ctx.status = 401;
      ctx.body = { error: { message: 'Invalid webhook signature', code: 'UNAUTHORIZED' } };
      return;
    }

    try {
      await momoService.handleWebhook(ctx.request.body);
      ctx.status = 200;
      ctx.body = { received: true };
    } catch (err: any) {
      logger.error('MoMo webhook error', { err: err.message });
      ctx.status = 500;
      ctx.body = { received: false };
    }
  },

  async litellmUsage(ctx: Context) {
    const body = (ctx.request.body || {}) as { key?: string };
    if (!body.key?.trim()) return fail(ctx, 'MISSING_FIELDS', 400);
    try {
      const usage = await litellmSyncService.usageForKey(body.key.trim());
      ok(ctx, usage);
    } catch (err: any) {
      fail(ctx, 'PROVIDER_ERROR', 502);
    }
  },

  async litellmHealth(ctx: Context) {
    const healthy = await litellmAdmin.health();
    ok(ctx, { litellm_healthy: healthy, configured: litellmAdmin.configured() });
  },

  async liveModels(ctx: Context) {
    const data = await litellmSyncService.liveModels();
    ok(ctx, data);
  },
};
