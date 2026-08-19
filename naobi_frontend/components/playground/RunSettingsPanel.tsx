'use client';

import { useTranslations } from 'next-intl';
import type { PlaygroundModel } from '@/lib/types/playground-model';
import type { PlaygroundCapabilities } from '@/lib/types/playground-capabilities';
import { hasOpenAiParam } from '@/lib/types/playground-capabilities';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

export type RunSettingsValue = {
  systemInstructions: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  streamEnabled: boolean;
  reasoningEffort: string;
  thinkingLevel: string;
  functionCalling: boolean;
  selectedTools: string[];
  webSearch: boolean;
  structuredOutput: boolean;
  jsonSchemaText: string;
  toolsEditorOpen: boolean;
};

type Props = {
  model: PlaygroundModel | null;
  caps: PlaygroundCapabilities | undefined;
  value: RunSettingsValue;
  onChange: (patch: Partial<RunSettingsValue>) => void;
  onOpenModelPicker?: () => void;
  onFallbackTest?: () => void;
  fallbackTesting?: boolean;
  walletBalance?: number;
};

export function RunSettingsPanel({
  model,
  caps,
  value,
  onChange,
  onFallbackTest,
  fallbackTesting,
  walletBalance,
}: Props) {
  const t = useTranslations('playground');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(true);
  const params = caps?.params || [];
  const paramsKnown = Boolean(caps?.params_available);
  const showTemp = !paramsKnown || hasOpenAiParam(params, 'temperature');
  const showReasoning = hasOpenAiParam(params, 'reasoning_effort');
  const showThinking = !showReasoning && hasOpenAiParam(params, 'thinking');
  const showMax = !paramsKnown || hasOpenAiParam(params, 'max_tokens');
  const showTopP = hasOpenAiParam(params, 'top_p');
  const showStream = !paramsKnown || hasOpenAiParam(params, 'stream');
  const showStructured =
    hasOpenAiParam(params, 'response_format') || hasOpenAiParam(params, 'json_schema');
  const mcp = caps?.tools.mcp || [];
  const toolsDisabled = !(caps?.supports_tools || model?.supports_tools);

  const desc = caps?.model_info?.description || model?.description;

  return (
    <div className="flex max-h-full flex-col gap-4 overflow-y-auto rounded-xl border border-border bg-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {t('runSettings')}
      </p>

      <div>
        <p className="font-display text-sm font-semibold">
          {caps?.model_info?.name || model?.display_name || t('selectModel')}
        </p>
        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
          {model?.id || '—'}
        </p>
        {desc ? <p className="mt-2 text-xs text-muted-foreground">{desc}</p> : null}
        {typeof walletBalance === 'number' ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {t('balance')}:{' '}
            <span className="font-mono text-foreground">
              {walletBalance.toLocaleString()} {t('credits')}
            </span>
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label>{t('systemInstructions')}</Label>
        <Textarea
          rows={4}
          value={value.systemInstructions}
          onChange={(e) => onChange({ systemInstructions: e.target.value })}
          placeholder={t('systemPlaceholder')}
          className="text-sm"
        />
      </div>

      {showTemp ? (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <Label>{t('temperature')}</Label>
            <span className="font-mono text-muted-foreground">{value.temperature.toFixed(1)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={2}
            step={0.1}
            value={value.temperature}
            onChange={(e) => onChange({ temperature: Number(e.target.value) })}
            className="w-full accent-primary"
          />
        </div>
      ) : null}

      {showReasoning ? (
        <div className="space-y-1.5">
          <Label>{t('reasoningEffort')}</Label>
          <select
            className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            value={value.reasoningEffort}
            onChange={(e) => onChange({ reasoningEffort: e.target.value })}
          >
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </div>
      ) : null}

      {showThinking ? (
        <div className="space-y-1.5">
          <Label>{t('thinking')}</Label>
          <select
            className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            value={value.thinkingLevel}
            onChange={(e) => onChange({ thinkingLevel: e.target.value })}
          >
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </div>
      ) : null}

      {showStream ? (
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="pg-stream">{t('streamToggle')}</Label>
          <Switch
            id="pg-stream"
            checked={value.streamEnabled}
            onCheckedChange={(v) => onChange({ streamEnabled: v })}
          />
        </div>
      ) : null}

      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 px-0">
            {t('advanced')}
            <ChevronDown className={`h-3.5 w-3.5 ${advancedOpen ? 'rotate-180' : ''}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 space-y-3">
          {showMax ? (
            <div className="space-y-1.5">
              <Label>{t('maxTokens')}</Label>
              <Input
                type="number"
                min={1}
                max={128000}
                value={value.maxTokens}
                onChange={(e) => onChange({ maxTokens: Number(e.target.value) })}
              />
            </div>
          ) : null}
          {showTopP ? (
            <div className="space-y-1.5">
              <Label>top_p</Label>
              <Input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={value.topP}
                onChange={(e) => onChange({ topP: Number(e.target.value) })}
              />
            </div>
          ) : null}
        </CollapsibleContent>
      </Collapsible>

      <Collapsible open={toolsOpen} onOpenChange={setToolsOpen}>
        <CollapsibleTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 px-0">
            {t('toolsSection')}
            <ChevronDown className={`h-3.5 w-3.5 ${toolsOpen ? 'rotate-180' : ''}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm">{t('functionCalling')}</p>
              <p className="text-[11px] text-muted-foreground">{t('functionCallingHint')}</p>
            </div>
            <Switch
              checked={value.functionCalling}
              disabled={toolsDisabled}
              onCheckedChange={(v) => onChange({ functionCalling: v })}
            />
          </div>
          {value.functionCalling && !toolsDisabled ? (
            <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border border-border p-2">
              {mcp.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">{t('noTools')}</p>
              ) : (
                mcp.map((tool) => (
                  <label key={tool.name} className="flex items-start gap-2 text-xs">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={value.selectedTools.includes(tool.name)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...value.selectedTools, tool.name]
                          : value.selectedTools.filter((n) => n !== tool.name);
                        onChange({ selectedTools: next });
                      }}
                    />
                    <span>
                      <span className="font-mono">{tool.name}</span>
                      {tool.description ? (
                        <span className="block text-muted-foreground">{tool.description}</span>
                      ) : null}
                    </span>
                  </label>
                ))
              )}
            </div>
          ) : null}

          {caps?.tools.search ? (
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm">{t('webSearch')}</p>
              <Switch
                checked={value.webSearch}
                disabled={toolsDisabled}
                onCheckedChange={(v) => onChange({ webSearch: v })}
              />
            </div>
          ) : null}

          {showStructured ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm">{t('structuredOutputs')}</p>
                <Switch
                  checked={value.structuredOutput}
                  onCheckedChange={(v) => onChange({ structuredOutput: v })}
                />
              </div>
              {value.structuredOutput ? (
                <Textarea
                  rows={8}
                  className="font-mono text-[11px]"
                  value={value.jsonSchemaText}
                  onChange={(e) => onChange({ jsonSchemaText: e.target.value })}
                />
              ) : null}
            </div>
          ) : null}
        </CollapsibleContent>
      </Collapsible>

      {caps?.fallback?.models?.length ? (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <p className="text-sm font-medium">{t('fallbackChain')}</p>
          <ul className="space-y-1 font-mono text-[11px] text-muted-foreground">
            {caps.fallback.models.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          {onFallbackTest ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={fallbackTesting}
              onClick={onFallbackTest}
            >
              {t('testFallback')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
