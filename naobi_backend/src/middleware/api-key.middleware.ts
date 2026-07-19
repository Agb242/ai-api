import { Context, Next } from 'koa';
import { apiKeyService } from '../services/api-key.service';
import { Organization } from '../models/Organization';
import { t } from '../i18n/messages';

declare module 'koa' {
  interface DefaultState {
    apiKey?: import('../models/ApiKey').ApiKey;
    /** Plaintext Bearer presented by the client (never logged). */
    rawApiKey?: string;
    organization?: Organization;
  }
}

export async function apiKeyAuth(ctx: Context, next: Next): Promise<void> {
  const locale = ctx.state.locale || 'fr';
  const auth = ctx.get('Authorization') || '';
  let raw = '';

  if (auth.toLowerCase().startsWith('bearer ')) {
    raw = auth.slice(7).trim();
  } else if (ctx.get('X-API-Key')) {
    raw = ctx.get('X-API-Key').trim();
  }

  if (!raw) {
    ctx.status = 401;
    ctx.body = { error: { message: t(locale, 'INVALID_API_KEY'), code: 'INVALID_API_KEY' } };
    return;
  }

  const key = await apiKeyService.authenticate(raw);
  if (!key) {
    // Distinguish expired vs invalid when possible by re-hash lookup is already inside authenticate
    ctx.status = 401;
    ctx.body = { error: { message: t(locale, 'INVALID_API_KEY'), code: 'INVALID_API_KEY' } };
    return;
  }

  const organization = await Organization.query().findById(key.organization_id);
  if (!organization || organization.status === 'suspended' || organization.status === 'terminated') {
    ctx.status = 403;
    ctx.body = { error: { message: t(locale, 'FORBIDDEN'), code: 'FORBIDDEN' } };
    return;
  }

  ctx.state.apiKey = key;
  ctx.state.rawApiKey = raw;
  ctx.state.organization = organization;
  await next();
}
