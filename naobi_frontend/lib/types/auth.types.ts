// Types basés sur les modèles backend

export interface User {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: string;
  token: string;
  expires_at: string;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  description?: string;
  owner_id: string;
  currency?: string;
  cover_image?: string | null;
  created_at: string;
  updated_at: string;
  owner?: User;
  members?: ProjectMember[];
  ai_enabled: boolean;
  budget_enabled?: boolean;
  transition_rules_enabled?: boolean;
}

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  created_at: string;
  user?: User;
  project?: Project;
}



// Auth Request Types
export interface SignupRequest {
  email: string;
  full_name: string;
}

export interface LoginRequest {
  email: string;
  full_name?: string;
  locale?: string;
  invitation_token?: string;
}

export interface VerifyOtpRequest {
  email: string;
  code: string;
}

export interface AuthResponse {
  token: string;
  user?: User;
  data?: User;
  session?: {
    id: string;
    token: string;
    expires_at: string;
  };
  expires_at?: string;
}

export type { ApiResponse } from '../api/client';