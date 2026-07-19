import { Model, RelationMappingsThunk } from 'objection';
import { BaseModel } from './BaseModel';
import type { User } from './User';

export class Session extends BaseModel {
  static tableName = 'sessions';

  user_id!: string;
  token!: string;
  expires_at!: Date;
  ip_address?: string | null;
  user_agent?: string | null;

  user?: User;

  static relationMappings: RelationMappingsThunk = () => ({
    user: {
      relation: Model.BelongsToOneRelation,
      modelClass: require('./User').User,
      join: {
        from: 'sessions.user_id',
        to: 'users.id',
      },
    },
  });
}
