'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { modelsApi } from '@/lib/api/models.api';
import { keysApi } from '@/lib/api/keys.api';
import { playgroundApi } from '@/lib/api/playground.api';
import type { ApiKey, ApiKeyCreated } from '@/lib/types/api-key';
import type { PlaygroundModel } from '@/lib/types/playground-model';
import type { PlaygroundCapabilities } from '@/lib/types/playground-capabilities';
import {
  DEFAULT_JSON_SCHEMA,
  WEB_SEARCH_TOOL,
  hasOpenAiParam,
} from '@/lib/types/playground-capabilities';
import { getGatewayBase } from '@/lib/gateway-url';
import { ApiKeySelect } from '@/components/playground/ApiKeySelect';
import { ModelPicker } from '@/components/playground/ModelPicker';
import { ModelInfoPanel } from '@/components/playground/ModelInfoPanel';
import { ChatMessage } from '@/components/playground/ChatMessage';
import { ChatComposer } from '@/components/playground/ChatComposer';
import { RunSettingsPanel, type RunSettingsValue } from '@/components/playground/RunSettingsPanel';
import { GetCodeDialog } from '@/components/playground/GetCodeDialog';
import { StarterCards } from '@/components/playground/StarterCards';
import { CreateApiKeyDialog } from '@/components/keys/CreateApiKeyDialog';
import { RevealApiKeyDialog } from '@/components/keys/RevealApiKeyDialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuthStore } from '@/lib/stores/auth.store';

type Msg = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
};

function readUsage(json: any): { prompt_tokens: number; completion_tokens: number } | null {
  if (!json || typeof json !== 'object') return null;
  const u =
    json.type === 'usage'
      ? json
      : json.usage && typeof json.usage === 'object'
        ? json.usage
        : null;
  if (!u) return null;
  const prompt_tokens = Number(u.prompt_tokens ?? u.input_tokens ?? 0);
  const completion_tokens = Number(u.completion_tokens ?? u.output_tokens ?? 0);
  if (!Number.isFinite(prompt_tokens) && !Number.isFinite(completion_tokens)) return null;
  return {
    prompt_tokens: Number.isFinite(prompt_tokens) ? prompt_tokens : 0,
    completion_tokens: Number.isFinite(completion_tokens) ? completion_tokens : 0,
  };
}
type Modality = 'chat' | 'embeddings' | 'image' | 'audio';

export default function PlaygroundPage() {
  const t = useTranslations('playground');
  const org = useAuthStore((s) => s.org);
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const gateway = getGatewayBase();

  const [modality, setModality] = useState<Modality>('chat');
  const [mode, setMode] = useState<'playground' | 'curl'>('playground');
  const [apiKeyId, setApiKeyId] = useState('');
  const [model, setModel] = useState('');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [reveal, setReveal] = useState<ApiKeyCreated | null>(null);
  const [embedInput, setEmbedInput] = useState('Hello from noabi');
  const [embedResult, setEmbedResult] = useState('');
  const [imagePrompt, setImagePrompt] = useState('A red bicycle on a sunny street');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [audioText, setAudioText] = useState('Bonjour, bienvenue sur noabi.');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [getCodeOpen, setGetCodeOpen] = useState(false);
  const [fallbackTesting, setFallbackTesting] = useState(false);
  const [tokenHint, setTokenHint] = useState<string | null>(null);
  const [run, setRun] = useState<RunSettingsValue>({
    systemInstructions: '',
    temperature: 0.7,
    maxTokens: 1024,
    topP: 1,
    streamEnabled: true,
    reasoningEffort: 'medium',
    thinkingLevel: 'medium',
    functionCalling: false,
    selectedTools: [],
    webSearch: false,
    structuredOutput: false,
    jsonSchemaText: JSON.stringify(DEFAULT_JSON_SCHEMA, null, 2),
    toolsEditorOpen: false,
  });

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
      const res = await modelsApi.list();
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

  const { data: caps } = useQuery({
    queryKey: ['playground-capabilities', org?.id, model],
    queryFn: async () => {
      const res = await playgroundApi.capabilities(model);
      if (!res.success) throw new Error(res.error?.message);
      return res.data as PlaygroundCapabilities;
    },
    enabled: !!org?.id && !!model && modality === 'chat',
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

  const params = caps?.params || [];
  const paramsKnown = Boolean(caps?.params_available);
  const streamAllowed = !paramsKnown || hasOpenAiParam(params, 'stream');

  useEffect(() => {
    if (caps?.params_available && !hasOpenAiParam(caps.params, 'stream') && run.streamEnabled) {
      setRun((s) => ({ ...s, streamEnabled: false }));
    }
  }, [caps, run.streamEnabled]);

  useEffect(() => {
    if (!caps?.token_counter_available || modality !== 'chat') {
      setTokenHint(null);
      return;
    }
    const handle = setTimeout(async () => {
      const messagesForCount = [
        ...(run.systemInstructions.trim()
          ? [{ role: 'system', content: run.systemInstructions.trim() }]
          : []),
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        ...(input.trim() ? [{ role: 'user', content: input.trim() }] : []),
      ];
      const res = await playgroundApi.tokenCount({
        model,
        messages: messagesForCount,
        prompt: input.trim() || run.systemInstructions,
      });
      if (!res.success || !res.data) {
        setTokenHint(null);
        return;
      }
      const data = res.data as { total_tokens?: number; prompt_tokens?: number };
      const n = data.total_tokens ?? data.prompt_tokens;
      setTokenHint(n != null ? t('tokenCount', { n: String(n) }) : null);
    }, 400);
    return () => clearTimeout(handle);
  }, [
    caps?.token_counter_available,
    modality,
    model,
    input,
    run.systemInstructions,
    messages,
    t,
  ]);

  function openaiTools(): unknown[] | undefined {
    const canTools = Boolean(caps?.supports_tools || selectedModel?.supports_tools);
    if (!canTools) return undefined;
    if (!run.functionCalling && !run.webSearch) return undefined;
    const list: unknown[] = [];
    if (run.functionCalling) {
      const selected = (caps?.tools.mcp || []).filter(
        (tool) => run.selectedTools.length === 0 || run.selectedTools.includes(tool.name),
      );
      for (const tool of selected) {
        list.push({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema || { type: 'object', properties: {} },
          },
        });
      }
    }
    if (run.webSearch) list.push(WEB_SEARCH_TOOL);
    return list.length ? list : undefined;
  }

  function chatPayload(userMessages: Msg[], stream: boolean): Record<string, unknown> {
    const msgs: Array<{ role: string; content: string }> = [];
    if (run.systemInstructions.trim()) {
      msgs.push({ role: 'system', content: run.systemInstructions.trim() });
    }
    for (const m of userMessages) {
      if (m.role === 'system') continue;
      msgs.push({ role: m.role, content: m.content });
    }
    const payload: Record<string, unknown> = {
      model: model || 'llama-3.3-70b',
      messages: msgs,
      stream,
    };
    if (!paramsKnown || hasOpenAiParam(params, 'temperature')) {
      payload.temperature = run.temperature;
    }
    if (!paramsKnown || hasOpenAiParam(params, 'max_tokens')) {
      payload.max_tokens = run.maxTokens;
    }
    if (hasOpenAiParam(params, 'top_p')) payload.top_p = run.topP;
    if (hasOpenAiParam(params, 'reasoning_effort')) {
      payload.reasoning_effort = run.reasoningEffort;
    }
    if (hasOpenAiParam(params, 'thinking')) {
      const budget =
        run.thinkingLevel === 'high' ? 10000 : run.thinkingLevel === 'low' ? 1024 : 4096;
      payload.thinking = { type: 'enabled', budget_tokens: budget };
    }
    const tools = openaiTools();
    if (tools) {
      payload.tools = tools;
      payload.tool_choice = 'auto';
    }
    if (run.structuredOutput) {
      try {
        payload.response_format = {
          type: 'json_schema',
          json_schema: JSON.parse(run.jsonSchemaText),
        };
      } catch {
        /* ignore invalid schema */
      }
    }
    return payload;
  }

  const curlSnippet = useMemo(() => {
    if (modality === 'embeddings') {
      return `curl ${gateway}/v1/embeddings \\
  -H "Authorization: Bearer $NOABI_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({
    model: model || 'text-embedding-3-small',
    input: embedInput.trim() || 'Hello',
  })}'`;
    }
    if (modality === 'image') {
      return `curl ${gateway}/v1/images/generations \\
  -H "Authorization: Bearer $NOABI_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({
    model: model || 'dall-e-3',
    prompt: imagePrompt.trim() || 'A cat',
  })}'`;
    }
    if (modality === 'audio') {
      return `curl ${gateway}/v1/audio/speech \\
  -H "Authorization: Bearer $NOABI_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({
    model: model || 'tts-1',
    input: audioText.trim() || 'Hello',
    voice: 'alloy',
  })}' \\
  --output speech.mp3`;
    }
    const payload = chatPayload(
      [...messages, ...(input.trim() ? [{ role: 'user' as const, content: input.trim() }] : [])],
      streamAllowed && run.streamEnabled,
    );
    return `curl ${gateway}/v1/chat/completions \\
  -H "Authorization: Bearer $NOABI_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(payload)}'`;
  }, [
    modality,
    gateway,
    model,
    embedInput,
    imagePrompt,
    audioText,
    input,
    messages,
    run,
    params,
    paramsKnown,
    streamAllowed,
    caps,
  ]);

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
    const useStream = streamAllowed && run.streamEnabled;
    const payload = chatPayload(next, useStream);

    try {
      const res = await playgroundApi.chatCompletionsStream(
        {
          api_key_id: apiKeyId,
          ...payload,
        } as any,
        ac.signal,
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `HTTP ${res.status}`);
      }

      if (!useStream) {
        const json = await res.json();
        const text =
          json?.data?.choices?.[0]?.message?.content ||
          json?.choices?.[0]?.message?.content ||
          JSON.stringify(json);
        const usage = readUsage(json?.data ?? json);
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: text,
            prompt_tokens: usage?.prompt_tokens ?? null,
            completion_tokens: usage?.completion_tokens ?? null,
          },
        ]);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No stream');
      const decoder = new TextDecoder();
      let assistant = '';
      let promptTokens: number | null = null;
      let completionTokens: number | null = null;
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
            const usage = readUsage(json);
            if (usage) {
              promptTokens = usage.prompt_tokens;
              completionTokens = usage.completion_tokens;
              setMessages((prev) => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last?.role === 'assistant') {
                  copy[copy.length - 1] = {
                    ...last,
                    content: assistant || last.content,
                    prompt_tokens: promptTokens,
                    completion_tokens: completionTokens,
                  };
                }
                return copy;
              });
            }
            const delta = json.choices?.[0]?.delta?.content || '';
            if (delta) {
              assistant += delta;
              setMessages((prev) => {
                const copy = [...prev];
                copy[copy.length - 1] = {
                  role: 'assistant',
                  content: assistant,
                  prompt_tokens: promptTokens,
                  completion_tokens: completionTokens,
                };
                return copy;
              });
            }
          } catch {
            /* ignore partial */
          }
        }
      }
      if (promptTokens != null || completionTokens != null) {
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last?.role === 'assistant') {
            copy[copy.length - 1] = {
              ...last,
              prompt_tokens: promptTokens,
              completion_tokens: completionTokens,
            };
          }
          return copy;
        });
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

  async function runEmbeddings() {
    if (!apiKeyId || selectedKey?.status !== 'active') {
      toast.error(t('missingKeyCreate'));
      return;
    }
    if (!model || !embedInput.trim()) {
      toast.error(t('missingEmbed'));
      return;
    }
    setBusy(true);
    setEmbedResult('');
    try {
      const res = await playgroundApi.embeddings({
        api_key_id: apiKeyId,
        model,
        input: embedInput.trim(),
      });
      if (!res.success) throw new Error(res.error?.message || t('error'));
      const data = res.data as any;
      const dims = data?.data?.[0]?.embedding?.length;
      setEmbedResult(
        dims
          ? t('embedOk', { dims })
          : JSON.stringify(data, null, 2).slice(0, 2000),
      );
    } catch (e: any) {
      toast.error(e.message || t('error'));
    } finally {
      setBusy(false);
    }
  }

  async function runImage() {
    if (!apiKeyId || selectedKey?.status !== 'active') {
      toast.error(t('missingKeyCreate'));
      return;
    }
    if (!model || !imagePrompt.trim()) {
      toast.error(t('missingImage'));
      return;
    }
    setBusy(true);
    setImageUrl(null);
    try {
      const res = await playgroundApi.imagesGenerations({
        api_key_id: apiKeyId,
        model,
        prompt: imagePrompt.trim(),
      });
      if (!res.success) throw new Error(res.error?.message || t('error'));
      const data = res.data as any;
      const url =
        data?.data?.[0]?.url ||
        (data?.data?.[0]?.b64_json
          ? `data:image/png;base64,${data.data[0].b64_json}`
          : null);
      if (!url) {
        setEmbedResult(JSON.stringify(data, null, 2).slice(0, 2000));
        toast.message(t('imageNoPreview'));
      } else {
        setImageUrl(url);
      }
    } catch (e: any) {
      toast.error(e.message || t('error'));
    } finally {
      setBusy(false);
    }
  }

  async function runAudio() {
    if (!apiKeyId || selectedKey?.status !== 'active') {
      toast.error(t('missingKeyCreate'));
      return;
    }
    if (!model || !audioText.trim()) {
      toast.error(t('missingAudio'));
      return;
    }
    setBusy(true);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    try {
      const res = await playgroundApi.audioSpeech({
        api_key_id: apiKeyId,
        model,
        input: audioText.trim(),
        voice: 'alloy',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      setAudioUrl(URL.createObjectURL(blob));
    } catch (e: any) {
      toast.error(e.message || t('error'));
    } finally {
      setBusy(false);
    }
  }

  async function copyCurl() {
    try {
      await navigator.clipboard.writeText(curlSnippet);
      toast.success(t('copied'));
    } catch {
      toast.error(t('copyFailed'));
    }
  }

  async function testFallback() {
    if (!apiKeyId || !model) {
      toast.error(t('missingKeyCreate'));
      return;
    }
    setFallbackTesting(true);
    try {
      const res = await playgroundApi.fallbackTest({
        api_key_id: apiKeyId,
        model,
        messages: [{ role: 'user', content: 'Reply with a single word: ok' }],
      });
      if (!res.success) throw new Error(res.error?.message || t('error'));
      const data = res.data as any;
      const text =
        data?.choices?.[0]?.message?.content ||
        data?.data?.choices?.[0]?.message?.content ||
        JSON.stringify(data).slice(0, 400);
      toast.success(text || t('fallbackOk'));
    } catch (e: any) {
      toast.error(e.message || t('error'));
    } finally {
      setFallbackTesting(false);
    }
  }

  const modalityTabs: { id: Modality; label: string }[] = [
    { id: 'chat', label: t('tabChat') },
    { id: 'embeddings', label: t('tabEmbeddings') },
    { id: 'image', label: t('tabImage') },
    { id: 'audio', label: t('tabAudio') },
  ];

  return (
    <div className="flex h-[calc(100vh-3.5rem-64px)] flex-col gap-4 p-6 md:p-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-lg font-semibold">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {modality === 'chat' ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setGetCodeOpen(true)}>
              {t('getCode')}
            </Button>
          ) : (
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
          )}
        </div>
      </div>

      <div className="inline-flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
        {modalityTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setModality(tab.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              modality === tab.id
                ? 'bg-accent-soft text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="border border-border p-3 text-sm text-muted-foreground">
          {(error as Error).message}
        </p>
      ) : null}

      <div className={modality === 'chat' ? 'grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_320px]' : 'grid gap-4 lg:grid-cols-[1fr_280px]'}>
        <div className="flex min-h-0 flex-col gap-3">
          <ApiKeySelect
            keys={keys}
            value={apiKeyId}
            onChange={setApiKeyId}
            onCreateClick={() => setCreateOpen(true)}
          />
          <ModelPicker models={models} value={model} onChange={setModel} />
          {modality !== 'chat' ? (
            <ModelInfoPanel model={selectedModel} walletBalance={ctx?.wallet_balance} />
          ) : null}

      {mode === 'curl' && modality !== 'chat' ? (
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
      ) : modality === 'chat' ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <StarterCards
            onPick={(cfg) =>
              setRun((s) => ({
                ...s,
                systemInstructions: cfg.systemInstructions,
                temperature: cfg.temperature,
                functionCalling: Boolean(cfg.functionCalling),
                structuredOutput: Boolean(cfg.structuredOutput),
                selectedTools: cfg.functionCalling
                  ? (caps?.tools.mcp || []).map((x) => x.name)
                  : s.selectedTools,
              }))
            }
          />
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
                  promptTokens={m.prompt_tokens}
                  completionTokens={m.completion_tokens}
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
            tokenHint={tokenHint}
          />
        </div>
      ) : modality === 'embeddings' ? (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <Label>{t('embedInput')}</Label>
          <Textarea
            value={embedInput}
            onChange={(e) => setEmbedInput(e.target.value)}
            rows={4}
            placeholder={t('embedPlaceholder')}
          />
          <Button disabled={busy} onClick={() => void runEmbeddings()}>
            {busy ? t('running') : t('runEmbeddings')}
          </Button>
          {embedResult ? (
            <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
              {embedResult}
            </pre>
          ) : null}
        </div>
      ) : modality === 'image' ? (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <Label>{t('imagePrompt')}</Label>
          <Textarea
            value={imagePrompt}
            onChange={(e) => setImagePrompt(e.target.value)}
            rows={3}
            placeholder={t('imagePlaceholder')}
          />
          <Button disabled={busy} onClick={() => void runImage()}>
            {busy ? t('running') : t('runImage')}
          </Button>
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={imagePrompt}
              className="max-h-80 rounded-lg border border-border object-contain"
            />
          ) : null}
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <Label>{t('audioInput')}</Label>
          <Textarea
            value={audioText}
            onChange={(e) => setAudioText(e.target.value)}
            rows={3}
            placeholder={t('audioPlaceholder')}
          />
          <Button disabled={busy} onClick={() => void runAudio()}>
            {busy ? t('running') : t('runAudio')}
          </Button>
          {audioUrl ? <audio controls src={audioUrl} className="w-full" /> : null}
        </div>
      )}
        </div>
        {modality === 'chat' ? (
          <RunSettingsPanel
            model={selectedModel}
            caps={caps}
            value={run}
            onChange={(patch) => setRun((s) => ({ ...s, ...patch }))}
            onFallbackTest={() => void testFallback()}
            fallbackTesting={fallbackTesting}
            walletBalance={ctx?.wallet_balance}
          />
        ) : null}
      </div>

      <GetCodeDialog
        open={getCodeOpen}
        onOpenChange={setGetCodeOpen}
        gateway={gateway}
        payload={chatPayload(
          [...messages, ...(input.trim() ? [{ role: 'user' as const, content: input.trim() }] : [])],
          streamAllowed && run.streamEnabled,
        )}
      />

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
