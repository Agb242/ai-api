import { config } from './config/server';
import { redisClient } from './config/redis';
import { knex } from './config/database';
import { bullmqBootstrap } from './queues/litellm.queues';

async function checkDeps() {
  await knex.raw('SELECT 1');
  await redisClient.ping();
}

async function main() {
  console.log(`noabi BullMQ worker (env=${config.nodeEnv})`);
  await checkDeps();
  await bullmqBootstrap.start();
  console.log('Workers: models sync, spend sync, key analytics, cleanup');
}

main().catch((err) => {
  console.error('Worker failed to start', err);
  process.exit(1);
});

async function shutdown(signal: string) {
  console.log(`${signal} received, stopping workers`);
  await bullmqBootstrap.stop();
  try {
    await redisClient.quit();
  } catch {
    /* ignore */
  }
  await knex.destroy();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
