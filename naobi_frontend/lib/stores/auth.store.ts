import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { clearAllClientSession, persistSessionToken } from '../auth/session-client';
import type { User, Session } from '../types/auth.types';
import type { Organization, Member } from '../types/member.types';

export type AuthStatus =
  | 'bootstrapping'
  | 'unauthenticated'
  | 'authenticated_no_org'
  | 'authenticated_needs_org_pick'
  | 'authenticated_ready';

interface AuthState {
  status: AuthStatus;
  user: User | null;
  session: Session | null;
  org: Organization | null;
  organizations: Organization[];
  currentMember: Member | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasHydrated: boolean;
  bootstrapError: string | null;

  setStatus: (status: AuthStatus) => void;
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  setOrg: (org: Organization | null) => void;
  setOrganizations: (orgs: Organization[]) => void;
  setCurrentMember: (member: Member | null) => void;
  setLoading: (loading: boolean) => void;
  login: (user: User, session: Session, orgs?: Organization[]) => void;
  applySessionPayload: (payload: {
    user: User;
    session: Session;
    organizations?: Organization[];
    activeOrganization?: Organization | null;
  }) => void;
  clearAll: () => void;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
  resolveStatus: () => AuthStatus;
}

type PersistedAuth = Pick<
  AuthState,
  'user' | 'session' | 'org' | 'organizations' | 'currentMember' | 'isAuthenticated'
>;

function normalizePersisted(raw: unknown): PersistedAuth {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<PersistedAuth>;
  const user = s.user ?? null;
  const session = s.session ?? null;
  return {
    user,
    session,
    org: s.org ?? null,
    organizations: Array.isArray(s.organizations) ? s.organizations : [],
    currentMember: s.currentMember ?? null,
    isAuthenticated: Boolean(s.isAuthenticated && user && session),
  };
}

function computeStatus(state: {
  isAuthenticated: boolean;
  org: Organization | null;
  organizations: Organization[];
}): AuthStatus {
  if (!state.isAuthenticated) return 'unauthenticated';
  if (!state.organizations.length) return 'authenticated_no_org';
  if (state.organizations.length > 1 && !state.org?.id) return 'authenticated_needs_org_pick';
  if (!state.org?.id && state.organizations.length === 1) {
    return 'authenticated_ready'; // caller should setOrg first
  }
  if (!state.org?.id) return 'authenticated_no_org';
  return 'authenticated_ready';
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      status: 'bootstrapping',
      user: null,
      session: null,
      org: null,
      organizations: [],
      currentMember: null,
      isAuthenticated: false,
      isLoading: false,
      hasHydrated: false,
      bootstrapError: null,

      setStatus: (status) => set({ status }),

      setUser: (user) =>
        set({
          user,
          isAuthenticated: !!user,
        }),

      setSession: (session) => set({ session }),

      setOrg: (org) => {
        const next = { ...get(), org };
        set({
          org,
          status: computeStatus({
            isAuthenticated: next.isAuthenticated,
            org,
            organizations: next.organizations,
          }),
        });
      },

      setOrganizations: (organizations) => {
        const { org, isAuthenticated } = get();
        let nextOrg = org;
        if (organizations.length === 1) nextOrg = organizations[0];
        if (org?.id && !organizations.some((o) => o.id === org.id)) nextOrg = null;
        set({
          organizations,
          org: nextOrg,
          status: computeStatus({ isAuthenticated, org: nextOrg, organizations }),
        });
      },

      setCurrentMember: (currentMember) => set({ currentMember }),

      setLoading: (isLoading) => set({ isLoading }),

      login: (user, session, orgs = []) => {
        if (session?.token) persistSessionToken(session.token);
        let org = get().org;
        if (orgs.length === 1) org = orgs[0];
        if (orgs.length === 0) org = null;
        if (org?.id && orgs.length > 0 && !orgs.some((o) => o.id === org!.id)) org = null;
        const status = computeStatus({
          isAuthenticated: true,
          org,
          organizations: orgs,
        });
        set({
          user,
          session,
          organizations: orgs,
          org,
          isAuthenticated: true,
          isLoading: false,
          hasHydrated: true,
          status,
          bootstrapError: null,
        });
      },

      applySessionPayload: ({ user, session, organizations = [], activeOrganization }) => {
        if (session?.token) persistSessionToken(session.token);
        let org = activeOrganization ?? get().org;
        if (organizations.length === 1) org = organizations[0];
        if (organizations.length === 0) org = null;
        if (org?.id && organizations.length > 0 && !organizations.some((o) => o.id === org!.id)) {
          org = null;
        }
        const status = computeStatus({
          isAuthenticated: true,
          org,
          organizations,
        });
        set({
          user,
          session,
          organizations,
          org,
          isAuthenticated: true,
          isLoading: false,
          hasHydrated: true,
          status,
          bootstrapError: null,
        });
      },

      clearAll: () => {
        clearAllClientSession();
        set({
          status: 'unauthenticated',
          user: null,
          session: null,
          org: null,
          organizations: [],
          currentMember: null,
          isAuthenticated: false,
          isLoading: false,
          hasHydrated: true,
          bootstrapError: null,
        });
      },

      logout: () => {
        get().clearAll();
      },

      updateUser: (updates) => {
        const { user } = get();
        if (user) set({ user: { ...user, ...updates } });
      },

      resolveStatus: () => {
        const s = get();
        const status = computeStatus(s);
        set({ status });
        return status;
      },
    }),
    {
      name: 'auth-storage',
      version: 2,
      migrate: (persistedState) => normalizePersisted(persistedState),
      merge: (persistedState, currentState) => {
        const persisted = normalizePersisted(persistedState);
        if (currentState.isAuthenticated && currentState.session?.token) {
          return {
            ...currentState,
            org: currentState.org ?? persisted.org,
            organizations:
              currentState.organizations.length > 0
                ? currentState.organizations
                : persisted.organizations,
            currentMember: currentState.currentMember ?? persisted.currentMember,
            hasHydrated: true,
          };
        }
        return {
          ...currentState,
          ...persisted,
        };
      },
      partialize: (state) => ({
        user: state.user,
        session: state.session,
        org: state.org,
        organizations: state.organizations,
        currentMember: state.currentMember,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => () => {
        useAuthStore.setState({ hasHydrated: true });
      },
    },
  ),
);
