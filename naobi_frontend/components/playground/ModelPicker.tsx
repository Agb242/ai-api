'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import type { PlaygroundModel } from '@/lib/types/playground-model';
import { formatUsdPerM, statusDotClass } from '@/lib/types/playground-model';

type Props = {
  models: PlaygroundModel[];
  value: string;
  onChange: (id: string) => void;
};

export function ModelPicker({ models, value, onChange }: Props) {
  const t = useTranslations('playground');
  const [open, setOpen] = useState(false);
  const selected = models.find((m) => m.id === value);

  const groups = useMemo(() => {
    const map = new Map<string, PlaygroundModel[]>();
    for (const m of models) {
      const p = m.provider || 'other';
      if (!map.has(p)) map.set(p, []);
      map.get(p)!.push(m);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [models]);

  return (
    <div className="space-y-2">
      <Label>{t('model')}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-auto w-full justify-between px-3 py-2.5"
          >
            {selected ? (
              <span className="flex min-w-0 flex-col items-start gap-0.5 text-left">
                <span className="flex items-center gap-2 font-medium">
                  <span className={cn('h-1.5 w-1.5 rounded-full', statusDotClass(selected.status))} />
                  {selected.display_name}
                </span>
                <span className="text-[11px] text-muted-foreground">{selected.provider}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">{t('selectModel')}</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(100vw-2rem,420px)] p-0" align="start">
          <Command>
            <CommandInput placeholder={t('searchModel')} />
            <CommandList>
              <CommandEmpty>{t('noModel')}</CommandEmpty>
              {groups.map(([provider, list]) => (
                <CommandGroup key={provider} heading={provider}>
                  {list.map((m) => (
                    <CommandItem
                      key={m.id}
                      value={`${m.display_name} ${m.id} ${m.provider}`}
                      onSelect={() => {
                        onChange(m.id);
                        setOpen(false);
                      }}
                      className={cn(
                        'flex flex-col items-start gap-1 py-2.5',
                        m.id === value && 'bg-[#FF6B35] text-white data-[selected=true]:bg-[#FF6B35] data-[selected=true]:text-white',
                      )}
                    >
                      <div className="flex w-full items-center gap-2">
                        <span className={cn('h-1.5 w-1.5 rounded-full', statusDotClass(m.status))} />
                        <span className="font-medium">{m.display_name}</span>
                        {m.id === value ? <Check className="ml-auto h-4 w-4" /> : null}
                      </div>
                      <span
                        className={cn(
                          'font-mono text-[11px]',
                          m.id === value ? 'text-white/80' : 'text-muted-foreground',
                        )}
                      >
                        {m.id}
                      </span>
                      <span
                        className={cn(
                          'text-[11px]',
                          m.id === value ? 'text-white/80' : 'text-muted-foreground',
                        )}
                      >
                        {t('priceIn')} {formatUsdPerM(m.price_input_per_1k)} · {t('priceOut')}{' '}
                        {formatUsdPerM(m.price_output_per_1k)}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
