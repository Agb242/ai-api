'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import type { Agent } from '@/lib/types/agent';

type Props = {
  agents: Agent[];
  activeAgentId: string | null;
  onSelect: (agent: Agent) => void;
  onDelete: (agent: Agent) => void;
  onNewAgent: () => void;
};

/** Left rail of the agent IDE — the list of created agents, LobeChat-session-list style. */
export function AgentSessionList({ agents, activeAgentId, onSelect, onDelete, onNewAgent }: Props) {
  const t = useTranslations('agents');

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-card">
      <div className="p-3">
        <Button size="sm" className="w-full" onClick={onNewAgent}>
          + {t('newAgent')}
        </Button>
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {agents.length === 0 ? (
          <p className="p-2 text-xs text-muted-foreground">{t('noAgents')}</p>
        ) : (
          agents.map((agent) => {
            const active = agent.id === activeAgentId;
            return (
              <div
                key={agent.id}
                role="button"
                onClick={() => onSelect(agent)}
                className={cn(
                  'group flex items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors',
                  active
                    ? 'bg-accent-soft text-primary'
                    : 'text-foreground hover:bg-muted',
                )}
              >
                <span className="text-base">{agent.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{agent.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{agent.metier}</p>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded p-1 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(agent);
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
