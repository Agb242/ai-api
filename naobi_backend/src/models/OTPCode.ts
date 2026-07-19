import { BaseModel } from './BaseModel';

export class OTPCode extends BaseModel {
  static tableName = 'otp_codes';
  static emailFields = ['email'];

  user_id?: string | null;
  email!: string;
  code!: string;
  expires_at!: Date;
  used!: boolean;
}
