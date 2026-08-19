import { LlmModel } from '../models/LlmModel';
import { litellmAdmin } from './litellm-admin.service';
import { mcpRegistryService } from './mcp-registry.service';
import { nativeToolsService } from './native-tools.service';
import logger from '../config/logger';

export type PlaygroundMcpTool = {
  name: string;
  description?: string;
  inputSchema?: unknown;
  source: 'litellm' | 'org_mcp' | 'native';
};

export type PlaygroundCapabilities = {
  params: string[];
  params_available: boolean;
  model_info: {
    id: string;
    name?: string;
    description?: string | null;
  } | null;
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

function paramSet(params: string[]): Set<string> {
  return new Set(params.map((p) => p.toLowerCase()));
}

function pickHubInfo(raw: unknown, model: string): { name?: string; description?: string | null } {
  if (!raw || typeof raw !== 'object') return {};
  const o = raw as any;
  const list = Array.isArray(o) ? o : o.data || o.models || o.model_group || [];
  const rows = Array.isArray(list) ? list : [o];
  const hit =
    rows.find((r: any) => {
      const id = String(r?.model_name || r?.model_id || r?.id || r?.model || '');
      return id === model || id.endsWith(model) || model.endsWith(id);
    }) || (rows.length === 1 ? rows[0] : o);
  return {
    name: hit?.display_name || hit?.model_info?.key || hit?.name,
    description:
      hit?.description ||
      hit?.model_info?.description ||
      hit?.litellm_params?.description ||
      null,
  };
}

export const playgroundCapabilitiesService = {
  async forModel(organizationId: string, model: string): Promise<PlaygroundCapabilities> {
    const [
      paramsRaw,
      hub,
      fallbackLl,
      mcpLl,
      searchTools,
      containers,
      prompts,
      tokenProbe,
      transformProbe,
    ] = await Promise.all([
      model ? litellmAdmin.supportedOpenaiParams(model) : Promise.resolve(null),
      model ? litellmAdmin.modelHubInfo(model) : Promise.resolve(null),
      model ? litellmAdmin.getFallback(model) : Promise.resolve(null),
      litellmAdmin.listMcpTools(),
      litellmAdmin.listSearchTools(),
      litellmAdmin.containersAvailable(),
      litellmAdmin.promptsAvailable(),
      litellmAdmin.tokenCounter({ model: model || 'gpt-4o-mini', prompt: 'ping' }),
      Promise.resolve(null),
    ]);

    const params = paramsRaw || [];
    const pset = paramSet(params);

    const dbModel = model
      ? await LlmModel.query().where({ model_id: model }).first()
      : undefined;

    let fallback = fallbackLl;
    if (!fallback?.models?.length && dbModel?.fallback_model_id) {
      fallback = { models: [dbModel.fallback_model_id] };
    }

    const hubBits = pickHubInfo(hub, model);
    const model_info = model
      ? {
          id: model,
          name: hubBits.name || dbModel?.display_name,
          description: hubBits.description || (dbModel?.metadata as any)?.description || null,
        }
      : null;

    const mcp: PlaygroundMcpTool[] = (mcpLl || []).map((t) => ({
      ...t,
      source: 'litellm' as const,
    }));

    try {
      const servers = await mcpRegistryService.listForOrg(organizationId);
      for (const server of servers.slice(0, 4)) {
        try {
          const tools = await mcpRegistryService.testConnection(organizationId, server.id);
          for (const t of (tools || []).slice(0, 8)) {
            const name = t?.name;
            if (!name || mcp.some((m) => m.name === name)) continue;
            mcp.push({
              name,
              description: t.description,
              inputSchema: t.inputSchema,
              source: 'org_mcp',
            });
          }
        } catch (err) {
          logger.warn('org MCP tools probe failed', { err, serverId: server.id });
        }
      }
    } catch (err) {
      logger.warn('org MCP list failed', { err, organizationId });
    }

    for (const t of nativeToolsService.list()) {
      if (!mcp.some((m) => m.name === t.name)) {
        mcp.push({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
          source: 'native',
        });
      }
    }

    return {
      params,
      params_available: paramsRaw != null,
      model_info,
      fallback,
      tools: {
        mcp,
        search: Array.isArray(searchTools) && searchTools.length > 0,
        containers,
      },
      supports_tools:
        pset.has('tools') ||
        pset.has('functions') ||
        pset.has('tool_choice') ||
        Boolean((dbModel?.metadata as any)?.supports_tools),
      prompts_available: prompts,
      token_counter_available: tokenProbe != null && (tokenProbe.total_tokens != null || tokenProbe.prompt_tokens != null),
      transform_available: transformProbe != null,
    };
  },
};

export function hasParam(params: string[], name: string): boolean {
  return params.map((p) => p.toLowerCase()).includes(name.toLowerCase());
}
