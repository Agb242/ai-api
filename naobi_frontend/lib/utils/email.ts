/** Supprime espaces visibles/invisibles et met en minuscules. */
export function normalizeEmail(raw: string): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .toLowerCase();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized || normalized.length > 254) return false;
  return EMAIL_RE.test(normalized);
}

export function normalizeEmailList(raw: string[]): string[] {
  return [...new Set(raw.map(normalizeEmail).filter(isValidEmail))];
}
