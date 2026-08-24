'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { GoogleLogin } from '@react-oauth/google';
import { toast } from 'sonner';
import { Mail, ArrowRight, Loader2 } from 'lucide-react';
import { authService } from '@/lib/api/auth.api';
import { billingApi } from '@/lib/api/billing.api';
import { useAuthStore } from '@/lib/stores/auth.store';
import { resolvePostAuthRoute } from '@/lib/auth/resolve-post-auth-route';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { normalizeEmail } from '@/lib/utils/email';
import { useRouter, Link } from '@/i18n/routing';
import type { Organization } from '@/lib/types/member.types';
import type { User, Session } from '@/lib/types/auth.types';

type Step = 'email' | 'otp';

const PENDING_CLAIM = 'knotflow_pending_claim_key';
const PENDING_INVITE = 'knotflow_pending_invite';

function legacyKey(key: string): string[] {
  return [key, key.replace('knotflow_', 'noabi_'), key.replace('knotflow_', 'nexusai_')];
}

function safeGet(key: string): string | null {
  try {
    for (const k of legacyKey(key)) {
      const v = sessionStorage.getItem(k);
      if (v) return v;
    }
    return null;
  } catch {
    return null;
  }
}

function safeRemove(key: string) {
  try {
    for (const k of legacyKey(key)) sessionStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

export function LoginForm({ mode = 'login' }: { mode?: 'login' | 'register' }) {
  const router = useRouter();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const t = useTranslations('auth');
  const login = useAuthStore((s) => s.login);
  const setOrg = useAuthStore((s) => s.setOrg);

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const [googleWidth, setGoogleWidth] = useState(360);

  useLayoutEffect(() => {
    const el = googleBtnRef.current;
    if (!el) return;
    const measure = () => {
      const w = Math.floor(el.getBoundingClientRect().width);
      // GSI requires a numeric pixel width (not %)
      if (w >= 200) setGoogleWidth(Math.min(400, w));
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [step]);

  async function finishAuth(authData: any) {
    const token = authData?.token;
    const user = (authData?.user || authData?.data) as User | undefined;
    const session = {
      ...(authData?.session || {}),
      token: token || authData?.session?.token,
    } as Session;

    if (!token || !user?.id || !session.token) {
      toast.error(t('cannotSendCode'));
      return;
    }

    authService.setAuthToken(token);
    const orgs = (Array.isArray(authData?.organizations) ? authData.organizations : []) as Organization[];
    login(user, session, orgs);

    const activeOrg =
      authData?.active_organization ||
      authData?.default_organization ||
      (orgs.length === 1 ? orgs[0] : null);

    if (activeOrg?.id) setOrg(activeOrg);

    const pendingClaim = safeGet(PENDING_CLAIM);
    if (pendingClaim && activeOrg?.id) {
      const claimRes = await billingApi.claim(pendingClaim, 'MoMo pack');
      safeRemove(PENDING_CLAIM);
      if (claimRes.success) toast.success(t('claimOk'));
      else toast.error(claimRes.error?.message || t('claimFailed'));
    } else if (pendingClaim) {
      safeRemove(PENDING_CLAIM);
    }

    const pendingInvite = safeGet(PENDING_INVITE);
    if (pendingInvite) {
      safeRemove(PENDING_INVITE);
      router.push(`/invite/${pendingInvite}`);
      return;
    }

    const dest = resolvePostAuthRoute({
      organizations: orgs,
      activeOrg,
      next: searchParams.get('next'),
    });
    router.push(dest);
  }

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    const res = await authService.requestOtp({ email: normalizeEmail(email), locale });
    if (res.success) {
      setStep('otp');
      toast.success(t('codeSent'));
    } else {
      toast.error(res.error?.message || t('cannotSendCode'));
    }
    setLoading(false);
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    const res = await authService.verifyOtp({ email: normalizeEmail(email), code: code.trim() });
    if (!res.success) {
      toast.error(t('invalidCode'));
      setLoading(false);
      return;
    }
    await finishAuth(res.data);
    setLoading(false);
  }

  async function handleGoogleSuccess(credentialResponse: any) {
    const idToken = credentialResponse?.credential;
    if (!idToken) return;
    setLoading(true);
    const res = await authService.googleAuth(idToken);
    if (!res.success) {
      toast.error(res.error?.message || t('cannotSendCode'));
      setLoading(false);
      return;
    }
    await finishAuth(res.data);
    setLoading(false);
  }

  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="mb-7">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {mode === 'register' ? t('registerTitle') : t('title')}
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          {mode === 'register' ? t('registerSubtitle') : t('subtitle')}
        </p>
      </div>

      {step === 'email' && (
        <>
          <div ref={googleBtnRef} className="mb-4 flex w-full justify-center">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => toast.error(t('cannotSendCode'))}
              theme="outline"
              shape="rectangular"
              size="large"
              width={String(googleWidth)}
            />
          </div>
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-card px-3 text-xs text-muted-foreground">OTP</span>
            </div>
          </div>
          <form onSubmit={handleRequestOtp} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">{t('email')}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                required
                className="rounded-none"
              />
            </div>
            <Button type="submit" className="w-full gap-2 rounded-none" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              {t('sendCode')}
            </Button>
          </form>
          <p className="mt-5 text-center text-xs text-muted-foreground">
            {mode === 'register' ? (
              <>
                {t('haveAccount')}{' '}
                <Link href="/login" className="font-medium text-foreground underline">
                  {t('title')}
                </Link>
              </>
            ) : (
              <>
                {t('noAccount')}{' '}
                <Link href="/register" className="font-medium text-foreground underline">
                  {t('registerTitle')}
                </Link>
              </>
            )}
          </p>
        </>
      )}

      {step === 'otp' && (
        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <p className="text-xs text-muted-foreground">{t('otpHint', { email })}</p>
          <div className="space-y-1.5">
            <Label htmlFor="code">{t('code')}</Label>
            <Input
              id="code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              autoFocus
              required
              className="rounded-none text-center font-mono text-xl tracking-[0.45em]"
            />
          </div>
          <Button type="submit" className="w-full gap-2 rounded-none" disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
            {t('verify')}
          </Button>
          <button
            type="button"
            onClick={() => {
              setStep('email');
              setCode('');
            }}
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
          >
            ← {t('back')}
          </button>
        </form>
      )}
    </div>
  );
}
