/** Map opaque upstream field names so UI code never references the proxy brand. */

const SPEND = 'litellm_spend';
const SYNCED = 'litellm_synced_at';
const META = 'litellm';
const MAX_BUDGET = 'litellm_max_budget';
const LAST_ACTIVE = 'litellm_last_active';
const SOURCE_UPSTREAM = 'litellm';

export function readPlatformSpend(row: Record<string, unknown> | null | undefined): number | null {
  if (!row) return null;
  const v = row[SPEND];
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function readPlatformSyncedAt(row: Record<string, unknown> | null | undefined): string | null {
  if (!row) return null;
  const v = row[SYNCED];
  return typeof v === 'string' ? v : null;
}

export function readPlatformMeta(
  row: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!row) return {};
  const v = row[META];
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

export function readPlatformMaxBudget(row: Record<string, unknown> | null | undefined): unknown {
  return row?.[MAX_BUDGET];
}

export function readPlatformLastActive(row: Record<string, unknown> | null | undefined): unknown {
  return row?.[LAST_ACTIVE];
}

export function isUpstreamSource(source?: string | null): boolean {
  return source === SOURCE_UPSTREAM || source === 'platform';
}

export function readPlatformHealthy(payload: Record<string, unknown> | null | undefined): boolean {
  return Boolean(payload?.litellm_healthy);
}
