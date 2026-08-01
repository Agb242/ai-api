import crypto from 'crypto';
import { config } from '../config/server';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

export interface EncryptedData {
  encrypted: string;
  iv: string;
  authTag: string;
  keyId: string;
}

export const encryptionService = {
  /**
   * Get encryption key from environment
   */
  getEncryptionKey(): Buffer {
    const key = process.env.ENCRYPTION_KEY || config.encryptionKey;
    
    if (!key) {
      throw new Error('ENCRYPTION_KEY not configured');
    }

    // Derive a 32-byte key using SHA-256
    return crypto.createHash('sha256').update(key).digest();
  },

  /**
   * Encrypt sensitive data
   */
  encrypt(plaintext: string): EncryptedData {
    if (!plaintext) {
      throw new Error('Cannot encrypt empty data');
    }

    const key = this.getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      keyId: 'default', // Can be used for key rotation
    };
  },

  /**
   * Decrypt sensitive data
   */
  decrypt(encryptedData: EncryptedData): string {
    if (!encryptedData || !encryptedData.encrypted) {
      throw new Error('Cannot decrypt empty data');
    }

    const key = this.getEncryptionKey();
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const authTag = Buffer.from(encryptedData.authTag, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  },

  /**
   * Encrypt access token
   */
  encryptAccessToken(token: string): string {
    const encrypted = this.encrypt(token);
    return JSON.stringify(encrypted);
  },

  /**
   * Decrypt access token
   */
  decryptAccessToken(encryptedToken: string): string {
    const data = JSON.parse(encryptedToken) as EncryptedData;
    return this.decrypt(data);
  },

  /**
   * Encrypt refresh token
   */
  encryptRefreshToken(token: string): string {
    const encrypted = this.encrypt(token);
    return JSON.stringify(encrypted);
  },

  /**
   * Decrypt refresh token
   */
  decryptRefreshToken(encryptedToken: string): string {
    const data = JSON.parse(encryptedToken) as EncryptedData;
    return this.decrypt(data);
  },

  /**
   * Encrypt API key
   */
  encryptApiKey(apiKey: string): string {
    const encrypted = this.encrypt(apiKey);
    return JSON.stringify(encrypted);
  },

  /**
   * Decrypt API key
   */
  decryptApiKey(encryptedApiKey: string): string {
    const data = JSON.parse(encryptedApiKey) as EncryptedData;
    return this.decrypt(data);
  },

  /**
   * Hash webhook secret (one-way)
   */
  hashWebhookSecret(secret: string): string {
    return crypto.createHash('sha256').update(secret).digest('hex');
  },

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    if (!signature || !secret) return false;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    return this.equalStrings(signature, expectedSignature);
  },

  /** Constant-time string compare (length mismatch → false). */
  equalStrings(a: string, b: string): boolean {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    try {
      return crypto.timingSafeEqual(ba, bb);
    } catch {
      return false;
    }
  },

  /**
   * Generate webhook secret
   */
  generateWebhookSecret(): string {
    return crypto.randomBytes(32).toString('hex');
  },

  /**
   * Generate OAuth state
   */
  generateOAuthState(): string {
    return crypto.randomBytes(16).toString('hex');
  },
};

export default encryptionService;
