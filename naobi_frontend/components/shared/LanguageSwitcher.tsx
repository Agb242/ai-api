'use client';

import { useLocale } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';
import { Globe, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

const LOCALES = [
  { code: 'fr', label: 'FR', name: 'Français' },
  { code: 'en', label: 'EN', name: 'English' },
  // { code: 'es', label: 'ES', name: 'Español' },
  // { code: 'hi', label: 'HI', name: 'हिन्दी' },
  // { code: 'de', label: 'DE', name: 'Deutsch' },
  // { code: 'pt', label: 'PT', name: 'Português' },
  // { code: 'ja', label: 'JA', name: '日本語' },
] as const;

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = LOCALES.find((l) => l.code === locale) ?? LOCALES[0];

  function switchLocale(next: string) {
    if (next === locale) { setOpen(false); return; }
    const segments = pathname.split('/');
    segments[1] = next;
    router.push(segments.join('/'));
    setOpen(false);
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium  cursor-pointer text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all"
      >
        <Globe className="w-4 h-4 text-gray-500" />
        <span className="text-xs font-semibold tracking-wide">{current.label}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 z-50 bg-white border border-gray-200 rounded-xl shadow-xl py-1.5 min-w-[150px] overflow-hidden">
          {LOCALES.map((l) => (
            <button
              key={l.code}
              onClick={() => switchLocale(l.code)}
              className={`w-full flex items-center justify-between gap-3 px-4 py-2 text-sm transition-colors ${locale === l.code ? 'bg-[hsl(var(--accent-soft))] text-primary font-semibold' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
            >
              <span>{l.name}</span>
              <span className="text-xs opacity-50 font-mono">{l.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}