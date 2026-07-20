import app from './app';
import { config } from './config/server';
import { realtimeHub } from './services/realtime.service';
import { redisClient } from './config/redis';
import { knex } from './config/database';
import { bullmqBootstrap } from './queues/litellm.queues';
import { litellmAdmin } from './services/litellm-admin.service';

async function checkServices() {
  const services: Array<{ name: string; status: string; details: string }> = [];
  let allReady = true;

  try {
    await knex.raw('SELECT 1');
    services.push({
      name: 'PostgreSQL',
      status: 'OK',
      details: `Database: ${knex.client.connectionSettings.database}`,
    });
  } catch (err) {
    services.push({
      name: 'PostgreSQL',
      status: 'FAILED',
      details: err instanceof Error ? err.message : 'Unknown error',
    });
    allReady = false;
  }

  try {
    await redisClient.ping();
    services.push({
      name: 'Redis',
      status: 'OK',
      details: `Host: ${config.redis.host}:${config.redis.port}`,
    });
  } catch (err) {
    services.push({
      name: 'Redis',
      status: 'FAILED',
      details: err instanceof Error ? err.message : 'Required for BullMQ + circuit breaker',
    });
    allReady = false;
  }

  const litellmOk = litellmAdmin.configured() && (await litellmAdmin.health());
  services.push({
    name: 'LiteLLM',
    status: litellmOk ? 'OK' : litellmAdmin.configured() ? 'DOWN' : 'NOT_CONFIGURED',
    details: config.litellm.baseUrl || 'missing LITELLM_BASE_URL / LITELLM_MASTER_KEY',
  });
  if (!litellmAdmin.configured()) {
    console.warn('WARNING: LiteLLM not configured — inference and key provisioning will return 503');
  }

  return { services, allReady };
}

let bullmqStarted = false;

const server = app.listen(config.port, async () => {
  console.log(`noabi Gateway starting on :${config.port}`);
  console.log(`Environment: ${config.nodeEnv}`);
  console.log(`LiteLLM: ${config.litellm.baseUrl || '(not set)'}`);

  const { services, allReady } = await checkServices();
  console.log('Services:');
  services.forEach((s) => console.log(`  [${s.status}] ${s.name} — ${s.details}`));
  if (!allReady) console.log('Some critical services failed — check logs');

  try {
    const runWorkers =
      process.env.RUN_BULLMQ_WORKERS === 'true' ||
      (process.env.RUN_BULLMQ_WORKERS !== 'false' && config.nodeEnv !== 'production');

    if (runWorkers) {
      await bullmqBootstrap.start();
      bullmqStarted = true;
      console.log('BullMQ workers: models, spend, key analytics, cleanup (in-process)');
    } else {
      console.log(
        'BullMQ workers disabled in API process — run `npm run worker` (recommended in production)',
      );
    }
  } catch (err) {
    console.error('BullMQ failed to start', err);
  }

  realtimeHub.initialize(server);
  console.log(`MoMo mode: ${config.momo.mode}`);
  console.log(`Health: ${config.domain}/health`);
  console.log(`Docs:   ${config.domain}/api/docs`);
  console.log(`Gateway: POST /v1/chat/completions`);
});

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  if (bullmqStarted) await bullmqBootstrap.stop();
  realtimeHub.close();
  server.close(() => process.exit(0));
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default server;
