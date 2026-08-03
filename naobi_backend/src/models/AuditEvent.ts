import { Model, RelationMappingsThunk } from 'objection';
import { BaseModel } from './BaseModel';

export class AuditEvent extends BaseModel {
  static tableName = 'audit_events';

  organization_id!: string;
  actor_user_id?: string | null;
  action!: string;
  resource_type!: string;
  resource_id?: string | null;
  metadata!: Record<string, unknown>;

  static relationMappings: RelationMappingsThunk = () => ({
    organization: {
      relation: Model.BelongsToOneRelation,
      modelClass: require('./Organization').Organization,
      join: { from: 'audit_events.organization_id', to: 'organizations.id' },
    },
    actor: {
      relation: Model.BelongsToOneRelation,
      modelClass: require('./User').User,
      join: { from: 'audit_events.actor_user_id', to: 'users.id' },
    },
  });
}
