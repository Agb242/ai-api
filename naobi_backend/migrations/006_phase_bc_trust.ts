import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('organizations', (table) => {
    table.jsonb('litellm_guardrail_ids').notNullable().defaultTo('[]');
  });

  const hasPacks = await knex.schema.hasTable('packs');
  if (hasPacks) {
    await knex.schema.alterTable('packs', (table) => {
      table.string('litellm_access_group_id', 128).nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasPacks = await knex.schema.hasTable('packs');
  if (hasPacks) {
    await knex.schema.alterTable('packs', (table) => {
      table.dropColumn('litellm_access_group_id');
    });
  }
  await knex.schema.alterTable('organizations', (table) => {
    table.dropColumn('litellm_guardrail_ids');
  });
}
