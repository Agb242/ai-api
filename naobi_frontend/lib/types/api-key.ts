export type ApiKeyStatus = 'active' | 'disabled' | 'revoked' | 'expired';

export type AnalyticsSource = 'litellm' | 'gateway' | null;

export type ApiKey = {
  id: string;
  name: string;
  description?: string | null;
  key_prefix: string;
  scope: string;
  budget_max?: number | string | null;
  budget_consumed?: number | string;
  expires_at?: string | null;
  status: ApiKeyStatus;
  last_used_at?: string | null;
  litellm_spend?: number | string | null;
  litellm_synced_at?: string | null;
  created_by?: string;
  organization_id?: string;
  created_at?: string;
  updated_at?: string;
  litellm?: Record<string, unknown>;
  sources?: { local?: boolean; litellm?: boolean };
};

export type ApiKeyCreated = ApiKey & {
  key: string;
  message?: string;
};

export type ApiKeyMetrics = {
  key: ApiKey;
  totals: {
    requests: number;
    tokens_input: number;
    tokens_output: number;
    cost: number;
    avg_latency_ms: number;
    error_count: number;
    litellm_spend: number;
  };
  series: Array<{ day: string; requests: number; cost: number; tokens: number }>;
};

export type KeyAnalytics = {
  key: ApiKey;
  overview: Record<string, unknown>;
  litellm?: Record<string, unknown>;
  sources: { local: boolean; litellm: boolean };
};

export type KeyUsage = {
  series: Array<{
    day: string;
    spend?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    api_requests?: number;
    successful_requests?: number;
    failed_requests?: number;
  }>;
  source: AnalyticsSource;
  days: number;
};

export type KeyModels = {
  items: Array<{ model?: string; spend?: number; requests?: number }>;
  source: AnalyticsSource;
};

export type KeyProviders = {
  items: Array<{ provider?: string; spend?: number; api_requests?: number }>;
  source: AnalyticsSource;
};

export type KeyLogItem = {
  request_id?: string;
  call_type?: string;
  model?: string;
  provider?: string;
  status?: string;
  spend?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  request_duration_ms?: number;
  start_time?: string;
  end_time?: string;
  api_base?: string;
  error_code?: string;
  source?: 'litellm' | 'gateway';
};

export type ApiKeyLogs = {
  items: KeyLogItem[];
  pagination: { page: number; limit: number; total: number; pages: number };
  source?: AnalyticsSource;
};

export type KeyErrors = {
  total: number;
  items: KeyLogItem[];
  by_model?: Array<{ model: string; count: number }>;
  by_provider?: Array<{ provider: string; count: number }>;
  source?: AnalyticsSource;
};

export type CreateApiKeyPayload = {
  name: string;
  description?: string;
  budget_max?: number;
  expires_at?: string;
  scope?: string;
};
