// web/src/pages/ProfilePage.tsx
import * as React from "react";
import { Link } from "react-router-dom";
import { applyStreamer, myStreamerRequest } from "../lib/api";
import { useAuth } from "../auth/AuthProvider";
import { AchievementsModal } from "../components/AchievementsModal";
import { PersonalisationSection } from "../components/profile/PersonalisationSection";
import { myFollowing, myProfileStats, type ApiFollowing, type ApiProfileStats } from "../lib/api_profile";

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

function StatCard({
  title,
  value,
  sub,
}: {
  title: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="panel" style={{ margin: 0 }}>
      <div className="panelTitle" style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span>{title}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>{value}</div>
      {sub ? <div className="muted" style={{ marginTop: 6 }}>{sub}</div> : null}
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
        const r = await myFollowing(token, { q: dq, limit: 80 });
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
        // fallback soft: si endpoint pas encore là, on ne casse pas la page
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
                      Petit résumé rapide et accès aux sections.
                    </div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button className="btnGhost" onClick={() => setTab("social")}>
                        Voir Following
                      </button>
                      <button className="btnGhost" onClick={() => setTab("stats")}>
                        Voir Stats
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
                  Les personnes / streamers que tu suis. (Recherche incluse)
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
                    maxHeight: 340,
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
                            <div style={{ fontWeight: 800, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {f.displayName ?? f.slug}
                            </div>
                            <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                              @{f.slug}
                              {typeof f.isLive === "boolean" ? (f.isLive ? " • 🔴 live" : " • offline") : null}
                            </div>
                          </div>

                          {/* ⚠️ Ajuste la route selon ton routing réel */}
                          <div style={{ display: "flex", gap: 8 }}>
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
                  <div className="panelTitle">Récap du compte</div>
                  <div className="muted">
                    Plein de stats fun (watchtime, messages, rubis, etc.).  
                    {statsErr ? <> <span style={{ opacity: 0.9 }}>({statsErr})</span></> : null}
                  </div>
                </div>

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
                        value={stats.watchSecondsTotal != null ? `${fmt(Math.floor(stats.watchSecondsTotal / 3600))} h` : "—"}
                        sub={stats.topStreamerByWatch ? <>Top streamer: <b>{stats.topStreamerByWatch.displayName}</b></> : null}
                      />
                      <StatCard title="Messages envoyés" value={stats.chatMessagesTotal != null ? fmt(stats.chatMessagesTotal) : "—"} />
                      <StatCard title="Rubis gagnés" value={stats.rubisEarnedTotal != null ? fmt(stats.rubisEarnedTotal) : "—"} />
                      <StatCard title="Rubis dépensés" value={stats.rubisSpentTotal != null ? fmt(stats.rubisSpentTotal) : "—"} />

                      <StatCard
                        title="Support total"
                        value={stats.rubisSupportTotal != null ? fmt(stats.rubisSupportTotal) : "—"}
                        sub="Rubis utilisés pour soutenir (subs/tips/gifts)"
                      />
                      <StatCard
                        title="Burn total"
                        value={stats.rubisBurnTotal != null ? fmt(stats.rubisBurnTotal) : "—"}
                        sub="Rubis “sink” (cosmétiques/mini-jeux/etc.)"
                      />
                      <StatCard
                        title="Streamers suivis"
                        value={stats.followingCount != null ? fmt(stats.followingCount) : "—"}
                      />
                      <StatCard
                        title="Ancienneté"
                        value={stats.accountAgeDays != null ? `${fmt(stats.accountAgeDays)} jours` : "—"}
                      />
                    </>
                  )}
                </div>

                {/* Fun list */}
                <div className="panel" style={{ marginTop: 14 }}>
                  <div className="panelTitle">Stats fun (idées)</div>
                  <div className="muted" style={{ marginBottom: 10 }}>
                    Même si tu ne branches pas tout au début, on peut alimenter progressivement.
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                    <li>Top 5 streamers les plus regardés (durée)</li>
                    <li>Top 5 streamers où tu as le plus parlé (messages)</li>
                    <li>Ton “jour de la semaine” le plus actif</li>
                    <li>Ton “heure” la plus active (heatmap)</li>
                    <li>Nombre de lives différents regardés</li>
                    <li>Plus long streak de jours consécutifs</li>
                    <li>Total rubis gagnés par source (wheel / watch / event / etc.)</li>
                    <li>Total rubis dépensés par catégorie (support / cosmétiques / mini-jeux)</li>
                    <li>Ton top emote / badge / titre le plus utilisé</li>
                    <li>Ta plus grosse dépense / ton plus gros gain en une fois</li>
                  </ul>
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
