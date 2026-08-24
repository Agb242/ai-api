import { MetadataRoute } from 'next';
import { SITE } from '@/lib/site';

const marketingPages = [
  { path: '', priority: 1.0, changeFrequency: 'weekly' as const },
  { path: '/login', priority: 0.6, changeFrequency: 'monthly' as const },
  { path: '/register', priority: 0.7, changeFrequency: 'monthly' as const },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];

  for (const page of marketingPages) {
    const languages: Record<string, string> = {};
    for (const locale of SITE.locales) {
      languages[locale] = `${SITE.url}/${locale}${page.path}`;
    }
    languages['x-default'] = `${SITE.url}/${SITE.defaultLocale}${page.path}`;

    for (const locale of SITE.locales) {
      entries.push({
        url: `${SITE.url}/${locale}${page.path}`,
        lastModified: new Date(),
        changeFrequency: page.changeFrequency,
        priority: page.priority,
        alternates: { languages },
      });
    }
  }

  return entries;
}
