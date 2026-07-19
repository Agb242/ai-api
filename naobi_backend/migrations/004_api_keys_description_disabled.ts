import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('api_keys', (table) => {
    table.text('description').nullable();
  });
  // status values: active | disabled | revoked | expired (enforced in application code)
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('api_keys', (table) => {
    table.dropColumn('description');
  });
}
