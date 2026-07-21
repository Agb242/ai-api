'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { playgroundApi } from '@/lib/api/playground.api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';

type Props = {
  apiKeyId: string;
  model: string;
  disabled?: boolean;
};

export function ImagePanel({ apiKeyId, model, disabled }: Props) {
  const t = useTranslations('playground');
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState('1024x1024');
  const [loading, setLoading] = useState(false);
  const [src, setSrc] = useState<string | null>(null);

  async function run() {
    if (!apiKeyId || !prompt.trim()) {
      toast.error(t('missingImage'));
      return;
    }
    setLoading(true);
    setSrc(null);
    try {
      const data = await playgroundApi.imageGenerations({
        api_key_id: apiKeyId,
        model: model || undefined,
        prompt: prompt.trim(),
        n: 1,
        size,
      });
      const item = data?.data?.[0];
      if (item?.b64_json) {
        setSrc(`data:image/png;base64,${item.b64_json}`);
      } else if (item?.url) {
        setSrc(item.url);
      } else {
        toast.error(t('error'));
      }
    } catch (e: any) {
      toast.error(e.message || t('error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="space-y-1.5">
        <Label>{t('imagePrompt')}</Label>
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t('imagePlaceholder')}
          rows={4}
        />
      </div>
      <div className="space-y-1.5">
        <Label>{t('imageSize')}</Label>
        <Input value={size} onChange={(e) => setSize(e.target.value)} />
      </div>
      <Button type="button" onClick={() => void run()} disabled={disabled || loading}>
        {loading ? t('running') : t('runImage')}
      </Button>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={prompt}
          className="max-h-[420px] w-auto rounded-xl border border-border object-contain"
        />
      ) : (
        <p className="text-sm text-muted-foreground">{t('imageEmpty')}</p>
      )}
    </div>
  );
}
