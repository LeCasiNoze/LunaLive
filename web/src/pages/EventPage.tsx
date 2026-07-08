// web/src/pages/EventPage.tsx
import * as React from "react";
import { Link } from "react-router-dom";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { useAuth } from "../auth/AuthProvider";
import { LoginModal } from "../components/LoginModal";
import { CountUp } from "../components/events/CountUp";
import { EventAvatar } from "../components/events/EventAvatar";
import "../components/events/events-theme.css";
import {
  getCurrentEvent,
  getCurrentViewerWeek,
  getEventAccessStatus,
  type ApiEventAccessStatus,
  type ApiEventRow,
  type ApiViewerWeekResp,
  type ApiViewerWeekTopRow,
  type EventAccessStepKey,
} from "../lib/api_events";

function splitRemain(ms: number) {
  ms = Math.max(0, Math.floor(ms));
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  return { d, h: h % 24, m: m % 60, s: s % 60 };
}

function fmtIsoLocal(iso: string) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" });
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

const EVENT_TEASER: Record<string, string> = {
  wheel_week: "Chaque tour de roue gratuit rapporte des points. Le classement final distribue rubis et tickets bonus.",
  clip_race: "Le clip le plus vu ou le plus liké de la semaine grimpe au classement et remporte la mise.",
  global_chest: "Toute la communauté remplit un coffre ensemble. Une fois plein, tout le monde reçoit une récompense.",
  burn_boss: "Un boss avec une jauge de vie commune. Chaque action de la communauté lui inflige des dégâts jusqu'à sa chute.",
  duo_week: "Forme un duo avec un autre viewer et cumulez vos points ensemble pour grimper au classement.",
};

const STEP_ICON: Record<EventAccessStepKey, string> = {
  follow_streamer: "❤️",
  link_discord: "🔗",
  follow_insta: "📸",
  daily_claim: "🎁",
  watch_30: "⏱",
};

// Reveal on scroll — opacity/translateY, pas de layout shift. Neutralisé
// sous prefers-reduced-motion (le CSS coupe aussi les animations continues).
function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return <>{children}</>;
  // animate on mount (pas whileInView) : garantit que le contenu est TOUJOURS
  // visible même hors écran initial / en capture pleine page. whileInView
  // laissait le contenu sous la ligne de flottaison à opacity:0 (vide fantôme).
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

function Countdown({ targetMs, nowMs, label }: { targetMs: number; nowMs: number; label: string }) {
  const { d, h, m, s } = splitRemain(targetMs - nowMs);
  const boxes: [string, number][] = d > 0 ? [["jours", d], ["h", h], ["min", m], ["sec", s]] : [["h", h], ["min", m], ["sec", s]];
  return (
    <div className="evCountdownWrap">
      <div className="evCountdownLabel">{label}</div>
      <div className="evCountdown">
        {boxes.map(([unit, val]) => (
          <div className="evCdBox" key={unit}>
            <div className="evCdNum">{String(val).padStart(2, "0")}</div>
            <div className="evCdUnit">{unit}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Table des lots — reflète EVENT_REWARD_CONFIGS.viewer_week (api/src/events/rewards.ts).
// Valeurs hardcodées volontairement : pas de dépendance runtime au barème
// serveur pour l'affichage (classement/points restent dynamiques).
const REWARD_TIERS: { key: string; rank: string; amount: string; extra?: string; gold?: boolean }[] = [
  { key: "gold", rank: "🥇 #1", amount: "600", extra: "+ badge exclusif « Champion du mois »", gold: true },
  { key: "s23", rank: "🥈🥉 #2-3", amount: "300" },
  { key: "s45", rank: "#4-5", amount: "150" },
  { key: "part", rank: "🎯 Participation (≥ 200 pts)", amount: "40", extra: "+ 1 ticket roue" },
];

function RewardsShowcase() {
  return (
    <div className="evRewardGrid">
      {REWARD_TIERS.map((t) => (
        <div key={t.key} className={`evRewardCard${t.gold ? " gold" : ""}`}>
          <div className="evRewardRank">{t.rank}</div>
          <div className="evRewardAmount">⭐ {t.amount}</div>
          {t.extra ? <div className="evRewardExtra">{t.extra}</div> : null}
        </div>
      ))}
    </div>
  );
}

function Podium({ top, meUserId }: { top: ApiViewerWeekTopRow[]; meUserId: number | null }) {
  const slots = [1, 2, 3].map((rank) => top.find((r) => Number(r.rank) === rank) ?? null);
  const medalOf = (rank: number) => (rank === 1 ? "👑" : rank === 2 ? "🥈" : "🥉");

  return (
    <>
      <div className="evPodium">
        {slots.map((row, i) => {
          const rank = i + 1;
          if (!row) {
            return (
              <div key={rank} className={`evPodCard r${rank} empty`}>
                <div className="evPodMedal">{medalOf(rank)}</div>
                <div className="evPodName">—</div>
                <div className="evPodPoints">·</div>
              </div>
            );
          }
          const isMe = meUserId != null && Number(meUserId) === Number(row.userId);
          return (
            <div key={rank} className={`evPodCard r${rank}`}>
              {rank === 1 ? <div className="evPodCrown">👑</div> : <div className="evPodMedal">{medalOf(rank)}</div>}
              <EventAvatar userId={row.userId} username={row.username} size={rank === 1 ? 76 : 60} />
              <div className="evPodName" title={row.username}>{row.username}</div>
              {isMe ? <div className="evPodMe">C'est toi !</div> : null}
              <div className="evPodPoints">
                <CountUp value={Number(row.points || 0)} /> pts
              </div>
            </div>
          );
        })}
      </div>
      {top.length === 0 ? (
        <div style={{ marginTop: 10, textAlign: "center", fontSize: 12, opacity: 0.75, fontWeight: 800 }}>
          Pas encore de scores cette semaine — sois le premier à apparaître ici !
        </div>
      ) : null}
    </>
  );
}

function LeaderboardList({ rows, meUserId }: { rows: ApiViewerWeekTopRow[]; meUserId: number | null }) {
  if (rows.length === 0) return null;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {rows.map((r, i) => {
        const isMe = meUserId != null && Number(meUserId) === Number(r.userId);
        return (
          <Reveal key={`${r.userId}-${r.rank}`} delay={Math.min(i * 0.03, 0.3)}>
            <div className={`evRow${isMe ? " me" : ""}`}>
              <div className="evRowRank">#{r.rank}</div>
              <EventAvatar userId={r.userId} username={r.username} size={32} />
              <div className="evRowName">
                {r.username}
                {isMe ? <span style={{ opacity: 0.7 }}> (toi)</span> : null}
              </div>
              <div className="evRowPts">{Math.floor(Number(r.points || 0))} pts</div>
            </div>
          </Reveal>
        );
      })}
    </div>
  );
}

// Détail des points perso — stat tiles avec count-up. Visible uniquement
// connecté + éligible + score existant.
function MyScoreTiles({ me }: { me: NonNullable<ApiViewerWeekResp["me"]> }) {
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
    <div className="evCard">
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 24 }}>✅</span>
        <div style={{ minWidth: 0 }}>
          <div className="evLockedTitle" style={{ fontSize: 15 }}>Tu participes</div>
          <div className="evHeroMeta" style={{ opacity: 0.78, justifyContent: "flex-start" }}>
            Rang actuel : #{me.rank ?? "?"} · <CountUp value={Number(me.points || 0)} /> pts
          </div>
        </div>
      </div>

      <div className="evStatGrid" style={{ marginTop: 14 }}>
        {items.map((it) => (
          <div className="evStatTile" key={it.label}>
            <div className="evStatIcon">{it.icon}</div>
            <div className="evStatValue"><CountUp value={it.value} /></div>
            <div className="evStatLabel">{it.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EventTeaser({ event }: { event: ApiEventRow }) {
  const pitch = EVENT_TEASER[event.type] || "Un nouvel event arrive bientôt sur LunaLive. Reviens vite pour découvrir les règles et le classement.";
  return (
    <div className="evCard evTeaser">
      <div className="evTeaserEmoji">{eventEmoji(event.type)}</div>
      <div className="evTeaserTitle">{eventLabel(event.type)}</div>
      <div className="evTeaserPitch">{pitch}</div>
      <span className="evStateBadge scheduled">⏳ Bientôt disponible</span>
    </div>
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
  const [accessStatus, setAccessStatus] = React.useState<ApiEventAccessStatus | null>(null);

  // mini timer pour countdown
  const [nowMs, setNowMs] = React.useState(Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Spotlight curseur sur le hero.
  const heroRef = React.useRef<HTMLDivElement>(null);
  const mx = useMotionValue(50);
  const my = useMotionValue(22);
  const smx = useSpring(mx, { stiffness: 70, damping: 20 });
  const smy = useSpring(my, { stiffness: 70, damping: 20 });
  const onHeroMove = (e: React.MouseEvent) => {
    const el = heroRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    mx.set(((e.clientX - r.left) / r.width) * 100);
    my.set(((e.clientY - r.top) / r.height) * 100);
  };

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
          setAccessStatus(acc);
        } catch {
          setAccessStatus(null);
        }
      } else {
        setAccessStatus(null);
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

  const titleEmoji = event ? eventEmoji(event.type) : "✨";
  const titleLabel = event ? eventLabel(event.type) : "Event";
  const isViewerWeek = event?.type === "viewer_week";
  const meRow = viewerWeek?.me ?? null;
  const meUserId = viewerWeek?.me?.userId ?? null;
  const top3 = viewerWeek?.top ?? [];
  const rest = top3.slice(3);

  const eligible = accessStatus?.eligible ?? null;
  const steps = accessStatus?.steps ?? [];
  const missingCount = steps.filter((s) => !s.done).length;

  const stateBadge = !event
    ? null
    : event.state === "live"
    ? { cls: "live", text: "🟢 En cours" }
    : event.state === "scheduled"
    ? { cls: "scheduled", text: "⏳ Bientôt" }
    : { cls: "closed", text: "✅ Terminé" };

  const cdTarget = event?.state === "scheduled" && startMs > 0 ? startMs : endMs;
  const cdLabel = event?.state === "scheduled" ? "Commence dans" : "Se termine dans";
  const showCountdown = !!event && event.state !== "closed" && cdTarget > 0;

  return (
    <main className="container evRoot" style={{ paddingBottom: "calc(26px + env(safe-area-inset-bottom))", display: "grid", gap: 14 }}>
      <section className="evHero" ref={heroRef} onMouseMove={onHeroMove}>
        <div className="evMesh" />
        <motion.div
          className="evHeroSpotlight"
          style={
            {
              ["--mx" as any]: useTransform(smx, (v) => `${v}%`),
              ["--my" as any]: useTransform(smy, (v) => `${v}%`),
            } as any
          }
        />
        <div className="evGrain" />

        <div className="evHeroTop">
          {stateBadge ? <span className={`evStateBadge ${stateBadge.cls}`}>{stateBadge.text}</span> : <span />}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="evBtnGhost" onClick={() => load().catch(() => {})} disabled={loading}>
              {loading ? "Chargement…" : "Rafraîchir ↻"}
            </button>
            <Link to="/" className="evBtnGhost" title="Retour aux lives">Lives</Link>
          </div>
        </div>

        <div className="evHeroContent">
          <h1 className="evTitle"><span className="evTitleEmoji">{titleEmoji}</span>{titleLabel}</h1>
          {event ? (
            <div className="evHeroMeta">
              <span title="Début">{fmtIsoLocal(event.start_at)}</span>
              <span style={{ opacity: 0.6 }}>→</span>
              <span title="Fin">{fmtIsoLocal(event.end_at)}</span>
            </div>
          ) : (
            <div className="evHeroMeta">Aucun event actif.</div>
          )}

          {showCountdown ? <Countdown targetMs={cdTarget} nowMs={nowMs} label={cdLabel} /> : null}
        </div>
      </section>

      {err ? (
        <div className="alert" style={{ margin: 0 }}>{err}</div>
      ) : null}

      {loading ? (
        <div className="evCard">
          <div style={{ fontWeight: 1200 }}>Chargement…</div>
          <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 950, marginTop: 6 }}>
            Récupération de l'event courant et du classement.
          </div>
        </div>
      ) : !event ? (
        <div className="evCard">
          <div style={{ fontWeight: 1200 }}>Aucun event actif</div>
          <div style={{ fontSize: 12, opacity: 0.82, fontWeight: 950, marginTop: 6 }}>
            Le moteur d'events n'a peut-être pas encore ouvert l'event (ou la fenêtre est terminée).
          </div>
        </div>
      ) : isViewerWeek ? (
        <>
          <Reveal>
            <div>
              <div className="evSectionTitle">🏆 Podium</div>
              <Podium top={top3} meUserId={meUserId} />
            </div>
          </Reveal>

          {rest.length > 0 ? (
            <Reveal delay={0.05}>
              <div>
                <div className="evSectionTitle">📊 Classement complet</div>
                <LeaderboardList rows={rest} meUserId={meUserId} />
              </div>
            </Reveal>
          ) : null}

          <Reveal delay={0.08}>
            <div>
              <div className="evSectionTitle">🎁 Vitrine des lots</div>
              <RewardsShowcase />
            </div>
          </Reveal>

          <Reveal delay={0.12}>
            <div>
              <div className="evSectionTitle">🎯 Ton statut</div>

              {!token ? (
                <div className="evCard" style={{ textAlign: "center", display: "grid", gap: 10, justifyItems: "center" }}>
                  <div style={{ fontSize: 30 }}>🔐</div>
                  <div className="evLockedTitle" style={{ fontSize: 17 }}>Connecte-toi pour participer</div>
                  <div className="evLockedSub">
                    Ton classement et le détail de tes points s'afficheront ici dès que tu es connecté.
                  </div>
                  <button type="button" className="evBtn" onClick={() => setLoginOpen(true)}>Se connecter</button>
                </div>
              ) : eligible === false ? (
                <div className="evLocked">
                  <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div className="evLockedIcon">🔒</div>
                    <div style={{ flex: 1, minWidth: 240 }}>
                      <div className="evLockedTitle">Tu ne participes pas encore aux événements</div>
                      <div className="evLockedSub" style={{ marginTop: 6 }}>
                        Il te manque {missingCount} étape{missingCount > 1 ? "s" : ""} pour apparaître dans le classement et gagner des lots.
                      </div>

                      {steps.length > 0 ? (
                        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {steps.map((s) => (
                            <span key={s.key} className={`evStepChip ${s.done ? "done" : "todo"}`}>
                              {s.done ? "✅" : STEP_ICON[s.key] ?? "•"} {s.label}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      <div style={{ marginTop: 16 }}>
                        <Link to="/participer" className="evBtnBig">🔓 Débloquer ma participation →</Link>
                      </div>
                    </div>
                  </div>
                </div>
              ) : meRow ? (
                <MyScoreTiles me={meRow} />
              ) : (
                <div className="evCard" style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 26 }}>✅</div>
                  <div className="evLockedSub" style={{ marginTop: 8 }}>
                    Éligible ! Regarde un live pour commencer à marquer des points.
                  </div>
                </div>
              )}
            </div>
          </Reveal>
        </>
      ) : (
        <Reveal>
          <EventTeaser event={event} />
        </Reveal>
      )}

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </main>
  );
}
