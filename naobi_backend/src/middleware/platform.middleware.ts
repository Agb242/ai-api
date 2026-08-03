import { Context, Next } from 'koa';
import { t } from '../i18n/messages';
import { platformAdminService } from '../services/platform-admin.service';

export async function isPlatformAdminUser(params: {
  userId?: string | null;
  email?: string | null;
}): Promise<boolean> {
  return platformAdminService.isActiveAdmin(params);
}

/** @deprecated use isPlatformAdminUser — sync env list removed */
export function isPlatformAdminEmail(_email?: string | null): boolean {
  return false;
}

export async function requirePlatformAdmin(ctx: Context, next: Next) {
  const locale = ctx.state.locale || 'fr';
  const user = ctx.state.user;
  if (
    !user ||
    !(await platformAdminService.isActiveAdmin({ userId: user.id, email: user.email }))
  ) {
    ctx.status = 403;
    ctx.body = { error: { message: t(locale, 'FORBIDDEN'), code: 'FORBIDDEN' } };
    return;
  }
  await next();
}
