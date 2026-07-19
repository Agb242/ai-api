'use client';

import { useTranslations } from 'next-intl';
import type { PlaygroundModel } from '@/lib/types/playground-model';
import { formatUsdPerM } from '@/lib/types/playground-model';
import { Badge } from '@/components/ui/badge';

type Props = {
  model: PlaygroundModel | null;
  walletBalance?: number;
};

export function ModelInfoPanel({ model, walletBalance }: Props) {
  const t = useTranslations('playground');
  if (!model) return null;

  const caps = [
    model.context_window ? t('capContext', { n: formatContext(model.context_window) }) : null,
    model.supports_tools || model.capabilities.includes('tools') ? t('capTools') : null,
    model.supports_vision || model.capabilities.includes('vision') ? t('capVision') : null,
    model.supports_streaming !== false ? t('capStreaming') : null,
  ].filter(Boolean) as string[];

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {t('pricing')}
      </p>
      <p className="font-display text-sm font-semibold">{model.display_name}</p>
      <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{model.id}</p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] uppercase text-muted-foreground">{t('priceIn')}</p>
          <p className="font-mono text-sm font-medium">{formatUsdPerM(model.price_input_per_1k)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground">{t('priceOut')}</p>
          <p className="font-mono text-sm font-medium">{formatUsdPerM(model.price_output_per_1k)}</p>
        </div>
      </div>

      {caps.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {caps.map((c) => (
            <Badge key={c} variant="secondary" className="text-[10px] font-normal">
              {c}
            </Badge>
          ))}
        </div>
      ) : null}

      {typeof walletBalance === 'number' ? (
        <>
          <div className="my-3 h-px bg-border" />
          <p className="text-xs text-muted-foreground">
            {t('balance')}:{' '}
            <span className="font-mono font-medium text-foreground">
              {walletBalance.toLocaleString()} {t('credits')}
            </span>
          </p>
        </>
      ) : null}
    </div>
  );
}

function formatContext(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}
