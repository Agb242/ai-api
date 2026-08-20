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
import { ChatMessage } from '@/components/playground/ChatMessage';
import { RunSettingsPanel, type RunSettingsValue } from '@/components/playground/RunSettingsPanel';
import { GetCodeDialog } from '@/components/playground/GetCodeDialog';
import { ChatEmptyState } from '@/components/sandbox/ChatEmptyState';
import { CreateApiKeyDialog } from '@/components/keys/CreateApiKeyDialog';
import { RevealApiKeyDialog } from '@/components/keys/RevealApiKeyDialog';
import { CapabilityTabs } from '@/components/sandbox/CapabilityTabs';
import { PromptComposer } from '@/components/sandbox/PromptComposer';
import { EmbeddingWorkspace } from '@/components/sandbox/EmbeddingWorkspace';
import { ImageWorkspace } from '@/components/sandbox/ImageWorkspace';
import { AudioWorkspace } from '@/components/sandbox/AudioWorkspace';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAuthStore } from '@/lib/stores/auth.store';
import {
  availableCapabilities,
  filterModelsByCapability,
  inferModelKindsFromRow,
  type SandboxCapability,
} from '@/lib/sandbox/model-kinds';
import { Plus, SlidersHorizontal } from 'lucide-react';

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
type Modality = SandboxCapability;

const LANGUAGE_MIRROR =
  "Always reply in the same language as the user's latest message. If they write in French, reply in French. Never switch to Spanish or another language unless the user wrote in that language.";

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
  const [settingsOpen, setSettingsOpen] = useState(false);
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
      kinds: inferModelKindsFromRow({
        id: m.id || m.model_id,
        capabilities: Array.isArray(m.capabilities) ? m.capabilities : [],
        kinds: m.kinds,
        metadata: m.metadata,
      }),
      supports_streaming: m.supports_streaming !== false,
      supports_vision: Boolean(m.supports_vision),
      supports_tools: Boolean(m.supports_tools),
      description: m.description ?? null,
      updated_at: m.updated_at ?? null,
    })) as PlaygroundModel[];
  }, [modelsPayload]);

  const selectedModel = models.find((m) => m.id === model) || null;
  const capsAvailable = useMemo(() => availableCapabilities(models), [models]);
  const compatibleModels = useMemo(
    () => filterModelsByCapability(models, modality),
    [models, modality],
  );

  useEffect(() => {
    if (capsAvailable.length && !capsAvailable.includes(modality)) {
      setModality(capsAvailable[0]);
    }
  }, [capsAvailable, modality]);

  useEffect(() => {
    if (!compatibleModels.length) return;
    if (!compatibleModels.some((m) => m.id === model)) {
      setModel(compatibleModels[0].id);
    }
  }, [compatibleModels, model]);

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
          ? [
              {
                role: 'system',
                content: `${LANGUAGE_MIRROR}\n\n${run.systemInstructions.trim()}`,
              },
            ]
          : [{ role: 'system', content: LANGUAGE_MIRROR }]),
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
    const extra = run.systemInstructions.trim();
    msgs.push({
      role: 'system',
      content: extra ? `${LANGUAGE_MIRROR}\n\n${extra}` : LANGUAGE_MIRROR,
    });
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

  const settingsPanel = (
    <RunSettingsPanel
      model={selectedModel}
      caps={caps}
      value={run}
      onChange={(patch) => setRun((s) => ({ ...s, ...patch }))}
      onFallbackTest={() => void testFallback()}
      fallbackTesting={fallbackTesting}
      walletBalance={ctx?.wallet_balance}
      capability={modality}
      variant="flush"
      header={
        <div className="space-y-3">
          <ApiKeySelect
            keys={keys}
            value={apiKeyId}
            onChange={setApiKeyId}
            onCreateClick={() => setCreateOpen(true)}
          />
          <ModelPicker models={compatibleModels} value={model} onChange={setModel} />
        </div>
      }
      getCodeSlot={
        modality === 'chat' ? (
          <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setGetCodeOpen(true)}>
            {t('getCode')}
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => void copyCurl()}>
            {t('copyCurl')}
          </Button>
        )
      }
    />
  );

  return (
    <div className="absolute inset-0 flex min-h-0 flex-col overflow-hidden bg-background">
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
            <CapabilityTabs available={capsAvailable} value={modality} onChange={setModality} />
            <div className="flex items-center gap-1.5">
              {modality !== 'chat' ? (
                <div className="mr-1 hidden rounded-full bg-muted p-0.5 sm:inline-flex">
                  <button
                    type="button"
                    onClick={() => setMode('playground')}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      mode === 'playground' ? 'bg-background shadow-sm' : 'text-muted-foreground'
                    }`}
                  >
                    {t('tabPlayground')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('curl')}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      mode === 'curl' ? 'bg-background shadow-sm' : 'text-muted-foreground'
                    }`}
                  >
                    {t('tabCurl')}
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setMessages([])}
                  aria-label={t('newChat')}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="lg:hidden"
                onClick={() => setSettingsOpen(true)}
              >
                <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
                {t('openSettings')}
              </Button>
            </div>
          </header>

          {error ? (
            <p className="border-b border-border px-4 py-2 text-sm text-muted-foreground">
              {(error as Error).message}
            </p>
          ) : null}

          {mode === 'curl' && modality !== 'chat' ? (
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-6">
              <p className="text-xs text-muted-foreground">
                {t('gateway')}: <code className="font-mono">{gateway}</code>
              </p>
              <p className="text-xs text-muted-foreground">{t('curlKeyHint')}</p>
              <pre className="overflow-x-auto rounded-2xl border border-border bg-muted/40 p-5 font-mono text-[11px] whitespace-pre-wrap">
                {curlSnippet}
              </pre>
              <Button onClick={() => void copyCurl()}>{t('copyCurl')}</Button>
            </div>
          ) : !compatibleModels.length ? (
            <p className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
              {t('noModelsForCapability')}
            </p>
          ) : modality === 'chat' ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto">
                {messages.length === 0 ? (
                  <ChatEmptyState
                    needsKey={!apiKeyId || selectedKey?.status !== 'active'}
                    onCreateKey={() => setCreateOpen(true)}
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
                ) : (
                  <div className="mx-auto w-full max-w-3xl space-y-6 px-6 py-8">
                    {messages.map((m, i) => (
                      <ChatMessage
                        key={i}
                        role={m.role}
                        content={m.content}
                        streaming={streaming && i === messages.length - 1 && m.role === 'assistant'}
                        userInitials={userInitials}
                        promptTokens={m.prompt_tokens}
                        completionTokens={m.completion_tokens}
                      />
                    ))}
                  </div>
                )}
              </div>
              <PromptComposer
                value={input}
                onChange={setInput}
                onSend={() => void sendChat()}
                onStop={stop}
                streaming={streaming}
                disabled={!apiKeyId || selectedKey?.status !== 'active'}
                tokenHint={tokenHint}
                placeholder={t('composerPlaceholder')}
                sendLabel={t('run')}
                stopLabel={t('stop')}
                toolsLabel={t('toolsSection')}
                toolsHint={t('functionCallingHint')}
                showTools={Boolean(caps?.supports_tools || selectedModel?.supports_tools)}
                toolsEnabled={run.functionCalling}
                onToolsChange={(v) => setRun((s) => ({ ...s, functionCalling: v }))}
                toolsDisabled={!(caps?.supports_tools || selectedModel?.supports_tools)}
              />
            </div>
          ) : modality === 'embeddings' ? (
            <EmbeddingWorkspace
              value={embedInput}
              onChange={setEmbedInput}
              result={embedResult}
              busy={busy}
              onRun={() => void runEmbeddings()}
            />
          ) : modality === 'image' ? (
            <ImageWorkspace
              prompt={imagePrompt}
              onChange={setImagePrompt}
              imageUrl={imageUrl}
              busy={busy}
              onRun={() => void runImage()}
            />
          ) : (
            <AudioWorkspace
              value={audioText}
              onChange={setAudioText}
              audioUrl={audioUrl}
              busy={busy}
              onRun={() => void runAudio()}
            />
          )}
        </div>

        <aside className="hidden h-full min-h-0 w-[360px] shrink-0 overflow-hidden border-l border-border lg:flex lg:flex-col">
          {settingsPanel}
        </aside>
      </div>

      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{t('runSettings')}</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">{settingsPanel}</div>
        </SheetContent>
      </Sheet>

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
