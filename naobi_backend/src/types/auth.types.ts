/** Auth-related request/response shapes (session/OTP — no JWT). */

export interface RegisterInput {
  email: string;
  first_name: string;
  last_name: string;
  organization_name: string;
}

export interface LoginInput {
  email: string;
}

export interface VerifyOtpInput {
  email: string;
  otp_code: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    verified_at: string | null;
  };
  message: string;
}
