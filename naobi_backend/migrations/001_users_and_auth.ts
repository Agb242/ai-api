// migrations/001_users_and_auth.ts
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Users table
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('email').unique().notNullable();
    table.string('full_name');
    table.string('avatar_url');
    table.boolean('email_verified').defaultTo(false);
    table.timestamps(true, true);
    table.timestamp('deleted_at');
  });

  // OTP codes table (passwordless)
  await knex.schema.createTable('otp_codes', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.string('code', 6).notNullable(); // 6-digit code
    table.string('email').notNullable();
    table.timestamp('expires_at').notNullable();
    table.boolean('used').defaultTo(false);
    table.timestamps(true, true);
    
    table.index(['email', 'code']);
  });

  // Sessions table
  await knex.schema.createTable('sessions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.string('token').unique().notNullable();
    table.timestamp('expires_at').notNullable();
    table.string('ip_address');
    table.string('user_agent');
    table.timestamps(true, true);
    
    table.index('token');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('sessions');
  await knex.schema.dropTableIfExists('otp_codes');
  await knex.schema.dropTableIfExists('users');
}