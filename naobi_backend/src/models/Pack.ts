import { BaseModel } from './BaseModel';

export class Pack extends BaseModel {
  static tableName = 'packs';

  slug!: string;
  name!: string;
  tagline?: string | null;
  price_xof!: number;
  currency!: string;
  models!: string[];
  model_labels?: Record<string, string>;
  max_budget_usd!: string | number;
  duration!: string;
  rpm_limit?: number | null;
  tpm_limit?: number | null;
  advantages?: string[];
  limits?: string[];
  active!: boolean;
}
