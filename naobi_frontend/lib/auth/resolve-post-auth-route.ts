import type { Organization } from '@/lib/types/member.types';

export type PostAuthInput = {
  organizations: Organization[];
  activeOrg?: Organization | null;
  next?: string | null;
  hasPendingInvite?: boolean;
  inviteToken?: string | null;
};

function isSafeNext(path: string | null | undefined): path is string {
  return Boolean(path && path.startsWith('/') && !path.startsWith('//') && !path.includes('://'));
}

/**
 * Deterministic post-auth destination (single source of redirect truth).
 * 0 orgs → onboarding | 1 → dashboard | >1 → organizations select
 */
export function resolvePostAuthRoute(input: PostAuthInput): string {
  if (input.hasPendingInvite && input.inviteToken) {
    return `/invite/${input.inviteToken}`;
  }

  const orgs = input.organizations || [];
  if (orgs.length === 0) return '/onboarding';
  if (orgs.length > 1 && !input.activeOrg?.id) return '/organizations';

  if (isSafeNext(input.next) && input.next !== '/dashboard' && input.next !== '/onboarding') {
    return input.next;
  }
  return '/dashboard';
}
