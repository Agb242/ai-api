import type { ModelKind } from '@/lib/sandbox/model-kinds';

export type PlaygroundModel = {
  id: string;
  display_name: string;
  provider: string;
  status: string;
  price_input_per_1k: number;
  price_output_per_1k: number;
  context_window?: number | null;
  max_tokens?: number | null;
  capabilities: string[];
  kinds: ModelKind[];
  supports_streaming?: boolean;
  supports_vision?: boolean;
  supports_tools?: boolean;
  description?: string | null;
  updated_at?: string | null;
};

export function formatUsdPerM(per1k: number): string {
  const perM = per1k * 1000;
  if (!perM) return '—';
  return `${perM.toFixed(2)} USD/M`;
}

export function statusDotClass(status: string): string {
  if (status === 'available' || status === 'active') return 'bg-[hsl(var(--success))]';
  if (status === 'degraded' || status === 'testing') return 'bg-[hsl(var(--warning))]';
  return 'bg-muted-foreground';
}
