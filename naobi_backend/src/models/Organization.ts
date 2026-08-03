import { Model, RelationMappingsThunk } from 'objection';
import { BaseModel } from './BaseModel';

export type OrgStatus = 'trial' | 'active' | 'suspended' | 'terminated';

export class Organization extends BaseModel {
  static tableName = 'organizations';

  name!: string;
  slug!: string;
  status!: OrgStatus;
  currency!: string;
  allow_model_fallback!: boolean;
  retain_request_content!: boolean;
  litellm_team_id?: string | null;
  litellm_guardrail_id?: string | null;
  enterprise_guardrail_enabled?: boolean;

  static relationMappings: RelationMappingsThunk = () => ({
    members: {
      relation: Model.HasManyRelation,
      modelClass: require('./OrganizationMember').OrganizationMember,
      join: { from: 'organizations.id', to: 'organization_members.organization_id' },
    },
    wallet: {
      relation: Model.HasOneRelation,
      modelClass: require('./Wallet').Wallet,
      join: { from: 'organizations.id', to: 'wallets.organization_id' },
    },
  });
}
