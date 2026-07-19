import { Model, RelationMappingsThunk } from 'objection';
import { BaseModel } from './BaseModel';

export class Invitation extends BaseModel {
  static tableName = 'invitations';

  organization_id!: string;
  invited_by!: string;
  email!: string;
  role!: string;
  token!: string;
  status!: 'pending' | 'accepted' | 'expired' | 'revoked';
  expires_at!: string | Date;

  static relationMappings: RelationMappingsThunk = () => ({
    organization: {
      relation: Model.BelongsToOneRelation,
      modelClass: require('./Organization').Organization,
      join: { from: 'invitations.organization_id', to: 'organizations.id' },
    },
  });
}
