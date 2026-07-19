import type { Metadata, Viewport } from 'next';
import { Outfit, DM_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { cn } from '@/lib/utils';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Providers } from './providers';

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
  title: {
    default: 'noabi — Infrastructure IA pour l’Afrique',
    template: '%s · noabi',
  },
  description:
    'Une seule API, plusieurs modèles. Gateway LiteLLM, packs Mobile Money, control plane FR/EN.',
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
      <body className="antialiased" suppressHydrationWarning>
        <TooltipProvider>
          <Providers>{children}</Providers>
        </TooltipProvider>
      </body>
    </html>
  );
}
