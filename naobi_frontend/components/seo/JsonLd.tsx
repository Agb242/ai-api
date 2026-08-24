import { SITE } from '@/lib/site';

export function JsonLd() {
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE.url}/#organization`,
        name: SITE.legalName,
        url: SITE.url,
        logo: `${SITE.url}${SITE.logo}`,
        sameAs: [],
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE.url}/#website`,
        url: SITE.url,
        name: SITE.name,
        description: SITE.description.fr,
        publisher: { '@id': `${SITE.url}/#organization` },
        inLanguage: ['fr', 'en'],
      },
      {
        '@type': 'SoftwareApplication',
        name: SITE.name,
        applicationCategory: 'DeveloperApplication',
        operatingSystem: 'Web',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'XOF',
        },
        description: SITE.description.en,
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
