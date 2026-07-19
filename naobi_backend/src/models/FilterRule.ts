import { Model, RelationMappingsThunk } from 'objection';
import { BaseModel } from './BaseModel';

export type FilterRuleType = 'regex' | 'keyword';
export type FilterAction = 'block' | 'redact';

export class FilterRule extends BaseModel {
  static tableName = 'filter_rules';

  organization_id!: string;
  created_by!: string;
  name!: string;
  type!: FilterRuleType;
  pattern!: string;
  action!: FilterAction;
  active!: boolean;

  static relationMappings: RelationMappingsThunk = () => ({
    organization: {
      relation: Model.BelongsToOneRelation,
      modelClass: require('./Organization').Organization,
      join: { from: 'filter_rules.organization_id', to: 'organizations.id' },
    },
  });
}
