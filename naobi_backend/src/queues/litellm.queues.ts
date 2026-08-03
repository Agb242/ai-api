import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { redisClient } from '../config/redis';
import { config } from '../config/server';
import { litellmAdmin } from '../services/litellm-admin.service';
import { keyAnalyticsService } from '../services/key-analytics.service';
import { ApiKey } from '../models/ApiKey';
import { OTPCode } from '../models/OTPCode';
import { Session } from '../models/Session';
import logger from '../config/logger';

const MODELS_CACHE_KEY = 'nexusia:litellm:models';
/** BullMQ forbids `:` in queue names — use hyphens */
const QUEUE_MODELS = 'nexusia-litellm-models';
const QUEUE_SPEND = 'nexusia-litellm-spend';
const QUEUE_KEY_ANALYTICS = 'nexusia-key-analytics';
const QUEUE_CLEANUP = 'nexusia-cleanup';

function connection(): ConnectionOptions {
  return {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password || undefined,
    db: config.redis.db,
    maxRetriesPerRequest: null,
  };
}

export const litellmQueues = {
  models: null as Queue | null,
  spend: null as Queue | null,
  keyAnalytics: null as Queue | null,
  cleanup: null as Queue | null,
};

const workers: Worker[] = [];

async function syncModelsJob() {
  if (!litellmAdmin.configured()) {
    throw new Error('LITELLM_NOT_CONFIGURED');
  }
  const healthy = await litellmAdmin.health();
  if (!healthy) throw new Error('LITELLM_UNAVAILABLE');

  const data = await litellmAdmin.listModels();
  await redisClient.set(MODELS_CACHE_KEY, JSON.stringify(data), 'EX', 120);
  logger.info('LiteLLM models synced', {
    count: Array.isArray((data as any)?.data) ? (data as any).data.length : 0,
  });
  return data;
}

async function syncSpendJob() {
  if (!litellmAdmin.configured()) return { synced: 0 };

  const keys = await ApiKey.query()
    .where({ status: 'active' })
    .whereNotNull('litellm_user_id')
    .limit(200);

  let synced = 0;
  const spendByOrg = new Map<string, number>();

  for (const key of keys) {
    try {
      if (!key.litellm_user_id) continue;
      const row = await litellmAdmin.resolveKeyRecord({
        litellmUserId: key.litellm_user_id,
        litellmKeyId: key.litellm_key_id,
      });
      const spend = Number(
        row?.spend ??
          (await litellmAdmin.userInfo(key.litellm_user_id).then((info: any) =>
            info?.spend ?? info?.user_info?.spend ?? 0,
          )),
      );
      await key.$query().patch({
        litellm_spend: spend,
        litellm_synced_at: new Date().toISOString(),
      } as any);
      spendByOrg.set(
        key.organization_id,
        (spendByOrg.get(key.organization_id) || 0) + spend,
      );
      synced += 1;
    } catch (err) {
      logger.warn('Spend sync failed for key', { id: key.id, err });
    }
  }

  try {
    const { budgetService } = await import('../services/budget.service');
    for (const [orgId, total] of spendByOrg) {
      await budgetService.syncConsumedFromKeys(orgId, total);
    }
  } catch (err) {
    logger.warn('Org budget sync failed', { err });
  }

  return { synced };
}

async function syncKeyAnalyticsJob() {
  if (!litellmAdmin.configured()) return { synced: 0 };
  return keyAnalyticsService.syncSnapshots(40);
}

async function cleanupJob() {
  const now = new Date().toISOString();
  const otpDeleted = await OTPCode.query()
    .where('expires_at', '<', now)
    .orWhere({ used: true })
    .delete();
  const sessionsDeleted = await Session.query().where('expires_at', '<', now).delete();
  let auditDeleted = 0;
  try {
    const { auditService } = await import('../services/audit.service');
    const purged = await auditService.purgeExpired();
    auditDeleted = purged.deleted;
  } catch {
    /* table may not exist yet */
  }
  return { otpDeleted, sessionsDeleted, auditDeleted };
}

export async function getCachedModels(): Promise<any | null> {
  const raw = await redisClient.get(MODELS_CACHE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export const bullmqBootstrap = {
  async start() {
    const conn = connection();

    litellmQueues.models = new Queue(QUEUE_MODELS, { connection: conn });
    litellmQueues.spend = new Queue(QUEUE_SPEND, { connection: conn });
    litellmQueues.keyAnalytics = new Queue(QUEUE_KEY_ANALYTICS, { connection: conn });
    litellmQueues.cleanup = new Queue(QUEUE_CLEANUP, { connection: conn });

    workers.push(
      new Worker(QUEUE_MODELS, async () => syncModelsJob(), {
        connection: conn,
        concurrency: 1,
      }),
      new Worker(QUEUE_SPEND, async () => syncSpendJob(), {
        connection: conn,
        concurrency: 1,
      }),
      new Worker(QUEUE_KEY_ANALYTICS, async () => syncKeyAnalyticsJob(), {
        connection: conn,
        concurrency: 1,
      }),
      new Worker(QUEUE_CLEANUP, async () => cleanupJob(), {
        connection: conn,
        concurrency: 1,
      }),
    );

    workers.forEach((w) => {
      w.on('failed', (job, err) => {
        logger.warn('BullMQ job failed', { queue: w.name, jobId: job?.id, err: err.message });
      });
    });

    // Repeatable jobs
    await litellmQueues.models.add(
      'sync-models',
      {},
      { repeat: { every: 60_000 }, removeOnComplete: 20, removeOnFail: 50 },
    );
    await litellmQueues.spend.add(
      'sync-spend',
      {},
      { repeat: { every: 60_000 }, removeOnComplete: 20, removeOnFail: 50 },
    );
    await litellmQueues.keyAnalytics.add(
      'sync-key-analytics',
      {},
      { repeat: { every: 10 * 60_000 }, removeOnComplete: 10, removeOnFail: 30 },
    );
    await litellmQueues.cleanup.add(
      'cleanup',
      {},
      { repeat: { every: 3_600_000 }, removeOnComplete: 5, removeOnFail: 20 },
    );

    // Immediate first sync
    await litellmQueues.models.add('sync-models-now', {}, { removeOnComplete: true });
    await litellmQueues.spend.add('sync-spend-now', {}, { removeOnComplete: true });
    await litellmQueues.keyAnalytics.add('sync-key-analytics-now', {}, { removeOnComplete: true });

    logger.info('BullMQ workers started', {
      queues: [QUEUE_MODELS, QUEUE_SPEND, QUEUE_KEY_ANALYTICS, QUEUE_CLEANUP],
    });
  },

  async stop() {
    await Promise.all(workers.map((w) => w.close()));
    await Promise.all(
      [
        litellmQueues.models,
        litellmQueues.spend,
        litellmQueues.keyAnalytics,
        litellmQueues.cleanup,
      ]
        .filter(Boolean)
        .map((q) => q!.close()),
    );
  },
};
