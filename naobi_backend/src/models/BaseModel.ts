import { Model } from 'objection';
import { normalizeEmail } from '../utils/normalize-email';

export class BaseModel extends Model {
  /** Override in subclasses: fields normalized to lowercase on insert/update */
  static emailFields: string[] = [];

  id!: string;
  created_at!: Date;
  updated_at!: Date;
  deleted_at?: Date | null;

  protected applyEmailNormalization(): void {
    const fields = (this.constructor as typeof BaseModel).emailFields;
    if (!fields?.length) return;

    for (const field of fields) {
      const value = (this as Record<string, unknown>)[field];
      if (typeof value === 'string' && value.trim()) {
        (this as Record<string, unknown>)[field] = normalizeEmail(value);
      }
    }
  }

  $beforeInsert(): void {
    const now = new Date();
    this.created_at = now;
    this.updated_at = now;
    this.applyEmailNormalization();
  }

  $beforeUpdate(): void {
    this.updated_at = new Date();
    this.applyEmailNormalization();
  }

  async softDelete(): Promise<number> {
    await this.$query().patch({ deleted_at: new Date() });
    return 1;
  }

  static modifiers = {
    notDeleted(builder: any) {
      builder.whereNull('deleted_at');
    },
  };
}
