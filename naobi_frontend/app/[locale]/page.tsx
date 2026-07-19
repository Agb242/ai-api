'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { ArrowRight } from 'lucide-react';
import { getGatewayBase } from '@/lib/gateway-url';
import { SiteHeader } from '@/components/layout/SiteHeader';

const PROVIDERS = [
  { name: 'OpenAI', mark: 'O' },
  { name: 'Anthropic', mark: 'A' },
  { name: 'Gemini', mark: 'G' },
  { name: 'DeepSeek', mark: 'D' },
  { name: 'MiniMax', mark: 'M' },
];

export default function MarketingHomePage() {
  const t = useTranslations('marketing');

  return (
    <div className="landing-root relative min-h-screen overflow-x-hidden bg-white text-[#0a0a0a]">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.45]"
        style={{
          backgroundImage:
            'linear-gradient(to right, #e8e8e8 1px, transparent 1px), linear-gradient(to bottom, #e8e8e8 1px, transparent 1px)',
          backgroundSize: '96px 96px',
          maskImage: 'linear-gradient(to bottom, black 0%, black 55%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 55%, transparent 100%)',
        }}
      />

      <SiteHeader variant="marketing" />

      <main id="accueil" className="relative z-10">
        <section className="mx-auto flex max-w-[920px] flex-col items-center px-5 pb-20 pt-16 text-center md:px-8 md:pb-28 md:pt-24">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#E8E8E8] bg-white/80 px-3.5 py-1.5 text-[12px] font-medium text-[#5c5c5c] shadow-[0_1px_0_rgba(0,0,0,0.02)] backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-[#FF6B35]" />
            {t('badge')}
          </div>

          <h1 className="font-display max-w-[900px] text-[2.35rem] font-semibold leading-[1.08] tracking-[-0.03em] text-[#0a0a0a] sm:text-5xl md:text-[3.75rem] lg:text-[4.25rem]">
            {t('headline1')}
            <br />
            <span className="text-[#FF6B35]">{t('headline2')}</span>
          </h1>

          <p className="mt-6 max-w-[520px] text-[15px] leading-relaxed text-[#666] md:text-base">
            {t('tagline')}
          </p>

          <div id="modeles" className="mt-10 flex flex-wrap items-center justify-center gap-2.5">
            {PROVIDERS.map((p) => (
              <div
                key={p.name}
                className="inline-flex items-center gap-2 rounded-full border border-[#E5E5E5] bg-white px-3.5 py-2 text-[13px] font-medium text-[#333] shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#F4F4F4] text-[10px] font-bold text-[#555]">
                  {p.mark}
                </span>
                {p.name}
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-full bg-[#0a0a0a] px-6 py-3.5 text-[14px] font-semibold text-white transition hover:bg-[#222]"
            >
              {t('cta')}
              <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
            </Link>
            <a
              href="#docs"
              className="inline-flex items-center rounded-full border border-[#E0E0E0] bg-white px-6 py-3.5 text-[14px] font-semibold text-[#0a0a0a] transition hover:border-[#ccc] hover:bg-[#FAFAFA]"
            >
              {t('docsCta')}
            </a>
          </div>
        </section>

        <section id="tarifs" className="border-t border-[#EFEFEF] bg-[#FAFAFA]">
          <div className="mx-auto grid max-w-[1100px] gap-8 px-5 py-16 md:grid-cols-3 md:px-8 md:py-20">
            {[
              { title: t('feat1Title'), body: t('feat1Body') },
              { title: t('feat2Title'), body: t('feat2Body') },
              { title: t('feat3Title'), body: t('feat3Body') },
            ].map((f) => (
              <div key={f.title} className="text-left">
                <h2 className="font-display text-lg font-semibold tracking-tight">{f.title}</h2>
                <p className="mt-2 text-[14px] leading-relaxed text-[#666]">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="insights" className="mx-auto max-w-[720px] px-5 py-16 text-center md:px-8 md:py-20">
          <h2 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
            {t('insightsTitle')}
          </h2>
          <p className="mt-3 text-[15px] text-[#666]">{t('insightsBody')}</p>
          <Link
            href="/buy"
            className="mt-8 inline-flex items-center gap-2 rounded-full border border-[#E0E0E0] bg-white px-5 py-3 text-[13px] font-semibold transition hover:bg-[#FAFAFA]"
          >
            {t('buyPack')}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </section>

        <section id="docs" className="border-t border-[#EFEFEF] bg-white">
          <div className="mx-auto max-w-[720px] px-5 py-16 text-center md:px-8">
            <h2 className="font-display text-2xl font-semibold tracking-tight">{t('docsTitle')}</h2>
            <p className="mt-3 text-[15px] text-[#666]">{t('docsBody')}</p>
            <pre className="mt-8 overflow-x-auto rounded-2xl border border-[#E8E8E8] bg-[#0a0a0a] p-5 text-left font-mono text-[11px] leading-relaxed text-[#e8e8e8]">
              {`curl ${getGatewayBase()}/v1/chat/completions \\
  -H "Authorization: Bearer $NOABI_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"llama-3.3-70b","messages":[{"role":"user","content":"Bonjour"}]}'`}
            </pre>
          </div>
        </section>

        <section id="apropos" className="border-t border-[#EFEFEF] bg-[#FAFAFA]">
          <div className="mx-auto max-w-[640px] px-5 py-16 text-center md:px-8">
            <h2 className="font-display text-2xl font-semibold tracking-tight">{t('aboutTitle')}</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-[#666]">{t('aboutBody')}</p>
          </div>
        </section>

        <section id="aide" className="border-t border-[#EFEFEF]">
          <div className="mx-auto flex max-w-[1100px] flex-col items-center justify-between gap-4 px-5 py-10 md:flex-row md:px-8">
            <p className="text-[13px] text-[#888]">{t('footer')}</p>
            <div className="flex gap-4 text-[13px] font-medium">
              <Link href="/login" className="text-[#0a0a0a] hover:underline">
                {t('login')}
              </Link>
              <Link href="/register" className="text-[#0a0a0a] hover:underline">
                {t('register')}
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
