import { BaseModel } from './BaseModel';

export class AgentTemplate extends BaseModel {
  static tableName = 'agent_templates';

  key!: string;
  metier!: string;
  icon!: string;
  default_name!: string;
  description!: string;
  tone_default!: string;
  system_prompt!: string;
  disclaimer?: string | null;
  starters?: string[];
  active!: boolean;
}
