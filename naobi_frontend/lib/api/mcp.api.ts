import { apiClient } from './client';
import type { CreateMcpServerPayload, McpServerSummary, McpToolPreview } from '@/lib/types/mcp';

export const mcpApi = {
  list() {
    return apiClient.get<McpServerSummary[]>('/mcp-servers');
  },
  create(payload: CreateMcpServerPayload) {
    return apiClient.post<McpServerSummary>('/mcp-servers', payload);
  },
  remove(id: string) {
    return apiClient.delete<{ removed: boolean }>(`/mcp-servers/${id}`);
  },
  testConnection(id: string) {
    return apiClient.post<{ tools: McpToolPreview[] }>(`/mcp-servers/${id}/tools`);
  },
  listForAgent(agentId: string) {
    return apiClient.get<McpServerSummary[]>(`/agents/${agentId}/mcp-servers`);
  },
  attachToAgent(agentId: string, mcpServerId: string) {
    return apiClient.post<McpServerSummary>(`/agents/${agentId}/mcp-servers`, {
      mcp_server_id: mcpServerId,
    });
  },
  detachFromAgent(agentId: string, mcpServerId: string) {
    return apiClient.delete<{ detached: boolean }>(`/agents/${agentId}/mcp-servers/${mcpServerId}`);
  },
};
