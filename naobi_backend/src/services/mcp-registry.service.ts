import { McpServer, McpAuthType } from '../models/McpServer';
import { knex } from '../config/database';
import { encryptionService } from './encryption.service';
import { mcpClientService, McpConnectionConfig } from './mcp-client.service';
import { auditService } from './audit.service';

function toConnectionConfig(server: McpServer): McpConnectionConfig {
  return {
    id: server.id,
    url: server.url,
    headers: server.headers || {},
    authType: server.auth_type,
    bearerToken: server.bearer_token_encrypted
      ? encryptionService.decryptAccessToken(server.bearer_token_encrypted)
      : null,
  };
}

function publicFields(server: McpServer) {
  return {
    id: server.id,
    name: server.name,
    url: server.url,
    auth_type: server.auth_type,
    has_token: Boolean(server.bearer_token_encrypted),
    enabled: server.enabled,
    created_at: server.created_at,
  };
}

/** Sanitize an MCP tool name into an OpenAI-compatible function name (`[a-zA-Z0-9_-]{1,64}`). */
function sanitizeToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}

export interface AgentToolDefinition {
  serverId: string;
  toolName: string;
  llmName: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export const mcpRegistryService = {
  publicFields,

  async listForOrg(organizationId: string) {
    const servers = await McpServer.query()
      .where({ organization_id: organizationId })
      .modify('notDeleted')
      .orderBy('created_at', 'desc');
    return servers.map(publicFields);
  },

  async create(params: {
    organizationId: string;
    userId: string;
    name: string;
    url: string;
    authType: McpAuthType;
    bearerToken?: string;
    headers?: Record<string, string>;
  }) {
    const server = await McpServer.query().insert({
      organization_id: params.organizationId,
      created_by: params.userId,
      name: params.name.trim().slice(0, 80),
      url: params.url.trim(),
      auth_type: params.authType,
      bearer_token_encrypted: params.bearerToken
        ? encryptionService.encryptAccessToken(params.bearerToken)
        : null,
      headers: params.headers || {},
      enabled: true,
    } as any);

    await auditService.record({
      organizationId: params.organizationId,
      actorUserId: params.userId,
      action: 'mcp_server.create',
      resourceType: 'mcp_server',
      resourceId: server.id,
      metadata: { name: params.name, url: params.url },
    });

    return publicFields(server);
  },

  async remove(organizationId: string, userId: string, id: string) {
    const server = await McpServer.query()
      .findOne({ id, organization_id: organizationId })
      .modify('notDeleted');
    if (!server) return false;

    await server.softDelete();
    mcpClientService.invalidate(id);

    await auditService.record({
      organizationId,
      actorUserId: userId,
      action: 'mcp_server.delete',
      resourceType: 'mcp_server',
      resourceId: id,
    });
    return true;
  },

  /** Connect to a server and list its tools — used by the UI to preview before attaching. */
  async testConnection(organizationId: string, id: string) {
    const server = await McpServer.query()
      .findOne({ id, organization_id: organizationId })
      .modify('notDeleted');
    if (!server) {
      throw Object.assign(new Error('MCP_SERVER_NOT_FOUND'), { code: 'MCP_SERVER_NOT_FOUND' });
    }
    return mcpClientService.listTools(toConnectionConfig(server));
  },

  async attachToAgent(organizationId: string, agentId: string, mcpServerId: string) {
    const server = await McpServer.query()
      .findOne({ id: mcpServerId, organization_id: organizationId })
      .modify('notDeleted');
    if (!server) {
      throw Object.assign(new Error('MCP_SERVER_NOT_FOUND'), { code: 'MCP_SERVER_NOT_FOUND' });
    }
    await knex('agent_mcp_servers')
      .insert({ agent_id: agentId, mcp_server_id: mcpServerId })
      .onConflict(['agent_id', 'mcp_server_id'])
      .ignore();
    return publicFields(server);
  },

  async detachFromAgent(agentId: string, mcpServerId: string) {
    await knex('agent_mcp_servers')
      .where({ agent_id: agentId, mcp_server_id: mcpServerId })
      .delete();
  },

  async listForAgent(organizationId: string, agentId: string) {
    const rows = await knex('agent_mcp_servers')
      .join('mcp_servers', 'mcp_servers.id', 'agent_mcp_servers.mcp_server_id')
      .where('agent_mcp_servers.agent_id', agentId)
      .andWhere('mcp_servers.organization_id', organizationId)
      .whereNull('mcp_servers.deleted_at')
      .select('mcp_servers.*');
    return rows.map((row: any) => publicFields(McpServer.fromJson(row)));
  },

  /**
   * LLM-ready tool definitions across every enabled server attached to an agent.
   * A server that's offline or misconfigured is skipped rather than breaking the whole agent.
   */
  async listToolsForAgent(organizationId: string, agentId: string): Promise<AgentToolDefinition[]> {
    const rows = await knex('agent_mcp_servers')
      .join('mcp_servers', 'mcp_servers.id', 'agent_mcp_servers.mcp_server_id')
      .where('agent_mcp_servers.agent_id', agentId)
      .andWhere('mcp_servers.organization_id', organizationId)
      .andWhere('mcp_servers.enabled', true)
      .whereNull('mcp_servers.deleted_at')
      .select('mcp_servers.*');

    const out: AgentToolDefinition[] = [];
    for (const row of rows) {
      const server = McpServer.fromJson(row);
      try {
        const tools = await mcpClientService.listTools(toConnectionConfig(server));
        for (const tool of tools) {
          out.push({
            serverId: server.id,
            toolName: tool.name,
            llmName: sanitizeToolName(`${server.name}__${tool.name}`),
            description: tool.description,
            inputSchema: tool.inputSchema,
          });
        }
      } catch {
        continue;
      }
    }
    return out;
  },

  async callTool(
    organizationId: string,
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    const server = await McpServer.query()
      .findOne({ id: serverId, organization_id: organizationId })
      .modify('notDeleted');
    if (!server) {
      throw Object.assign(new Error('MCP_SERVER_NOT_FOUND'), { code: 'MCP_SERVER_NOT_FOUND' });
    }
    return mcpClientService.callTool(toConnectionConfig(server), toolName, args);
  },
};
