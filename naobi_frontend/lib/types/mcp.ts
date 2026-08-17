export type McpAuthType = 'none' | 'bearer';

export type McpServerSummary = {
  id: string;
  name: string;
  url: string;
  auth_type: McpAuthType;
  has_token: boolean;
  enabled: boolean;
  created_at: string;
};

export type McpToolPreview = {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
};

export type CreateMcpServerPayload = {
  name: string;
  url: string;
  auth_type: McpAuthType;
  bearer_token?: string;
};
