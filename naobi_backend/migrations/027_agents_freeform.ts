import { Knex } from 'knex';

/**
 * Agent creation drops the mandatory métier-template wizard in favour of a direct,
 * LiteLLM/OpenAI-native config surface: free-form system prompt + generation params.
 * Templates become an optional starting point, not a gate — `metier`/`tone`/`language`
 * are no longer required, and `temperature`/`max_tokens` are added to mirror what the
 * chat completions API actually accepts.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('agents', (table) => {
    table.decimal('temperature', 3, 2).notNullable().defaultTo(0.7);
    table.integer('max_tokens').notNullable().defaultTo(1024);
  });

  await knex.schema.alterTable('agents', (table) => {
    table.dropColumn('tone');
    table.dropColumn('language');
  });

  await knex.raw('ALTER TABLE agents ALTER COLUMN metier DROP NOT NULL');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE agents ALTER COLUMN metier SET NOT NULL');

  await knex.schema.alterTable('agents', (table) => {
    table.string('tone').notNullable().defaultTo('amical');
    table.string('language').notNullable().defaultTo('français');
  });

  await knex.schema.alterTable('agents', (table) => {
    table.dropColumn('temperature');
    table.dropColumn('max_tokens');
  });
}
