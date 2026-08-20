'use client';

import { useTranslations } from 'next-intl';
import { ApiKeySelect } from '@/components/playground/ApiKeySelect';
import { McpToolsPanel } from '@/components/agents/McpToolsPanel';
import type { Agent } from '@/lib/types/agent';
import type { ApiKey } from '@/lib/types/api-key';

type Props = {
  agent: Agent;
  keys: ApiKey[];
  apiKeyId: string;
  onApiKeyChange: (id: string) => void;
  onCreateKeyClick: () => void;
};

/** Right panel of the agent IDE — identity, model/key, and MCP tools, always visible. */
export function AgentInspector({ agent, keys, apiKeyId, onApiKeyChange, onCreateKeyClick }: Props) {
  const t = useTranslations('agents');

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-border bg-card p-4">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-2xl">{agent.icon}</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{agent.name}</p>
            <p className="truncate text-xs text-muted-foreground">{agent.metier}</p>
          </div>
        </div>
      </div>

      {agent.disclaimer ? (
        <p className="rounded-lg border border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/10 p-2.5 text-xs text-foreground">
          ⚠️ {agent.disclaimer}
        </p>
      ) : null}

      <dl className="grid grid-cols-2 gap-y-1.5 text-xs">
        <dt className="text-muted-foreground">{t('model')}</dt>
        <dd className="text-right font-mono">{agent.model_id}</dd>
        <dt className="text-muted-foreground">{t('temperature')}</dt>
        <dd className="text-right font-mono">{agent.temperature}</dd>
        <dt className="text-muted-foreground">{t('maxTokens')}</dt>
        <dd className="text-right font-mono">{agent.max_tokens}</dd>
      </dl>

      <details className="rounded-lg border border-border p-2.5 text-xs">
        <summary className="cursor-pointer select-none font-medium text-foreground">
          {t('systemPrompt')}
        </summary>
        <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{agent.system_prompt}</p>
      </details>

      <div className="border-t border-border pt-3">
        <ApiKeySelect
          keys={keys}
          value={apiKeyId}
          onChange={onApiKeyChange}
          onCreateClick={onCreateKeyClick}
        />
      </div>

      <div className="border-t border-border pt-3">
        <McpToolsPanel agentId={agent.id} />
      </div>
    </aside>
  );
}
