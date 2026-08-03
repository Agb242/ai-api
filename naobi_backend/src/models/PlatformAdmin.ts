import { Model, RelationMappingsThunk } from 'objection';
import { BaseModel } from './BaseModel';

export type PlatformAdminStatus = 'pending' | 'active';

export class PlatformAdmin extends BaseModel {
  static tableName = 'platform_admins';

  email!: string;
  user_id?: string | null;
  invited_by_user_id?: string | null;
  status!: PlatformAdminStatus;

  static relationMappings: RelationMappingsThunk = () => ({
    user: {
      relation: Model.BelongsToOneRelation,
      modelClass: require('./User').User,
      join: { from: 'platform_admins.user_id', to: 'users.id' },
    },
    invitedBy: {
      relation: Model.BelongsToOneRelation,
      modelClass: require('./User').User,
      join: { from: 'platform_admins.invited_by_user_id', to: 'users.id' },
    },
  });
}
