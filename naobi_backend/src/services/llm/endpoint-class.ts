/**
 * Classify OpenAI-compatible / curated gateway paths for prepare + proxy behavior.
 */

export type EndpointClass =
  | 'chat'
  | 'completions'
  | 'embeddings'
  | 'images'
  | 'audio'
  | 'moderations'
  | 'rerank'
  | 'responses'
  | 'files'
  | 'batches'
  | 'models'
  | 'anthropic'
  | 'google'
  | 'unsupported';

export interface ClassifiedEndpoint {
  class: EndpointClass;
  /** Path to forward to LiteLLM (always with leading /) */
  upstreamPath: string;
  /** Apply text filters (chat / completions / responses / anthropic messages) */
  applyFilters: boolean;
  /** Response may be binary (TTS) */
  binaryResponse: boolean;
  /** Request may be multipart (transcriptions, image edits) */
  multipart: boolean;
}

function normalizePath(path: string): string {
  const p = path.split('?')[0] || '/';
  if (!p.startsWith('/')) return `/${p}`;
  return p.replace(/\/+$/, '') || '/';
}

/** Paths allowed on the public gateway (Phase A allowlist). */
const ALLOWLIST: Array<{
  method: string | '*';
  pattern: RegExp;
  class: EndpointClass;
  applyFilters?: boolean;
  binaryResponse?: boolean;
  multipart?: boolean;
}> = [
  { method: 'POST', pattern: /^\/v1\/chat\/completions$/, class: 'chat', applyFilters: true },
  { method: 'POST', pattern: /^\/v1\/completions$/, class: 'completions', applyFilters: true },
  { method: 'POST', pattern: /^\/v1\/embeddings$/, class: 'embeddings' },
  { method: 'POST', pattern: /^\/embeddings$/, class: 'embeddings' },
  { method: 'POST', pattern: /^\/v1\/images\/generations$/, class: 'images' },
  { method: 'POST', pattern: /^\/v1\/images\/edits$/, class: 'images', multipart: true },
  { method: 'POST', pattern: /^\/v1\/audio\/speech$/, class: 'audio', binaryResponse: true },
  {
    method: 'POST',
    pattern: /^\/v1\/audio\/transcriptions$/,
    class: 'audio',
    multipart: true,
  },
  { method: 'POST', pattern: /^\/v1\/audio\/translations$/, class: 'audio', multipart: true },
  { method: 'POST', pattern: /^\/v1\/moderations$/, class: 'moderations', applyFilters: true },
  { method: 'POST', pattern: /^\/moderations$/, class: 'moderations', applyFilters: true },
  { method: 'POST', pattern: /^\/v1\/rerank$/, class: 'rerank', applyFilters: true },
  { method: 'POST', pattern: /^\/rerank$/, class: 'rerank', applyFilters: true },
  { method: 'POST', pattern: /^\/v1\/responses$/, class: 'responses', applyFilters: true },
  { method: 'GET', pattern: /^\/v1\/responses\/[^/]+$/, class: 'responses' },
  { method: 'DELETE', pattern: /^\/v1\/responses\/[^/]+$/, class: 'responses' },
  { method: 'POST', pattern: /^\/v1\/responses\/[^/]+\/cancel$/, class: 'responses' },
  { method: 'POST', pattern: /^\/v1\/responses\/compact$/, class: 'responses' },
  { method: 'GET', pattern: /^\/v1\/files$/, class: 'files' },
  { method: 'POST', pattern: /^\/v1\/files$/, class: 'files', multipart: true },
  { method: 'GET', pattern: /^\/v1\/files\/[^/]+$/, class: 'files' },
  { method: 'DELETE', pattern: /^\/v1\/files\/[^/]+$/, class: 'files' },
  { method: 'GET', pattern: /^\/v1\/files\/[^/]+\/content$/, class: 'files', binaryResponse: true },
  { method: 'GET', pattern: /^\/v1\/batches$/, class: 'batches' },
  { method: 'POST', pattern: /^\/v1\/batches$/, class: 'batches' },
  { method: 'GET', pattern: /^\/v1\/batches\/[^/]+$/, class: 'batches' },
  { method: 'POST', pattern: /^\/v1\/batches\/[^/]+\/cancel$/, class: 'batches' },
  { method: 'GET', pattern: /^\/v1\/models$/, class: 'models' },
  // Anthropic curated
  { method: 'POST', pattern: /^\/v1\/messages$/, class: 'anthropic', applyFilters: true },
  { method: 'POST', pattern: /^\/v1\/messages\/count_tokens$/, class: 'anthropic' },
  // Google curated (LiteLLM pass-through style paths)
  {
    method: 'POST',
    pattern: /^\/v1\/models\/[^/]+:generateContent$/,
    class: 'google',
    applyFilters: true,
  },
  {
    method: 'POST',
    pattern: /^\/v1\/models\/[^/]+:streamGenerateContent$/,
    class: 'google',
    applyFilters: true,
  },
  { method: 'POST', pattern: /^\/v1\/models\/[^/]+:countTokens$/, class: 'google' },
];

export function classifyEndpoint(method: string, path: string): ClassifiedEndpoint {
  const m = method.toUpperCase();
  const p = normalizePath(path);

  for (const rule of ALLOWLIST) {
    if (rule.method !== '*' && rule.method !== m) continue;
    if (!rule.pattern.test(p)) continue;
    return {
      class: rule.class,
      upstreamPath: p,
      applyFilters: !!rule.applyFilters,
      binaryResponse: !!rule.binaryResponse,
      multipart: !!rule.multipart,
    };
  }

  return {
    class: 'unsupported',
    upstreamPath: p,
    applyFilters: false,
    binaryResponse: false,
    multipart: false,
  };
}

export function isAllowlistedGatewayPath(method: string, path: string): boolean {
  return classifyEndpoint(method, path).class !== 'unsupported';
}

/** Rough token estimate by endpoint class (pre-wallet check). */
export function estimateTokensForClass(
  endpointClass: EndpointClass,
  body: Record<string, unknown> | null | undefined,
): number {
  if (!body) return 64;
  switch (endpointClass) {
    case 'embeddings': {
      const input = body.input;
      const text = Array.isArray(input)
        ? input.map(String).join('')
        : typeof input === 'string'
          ? input
          : JSON.stringify(input || '');
      return Math.max(16, Math.ceil(text.length / 4));
    }
    case 'images':
      return 256;
    case 'audio':
      return 128;
    case 'moderations':
    case 'rerank': {
      const t = String(body.input || body.query || JSON.stringify(body));
      return Math.max(16, Math.ceil(t.length / 4));
    }
    case 'files':
    case 'batches':
    case 'models':
      return 32;
    case 'chat':
    case 'completions':
    case 'responses':
    case 'anthropic':
    case 'google':
    default: {
      const messages = (body.messages || body.input || []) as unknown[];
      if (Array.isArray(messages) && messages.length) {
        const text = messages
          .map((m) => {
            if (typeof m === 'string') return m;
            const c = (m as any)?.content;
            return typeof c === 'string' ? c : JSON.stringify(c || m);
          })
          .join('');
        return Math.max(32, Math.ceil(text.length / 4));
      }
      const prompt = body.prompt || body.input;
      const s = typeof prompt === 'string' ? prompt : JSON.stringify(body);
      return Math.max(32, Math.ceil(s.length / 4));
    }
  }
}
