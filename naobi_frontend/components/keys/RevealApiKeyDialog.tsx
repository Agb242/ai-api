'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { getGatewayBase } from '@/lib/gateway-url';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Link } from '@/i18n/routing';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plaintext: string | null;
  keyName?: string;
};

export function RevealApiKeyDialog({ open, onOpenChange, plaintext, keyName }: Props) {
  const t = useTranslations('keys');
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!plaintext) return;
    try {
      await navigator.clipboard.writeText(plaintext);
      setCopied(true);
      toast.success(t('copied'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('copyFailed'));
    }
  }

  const curl = plaintext
    ? `curl ${getGatewayBase()}/v1/chat/completions \\\n  -H "Authorization: Bearer ${plaintext}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"openai/gpt-4o-mini","messages":[{"role":"user","content":"Hello"}]}'`
    : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t('revealTitle')}</DialogTitle>
          <DialogDescription>{t('revealWarning')}</DialogDescription>
        </DialogHeader>
        {plaintext ? (
          <div className="space-y-3">
            {keyName ? (
              <p className="text-xs text-muted-foreground">
                {t('name')}: <span className="font-medium text-foreground">{keyName}</span>
              </p>
            ) : null}
            <div className="rounded-md border border-[hsl(var(--warning)/0.4)] bg-muted p-3">
              <code className="block break-all font-mono text-xs">{plaintext}</code>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void copy()}>
                {copied ? t('copied') : t('copy')}
              </Button>
              <Button asChild variant="outline">
                <Link href="/playground">{t('openPlayground')}</Link>
              </Button>
            </div>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">{t('copyCurl')}</p>
              <pre className="max-h-32 overflow-auto rounded border border-border bg-card p-3 font-mono text-[11px] whitespace-pre-wrap">
                {curl}
              </pre>
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            {t('revealDone')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
