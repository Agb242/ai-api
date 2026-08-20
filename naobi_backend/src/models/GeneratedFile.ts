import { BaseModel } from './BaseModel';

export class GeneratedFile extends BaseModel {
  static tableName = 'generated_files';

  organization_id!: string;
  agent_id?: string | null;
  created_by?: string | null;
  filename!: string;
  mime_type!: string;
  content!: Buffer;
  size_bytes!: number;
}
