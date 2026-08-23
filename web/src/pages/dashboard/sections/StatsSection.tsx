import * as React from "react";
import { useAuth } from "../../../auth/AuthProvider";
import {
  getMyStatsSeries,
  getMyStatsSummary,
  type ApiMetric,
  type ApiMyStreamer,
  type ApiStatsSummary,
  type StatsMetric,
  type StatsPeriod,
} from "../../../lib/api";

const UI_TZ = "Europe/Paris";
const METRIC_LABELS: Record<StatsMetric, string> = {
  viewers_avg: "Viewers moyens",
  viewers_peak: "Pic de viewers",
  messages: "Messages du chat",
  watch_time: "Heures regardees",
};

function todayInParis() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: UI_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function moveDate(iso: string, period: StatsPeriod, direction: -1 | 1) {
  const date = new Date(`${iso}T12:00:00Z`);
  if (period === "monthly") date.setUTCMonth(date.getUTCMonth() + direction);
  else date.setUTCDate(date.getUTCDate() + direction * (period === "weekly" ? 7 : 1));
  return date.toISOString().slice(0, 10);
}

function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits }).format(Number(value) || 0);
}

function formatHours(value: number) {
  return `${formatNumber(value, 1)} h`;
}

function formatPeriod(summary: ApiStatsSummary | null, fallback: string) {
  if (!summary) return fallback;
  const format = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: UI_TZ });
  const start = new Date(summary.rangeStart);
  const end = new Date(new Date(summary.rangeEnd).getTime() - 1);
  return `${format.format(start)} - ${format.format(end)}`;
}

function Growth({ metric }: { metric: ApiMetric | null }) {
  if (!metric || metric.growthPct == null) return <span className="stats-growth is-neutral">Pas de comparaison</span>;
  const rounded = Math.round(metric.growthPct * 10) / 10;
  const tone = rounded > 0 ? "is-up" : rounded < 0 ? "is-down" : "is-neutral";
  return <span className={`stats-growth ${tone}`}>{rounded > 0 ? "+" : ""}{formatNumber(rounded, 1)} % vs periode precedente</span>;
}

function MetricCard({
  label,
  value,
  metric,
  active,
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  metric: ApiMetric | null;
  active?: boolean;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} className={`stats-metric-card${active ? " is-active" : ""}`} onClick={onClick}>
      <span className="stats-metric-label">{label}</span>
      <strong>{value}</strong>
      <Growth metric={metric} />
    </Tag>
  );
}

function LineChart({ points }: { points: Array<{ t: string; v: number }> }) {
  const width = 760;
  const height = 250;
  const pad = { left: 48, right: 18, top: 18, bottom: 38 };
  const values = points.map((point) => Number(point.v) || 0);
  const max = Math.max(1, ...values);
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const x = (index: number) => pad.left + (index * plotWidth) / Math.max(1, points.length - 1);
  const y = (value: number) => pad.top + (1 - value / max) * plotHeight;
  const line = points.map((point, index) => `${index ? "L" : "M"} ${x(index).toFixed(1)} ${y(point.v).toFixed(1)}`).join(" ");
  const area = line ? `${line} L ${x(points.length - 1).toFixed(1)} ${pad.top + plotHeight} L ${pad.left} ${pad.top + plotHeight} Z` : "";
  const ticks = [max, max / 2, 0];
  const xIndexes = points.length > 2 ? [0, Math.floor((points.length - 1) / 2), points.length - 1] : points.map((_, index) => index);

  return (
    <svg className="stats-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Evolution de la statistique selectionnee">
      <defs>
        <linearGradient id="stats-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8b5cf6" stopOpacity="0.38" />
          <stop offset="1" stopColor="#8b5cf6" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((tick) => {
        const yy = y(tick);
        return <g key={tick}><line x1={pad.left} x2={width - pad.right} y1={yy} y2={yy} className="stats-grid-line" /><text x={pad.left - 9} y={yy + 4} textAnchor="end">{formatNumber(tick, 1)}</text></g>;
      })}
      {area ? <path d={area} fill="url(#stats-area)" /> : null}
      {line ? <path d={line} className="stats-chart-line" /> : null}
      {points.map((point, index) => <circle key={`${point.t}-${index}`} cx={x(index)} cy={y(point.v)} r="3" className="stats-chart-dot"><title>{`${formatNumber(point.v, 1)} - ${new Date(point.t).toLocaleString("fr-FR")}`}</title></circle>)}
      {xIndexes.map((index) => points[index] ? <text key={index} x={x(index)} y={height - 12} textAnchor="middle">{new Date(points[index].t).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", timeZone: UI_TZ })}</text> : null)}
    </svg>
  );
}

export function StatsSection({ streamer }: { streamer: ApiMyStreamer }) {
  const { token } = useAuth();
  const [period, setPeriod] = React.useState<StatsPeriod>("weekly");
  const [cursor, setCursor] = React.useState(todayInParis);
  const [metric, setMetric] = React.useState<StatsMetric>("viewers_avg");
  const [summary, setSummary] = React.useState<ApiStatsSummary | null>(null);
  const [series, setSeries] = React.useState<Array<{ t: string; v: number }>>([]);
  const [summaryLoading, setSummaryLoading] = React.useState(true);
  const [seriesLoading, setSeriesLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    setSummaryLoading(true);
    setError(null);
    getMyStatsSummary(token, period, cursor)
      .then((data) => { if (!controller.signal.aborted) setSummary(data); })
      .catch(() => { if (!controller.signal.aborted) setError("Impossible de charger les statistiques."); })
      .finally(() => { if (!controller.signal.aborted) setSummaryLoading(false); });
    return () => controller.abort();
  }, [token, period, cursor]);

  React.useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    setSeriesLoading(true);
    getMyStatsSeries(token, period, cursor, metric)
      .then((data) => { if (!controller.signal.aborted) setSeries(data.points || []); })
      .catch(() => { if (!controller.signal.aborted) setSeries([]); })
      .finally(() => { if (!controller.signal.aborted) setSeriesLoading(false); });
    return () => controller.abort();
  }, [token, period, cursor, metric]);

  const metrics = summary?.metrics;
  const nextCursor = moveDate(cursor, period, 1);
  const canMoveNext = nextCursor <= todayInParis();
  const show = (value: React.ReactNode) => summaryLoading && !summary ? "..." : value;

  return (
    <div className="stats-dashboard">
      <div className="stats-toolbar">
        <div>
          <div className="panelTitle">Audience de @{streamer.slug}</div>
          <div className="mutedSmall">Donnees mesurees directement sur LunaLive, fuseau Europe/Paris.</div>
        </div>
        <div className="stats-periods" aria-label="Periode statistique">
          {(["daily", "weekly", "monthly"] as StatsPeriod[]).map((item) => <button key={item} type="button" className={period === item ? "is-active" : ""} onClick={() => setPeriod(item)}>{item === "daily" ? "Jour" : item === "weekly" ? "Semaine" : "Mois"}</button>)}
        </div>
      </div>

      <div className="stats-date-nav">
        <button type="button" className="btnGhost" onClick={() => setCursor(moveDate(cursor, period, -1))}>Periode precedente</button>
        <strong>{formatPeriod(summary, cursor)}</strong>
        <button type="button" className="btnGhost" disabled={!canMoveNext} onClick={() => setCursor(nextCursor)}>Periode suivante</button>
      </div>

      {error ? <div className="dash-alert" role="alert">{error}</div> : null}

      <section className="stats-primary-grid" aria-label="Indicateurs principaux">
        <MetricCard label="Viewers moyens" value={show(formatNumber(metrics?.avgViewers.value || 0, 1))} metric={metrics?.avgViewers || null} active={metric === "viewers_avg"} onClick={() => setMetric("viewers_avg")} />
        <MetricCard label="Pic de viewers" value={show(formatNumber(metrics?.peakViewers.value || 0))} metric={metrics?.peakViewers || null} active={metric === "viewers_peak"} onClick={() => setMetric("viewers_peak")} />
        <MetricCard label="Heures regardees" value={show(formatHours(metrics?.watchHours.value || 0))} metric={metrics?.watchHours || null} active={metric === "watch_time"} onClick={() => setMetric("watch_time")} />
        <MetricCard label="Nouveaux follows" value={show(formatNumber(metrics?.followersGained.value || 0))} metric={metrics?.followersGained || null} />
      </section>

      <section className="stats-chart-panel">
        <div className="stats-chart-head"><div><span>Evolution</span><strong>{METRIC_LABELS[metric]}</strong></div>{seriesLoading ? <span className="mutedSmall">Actualisation...</span> : null}</div>
        <LineChart points={series} />
      </section>

      <section className="stats-secondary-grid" aria-label="Indicateurs detailles">
        <MetricCard label="Followers au total" value={show(formatNumber(metrics?.followersTotal.value || 0))} metric={metrics?.followersTotal || null} />
        <MetricCard label="Viewers uniques" value={show(formatNumber(metrics?.viewersUnique.value || 0))} metric={metrics?.viewersUnique || null} />
        <MetricCard label="Temps moyen par viewer" value={show(`${formatNumber(metrics?.avgWatchMinutes.value || 0, 1)} min`)} metric={metrics?.avgWatchMinutes || null} />
        <MetricCard label="Messages" value={show(formatNumber(metrics?.messages.value || 0))} metric={metrics?.messages || null} active={metric === "messages"} onClick={() => setMetric("messages")} />
        <MetricCard label="Chatteurs uniques" value={show(formatNumber(metrics?.chattersUnique.value || 0))} metric={metrics?.chattersUnique || null} />
        <MetricCard label="Taux d'engagement" value={show(`${formatNumber((metrics?.engagementRate.value || 0) * 100, 1)} %`)} metric={metrics?.engagementRate || null} />
        <MetricCard label="Messages par heure" value={show(formatNumber(metrics?.messagesPerHour.value || 0, 1))} metric={metrics?.messagesPerHour || null} />
        <MetricCard label="Temps diffuse" value={show(formatHours(metrics?.streamHours.value || 0))} metric={metrics?.streamHours || null} />
        <MetricCard label="Jours diffuses" value={show(formatNumber(metrics?.streamDays.value || 0))} metric={metrics?.streamDays || null} />
      </section>

      <div className="stats-footnote">Les viewers et le watch time correspondent uniquement a l'audience mesuree sur LunaLive. Les messages Rumble importes sont comptes dans l'activite du chat.</div>
    </div>
  );
}
