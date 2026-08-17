import { Knex } from 'knex';

/**
 * Files produced by native agent tools (e.g. PDF generation). Stored inline as bytea —
 * good enough for the modest sizes these tools produce; move to object storage if that
 * changes. Served back through GET /files/:id (see mcp-server.routes / files.routes).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('generated_files', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');
    table.uuid('agent_id').references('id').inTable('agents').onDelete('SET NULL');
    table.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
    table.string('filename').notNullable();
    table.string('mime_type').notNullable().defaultTo('application/pdf');
    table.binary('content').notNullable();
    table.integer('size_bytes').notNullable().defaultTo(0);
    table.timestamps(true, true);
    table.index(['organization_id', 'created_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('generated_files');
}
