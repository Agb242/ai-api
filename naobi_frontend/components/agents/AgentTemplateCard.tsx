'use client';

import { Card, CardContent } from '@/components/ui/card';
import type { AgentTemplate } from '@/lib/types/agent';

type Props = {
  template: AgentTemplate;
  onSelect: (template: AgentTemplate) => void;
};

export function AgentTemplateCard({ template, onSelect }: Props) {
  return (
    <Card
      size="sm"
      role="button"
      tabIndex={0}
      onClick={() => onSelect(template)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect(template);
      }}
      className="cursor-pointer transition hover:ring-primary/40"
    >
      <CardContent className="space-y-2">
        <div className="text-2xl">{template.icon}</div>
        <p className="text-sm font-semibold text-foreground">{template.metier}</p>
        <p className="text-xs text-muted-foreground">{template.description}</p>
      </CardContent>
    </Card>
  );
}
