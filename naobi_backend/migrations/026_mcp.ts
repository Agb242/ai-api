import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('mcp_servers', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');
    table.uuid('created_by').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('name').notNullable();
    table.text('url').notNullable();
    table.string('auth_type').notNullable().defaultTo('none'); // none | bearer
    table.text('bearer_token_encrypted');
    table.jsonb('headers').defaultTo('{}');
    table.boolean('enabled').notNullable().defaultTo(true);
    table.timestamps(true, true);
    table.timestamp('deleted_at');
    table.index(['organization_id', 'deleted_at']);
  });

  await knex.schema.createTable('agent_mcp_servers', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('agent_id').notNullable().references('id').inTable('agents').onDelete('CASCADE');
    table
      .uuid('mcp_server_id')
      .notNullable()
      .references('id')
      .inTable('mcp_servers')
      .onDelete('CASCADE');
    table.timestamps(true, true);
    table.unique(['agent_id', 'mcp_server_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('agent_mcp_servers');
  await knex.schema.dropTableIfExists('mcp_servers');
}
