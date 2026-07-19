'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { billingApi } from '@/lib/api/billing.api';
import { keysApi } from '@/lib/api/keys.api';
import { playgroundApi } from '@/lib/api/playground.api';
import type { ApiKey, ApiKeyCreated } from '@/lib/types/api-key';
import type { PlaygroundModel } from '@/lib/types/playground-model';
import { getGatewayBase } from '@/lib/gateway-url';
import { ApiKeySelect } from '@/components/playground/ApiKeySelect';
import { ModelPicker } from '@/components/playground/ModelPicker';
import { ModelInfoPanel } from '@/components/playground/ModelInfoPanel';
import { ChatMessage } from '@/components/playground/ChatMessage';
import { ChatComposer } from '@/components/playground/ChatComposer';
import { CreateApiKeyDialog } from '@/components/keys/CreateApiKeyDialog';
import { RevealApiKeyDialog } from '@/components/keys/RevealApiKeyDialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useAuthStore } from '@/lib/stores/auth.store';
import { ChevronDown } from 'lucide-react';
import 'highlight.js/styles/github-dark.css';

type Msg = { role: 'user' | 'assistant' | 'system'; content: string };

export default function PlaygroundPage() {
  const t = useTranslations('playground');
  const org = useAuthStore((s) => s.org);
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const gateway = getGatewayBase();

  const [mode, setMode] = useState<'playground' | 'curl'>('playground');
  const [apiKeyId, setApiKeyId] = useState('');
  const [model, setModel] = useState('');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [streamEnabled, setStreamEnabled] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [reveal, setReveal] = useState<ApiKeyCreated | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { data: keys = [] } = useQuery({
    queryKey: ['keys', org?.id],
    queryFn: async () => {
      const res = await keysApi.list();
      if (!res.success) throw new Error(res.error?.message);
      return (res.data as ApiKey[]) || [];
    },
    enabled: !!org?.id,
  });

  const { data: modelsPayload, error } = useQuery({
    queryKey: ['playground-models', org?.id],
    queryFn: async () => {
      const res = await billingApi.litellmModels();
      if (!res.success) throw new Error(res.error?.message);
      return res.data as { data?: PlaygroundModel[] };
    },
    enabled: !!org?.id,
  });

  const { data: ctx } = useQuery({
    queryKey: ['playground-context', org?.id],
    queryFn: async () => {
      const res = await playgroundApi.context();
      if (!res.success) throw new Error(res.error?.message);
      return res.data!;
    },
    enabled: !!org?.id,
  });

  const models = useMemo(() => {
    const list = Array.isArray(modelsPayload?.data) ? modelsPayload.data : [];
    return list.map((m: any) => ({
      id: m.id || m.model_id,
      display_name: m.display_name || m.id || m.model_id,
      provider: m.provider || 'other',
      status: m.status || 'available',
      price_input_per_1k: Number(m.price_input_per_1k || 0),
      price_output_per_1k: Number(m.price_output_per_1k || 0),
      context_window: m.context_window ?? null,
      max_tokens: m.max_tokens ?? null,
      capabilities: Array.isArray(m.capabilities) ? m.capabilities : ['streaming'],
      supports_streaming: m.supports_streaming !== false,
      supports_vision: Boolean(m.supports_vision),
      supports_tools: Boolean(m.supports_tools),
      description: m.description ?? null,
      updated_at: m.updated_at ?? null,
    })) as PlaygroundModel[];
  }, [modelsPayload]);

  const selectedModel = models.find((m) => m.id === model) || null;

  useEffect(() => {
    if (!model && models[0]) setModel(models[0].id);
  }, [model, models]);

  useEffect(() => {
    if (!apiKeyId) {
      const firstActive = keys.find((k) => k.status === 'active');
      if (firstActive) setApiKeyId(firstActive.id);
    }
  }, [keys, apiKeyId]);

  const userInitials = user?.full_name
    ? user.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() || 'U';

  const selectedKey = keys.find((k) => k.id === apiKeyId);
  const curlSnippet = `curl ${gateway}/v1/chat/completions \\
  -H "Authorization: Bearer $NOABI_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({
    model: model || 'llama-3.3-70b',
    messages: [{ role: 'user', content: input.trim() || 'Hello' }],
    stream: true,
    temperature,
    max_tokens: maxTokens,
  })}'`;

  async function sendChat() {
    if (!apiKeyId || selectedKey?.status !== 'active') {
      toast.error(t('missingKeyCreate'));
      return;
    }
    if (!input.trim() || !model) {
      toast.error(t('missing'));
      return;
    }

    const next: Msg[] = [...messages, { role: 'user', content: input.trim() }];
    setMessages(next);
    setInput('');
    setStreaming(true);

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await playgroundApi.chatCompletionsStream(
        {
          api_key_id: apiKeyId,
          model,
          messages: next,
          stream: streamEnabled,
          temperature,
          max_tokens: maxTokens,
        },
        ac.signal,
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `HTTP ${res.status}`);
      }

      if (!streamEnabled) {
        const json = await res.json();
        const text = json?.choices?.[0]?.message?.content || JSON.stringify(json);
        setMessages((prev) => [...prev, { role: 'assistant', content: text }]);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No stream');
      const decoder = new TextDecoder();
      let assistant = '';
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            const json = JSON.parse(payload);
            const delta = json.choices?.[0]?.delta?.content || '';
            if (delta) {
              assistant += delta;
              setMessages((prev) => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: 'assistant', content: assistant };
                return copy;
              });
            }
          } catch {
            /* ignore partial */
          }
        }
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        toast.message(t('stopped'));
      } else {
        toast.error(e.message || t('error'));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  async function copyCurl() {
    try {
      await navigator.clipboard.writeText(curlSnippet);
      toast.success(t('copied'));
    } catch {
      toast.error(t('copyFailed'));
    }
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem-64px)] flex-col gap-4 p-6 md:p-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-lg font-semibold">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="inline-flex rounded-lg border border-border bg-muted p-1">
          <button
            type="button"
            onClick={() => setMode('playground')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              mode === 'playground'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('tabPlayground')}
          </button>
          <button
            type="button"
            onClick={() => setMode('curl')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              mode === 'curl'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('tabCurl')}
          </button>
        </div>
      </div>

      {error ? (
        <p className="border border-border p-3 text-sm text-muted-foreground">
          {(error as Error).message}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-3">
          <ApiKeySelect
            keys={keys}
            value={apiKeyId}
            onChange={setApiKeyId}
            onCreateClick={() => setCreateOpen(true)}
          />
          <ModelPicker models={models} value={model} onChange={setModel} />
        </div>
        <ModelInfoPanel model={selectedModel} walletBalance={ctx?.wallet_balance} />
      </div>

      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="gap-1 px-0">
            {t('advanced')}
            <ChevronDown
              className={`h-3.5 w-3.5 transition ${advancedOpen ? 'rotate-180' : ''}`}
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>{t('temperature')}</Label>
            <Input
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('maxTokens')}</Label>
            <Input
              type="number"
              min={1}
              max={128000}
              value={maxTokens}
              onChange={(e) => setMaxTokens(Number(e.target.value))}
            />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <Switch checked={streamEnabled} onCheckedChange={setStreamEnabled} id="stream" />
            <Label htmlFor="stream">{t('streamToggle')}</Label>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {mode === 'playground' ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto rounded-xl border border-border bg-card p-4">
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('empty')}</p>
            ) : (
              messages.map((m, i) => (
                <ChatMessage
                  key={i}
                  role={m.role}
                  content={m.content}
                  streaming={streaming && i === messages.length - 1 && m.role === 'assistant'}
                  userInitials={userInitials}
                />
              ))
            )}
          </div>
          <ChatComposer
            value={input}
            onChange={setInput}
            onSend={() => void sendChat()}
            onStop={stop}
            streaming={streaming}
            disabled={!apiKeyId || selectedKey?.status !== 'active'}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {t('gateway')}: <code className="font-mono">{gateway}</code>
          </p>
          <p className="text-xs text-muted-foreground">{t('curlKeyHint')}</p>
          <pre className="overflow-x-auto rounded-xl border border-border bg-card p-4 font-mono text-[11px] whitespace-pre-wrap">
            {curlSnippet}
          </pre>
          <Button onClick={() => void copyCurl()}>{t('copyCurl')}</Button>
        </div>
      )}

      <CreateApiKeyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(created) => {
          setReveal(created);
          setApiKeyId(created.id);
          qc.invalidateQueries({ queryKey: ['keys'] });
        }}
      />
      <RevealApiKeyDialog
        open={!!reveal}
        onOpenChange={(o) => {
          if (!o) setReveal(null);
        }}
        plaintext={reveal?.key ?? null}
        keyName={reveal?.name}
      />
    </div>
  );
}
