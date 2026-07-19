'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { organizationsApi } from '@/lib/api/organizations.api';
import { useAuthStore } from '@/lib/stores/auth.store';
import { useRouter } from '@/i18n/routing';

export default function OrganizationsSelectPage() {
  const router = useRouter();
  const t = useTranslations('organizations');
  const setOrg = useAuthStore((s) => s.setOrg);
  const setOrganizations = useAuthStore((s) => s.setOrganizations);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }

    (async () => {
      const res = await organizationsApi.list();
      if (!res.success || !Array.isArray(res.data) || res.data.length === 0) {
        router.replace('/onboarding');
        return;
      }
      const list = res.data as any[];
      setOrganizations(list);
      setOrgs(list);
      if (list.length === 1) {
        setOrg(list[0]);
        router.replace('/dashboard');
        return;
      }
      setLoading(false);
    })();
  }, [isAuthenticated, router, setOrg, setOrganizations]);

  if (loading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="w-full rounded-xl border border-border bg-card p-6">
      <h1 className="font-display text-lg font-semibold">{t('title')}</h1>
      <p className="mt-1 mb-5 text-sm text-muted-foreground">{t('selectToContinue')}</p>
      <div className="space-y-2">
        {orgs.map((org) => (
          <button
            key={org.id}
            type="button"
            onClick={() => {
              setOrg(org);
              router.push('/dashboard');
            }}
            className="flex w-full items-center justify-between rounded-lg border border-border p-4 text-left transition-colors hover:bg-muted"
          >
            <div>
              <p className="text-sm font-medium">{org.name}</p>
              <p className="font-mono text-[11px] text-muted-foreground">{org.slug}</p>
            </div>
            <span className="text-xs text-muted-foreground">{org.role}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
