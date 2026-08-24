'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { billingApi } from '@/lib/api/billing.api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';

type Pack = {
  id: string;
  slug: string;
  name: string;
  tagline?: string;
  price_xof: number;
  currency: string;
  max_budget: number;
};

export default function PublicBuyPage() {
  const t = useTranslations('billing');
  const tm = useTranslations('marketing');
  const [packId, setPackId] = useState('');
  const [phone, setPhone] = useState('');
  const [pseudo, setPseudo] = useState('');
  const [ref, setRef] = useState<string | null>(null);
  const [pollStatus, setPollStatus] = useState<any>(null);

  const { data: packs = [] } = useQuery({
    queryKey: ['packs-public'],
    queryFn: async () => {
      const res = await billingApi.listPacks();
      if (!res.success) throw new Error(res.error?.message);
      return (res.data as Pack[]) || [];
    },
  });

  useEffect(() => {
    if (!ref) return;
    const id = setInterval(async () => {
      const res = await billingApi.status(ref);
      if (res.success) {
        setPollStatus(res.data);
        if ((res.data as any)?.status === 'approved') {
          clearInterval(id);
          toast.success(t('paymentOk'));
        }
      }
    }, 2000);
    return () => clearInterval(id);
  }, [ref, t]);

  const buyMut = useMutation({
    mutationFn: async () => {
      const res = await billingApi.initiate({
        pack_id: packId,
        phone,
        pseudo,
        operator: 'mtn',
        country: 'BJ',
      });
      if (!res.success) throw new Error(res.error?.message);
      return res.data as any;
    },
    onSuccess: (data) => {
      setRef(data.external_reference);
      setPollStatus({ status: data.status });
      toast.success(t('paymentStarted'));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto w-full max-w-lg space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{tm('buyPack')}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <div className="grid gap-3">
        {packs.map((p) => (
          <button
            key={p.slug || p.id}
            type="button"
            onClick={() => setPackId(p.slug || p.id)}
            className={cn(
              'border border-border p-4 text-left',
              packId === (p.slug || p.id) ? 'bg-foreground text-background' : 'bg-card',
            )}
          >
            <div className="flex justify-between gap-2">
              <span className="font-semibold">{p.name}</span>
              <span className="font-mono text-sm">
                {p.price_xof?.toLocaleString()} {p.currency}
              </span>
            </div>
            <p className="mt-1 text-sm opacity-70">{p.tagline}</p>
          </button>
        ))}
      </div>

      <div className="space-y-3 border border-border bg-card p-4">
        <div className="space-y-1.5">
          <Label>{t('pseudo')}</Label>
          <Input className="rounded-none" value={pseudo} onChange={(e) => setPseudo(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>{t('phone')}</Label>
          <Input className="rounded-none" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <Button
          className="w-full rounded-none"
          disabled={!packId || !phone || !pseudo || buyMut.isPending}
          onClick={() => buyMut.mutate()}
        >
          {buyMut.isPending ? t('processing') : t('payMomo')}
        </Button>
        {ref ? (
          <p className="font-mono text-xs text-muted-foreground">
            {t('ref')}: {ref} · {pollStatus?.status || '…'}
          </p>
        ) : null}
        {pollStatus?.key ? (
          <div className="space-y-2 border border-border bg-background p-3">
            <p className="text-xs text-muted-foreground">{t('claimHint')}</p>
            <code className="block break-all font-mono text-xs">{pollStatus.key}</code>
            <Button asChild className="w-full rounded-none">
              <Link
                href="/login"
                onClick={() => {
                  try {
                    sessionStorage.setItem('knotflow_pending_claim_key', pollStatus.key);
                  } catch {
                    /* ignore */
                  }
                }}
              >
                {tm('cta')}
              </Link>
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
