import crypto from 'crypto';
import { Session } from '../models/Session';
import { User } from '../models/User';
import { config } from '../config/server';

export interface RefreshedSession {
  session: Session;
  token: string;
  expiresAt: Date;
  expiresInSeconds: number;
}

export const sessionService = {
  generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  },

  getExpiryDate(): Date {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + config.session.expiryDays);
    return expiry;
  },

  getExpiresInSeconds(expiresAt: Date): number {
    return Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  },

  async createSession(
    userId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ session: Session; token: string }> {
    const token = this.generateToken();
    const expiresAt = this.getExpiryDate();

    const session = await Session.query().insert({
      user_id: userId,
      token,
      expires_at: expiresAt,
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    return { session, token };
  },

  async validateSession(token: string): Promise<Session | null> {
    const session = await Session.query()
      .where('token', token)
      .where('expires_at', '>', new Date())
      .withGraphFetched('user')
      .first();

    return session || null;
  },

  async getSessionWithUser(token: string): Promise<{ session: Session; user: User } | null> {
    const session = await this.validateSession(token);

    if (!session || !session.user) {
      return null;
    }

    return {
      session,
      user: session.user,
    };
  },

  async deleteSession(token: string): Promise<void> {
    await Session.query().where('token', token).delete();
  },

  async deleteUserSessions(userId: string): Promise<void> {
    await Session.query().where('user_id', userId).delete();
  },

  async cleanupExpiredSessions(): Promise<number> {
    const deleted = await Session.query()
      .where('expires_at', '<', new Date())
      .delete();

    return deleted;
  },

  /**
   * Sliding session with token rotation (best practice against token theft).
   * Invalidates the old token and issues a new one with extended expiry.
   */
  async refreshSession(token: string): Promise<RefreshedSession | null> {
    const session = await this.validateSession(token);

    if (!session) {
      return null;
    }

    const newToken = this.generateToken();
    const expiresAt = this.getExpiryDate();

    const updated = await Session.query().patchAndFetchById(session.id, {
      token: newToken,
      expires_at: expiresAt,
    });

    return {
      session: updated,
      token: newToken,
      expiresAt,
      expiresInSeconds: this.getExpiresInSeconds(expiresAt),
    };
  },
};

export default sessionService;
