'use client';

import { useTranslations } from 'next-intl';
import type { StarterConfig } from '@/components/playground/StarterCards';
import { Button } from '@/components/ui/button';

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
  onCreateKey?: () => void;
  needsKey?: boolean;
};

export function ChatEmptyState({ onPick, onCreateKey, needsKey }: Props) {
  const t = useTranslations('playground');

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center px-6 py-8">
      <h2 className="font-display text-3xl font-semibold tracking-tight">{t('emptyTitle')}</h2>
      <p className="mt-3 max-w-lg text-center text-sm leading-relaxed text-muted-foreground">
        {t('emptyBody')}
      </p>
      {needsKey ? (
        <div className="mt-8 w-full max-w-md rounded-2xl border border-border bg-muted/40 px-6 py-5 text-center">
          <p className="text-sm font-medium">{t('needKey')}</p>
          {onCreateKey ? (
            <Button type="button" className="mt-4 rounded-full" onClick={onCreateKey}>
              {t('createKey')}
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="mt-10 grid w-full gap-3 sm:grid-cols-3">
          {STARTERS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onPick(s)}
              className="rounded-2xl border border-border bg-background px-4 py-5 text-left transition hover:border-primary/40 hover:bg-accent-soft"
            >
              <p className="text-sm font-medium">{t(`starter_${s.id}` as 'starter_assistant')}</p>
              <p className="mt-1.5 line-clamp-3 text-xs text-muted-foreground">
                {t(`starterHint_${s.id}` as 'starterHint_assistant')}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
