import { User } from '../models/User';
import { OTPCode } from '../models/OTPCode';
import { emailService } from './email.service';
import { normalizeEmail } from '../utils/normalize-email';

const OTP_EXPIRY_MINUTES = 10;

export const otpService = {
  generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  },

  getExpiryDate(): Date {
    const expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + OTP_EXPIRY_MINUTES);
    return expiry;
  },

  async createOtp(email: string, userId?: string): Promise<string> {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      throw new Error('Email invalide');
    }
    email = normalizedEmail;

    const code = this.generateOtp();
    const expiresAt = this.getExpiryDate();

    await OTPCode.query()
      .where('email', email)
      .where('used', false)
      .patch({ used: true });

    await OTPCode.query().insert({
      user_id: userId,
      email,
      code,
      expires_at: expiresAt,
      used: false,
    });

    await emailService.sendOtpEmail(email, code, !userId);

    return code;
  },

  async verifyOtp(email: string, code: string): Promise<{ valid: boolean; message: string; userId?: string }> {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      return { valid: false, message: 'Email invalide' };
    }
    email = normalizedEmail;

    const otpRecord = await OTPCode.query()
      .where('email', email)
      .where('code', code)
      .where('used', false)
      .orderBy('created_at', 'desc')
      .first();

    if (!otpRecord) {
      return { valid: false, message: 'Code OTP invalide ou déjà utilisé' };
    }

    const now = new Date();
    const expiresAt = new Date(otpRecord.expires_at);

    if (now > expiresAt) {
      await otpRecord.$query().patch({ used: true });
      return { valid: false, message: 'Code OTP expiré' };
    }

    await otpRecord.$query().patch({ used: true });

    return { 
      valid: true, 
      message: 'Code OTP vérifié',
      userId: otpRecord.user_id || undefined
    };
  },

  async cleanupExpiredOtps(): Promise<number> {
    const deleted = await OTPCode.query()
      .where('expires_at', '<', new Date())
      .orWhere('used', true)
      .delete();

    return deleted;
  },
};

export default otpService;
