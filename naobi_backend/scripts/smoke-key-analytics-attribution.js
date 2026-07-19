/**
 * Smoke: key analytics attribution — gateway vs playground sources.
 * Usage: node scripts/smoke-key-analytics-attribution.js
 */
require('dotenv').config();
require('ts-node/register/transpile-only');

const knex = require('knex')({
  client: 'pg',
  connection: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
  },
});

async function run() {
  const { keyAnalyticsService } = require('../src/services/key-analytics.service');

  const key = await knex('api_keys')
    .whereNotNull('litellm_key_id')
    .orderBy('created_at', 'desc')
    .first();

  if (!key) {
    console.log('SKIP: no api_keys with litellm_key_id');
    await knex.destroy();
    process.exit(0);
  }

  console.log('key', {
    id: key.id,
    prefix: key.key_prefix,
    litellm_key_id: String(key.litellm_key_id).slice(0, 12),
  });

  const analytics = await keyAnalyticsService.analytics(key.organization_id, key.id);
  const usage = await keyAnalyticsService.usage(key.organization_id, key.id, 14);
  const models = await keyAnalyticsService.models(key.organization_id, key.id);
  const providers = await keyAnalyticsService.providers(key.organization_id, key.id);
  const logsAuto = await keyAnalyticsService.logs(key.organization_id, key.id, {
    source: 'auto',
    page: 1,
    limit: 10,
  });
  const logsGw = await keyAnalyticsService.logs(key.organization_id, key.id, {
    source: 'gateway',
    page: 1,
    limit: 10,
  });
  const errors = await keyAnalyticsService.errors(key.organization_id, key.id);

  const ov = analytics?.overview || {};
  const report = {
    sources: analytics?.sources,
    overview_keys: Object.keys(ov),
    usage: { points: usage?.series?.length || 0, source: usage?.source },
    models: { count: models?.items?.length || 0, source: models?.source },
    providers: { count: providers?.items?.length || 0, source: providers?.source },
    logs_auto: {
      count: logsAuto?.items?.length || 0,
      source: logsAuto?.source,
      item_sources: [...new Set((logsAuto?.items || []).map((i) => i.source))],
    },
    logs_gateway: {
      count: logsGw?.items?.length || 0,
      source: logsGw?.source,
      item_sources: [...new Set((logsGw?.items || []).map((i) => i.source))],
    },
    errors: { total: errors?.total || 0, source: errors?.source },
  };

  const fails = [];
  if (logsGw?.items?.length) {
    const bad = logsGw.items.filter((i) => i.source && i.source !== 'gateway');
    if (bad.length) fails.push('gateway logs mixed with non-gateway source');
  }
  if (logsAuto?.source === 'litellm' && logsAuto.items.some((i) => i.source === 'gateway')) {
    fails.push('auto litellm page mixed gateway items');
  }
  if (usage?.series?.some((p) => !p.day)) fails.push('usage point missing day');

  // No invented metric cards: overview must not contain NaN
  for (const [k, v] of Object.entries(ov)) {
    if (typeof v === 'number' && Number.isNaN(v)) fails.push(`NaN in overview.${k}`);
  }

  console.log(JSON.stringify(report, null, 2));
  if (fails.length) {
    console.error('FAIL', fails);
    await knex.destroy();
    process.exit(1);
  }
  console.log('OK smoke-key-analytics-attribution');
  try {
    const { redisClient } = require('../src/config/redis');
    await redisClient.quit();
  } catch (_) {
    /* ignore */
  }
  await knex.destroy();
  process.exit(0);
}

run().catch(async (e) => {
  console.error(e);
  await knex.destroy();
  process.exit(1);
});
