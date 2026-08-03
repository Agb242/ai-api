import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasGuardrail = await knex.schema.hasColumn('organizations', 'litellm_guardrail_id');
  if (!hasGuardrail) {
    await knex.schema.alterTable('organizations', (table) => {
      table.string('litellm_guardrail_id').nullable();
      table.boolean('enterprise_guardrail_enabled').notNullable().defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasGuardrail = await knex.schema.hasColumn('organizations', 'litellm_guardrail_id');
  if (hasGuardrail) {
    await knex.schema.alterTable('organizations', (table) => {
      table.dropColumn('litellm_guardrail_id');
      table.dropColumn('enterprise_guardrail_enabled');
    });
  }
}
