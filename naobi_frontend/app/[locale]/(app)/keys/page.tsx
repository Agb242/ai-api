'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { keysApi } from '@/lib/api/keys.api';
import type { ApiKey, ApiKeyCreated } from '@/lib/types/api-key';
import { CreateApiKeyDialog } from '@/components/keys/CreateApiKeyDialog';
import { RevealApiKeyDialog } from '@/components/keys/RevealApiKeyDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Link } from '@/i18n/routing';
import { useAuthStore } from '@/lib/stores/auth.store';
import { readPlatformSpend } from '@/lib/platform-fields';

export default function KeysPage() {
  const t = useTranslations('keys');
  const org = useAuthStore((s) => s.org);
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [reveal, setReveal] = useState<ApiKeyCreated | null>(null);
  const [revokeId, setRevokeId] = useState<string | null>(null);

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ['keys', org?.id],
    queryFn: async () => {
      const res = await keysApi.list();
      if (!res.success) throw new Error(res.error?.message);
      return (res.data as ApiKey[]) || [];
    },
    enabled: !!org?.id,
  });

  const revokeMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await keysApi.revoke(id);
      if (!res.success) throw new Error(res.error?.message);
      return res.data;
    },
    onSuccess: () => {
      toast.success(t('revoked'));
      setRevokeId(null);
      qc.invalidateQueries({ queryKey: ['keys'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex flex-col gap-5 p-6 md:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-lg font-semibold">{t('title')}</h1>
        <Button onClick={() => setCreateOpen(true)}>{t('create')}</Button>
      </div>

      <div className="rounded-xl border border-border bg-card">
        {isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">…</p>
        ) : keys.length === 0 ? (
          <div className="flex flex-col items-start gap-3 p-6">
            <p className="text-sm text-muted-foreground">{t('empty')}</p>
            <Button onClick={() => setCreateOpen(true)}>{t('create')}</Button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase text-muted-foreground">
                <th className="px-4 py-2">{t('name')}</th>
                <th className="px-4 py-2">{t('prefix')}</th>
                <th className="px-4 py-2">{t('status')}</th>
                <th className="px-4 py-2">{t('budget')}</th>
                <th className="px-4 py-2">{t('platformSpend')}</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-b border-border hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <Link
                      href={`/keys/${k.id}`}
                      className="font-medium text-foreground underline-offset-2 hover:underline"
                    >
                      {k.name}
                    </Link>
                    {k.description ? (
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                        {k.description}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{k.key_prefix}…</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{k.status}</Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {k.budget_max != null
                      ? `${Number(k.budget_consumed).toFixed(2)} / ${k.budget_max}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {(() => {
                      const spend = readPlatformSpend(k as unknown as Record<string, unknown>);
                      return spend != null ? spend.toFixed(4) : '—';
                    })()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/keys/${k.id}`}>{t('view')}</Link>
                      </Button>
                      {k.status !== 'revoked' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.preventDefault();
                            setRevokeId(k.id);
                          }}
                        >
                          {t('revoke')}
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CreateApiKeyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(created) => setReveal(created)}
      />
      <RevealApiKeyDialog
        open={!!reveal}
        onOpenChange={(o) => {
          if (!o) setReveal(null);
        }}
        plaintext={reveal?.key ?? null}
        keyName={reveal?.name}
      />

      <AlertDialog open={!!revokeId} onOpenChange={(o) => !o && setRevokeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('revokeConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('revokeConfirmBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => revokeId && revokeMut.mutate(revokeId)}
              disabled={revokeMut.isPending}
            >
              {t('revoke')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
