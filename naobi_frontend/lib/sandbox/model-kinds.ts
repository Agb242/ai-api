export type ModelKind = 'chat' | 'embedding' | 'image' | 'audio';

export type SandboxCapability = 'chat' | 'embeddings' | 'image' | 'audio';

const KIND_ALIASES: Record<string, ModelKind> = {
  chat: 'chat',
  completion: 'chat',
  completions: 'chat',
  embedding: 'embedding',
  embeddings: 'embedding',
  embed: 'embedding',
  image: 'image',
  images: 'image',
  image_generation: 'image',
  audio: 'audio',
  audio_speech: 'audio',
  tts: 'audio',
  speech: 'audio',
  whisper: 'audio',
};

export function inferModelKindsFromRow(m: {
  id: string;
  capabilities?: string[];
  kinds?: ModelKind[];
  metadata?: Record<string, unknown>;
}): ModelKind[] {
  if (Array.isArray(m.kinds) && m.kinds.length) return m.kinds;
  const kinds = new Set<ModelKind>();
  const caps = (m.capabilities || []).map((c) => c.toLowerCase());
  for (const token of caps) {
    const mapped = KIND_ALIASES[token];
    if (mapped) kinds.add(mapped);
    if (token.includes('embed')) kinds.add('embedding');
    if (token.includes('image')) kinds.add('image');
    if (token.includes('audio') || token.includes('speech') || token.includes('tts')) {
      kinds.add('audio');
    }
  }
  const slug = (m.id || '').toLowerCase();
  if (/(^|[/_\-.])(embed|embedding)s?([/_\-.]|$)/.test(slug)) kinds.add('embedding');
  if (/(^|[/_\-.])(tts|whisper|speech|audio)([/_\-.]|$)/.test(slug)) kinds.add('audio');
  if (/(^|[/_\-.])(dall-e|dalle|imagen|flux|stable-diffusion|image-gen)([/_\-.]|$)/.test(slug)) {
    kinds.add('image');
  }
  if (!kinds.size) kinds.add('chat');
  return Array.from(kinds);
}

export const CAPABILITY_KINDS: Record<SandboxCapability, ModelKind[]> = {
  chat: ['chat'],
  embeddings: ['embedding'],
  image: ['image'],
  audio: ['audio'],
};

export function modelMatchesCapability(
  kinds: ModelKind[],
  capability: SandboxCapability,
): boolean {
  const want = CAPABILITY_KINDS[capability];
  return kinds.some((k) => want.includes(k));
}

export function availableCapabilities<T extends { kinds: ModelKind[] }>(
  models: T[],
): SandboxCapability[] {
  const caps: SandboxCapability[] = ['chat', 'embeddings', 'image', 'audio'];
  return caps.filter((c) => models.some((m) => modelMatchesCapability(m.kinds, c)));
}

export function filterModelsByCapability<T extends { kinds: ModelKind[]; id?: string }>(
  models: T[],
  capability: SandboxCapability,
): T[] {
  return models.filter((m) => modelMatchesCapability(m.kinds, capability));
}
