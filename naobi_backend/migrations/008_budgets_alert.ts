import { Knex } from 'knex';

/** Track 80% budget alert emails to avoid spam (one per period). */
export async function up(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn('budgets', 'alert_80_sent_at');
  if (!has) {
    await knex.schema.alterTable('budgets', (table) => {
      table.timestamp('alert_80_sent_at').nullable();
      table.string('litellm_budget_id').nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn('budgets', 'alert_80_sent_at');
  if (has) {
    await knex.schema.alterTable('budgets', (table) => {
      table.dropColumn('alert_80_sent_at');
      table.dropColumn('litellm_budget_id');
    });
  }
}
