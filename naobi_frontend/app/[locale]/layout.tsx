import { NextIntlClientProvider } from 'next-intl';
import type { Metadata } from 'next';
import { QueryProvider } from '@/providers/QueryProvider';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { ToastProvider } from '@/providers/ToastProvider';
import { LocaleHtmlLang } from '@/components/shared/LocaleHtmlLang';
import { AuthGate } from '@/components/auth/AuthGate';
import { SITE } from '@/lib/site';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isEn = locale === 'en';
  const title = isEn ? SITE.title.en : SITE.title.fr;
  const description = isEn ? SITE.description.en : SITE.description.fr;

  return {
    title,
    description,
    alternates: {
      canonical: `${SITE.url}/${locale}`,
      languages: {
        fr: `${SITE.url}/fr`,
        en: `${SITE.url}/en`,
        'x-default': `${SITE.url}/${SITE.defaultLocale}`,
      },
    },
    openGraph: {
      locale: isEn ? 'en_US' : 'fr_FR',
      title,
      description,
      url: `${SITE.url}/${locale}`,
      siteName: SITE.name,
      images: [{ url: SITE.ogImage, width: 1200, height: 630, alt: SITE.name }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [SITE.ogImage],
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const messages = (await import(`@/i18n/messages/${locale}.json`)).default;

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <LocaleHtmlLang />
      <ThemeProvider>
        <QueryProvider>
          <AuthGate>{children}</AuthGate>
          <ToastProvider />
        </QueryProvider>
      </ThemeProvider>
    </NextIntlClientProvider>
  );
}
