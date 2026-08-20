'use client';

import { useTranslations } from 'next-intl';
import type { SandboxCapability } from '@/lib/sandbox/model-kinds';

type Props = {
  available: SandboxCapability[];
  value: SandboxCapability;
  onChange: (c: SandboxCapability) => void;
};

export function CapabilityTabs({ available, value, onChange }: Props) {
  const t = useTranslations('playground');
  const labels: Record<SandboxCapability, string> = {
    chat: t('tabChat'),
    embeddings: t('tabEmbeddings'),
    image: t('tabImage'),
    audio: t('tabAudio'),
  };

  if (available.length === 0) return null;

  return (
    <div className="inline-flex flex-wrap gap-0.5 rounded-full bg-muted/70 p-1">
      {available.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
            value === id
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {labels[id]}
        </button>
      ))}
    </div>
  );
}
