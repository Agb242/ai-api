import { Model, RelationMappingsThunk } from 'objection';
import { BaseModel } from './BaseModel';

export class MomoTransaction extends BaseModel {
  static tableName = 'momo_transactions';

  external_reference!: string;
  provider_transaction_id?: string | null;
  pack_id?: string | null;
  organization_id?: string | null;
  user_id?: string | null;
  phone!: string;
  pseudo?: string | null;
  operator?: string | null;
  country?: string | null;
  status!: string;
  simulated!: boolean;
  litellm_user_id?: string | null;
  litellm_key_hash?: string | null;
  litellm_key_prefix?: string | null;
  litellm_key_encrypted?: string | null;
  api_key_id?: string | null;
  claimed_at?: string | Date | null;
  error?: string | null;
  metadata?: Record<string, unknown>;

  static relationMappings: RelationMappingsThunk = () => ({
    pack: {
      relation: Model.BelongsToOneRelation,
      modelClass: require('./Pack').Pack,
      join: { from: 'momo_transactions.pack_id', to: 'packs.id' },
    },
  });
}
