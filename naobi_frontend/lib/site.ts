/** Public site & SEO constants — knotflow.cloud */
export const SITE = {
  name: 'knotflow',
  legalName: 'Knotflow',
  domain: 'knotflow.cloud',
  url: 'https://knotflow.cloud',
  appUrl: 'https://app.knotflow.cloud',
  apiUrl: 'https://api.knotflow.cloud',
  ogImage: '/og-image.png',
  /** K mark only — sidebar & favicon (no wordmark baked in) */
  logoMark: '/icons/icon_mark_square.png',
  /** Full wordmark — OG / schema only */
  logoWordmark: '/icons/logo_128x128.png',
  icon: '/icons/icon-192.png',
  favicon: '/icons/icon-32.png',
  locales: ['fr', 'en'] as const,
  defaultLocale: 'fr' as const,
  title: {
    fr: 'knotflow — Infrastructure IA pour l’Afrique',
    en: 'knotflow — AI infrastructure for Africa',
  },
  description: {
    fr: 'Une seule API OpenAI-compatible, plusieurs modèles LLM, playground, clés API et contrôle des coûts. Plateforme d’inférence IA pensée pour l’Afrique.',
    en: 'One OpenAI-compatible API, many LLM models, playground, API keys and cost control. AI inference platform built for Africa.',
  },
  keywords: [
    'knotflow',
    'LLM API',
    'OpenAI compatible',
    'AI gateway',
    'Africa',
    'Mobile Money',
    'inference',
    'chat completions',
    'embeddings',
  ],
} as const;

export function localeUrl(locale: string, path = ''): string {
  const p = path.startsWith('/') ? path : path ? `/${path}` : '';
  return `${SITE.url}/${locale}${p}`;
}

/** Sidebar logo sizes */
export const SIDEBAR_LOGO = {
  expanded: 44,
  collapsed: 36,
} as const;
