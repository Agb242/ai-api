import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasRpm = await knex.schema.hasColumn('api_keys', 'rpm_limit');
  if (!hasRpm) {
    await knex.schema.alterTable('api_keys', (table) => {
      table.integer('rpm_limit').nullable();
      table.integer('tpm_limit').nullable();
      table.jsonb('models_allowlist').nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasRpm = await knex.schema.hasColumn('api_keys', 'rpm_limit');
  if (hasRpm) {
    await knex.schema.alterTable('api_keys', (table) => {
      table.dropColumn('rpm_limit');
      table.dropColumn('tpm_limit');
      table.dropColumn('models_allowlist');
    });
  }
}
