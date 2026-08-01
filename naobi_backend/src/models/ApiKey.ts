import { Model, RelationMappingsThunk } from 'objection';
import { BaseModel } from './BaseModel';

export type ApiKeyStatus = 'active' | 'disabled' | 'revoked' | 'expired';

export class ApiKey extends BaseModel {
  static tableName = 'api_keys';

  organization_id!: string;
  created_by!: string;
  name!: string;
  description?: string | null;
  key_prefix!: string;
  key_hash!: string;
  scope!: string;
  budget_max?: string | number | null;
  budget_consumed!: string | number;
  expires_at?: string | Date | null;
  status!: ApiKeyStatus;
  last_used_at?: string | Date | null;
  litellm_key_id?: string | null;
  litellm_user_id?: string | null;
  litellm_spend?: string | number;
  litellm_synced_at?: string | Date | null;
  /** AES-GCM ciphertext of virtual key — playground only; never returned in API */  
  litellm_key_encrypted?: string | null;

  static relationMappings: RelationMappingsThunk = () => ({
    organization: {
      relation: Model.BelongsToOneRelation,
      modelClass: require('./Organization').Organization,
      join: { from: 'api_keys.organization_id', to: 'organizations.id' },
    },
  });
}
