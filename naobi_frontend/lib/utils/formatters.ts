import { format, formatDistance, formatRelative } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';

const locales = { fr, en: enUS };

export function formatDate(date: Date | string, formatStr = 'PPP', locale: 'fr' | 'en' = 'fr'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, formatStr, { locale: locales[locale] });
}

export function formatDateTime(date: Date | string, locale: 'fr' | 'en' = 'fr'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'PPP p', { locale: locales[locale] });
}

export function formatRelativeDate(date: Date | string, baseDate: Date = new Date(), locale: 'fr' | 'en' = 'fr'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return formatRelative(d, baseDate, { locale: locales[locale] });
}

export function formatDistanceToNow(date: Date | string, locale: 'fr' | 'en' = 'fr'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return formatDistance(d, new Date(), { addSuffix: true, locale: locales[locale] });
}

export function formatNumber(value: number, locale: 'fr' | 'en' = 'fr'): string {
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-US').format(value);
}

export function formatPercent(value: number, decimals = 0, locale: 'fr' | 'en' = 'fr'): string {
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value / 100);
}

export function formatCurrency(value: number, currency = 'EUR', locale: 'fr' | 'en' = 'fr'): string {
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
    style: 'currency',
    currency,
  }).format(value);
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function formatDuration(seconds: number, locale: 'fr' | 'en' = 'fr'): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}${locale === 'fr' ? 'h' : 'h'}`);
  if (minutes > 0) parts.push(`${minutes}${locale === 'fr' ? 'min' : 'm'}`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}${locale === 'fr' ? 's' : 's'}`);

  return parts.join(' ');
}

export function formatInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
