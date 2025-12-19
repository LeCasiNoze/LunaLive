import * as React from "react";
import type { ApiMyStreamer, ApiStatsSummary, StatsMetric, StatsPeriod } from "../../../lib/api";
import { getMyStatsSeries, getMyStatsSummary } from "../../../lib/api";
import { useAuth } from "../../../auth/AuthProvider";

function fmtPct(x: number | null) {
  if (x === null) return "—";
  const v = Math.round(x * 10) / 10;
  return `${v > 0 ? "+" : ""}${v}%`;
}

function fmtHours(x: number) {
  return `${Math.round(x * 10) / 10}h`;
}

function fmtMinutes(x: number) {
  return `${Math.round(x)}m`;
}

function MiniLine({ points }: { points: { t: string; v: number }[] }) {
  const w = 520;
  const h = 140;
  const pad = 12;

  const vals = points.map((p) => p.v);
  const min = Math.min(0, ...vals);
  const max = Math.max(1, ...vals);

  const X = (i: number) => pad + (i * (w - pad * 2)) / Math.max(1, points.length - 1);
  const Y = (v: number) => {
    const t = (v - min) / (max - min || 1);
    return h - pad - t * (h - pad * 2);
  };

  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${X(i).toFixed(2)} ${Y(p.v).toFixed(2)}`)
    .join(" ");

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2.2" opacity="0.9" />
      <path
        d={`M ${pad} ${h - pad} L ${w - pad} ${h - pad}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.18"
      />
    </svg>
  );
}

export function StatsSection({ streamer }: { streamer: ApiMyStreamer }) {
  const auth = useAuth() as any;
  const token = auth?.token as string | undefined;

  const [period, setPeriod] = React.useState<StatsPeriod>("daily");
  const [cursor, setCursor] = React.useState<string>(() => new Date().toISOString().slice(0, 10));
  const [metric, setMetric] = React.useState<StatsMetric>("viewers_avg");

  const [sum, setSum] = React.useState<ApiStatsSummary | null>(null);
  const [series, setSeries] = React.useState<{ t: string; v: number }[]>([]);
  const [loading, setLoading] = React.useState(false);

  const move = (dir: -1 | 1) => {
    const d = new Date(cursor + "T00:00:00");
    if (period === "daily") d.setDate(d.getDate() + dir);
    if (period === "weekly") d.setDate(d.getDate() + dir * 7);
    if (period === "monthly") d.setMonth(d.getMonth() + dir);
    setCursor(d.toISOString().slice(0, 10));
  };

  React.useEffect(() => {
    if (!token) return;
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        const s = await getMyStatsSummary(token, period, cursor);
        const g = await getMyStatsSeries(token, period, cursor, metric);
        if (!mounted) return;
        setSum(s);
        setSeries(g.points || []);
      } catch (e) {
        if (mounted) {
          setSum(null);
          setSeries([]);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [token, period, cursor, metric]);

  const m = sum?.metrics;

  const Card = ({
    title,
    value,
    growth,
    onClick,
    active,
  }: {
    title: string;
    value: React.ReactNode;
    growth?: React.ReactNode;
    onClick?: () => void;
    active?: boolean;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className="panel"
      style={{
        textAlign: "left",
        cursor: onClick ? "pointer" : "default",
        border: active ? "1px solid rgba(180,160,255,0.45)" : undefined,
      }}
    >
      <div className="mutedSmall" style={{ marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.1 }}>{value}</div>
      {growth !== undefined ? (
        <div className="mutedSmall" style={{ marginTop: 8, opacity: 0.85 }}>{growth}</div>
      ) : null}
    </button>
  );

  return (
    <div className="panel">
      <div className="panelTitle" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span>Stats</span>
        <span className="mutedSmall">@{streamer.slug}</span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        {(["daily", "weekly", "monthly"] as StatsPeriod[]).map((p) => (
          <button
            key={p}
            type="button"
            className="btn"
            onClick={() => setPeriod(p)}
            style={{ opacity: period === p ? 1 : 0.6 }}
          >
            {p === "daily" ? "Quotidien" : p === "weekly" ? "Hebdo" : "Mensuel"}
          </button>
        ))}

        <div style={{ flex: 1 }} />

        <button type="button" className="btn" onClick={() => move(-1)}>◀</button>
        <div className="mutedSmall" style={{ padding: "6px 10px" }}>{cursor}</div>
        <button type="button" className="btn" onClick={() => move(1)}>▶</button>
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="mutedSmall" style={{ marginBottom: 6 }}>
          Graphe (clique une carte pour changer)
        </div>
        <div className="panel" style={{ padding: 12 }}>
          {loading ? <div className="muted">Chargement…</div> : <MiniLine points={series} />}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 10,
          marginTop: 12,
        }}
      >
        <Card
          title="Peak viewers"
          value={m ? Math.round(m.peakViewers.value) : "—"}
          growth={m ? fmtPct(m.peakViewers.growthPct) : "—"}
          onClick={() => setMetric("viewers_peak")}
          active={metric === "viewers_peak"}
        />
        <Card
          title="Moyenne viewers"
          value={m ? Math.round(m.avgViewers.value) : "—"}
          growth={m ? fmtPct(m.avgViewers.growthPct) : "—"}
          onClick={() => setMetric("viewers_avg")}
          active={metric === "viewers_avg"}
        />
        <Card
          title="Watch time"
          value={m ? fmtHours(m.watchHours.value) : "—"}
          growth={m ? fmtPct(m.watchHours.growthPct) : "—"}
          onClick={() => setMetric("watch_time")}
          active={metric === "watch_time"}
        />

        <Card
          title="Avg watch / viewer"
          value={m ? fmtMinutes(m.avgWatchMinutes.value) : "—"}
          growth={m ? fmtPct(m.avgWatchMinutes.growthPct) : "—"}
        />
        <Card
          title="Heures streamées"
          value={m ? fmtHours(m.streamHours.value) : "—"}
          growth={m ? fmtPct(m.streamHours.growthPct) : "—"}
        />
        <Card
          title="Jours streamés"
          value={m ? Math.round(m.streamDays.value) : "—"}
          growth={m ? fmtPct(m.streamDays.growthPct) : "—"}
        />

        <Card
          title="Viewers uniques"
          value={m ? Math.round(m.viewersUnique.value) : "—"}
          growth={m ? fmtPct(m.viewersUnique.growthPct) : "—"}
        />
        <Card
          title="Chatteurs uniques"
          value={m ? Math.round(m.chattersUnique.value) : "—"}
          growth={m ? fmtPct(m.chattersUnique.growthPct) : "—"}
        />
        <Card
          title="Taux d'engagement"
          value={m ? `${Math.round(m.engagementRate.value * 1000) / 10}%` : "—"}
          growth={m ? fmtPct(m.engagementRate.growthPct) : "—"}
        />

        <Card
          title="Messages"
          value={m ? Math.round(m.messages.value) : "—"}
          growth={m ? fmtPct(m.messages.growthPct) : "—"}
          onClick={() => setMetric("messages")}
          active={metric === "messages"}
        />
        <Card
          title="Messages / heure"
          value={m ? `${Math.round(m.messagesPerHour.value * 10) / 10}/h` : "—"}
          growth={m ? fmtPct(m.messagesPerHour.growthPct) : "—"}
        />
        <div className="panel" style={{ opacity: 0.6 }}>
          <div className="mutedSmall">V2</div>
          <div style={{ fontWeight: 800, marginTop: 6 }}>Follows / Subs / Dons</div>
          <div className="mutedSmall" style={{ marginTop: 8 }}>à brancher plus tard</div>
        </div>
      </div>
    </div>
  );
}
