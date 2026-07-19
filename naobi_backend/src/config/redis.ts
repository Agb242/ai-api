import Redis from 'ioredis';
import { config } from './server';

export const redisClient = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password || undefined,
  db: config.redis.db,
  retryStrategy: (times: number) => Math.min(times * 50, 2000),
  maxRetriesPerRequest: null, // required by BullMQ
  enableReadyCheck: true,
  lazyConnect: false,
});

redisClient.on('connect', () => {
  console.log('Redis connected');
});

redisClient.on('error', (err: Error) => {
  console.error('Redis error:', err.message);
});

export default redisClient;
