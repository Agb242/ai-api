export type OrgRole = 'owner' | 'admin' | 'developer' | 'viewer';
export type MemberStatus = 'active' | 'inactive';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  status?: string;
  currency?: string;
  role?: OrgRole;
  membership_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Member {
  id: string;
  user_id: string | null;
  organization_id?: string;
  org_id?: string;
  role?: OrgRole;
  org_role?: OrgRole;
  status: MemberStatus;
  created_at: string;
  updated_at: string;
  user?: {
    id: string;
    email: string;
    full_name?: string | null;
    avatar_url?: string | null;
  };
}
