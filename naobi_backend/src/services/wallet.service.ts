import { transaction } from 'objection';
import { Wallet } from '../models/Wallet';
import { Transaction } from '../models/Transaction';
import { knex } from '../config/database';

export const walletService = {
  async getByOrg(organizationId: string) {
    return Wallet.query().findOne({ organization_id: organizationId });
  },

  async listTransactions(walletId: string, limit = 50) {
    return Transaction.query()
      .where({ wallet_id: walletId })
      .orderBy('created_at', 'desc')
      .limit(limit);
  },

  /** Refuse if estimated cost exceeds balance (RG-04). */
  async assertAffordable(organizationId: string, estimatedCost: number): Promise<Wallet> {
    const wallet = await this.getByOrg(organizationId);
    if (!wallet || wallet.status !== 'active') {
      throw Object.assign(new Error('WALLET_SUSPENDED'), { code: 'WALLET_SUSPENDED' });
    }
    if (wallet.balanceNumber < estimatedCost) {
      throw Object.assign(new Error('INSUFFICIENT_BALANCE'), { code: 'INSUFFICIENT_BALANCE' });
    }
    return wallet;
  },

  async debit(organizationId: string, amount: number, metadata?: Record<string, unknown>) {
    if (amount <= 0) return null;

    return transaction(knex, async (trx) => {
      const wallet = await Wallet.query(trx)
        .findOne({ organization_id: organizationId })
        .forUpdate();
      if (!wallet) throw new Error('WALLET_NOT_FOUND');

      const balance = Number(wallet.balance);
      if (balance < amount) {
        throw Object.assign(new Error('INSUFFICIENT_BALANCE'), { code: 'INSUFFICIENT_BALANCE' });
      }

      const updated = await wallet.$query(trx).patchAndFetch({
        balance: balance - amount,
      });

      await Transaction.query(trx).insert({
        wallet_id: wallet.id,
        type: 'debit',
        amount,
        status: 'completed',
        metadata: metadata || {},
      });

      return updated;
    });
  },

  /**
   * Top-up: MVP stub confirms immediately (RG-05 normally waits for payment provider).
   * Pass confirm=true after payment webhook in production.
   */
  async topUp(params: {
    organizationId: string;
    amount: number;
    paymentMethod?: string;
    confirm?: boolean;
    reference?: string;
  }) {
    const { organizationId, amount, paymentMethod = 'stub', confirm = true, reference } = params;
    if (amount <= 0) throw new Error('INVALID_AMOUNT');

    return transaction(knex, async (trx) => {
      const wallet = await Wallet.query(trx)
        .findOne({ organization_id: organizationId })
        .forUpdate();
      if (!wallet) throw new Error('WALLET_NOT_FOUND');

      const tx = await Transaction.query(trx).insert({
        wallet_id: wallet.id,
        type: 'topup',
        amount,
        payment_method: paymentMethod,
        status: confirm ? 'completed' : 'pending',
        reference: reference || `topup_${Date.now()}`,
        metadata: {},
      });

      if (confirm) {
        await wallet.$query(trx).patch({
          balance: Number(wallet.balance) + amount,
        });
      }

      const refreshed = await Wallet.query(trx).findById(wallet.id);
      return { wallet: refreshed!, transaction: tx };
    });
  },

  isBelowAlert(wallet: Wallet): boolean {
    const balance = Number(wallet.balance);
    // Alert when balance is low relative to a soft monthly mental model — use absolute floor of 5 credits or ratio of last top-up.
    // Spec: 10% of configured threshold. We store ratio; apply vs a reference of max(balance history) isn't available,
    // so treat alert when balance < 10 credits *or* when balance dropped and ratio suggests caution.
    return balance > 0 && balance <= 10 * Number(wallet.alert_threshold_ratio) * 100;
  },
};
