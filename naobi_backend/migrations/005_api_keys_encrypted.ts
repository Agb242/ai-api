import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn('api_keys', 'litellm_key_encrypted');
  if (!has) {
    await knex.schema.alterTable('api_keys', (table) => {
      table.text('litellm_key_encrypted').nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn('api_keys', 'litellm_key_encrypted');
  if (has) {
    await knex.schema.alterTable('api_keys', (table) => {
      table.dropColumn('litellm_key_encrypted');
    });
  }
}
