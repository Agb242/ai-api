/** Parse attribution headers from a Koa-like request header map. */
export function parseAttributionHeaders(
  headers: Record<string, string | string[] | undefined>,
): { endUserId?: string; tags: string[]; extraHeaders: Record<string, string> } {
  const get = (name: string) => {
    const v = headers[name] ?? headers[name.toLowerCase()];
    if (Array.isArray(v)) return v[0];
    return typeof v === 'string' ? v : undefined;
  };

  const endUserId = (get('x-user-id') || get('x-end-user-id') || '').trim() || undefined;
  const tagsRaw = (get('x-tags') || '').trim();
  const tags = tagsRaw
    ? tagsRaw
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  const extraHeaders: Record<string, string> = {};
  if (endUserId) {
    extraHeaders['X-User-Id'] = endUserId;
    // LiteLLM end-user convention
    extraHeaders['X-LiteLLM-End-User'] = endUserId;
  }
  if (tags.length) {
    extraHeaders['X-Tags'] = tags.join(',');
  }

  return { endUserId, tags, extraHeaders };
}

/** Inject end_user + tags into OpenAI-compatible JSON body for LiteLLM spend attribution. */
export function injectAttributionIntoBody(
  body: Record<string, unknown>,
  attrs: { endUserId?: string; tags: string[] },
): Record<string, unknown> {
  const next = { ...body };
  if (attrs.endUserId) {
    next.user = attrs.endUserId;
  }
  if (attrs.tags.length) {
    const meta =
      next.metadata && typeof next.metadata === 'object' && !Array.isArray(next.metadata)
        ? { ...(next.metadata as Record<string, unknown>) }
        : {};
    const existingTags = Array.isArray(meta.tags)
      ? (meta.tags as unknown[]).map(String)
      : [];
    meta.tags = [...new Set([...existingTags, ...attrs.tags])];
    next.metadata = meta;
    // LiteLLM also accepts top-level tags on some endpoints
    if (!Array.isArray(next.tags)) {
      next.tags = attrs.tags;
    }
  }
  return next;
}
