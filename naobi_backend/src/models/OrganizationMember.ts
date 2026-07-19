import { Model, RelationMappingsThunk } from 'objection';
import { BaseModel } from './BaseModel';

export type OrgRole = 'owner' | 'admin' | 'developer' | 'viewer';
export type MemberStatus = 'active' | 'inactive';

export class OrganizationMember extends BaseModel {
  static tableName = 'organization_members';

  organization_id!: string;
  user_id!: string;
  role!: OrgRole;
  status!: MemberStatus;

  organization?: import('./Organization').Organization;
  user?: import('./User').User;

  static relationMappings: RelationMappingsThunk = () => ({
    organization: {
      relation: Model.BelongsToOneRelation,
      modelClass: require('./Organization').Organization,
      join: { from: 'organization_members.organization_id', to: 'organizations.id' },
    },
    user: {
      relation: Model.BelongsToOneRelation,
      modelClass: require('./User').User,
      join: { from: 'organization_members.user_id', to: 'users.id' },
    },
  });
}
