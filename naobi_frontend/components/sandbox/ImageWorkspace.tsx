'use client';

import { useTranslations } from 'next-intl';
import { PromptComposer } from '@/components/sandbox/PromptComposer';

type Props = {
  prompt: string;
  onChange: (v: string) => void;
  imageUrl: string | null;
  busy: boolean;
  onRun: () => void;
};

export function ImageWorkspace({ prompt, onChange, imageUrl, busy, onRun }: Props) {
  const t = useTranslations('playground');
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={prompt}
            className="mx-auto max-h-[min(36rem,58vh)] rounded-2xl border border-border object-contain"
          />
        ) : (
          <p className="mt-16 text-center text-sm text-muted-foreground">{t('imageEmpty')}</p>
        )}
      </div>
      <PromptComposer
        value={prompt}
        onChange={onChange}
        onSend={onRun}
        streaming={busy}
        placeholder={t('imagePlaceholder')}
        sendLabel={t('runImage')}
        stopLabel={t('running')}
      />
    </div>
  );
}
