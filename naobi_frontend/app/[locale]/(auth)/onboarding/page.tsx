'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { organizationsApi } from '@/lib/api/organizations.api';
import { useAuthStore } from '@/lib/stores/auth.store';
import { useRouter } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function OnboardingCreateOrgPage() {
  const t = useTranslations('onboarding');
  const router = useRouter();
  const setOrg = useAuthStore((s) => s.setOrg);
  const setOrganizations = useAuthStore((s) => s.setOrganizations);
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [name, setName] = useState(
    user?.full_name ? `${user.full_name}'s org` : user?.email?.split('@')[0] || '',
  );
  const [loading, setLoading] = useState(false);

  if (!isAuthenticated) {
    return null;
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    const res = await organizationsApi.create(name.trim());
    if (!res.success || !res.data) {
      toast.error(res.error?.message || t('error'));
      setLoading(false);
      return;
    }
    const payload = res.data as any;
    const org = payload.organization
      ? { ...payload.organization, role: payload.membership?.role || 'owner' }
      : payload;
    setOrganizations([org]);
    setOrg(org);
    toast.success(t('created'));
    router.replace('/dashboard');
    setLoading(false);
  }

  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="mb-7">
        <h1 className="font-display text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      <form onSubmit={handleCreate} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="org-name">{t('orgName')}</Label>
          <Input
            id="org-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('orgNamePlaceholder')}
            required
            autoFocus
            className="rounded-none"
          />
        </div>
        <Button type="submit" className="w-full gap-2 rounded-none" disabled={loading || !name.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loading ? t('creating') : t('create')}
        </Button>
      </form>
    </div>
  );
}
