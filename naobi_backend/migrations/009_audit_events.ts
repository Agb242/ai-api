import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable('audit_events');
  if (!exists) {
    await knex.schema.createTable('audit_events', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table
        .uuid('organization_id')
        .notNullable()
        .references('id')
        .inTable('organizations')
        .onDelete('CASCADE');
      table.uuid('actor_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.string('action').notNullable();
      table.string('resource_type').notNullable();
      table.string('resource_id').nullable();
      table.jsonb('metadata').notNullable().defaultTo('{}');
      table.timestamps(true, true);
      table.index(['organization_id', 'created_at']);
      table.index(['action']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('audit_events');
}
