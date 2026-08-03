import { PlatformAdmin } from '../models/PlatformAdmin';
import { User } from '../models/User';
import { normalizeEmail } from '../utils/normalize-email';

export const platformAdminService = {
  async isActiveAdmin(params: { userId?: string | null; email?: string | null }): Promise<boolean> {
    const email = normalizeEmail(params.email || '');
    const q = PlatformAdmin.query().where({ status: 'active' });
    if (params.userId && email) {
      const row = await q.clone().where((builder) => {
        builder.where({ user_id: params.userId }).orWhere({ email });
      }).first();
      return !!row;
    }
    if (params.userId) {
      return !!(await q.clone().where({ user_id: params.userId }).first());
    }
    if (email) {
      return !!(await q.clone().where({ email }).first());
    }
    return false;
  },

  /** Activate pending invite on successful login (OTP / Google). */
  async activatePendingForUser(user: User): Promise<void> {
    const email = normalizeEmail(user.email);
    if (!email) return;
    const pending = await PlatformAdmin.query().findOne({ email, status: 'pending' });
    if (!pending) return;
    await pending.$query().patch({
      status: 'active',
      user_id: user.id,
    } as any);
  },

  async list() {
    const rows = await PlatformAdmin.query().orderBy('created_at', 'asc');
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      status: r.status,
      created_at: r.created_at,
    }));
  },

  async invite(params: { email: string; invitedByUserId: string }) {
    const email = normalizeEmail(params.email);
    if (!email || !email.includes('@')) {
      throw Object.assign(new Error('MISSING_FIELDS'), { code: 'MISSING_FIELDS' });
    }

    const existing = await PlatformAdmin.query().findOne({ email });
    if (existing) {
      throw Object.assign(new Error('ALREADY_EXISTS'), { code: 'ALREADY_EXISTS' });
    }

    const user = await User.findByEmail(email);
    const row = await PlatformAdmin.query().insertAndFetch({
      email,
      user_id: user?.id || null,
      invited_by_user_id: params.invitedByUserId,
      status: user ? 'active' : 'pending',
    } as any);

    return {
      id: row.id,
      email: row.email,
      status: row.status,
      created_at: row.created_at,
    };
  },
};
