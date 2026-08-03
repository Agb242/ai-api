import type { Knex } from 'knex';

/**
 * Packs / subscription offers are out of demo scope for now.
 * This seed is intentionally a no-op — do not insert or update packs.
 */
export async function seed(_knex: Knex): Promise<void> {
  /* no-op */
}
