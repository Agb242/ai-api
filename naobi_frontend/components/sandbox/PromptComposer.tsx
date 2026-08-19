'use client';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Square, ArrowUp, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop?: () => void;
  streaming?: boolean;
  disabled?: boolean;
  tokenHint?: string | null;
  placeholder: string;
  sendLabel: string;
  stopLabel: string;
  toolsLabel?: string;
  toolsHint?: string;
  showTools?: boolean;
  toolsEnabled?: boolean;
  onToolsChange?: (v: boolean) => void;
  toolsDisabled?: boolean;
};

export function PromptComposer({
  value,
  onChange,
  onSend,
  onStop,
  streaming,
  disabled,
  tokenHint,
  placeholder,
  sendLabel,
  stopLabel,
  toolsLabel,
  toolsHint,
  showTools,
  toolsEnabled,
  onToolsChange,
  toolsDisabled,
}: Props) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-5 pt-2">
      <div
        className={cn(
          'rounded-[28px] border border-border bg-background shadow-[0_8px_32px_-12px_rgba(0,0,0,0.18)]',
          'focus-within:border-ring/60 focus-within:ring-2 focus-within:ring-ring/20',
        )}
      >
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (!streaming && !disabled) onSend();
            }
          }}
          placeholder={placeholder}
          disabled={streaming || disabled}
          rows={4}
          className="min-h-[112px] w-full resize-none border-0 bg-transparent px-5 pt-4 pb-1 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-60"
        />
        <div className="flex items-center gap-2 px-3 pb-3">
          {showTools ? (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(
                    'h-8 rounded-full px-3',
                    toolsEnabled ? 'border-primary/40 bg-accent-soft text-primary' : '',
                  )}
                >
                  <Wrench className="h-3.5 w-3.5" />
                  {toolsLabel}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{toolsLabel}</p>
                    {toolsHint ? (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{toolsHint}</p>
                    ) : null}
                  </div>
                  <Switch
                    checked={Boolean(toolsEnabled)}
                    disabled={toolsDisabled}
                    onCheckedChange={(v) => onToolsChange?.(v)}
                  />
                </div>
              </PopoverContent>
            </Popover>
          ) : (
            <span className="h-8" />
          )}
          {tokenHint ? (
            <p className="truncate font-mono text-[11px] text-muted-foreground">{tokenHint}</p>
          ) : null}
          <div className="ml-auto">
            {streaming ? (
              <Button type="button" variant="outline" size="sm" className="h-9 rounded-full px-4" onClick={onStop}>
                <Square className="h-3.5 w-3.5 fill-current" />
                {stopLabel}
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                className="h-9 gap-1.5 rounded-full px-4"
                onClick={onSend}
                disabled={disabled || !value.trim()}
              >
                {sendLabel}
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
