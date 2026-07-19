import { Model, RelationMappingsThunk } from 'objection';
import { BaseModel } from './BaseModel';

export class RequestLog extends BaseModel {
  static tableName = 'request_logs';

  organization_id!: string;
  api_key_id?: string | null;
  model_uuid?: string | null;
  model_id?: string | null;
  tokens_input!: number;
  tokens_output!: number;
  latency_ms?: number | null;
  cost!: string | number;
  status!: string;
  error_code?: string | null;
  triggered_rule_id?: string | null;
  filter_action?: string | null;
  router_backend?: string | null;
  streamed!: boolean;
  metadata?: Record<string, unknown>;

  static relationMappings: RelationMappingsThunk = () => ({
    organization: {
      relation: Model.BelongsToOneRelation,
      modelClass: require('./Organization').Organization,
      join: { from: 'request_logs.organization_id', to: 'organizations.id' },
    },
  });
}
