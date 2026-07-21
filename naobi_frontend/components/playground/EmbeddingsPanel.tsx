'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { playgroundApi } from '@/lib/api/playground.api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type Props = {
  apiKeyId: string;
  model: string;
  disabled?: boolean;
};

export function EmbeddingsPanel({ apiKeyId, model, disabled }: Props) {
  const t = useTranslations('playground');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [dims, setDims] = useState<number | null>(null);
  const [preview, setPreview] = useState<number[]>([]);
  const [tokens, setTokens] = useState<number | null>(null);

  async function run() {
    if (!apiKeyId || !model || !input.trim()) {
      toast.error(t('missing'));
      return;
    }
    setLoading(true);
    try {
      const data = await playgroundApi.embeddings({
        api_key_id: apiKeyId,
        model,
        input: input.trim(),
      });
      const emb = data?.data?.[0]?.embedding as number[] | undefined;
      if (!emb?.length) {
        toast.error(t('error'));
        return;
      }
      setDims(emb.length);
      setPreview(emb.slice(0, 8));
      setTokens(data?.usage?.total_tokens ?? data?.usage?.prompt_tokens ?? null);
    } catch (e: any) {
      toast.error(e.message || t('error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="space-y-1.5">
        <Label>{t('embedInput')}</Label>
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('embedPlaceholder')}
          rows={5}
          className="resize-y"
        />
      </div>
      <Button type="button" onClick={() => void run()} disabled={disabled || loading}>
        {loading ? t('running') : t('runEmbeddings')}
      </Button>
      {dims != null ? (
        <div className="rounded-xl border border-border bg-card p-4 text-sm">
          <p className="font-medium">
            {t('embedDims', { n: dims })}
            {tokens != null ? ` · ${t('embedTokens', { n: tokens })}` : ''}
          </p>
          <p className="mt-2 font-mono text-xs text-muted-foreground break-all">
            [{preview.map((x) => x.toFixed(5)).join(', ')}, …]
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t('embedEmpty')}</p>
      )}
    </div>
  );
}
