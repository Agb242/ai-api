import { Context, Next } from 'koa';
import { sessionService } from '../services/session.service';

export interface AuthState {
  user?: {
    id: string;
    email: string;
    full_name?: string | null;
    email_verified: boolean;
  };
  session?: {
    id: string;
    token: string;
  };
}

export async function authenticate(ctx: Context, next: Next): Promise<void> {
  const authHeader = ctx.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    ctx.status = 401;
    ctx.body = {
      error: {
        message: 'Token d\'authentification manquant',
        code: 'UNAUTHORIZED',
      },
    };
    return;
  }

  const token = authHeader.substring(7);

  const result = await sessionService.getSessionWithUser(token);

  if (!result) {
    ctx.status = 401;
    ctx.body = {
      error: {
        message: 'Session invalide ou expirée',
        code: 'INVALID_SESSION',
      },
    };
    return;
  }

  ctx.state.user = {
    id: result.user.id,
    email: result.user.email,
    full_name: result.user.full_name,
    email_verified: result.user.email_verified,
  };

  ctx.state.session = {
    id: result.session.id,
    token: result.session.token,
  };

  await next();
}

export async function optionalAuth(ctx: Context, next: Next): Promise<void> {
  const authHeader = ctx.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const result = await sessionService.getSessionWithUser(token);

    if (result) {
      ctx.state.user = {
        id: result.user.id,
        email: result.user.email,
        full_name: result.user.full_name,
        email_verified: result.user.email_verified,
      };

      ctx.state.session = {
        id: result.session.id,
        token: result.session.token,
      };
    }
  }

  await next();
}

export default authenticate;
