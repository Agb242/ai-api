'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { membersApi } from '@/lib/api/gateway.api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/lib/stores/auth.store';

export default function MembersPage() {
  const t = useTranslations('team');
  const org = useAuthStore((s) => s.org);
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('developer');

  const { data: members = [] } = useQuery({
    queryKey: ['members', org?.id],
    queryFn: async () => {
      const res = await membersApi.list();
      if (!res.success) throw new Error(res.error?.message);
      return (res.data as any[]) || [];
    },
    enabled: !!org?.id,
  });

  const invite = useMutation({
    mutationFn: async () => {
      const res = await membersApi.invite(email, role);
      if (!res.success) throw new Error(res.error?.message);
      return res.data;
    },
    onSuccess: () => {
      toast.success(t('invite'));
      setEmail('');
      qc.invalidateQueries({ queryKey: ['members'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex flex-col gap-5 p-6 md:p-7">
      <h1 className="font-display text-lg font-semibold">{t('title')}</h1>

      <div className="flex max-w-xl flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <Label>{t('email')}</Label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
        </div>
        <div className="space-y-1.5">
          <Label>{t('role')}</Label>
          <select
            className="h-9 rounded-md border border-border bg-card px-2 text-sm"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="admin">admin</option>
            <option value="developer">developer</option>
            <option value="viewer">viewer</option>
          </select>
        </div>
        <Button onClick={() => invite.mutate()} disabled={!email.trim()}>
          {t('invite')}
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card">
        {members.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">{t('empty')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {members.map((m: any) => (
              <li key={m.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium">
                    {m.user?.full_name || m.user?.email || m.user_id}
                  </p>
                  <p className="text-xs text-muted-foreground">{m.user?.email}</p>
                </div>
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs">{m.role}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
