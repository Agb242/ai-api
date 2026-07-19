'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type { ApiKey } from '@/lib/types/api-key';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/routing';

type Props = {
  keys: ApiKey[];
  value: string;
  onChange: (id: string) => void;
  onCreateClick?: () => void;
};

export function ApiKeySelect({ keys, value, onChange, onCreateClick }: Props) {
  const t = useTranslations('playground');
  const active = keys.filter((k) => k.status === 'active');

  if (keys.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/40 px-4 py-5 text-center">
        <p className="mb-3 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <KeyRound className="h-4 w-4" />
          {t('needKey')}
        </p>
        {onCreateClick ? (
          <Button type="button" size="sm" onClick={onCreateClick}>
            + {t('createKey')}
          </Button>
        ) : (
          <Button asChild size="sm">
            <Link href="/keys">+ {t('createKey')}</Link>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label>{t('apiKey')}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={t('selectKeyPlaceholder')} />
        </SelectTrigger>
        <SelectContent>
          {keys.map((k) => (
            <SelectItem key={k.id} value={k.id} disabled={k.status !== 'active'}>
              <span className="flex items-center gap-2">
                <span className="font-medium">{k.name}</span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {k.key_prefix}…
                </span>
                <Badge variant="outline" className="text-[10px]">
                  {k.status}
                </Badge>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {active.length === 0 ? (
        <p className="text-xs text-destructive">{t('noActiveKey')}</p>
      ) : null}
    </div>
  );
}
