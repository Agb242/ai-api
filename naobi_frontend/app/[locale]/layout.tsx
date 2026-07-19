import { NextIntlClientProvider } from 'next-intl';
import { QueryProvider } from '@/providers/QueryProvider';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { ToastProvider } from '@/providers/ToastProvider';
import { LocaleHtmlLang } from '@/components/shared/LocaleHtmlLang';
import { AuthGate } from '@/components/auth/AuthGate';

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
