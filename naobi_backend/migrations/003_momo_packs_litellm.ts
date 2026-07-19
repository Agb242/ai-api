import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('packs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('slug').unique().notNullable();
    table.string('name').notNullable();
    table.string('tagline');
    table.integer('price_xof').notNullable();
    table.string('currency', 8).notNullable().defaultTo('XOF');
    table.jsonb('models').notNullable().defaultTo('[]');
    table.jsonb('model_labels').defaultTo('{}');
    table.decimal('max_budget_usd', 18, 6).notNullable().defaultTo(0);
    table.string('duration').notNullable().defaultTo('30d');
    table.integer('rpm_limit').defaultTo(60);
    table.integer('tpm_limit').defaultTo(100000);
    table.jsonb('advantages').defaultTo('[]');
    table.jsonb('limits').defaultTo('[]');
    table.boolean('active').notNullable().defaultTo(true);
    table.timestamps(true, true);
  });

  await knex.schema.createTable('momo_transactions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('external_reference').unique().notNullable();
    table.string('provider_transaction_id');
    table.uuid('pack_id').references('id').inTable('packs').onDelete('SET NULL');
    table.uuid('organization_id').references('id').inTable('organizations').onDelete('SET NULL');
    table.uuid('user_id').references('id').inTable('users').onDelete('SET NULL');
    table.string('phone').notNullable();
    table.string('pseudo');
    table.string('operator').defaultTo('mtn');
    table.string('country', 4).defaultTo('BJ');
    table.string('status').notNullable().defaultTo('pending'); // pending | approved | rejected | failed
    table.boolean('simulated').defaultTo(false);
    table.string('litellm_user_id');
    table.string('litellm_key_hash');
    table.string('litellm_key_prefix');
    table.text('litellm_key_encrypted'); // optional encrypted plaintext for claim window
    table.uuid('api_key_id').references('id').inTable('api_keys').onDelete('SET NULL');
    table.timestamp('claimed_at');
    table.text('error');
    table.jsonb('metadata').defaultTo('{}');
    table.timestamps(true, true);
    table.index(['status', 'created_at']);
    table.index(['user_id']);
  });

  await knex.schema.alterTable('api_keys', (table) => {
    table.string('litellm_key_id');
    table.string('litellm_user_id');
    table.decimal('litellm_spend', 18, 8).defaultTo(0);
    table.timestamp('litellm_synced_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('api_keys', (table) => {
    table.dropColumn('litellm_key_id');
    table.dropColumn('litellm_user_id');
    table.dropColumn('litellm_spend');
    table.dropColumn('litellm_synced_at');
  });
  await knex.schema.dropTableIfExists('momo_transactions');
  await knex.schema.dropTableIfExists('packs');
}
