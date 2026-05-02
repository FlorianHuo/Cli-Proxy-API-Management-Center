/**
 * 使用统计相关 API
 */

import { computeKeyStats, type KeyStats } from '@/utils/usage';

const USAGE_TIMEOUT_MS = 60 * 1000;
const PERSISTENT_USAGE_URL = 'http://127.0.0.1:18317/v0/persistent-usage';

export interface UsageExportPayload {
  version?: number;
  exported_at?: string;
  usage?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface UsageImportResponse {
  added?: number;
  skipped?: number;
  total_requests?: number;
  failed_requests?: number;
  [key: string]: unknown;
}

interface PersistentUsageSummary {
  baseline?: {
    requests?: number;
    tokens?: number;
  };
  recorded?: {
    requests?: number;
    failed_requests?: number;
    tokens?: number;
  };
  combined?: {
    requests?: number;
    tokens?: number;
  };
  baselines?: Array<{
    label?: string;
    total_requests?: number;
    total_tokens?: number;
    created_at?: string;
  }>;
  recent_events?: Array<{
    timestamp?: string;
    model?: string;
    total_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
    reasoning_tokens?: number;
    cached_tokens?: number;
    latency_ms?: number | null;
    failed?: boolean;
  }>;
}

interface UsageDetail {
  timestamp: string;
  source: string;
  auth_index: string;
  latency_ms: number | null;
  tokens: {
    input_tokens: number;
    output_tokens: number;
    reasoning_tokens: number;
    cached_tokens: number;
    total_tokens: number;
  };
  failed: boolean;
}

interface UsageModel {
  total_requests: number;
  success_count: number;
  failure_count: number;
  total_tokens: number;
  details: UsageDetail[];
}

interface UsageApiEntry {
  total_requests: number;
  success_count: number;
  failure_count: number;
  total_tokens: number;
  models: Record<string, UsageModel>;
}

const toNumber = (value: unknown): number => {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
};

const fetchJson = async <T>(url: string): Promise<T> => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), USAGE_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Persistent usage API returned ${response.status}`);
    }
    return response.json() as Promise<T>;
  } finally {
    window.clearTimeout(timeout);
  }
};

const ensureModel = (
  apis: Record<string, UsageApiEntry>,
  apiName: string,
  modelName: string
): UsageModel => {
  const api = (apis[apiName] ??= {
    total_requests: 0,
    success_count: 0,
    failure_count: 0,
    total_tokens: 0,
    models: {},
  });

  return (api.models[modelName] ??= {
    total_requests: 0,
    success_count: 0,
    failure_count: 0,
    total_tokens: 0,
    details: [],
  });
};

const addModelUsage = (
  apis: Record<string, UsageApiEntry>,
  apiName: string,
  modelName: string,
  requests: number,
  failureCount: number,
  totalTokens: number,
  details: UsageDetail[]
) => {
  const api = (apis[apiName] ??= {
    total_requests: 0,
    success_count: 0,
    failure_count: 0,
    total_tokens: 0,
    models: {},
  });
  const model = ensureModel(apis, apiName, modelName);
  const successCount = Math.max(requests - failureCount, 0);

  model.total_requests += requests;
  model.success_count += successCount;
  model.failure_count += failureCount;
  model.total_tokens += totalTokens;
  model.details.push(...details);

  api.total_requests += requests;
  api.success_count += successCount;
  api.failure_count += failureCount;
  api.total_tokens += totalTokens;
};

const toUsagePayload = (summary: PersistentUsageSummary): Record<string, unknown> => {
  const apis: Record<string, UsageApiEntry> = {};
  const baselineRequests = toNumber(summary.baseline?.requests);
  const baselineTokens = toNumber(summary.baseline?.tokens);
  const recordedRequests = toNumber(summary.recorded?.requests);
  const recordedFailures = toNumber(summary.recorded?.failed_requests);
  const recordedTokens = toNumber(summary.recorded?.tokens);
  const baseline = summary.baselines?.[0];

  if (baselineRequests > 0 || baselineTokens > 0) {
    addModelUsage(
      apis,
      'persistent-baseline',
      'recovered-baseline',
      baselineRequests,
      0,
      baselineTokens,
      [
        {
          timestamp: baseline?.created_at || new Date().toISOString(),
          source: baseline?.label || 'pre-recorder-baseline',
          auth_index: 'baseline',
          latency_ms: null,
          failed: false,
          tokens: {
            input_tokens: 0,
            output_tokens: 0,
            reasoning_tokens: 0,
            cached_tokens: 0,
            total_tokens: baselineTokens,
          },
        },
      ]
    );
  }

  (summary.recent_events || []).forEach((event) => {
    const failed = Boolean(event.failed);
    const modelName = event.model || 'unknown';
    addModelUsage(
      apis,
      'persistent-recorder',
      modelName,
      1,
      failed ? 1 : 0,
      toNumber(event.total_tokens),
      [
        {
          timestamp: event.timestamp || new Date().toISOString(),
          source: 'persistent-recorder',
          auth_index: 'recorder',
          latency_ms: event.latency_ms ?? null,
          failed,
          tokens: {
            input_tokens: toNumber(event.input_tokens),
            output_tokens: toNumber(event.output_tokens),
            reasoning_tokens: toNumber(event.reasoning_tokens),
            cached_tokens: toNumber(event.cached_tokens),
            total_tokens: toNumber(event.total_tokens),
          },
        },
      ]
    );
  });

  const totalRequests = toNumber(summary.combined?.requests) || baselineRequests + recordedRequests;
  const totalTokens = toNumber(summary.combined?.tokens) || baselineTokens + recordedTokens;

  return {
    total_requests: totalRequests,
    success_count: Math.max(totalRequests - recordedFailures, 0),
    failure_count: recordedFailures,
    total_tokens: totalTokens,
    apis,
    persistent_canary: 'CPA_USAGE_RECORDER_CANARY_V1',
  };
};

export const usageApi = {
  /**
   * 获取使用统计原始数据
   */
  async getUsage() {
    const summary = await fetchJson<PersistentUsageSummary>(PERSISTENT_USAGE_URL);
    return toUsagePayload(summary);
  },

  /**
   * 导出使用统计快照
   */
  async exportUsage() {
    const summary = await fetchJson<PersistentUsageSummary>(PERSISTENT_USAGE_URL);
    return {
      version: 1,
      exported_at: new Date().toISOString(),
      usage: toUsagePayload(summary),
      persistent_summary: summary,
    };
  },

  /**
   * 导入使用统计快照
   */
  async importUsage(_payload: unknown): Promise<UsageImportResponse> {
    throw new Error('Persistent usage import is handled by the local ledger, not the panel.');
  },

  /**
   * 计算密钥成功/失败统计，必要时会先获取 usage 数据
   */
  async getKeyStats(usageData?: unknown): Promise<KeyStats> {
    let payload = usageData;
    if (!payload) {
      const response = await usageApi.getUsage();
      payload = response?.usage ?? response;
    }
    return computeKeyStats(payload);
  }
};
