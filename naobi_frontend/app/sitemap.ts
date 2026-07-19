import { MetadataRoute } from 'next';

const BASE_URL = 'https://knotflow.cloud';
const APP_URL = 'https://app.knotflow.cloud';

const locales = ['fr', 'en', 'es', 'hi', 'de', 'pt', 'ja'] as const;
const defaultLocale = 'fr';

// Marketing pages (served on knotflow.cloud)
const marketingPages = [
  { path: '', priority: 1.0, changeFrequency: 'weekly' as const },
  { path: '/use-cases', priority: 0.9, changeFrequency: 'weekly' as const },
  { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' as const },
  { path: '/terms', priority: 0.3, changeFrequency: 'yearly' as const },
];

// Auth pages (served on app.knotflow.cloud, publicly indexable)
const authPages = [
  { path: '/login', priority: 0.6, changeFrequency: 'monthly' as const },
  { path: '/register', priority: 0.7, changeFrequency: 'monthly' as const },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];

  // Marketing pages with hreflang alternates
  for (const page of marketingPages) {
    const languages: Record<string, string> = {};
    for (const locale of locales) {
      languages[locale] = `${BASE_URL}/${locale}${page.path}`;
    }
    languages['x-default'] = `${BASE_URL}/${defaultLocale}${page.path}`;

    for (const locale of locales) {
      entries.push({
        url: `${BASE_URL}/${locale}${page.path}`,
        lastModified: new Date(),
        changeFrequency: page.changeFrequency,
        priority: page.priority,
        alternates: { languages },
      });
    }
  }

  // Auth pages
  for (const page of authPages) {
    const languages: Record<string, string> = {};
    for (const locale of locales) {
      languages[locale] = `${APP_URL}/${locale}${page.path}`;
    }
    languages['x-default'] = `${APP_URL}/${defaultLocale}${page.path}`;

    for (const locale of locales) {
      entries.push({
        url: `${APP_URL}/${locale}${page.path}`,
        lastModified: new Date(),
        changeFrequency: page.changeFrequency,
        priority: page.priority,
        alternates: { languages },
      });
    }
  }

  return entries;
}
