import type { Metadata, Viewport } from 'next';
import { Outfit, DM_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { cn } from '@/lib/utils';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Providers } from './providers';
import { JsonLd } from '@/components/seo/JsonLd';
import { SITE } from '@/lib/site';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-display-family',
  weight: ['500', '600', '700'],
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['400', '500', '600', '700'],
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono-family',
  weight: ['400', '500'],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: SITE.title.fr,
    template: `%s · ${SITE.name}`,
  },
  description: SITE.description.fr,
  keywords: [...SITE.keywords],
  authors: [{ name: SITE.legalName, url: SITE.url }],
  creator: SITE.legalName,
  publisher: SITE.legalName,
  applicationName: SITE.name,
  category: 'technology',
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  alternates: {
    canonical: SITE.url,
    languages: {
      fr: `${SITE.url}/fr`,
      en: `${SITE.url}/en`,
      'x-default': `${SITE.url}/${SITE.defaultLocale}`,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    alternateLocale: ['en_US'],
    url: SITE.url,
    siteName: SITE.name,
    title: SITE.title.fr,
    description: SITE.description.fr,
    images: [
      {
        url: SITE.ogImage,
        width: 1200,
        height: 630,
        alt: `${SITE.name} — AI infrastructure platform`,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE.title.en,
    description: SITE.description.en,
    images: [SITE.ogImage],
  },
  icons: {
    icon: [
      { url: '/icons/icon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icons/icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    shortcut: '/favicon.png',
  },
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#FFFFFF',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="fr"
      className={cn(outfit.variable, dmSans.variable, jetbrains.variable, 'font-sans')}
      suppressHydrationWarning
    >
      <head>
        <JsonLd />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        <TooltipProvider>
          <Providers>{children}</Providers>
        </TooltipProvider>
      </body>
    </html>
  );
}
