import Knex, { Knex as KnexType } from 'knex';
import { Model } from 'objection';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const environment = process.env.NODE_ENV || 'development';

function dbConnection() {
  const host = process.env.DB_HOST;
  const database = process.env.DB_NAME;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASS;
  if (!host || !database || !user) {
    throw new Error(
      'DB_HOST, DB_NAME and DB_USER are required. Copy .env.example — no remote defaults in code.',
    );
  }
  return {
    host,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database,
    user,
    password: password || '',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  };
}

const knexConfig: { [key: string]: KnexType.Config } = {
  development: {
    client: 'postgresql',
    connection: dbConnection(),
    pool: { min: 2, max: 10 },
    migrations: {
      tableName: 'knex_migrations',
      directory: path.join(__dirname, '../../migrations'),
      extension: 'ts',
    },
    seeds: {
      directory: path.join(__dirname, '../../seeds'),
      extension: 'ts',
    },
  },
  production: {
    client: 'postgresql',
    connection: dbConnection(),
    pool: { min: 2, max: 20 },
    migrations: {
      tableName: 'knex_migrations',
      directory: path.join(__dirname, '../../migrations'),
      extension: 'ts',
    },
    seeds: {
      directory: path.join(__dirname, '../../seeds'),
      extension: 'ts',
    },
  },
};

const config = knexConfig[environment] || knexConfig.development;

export const knex = Knex(config);
Model.knex(knex);

export default knex;
