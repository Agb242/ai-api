'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { membersApi } from '@/lib/api/gateway.api';
import { useAuthStore } from '@/lib/stores/auth.store';
import { useRouter, Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';

export default function InviteAcceptPage() {
  const params = useParams();
  const token = String(params?.token || '');
  const t = useTranslations('team');
  const session = useAuthStore((s) => s.session);
  const setOrg = useAuthStore((s) => s.setOrg);
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) return;
    if (!session?.token) {
      try {
        sessionStorage.setItem('noabi_pending_invite', token);
      } catch {
        /* ignore */
      }
      router.push('/login');
      return;
    }

    setStatus('loading');
    membersApi
      .acceptInvite(token)
      .then(async (res) => {
        if (!res.success) throw new Error(res.error?.message);
        setStatus('ok');
        toast.success(t('inviteAccepted'));
        const orgId = (res.data as any)?.organization_id;
        if (orgId) setOrg({ id: orgId } as any);
        router.push('/dashboard');
      })
      .catch((e: Error) => {
        setStatus('err');
        setMessage(e.message);
      });
  }, [token, session?.token, router, setOrg, t]);

  return (
    <div className="mx-auto max-w-sm space-y-4 py-12 text-center">
      <h1 className="font-display text-xl font-semibold">{t('invite')}</h1>
      {status === 'loading' || status === 'idle' ? (
        <p className="text-sm text-muted-foreground">{t('accepting')}</p>
      ) : null}
      {status === 'err' ? (
        <>
          <p className="text-sm text-muted-foreground">{message}</p>
          <Button asChild className="rounded-none">
            <Link href="/login">{t('invite')}</Link>
          </Button>
        </>
      ) : null}
    </div>
  );
}
