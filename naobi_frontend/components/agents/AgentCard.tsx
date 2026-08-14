'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import type { Agent } from '@/lib/types/agent';

type Props = {
  agent: Agent;
  onOpen: (agent: Agent) => void;
  onDelete: (agent: Agent) => void;
};

export function AgentCard({ agent, onOpen, onDelete }: Props) {
  return (
    <Card size="sm" className="relative cursor-pointer transition hover:ring-primary/40">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 h-6 w-6 text-muted-foreground hover:text-destructive"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(agent);
        }}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
      <CardContent role="button" onClick={() => onOpen(agent)} className="space-y-2">
        <div className="text-2xl">{agent.icon}</div>
        <p className="text-sm font-semibold text-foreground">{agent.name}</p>
        <p className="text-xs text-muted-foreground">
          {agent.metier} · {agent.model_id}
        </p>
      </CardContent>
    </Card>
  );
}
