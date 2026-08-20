'use client';

import { useTranslations } from 'next-intl';
import { Label } from '@/components/ui/label';
import { PromptComposer } from '@/components/sandbox/PromptComposer';

type Props = {
  value: string;
  onChange: (v: string) => void;
  result: string;
  busy: boolean;
  onRun: () => void;
};

export function EmbeddingWorkspace({ value, onChange, result, busy, onRun }: Props) {
  const t = useTranslations('playground');
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-3xl">
          <Label className="text-base">{t('embedInput')}</Label>
          {result ? (
            <pre className="mt-6 overflow-x-auto rounded-2xl border border-border bg-muted/40 p-5 font-mono text-sm whitespace-pre-wrap">
              {result}
            </pre>
          ) : (
            <p className="mt-16 text-center text-sm text-muted-foreground">{t('embedEmpty')}</p>
          )}
        </div>
      </div>
      <PromptComposer
        value={value}
        onChange={onChange}
        onSend={onRun}
        streaming={busy}
        placeholder={t('embedPlaceholder')}
        sendLabel={t('runEmbeddings')}
        stopLabel={t('running')}
      />
    </div>
  );
}
