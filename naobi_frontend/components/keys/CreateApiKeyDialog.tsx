'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { keysApi } from '@/lib/api/keys.api';
import type { ApiKeyCreated, CreateApiKeyPayload } from '@/lib/types/api-key';
import { rememberPlaygroundKey } from '@/lib/gateway-url';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (created: ApiKeyCreated) => void;
};

export function CreateApiKeyDialog({ open, onOpenChange, onCreated }: Props) {
  const t = useTranslations('keys');
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [budgetMax, setBudgetMax] = useState('');

  const createMut = useMutation({
    mutationFn: async (payload: CreateApiKeyPayload) => {
      const res = await keysApi.create(payload);
      if (!res.success || !res.data) throw new Error(res.error?.message);
      return res.data;
    },
    onSuccess: (data) => {
      rememberPlaygroundKey(data.key);
      toast.success(t('created'));
      qc.invalidateQueries({ queryKey: ['keys'] });
      onOpenChange(false);
      setName('');
      setDescription('');
      setExpiresAt('');
      setBudgetMax('');
      onCreated?.(data);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit() {
    if (!name.trim()) {
      toast.error(t('nameRequired'));
      return;
    }
    const payload: CreateApiKeyPayload = { name: name.trim() };
    if (description.trim()) payload.description = description.trim();
    if (expiresAt) payload.expires_at = new Date(expiresAt).toISOString();
    if (budgetMax.trim()) {
      const n = Number(budgetMax);
      if (!Number.isFinite(n) || n < 0) {
        toast.error(t('budgetInvalid'));
        return;
      }
      payload.budget_max = n;
    }
    createMut.mutate(payload);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('createTitle')}</DialogTitle>
          <DialogDescription>{t('createHint')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="ak-name">{t('name')} *</Label>
            <Input
              id="ak-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('namePlaceholder')}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ak-desc">{t('description')}</Label>
            <Textarea
              id="ak-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('descriptionPlaceholder')}
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ak-exp">{t('expiresAt')}</Label>
            <Input
              id="ak-exp"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ak-budget">{t('budgetOptional')}</Label>
            <Input
              id="ak-budget"
              type="number"
              min={0}
              step="0.01"
              value={budgetMax}
              onChange={(e) => setBudgetMax(e.target.value)}
              placeholder="e.g. 10"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button onClick={submit} disabled={createMut.isPending || !name.trim()}>
            {createMut.isPending ? t('creating') : t('create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
