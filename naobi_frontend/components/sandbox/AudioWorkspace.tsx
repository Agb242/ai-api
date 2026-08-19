'use client';

import { useTranslations } from 'next-intl';
import { PromptComposer } from '@/components/sandbox/PromptComposer';

type Props = {
  value: string;
  onChange: (v: string) => void;
  audioUrl: string | null;
  busy: boolean;
  onRun: () => void;
};

export function AudioWorkspace({ value, onChange, audioUrl, busy, onRun }: Props) {
  const t = useTranslations('playground');
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        {audioUrl ? (
          <audio controls src={audioUrl} className="mx-auto mt-10 block w-full max-w-xl" />
        ) : (
          <p className="mt-16 text-center text-sm text-muted-foreground">{t('audioEmpty')}</p>
        )}
      </div>
      <PromptComposer
        value={value}
        onChange={onChange}
        onSend={onRun}
        streaming={busy}
        placeholder={t('audioPlaceholder')}
        sendLabel={t('runAudio')}
        stopLabel={t('running')}
      />
    </div>
  );
}
