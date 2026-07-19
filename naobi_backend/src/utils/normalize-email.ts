/**
 * Email normalization — industry standard (Gmail, Google, Stripe, etc.).
 * Local-part + domain stored lowercase; avoids duplicate accounts and invite mismatches.
 */
export function normalizeEmail(email: string | null | undefined): string | null {
  if (email == null) return null;
  const trimmed = String(email).trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
}

/** Compare two emails case-insensitively */
export function emailsEqual(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const na = normalizeEmail(a);
  const nb = normalizeEmail(b);
  if (!na || !nb) return false;
  return na === nb;
}
