// web/src/components/Dashboard/sections/StatsSection.tsx
import * as React from "react";
import type {
  ApiMyStreamer,
  ApiStatsSummary,
  StatsMetric,
  StatsPeriod,
} from "../../../lib/api";
import { getMyStatsSeries, getMyStatsSummary } from "../../../lib/api";
import { useAuth } from "../../../auth/AuthProvider";

/**
 * ✅ ICI : timezone UI
 * Si tu es en France => Europe/Paris
 * (Oslo/Paris ont le même offset la plupart du temps, mais ça évite les bugs de "jour qui saute")
 */
const UI_TZ = "Europe/Paris";

function isoTodayInTZ(tz: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`; // YYYY-MM-DD
}

/** Ajoute des jours à un YYYY-MM-DD sans subir les décalages timezone. */
function addDaysISO(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Ajoute des mois à un YYYY-MM-DD sans toISOString locale (gère les fins de mois). */
function addMonthsISO(iso: string, months: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = d.getUTCDate();

  // se mettre au 1er pour éviter les sauts bizarres (31 -> mois suivant)
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);

  // clamp au dernier jour du mois
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));

  return d.toISOString().slice(0, 10);
}

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

function niceNum(v: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${Math.round((n / 1_000_000) * 10) / 10}M`;
  if (abs >= 1_000) return `${Math.round((n / 1_000) * 10) / 10}k`;
  // valeurs petites
  if (abs < 10 && abs !== 0) return String(Math.round(n * 10) / 10);
  return String(Math.round(n));
}

function formatXLabel(t: string) {
  const s = String(t || "");
  // YYYY-MM-DD => MM-DD
  const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m1) return `${m1[2]}-${m1[3]}`;
  // YYYY-MM => YYYY-MM
  const m2 = s.match(/^(\d{4})-(\d{2})$/);
  if (m2) return `${m2[1]}-${m2[2]}`;
  // ISO date-time => YYYY-MM-DD
  const m3 = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m3) return m3[1].slice(5);
  // fallback court
  return s.length > 10 ? s.slice(0, 10) : s;
}

function MiniLine({ points }: { points: { t: string; v: number }[] }) {
  // un peu plus haut pour laisser place aux axes/labels
  const w = 520;
  const h = 180;

  // paddings pour labels
  const padL = 52;
  const padR = 14;
  const padT = 14;
  const padB = 34;

  const n = points?.length ?? 0;
  const vals = (points || []).map((p) => Number(p.v)).filter((x) => Number.isFinite(x));

  const rawMin = vals.length ? Math.min(...vals) : 0;
  const rawMax = vals.length ? Math.max(...vals) : 1;

  // garde un minimum de range
  const min = Math.min(0, rawMin);
  const max = Math.max(1, rawMax);
  const range = max - min || 1;

  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const X = (i: number) => padL + (i * plotW) / Math.max(1, n - 1);
  const Y = (v: number) => padT + ((max - v) / range) * plotH;

  // Path
  const d =
    n >= 1
      ? points
          .map((p, i) => {
            const xx = X(i).toFixed(2);
            const yy = Y(Number(p.v)).toFixed(2);
            return `${i === 0 ? "M" : "L"} ${xx} ${yy}`;
          })
          .join(" ")
      : "";

  // ticks Y : max / mid / min
  const yTicks = [
    { v: max, y: Y(max) },
    { v: min + range * 0.5, y: Y(min + range * 0.5) },
    { v: min, y: Y(min) },
  ];

  // ticks X : start / mid / end (si dispo)
  const xIdxs =
    n <= 1
      ? [0]
      : n === 2
      ? [0, 1]
      : [0, Math.floor((n - 1) / 2), n - 1];

  const axisColor = "currentColor";

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${w} ${h}`}
      style={{ display: "block" }}
      aria-label="Graphique"
      role="img"
    >
      {/* Grille horizontale */}
      {yTicks.map((t, i) => (
        <path
          key={i}
          d={`M ${padL} ${t.y.toFixed(2)} L ${(w - padR).toFixed(2)} ${t.y.toFixed(2)}`}
          fill="none"
          stroke={axisColor}
          strokeWidth="1"
          opacity="0.10"
        />
      ))}

      {/* Axes */}
      <path
        d={`M ${padL} ${padT} L ${padL} ${padT + plotH}`}
        fill="none"
        stroke={axisColor}
        strokeWidth="1"
        opacity="0.22"
      />
      <path
        d={`M ${padL} ${padT + plotH} L ${w - padR} ${padT + plotH}`}
        fill="none"
        stroke={axisColor}
        strokeWidth="1"
        opacity="0.22"
      />

      {/* Labels Y */}
      {yTicks.map((t, i) => (
        <text
          key={i}
          x={padL - 8}
          y={t.y}
          textAnchor="end"
          dominantBaseline="middle"
          fontSize="11"
          opacity="0.70"
          fill={axisColor}
        >
          {niceNum(t.v)}
        </text>
      ))}

      {/* Courbe */}
      {d ? (
        <path d={d} fill="none" stroke={axisColor} strokeWidth="2.2" opacity="0.9" />
      ) : (
        <text
          x={padL + 8}
          y={padT + 16}
          fontSize="12"
          opacity="0.55"
          fill={axisColor}
        >
          —
        </text>
      )}

      {/* Labels X */}
      {xIdxs.map((i) => {
        const p = points[i];
        if (!p) return null;
        const x = X(i);
        const y = padT + plotH + 18;
        return (
          <text
            key={i}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="11"
            opacity="0.70"
            fill={axisColor}
          >
            {formatXLabel(p.t)}
          </text>
        );
      })}
    </svg>
  );
}

export function StatsSection({ streamer }: { streamer: ApiMyStreamer }) {
  const auth = useAuth() as any;
  const token = auth?.token as string | undefined;

  const [period, setPeriod] = React.useState<StatsPeriod>("daily");

  // ✅ IMPORTANT: "aujourd'hui" calculé dans le TZ choisi (France/Paris)
  const [cursor, setCursor] = React.useState<string>(() => isoTodayInTZ(UI_TZ));

  const [metric, setMetric] = React.useState<StatsMetric>("viewers_avg");

  const [sum, setSum] = React.useState<ApiStatsSummary | null>(null);
  const [series, setSeries] = React.useState<{ t: string; v: number }[]>([]);
  const [loading, setLoading] = React.useState(false);

  // ✅ Fix navigation : pas de toISOString sur une date locale
  const move = (dir: -1 | 1) => {
    setCursor((c) => {
      if (period === "daily") return addDaysISO(c, dir);
      if (period === "weekly") return addDaysISO(c, dir * 7);
      return addMonthsISO(c, dir); // monthly
    });
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
      } catch {
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
      <div className="mutedSmall" style={{ marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.1 }}>{value}</div>
      {growth !== undefined ? (
        <div className="mutedSmall" style={{ marginTop: 8, opacity: 0.85 }}>
          {growth}
        </div>
      ) : null}
    </button>
  );

  return (
    <div className="panel">
      <div
        className="panelTitle"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
      >
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

        <button type="button" className="btn" onClick={() => move(-1)}>
          ◀
        </button>
        <div className="mutedSmall" style={{ padding: "6px 10px" }}>
          {cursor}
        </div>
        <button type="button" className="btn" onClick={() => move(1)}>
          ▶
        </button>
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
          <div className="mutedSmall" style={{ marginTop: 8 }}>
            à brancher plus tard
          </div>
        </div>
      </div>
    </div>
  );
}
