// web/src/pages/EventPage.tsx
import * as React from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { useAuth } from "../auth/AuthProvider";
import { LoginModal } from "../components/LoginModal";
import {
  getCurrentEvent,
  getCurrentViewerWeek,
  getEventAccessStatus,
  type ApiEventRow,
  type ApiViewerWeekResp,
  type ApiViewerWeekTopRow,
} from "../lib/api_events";

function fmtRemain(ms: number) {
  ms = Math.max(0, Math.floor(ms));
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  const hh = h % 24;
  const mm = m % 60;
  const ss = s % 60;
  if (d > 0) return `${d}j ${hh}h ${mm}m`;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function fmtIsoLocal(iso: string) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" });
}

function Pill({
  tone,
  children,
  title,
}: {
  tone: "neutral" | "brand" | "live" | "gold";
  children: React.ReactNode;
  title?: string;
}) {
  const map: Record<string, { bg: string; bd: string }> = {
    brand: { bg: "rgba(167,139,250,0.16)", bd: "rgba(167,139,250,0.32)" },
    live: { bg: "rgba(255,90,180,0.14)", bd: "rgba(255,90,180,0.26)" },
    gold: { bg: "rgba(255,210,120,0.14)", bd: "rgba(255,210,120,0.28)" },
    neutral: { bg: "rgba(255,255,255,0.06)", bd: "rgba(255,255,255,0.12)" },
  };
  const t = map[tone] ?? map.neutral;
  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 11px",
        borderRadius: 999,
        border: `1px solid ${t.bd}`,
        background: t.bg,
        fontSize: 12,
        fontWeight: 1100,
        whiteSpace: "nowrap",
        backdropFilter: "blur(10px)",
      }}
    >
      {children}
    </span>
  );
}

function GlassCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        borderRadius: 20,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(0,0,0,0.10))",
        boxShadow: "0 18px 55px rgba(0,0,0,0.28)",
        backdropFilter: "blur(10px)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// Reveal on scroll — pas de layout shift (les cartes gardent leur place),
// juste opacity/translateY. Neutralisé sous prefers-reduced-motion.
function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return <>{children}</>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

function eventLabel(type: string) {
  if (type === "viewer_week") return "Semaine du viewer";
  if (type === "wheel_week") return "Semaine de la roue";
  if (type === "clip_race") return "Course aux clips";
  if (type === "global_chest") return "Coffre communautaire";
  if (type === "burn_boss") return "Boss à abattre";
  if (type === "duo_week") return "Semaine en duo";
  return type || "Event";
}

function eventEmoji(type: string) {
  if (type === "viewer_week") return "🏁";
  if (type === "wheel_week") return "🎡";
  if (type === "clip_race") return "🎬";
  if (type === "global_chest") return "🎁";
  if (type === "burn_boss") return "🔥";
  if (type === "duo_week") return "🤝";
  return "✨";
}

function TopRow({
  rank,
  username,
  points,
  isMe,
}: {
  rank: number;
  username: string;
  points: number;
  isMe?: boolean;
}) {
  const tone = rank === 1 ? "gold" : isMe ? "brand" : "neutral";
  const badge = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.10)",
        background: isMe ? "rgba(167,139,250,0.10)" : "rgba(0,0,0,0.20)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <Pill tone={tone as any} title="Rang">
          <b>{badge}</b>
        </Pill>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontWeight: 1250,
              letterSpacing: -0.2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              opacity: isMe ? 1 : 0.95,
            }}
            title={username}
          >
            {username}
            {isMe ? <span style={{ opacity: 0.75 }}> (toi)</span> : null}
          </div>
          <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>Total points</div>
        </div>
      </div>

      <Pill tone={tone as any} title="Points">
        ⭐ <b>{Math.floor(Number(points || 0))}</b>
      </Pill>
    </div>
  );
}

// Table des lots — reflète EVENT_REWARD_CONFIGS.viewer_week (api/src/events/rewards.ts).
// Valeurs hardcodées ici volontairement : pas de dépendance runtime au barème
// serveur pour l'affichage (le classement/les points restent dynamiques).
const REWARD_TIERS: { rank: string; reward: string; extra?: string; tone: "gold" | "brand" | "neutral" }[] = [
  { rank: "🥇 #1", reward: "600 rubis", extra: "+ badge exclusif « Champion du mois »", tone: "gold" },
  { rank: "🥈🥉 #2-3", reward: "300 rubis", tone: "brand" },
  { rank: "#4-5", reward: "150 rubis", tone: "brand" },
  { rank: "🎯 Participation (≥ 200 pts)", reward: "40 rubis", extra: "+ 1 ticket roue", tone: "neutral" },
];

function RewardsTable() {
  return (
    <GlassCard style={{ padding: 12 }}>
      <div style={{ fontWeight: 1400, letterSpacing: -0.2 }}>🎁 Table des lots</div>
      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
        {REWARD_TIERS.map((t) => (
          <div
            key={t.rank}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(0,0,0,0.20)",
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 1100 }}>{t.rank}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <Pill tone={t.tone} title="Lot">
                ⭐ <b>{t.reward}</b>
              </Pill>
              {t.extra ? <span style={{ fontSize: 12, opacity: 0.8, fontWeight: 900 }}>{t.extra}</span> : null}
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

function LeaderboardBlock({ top, meUserId }: { top: ApiViewerWeekTopRow[]; meUserId: number | null }) {
  return (
    <GlassCard style={{ padding: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontWeight: 1400, letterSpacing: -0.2 }}>🏆 Classement</div>
        <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 950 }}>Top {top.length || 10}</div>
      </div>

      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
        {top.length === 0 ? (
          <div style={{ fontSize: 12, opacity: 0.82, fontWeight: 900 }}>
            Pas encore de scores. Suis un streamer et regarde un live pour apparaître ici.
          </div>
        ) : (
          top.map((r) => (
            <TopRow
              key={`${r.userId}-${r.rank}`}
              rank={Number(r.rank || 0)}
              username={String(r.username || `user#${r.userId}`)}
              points={Number(r.points || 0)}
              isMe={meUserId != null ? Number(meUserId) === Number(r.userId) : false}
            />
          ))
        )}
      </div>
    </GlassCard>
  );
}

// Détail des points perso — visible uniquement connecté + éligible.
function MyScoreDetail({ me }: { me: NonNullable<ApiViewerWeekResp["me"]> }) {
  const items: { label: string; value: number; icon: string }[] = [
    { label: "Minutes de watch", value: me.minutesPoints ?? 0, icon: "⏱" },
    { label: "Bonus jour actif", value: me.dayBonusPoints ?? 0, icon: "🔥" },
    { label: "Daily claims", value: me.claimPoints ?? 0, icon: "🎁" },
    { label: "Chat", value: me.chatPoints ?? 0, icon: "💬" },
    { label: "Calls", value: me.callsPoints ?? 0, icon: "📣" },
    { label: "Roue", value: me.wheelPoints ?? 0, icon: "🎡" },
    { label: "Prédictions (participation)", value: me.predJoinPoints ?? 0, icon: "🔮" },
    { label: "Prédictions (victoire)", value: me.predWinPoints ?? 0, icon: "✅" },
  ];

  return (
    <GlassCard style={{ padding: 12 }}>
      <div style={{ fontWeight: 1200, letterSpacing: -0.2, marginBottom: 8 }}>🎯 Toi</div>
      <TopRow rank={Number(me.rank || 0) || 0} username={String(me.username || "Moi")} points={Number(me.points || 0)} isMe />

      <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
        <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 950 }}>Détail des points</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {items.map((it) => (
            <Pill key={it.label} tone="neutral" title={it.label}>
              {it.icon} <b>{Math.floor(it.value)}</b>
            </Pill>
          ))}
        </div>
      </div>
    </GlassCard>
  );
}

export default function EventPage() {
  const auth = useAuth();
  const token = auth?.token ?? null;

  const [loginOpen, setLoginOpen] = React.useState(false);

  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  const [event, setEvent] = React.useState<ApiEventRow | null>(null);
  const [viewerWeek, setViewerWeek] = React.useState<ApiViewerWeekResp | null>(null);
  const [eligible, setEligible] = React.useState<boolean | null>(null);

  // mini timer pour countdown
  const [nowMs, setNowMs] = React.useState(Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  async function load() {
    setErr(null);
    setLoading(true);
    try {
      const cur = await getCurrentEvent();
      setEvent(cur?.event ?? null);

      const type = String(cur?.event?.type || "");
      if (type === "viewer_week" && cur?.event) {
        // top public toujours chargé ; "me" apparaît seulement si connecté (token optionnel)
        const v = await getCurrentViewerWeek(token);
        setViewerWeek(v);
      } else {
        setViewerWeek(null);
      }

      if (token) {
        try {
          const acc = await getEventAccessStatus(token);
          setEligible(acc.eligible);
        } catch {
          setEligible(null);
        }
      } else {
        setEligible(null);
      }

      setLoading(false);
    } catch (e: any) {
      setErr(e?.message || String(e));
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const endMs = event?.end_at ? new Date(event.end_at).getTime() : 0;
  const startMs = event?.start_at ? new Date(event.start_at).getTime() : 0;
  const remaining = endMs > 0 ? fmtRemain(endMs - nowMs) : null;

  const title = event ? `${eventEmoji(event.type)} ${eventLabel(event.type)}` : "✨ Event";
  const isViewerWeek = event?.type === "viewer_week";
  const meRow = viewerWeek?.me ?? null;

  return (
    <main className="container" style={{ paddingBottom: "calc(26px + env(safe-area-inset-bottom))" }}>
      <style>{`
        .eventWrap{
          position:relative;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.10);
          background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(0,0,0,0.10));
          box-shadow: 0 20px 70px rgba(0,0,0,0.32);
          backdrop-filter: blur(10px);
          padding: 12px;
          overflow:hidden;
        }
        .eventWrap::before{
          content:"";
          position:absolute; inset:-40px;
          pointer-events:none;
          background:
            radial-gradient(900px 360px at 18% 0%, rgba(255,90,180,0.22), rgba(0,0,0,0) 62%),
            radial-gradient(900px 420px at 80% 10%, rgba(80,160,255,0.22), rgba(0,0,0,0) 62%),
            radial-gradient(900px 520px at 50% 95%, rgba(167,139,250,0.24), rgba(0,0,0,0) 64%);
          opacity: 0.85;
        }
        .eventInner{ position:relative; z-index:1; display:grid; gap:12px; }

        .hero{
          padding: 12px 12px;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.10);
          background:
            radial-gradient(900px 320px at 20% 0%, rgba(167,139,250,0.20), rgba(0,0,0,0) 60%),
            radial-gradient(900px 320px at 80% 20%, rgba(80,160,255,0.14), rgba(0,0,0,0) 60%),
            linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.12));
          box-shadow: 0 18px 55px rgba(0,0,0,0.25);
          display:flex; justify-content:space-between; align-items:flex-start; gap:12px;
          flex-wrap: wrap;
        }
        .h1{
          margin:0;
          font-weight:1500;
          letter-spacing:-0.6px;
          font-size: 24px;
          line-height:1.05;
          background: linear-gradient(90deg, rgba(255,90,180,1), rgba(196,181,253,1), rgba(80,160,255,1));
          -webkit-background-clip:text; background-clip:text; color:transparent;
          filter: drop-shadow(0 10px 24px rgba(0,0,0,0.35));
        }
        .sub{
          margin-top:6px;
          font-size:12px;
          opacity:0.82;
          font-weight:900;
          display:flex;
          gap:10px;
          flex-wrap:wrap;
        }
        .countdown{
          font-variant-numeric: tabular-nums;
          font-size: 13px;
        }
        .btnGhost{
          display:inline-flex;
          align-items:center;
          justify-content:center;
          padding: 10px 12px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.92);
          font-weight: 1150;
          cursor:pointer;
          text-decoration:none;
          min-height: 40px;
          white-space: nowrap;
        }
        .btnGhost:active{ transform: translateY(1px); }
        .btnBrand{
          display:inline-flex;
          align-items:center;
          justify-content:center;
          padding: 10px 14px;
          border-radius: 16px;
          border: 1px solid rgba(167,139,250,0.45);
          background: linear-gradient(135deg, rgba(167,139,250,0.9), rgba(196,181,253,0.85));
          color: #17102b;
          font-weight: 1200;
          cursor:pointer;
          text-decoration:none;
          min-height: 40px;
          white-space: nowrap;
          box-shadow: 0 10px 30px rgba(167,139,250,0.35);
        }
        .btnBrand:active{ transform: translateY(1px); }

        @media (prefers-reduced-motion: reduce) {
          * { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; }
        }

        @media (max-width: 620px) {
          .h1{ font-size: 20px; }
          .hero{ flex-direction: column; }
        }
      `}</style>

      <div className="eventWrap">
        <div className="eventInner">
          <div className="hero">
            <div style={{ minWidth: 0 }}>
              <h1 className="h1">{title}</h1>
              <div className="sub">
                {event ? (
                  <>
                    <span style={{ opacity: 0.9 }}>
                      {event.state === "live" ? "🟢 en cours" : event.state === "scheduled" ? "⏳ à venir" : "✅ terminé"}
                    </span>
                    <span style={{ opacity: 0.75 }}>•</span>
                    <span title="Début">{fmtIsoLocal(event.start_at)}</span>
                    <span style={{ opacity: 0.75 }}>→</span>
                    <span title="Fin">{fmtIsoLocal(event.end_at)}</span>
                  </>
                ) : (
                  <span>Aucun event actif.</span>
                )}
              </div>

              <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {event ? (
                  <>
                    {remaining && event.state === "live" ? (
                      <Pill tone="live" title="Temps restant">
                        ⏳ <span className="countdown"><b>{remaining}</b></span>
                      </Pill>
                    ) : null}
                    {startMs > 0 && endMs > 0 ? (
                      <Pill tone="neutral" title="Fenêtre">
                        {Math.max(0, Math.floor((endMs - startMs) / 3600_000))}h
                      </Pill>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>

            <div style={{ display: "grid", gap: 10, justifyItems: "end" }}>
              <button type="button" className="btnGhost" onClick={() => load().catch(() => {})} disabled={loading}>
                {loading ? "Chargement…" : "Rafraîchir ↻"}
              </button>
              <Link to="/" className="btnGhost" title="Retour aux lives">
                Lives
              </Link>
            </div>
          </div>

          {err ? (
            <div className="alert" style={{ margin: 0 }}>
              {err}
            </div>
          ) : null}

          {loading ? (
            <GlassCard style={{ padding: 12 }}>
              <div style={{ fontWeight: 1200 }}>Chargement…</div>
              <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 950, marginTop: 6 }}>
                Récupération de l'event courant et du classement.
              </div>
            </GlassCard>
          ) : !event ? (
            <GlassCard style={{ padding: 12 }}>
              <div style={{ fontWeight: 1200 }}>Aucun event actif</div>
              <div style={{ fontSize: 12, opacity: 0.82, fontWeight: 950, marginTop: 6 }}>
                Le moteur d'events n'a peut-être pas encore ouvert l'event (ou la fenêtre est terminée).
              </div>
            </GlassCard>
          ) : isViewerWeek ? (
            <>
              <Reveal>
                <RewardsTable />
              </Reveal>

              <Reveal delay={0.05}>
                <LeaderboardBlock top={viewerWeek?.top ?? []} meUserId={viewerWeek?.me?.userId ?? null} />
              </Reveal>

              <Reveal delay={0.1}>
                {!token ? (
                  <GlassCard style={{ padding: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 1300, letterSpacing: -0.2 }}>🔒 Ton score</div>
                        <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 950, marginTop: 4 }}>
                          Connecte-toi pour voir ton rang et le détail de tes points.
                        </div>
                      </div>
                      <button type="button" className="btnBrand" onClick={() => setLoginOpen(true)}>
                        Se connecter
                      </button>
                    </div>
                  </GlassCard>
                ) : eligible === false ? (
                  <GlassCard style={{ padding: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 1300, letterSpacing: -0.2 }}>🔓 Débloque ta participation</div>
                        <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 950, marginTop: 4 }}>
                          Il te manque des étapes pour apparaître dans le classement et gagner des lots.
                        </div>
                      </div>
                      <Link to="/participer" className="btnBrand">
                        Voir les étapes →
                      </Link>
                    </div>
                  </GlassCard>
                ) : meRow ? (
                  <MyScoreDetail me={meRow} />
                ) : (
                  <GlassCard style={{ padding: 12 }}>
                    <div style={{ fontSize: 12, opacity: 0.82, fontWeight: 900 }}>
                      Éligible ✅ mais pas encore de score. Regarde un live pour commencer à marquer des points.
                    </div>
                  </GlassCard>
                )}
              </Reveal>
            </>
          ) : (
            <Reveal>
              <GlassCard style={{ padding: 12 }}>
                <div style={{ fontWeight: 1400, letterSpacing: -0.2 }}>
                  {eventEmoji(event.type)} {eventLabel(event.type)}
                </div>
                <div style={{ marginTop: 8, fontSize: 12, opacity: 0.82, fontWeight: 950 }}>
                  Cet event arrive bientôt — le contenu spécifique sera branché ensuite.
                </div>
              </GlassCard>
            </Reveal>
          )}
        </div>
      </div>

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </main>
  );
}
