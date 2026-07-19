import { Knex } from 'knex';

/**
 * Normalize all stored emails to lowercase (RFC practice).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(
    `UPDATE users SET email = lower(trim(email)) WHERE email IS NOT NULL AND email <> lower(trim(email))`,
  );
  await knex.raw(
    `UPDATE otp_codes SET email = lower(trim(email)) WHERE email IS NOT NULL AND email <> lower(trim(email))`,
  );
}

export async function down(_knex: Knex): Promise<void> {
  // Irreversible — original casing cannot be restored
}
