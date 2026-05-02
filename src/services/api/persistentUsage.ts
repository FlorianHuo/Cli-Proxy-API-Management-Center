export interface PersistentUsageSummary {
  canary: string;
  generated_at: string;
  baseline: {
    requests: number;
    tokens: number;
    cost_note?: string;
  };
  recorded: {
    requests: number;
    tokens: number;
    input_tokens: number;
    output_tokens: number;
    reasoning_tokens: number;
    cached_tokens: number;
    failed_requests: number;
    estimated_cost_usd: string;
    priced_events: number;
    unpriced_events: number;
  };
  combined: {
    requests: number;
    tokens: number;
  };
  today: {
    requests: number;
    tokens: number;
  };
  latest_runtime_snapshot: {
    captured_at: string;
    requests: number;
    tokens: number;
  } | null;
  baselines: Array<{
    label: string;
    total_requests: number;
    total_tokens: number;
    created_at: string;
    note?: string;
  }>;
  models: Array<{
    model: string;
    requests: number;
    tokens: number;
    input_tokens: number;
    output_tokens: number;
    reasoning_tokens: number;
    cached_tokens: number;
    failed_requests: number;
    avg_latency_ms: number | null;
    estimated_cost_usd: string;
    priced_events: number;
    unpriced_events: number;
  }>;
  daily: Array<{
    day: string;
    requests: number;
    tokens: number;
  }>;
  recent_events: Array<{
    timestamp: string;
    model: string;
    total_tokens: number;
    input_tokens: number;
    output_tokens: number;
    reasoning_tokens: number;
    cached_tokens: number;
    latency_ms: number | null;
    failed: boolean;
  }>;
}

const DEFAULT_PERSISTENT_USAGE_URL = 'http://127.0.0.1:18317/v0/persistent-usage';

export const persistentUsageApi = {
  getUsage: async (): Promise<PersistentUsageSummary> => {
    const response = await fetch(DEFAULT_PERSISTENT_USAGE_URL, {
      method: 'GET',
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Persistent usage API returned ${response.status}`);
    }

    return response.json() as Promise<PersistentUsageSummary>;
  },
};
