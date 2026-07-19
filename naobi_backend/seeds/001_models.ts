import type { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  const existing = await knex('models').count<{ count: string }>('id as count').first();
  if (existing && Number(existing.count) > 0) return;

  await knex('models').insert([
    {
      provider: 'openai',
      model_id: 'openai/gpt-4o',
      display_name: 'GPT-4o',
      type: 'hosted',
      price_input_per_1k: 0.005,
      price_output_per_1k: 0.015,
      status: 'available',
    },
    {
      provider: 'openai',
      model_id: 'openai/gpt-4o-mini',
      display_name: 'GPT-4o mini',
      type: 'hosted',
      price_input_per_1k: 0.00015,
      price_output_per_1k: 0.0006,
      status: 'available',
    },
    {
      provider: 'anthropic',
      model_id: 'anthropic/claude-sonnet',
      display_name: 'Claude Sonnet',
      type: 'hosted',
      price_input_per_1k: 0.003,
      price_output_per_1k: 0.015,
      status: 'available',
    },
    {
      provider: 'nvidia',
      model_id: 'nvidia-nim/llama-3',
      display_name: 'Llama 3 (NIM)',
      type: 'hosted',
      price_input_per_1k: 0.0002,
      price_output_per_1k: 0.0002,
      status: 'available',
    },
    {
      provider: 'selfhosted',
      model_id: 'interne/mistral-vps',
      display_name: 'Mistral (VPS)',
      type: 'selfhosted',
      infra_tier: 'vps',
      price_input_per_1k: 0.00005,
      price_output_per_1k: 0.00005,
      status: 'degraded',
      endpoint_internal: process.env.SELF_HOSTED_BASE_URL || null,
      fallback_model_id: 'openai/gpt-4o-mini',
    },
  ]);
}
