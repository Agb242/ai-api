import type { Knex } from 'knex';

const SEED_EMAIL = 'claude@checkflow.space';

export async function seed(knex: Knex): Promise<void> {
  const email = SEED_EMAIL.toLowerCase().trim();

  let user = await knex('users').where({ email }).first();
  if (!user) {
    const [inserted] = await knex('users')
      .insert({
        email,
        full_name: 'Platform Admin',
        email_verified: true,
      })
      .returning('*');
    user = inserted;
  } else if (!user.email_verified) {
    await knex('users').where({ id: user.id }).update({ email_verified: true });
  }

  const existing = await knex('platform_admins').where({ email }).first();
  if (!existing) {
    await knex('platform_admins').insert({
      email,
      user_id: user.id,
      invited_by_user_id: null,
      status: 'active',
    });
  } else {
    await knex('platform_admins')
      .where({ id: existing.id })
      .update({
        user_id: user.id,
        status: 'active',
      });
  }
}
