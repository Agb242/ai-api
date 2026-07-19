import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('organizations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name').notNullable();
    table.string('slug').unique().notNullable();
    table.string('status').notNullable().defaultTo('trial'); // trial | active | suspended | terminated
    table.string('currency', 8).notNullable().defaultTo('CREDITS');
    table.boolean('allow_model_fallback').notNullable().defaultTo(false);
    table.boolean('retain_request_content').notNullable().defaultTo(false);
    table.integer('content_retention_days').notNullable().defaultTo(0);
    table.timestamps(true, true);
    table.timestamp('deleted_at');
  });

  await knex.schema.createTable('organization_members', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('role').notNullable().defaultTo('developer'); // owner | admin | developer | viewer
    table.string('status').notNullable().defaultTo('active'); // active | inactive
    table.timestamps(true, true);
    table.unique(['organization_id', 'user_id']);
    table.index(['user_id']);
  });

  await knex.schema.createTable('invitations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.uuid('invited_by').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('email').notNullable();
    table.string('role').notNullable().defaultTo('developer');
    table.string('token').unique().notNullable();
    table.string('status').notNullable().defaultTo('pending'); // pending | accepted | expired | revoked
    table.timestamp('expires_at').notNullable();
    table.timestamps(true, true);
    table.index(['email', 'status']);
  });

  await knex.schema.createTable('wallets', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').unique().notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.decimal('balance', 18, 6).notNullable().defaultTo(0);
    table.decimal('alert_threshold_ratio', 5, 4).notNullable().defaultTo(0.1);
    table.string('status').notNullable().defaultTo('active'); // active | suspended
    table.timestamps(true, true);
  });

  await knex.schema.createTable('transactions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('wallet_id').notNullable().references('id').inTable('wallets').onDelete('CASCADE');
    table.string('type').notNullable(); // topup | debit | refund
    table.decimal('amount', 18, 6).notNullable();
    table.string('payment_method');
    table.string('status').notNullable().defaultTo('completed'); // pending | completed | failed
    table.string('reference');
    table.jsonb('metadata').defaultTo('{}');
    table.timestamps(true, true);
    table.index(['wallet_id', 'created_at']);
  });

  await knex.schema.createTable('api_keys', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.uuid('created_by').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('name').notNullable();
    table.string('key_prefix', 16).notNullable();
    table.string('key_hash').notNullable().unique();
    table.string('scope').notNullable().defaultTo('organization');
    table.decimal('budget_max', 18, 6);
    table.decimal('budget_consumed', 18, 6).notNullable().defaultTo(0);
    table.timestamp('expires_at');
    table.string('status').notNullable().defaultTo('active'); // active | revoked | expired
    table.timestamp('last_used_at');
    table.timestamps(true, true);
    table.index(['organization_id', 'status']);
  });

  await knex.schema.createTable('models', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('provider').notNullable(); // openai | anthropic | nvidia | selfhosted
    table.string('model_id').notNullable().unique(); // provider/model slug used by clients
    table.string('display_name').notNullable();
    table.string('type').notNullable().defaultTo('hosted'); // hosted | selfhosted
    table.string('infra_tier'); // vps | gpu | null
    table.decimal('price_input_per_1k', 18, 8).notNullable().defaultTo(0);
    table.decimal('price_output_per_1k', 18, 8).notNullable().defaultTo(0);
    table.string('status').notNullable().defaultTo('available'); // testing | available | degraded | deprecated
    table.string('endpoint_internal');
    table.string('fallback_model_id');
    table.jsonb('metadata').defaultTo('{}');
    table.timestamps(true, true);
  });

  await knex.schema.createTable('filter_rules', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.uuid('created_by').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('name').notNullable();
    table.string('type').notNullable(); // regex | keyword
    table.text('pattern').notNullable();
    table.string('action').notNullable(); // block | redact
    table.boolean('active').notNullable().defaultTo(true);
    table.timestamps(true, true);
    table.index(['organization_id', 'active']);
  });

  await knex.schema.createTable('budgets', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').references('id').inTable('organizations').onDelete('CASCADE');
    table.uuid('api_key_id').references('id').inTable('api_keys').onDelete('CASCADE');
    table.string('period').notNullable().defaultTo('month'); // day | week | month
    table.decimal('ceiling', 18, 6).notNullable();
    table.decimal('consumed', 18, 6).notNullable().defaultTo(0);
    table.string('overage_action').notNullable().defaultTo('block'); // block | alert
    table.timestamp('period_starts_at').notNullable();
    table.timestamp('period_ends_at').notNullable();
    table.timestamps(true, true);
  });

  await knex.schema.createTable('request_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.uuid('api_key_id').references('id').inTable('api_keys').onDelete('SET NULL');
    table.uuid('model_uuid').references('id').inTable('models').onDelete('SET NULL');
    table.string('model_id');
    table.integer('tokens_input').defaultTo(0);
    table.integer('tokens_output').defaultTo(0);
    table.integer('latency_ms');
    table.decimal('cost', 18, 8).defaultTo(0);
    table.string('status').notNullable(); // success | error | blocked | redacted
    table.string('error_code');
    table.uuid('triggered_rule_id').references('id').inTable('filter_rules').onDelete('SET NULL');
    table.string('filter_action'); // block | redact
    table.string('router_backend'); // litellm | direct
    table.boolean('streamed').defaultTo(false);
    table.jsonb('metadata').defaultTo('{}');
    table.timestamps(true, true);
    table.index(['organization_id', 'created_at']);
    table.index(['api_key_id', 'created_at']);
  });

  await knex.schema.createTable('filter_audit_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.uuid('rule_id').notNullable().references('id').inTable('filter_rules').onDelete('CASCADE');
    table.uuid('request_log_id').references('id').inTable('request_logs').onDelete('SET NULL');
    table.string('action').notNullable(); // block | redact
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('filter_audit_logs');
  await knex.schema.dropTableIfExists('request_logs');
  await knex.schema.dropTableIfExists('budgets');
  await knex.schema.dropTableIfExists('filter_rules');
  await knex.schema.dropTableIfExists('models');
  await knex.schema.dropTableIfExists('api_keys');
  await knex.schema.dropTableIfExists('transactions');
  await knex.schema.dropTableIfExists('wallets');
  await knex.schema.dropTableIfExists('invitations');
  await knex.schema.dropTableIfExists('organization_members');
  await knex.schema.dropTableIfExists('organizations');
}
