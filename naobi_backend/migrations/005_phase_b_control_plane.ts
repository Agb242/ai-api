import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('organizations', (table) => {
    table.string('litellm_team_id', 128).nullable();
    table.index(['litellm_team_id']);
  });

  await knex.schema.alterTable('budgets', (table) => {
    table.string('litellm_budget_id', 128).nullable();
    table.decimal('soft_limit_pct', 5, 2).notNullable().defaultTo(80);
  });

  await knex.schema.alterTable('api_keys', (table) => {
    table.string('litellm_key_alias', 128).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('api_keys', (table) => {
    table.dropColumn('litellm_key_alias');
  });
  await knex.schema.alterTable('budgets', (table) => {
    table.dropColumn('litellm_budget_id');
    table.dropColumn('soft_limit_pct');
  });
  await knex.schema.alterTable('organizations', (table) => {
    table.dropIndex(['litellm_team_id']);
    table.dropColumn('litellm_team_id');
  });
}
