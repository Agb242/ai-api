'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { agentsApi } from '@/lib/api/agents.api';
import type { Agent, AgentTemplate, CreateAgentPayload } from '@/lib/types/agent';
import type { PlaygroundModel } from '@/lib/types/playground-model';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type Props = {
  template: AgentTemplate | null;
  models: PlaygroundModel[];
  onOpenChange: (open: boolean) => void;
  onCreated: (agent: Agent) => void;
};

export function CreateAgentDialog({ template, models, onOpenChange, onCreated }: Props) {
  const t = useTranslations('agents');
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [tone, setTone] = useState('amical');
  const [language, setLanguage] = useState('français');
  const [modelId, setModelId] = useState('');

  useEffect(() => {
    if (template) {
      setName(template.default_name);
      setTone(template.tone_default || 'amical');
      setLanguage('français');
      setModelId(models[0]?.id || '');
    }
  }, [template, models]);

  const createMut = useMutation({
    mutationFn: async (payload: CreateAgentPayload) => {
      const res = await agentsApi.create(payload);
      if (!res.success || !res.data) throw new Error(res.error?.message);
      return res.data;
    },
    onSuccess: (agent) => {
      toast.success(t('created'));
      qc.invalidateQueries({ queryKey: ['agents'] });
      onOpenChange(false);
      onCreated(agent);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit() {
    if (!template) return;
    if (!modelId) {
      toast.error(t('modelRequired'));
      return;
    }
    createMut.mutate({
      template_id: template.id,
      name: name.trim() || undefined,
      tone,
      language,
      model_id: modelId,
    });
  }

  return (
    <Dialog open={!!template} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {template ? `${template.icon} ${template.metier}` : t('createTitle')}
          </DialogTitle>
          <DialogDescription>{template?.description}</DialogDescription>
        </DialogHeader>

        {template?.disclaimer ? (
          <p className="rounded-lg border border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/10 p-3 text-xs text-foreground">
            ⚠️ {template.disclaimer}
          </p>
        ) : null}

        <div className="grid gap-3 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="agent-name">{t('name')}</Label>
            <Input id="agent-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('tone')}</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="amical">{t('toneFriendly')}</SelectItem>
                  <SelectItem value="formel">{t('toneFormal')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('language')}</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="français">Français</SelectItem>
                  <SelectItem value="anglais">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t('model')}</Label>
            <Select value={modelId} onValueChange={setModelId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('selectModel')} />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button onClick={submit} disabled={createMut.isPending || !modelId}>
            {createMut.isPending ? t('creating') : t('create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
