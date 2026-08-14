import { Model, RelationMappingsThunk } from 'objection';
import { BaseModel } from './BaseModel';

export class Agent extends BaseModel {
  static tableName = 'agents';

  organization_id!: string;
  created_by!: string;
  template_id?: string | null;
  metier!: string;
  icon!: string;
  name!: string;
  model_id!: string;
  tone!: string;
  language!: string;
  system_prompt!: string;
  disclaimer?: string | null;
  starters?: string[];

  static relationMappings: RelationMappingsThunk = () => ({
    organization: {
      relation: Model.BelongsToOneRelation,
      modelClass: require('./Organization').Organization,
      join: { from: 'agents.organization_id', to: 'organizations.id' },
    },
  });
}
