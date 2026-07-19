import { Model, RelationMappingsThunk } from 'objection';
import { BaseModel } from './BaseModel';

export class Wallet extends BaseModel {
  static tableName = 'wallets';

  organization_id!: string;
  balance!: string | number;
  alert_threshold_ratio!: string | number;
  status!: 'active' | 'suspended';

  static relationMappings: RelationMappingsThunk = () => ({
    organization: {
      relation: Model.BelongsToOneRelation,
      modelClass: require('./Organization').Organization,
      join: { from: 'wallets.organization_id', to: 'organizations.id' },
    },
    transactions: {
      relation: Model.HasManyRelation,
      modelClass: require('./Transaction').Transaction,
      join: { from: 'wallets.id', to: 'transactions.wallet_id' },
    },
  });

  get balanceNumber(): number {
    return Number(this.balance);
  }
}
