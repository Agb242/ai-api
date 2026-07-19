export interface CreateOrganizationInput {
  name: string;
  owner_id: string;
  email?: string;
}

export interface UpdateOrganizationInput {
  name?: string;
  email?: string;
  logo_url?: string;
}

export interface OrganizationResponse {
  id: string;
  name: string;
  owner_id: string;
  email: string | null;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
}
