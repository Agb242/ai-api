import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn('organizations', 'litellm_team_id');
  if (!has) {
    await knex.schema.alterTable('organizations', (table) => {
      table.string('litellm_team_id').nullable();
      table.index(['litellm_team_id']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn('organizations', 'litellm_team_id');
  if (has) {
    await knex.schema.alterTable('organizations', (table) => {
      table.dropColumn('litellm_team_id');
    });
  }
}
