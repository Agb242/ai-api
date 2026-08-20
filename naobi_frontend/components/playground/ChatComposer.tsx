'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Square } from 'lucide-react';

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop?: () => void;
  streaming?: boolean;
  disabled?: boolean;
  tokenHint?: string | null;
};

export function ChatComposer({
  value,
  onChange,
  onSend,
  onStop,
  streaming,
  disabled,
  tokenHint,
}: Props) {
  const t = useTranslations('playground');

  return (
    <div className="space-y-1">
    <div className="flex gap-2">
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!streaming && !disabled) onSend();
          }
        }}
        placeholder={t('placeholder')}
        disabled={streaming || disabled}
        rows={2}
        className="min-h-[44px] resize-none"
      />
      {streaming ? (
        <Button type="button" variant="outline" onClick={onStop} className="shrink-0 self-end">
          <Square className="h-3.5 w-3.5 fill-current" />
          {t('stop')}
        </Button>
      ) : (
        <Button type="button" onClick={onSend} disabled={disabled} className="shrink-0 self-end">
          {t('send')}
        </Button>
      )}
    </div>
      {tokenHint ? (
        <p className="px-0.5 font-mono text-[11px] text-muted-foreground">{tokenHint}</p>
      ) : null}
    </div>
  );
}
