import { BaseModel } from './BaseModel';

export type ModelType = 'hosted' | 'selfhosted';
export type ModelStatus = 'testing' | 'available' | 'degraded' | 'deprecated';

export class LlmModel extends BaseModel {
  static tableName = 'models';

  provider!: string;
  model_id!: string;
  display_name!: string;
  type!: ModelType;
  infra_tier?: string | null;
  price_input_per_1k!: string | number;
  price_output_per_1k!: string | number;
  status!: ModelStatus;
  endpoint_internal?: string | null;
  fallback_model_id?: string | null;
  metadata?: Record<string, unknown>;
}
