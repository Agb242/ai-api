'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { agentsApi } from '@/lib/api/agents.api';
import type { Agent, AgentTemplate, CreateAgentPayload } from '@/lib/types/agent';
import type { PlaygroundModel } from '@/lib/types/playground-model';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Props = {
  templates: AgentTemplate[];
  models: PlaygroundModel[];
  onCreated: (agent: Agent) => void;
};

/**
 * Direct agent creation — the LiteLLM/OpenAI chat-completions config surface (system
 * prompt, model, temperature, max_tokens). No mandatory métier wizard: the template
 * picker below is only a one-click prefill, never a gate.
 */
export function CreateAgentPanel({ templates, models, onCreated }: Props) {
  const t = useTranslations('agents');
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [modelId, setModelId] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [templateId, setTemplateId] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: async () => {
      if (!name.trim() || !systemPrompt.trim()) throw new Error(t('missingFields'));
      if (!modelId) throw new Error(t('modelRequired'));
      const payload: CreateAgentPayload = {
        name: name.trim(),
        system_prompt: systemPrompt.trim(),
        model_id: modelId,
        temperature,
        max_tokens: maxTokens,
        template_id: templateId,
      };
      const res = await agentsApi.create(payload);
      if (!res.success || !res.data) throw new Error(res.error?.message);
      return res.data;
    },
    onSuccess: (agent) => {
      toast.success(t('created'));
      qc.invalidateQueries({ queryKey: ['agents'] });
      onCreated(agent);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function applyTemplate(id: string) {
    const template = templates.find((tpl) => tpl.id === id);
    if (!template) return;
    setTemplateId(template.id);
    if (!name.trim()) setName(template.default_name);
    if (!systemPrompt.trim()) setSystemPrompt(template.system_prompt ?? '');
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 p-6 md:p-7">
      <div>
        <h1 className="font-display text-lg font-semibold">{t('createTitle')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('createSubtitle')}</p>
      </div>

      {templates.length ? (
        <div className="space-y-1.5">
          <Label>{t('startFromExample')}</Label>
          <Select value={templateId ?? ''} onValueChange={applyTemplate}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t('startFromExamplePlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {templates.map((template) => (
                <SelectItem key={template.id} value={template.id}>
                  {template.icon} {template.metier}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="agent-name">{t('name')}</Label>
        <Input
          id="agent-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('namePlaceholder')}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="agent-prompt">{t('systemPrompt')}</Label>
        <Textarea
          id="agent-prompt"
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder={t('systemPromptPlaceholder')}
          rows={10}
          className="font-mono text-sm"
        />
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

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="agent-temp">{t('temperature')}</Label>
          <Input
            id="agent-temp"
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={temperature}
            onChange={(e) => setTemperature(Number(e.target.value))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="agent-max-tokens">{t('maxTokens')}</Label>
          <Input
            id="agent-max-tokens"
            type="number"
            min={1}
            max={32000}
            value={maxTokens}
            onChange={(e) => setMaxTokens(Number(e.target.value))}
          />
        </div>
      </div>

      <Button
        className="w-full"
        onClick={() => createMut.mutate()}
        disabled={createMut.isPending}
      >
        {createMut.isPending ? t('creating') : t('create')}
      </Button>
    </div>
  );
}
