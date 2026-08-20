'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { playgroundApi } from '@/lib/api/playground.api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type Tab = 'python' | 'node' | 'curl';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  gateway: string;
  payload: Record<string, unknown>;
};

export function GetCodeDialog({ open, onOpenChange, gateway, payload }: Props) {
  const t = useTranslations('playground');
  const [tab, setTab] = useState<Tab>('python');
  const [curlOverride, setCurlOverride] = useState<string | null>(null);

  const python = useMemo(
    () => `import os
from openai import OpenAI

client = OpenAI(
    base_url="${gateway}/v1",
    api_key=os.environ["NOABI_API_KEY"],
)

resp = client.chat.completions.create(
    **${JSON.stringify(payload, null, 4).replace(/\n/g, '\n    ')}
)
print(resp.choices[0].message.content)
`,
    [gateway, payload],
  );

  const node = useMemo(
    () => `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${gateway}/v1",
  apiKey: process.env.NOABI_API_KEY,
});

const resp = await client.chat.completions.create(${JSON.stringify(payload, null, 2)});
console.log(resp.choices[0].message.content);
`,
    [gateway, payload],
  );

  const curlLocal = useMemo(
    () => `curl ${gateway}/v1/chat/completions \\
  -H "Authorization: Bearer $NOABI_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(payload)}'`,
    [gateway, payload],
  );

  async function loadTransform() {
    const res = await playgroundApi.transformRequest(payload);
    if (res.success && res.data) {
      const body =
        typeof res.data === 'string' ? res.data : JSON.stringify(res.data, null, 2);
      setCurlOverride(`curl ${gateway}/v1/chat/completions \\
  -H "Authorization: Bearer $NOABI_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${body.replace(/'/g, "'\\''")}'`);
    } else {
      setCurlOverride(null);
    }
  }

  const snippet = tab === 'python' ? python : tab === 'node' ? node : curlOverride || curlLocal;

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      toast.success(t('copied'));
    } catch {
      toast.error(t('copyFailed'));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (v) void loadTransform();
        else setCurlOverride(null);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('getCode')}</DialogTitle>
        </DialogHeader>
        <div className="inline-flex gap-1 rounded-lg border border-border bg-muted p-1">
          {(['python', 'node', 'curl'] as Tab[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                tab === id ? 'bg-background shadow-sm' : 'text-muted-foreground'
              }`}
            >
              {id === 'python' ? 'Python' : id === 'node' ? 'Node' : 'cURL'}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{t('curlKeyHint')}</p>
        <pre className="max-h-[50vh] overflow-auto rounded-lg border border-border bg-muted p-3 font-mono text-[11px] whitespace-pre-wrap">
          {snippet}
        </pre>
        <Button type="button" onClick={() => void copy()}>
          {t('copyCode')}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
