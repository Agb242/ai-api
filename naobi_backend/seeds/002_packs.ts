import type { Knex } from 'knex';

const packs = [
  {
    slug: 'starter',
    name: 'Starter',
    tagline: "Pour découvrir et tester l'API",
    price_xof: 1000,
    currency: 'XOF',
    models: ['gpt-oss-20b', 'nemotron'],
    model_labels: {
      'gpt-oss-20b': 'GPT-OSS 20B',
      nemotron: 'Nemotron Super 49B',
    },
    max_budget_usd: 5.0,
    duration: '30d',
    rpm_limit: 60,
    tpm_limit: 100000,
    advantages: [
      '2 modèles accessibles',
      'Budget de 5 USD inclus',
      'Idéal pour premiers tests',
    ],
    limits: ['60 requêtes / minute', 'Modèles légers uniquement'],
    active: true,
  },
  {
    slug: 'pro',
    name: 'Pro',
    tagline: 'Pour un usage intensif et des gros modèles',
    price_xof: 5000,
    currency: 'XOF',
    models: ['llama-3.3-70b', 'gpt-oss-120b', 'nemotron'],
    model_labels: {
      'llama-3.3-70b': 'Llama 3.3 70B',
      'gpt-oss-120b': 'GPT-OSS 120B',
      nemotron: 'Nemotron Super 49B',
    },
    max_budget_usd: 20.0,
    duration: '30d',
    rpm_limit: 200,
    tpm_limit: 500000,
    advantages: [
      'Gros modèles haute qualité',
      'Budget de 20 USD inclus',
      'Rate-limit élevé',
    ],
    limits: ['200 requêtes / minute', 'Budget non reportable'],
    active: true,
  },
];

export async function seed(knex: Knex): Promise<void> {
  for (const pack of packs) {
    const existing = await knex('packs').where({ slug: pack.slug }).first();
    if (existing) {
      await knex('packs').where({ slug: pack.slug }).update({
        ...pack,
        updated_at: knex.fn.now(),
      });
    } else {
      await knex('packs').insert(pack);
    }
  }
}
