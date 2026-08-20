'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { agentsApi } from '@/lib/api/agents.api';
import { keysApi } from '@/lib/api/keys.api';
import { modelsApi } from '@/lib/api/models.api';
import type { Agent } from '@/lib/types/agent';
import type { ApiKey } from '@/lib/types/api-key';
import type { PlaygroundModel } from '@/lib/types/playground-model';
import { CreateAgentPanel } from '@/components/agents/CreateAgentPanel';
import { AgentSessionList } from '@/components/agents/AgentSessionList';
import { AgentInspector } from '@/components/agents/AgentInspector';
import { ChatMessage } from '@/components/playground/ChatMessage';
import { ChatComposer } from '@/components/playground/ChatComposer';
import { CreateApiKeyDialog } from '@/components/keys/CreateApiKeyDialog';
import { RevealApiKeyDialog } from '@/components/keys/RevealApiKeyDialog';
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
import { useAuthStore } from '@/lib/stores/auth.store';
import type { ApiKeyCreated } from '@/lib/types/api-key';

type Msg = {
  role: 'user' | 'assistant';
  content: string;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
};

export default function AgentsPage() {
  const t = useTranslations('agents');
  const org = useAuthStore((s) => s.org);
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null);
  const [apiKeyId, setApiKeyId] = useState('');
  const [createKeyOpen, setCreateKeyOpen] = useState(false);
  const [reveal, setReveal] = useState<ApiKeyCreated | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const { data: templates = [] } = useQuery({
    queryKey: ['agent-templates'],
    queryFn: async () => {
      const res = await agentsApi.templates();
      if (!res.success) throw new Error(res.error?.message);
      return res.data || [];
    },
    enabled: !!org?.id,
  });

  const { data: agents = [] } = useQuery({
    queryKey: ['agents', org?.id],
    queryFn: async () => {
      const res = await agentsApi.list();
      if (!res.success) throw new Error(res.error?.message);
      return res.data || [];
    },
    enabled: !!org?.id,
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

  const { data: modelsPayload } = useQuery({
    queryKey: ['playground-models', org?.id],
    queryFn: async () => {
      const res = await modelsApi.list();
      if (!res.success) throw new Error(res.error?.message);
      return res.data as { data?: PlaygroundModel[] };
    },
    enabled: !!org?.id,
  });

  const models = useMemo(() => {
    const list = Array.isArray(modelsPayload?.data) ? modelsPayload.data : [];
    return list.map((m: any) => ({
      id: m.id || m.model_id,
      display_name: m.display_name || m.id || m.model_id,
    })) as PlaygroundModel[];
  }, [modelsPayload]);

  const activeAgent = agents.find((a) => a.id === activeAgentId) || null;
  const selectedKey = keys.find((k) => k.id === apiKeyId);

  const userInitials = user?.full_name
    ? user.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() || 'U';

  const removeMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await agentsApi.remove(id);
      if (!res.success) throw new Error(res.error?.message);
    },
    onSuccess: (_data, id) => {
      toast.success(t('deleted'));
      qc.invalidateQueries({ queryKey: ['agents'] });
      setDeleteTarget(null);
      if (activeAgentId === id) setActiveAgentId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openAgent(agent: Agent) {
    setActiveAgentId(agent.id);
    setMessages([]);
    setInput('');
    if (!apiKeyId) {
      const firstActive = keys.find((k) => k.status === 'active');
      if (firstActive) setApiKeyId(firstActive.id);
    }
  }

  async function sendChat() {
    if (!activeAgent) return;
    if (!apiKeyId || selectedKey?.status !== 'active') {
      toast.error(t('missingKeyCreate'));
      return;
    }
    if (!input.trim()) return;

    const next: Msg[] = [...messages, { role: 'user', content: input.trim() }];
    setMessages(next);
    setInput('');
    setSending(true);

    try {
      const res = await agentsApi.chatCompletions(activeAgent.id, {
        api_key_id: apiKeyId,
        messages: next,
      });
      if (!res.success || !res.data) throw new Error(res.error?.message);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: res.data!.content,
          prompt_tokens: res.data!.usage.prompt_tokens,
          completion_tokens: res.data!.usage.completion_tokens,
        },
      ]);
    } catch (e: any) {
      toast.error(e.message || t('error'));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem-64px)]">
      <AgentSessionList
        agents={agents}
        activeAgentId={activeAgentId}
        onSelect={openAgent}
        onDelete={setDeleteTarget}
        onNewAgent={() => setActiveAgentId(null)}
      />

      {activeAgent ? (
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 md:p-5">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto rounded-xl border border-border bg-card p-4">
            {messages.length === 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">{t('emptyChat')}</p>
                {activeAgent.starters?.length ? (
                  <ul className="list-inside list-disc text-xs text-muted-foreground">
                    {activeAgent.starters.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              messages.map((m, i) => (
                <ChatMessage
                  key={i}
                  role={m.role}
                  content={m.content}
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
            streaming={sending}
            disabled={!apiKeyId || selectedKey?.status !== 'active'}
          />
        </div>
      ) : (
        <div className="min-w-0 flex-1 overflow-y-auto">
          <CreateAgentPanel templates={templates} models={models} onCreated={openAgent} />
        </div>
      )}

      {activeAgent ? (
        <AgentInspector
          agent={activeAgent}
          keys={keys}
          apiKeyId={apiKeyId}
          onApiKeyChange={setApiKeyId}
          onCreateKeyClick={() => setCreateKeyOpen(true)}
        />
      ) : null}

      <CreateApiKeyDialog
        open={createKeyOpen}
        onOpenChange={setCreateKeyOpen}
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

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteConfirmBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && removeMut.mutate(deleteTarget.id)}>
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
