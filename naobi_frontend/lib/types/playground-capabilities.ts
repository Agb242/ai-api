export type PlaygroundMcpTool = {
  name: string;
  description?: string;
  inputSchema?: unknown;
  source: 'litellm' | 'org_mcp' | 'native';
};

export type PlaygroundCapabilities = {
  params: string[];
  params_available: boolean;
  model_info: { id: string; name?: string; description?: string | null } | null;
  fallback: { models: string[] } | null;
  tools: {
    mcp: PlaygroundMcpTool[];
    search: boolean;
    containers: boolean;
  };
  supports_tools: boolean;
  prompts_available: boolean;
  token_counter_available: boolean;
  transform_available: boolean;
};

export function hasOpenAiParam(params: string[] | undefined, name: string): boolean {
  if (!params?.length) return false;
  const n = name.toLowerCase();
  return params.some((p) => p.toLowerCase() === n);
}

export const DEFAULT_JSON_SCHEMA = {
  name: 'sandbox_response',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      answer: { type: 'string' },
    },
    required: ['answer'],
    additionalProperties: false,
  },
};

export const WEB_SEARCH_TOOL = {
  type: 'function' as const,
  function: {
    name: 'noabi_web_search',
    description: 'Search the public web and return snippets.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
      },
      required: ['query'],
    },
  },
};
