import type { Knex } from 'knex';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

function connection(): Knex.StaticConnectionConfig {
  const host = process.env.DB_HOST;
  const database = process.env.DB_NAME;
  const user = process.env.DB_USER;
  if (!host || !database || !user) {
    throw new Error('DB_HOST, DB_NAME and DB_USER are required in .env');
  }
  return {
    host,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database,
    user,
    password: process.env.DB_PASS || '',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  };
}

const config: { [key: string]: Knex.Config } = {
  development: {
    client: 'postgresql',
    connection: connection(),
    migrations: {
      tableName: 'knex_migrations',
      directory: path.join(__dirname, 'migrations'),
      extension: 'ts',
    },
    seeds: {
      directory: path.join(__dirname, 'seeds'),
      extension: 'ts',
    },
  },
  production: {
    client: 'postgresql',
    connection: connection(),
    migrations: {
      tableName: 'knex_migrations',
      directory: path.join(__dirname, 'migrations'),
      extension: 'ts',
    },
    seeds: {
      directory: path.join(__dirname, 'seeds'),
      extension: 'ts',
    },
  },
};

export default config;
