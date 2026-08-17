import { BaseModel } from './BaseModel';

export type McpAuthType = 'none' | 'bearer';

export class McpServer extends BaseModel {
  static tableName = 'mcp_servers';

  organization_id!: string;
  created_by!: string;
  name!: string;
  url!: string;
  auth_type!: McpAuthType;
  bearer_token_encrypted?: string | null;
  headers?: Record<string, string> | null;
  enabled!: boolean;
}
