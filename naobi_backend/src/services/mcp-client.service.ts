import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import logger from '../config/logger';

export interface McpConnectionConfig {
  id: string;
  url: string;
  headers?: Record<string, string> | null;
  authType: 'none' | 'bearer';
  bearerToken?: string | null;
}

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

// One MCP client per registered server, reused across requests until invalidated.
const clients = new Map<string, Client>();

function buildHeaders(config: McpConnectionConfig): Record<string, string> {
  const headers: Record<string, string> = { ...(config.headers || {}) };
  if (config.authType === 'bearer' && config.bearerToken) {
    headers.Authorization = `Bearer ${config.bearerToken}`;
  }
  return headers;
}

async function connect(config: McpConnectionConfig): Promise<Client> {
  const cached = clients.get(config.id);
  if (cached) return cached;

  let url: URL;
  try {
    url = new URL(config.url);
  } catch {
    throw Object.assign(new Error('MCP_CONNECTION_FAILED'), { code: 'MCP_CONNECTION_FAILED' });
  }

  const client = new Client({ name: 'naobi-agent', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers: buildHeaders(config) },
  });

  try {
    await client.connect(transport);
  } catch (err) {
    logger.warn('MCP connect failed', { serverId: config.id, err: (err as Error).message });
    throw Object.assign(new Error('MCP_CONNECTION_FAILED'), { code: 'MCP_CONNECTION_FAILED' });
  }

  clients.set(config.id, client);
  return client;
}

export const mcpClientService = {
  invalidate(serverId: string) {
    const client = clients.get(serverId);
    clients.delete(serverId);
    if (client) void client.close().catch(() => {});
  },

  async listTools(config: McpConnectionConfig): Promise<McpToolDefinition[]> {
    const client = await connect(config);
    try {
      const result = await client.listTools();
      return result.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as Record<string, unknown>,
      }));
    } catch (err) {
      logger.warn('MCP listTools failed', { serverId: config.id, err: (err as Error).message });
      this.invalidate(config.id);
      throw Object.assign(new Error('MCP_CONNECTION_FAILED'), { code: 'MCP_CONNECTION_FAILED' });
    }
  },

  async callTool(
    config: McpConnectionConfig,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    const client = await connect(config);
    try {
      const result = await client.callTool({ name: toolName, arguments: args });
      const blocks = Array.isArray((result as any).content) ? (result as any).content : [];
      const text = blocks
        .filter((block: any) => block?.type === 'text')
        .map((block: any) => block.text)
        .join('\n');

      if ((result as any).isError) {
        throw Object.assign(new Error(text || 'MCP tool returned an error'), {
          code: 'MCP_TOOL_CALL_FAILED',
        });
      }
      return text || JSON.stringify(blocks);
    } catch (err: any) {
      if (err?.code === 'MCP_TOOL_CALL_FAILED') throw err;
      logger.warn('MCP callTool failed', { serverId: config.id, toolName, err: err?.message });
      throw Object.assign(new Error('MCP_TOOL_CALL_FAILED'), { code: 'MCP_TOOL_CALL_FAILED' });
    }
  },
};
