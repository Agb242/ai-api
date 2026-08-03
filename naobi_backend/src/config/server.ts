import path from 'path';
import dotenv from 'dotenv';

// Always load knotflowai_backend/.env (not cwd of the shell / POC ai-api/.env)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function requireEnv(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Missing required env: ${name}`);
    }
  }
  return v || '';
}

function litellmBaseUrl(): string {
  const raw =
    process.env.LITELLM_BASE_URL ||
    process.env.LITELLM_URL ||
    process.env.LITELLM_PROXY_URL ||
    '';
  return raw.trim().replace(/\/$/, '');
}

function litellmApiKey(): string {
  return (
    process.env.LITELLM_API_KEY ||
    process.env.LITELLM_MASTER_KEY ||
    process.env.LITELLM_KEY ||
    ''
  ).trim();
}

export const config = {
  port: parseInt(process.env.PORT || '3018', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  apiVersion: process.env.API_VERSION || 'v1',
  domain: process.env.DOMAIN || 'http://localhost:3018',
  frontendUrl: (process.env.FRONTEND_URL || 'http://localhost:3002').replace(/^['"]|['"]$/g, ''),
  timezone: process.env.TIMEZONE || 'Africa/Brazzaville',

  session: {
    expiryDays: parseInt(process.env.SESSION_EXPIRY_DAYS || '30', 10),
    refreshBeforeExpiryDays: parseInt(process.env.SESSION_REFRESH_BEFORE_DAYS || '7', 10),
  },

  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },

  mail: {
    host: process.env.SMTP_HOST || 'smtp.hostinger.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.MAIL_FROM || 'noabi <noreply@noabi.local>',
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  },

  /** LiteLLM Proxy — sole inference and key/spend source of truth */
  litellm: {
    baseUrl: litellmBaseUrl(),
    apiKey: litellmApiKey(),
    healthPath: process.env.LITELLM_HEALTH_PATH || '/health/liveliness',
    circuitFailureThreshold: parseInt(process.env.LITELLM_CIRCUIT_FAILURES || '3', 10),
    circuitOpenSeconds: parseInt(process.env.LITELLM_CIRCUIT_OPEN_SECONDS || '60', 10),
  },

  /** Mobile Money (SebPay Collectes) — pack purchases */
  momo: {
    mode: (process.env.PAYMENT_MODE || 'live').toLowerCase() === 'simulate' ? 'simulate' : 'live',
    simulateApproveMs: parseInt(process.env.SIMULATE_APPROVE_MS || '5000', 10),
    apiUrl: process.env.COLLECTES_API_URL || 'https://newapi.sebpay.bj/api/v1',
    publicKey: process.env.COLLECTES_PUBLIC_KEY || '',
    secretKey: process.env.COLLECTES_SECRET_KEY || '',
    webhookSecret: process.env.COLLECTES_WEBHOOK_SECRET || process.env.COLLECTES_SECRET_KEY || '',
  },

  encryptionKey: requireEnv('ENCRYPTION_KEY', 'noabi_dev_encryption_key_change_me'),

  platformAdminEmails: [] as string[],

  auditRetentionDays: parseInt(process.env.AUDIT_RETENTION_DAYS || '90', 10) || 90,
};

/** Extra CORS origins (comma-separated), e.g. https://noabi.checkflow.space */
function corsOriginsFromEnv(): string[] {
  return (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

const TRUSTED_HOST_SUFFIXES = ['.checkflow.space', '.noabi.cloud', '.knotflow.cloud'];
const TRUSTED_HOSTS = new Set([
  'checkflow.space',
  'noabi.cloud',
  'knotflow.cloud',
  'localhost',
  '127.0.0.1',
]);

export function listCorsOrigins(): string[] {
  const base = [
    config.frontendUrl,
    'http://localhost:3002',
    'http://localhost:3000',
    ...corsOriginsFromEnv(),
  ].filter(Boolean);
  return Array.from(new Set(base));
}

export function isAllowedCorsOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  if (listCorsOrigins().includes(origin)) return true;
  if (config.nodeEnv === 'development') return true;
  try {
    const host = new URL(origin).hostname;
    if (TRUSTED_HOSTS.has(host)) return true;
    return TRUSTED_HOST_SUFFIXES.some((s) => host.endsWith(s));
  } catch {
    return false;
  }
}

/** Headers the SPA sends (incl. X-Org-ID for multi-tenant org context). */
export const CORS_ALLOW_HEADERS = [
  'Content-Type',
  'Authorization',
  'Accept',
  'Accept-Language',
  'X-Requested-With',
  'X-Org-ID',
  'x-org-id',
  'X-API-Key',
  'x-api-key',
  'X-User-Id',
  'X-End-User-Id',
];
