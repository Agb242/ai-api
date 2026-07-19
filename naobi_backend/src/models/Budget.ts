import { Model, RelationMappingsThunk } from 'objection';
import { BaseModel } from './BaseModel';

export class Budget extends BaseModel {
  static tableName = 'budgets';

  organization_id?: string | null;
  api_key_id?: string | null;
  period!: 'day' | 'week' | 'month';
  ceiling!: string | number;
  consumed!: string | number;
  overage_action!: 'block' | 'alert';
  period_starts_at!: string | Date;
  period_ends_at!: string | Date;

  static relationMappings: RelationMappingsThunk = () => ({
    organization: {
      relation: Model.BelongsToOneRelation,
      modelClass: require('./Organization').Organization,
      join: { from: 'budgets.organization_id', to: 'organizations.id' },
    },
  });
}
