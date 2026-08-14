import { apiClient } from './client';
import type { Agent, AgentTemplate, CreateAgentPayload, AgentChatResult } from '@/lib/types/agent';

export const agentsApi = {
  templates() {
    return apiClient.get<AgentTemplate[]>('/agents/templates');
  },
  list() {
    return apiClient.get<Agent[]>('/agents');
  },
  create(payload: CreateAgentPayload) {
    return apiClient.post<Agent>('/agents', payload);
  },
  remove(id: string) {
    return apiClient.delete<{ removed: boolean }>(`/agents/${id}`);
  },
  chatCompletions(
    agentId: string,
    payload: { api_key_id: string; messages: Array<{ role: string; content: string }> },
  ) {
    return apiClient.post<AgentChatResult>(`/agents/${agentId}/chat/completions`, payload);
  },
};
