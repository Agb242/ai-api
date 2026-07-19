import { Context, Next } from 'koa';
import { Locale, resolveLocale } from '../i18n/messages';

declare module 'koa' {
  interface DefaultState {
    locale?: Locale;
  }
}

export async function localeMiddleware(ctx: Context, next: Next): Promise<void> {
  ctx.state.locale = resolveLocale(ctx.get('Accept-Language'));
  await next();
}
