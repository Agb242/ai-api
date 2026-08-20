import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('agent_templates', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('key').unique().notNullable();
    table.string('metier').notNullable();
    table.string('icon').notNullable().defaultTo('🤖');
    table.string('default_name').notNullable();
    table.text('description').notNullable();
    table.string('tone_default').notNullable().defaultTo('amical');
    table.text('system_prompt').notNullable();
    table.text('disclaimer');
    table.jsonb('starters').defaultTo('[]');
    table.boolean('active').notNullable().defaultTo(true);
    table.timestamps(true, true);
  });

  await knex.schema.createTable('agents', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');
    table.uuid('created_by').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table
      .uuid('template_id')
      .references('id')
      .inTable('agent_templates')
      .onDelete('SET NULL');
    table.string('metier').notNullable();
    table.string('icon').notNullable().defaultTo('🤖');
    table.string('name').notNullable();
    table.string('model_id').notNullable();
    table.string('tone').notNullable();
    table.string('language').notNullable();
    table.text('system_prompt').notNullable();
    table.text('disclaimer');
    table.jsonb('starters').defaultTo('[]');
    table.timestamps(true, true);
    table.timestamp('deleted_at');
    table.index(['organization_id', 'deleted_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('agents');
  await knex.schema.dropTableIfExists('agent_templates');
}
