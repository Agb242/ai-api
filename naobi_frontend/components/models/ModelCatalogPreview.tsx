'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { PlaygroundModel } from '@/lib/types/playground-model';
import { statusDotClass } from '@/lib/types/playground-model';
import { cn } from '@/lib/utils';

type Props = {
  models: PlaygroundModel[];
  catalogStatus?: 'available' | 'degraded';
  maxRows?: number;
};

function formatContext(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

export function ModelCatalogPreview({ models, catalogStatus, maxRows = 8 }: Props) {
  const t = useTranslations('dashboard');
  const tm = useTranslations('models');

  const rows = models.slice(0, maxRows);
  const statusLabel =
    catalogStatus === 'available' ? t('catalogStatusAvailable') : t('catalogStatusDegraded');

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-display text-sm font-semibold">{t('catalog')}</p>
          <p className="text-xs text-muted-foreground">{t('catalogSub')}</p>
        </div>
        <div className="flex items-center gap-2">
          {catalogStatus ? (
            <Badge variant="outline" className="text-[10px] font-normal">
              {statusLabel}
            </Badge>
          ) : null}
          <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
            <Link href="/models">{t('catalogViewAll')}</Link>
          </Button>
        </div>
      </div>

      {!rows.length ? (
        <p className="text-sm text-muted-foreground">{t('catalogEmpty')}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-0 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{m.display_name || m.id}</p>
                <p className="font-mono text-[10px] text-muted-foreground">{m.id}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {m.provider ? <span>{m.provider}</span> : null}
                {m.context_window ? (
                  <span>{tm('context', { n: formatContext(m.context_window) })}</span>
                ) : null}
                {m.status ? (
                  <span className="inline-flex items-center gap-1">
                    <span className={cn('h-1.5 w-1.5 rounded-full', statusDotClass(m.status))} />
                    {m.status}
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
