import { Context } from 'koa';
import { OAuth2Client } from 'google-auth-library';
import { User } from '../models/User';
import { otpService } from '../services/otp.service';
import { sessionService } from '../services/session.service';
import { organizationService } from '../services/organization.service';
import { config } from '../config/server';
import logger from '../config/logger';
import { normalizeEmail } from '../utils/normalize-email';
import { momoService } from '../services/momo.service';
import { litellmAdmin } from '../services/litellm-admin.service';

const googleClient = new OAuth2Client(config.google.clientId);

async function authPayloadForUser(user: User, session: { id: string; expires_at: string | Date }, token: string) {
  const organizations = await organizationService.listForUser(user.id);
  const activeOrganization = organizations.length === 1 ? organizations[0] : null;
  const expiresIn = sessionService.getExpiresInSeconds(new Date(session.expires_at));

  logger.info('✅ [AUTH] Session payload', {
    userId: user.id,
    orgCount: organizations.length,
    hasOrganization: organizations.length > 0,
  });

  const userPayload = {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    avatar_url: user.avatar_url,
    email_verified: user.email_verified,
  };

  const sessionPayload = {
    id: session.id,
    token,
    expires_at: session.expires_at,
    expires_in: expiresIn,
  };

  return {
    message: 'Authentification réussie',
    token,
    user: userPayload,
    /** @deprecated use `user` — kept for older FE clients */
    data: userPayload,
    session: sessionPayload,
    organizations,
    has_organization: organizations.length > 0,
    has_org: organizations.length > 0,
    active_organization: activeOrganization,
    default_organization: activeOrganization,
  };
}

export const authController = {
  async requestOtp(ctx: Context): Promise<void> {
    const body = ctx.request.body as { email: string; full_name?: string };
    const email = normalizeEmail(body.email);
    const { full_name } = body;

    logger.info('🔐 [AUTH] Demande OTP', { email, full_name, ip: ctx.request.ip });

    if (!email || !email.includes('@')) {
      logger.warn('❌ [AUTH] Email invalide', { email });
      ctx.status = 400;
      ctx.body = {
        error: {
          message: 'Email invalide',
          code: 'INVALID_EMAIL',
        },
      };
      return;
    }

    try {
      let user = await User.findByEmail(email);

      if (!user) {
        logger.info('👤 [AUTH] Création nouvel utilisateur', { email, full_name });
        user = await User.query().insert({
          email,
          full_name: full_name || null,
          email_verified: false,
        });
        logger.info('✅ [AUTH] Utilisateur créé', { userId: user.id, email });
      } else {
        logger.info('👤 [AUTH] Utilisateur existant trouvé', { userId: user.id, email });
      }

      await otpService.createOtp(email, user.id);
      logger.info('📧 [AUTH] OTP envoyé', { userId: user.id, email });

      ctx.status = 200;
      ctx.body = {
        message: 'Code OTP envoyé par email',
        email,
      };
    } catch (error: any) {
      logger.error('💥 [AUTH] Erreur demande OTP', { 
        error: error.message, 
        stack: error.stack, 
        email 
      });
      ctx.status = 500;
      ctx.body = {
        error: {
          message: 'Erreur lors de l\'envoi du code OTP',
          code: 'OTP_REQUEST_FAILED',
        },
      };
    }
  },

  async verifyOtp(ctx: Context): Promise<void> {
    const body = ctx.request.body as { email: string; code: string };
    const email = normalizeEmail(body.email);
    const { code } = body;

    logger.info('🔐 [AUTH] Vérification OTP', { email, code: '***', ip: ctx.request.ip });

    if (!email || !code) {
      logger.warn('❌ [AUTH] Email ou code manquant', { email, hasCode: !!code });
      ctx.status = 400;
      ctx.body = {
        error: {
          message: 'Email et code requis',
          code: 'MISSING_FIELDS',
        },
      };
      return;
    }

    try {
      const verification = await otpService.verifyOtp(email, code);

      if (!verification.valid) {
        logger.warn('❌ [AUTH] OTP invalide', { email, message: verification.message });
        ctx.status = 401;
        ctx.body = {
          error: {
            message: verification.message,
            code: 'INVALID_OTP',
          },
        };
        return;
      }

      let user = await User.findByEmail(email);

      if (!user) {
        logger.error('❌ [AUTH] Utilisateur non trouvé après OTP valide', { email });
        ctx.status = 404;
        ctx.body = {
          error: {
            message: 'Utilisateur non trouvé',
            code: 'USER_NOT_FOUND',
          },
        };
        return;
      }

      if (!user.email_verified) {
        await user.$query().patch({ email_verified: true });
        logger.info('✅ [AUTH] Email vérifié', { userId: user.id, email });
      }

      const ipAddress = ctx.request.ip;
      const userAgent = ctx.request.headers['user-agent'];

      const { session, token } = await sessionService.createSession(
        user.id,
        ipAddress,
        userAgent
      );

      logger.info('✅ [AUTH] Session créée', {
        userId: user.id,
        sessionId: session.id,
        email,
        ip: ipAddress,
      });

      ctx.status = 200;
      ctx.body = await authPayloadForUser(user, session, token);
    } catch (error: any) {
      logger.error('💥 [AUTH] Erreur vérification OTP', { 
        error: error.message, 
        stack: error.stack, 
        email 
      });
      ctx.status = 500;
      ctx.body = {
        error: {
          message: 'Erreur lors de la vérification',
          code: 'OTP_VERIFICATION_FAILED',
        },
      };
    }
  },

  async logout(ctx: Context): Promise<void> {
    const token = ctx.state.session?.token;
    const userId = ctx.state.user?.id;

    logger.info('🚪 [AUTH] Demande déconnexion', { userId, hasToken: !!token });

    if (!token) {
      logger.warn('❌ [AUTH] Token manquant pour déconnexion');
      ctx.status = 401;
      ctx.body = {
        error: {
          message: 'Non authentifié',
          code: 'UNAUTHORIZED',
        },
      };
      return;
    }

    try {
      await sessionService.deleteSession(token);
      logger.info('✅ [AUTH] Déconnexion réussie', { userId });

      ctx.status = 200;
      ctx.body = {
        message: 'Déconnexion réussie',
      };
    } catch (error: any) {
      logger.error('💥 [AUTH] Erreur déconnexion', { 
        error: error.message, 
        userId, 
        token: token?.substring(0, 10) + '...' 
      });
      ctx.status = 500;
      ctx.body = {
        error: {
          message: 'Erreur lors de la déconnexion',
          code: 'LOGOUT_FAILED',
        },
      };
    }
  },

  async me(ctx: Context): Promise<void> {
    const userId = ctx.state.user?.id;
    const sessionToken = ctx.state.session?.token;
    const sessionId = ctx.state.session?.id;

    logger.info('👤 [AUTH] Récupération profil utilisateur', { userId });

    if (!userId || !sessionToken) {
      logger.warn('❌ [AUTH] UserId manquant pour profil');
      ctx.status = 401;
      ctx.body = {
        error: {
          message: 'Non authentifié',
          code: 'UNAUTHORIZED',
        },
      };
      return;
    }

    try {
      const user = await User.query().findById(userId);

      if (!user) {
        logger.error('❌ [AUTH] Utilisateur non trouvé', { userId });
        ctx.status = 404;
        ctx.body = {
          error: {
            message: 'Utilisateur non trouvé',
            code: 'USER_NOT_FOUND',
          },
        };
        return;
      }

      const session = await sessionService.validateSession(sessionToken);
      if (!session) {
        ctx.status = 401;
        ctx.body = {
          error: {
            message: 'Session invalide ou expirée',
            code: 'INVALID_SESSION',
          },
        };
        return;
      }

      const organizations = await organizationService.listForUser(user.id);
      const activeOrganization = organizations.length === 1 ? organizations[0] : null;
      const expiresIn = sessionService.getExpiresInSeconds(new Date(session.expires_at));

      logger.info('✅ [AUTH] Profil récupéré', {
        userId,
        email: user.email,
        orgCount: organizations.length,
      });

      const userPayload = {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        avatar_url: user.avatar_url,
        email_verified: user.email_verified,
        created_at: user.created_at,
        updated_at: user.updated_at,
      };

      ctx.status = 200;
      // Wrapped in `data` so FE apiClient.get unwraps the full session payload
      ctx.body = {
        data: {
          user: userPayload,
          token: sessionToken,
          session: {
            id: sessionId || session.id,
            token: sessionToken,
            expires_at: session.expires_at,
            expires_in: expiresIn,
          },
          organizations,
          has_organization: organizations.length > 0,
          has_org: organizations.length > 0,
          active_organization: activeOrganization,
          default_organization: activeOrganization,
        },
      };
    } catch (error: any) {
      logger.error('💥 [AUTH] Erreur récupération profil', {
        error: error.message,
        userId,
      });
      ctx.status = 500;
      ctx.body = {
        error: {
          message: 'Erreur lors de la récupération du profil',
          code: 'PROFILE_FETCH_FAILED',
        },
      };
    }
  },

  async updateMe(ctx: Context): Promise<void> {
    const userId = ctx.state.user?.id;

    if (!userId) {
      ctx.status = 401;
      ctx.body = {
        error: {
          message: 'Non authentifié',
          code: 'UNAUTHORIZED',
        },
      };
      return;
    }

    const { full_name } = ctx.request.body as { full_name?: string };
    const patch: { full_name?: string } = {};

    if (full_name !== undefined) {
      const trimmed = full_name.trim();
      if (!trimmed) {
        ctx.status = 400;
        ctx.body = {
          error: {
            message: 'Le nom est requis',
            code: 'INVALID_FULL_NAME',
          },
        };
        return;
      }
      patch.full_name = trimmed;
    }

    if (Object.keys(patch).length === 0) {
      ctx.status = 400;
      ctx.body = {
        error: {
          message: 'Aucune donnée à mettre à jour',
          code: 'NO_UPDATES',
        },
      };
      return;
    }

    try {
      await User.query().findById(userId).patch(patch);
      const user = await User.query().findById(userId);

      if (!user) {
        ctx.status = 404;
        ctx.body = {
          error: {
            message: 'Utilisateur non trouvé',
            code: 'USER_NOT_FOUND',
          },
        };
        return;
      }

      ctx.status = 200;
      ctx.body = {
        message: 'Profil mis à jour',
        data: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          avatar_url: user.avatar_url,
          email_verified: user.email_verified,
          created_at: user.created_at,
          updated_at: user.updated_at,
        },
      };
    } catch (error: any) {
      logger.error('💥 [AUTH] Erreur mise à jour profil', { error: error.message, userId });
      ctx.status = 500;
      ctx.body = {
        error: {
          message: 'Erreur lors de la mise à jour du profil',
          code: 'PROFILE_UPDATE_FAILED',
        },
      };
    }
  },

  async refreshSession(ctx: Context): Promise<void> {
    const token = ctx.state.session?.token;
    const userId = ctx.state.user?.id;

    logger.info('🔄 [AUTH] Rafraîchissement session', { userId, hasToken: !!token });

    if (!token) {
      logger.warn('❌ [AUTH] Token manquant pour rafraîchissement');
      ctx.status = 401;
      ctx.body = {
        error: {
          message: 'Non authentifié',
          code: 'UNAUTHORIZED',
        },
      };
      return;
    }

    try {
      const refreshed = await sessionService.refreshSession(token);

      if (!refreshed) {
        logger.warn('❌ [AUTH] Session invalide pour rafraîchissement', { userId });
        ctx.status = 401;
        ctx.body = {
          error: {
            message: 'Session invalide ou expirée',
            code: 'INVALID_SESSION',
          },
        };
        return;
      }

      logger.info('✅ [AUTH] Session rafraîchie', { 
        userId, 
        sessionId: refreshed.session.id, 
        expiresAt: refreshed.expiresAt 
      });

      ctx.status = 200;
      ctx.body = {
        message: 'Session rafraîchie',
        token: refreshed.token,
        data: {
          id: refreshed.session.id,
          expires_at: refreshed.expiresAt,
          expires_in: refreshed.expiresInSeconds,
        },
        session: {
          id: refreshed.session.id,
          token: refreshed.token,
          expires_at: refreshed.expiresAt,
          expires_in: refreshed.expiresInSeconds,
        },
      };
    } catch (error: any) {
      logger.error('💥 [AUTH] Erreur rafraîchissement session', { 
        error: error.message, 
        userId 
      });
      ctx.status = 500;
      ctx.body = {
        error: {
          message: 'Erreur lors du rafraîchissement',
          code: 'SESSION_REFRESH_FAILED',
        },
      };
    }
  },

  /**
   * Legacy: validate a LiteLLM/MoMo key (does NOT log in — account ≠ key).
   * Client should then sign up via OTP and POST /billing/claim.
   */
  async verifyLegacyKey(ctx: Context): Promise<void> {
    const { key } = (ctx.request.body || {}) as { key?: string };
    if (!key?.trim()) {
      ctx.status = 400;
      ctx.body = { error: { message: 'Clé requise', code: 'MISSING_FIELDS' } };
      return;
    }
    if (!litellmAdmin.configured()) {
      ctx.status = 503;
      ctx.body = {
        error: {
          message: 'LiteLLM Proxy non configuré',
          code: 'LITELLM_NOT_CONFIGURED',
        },
      };
      return;
    }
    try {
      const info = await litellmAdmin.keyInfo(key.trim());
      ctx.status = 200;
      ctx.body = {
        valid: true,
        key_prefix: key.trim().slice(0, 12),
        info: {
          spend: (info as any).spend ?? (info as any).info?.spend,
          max_budget: (info as any).max_budget ?? (info as any).info?.max_budget,
          models: (info as any).models ?? (info as any).info?.models,
        },
        message: 'Clé valide. Connectez-vous avec votre email puis liez-la à votre compte.',
      };
    } catch {
      ctx.status = 401;
      ctx.body = { error: { message: 'Clé invalide', code: 'INVALID_API_KEY' } };
    }
  },

  /** After OTP/Google session: claim a MoMo-provisioned key onto the default org. */
  async claimKey(ctx: Context): Promise<void> {
    const { key, name, organization_id } = (ctx.request.body || {}) as {
      key?: string;
      name?: string;
      organization_id?: string;
    };
    if (!key?.trim() || !ctx.state.user) {
      ctx.status = 400;
      ctx.body = { error: { message: 'Clé requise', code: 'MISSING_FIELDS' } };
      return;
    }
    try {
      let orgId = organization_id;
      if (!orgId) {
        const org = await organizationService.ensureDefaultOrg(
          ctx.state.user.id,
          ctx.state.user.email,
          ctx.state.user.full_name,
        );
        orgId = org.id;
      }
      const record = await momoService.claim({
        rawKey: key.trim(),
        userId: ctx.state.user.id,
        organizationId: orgId!,
        name,
      });
      ctx.status = 200;
      ctx.body = {
        success: true,
        data: { id: record.id, name: record.name, key_prefix: record.key_prefix },
        message: 'Clé liée à votre compte',
      };
    } catch (err: any) {
      ctx.status = err.code === 'KEY_ALREADY_CLAIMED' ? 409 : 400;
      ctx.body = {
        error: {
          message: err.message || 'Claim failed',
          code: err.code || 'KEY_UNKNOWN',
        },
      };
    }
  },

  async googleAuth(ctx: Context): Promise<void> {
    const { id_token } = ctx.request.body as { id_token: string };

    logger.info('🔐 [AUTH] Google auth attempt', { ip: ctx.request.ip });

    if (!id_token) {
      ctx.status = 400;
      ctx.body = {
        error: {
          message: 'Google id_token requis',
          code: 'MISSING_TOKEN',
        },
      };
      return;
    }

    if (!config.google.clientId) {
      logger.error('❌ [AUTH] GOOGLE_CLIENT_ID not configured');
      ctx.status = 500;
      ctx.body = {
        error: {
          message: 'Google OAuth not configured on server',
          code: 'GOOGLE_NOT_CONFIGURED',
        },
      };
      return;
    }

    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: id_token,
        audience: config.google.clientId,
      });

      const payload = ticket.getPayload();
      if (!payload || !payload.email) {
        ctx.status = 401;
        ctx.body = {
          error: {
            message: 'Invalid Google token',
            code: 'INVALID_GOOGLE_TOKEN',
          },
        };
        return;
      }

      const normalizedEmail = normalizeEmail(payload.email);
      if (!normalizedEmail) {
        ctx.status = 401;
        ctx.body = {
          error: {
            message: 'Invalid Google token',
            code: 'INVALID_GOOGLE_TOKEN',
          },
        };
        return;
      }

      const { name, picture, email_verified } = payload;

      logger.info('✅ [AUTH] Google token verified', { email: normalizedEmail, name });

      let user = await User.findByEmail(normalizedEmail);

      if (!user) {
        logger.info('👤 [AUTH] Creating new user from Google', { email: normalizedEmail, name });
        user = await User.query().insert({
          email: normalizedEmail,
          full_name: name || null,
          avatar_url: picture || null,
          email_verified: email_verified ?? true,
        });
        logger.info('✅ [AUTH] User created from Google', { userId: user.id, email: normalizedEmail });
      } else {
        // Update avatar and name if not set
        const updates: any = {};
        if (!user.avatar_url && picture) updates.avatar_url = picture;
        if (!user.full_name && name) updates.full_name = name;
        if (!user.email_verified && email_verified) updates.email_verified = true;
        if (Object.keys(updates).length > 0) {
          await user.$query().patch(updates);
          Object.assign(user, updates);
        }
        logger.info('👤 [AUTH] Existing user found via Google', { userId: user.id, email: normalizedEmail });
      }

      const ipAddress = ctx.request.ip;
      const userAgent = ctx.request.headers['user-agent'];
      const { session, token } = await sessionService.createSession(user.id, ipAddress, userAgent);

      logger.info('✅ [AUTH] Google auth session created', {
        userId: user.id,
        sessionId: session.id,
        email: normalizedEmail,
      });

      ctx.status = 200;
      ctx.body = await authPayloadForUser(user, session, token);
    } catch (error: any) {
      logger.error('💥 [AUTH] Google auth error', {
        error: error.message,
        stack: error.stack,
      });
      ctx.status = 401;
      ctx.body = {
        error: {
          message: 'Google authentication failed',
          code: 'GOOGLE_AUTH_FAILED',
        },
      };
    }
  },
};

export default authController;
