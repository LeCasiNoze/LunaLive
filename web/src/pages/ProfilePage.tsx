// web/src/pages/ProfilePage.tsx
import * as React from "react";
import { Link } from "react-router-dom";
import { applyStreamer, myStreamerRequest } from "../lib/api";
import { useAuth } from "../auth/AuthProvider";
import { AchievementsModal } from "../components/AchievementsModal";
import { PersonalisationSection } from "../components/profile/PersonalisationSection";
import {
  myFollowing,
  myProfileStats,
  type ApiFollowing,
  type ApiProfileStats,
} from "../lib/api_profile";

type Tab = "overview" | "personalisation" | "social" | "stats";

function initials(name: string) {
  const s = (name || "?").trim();
  if (!s) return "?";
  const parts = s.split(/[\s._-]+/g).filter(Boolean);
  const a = parts[0]?.[0] ?? s[0];
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] : s[1];
  return (a + (b ?? "")).toUpperCase();
}

function fmt(n: number) {
  return n.toLocaleString("fr-FR");
}

function fmtRubis(n: number | null | undefined) {
  if (n == null) return "—";
  return fmt(n);
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function humanDuration(seconds: number | null | undefined) {
  if (seconds == null) return "—";
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h <= 0) return `${m} min`;
  if (m <= 0) return `${h} h`;
  return `${h} h ${m} min`;
}

function dowLabel(dow: number | null | undefined) {
  if (dow == null) return "—";
  const labels = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
  return labels[dow] ?? String(dow);
}

function hourLabel(hour: number | null | undefined) {
  if (hour == null) return "—";
  const h = clamp(Math.floor(hour), 0, 23);
  return `${String(h).padStart(2, "0")}:00`;
}

function Chip({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.04)",
        fontSize: 13,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function StatCard({
  title,
  value,
  sub,
  right,
}: {
  title: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="panel" style={{ margin: 0 }}>
      <div
        className="panelTitle"
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <span>{title}</span>
        {right ? <span className="muted">{right}</span> : null}
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, marginTop: 6 }}>
        {value}
      </div>
      {sub ? (
        <div className="muted" style={{ marginTop: 6 }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function SegButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={active ? "btnPrimary" : "btnGhost"}
      onClick={onClick}
      style={{ padding: "10px 12px" }}
    >
      {children}
    </button>
  );
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function MiniBarList({
  title,
  items,
  valueKey,
  onItemLink,
  emptyLabel,
}: {
  title: string;
  items: Array<any>;
  valueKey: "seconds" | "minutes" | "messages";
  onItemLink: (slug: string) => string;
  emptyLabel?: string;
}) {
  const max = Math.max(
    0,
    ...items.map((x) => Number(x?.[valueKey] ?? 0) || 0)
  );

  return (
    <div className="panel" style={{ margin: 0 }}>
      <div className="panelTitle">{title}</div>
      {items.length === 0 ? (
        <div className="muted">{emptyLabel ?? "Pas de données pour le moment."}</div>
      ) : (
        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          {items.map((x, idx) => {
            const v = Number(x?.[valueKey] ?? 0) || 0;
            const pct = max > 0 ? (v / max) * 100 : 0;
            const label =
              valueKey === "seconds"
                ? humanDuration(v)
                : valueKey === "minutes"
                ? `${fmt(v)} min`
                : fmt(v);

            return (
              <div
                key={`${x.slug ?? idx}`}
                style={{
                  display: "grid",
                  gap: 6,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 900,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        lineHeight: 1.1,
                      }}
                    >
                      {x.displayName ?? x.slug}
                    </div>
                    <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                      @{x.slug}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontWeight: 900 }}>{label}</span>
                    <Link to={onItemLink(String(x.slug))} className="btnGhost">
                      Voir
                    </Link>
                  </div>
                </div>

                <div
                  style={{
                    height: 10,
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,255,255,0.03)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${clamp(pct, 0, 100)}%`,
                      height: "100%",
                      background: "rgba(255,255,255,0.18)",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const { user, token, refreshMe } = useAuth();

  const [tab, setTab] = React.useState<Tab>("overview");
  const [achOpen, setAchOpen] = React.useState(false);

  // streamer request status
  const [reqStatus, setReqStatus] = React.useState<string | null>(null);
  const [busyApply, setBusyApply] = React.useState(false);

  // social/following
  const [q, setQ] = React.useState("");
  const dq = useDebouncedValue(q, 250);
  const [following, setFollowing] = React.useState<ApiFollowing[]>([]);
  const [followLoading, setFollowLoading] = React.useState(false);
  const [followErr, setFollowErr] = React.useState<string | null>(null);

  // stats
  const [stats, setStats] = React.useState<ApiProfileStats | null>(null);
  const [statsLoading, setStatsLoading] = React.useState(false);
  const [statsErr, setStatsErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      if (!token) return setReqStatus(null);
      const r = await myStreamerRequest(token);
      setReqStatus(r.request?.status ?? null);
    })();
  }, [token]);

  async function onApply() {
    if (!token) return;
    setBusyApply(true);
    try {
      const r = await applyStreamer(token);
      setReqStatus(r.request.status);
      await refreshMe();
    } finally {
      setBusyApply(false);
    }
  }

  // Load following when Social tab opens or query changes
  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!token) return;
      if (tab !== "social") return;

      setFollowLoading(true);
      setFollowErr(null);
      try {
        const r = await myFollowing(token, { q: dq, limit: 120 });
        if (cancelled) return;
        setFollowing(r.items);
      } catch (e: any) {
        if (cancelled) return;
        setFollowErr(e?.message ?? "Erreur chargement following");
        setFollowing([]);
      } finally {
        if (!cancelled) setFollowLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, tab, dq]);

  // Load stats when Stats tab opens
  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!token) return;
      if (tab !== "stats") return;

      setStatsLoading(true);
      setStatsErr(null);
      try {
        const r = await myProfileStats(token);
        if (cancelled) return;
        setStats(r);
      } catch (e: any) {
        if (cancelled) return;
        setStats(null);
        setStatsErr(e?.message ?? "Erreur chargement stats");
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, tab]);

  // Small derived values (safe even if fields missing)
  const s: any = stats ?? {};
  const netRubis =
    typeof s.rubisEarnedTotal === "number" && typeof s.rubisSpentTotal === "number"
      ? s.rubisEarnedTotal - s.rubisSpentTotal
      : null;

  const topWatchName = s.topStreamerByWatch?.displayName ?? null;
  const topWatchSecs = s.topStreamerByWatch?.seconds ?? null;

  const topByWatch: any[] = Array.isArray(s.topStreamersByWatch)
    ? s.topStreamersByWatch
    : [];
  const topByMsg: any[] = Array.isArray(s.topStreamersByMessages)
    ? s.topStreamersByMessages
    : [];

  return (
    <main className="container">
      <div className="pageTitle">
        <h1>Profil</h1>

        {!user ? (
          <p className="muted">Connecte-toi pour accéder à ton profil.</p>
        ) : (
          <>
            {/* Header / Identity */}
            <div
              className="panel"
              style={{
                marginTop: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 14,
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 260 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 900,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.04)",
                    userSelect: "none",
                  }}
                  title={user.username}
                >
                  {initials(user.username)}
                </div>

                <div>
                  <div style={{ fontSize: 18, fontWeight: 900, lineHeight: 1.1 }}>
                    {user.username}
                  </div>
                  <div className="muted" style={{ marginTop: 2 }}>
                    Rôle: <b>{user.role}</b> • Rubis: <b>{fmt(user.rubis)}</b>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button className="btnGhost" onClick={() => setAchOpen(true)}>
                  Succès
                </button>

                {(user.role === "streamer" || user.role === "admin") ? (
                  <Link to="/dashboard" className="btnPrimary">
                    Dashboard streamer
                  </Link>
                ) : (
                  <button
                    className="btnPrimary"
                    onClick={onApply}
                    disabled={busyApply || reqStatus === "pending" || reqStatus === "approved"}
                    title={
                      reqStatus === "pending"
                        ? "Demande en attente"
                        : reqStatus === "approved"
                        ? "Déjà streamer"
                        : ""
                    }
                  >
                    {busyApply
                      ? "…"
                      : reqStatus === "pending"
                      ? "Demande en attente"
                      : reqStatus === "approved"
                      ? "Déjà streamer"
                      : "Devenir streamer"}
                  </button>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              <SegButton active={tab === "overview"} onClick={() => setTab("overview")}>
                Aperçu
              </SegButton>
              <SegButton active={tab === "personalisation"} onClick={() => setTab("personalisation")}>
                Personnalisation
              </SegButton>
              <SegButton active={tab === "social"} onClick={() => setTab("social")}>
                Social
              </SegButton>
              <SegButton active={tab === "stats"} onClick={() => setTab("stats")}>
                Stats
              </SegButton>
            </div>

            {/* Content */}
            {tab === "overview" ? (
              <>
                <div
                  style={{
                    marginTop: 14,
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                    gap: 14,
                  }}
                >
                  <div className="panel" style={{ margin: 0 }}>
                    <div className="panelTitle">Succès</div>
                    <div className="muted" style={{ marginBottom: 10 }}>
                      Consulte tes succès (Bronze / Silver / Gold / Master).
                    </div>
                    <button className="btnPrimary" onClick={() => setAchOpen(true)}>
                      Ouvrir les succès
                    </button>
                  </div>

                  <div className="panel" style={{ margin: 0 }}>
                    <div className="panelTitle">Compte</div>
                    <div className="muted" style={{ marginBottom: 10 }}>
                      Accès rapide aux sections importantes.
                    </div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button className="btnGhost" onClick={() => setTab("social")}>
                        Following
                      </button>
                      <button className="btnGhost" onClick={() => setTab("stats")}>
                        Stats fun
                      </button>
                      <button className="btnGhost" onClick={() => setTab("personalisation")}>
                        Personnaliser
                      </button>
                    </div>
                  </div>

                  {user.role !== "streamer" && user.role !== "admin" ? (
                    <div className="panel" style={{ margin: 0 }}>
                      <div className="panelTitle">Devenir streamer</div>
                      <div className="muted" style={{ marginBottom: 10 }}>
                        {reqStatus === "pending" && "Demande envoyée : en attente de validation."}
                        {reqStatus === "approved" && "Demande acceptée ✅"}
                        {reqStatus === "rejected" && "Demande refusée."}
                        {!reqStatus && "Tu peux envoyer une demande pour devenir streamer."}
                      </div>
                      <button
                        className="btnPrimary"
                        onClick={onApply}
                        disabled={busyApply || reqStatus === "pending" || reqStatus === "approved"}
                      >
                        {busyApply
                          ? "…"
                          : reqStatus === "pending"
                          ? "En attente"
                          : reqStatus === "approved"
                          ? "Déjà streamer"
                          : "Faire une demande"}
                      </button>
                    </div>
                  ) : (
                    <div className="panel" style={{ margin: 0 }}>
                      <div className="panelTitle">Espace streamer</div>
                      <div className="muted" style={{ marginBottom: 10 }}>
                        Accède à ton dashboard streamer.
                      </div>
                      <Link to="/dashboard" className="btnPrimary">
                        Ouvrir le Dashboard
                      </Link>
                    </div>
                  )}
                </div>
              </>
            ) : null}

            {tab === "personalisation" ? (
              <div style={{ marginTop: 14 }}>
                <PersonalisationSection username={user.username} />
              </div>
            ) : null}

            {tab === "social" ? (
              <div className="panel" style={{ marginTop: 14 }}>
                <div className="panelTitle">Following</div>
                <div className="muted" style={{ marginBottom: 10 }}>
                  Les personnes / streamers que tu suis (recherche incluse).
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Rechercher…"
                    style={{
                      flex: "1 1 240px",
                      minWidth: 220,
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.04)",
                      color: "inherit",
                      outline: "none",
                    }}
                  />
                  <button className="btnGhost" onClick={() => setQ("")} disabled={!q}>
                    Reset
                  </button>
                </div>

                <div
                  style={{
                    marginTop: 12,
                    maxHeight: 360,
                    overflow: "auto",
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(0,0,0,0.12)",
                    padding: 10,
                  }}
                >
                  {followLoading ? (
                    <div className="muted">Chargement…</div>
                  ) : followErr ? (
                    <div className="muted">{followErr}</div>
                  ) : following.length === 0 ? (
                    <div className="muted">Aucun résultat.</div>
                  ) : (
                    <div style={{ display: "grid", gap: 8 }}>
                      {following.map((f) => (
                        <div
                          key={f.id ?? f.slug}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 10,
                            padding: "10px 10px",
                            borderRadius: 12,
                            border: "1px solid rgba(255,255,255,0.10)",
                            background: "rgba(255,255,255,0.03)",
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontWeight: 900,
                                lineHeight: 1.2,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {f.displayName ?? f.slug}
                            </div>
                            <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                              @{f.slug}
                              {typeof f.isLive === "boolean"
                                ? f.isLive
                                  ? " • 🔴 live"
                                  : " • offline"
                                : null}
                            </div>
                          </div>

                          <div style={{ display: "flex", gap: 8 }}>
                            {/* ajuste si ta route streamer est différente */}
                            <Link to={`/s/${f.slug}`} className="btnGhost">
                              Voir
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {tab === "stats" ? (
              <div style={{ marginTop: 14 }}>
                <div className="panel" style={{ margin: 0 }}>
                  <div className="panelTitle" style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <span>Récap du compte</span>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        className="btnGhost"
                        onClick={() => {
                          // force reload quickly
                          setStatsLoading(true);
                          setStatsErr(null);
                          (async () => {
                            if (!token) return;
                            try {
                              const r = await myProfileStats(token);
                              setStats(r);
                            } catch (e: any) {
                              setStats(null);
                              setStatsErr(e?.message ?? "Erreur chargement stats");
                            } finally {
                              setStatsLoading(false);
                            }
                          })();
                        }}
                        disabled={statsLoading}
                        title="Rafraîchir"
                      >
                        Rafraîchir
                      </button>
                    </div>
                  </div>

                  <div className="muted" style={{ marginTop: 6 }}>
                    Stats fun (watchtime, messages, rubis, wheel, bonus, etc.)
                    {statsErr ? <> <span style={{ opacity: 0.9 }}>({statsErr})</span></> : null}
                  </div>

                  {/* quick chips */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                    <Chip title="Depuis combien de temps ton compte existe">
                      📅 {s.accountAgeDays != null ? `${fmt(s.accountAgeDays)} jours` : "—"}
                    </Chip>
                    <Chip title="Nombre de streamers suivis">
                      👥 {s.followingCount != null ? fmt(s.followingCount) : "—"} suivis
                    </Chip>
                    <Chip title="Ton heure la plus active (messages)">
                      ⏰ {hourLabel(s.mostActiveChatHour)}
                    </Chip>
                    <Chip title="Ton jour le plus actif (messages)">
                      🗓️ {dowLabel(s.mostActiveChatDow)}
                    </Chip>
                    <Chip title="Ton top streamer en watchtime">
                      ⭐ {topWatchName ? topWatchName : "—"}
                    </Chip>
                  </div>
                </div>

                {/* KPI grid */}
                <div
                  style={{
                    marginTop: 14,
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 14,
                  }}
                >
                  {statsLoading ? (
                    <div className="panel" style={{ margin: 0 }}>
                      <div className="muted">Chargement des stats…</div>
                    </div>
                  ) : !stats ? (
                    <>
                      <StatCard title="Watchtime total" value="—" sub="(à brancher)" />
                      <StatCard title="Messages envoyés" value="—" sub="(à brancher)" />
                      <StatCard title="Rubis gagnés" value="—" sub="(à brancher)" />
                      <StatCard title="Rubis dépensés" value="—" sub="(à brancher)" />
                    </>
                  ) : (
                    <>
                      <StatCard
                        title="Watchtime total"
                        value={humanDuration(s.watchSecondsTotal)}
                        sub={
                          topWatchName
                            ? <>
                                Top: <b>{topWatchName}</b> ({humanDuration(topWatchSecs)})
                              </>
                            : "—"
                        }
                      />
                      <StatCard
                        title="Messages envoyés"
                        value={s.chatMessagesTotal != null ? fmt(s.chatMessagesTotal) : "—"}
                        sub={
                          s.mostActiveChatHour != null || s.mostActiveChatDow != null ? (
                            <>
                              Pic: <b>{dowLabel(s.mostActiveChatDow)}</b> à{" "}
                              <b>{hourLabel(s.mostActiveChatHour)}</b>
                            </>
                          ) : undefined
                        }
                      />
                      <StatCard
                        title="Rubis gagnés"
                        value={fmtRubis(s.rubisEarnedTotal)}
                        sub={
                          typeof s.dailyWheelRubisTotal === "number" || typeof s.chestRubisWonTotal === "number" ? (
                            <>
                              Wheel: <b>{fmtRubis(s.dailyWheelRubisTotal)}</b> • Coffres:{" "}
                              <b>{fmtRubis(s.chestRubisWonTotal)}</b>
                            </>
                          ) : undefined
                        }
                      />
                      <StatCard
                        title="Rubis dépensés"
                        value={fmtRubis(s.rubisSpentTotal)}
                        sub={
                          typeof s.rubisSupportTotal === "number" || typeof s.rubisBurnTotal === "number" ? (
                            <>
                              Support: <b>{fmtRubis(s.rubisSupportTotal)}</b> • Sink/Burn:{" "}
                              <b>{fmtRubis(s.rubisBurnTotal)}</b>
                            </>
                          ) : undefined
                        }
                      />
                      <StatCard
                        title="Net rubis (gagnés - dépensés)"
                        value={netRubis == null ? "—" : fmt(netRubis)}
                        sub="Juste une stat fun (pas un solde)."
                      />
                      <StatCard
                        title="Wheel"
                        value={
                          typeof s.dailyWheelSpinsTotal === "number"
                            ? `${fmt(s.dailyWheelSpinsTotal)} spins`
                            : "—"
                        }
                        sub={
                          typeof s.dailyWheelRubisTotal === "number"
                            ? <>Total gagné: <b>{fmt(s.dailyWheelRubisTotal)}</b> rubis</>
                            : undefined
                        }
                      />
                      <StatCard
                        title="Bonus quotidien"
                        value={
                          typeof s.dailyBonusClaimsTotal === "number"
                            ? `${fmt(s.dailyBonusClaimsTotal)} claims`
                            : "—"
                        }
                        sub="Nombre de jours où tu as claim."
                      />
                      <StatCard
                        title="Collectibles"
                        value={
                          typeof s.entitlementsTotal === "number"
                            ? `${fmt(s.entitlementsTotal)} objets`
                            : "—"
                        }
                        sub={
                          typeof s.achievementsUnlockedTotal === "number"
                            ? <>Succès débloqués: <b>{fmt(s.achievementsUnlockedTotal)}</b></>
                            : undefined
                        }
                      />
                      <StatCard
                        title="Subs gifts"
                        value={
                          typeof s.subGiftsClaimedTotal === "number"
                            ? fmt(s.subGiftsClaimedTotal)
                            : "—"
                        }
                        sub="Nombre de gifts claim."
                      />
                    </>
                  )}
                </div>

                {/* Leaderboards */}
                <div
                  style={{
                    marginTop: 14,
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                    gap: 14,
                  }}
                >
                  <MiniBarList
                    title="Top streamers — watchtime"
                    items={topByWatch}
                    valueKey="seconds"
                    onItemLink={(slug) => `/s/${slug}`}
                    emptyLabel="Tu n’as pas encore de watchtime enregistré."
                  />
                  <MiniBarList
                    title="Top streamers — messages"
                    items={topByMsg}
                    valueKey="messages"
                    onItemLink={(slug) => `/s/${slug}`}
                    emptyLabel="Tu n’as pas encore envoyé de messages."
                  />
                </div>

                {/* Fun section */}
                <div className="panel" style={{ marginTop: 14 }}>
                  <div className="panelTitle">Stats fun (à ajouter ensuite)</div>
                  <div className="muted" style={{ marginBottom: 10 }}>
                    On peut enrichir progressivement sans alourdir la page.
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        borderRadius: 14,
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: "rgba(255,255,255,0.03)",
                        padding: 12,
                      }}
                    >
                      <div style={{ fontWeight: 900, marginBottom: 6 }}>Activité</div>
                      <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                        <li>Heatmap heures / jours (chat + watch)</li>
                        <li>Streak (jours consécutifs actifs)</li>
                        <li>Record de messages sur une journée</li>
                        <li>Nombre de lives différents regardés</li>
                      </ul>
                    </div>

                    <div
                      style={{
                        borderRadius: 14,
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: "rgba(255,255,255,0.03)",
                        padding: 12,
                      }}
                    >
                      <div style={{ fontWeight: 900, marginBottom: 6 }}>Économie</div>
                      <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                        <li>Rubis gagnés par source (wheel/bonus/coffres/events…)</li>
                        <li>Dépenses par catégorie (support/cosmétiques/mini-jeux)</li>
                        <li>Plus grosse dépense support</li>
                        <li>Plus gros gain en une fois (wheel / coffre)</li>
                      </ul>
                    </div>

                    <div
                      style={{
                        borderRadius: 14,
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: "rgba(255,255,255,0.03)",
                        padding: 12,
                      }}
                    >
                      <div style={{ fontWeight: 900, marginBottom: 6 }}>Cosmétiques</div>
                      <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                        <li>Top badge / titre le plus équipé</li>
                        <li>Temps cumulé avec un titre</li>
                        <li>Collection complétée (%)</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      <AchievementsModal open={achOpen} onClose={() => setAchOpen(false)} />
    </main>
  );
}
