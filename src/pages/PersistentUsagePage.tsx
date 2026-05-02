import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { persistentUsageApi, type PersistentUsageSummary } from '@/services/api/persistentUsage';
import styles from './PersistentUsagePage.module.scss';

const compactNumber = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
});

const fullNumber = new Intl.NumberFormat(undefined);

const currency = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

function formatDateTime(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatCost(value: string | number): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '-';
  return currency.format(parsed);
}

export function PersistentUsagePage() {
  const { t } = useTranslation();
  const [data, setData] = useState<PersistentUsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadUsage = useCallback(async () => {
    try {
      setError('');
      const nextData = await persistentUsageApi.getUsage();
      setData(nextData);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useHeaderRefresh(loadUsage);

  useEffect(() => {
    loadUsage();
    const id = window.setInterval(loadUsage, 30_000);
    return () => window.clearInterval(id);
  }, [loadUsage]);

  const summaryCards = useMemo(() => {
    const combinedTokens = data?.combined.tokens ?? 0;
    const combinedRequests = data?.combined.requests ?? 0;
    const recordedTokens = data?.recorded.tokens ?? 0;
    const baselineTokens = data?.baseline.tokens ?? 0;
    const todayTokens = data?.today.tokens ?? 0;
    const todayRequests = data?.today.requests ?? 0;

    return [
      {
        label: t('persistent_usage.total_tokens'),
        value: compactNumber.format(combinedTokens),
        meta: `${fullNumber.format(combinedRequests)} ${t('persistent_usage.requests')}`,
      },
      {
        label: t('persistent_usage.today_tokens'),
        value: compactNumber.format(todayTokens),
        meta: `${fullNumber.format(todayRequests)} ${t('persistent_usage.requests')}`,
      },
      {
        label: t('persistent_usage.recorded_cost'),
        value: formatCost(data?.recorded.estimated_cost_usd ?? 0),
        meta: t('persistent_usage.recorded_cost_meta'),
      },
      {
        label: t('persistent_usage.recovered_baseline'),
        value: compactNumber.format(baselineTokens),
        meta: `${fullNumber.format(recordedTokens)} ${t('persistent_usage.recorded_tokens')}`,
      },
    ];
  }, [data, t]);

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <div className={styles.titleBlock}>
          <h1 className={styles.pageTitle}>{t('persistent_usage.title')}</h1>
          <p className={styles.description}>{t('persistent_usage.description')}</p>
        </div>
        <div className={styles.statusPill}>
          {loading
            ? t('persistent_usage.loading')
            : data
              ? `${t('persistent_usage.updated_at')} ${formatDateTime(data.generated_at)}`
              : t('persistent_usage.not_connected')}
        </div>
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}

      <div className={styles.summaryGrid}>
        {summaryCards.map((card) => (
          <div className={styles.summaryCard} key={card.label}>
            <div className={styles.summaryLabel}>{card.label}</div>
            <div className={styles.summaryValue}>{card.value}</div>
            <div className={styles.summaryMeta}>{card.meta}</div>
          </div>
        ))}
      </div>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{t('persistent_usage.model_breakdown')}</h2>
          <span className={styles.sectionMeta}>{data?.canary ?? 'CPA_USAGE_RECORDER_CANARY_V1'}</span>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('persistent_usage.model')}</th>
                <th>{t('persistent_usage.requests')}</th>
                <th>{t('persistent_usage.tokens')}</th>
                <th>{t('persistent_usage.cached')}</th>
                <th>{t('persistent_usage.reasoning')}</th>
                <th>{t('persistent_usage.cost')}</th>
                <th>{t('persistent_usage.latency')}</th>
              </tr>
            </thead>
            <tbody>
              {(data?.models ?? []).map((model) => (
                <tr key={model.model}>
                  <td>{model.model}</td>
                  <td>{fullNumber.format(model.requests)}</td>
                  <td>{fullNumber.format(model.tokens)}</td>
                  <td>{fullNumber.format(model.cached_tokens)}</td>
                  <td>{fullNumber.format(model.reasoning_tokens)}</td>
                  <td>{formatCost(model.estimated_cost_usd)}</td>
                  <td>{model.avg_latency_ms ? `${fullNumber.format(model.avg_latency_ms)} ms` : '-'}</td>
                </tr>
              ))}
              {data && data.models.length === 0 && (
                <tr>
                  <td colSpan={7} className={styles.muted}>
                    {t('persistent_usage.no_models')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{t('persistent_usage.recent_requests')}</h2>
          <span className={styles.sectionMeta}>
            {t('persistent_usage.runtime_snapshot')}{' '}
            {data?.latest_runtime_snapshot
              ? `${fullNumber.format(data.latest_runtime_snapshot.tokens)} tokens`
              : '-'}
          </span>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('persistent_usage.time')}</th>
                <th>{t('persistent_usage.model')}</th>
                <th>{t('persistent_usage.tokens')}</th>
                <th>{t('persistent_usage.input')}</th>
                <th>{t('persistent_usage.output')}</th>
                <th>{t('persistent_usage.status')}</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recent_events ?? []).map((event) => (
                <tr key={`${event.timestamp}-${event.model}-${event.total_tokens}`}>
                  <td>{formatDateTime(event.timestamp)}</td>
                  <td>{event.model}</td>
                  <td>{fullNumber.format(event.total_tokens)}</td>
                  <td>{fullNumber.format(event.input_tokens)}</td>
                  <td>{fullNumber.format(event.output_tokens)}</td>
                  <td className={event.failed ? styles.failed : styles.ok}>
                    {event.failed ? t('persistent_usage.failed') : t('persistent_usage.success')}
                  </td>
                </tr>
              ))}
              {data && data.recent_events.length === 0 && (
                <tr>
                  <td colSpan={6} className={styles.muted}>
                    {t('persistent_usage.no_requests')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
