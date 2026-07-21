/**
 * Phase A — classify OpenAI-compatible / curated pass-through paths.
 * Only allowlisted paths should reach llmRouter.proxy.
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
  | 'anthropic'
  | 'google';

export interface ClassifiedEndpoint {
  class: EndpointClass;
  applyFilters: boolean;
  requireModel: boolean;
  binaryResponse: boolean;
  multipart: boolean;
}

/** Normalize path (strip query, trailing slash except root). */
export function normalizeGatewayPath(raw: string): string {
  const noQuery = raw.split('?')[0] || '/';
  if (noQuery.length > 1 && noQuery.endsWith('/')) return noQuery.slice(0, -1);
  return noQuery;
}

export function classifyEndpoint(method: string, path: string): ClassifiedEndpoint | null {
  const m = method.toUpperCase();
  const p = normalizeGatewayPath(path);

  if (m === 'POST' && (p === '/v1/chat/completions' || p === '/chat/completions')) {
    return { class: 'chat', applyFilters: true, requireModel: true, binaryResponse: false, multipart: false };
  }
  if (m === 'POST' && (p === '/v1/completions' || p === '/completions')) {
    return {
      class: 'completions',
      applyFilters: true,
      requireModel: true,
      binaryResponse: false,
      multipart: false,
    };
  }
  if (m === 'POST' && (p === '/v1/embeddings' || p === '/embeddings')) {
    return {
      class: 'embeddings',
      applyFilters: true,
      requireModel: true,
      binaryResponse: false,
      multipart: false,
    };
  }
  if (m === 'POST' && (p === '/v1/images/generations' || p === '/images/generations')) {
    return {
      class: 'images',
      applyFilters: true,
      requireModel: false,
      binaryResponse: false,
      multipart: false,
    };
  }
  if (m === 'POST' && (p === '/v1/images/edits' || p === '/images/edits')) {
    return {
      class: 'images',
      applyFilters: true,
      requireModel: false,
      binaryResponse: false,
      multipart: true,
    };
  }
  if (m === 'POST' && (p === '/v1/audio/speech' || p === '/audio/speech')) {
    return {
      class: 'audio',
      applyFilters: true,
      requireModel: true,
      binaryResponse: true,
      multipart: false,
    };
  }
  if (m === 'POST' && (p === '/v1/audio/transcriptions' || p === '/audio/transcriptions')) {
    return {
      class: 'audio',
      applyFilters: false,
      requireModel: false,
      binaryResponse: false,
      multipart: true,
    };
  }
  if (m === 'POST' && (p === '/v1/moderations' || p === '/moderations')) {
    return {
      class: 'moderations',
      applyFilters: true,
      requireModel: false,
      binaryResponse: false,
      multipart: false,
    };
  }
  if (m === 'POST' && (p === '/v1/rerank' || p === '/rerank')) {
    return {
      class: 'rerank',
      applyFilters: false,
      requireModel: true,
      binaryResponse: false,
      multipart: false,
    };
  }
  if (
    (m === 'POST' || m === 'GET' || m === 'DELETE') &&
    (p === '/v1/responses' ||
      p === '/responses' ||
      p === '/v1/responses/compact' ||
      p.startsWith('/v1/responses/') ||
      p.startsWith('/responses/'))
  ) {
    return {
      class: 'responses',
      applyFilters: m === 'POST',
      requireModel: false,
      binaryResponse: false,
      multipart: false,
    };
  }
  if (
    (m === 'GET' || m === 'POST' || m === 'DELETE') &&
    (p === '/v1/files' || p === '/files' || p.startsWith('/v1/files/') || p.startsWith('/files/'))
  ) {
    const isContent = p.endsWith('/content');
    return {
      class: 'files',
      applyFilters: false,
      requireModel: false,
      binaryResponse: isContent || m === 'GET',
      multipart: m === 'POST' && (p === '/v1/files' || p === '/files'),
    };
  }
  if (
    (m === 'GET' || m === 'POST') &&
    (p === '/v1/batches' ||
      p === '/batches' ||
      p.startsWith('/v1/batches/') ||
      p.startsWith('/batches/'))
  ) {
    return {
      class: 'batches',
      applyFilters: false,
      requireModel: false,
      binaryResponse: false,
      multipart: false,
    };
  }
  if (
    m === 'POST' &&
    (p === '/v1/messages' || p === '/v1/messages/count_tokens' || p.startsWith('/anthropic/'))
  ) {
    return {
      class: 'anthropic',
      applyFilters: true,
      requireModel: false,
      binaryResponse: false,
      multipart: false,
    };
  }
  if (
    (m === 'POST' || m === 'GET') &&
    (p.includes(':generateContent') ||
      p.includes(':streamGenerateContent') ||
      p.includes(':countTokens') ||
      p.startsWith('/gemini/') ||
      p.startsWith('/v1beta/models/'))
  ) {
    return {
      class: 'google',
      applyFilters: false,
      requireModel: false,
      binaryResponse: false,
      multipart: false,
    };
  }

  return null;
}

export function wantsStream(body: unknown, classified: ClassifiedEndpoint, path: string): boolean {
  if (path.includes('streamGenerateContent')) return true;
  if (
    classified.class === 'chat' ||
    classified.class === 'completions' ||
    classified.class === 'responses'
  ) {
    return !!(body as { stream?: boolean })?.stream;
  }
  return false;
}
