'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

export type StarterConfig = {
  id: string;
  systemInstructions: string;
  temperature: number;
  functionCalling?: boolean;
  structuredOutput?: boolean;
};

const STARTERS: StarterConfig[] = [
  {
    id: 'assistant',
    systemInstructions: 'You are a concise assistant. Mirror the language of each user message.',
    temperature: 0.7,
  },
  {
    id: 'json',
    systemInstructions: 'Return only valid JSON matching the provided schema. No markdown.',
    temperature: 0,
    structuredOutput: true,
  },
  {
    id: 'tools',
    systemInstructions: 'Use tools when they help. Be brief after a tool result.',
    temperature: 0.3,
    functionCalling: true,
  },
];

type Props = {
  onPick: (cfg: StarterConfig) => void;
};

export function StarterCards({ onPick }: Props) {
  const t = useTranslations('playground');
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{t('starters')}</p>
      <div className="flex flex-wrap gap-2">
        {STARTERS.map((s) => (
          <Button key={s.id} type="button" size="sm" variant="outline" onClick={() => onPick(s)}>
            {t(`starter_${s.id}` as 'starter_assistant')}
          </Button>
        ))}
      </div>
    </div>
  );
}
