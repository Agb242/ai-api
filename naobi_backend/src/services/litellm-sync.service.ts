import { getCachedModels } from '../queues/litellm.queues';
import { litellmAdmin } from './litellm-admin.service';
import logger from '../config/logger';
import { LlmModel } from '../models/LlmModel';

function inferProvider(modelId: string, catalogProvider?: string | null): string {
  if (catalogProvider && catalogProvider !== 'litellm') return catalogProvider;
  const id = modelId.toLowerCase();
  if (id.includes('/')) return id.split('/')[0];
  if (id.includes('gpt') || id.includes('o1') || id.includes('o3')) return 'openai';
  if (id.includes('claude')) return 'anthropic';
  if (id.includes('gemini')) return 'google';
  if (id.includes('llama')) return 'meta';
  if (id.includes('nemotron')) return 'nvidia';
  if (id.includes('deepseek')) return 'deepseek';
  if (id.includes('mistral')) return 'mistral';
  return 'other';
}

export type ModelKind = 'chat' | 'embedding' | 'image' | 'audio';

const KIND_ALIASES: Record<string, ModelKind> = {
  chat: 'chat',
  completion: 'chat',
  completions: 'chat',
  conversational: 'chat',
  embedding: 'embedding',
  embeddings: 'embedding',
  embed: 'embedding',
  image: 'image',
  images: 'image',
  image_generation: 'image',
  image_gen: 'image',
  audio: 'audio',
  audio_speech: 'audio',
  audio_transcription: 'audio',
  tts: 'audio',
  speech: 'audio',
  whisper: 'audio',
};

function collectModeStrings(meta: Record<string, unknown>, raw: any): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === 'string' && v.trim()) out.push(v.toLowerCase());
    if (Array.isArray(v)) v.forEach(push);
  };
  push(meta.mode);
  push(meta.modes);
  push(meta.supported_modalities);
  push(meta.modality);
  push((meta.model_info as any)?.mode);
  push(raw?.mode);
  push(raw?.model_info?.mode);
  push(raw?.litellm_params?.mode);
  if (Array.isArray(meta.capabilities)) {
    for (const c of meta.capabilities) push(c);
  }
  return out;
}

/** Infer sandbox kinds from LiteLLM/catalog metadata, not vendor model names. */
export function inferModelKinds(
  id: string,
  meta: Record<string, unknown>,
  raw?: any,
  capabilities: string[] = [],
): ModelKind[] {
  const kinds = new Set<ModelKind>();
  for (const token of [...collectModeStrings(meta, raw), ...capabilities.map((c) => c.toLowerCase())]) {
    const mapped = KIND_ALIASES[token];
    if (mapped) kinds.add(mapped);
    if (token.includes('embed')) kinds.add('embedding');
    if (token.includes('image') || token.includes('vision-gen')) kinds.add('image');
    if (token === 'vision') kinds.add('chat');
    if (token.includes('audio') || token.includes('speech') || token.includes('tts')) kinds.add('audio');
  }

  const slug = id.toLowerCase();
  if (/(^|[/_\-.])(embed|embedding)s?([/_\-.]|$)/.test(slug)) kinds.add('embedding');
  if (/(^|[/_\-.])(tts|whisper|speech|audio)([/_\-.]|$)/.test(slug)) kinds.add('audio');
  if (/(^|[/_\-.])(dall-e|dalle|imagen|flux|stable-diffusion|image-gen)([/_\-.]|$)/.test(slug)) {
    kinds.add('image');
  }

  if (!kinds.size) kinds.add('chat');
  return Array.from(kinds);
}

function enrichModelRow(raw: any, catalog?: LlmModel | null) {
  const id = String(raw.id || raw.model_id || catalog?.model_id || '');
  const meta = {
    ...(typeof raw.metadata === 'object' && raw.metadata ? raw.metadata : {}),
    ...(typeof catalog?.metadata === 'object' && catalog.metadata ? catalog.metadata : {}),
  } as Record<string, unknown>;

  const capabilities: string[] = Array.isArray(meta.capabilities)
    ? (meta.capabilities as string[])
    : ['streaming'];

  const contextWindow =
    Number(meta.context_window || meta.max_input_tokens || meta.max_tokens || 0) || null;

  return {
    id,
    object: 'model',
    owned_by: raw.owned_by || inferProvider(id, catalog?.provider),
    display_name: catalog?.display_name || raw.name || id,
    provider: inferProvider(id, catalog?.provider),
    status: catalog?.status || (raw.status as string) || 'available',
    price_input_per_1k: catalog ? Number(catalog.price_input_per_1k) : Number(meta.price_input_per_1k || 0),
    price_output_per_1k: catalog
      ? Number(catalog.price_output_per_1k)
      : Number(meta.price_output_per_1k || 0),
    context_window: contextWindow,
    max_tokens: Number(meta.max_output_tokens || meta.max_tokens || 0) || null,
    capabilities,
    supports_streaming: capabilities.includes('streaming') || meta.supports_streaming !== false,
    supports_vision: capabilities.includes('vision') || Boolean(meta.supports_vision),
    supports_tools: capabilities.includes('tools') || Boolean(meta.supports_tools),
    description: (meta.description as string) || null,
    updated_at: catalog?.updated_at || raw.updated_at || null,
    metadata: meta,
    kinds: inferModelKinds(id, meta, raw, capabilities),
  };
}

/**
 * LiteLLM sync helpers — prefer Redis cache filled by BullMQ workers.
 */
export const litellmSyncService = {
  async syncOrgKeys(_organizationId: string, plaintextKeys?: Array<{ id: string; key: string }>) {
    if (!litellmAdmin.configured()) {
      return { synced: 0, litellm_healthy: false };
    }

    const healthy = await litellmAdmin.health();
    let synced = 0;

    if (plaintextKeys?.length) {
      for (const item of plaintextKeys) {
        try {
          const info = await litellmAdmin.keyInfo(item.key);
          const spend = Number((info as any).spend ?? (info as any).info?.spend ?? 0);
          const { ApiKey } = await import('../models/ApiKey');
          await ApiKey.query().findById(item.id).patch({
            litellm_spend: spend,
            litellm_synced_at: new Date().toISOString(),
          } as any);
          synced += 1;
        } catch (err) {
          logger.warn('LiteLLM key sync failed', { id: item.id, err });
        }
      }
    }

    return { synced, litellm_healthy: healthy };
  },

  async usageForKey(rawKey: string) {
    if (!litellmAdmin.configured()) {
      throw Object.assign(new Error('LITELLM_NOT_CONFIGURED'), { code: 'LITELLM_NOT_CONFIGURED' });
    }
    const healthy = await litellmAdmin.health();
    if (!healthy) {
      throw Object.assign(new Error('LITELLM_UNAVAILABLE'), { code: 'LITELLM_UNAVAILABLE' });
    }
    const [info, logs, daily] = await Promise.all([
      litellmAdmin.keyInfo(rawKey),
      litellmAdmin.spendLogs(rawKey, 20),
      litellmAdmin.spendDaily(rawKey, 7),
    ]);
    return { info, logs, daily, litellm_healthy: true };
  },

  async liveModels() {
    if (!litellmAdmin.configured()) {
      return { object: 'list', data: [], litellm_healthy: false, error: 'LITELLM_NOT_CONFIGURED' };
    }

    let rawList: any[] = [];
    let source: 'live' | 'cache' = 'live';
    let healthy = true;

    try {
      const data = await litellmAdmin.listModels();
      rawList = Array.isArray(data?.data) ? data.data : [];
      source = 'live';
      healthy = true;
    } catch {
      const cached = await getCachedModels();
      if (cached && Array.isArray((cached as any).data)) {
        rawList = (cached as any).data;
        source = 'cache';
        healthy = false;
      } else {
        return { object: 'list', data: [], litellm_healthy: false, error: 'LITELLM_UNAVAILABLE' };
      }
    }

    const catalog = await LlmModel.query();
    const byId = new Map(catalog.map((m) => [m.model_id, m]));

    const data = rawList.map((row) => {
      const id = String(row.id || row.model_id || '');
      return enrichModelRow(row, byId.get(id) || null);
    });

    return {
      object: 'list',
      data,
      litellm_healthy: healthy,
      source,
      ...(healthy ? {} : { error: 'LITELLM_UNAVAILABLE' }),
    };
  },
};
