import { Model, RelationMappingsThunk } from 'objection';
import { BaseModel } from './BaseModel';

export class Transaction extends BaseModel {
  static tableName = 'transactions';

  wallet_id!: string;
  type!: 'topup' | 'debit' | 'refund';
  amount!: string | number;
  payment_method?: string | null;
  status!: 'pending' | 'completed' | 'failed';
  reference?: string | null;
  metadata?: Record<string, unknown>;

  static relationMappings: RelationMappingsThunk = () => ({
    wallet: {
      relation: Model.BelongsToOneRelation,
      modelClass: require('./Wallet').Wallet,
      join: { from: 'transactions.wallet_id', to: 'wallets.id' },
    },
  });
}
