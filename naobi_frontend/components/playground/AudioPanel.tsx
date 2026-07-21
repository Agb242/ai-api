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

export function AudioPanel({ apiKeyId, model, disabled }: Props) {
  const t = useTranslations('playground');
  const [mode, setMode] = useState<'tts' | 'stt'>('tts');
  const [text, setText] = useState('');
  const [voice, setVoice] = useState('alloy');
  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  async function runTts() {
    if (!apiKeyId || !model || !text.trim()) {
      toast.error(t('missing'));
      return;
    }
    setLoading(true);
    setAudioUrl(null);
    try {
      const blob = await playgroundApi.audioSpeech({
        api_key_id: apiKeyId,
        model,
        input: text.trim(),
        voice,
      });
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
    } catch (e: any) {
      toast.error(e.message || t('error'));
    } finally {
      setLoading(false);
    }
  }

  async function runStt() {
    if (!apiKeyId || !file) {
      toast.error(t('missingAudioFile'));
      return;
    }
    setLoading(true);
    setTranscript(null);
    try {
      const res = await playgroundApi.audioTranscriptions({
        api_key_id: apiKeyId,
        model: model || undefined,
        file,
      });
      setTranscript(res.text || JSON.stringify(res));
    } catch (e: any) {
      toast.error(e.message || t('error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="inline-flex rounded-lg border border-border bg-muted p-1 self-start">
        <button
          type="button"
          onClick={() => setMode('tts')}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            mode === 'tts' ? 'bg-background shadow-sm' : 'text-muted-foreground'
          }`}
        >
          {t('audioTts')}
        </button>
        <button
          type="button"
          onClick={() => setMode('stt')}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            mode === 'stt' ? 'bg-background shadow-sm' : 'text-muted-foreground'
          }`}
        >
          {t('audioStt')}
        </button>
      </div>

      {mode === 'tts' ? (
        <>
          <div className="space-y-1.5">
            <Label>{t('audioText')}</Label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('audioPlaceholder')}
              rows={4}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('audioVoice')}</Label>
            <Input value={voice} onChange={(e) => setVoice(e.target.value)} />
          </div>
          <Button type="button" onClick={() => void runTts()} disabled={disabled || loading}>
            {loading ? t('running') : t('runSpeech')}
          </Button>
          {audioUrl ? (
            <audio controls src={audioUrl} className="w-full" />
          ) : (
            <p className="text-sm text-muted-foreground">{t('audioEmpty')}</p>
          )}
        </>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label>{t('audioFile')}</Label>
            <Input
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.webm"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>
          <Button type="button" onClick={() => void runStt()} disabled={disabled || loading}>
            {loading ? t('running') : t('runTranscription')}
          </Button>
          {transcript ? (
            <pre className="rounded-xl border border-border bg-card p-4 text-sm whitespace-pre-wrap">
              {transcript}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">{t('audioEmptyStt')}</p>
          )}
        </>
      )}
    </div>
  );
}
