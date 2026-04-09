// web/src/components/admin/PlatformStatsSection.tsx
import * as React from "react";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

interface PlatformStats {
  generatedAt: string;
  users: { total: number; newThisMonth: number; newToday: number };
  streamers: { total: number; live: number };
  casinos: { published: number };
  viewers: { current: number; uniqueThisMonth: number; sessionsThisMonth: number; avgSessionSec: number };
  streams: { sessionsThisMonth: number; totalMinutesThisMonth: number };
  server: {
    uptimeSeconds: number;
    memoryMb: { rss: number; heapUsed: number; heapTotal: number };
    db: { total: number; idle: number; waiting: number };
  };
}

function fmtDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${h}h ${m}m`;
}

function fmtUptime(secs: number): string {
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}j ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function StatCard({ label, value, sub, accent }: { label: string; value: React.ReactNode; sub?: string; accent?: string }) {
  return (
    <div style={{
      padding: "14px 16px",
      borderRadius: 14,
      border: `1px solid ${accent ? accent + "44" : "rgba(255,255,255,0.10)"}`,
      background: accent ? `${accent}11` : "rgba(255,255,255,0.03)",
      display: "flex",
      flexDirection: "column",
      gap: 4,
    }}>
      <div style={{ fontSize: 11, opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1, color: accent ?? "inherit" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, opacity: 0.5 }}>{sub}</div>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.5, marginBottom: 8, marginTop: 20 }}>
      {children}
    </div>
  );
}

function DbBar({ used, total, label }: { used: number; total: number; label: string }) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  const color = pct > 80 ? "#ef4444" : pct > 60 ? "#f59e0b" : "#22c55e";
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
        <span style={{ opacity: 0.7 }}>{label}</span>
        <span style={{ fontWeight: 700 }}>{used} / {total} <span style={{ opacity: 0.5 }}>({pct}%)</span></span>
      </div>
      <div style={{ height: 6, borderRadius: 99, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 99, transition: "width 0.4s" }} />
      </div>
    </div>
  );
}

export function PlatformStatsSection({ adminKey }: { adminKey: string }) {
  const [stats, setStats] = React.useState<PlatformStats | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = React.useState<Date | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE}/admin/platform-stats`, {
        headers: { "x-admin-key": adminKey },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      if (!data.ok) throw new Error(data.error ?? "unknown");
      setStats(data);
      setLastRefresh(new Date());
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [adminKey]);

  React.useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading && !stats) {
    return <div style={{ padding: 24, opacity: 0.5 }}>Chargement des stats...</div>;
  }
  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ color: "#ef4444", marginBottom: 12 }}>Erreur : {error}</div>
        <button className="btnSecondary" onClick={load}>Réessayer</button>
      </div>
    );
  }
  if (!stats) return null;

  const { users, streamers, casinos, viewers, streams, server } = stats;
  const memPct = Math.round((server.memoryMb.heapUsed / server.memoryMb.heapTotal) * 100);
  const memColor = memPct > 95 ? "#ef4444" : memPct > 80 ? "#f59e0b" : "#22c55e";
  const dbActive = server.db.total - server.db.idle;
  const dbUsedPct = server.db.total > 0 ? Math.round((dbActive / server.db.total) * 100) : 0;
  const dbColor = dbUsedPct > 80 ? "#ef4444" : dbUsedPct > 60 ? "#f59e0b" : "#22c55e";

  return (
    <div style={{ padding: "4px 0" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div style={{ fontSize: 12, opacity: 0.45 }}>
          Mis à jour : {lastRefresh?.toLocaleTimeString("fr-FR")} · auto-refresh 30s
        </div>
        <button className="btnSecondary" style={{ fontSize: 12, padding: "4px 10px" }} onClick={load} disabled={loading}>
          {loading ? "..." : "↻ Refresh"}
        </button>
      </div>

      {/* Viewers live — highlight */}
      <div style={{
        padding: "16px 20px",
        borderRadius: 16,
        background: viewers.current > 0 ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.03)",
        border: `1px solid ${viewers.current > 0 ? "#22c55e44" : "rgba(255,255,255,0.1)"}`,
        marginBottom: 16,
        display: "flex",
        alignItems: "center",
        gap: 20,
        flexWrap: "wrap",
      }}>
        <div>
          <div style={{ fontSize: 11, opacity: 0.55, textTransform: "uppercase", letterSpacing: "0.05em" }}>Viewers en direct</div>
          <div style={{ fontSize: 48, fontWeight: 900, lineHeight: 1, color: viewers.current > 0 ? "#22c55e" : undefined }}>
            {viewers.current}
          </div>
        </div>
        <div style={{ opacity: 0.4, fontSize: 20 }}>|</div>
        <div>
          <div style={{ fontSize: 11, opacity: 0.55, textTransform: "uppercase", letterSpacing: "0.05em" }}>Streams live</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: streamers.live > 0 ? "#a78bfa" : undefined }}>{streamers.live}</div>
        </div>
        <div style={{ opacity: 0.4, fontSize: 20 }}>|</div>
        <div>
          <div style={{ fontSize: 11, opacity: 0.55, textTransform: "uppercase", letterSpacing: "0.05em" }}>Durée moy. session</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{fmtDuration(viewers.avgSessionSec)}</div>
        </div>
      </div>

      {/* Croissance utilisateurs */}
      <SectionTitle>Utilisateurs</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10, marginBottom: 4 }}>
        <StatCard label="Total comptes" value={users.total.toLocaleString("fr-FR")} />
        <StatCard label="Nouveaux ce mois" value={`+${users.newThisMonth}`} accent="#60a5fa" />
        <StatCard label="Inscrits aujourd'hui" value={`+${users.newToday}`} accent="#a78bfa" />
        <StatCard label="Streamers" value={streamers.total} />
        <StatCard label="Casinos publiés" value={casinos.published} />
      </div>

      {/* Audience ce mois */}
      <SectionTitle>Audience — {new Date().toLocaleString("fr-FR", { month: "long", year: "numeric" })}</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10, marginBottom: 4 }}>
        <StatCard label="Viewers uniques" value={viewers.uniqueThisMonth.toLocaleString("fr-FR")} accent="#22c55e" />
        <StatCard label="Sessions viewers" value={viewers.sessionsThisMonth.toLocaleString("fr-FR")} />
        <StatCard label="Sessions stream" value={streams.sessionsThisMonth} />
        <StatCard
          label="Minutes streamées"
          value={(streams.totalMinutesThisMonth ?? 0).toLocaleString("fr-FR")}
          sub={`≈ ${Math.round((streams.totalMinutesThisMonth ?? 0) / 60)}h`}
        />
      </div>

      {/* Serveur */}
      <SectionTitle>Serveur API</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>

        {/* Uptime */}
        <div style={{ padding: "14px 16px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)" }}>
          <div style={{ fontSize: 11, opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Uptime process</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{fmtUptime(server.uptimeSeconds)}</div>
        </div>

        {/* RAM */}
        <div style={{ padding: "14px 16px", borderRadius: 14, border: `1px solid ${memColor}44`, background: `${memColor}0d` }}>
          <div style={{ fontSize: 11, opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Mémoire heap</div>
          <DbBar used={server.memoryMb.heapUsed} total={server.memoryMb.heapTotal} label="Heap" />
          <div style={{ fontSize: 11, opacity: 0.5 }}>RSS total : {server.memoryMb.rss} MB</div>
        </div>

        {/* DB Pool */}
        <div style={{ padding: "14px 16px", borderRadius: 14, border: `1px solid ${dbColor}44`, background: `${dbColor}0d` }}>
          <div style={{ fontSize: 11, opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Pool DB (pg)</div>
          <DbBar used={server.db.total - server.db.idle} total={server.db.total} label="Connexions actives" />
          {server.db.waiting > 3 && (
            <div style={{ fontSize: 12, color: "#f59e0b", fontWeight: 700 }}>⚠ {server.db.waiting} en attente</div>
          )}
          <div style={{ fontSize: 11, opacity: 0.5 }}>Actives : {dbActive} · Idle : {server.db.idle} · Max : {server.db.total}</div>
        </div>
      </div>

      {/* Coûts estimés */}
      <SectionTitle>Coûts estimés</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
        <StatCard label="Render API" value="$7/mois" sub="Starter plan fixe" />
        <StatCard label="Cloudflare Workers" value="$5/mois" sub={`+$0.50/M req · ${Math.round(viewers.sessionsThisMonth * 50 / 1_000_000 * 100) / 100}M est.`} />
        <StatCard label="DB (Render PG)" value="$7/mois" sub="Starter plan fixe" />
        <StatCard
          label="Total estimé"
          value="~$19/mois"
          accent="#f59e0b"
          sub="hors surcharge CF"
        />
      </div>
    </div>
  );
}
