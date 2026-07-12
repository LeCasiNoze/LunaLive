// web/src/components/chat/ActionableEvents.tsx
// ─────────────────────────────────────────────────────────────────────────
// Events ACTIONNABLES v2 (rain / roue / prédiction / coffre).
//
// Différence clé avec la v1 (ActiveEventsBar auto-gérée) : l'état est
// CENTRALISÉ dans un moteur (useActionableEngine) et partagé entre la carte
// du chat ET le chip épinglé → participer depuis l'un désactive l'autre
// (sync). Le moteur gère les timers, les participants, les % live, et la
// résolution (roue partagée, choix du vainqueur de prédiction).
//
// Ces vues sont CONTRÔLÉES (props + callbacks) : le banc les pilote en
// simulation locale, ChatPanel les pilotera via socket backend ensuite.
// ─────────────────────────────────────────────────────────────────────────
import * as React from "react";
import "./specialEvents.css";

export type ActKind = "rain" | "wheel" | "predict" | "chest";

export type ActEvent = {
  id: string;
  kind: ActKind;
  joined: boolean;              // le viewer courant a participé
  participants: string[];       // noms (roue/rain/coffre)
  remaining: number;            // secondes restantes
  duration: number;
  locked: boolean;              // temps écoulé → plus de participation
  resolved: boolean;            // event terminé (gagnant annoncé)
  // predict
  question?: string;
  opt1?: string;
  opt2?: string;
  pctYes: number;               // 0-100, évolue en temps réel
  myVote: "yes" | "no" | null;
  // rain / chest
  pot?: number;
  loot?: number;
  // Mode RÉEL (vrai chat) : la participation passe par le backend et l'état
  // (compteur, résolution) arrive par socket. real=false = simulation (banc).
  real?: boolean;
  round?: number;               // round backend (rain) pour matcher les updates
  serverCount?: number;         // compteur diffusé par le serveur (prioritaire)
};

const DUR: Record<ActKind, number> = { rain: 45, wheel: 60, predict: 120, chest: 30 };

function participationMsg(kind: ActKind, name: string): string {
  return kind === "rain" ? `💎 <b>${name}</b> a récupéré ses rubis`
    : kind === "wheel" ? `🎡 <b>${name}</b> participe à la roue`
    : kind === "chest" ? `📦 <b>${name}</b> a rejoint le coffre`
    : `<b>${name}</b> participe`;
}

type EngineOpts = {
  me: string;                         // pseudo du viewer courant
  poolNames: string[];                // pour simuler d'autres participants (banc)
  emitSystem: (html: string) => void; // message système dans le flux
  emitRecap: (html: string) => void;  // récap centré dans le flux
  addChatCard: (actId: string) => void;
  // banc = true (faux participants qui arrivent). Vrai chat = false : seuls
  // les vrais participants (backend) rejoignent.
  simulate?: boolean;
  // Vrai chat : participation RÉELLE. Appelé quand le viewer clique Participer
  // sur un event real → le parent route vers le vrai endpoint (rain/roue/…).
  onRealJoin?: (e: ActEvent) => void;
};

export type ActionableEngine = ReturnType<typeof useActionableEngine>;

export function useActionableEngine(opts: EngineOpts) {
  const [events, setEvents] = React.useState<ActEvent[]>([]);
  const [overlay, setOverlay] = React.useState<{ names: string[]; winner: string; spinning: boolean } | null>(null);
  const [listFor, setListFor] = React.useState<string | null>(null);

  const optsRef = React.useRef(opts); optsRef.current = opts;
  const eventsRef = React.useRef<ActEvent[]>(events); eventsRef.current = events;
  const seqRef = React.useRef(0);

  // Tick 1s : countdown + lock à 0 + drift des % (predict). Le countdown est
  // pur ; l'arrivée des participants passe par simJoin (pour émettre un
  // message système par participant).
  React.useEffect(() => {
    const iv = setInterval(() => {
      setEvents((prev) => prev.map((e) => {
        if (e.resolved) return e;
        let remaining = e.remaining - 1;
        let locked = e.locked;
        if (remaining <= 0) { remaining = 0; locked = true; }
        let pctYes = e.pctYes;
        if (e.kind === "predict" && !locked) {
          pctYes = Math.min(92, Math.max(8, pctYes + (Math.random() * 6 - 3)));
        }
        return { ...e, remaining, locked, pctYes };
      }));
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  const open = React.useCallback((kind: ActKind, data?: any) => {
    const id = `act_${++seqRef.current}`;
    const dur = Number(data?.durationSec) > 0 ? Math.round(Number(data.durationSec)) : DUR[kind];
    const ev: ActEvent = {
      id, kind, joined: false, participants: [], remaining: dur, duration: dur,
      locked: false, resolved: false,
      question: data?.question, opt1: data?.option1 ?? "OUI", opt2: data?.option2 ?? "NON",
      pctYes: 50, myVote: null, pot: data?.pot, loot: data?.loot,
      real: !!data?.real, round: data?.round != null ? Number(data.round) : undefined,
      serverCount: data?.real ? 0 : undefined,
    };
    setEvents((prev) => [...prev, ev]);
    optsRef.current.addChatCard(id);
    const sys = kind === "rain" ? "🌧️ Une <b>rain de rubis</b> a démarré — récupère ta part !"
      : kind === "wheel" ? "🎡 Une <b>roue</b> a été lancée — participe pour tenter d'être tiré au sort !"
      : kind === "predict" ? `🔮 <b>Prédiction ouverte</b> : ${data?.question ?? ""}`
      : "📦 Un <b>coffre communautaire</b> est ouvert — participe !";
    optsRef.current.emitSystem(sys);
  }, []);

  // NB : on émet le message système HORS de l'updater setEvents (un updater
  // peut être rappelé 2× en StrictMode → messages dupliqués).
  const join = React.useCallback((id: string) => {
    const e = eventsRef.current.find((x) => x.id === id);
    if (!e || e.joined || e.locked || e.resolved) return;
    // Marque "rejoint" (optimiste) dans les 2 cas.
    setEvents((prev) => prev.map((x) => x.id === id && !x.joined && !x.locked ? { ...x, joined: true } : x));
    if (e.real) {
      // Vrai chat : le parent appelle le vrai endpoint ; le message système et
      // le compteur arrivent ensuite par socket (backend). Pas d'emit local.
      optsRef.current.onRealJoin?.(e);
      return;
    }
    const me = optsRef.current.me;
    setEvents((prev) => prev.map((x) => x.id === id ? { ...x, participants: x.participants.includes(me) ? x.participants : [...x.participants, me] } : x));
    optsRef.current.emitSystem(participationMsg(e.kind, me));
  }, []);

  // Participant simulé (autre compte) : ajoute + émet un message système.
  const simJoin = React.useCallback((id: string, name: string) => {
    const e = eventsRef.current.find((x) => x.id === id);
    if (!e || e.locked || e.resolved || e.participants.includes(name)) return;
    setEvents((prev) => prev.map((x) => x.id === id && !x.participants.includes(name)
      ? { ...x, participants: [...x.participants, name] } : x));
    optsRef.current.emitSystem(participationMsg(e.kind, name));
  }, []);

  const vote = React.useCallback((id: string, opt: "yes" | "no") => {
    setEvents((prev) => prev.map((e) => {
      if (e.id !== id || e.locked || e.myVote) return e;
      const pctYes = opt === "yes" ? Math.min(92, e.pctYes + 8) : Math.max(8, e.pctYes - 8);
      return { ...e, myVote: opt, joined: true, pctYes };
    }));
  }, []);

  const addParticipant = React.useCallback((id: string, name: string) => {
    const n = name.trim();
    if (!n) return;
    setEvents((prev) => prev.map((e) => e.id === id && !e.participants.includes(n) ? { ...e, participants: [...e.participants, n] } : e));
  }, []);
  const removeParticipant = React.useCallback((id: string, name: string) => {
    setEvents((prev) => prev.map((e) => e.id === id ? { ...e, participants: e.participants.filter((p) => p !== name) } : e));
  }, []);

  // Streamer "Ouvrir" sur une roue → overlay partagé (même gagnant chez tous,
  // ici tiré localement ; le backend fixera la graine pour tous les viewers).
  const resolveWheel = React.useCallback((id: string) => {
    const e = eventsRef.current.find((x) => x.id === id);
    if (!e) return;
    const names = e.participants.length ? e.participants : [optsRef.current.me];
    const winner = names[Math.floor(Math.random() * names.length)];
    setEvents((prev) => prev.map((x) => x.id === id ? { ...x, locked: true } : x));
    setOverlay({ names, winner, spinning: true });
    window.setTimeout(() => {
      setOverlay((o) => (o ? { ...o, spinning: false } : o));
      optsRef.current.emitRecap(`🎡 <b>${winner}</b> remporte le tirage 🎉`);
      setEvents((prev) => prev.map((x) => x.id === id ? { ...x, resolved: true } : x));
      window.setTimeout(() => setOverlay(null), 2800);
    }, 4200);
  }, []);

  // Streamer choisit le vainqueur d'une prédiction.
  const resolvePredict = React.useCallback((id: string, winner: "yes" | "no") => {
    const e = eventsRef.current.find((x) => x.id === id);
    if (!e) return;
    const label = winner === "yes" ? e.opt1 : e.opt2;
    optsRef.current.emitRecap(`🔮 Résultat : <b>${label}</b> l'emporte`);
    setEvents((prev) => prev.map((x) => x.id === id ? { ...x, resolved: true, locked: true } : x));
  }, []);

  const resolveChest = React.useCallback((id: string) => {
    const e = eventsRef.current.find((x) => x.id === id);
    if (!e) return;
    optsRef.current.emitRecap(`📦 Coffre distribué à <b>${e.participants.length || 1}</b> participant(s) 🎁`);
    setEvents((prev) => prev.map((x) => x.id === id ? { ...x, resolved: true, locked: true } : x));
  }, []);

  const rainPayout = React.useCallback((id: string) => {
    const e = eventsRef.current.find((x) => x.id === id);
    if (!e) return;
    optsRef.current.emitRecap(`🌧️ Rain terminée — <b>${e.participants.length || 1}</b> ont partagé ${e.pot ?? 0} rubis`);
    setEvents((prev) => prev.map((x) => x.id === id ? { ...x, resolved: true, locked: true } : x));
  }, []);

  const dismiss = React.useCallback((id: string) => setEvents((prev) => prev.filter((e) => e.id !== id)), []);

  // Mise à jour depuis le SOCKET backend (event real) : compteur partagé,
  // résolution. Matche par (kind, round). Émet le recap une seule fois.
  const patchByRound = React.useCallback((kind: ActKind, round: number, patch: { serverCount?: number; resolved?: boolean; recapHtml?: string }) => {
    setEvents((prev) => prev.map((e) => {
      if (!e.real || e.kind !== kind || Number(e.round) !== Number(round) || e.resolved) return e;
      return {
        ...e,
        serverCount: patch.serverCount != null ? patch.serverCount : e.serverCount,
        resolved: patch.resolved ? true : e.resolved,
        locked: patch.resolved ? true : e.locked,
      };
    }));
  }, []);

  // Simulation : d'autres comptes rejoignent rain/roue/coffre au fil du temps
  // (chaque arrivée émet son message système « … participe »).
  React.useEffect(() => {
    if (!optsRef.current.simulate) return;
    const iv = setInterval(() => {
      const open = eventsRef.current.filter((e) => !e.locked && !e.resolved && (e.kind === "rain" || e.kind === "wheel" || e.kind === "chest"));
      if (!open.length) return;
      const e = open[Math.floor(Math.random() * open.length)];
      const cand = optsRef.current.poolNames.filter((n) => n !== optsRef.current.me && !e.participants.includes(n));
      if (!cand.length) return;
      simJoin(e.id, cand[Math.floor(Math.random() * cand.length)]);
    }, 2600);
    return () => clearInterval(iv);
  }, [simJoin]);

  // Auto-résolution rain/coffre à la fin du compte à rebours (aucun bouton
  // streamer : c'est automatique).
  const autoResolvedRef = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    for (const e of events) {
      if (e.resolved || e.remaining > 0) continue;
      if (e.real) continue; // les events réels sont résolus par le backend (socket)
      if ((e.kind === "rain" || e.kind === "chest") && !autoResolvedRef.current.has(e.id)) {
        autoResolvedRef.current.add(e.id);
        if (e.kind === "rain") rainPayout(e.id); else resolveChest(e.id);
      }
    }
  }, [events, rainPayout, resolveChest]);

  return {
    events, overlay, listFor, setListFor,
    open, join, vote, addParticipant, removeParticipant,
    resolveWheel, resolvePredict, resolveChest, rainPayout, dismiss, patchByRound,
  };
}

/** Compteur de participants affiché : priorité au compteur serveur (event réel). */
function pCount(e: ActEvent): number {
  return e.serverCount != null ? e.serverCount : e.participants.length;
}

/* ═══════════════ Vues ═══════════════ */

const META: Record<ActKind, { ic: string; t: string; cls: string }> = {
  rain: { ic: "💎", t: "Rain de rubis", cls: "lle-chip--rain" },
  wheel: { ic: "🎡", t: "Roue", cls: "lle-chip--wheel" },
  predict: { ic: "🔮", t: "Prédiction", cls: "lle-chip--predict" },
  chest: { ic: "📦", t: "Coffre commu.", cls: "lle-chip--chest" },
};
const fmt = (s: number) => "00:" + String(Math.max(0, s)).padStart(2, "0");

function joinLabel(e: ActEvent): string {
  if (e.joined) return e.kind === "rain" ? "✓ Récupéré" : "✓ Inscrit";
  return e.kind === "rain" ? "Récupérer 💎" : e.kind === "wheel" ? "Participer 🎡" : e.kind === "chest" ? "Participer 📦" : "Voter";
}

/* Contrôles STREAMER (visibles seulement si isStreamer). Rain & coffre sont
   automatiques (compte à rebours) → aucun contrôle. Roue = Liste + Ouvrir.
   Prédiction = Ouvrir (choix du vainqueur). */
function StreamerControls({ e, engine }: { e: ActEvent; engine: ActionableEngine }) {
  const [choosing, setChoosing] = React.useState(false);
  if (e.resolved) return null;
  if (e.kind === "wheel") {
    return (
      <div className="lla-strm">
        <button className="lla-strm-btn" onClick={() => engine.setListFor(e.id)}>Liste ({e.participants.length})</button>
        <button className="lla-strm-btn lla-strm-go" onClick={() => engine.resolveWheel(e.id)}>Ouvrir 🎡</button>
      </div>
    );
  }
  if (e.kind === "predict") {
    return (
      <div className="lla-strm">
        {!choosing ? (
          <button className="lla-strm-btn lla-strm-go" onClick={() => setChoosing(true)}>Ouvrir 🔮</button>
        ) : (
          <>
            <button className="lla-strm-btn lla-win" onClick={() => engine.resolvePredict(e.id, "yes")}>{e.opt1} gagne</button>
            <button className="lla-strm-btn lla-win" onClick={() => engine.resolvePredict(e.id, "no")}>{e.opt2} gagne</button>
          </>
        )}
      </div>
    );
  }
  return null; // rain / chest : automatique
}

/* Barres de prédiction (partagées carte + chip), % live. */
function PredictBars({ e, engine, big }: { e: ActEvent; engine: ActionableEngine; big?: boolean }) {
  const noPct = 100 - e.pctYes;
  const disabled = e.locked || !!e.myVote || e.resolved;
  return (
    <div className={`lla-pred${big ? " lla-pred--big" : ""}`}>
      <button className="lle-pbar lle-yes" disabled={disabled} style={{ opacity: e.myVote && e.myVote !== "yes" ? .5 : 1 }} onClick={() => engine.vote(e.id, "yes")}>
        <span className="lle-fill" style={{ ["--w" as any]: `${Math.round(e.pctYes)}%` }} />
        <span className="lle-lbl">{e.opt1}</span><span className="lle-pct">{Math.round(e.pctYes)}%</span>
      </button>
      <button className="lle-pbar lle-no" disabled={disabled} style={{ opacity: e.myVote && e.myVote !== "no" ? .5 : 1 }} onClick={() => engine.vote(e.id, "no")}>
        <span className="lle-fill" style={{ ["--w" as any]: `${Math.round(noPct)}%` }} />
        <span className="lle-lbl">{e.opt2}</span><span className="lle-pct">{Math.round(noPct)}%</span>
      </button>
    </div>
  );
}

/** Barre épinglée (compacte) — un chip par event actionnable. */
export function ActionablePinnedBar({ engine, isStreamer }: { engine: ActionableEngine; isStreamer: boolean }) {
  const evs = engine.events.filter((e) => !e.resolved);
  if (!evs.length) return null;
  return (
    <div className="lle-pinbar">
      {evs.map((e) => {
        const m = META[e.kind];
        return (
          <div key={e.id} className={`lle-chip ${m.cls}`} data-id={e.id}>
            <div className="lle-chip__row">
              <span className="lle-chip__ic">{m.ic}</span>
              <div className="lle-chip__mid">
                <div className="lle-chip__t">{m.t}</div>
                <div className="lle-chip__meta">{fmt(e.remaining)} · {e.kind === "predict" ? `${Math.round(e.pctYes)}% / ${Math.round(100 - e.pctYes)}%` : `${pCount(e)} pers.`}</div>
              </div>
              {e.kind !== "predict" && (
                <button className="lle-chip__cta" disabled={e.joined || e.locked} onClick={() => engine.join(e.id)}>{joinLabel(e)}</button>
              )}
            </div>
            {e.kind === "predict" && <PredictBars e={e} engine={engine} />}
            {isStreamer && <StreamerControls e={e} engine={engine} />}
            <div className="lle-chip__prog"><i style={{ width: `${Math.max(0, e.remaining / e.duration * 100)}%` }} /></div>
          </div>
        );
      })}
    </div>
  );
}

/** Carte dans le flux du chat (plus grande) — même état que le chip (sync). */
export function ActionableChatCard({ event, engine, isStreamer }: { event: ActEvent | null; engine: ActionableEngine; isStreamer: boolean }) {
  if (!event) return <div className="lla-card lla-card--done">Événement terminé</div>;
  const e = event;
  const m = META[e.kind];
  const value = e.kind === "rain" ? `${e.pot ?? 0} rubis` : e.kind === "chest" ? `${e.loot ?? 0} rubis` : e.kind === "wheel" ? `${pCount(e)} inscrits` : null;
  return (
    <div className={`lle-ev lle-ev--${e.kind} lla-card`} data-tier="epic">
      <div className="lle-ev__body">
        <div className="lle-ev__icon">{m.ic}</div>
        <div className="lle-ev__text">
          <div className="lle-ev__title">{e.kind === "predict" ? "Prédiction" : m.t}</div>
          <div className="lle-ev__sub">
            {e.resolved ? "Terminé" : e.locked ? "Fermé — en attente du résultat" : e.kind === "predict" ? e.question : `${fmt(e.remaining)} restantes · ${pCount(e)} participant(s)`}
          </div>
        </div>
        {value ? <div className="lle-ev__value">{value}</div> : null}
      </div>
      {e.kind === "predict" && <div className="lle-pred-bars"><PredictBars e={e} engine={engine} big /></div>}
      <div className="lle-ev__actions">
        {e.kind !== "predict" && (
          <button className="lle-btn" disabled={e.joined || e.locked || e.resolved} onClick={() => engine.join(e.id)}>{joinLabel(e)}</button>
        )}
        {isStreamer && <div style={{ flex: 1 }}><StreamerControls e={e} engine={engine} /></div>}
      </div>
    </div>
  );
}

const WHEEL_COLORS = ["#7C4DFF", "#38bdf8", "#ff2d6b", "#f59e0b", "#34d399", "#a78bfa", "#f472b6", "#22d3ee"];
const truncName = (n: string) => (n.length > 9 ? n.slice(0, 8) + "…" : n);

/** Roue partagée plein écran — apparaît chez tout le monde quand le streamer
    ouvre. Les pseudos sont écrits sur les segments (tronqués). Elle tourne et
    s'arrête sur le gagnant (sous le pointeur). */
export function WheelOverlay({ overlay, onClose }: { overlay: { names: string[]; winner: string; spinning: boolean } | null; onClose: () => void }) {
  const [rot, setRot] = React.useState(0);
  const lastSpin = React.useRef<string | null>(null);

  const names = overlay && overlay.names.length ? overlay.names : overlay ? [overlay.winner] : [];
  const seg = names.length ? 360 / names.length : 360;

  React.useEffect(() => {
    if (!overlay) { lastSpin.current = null; return; }
    const key = `${overlay.winner}|${names.length}`;
    if (lastSpin.current === key) return; // même tirage : ne pas relancer
    lastSpin.current = key;
    const idx = Math.max(0, names.indexOf(overlay.winner));
    const finalR = 360 * 5 - (idx * seg + seg / 2); // amène le centre du gagnant en haut
    setRot(0);
    const raf = requestAnimationFrame(() => setRot(finalR));
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlay]);

  if (!overlay) return null;
  const bg = `conic-gradient(${names.map((_, i) => `${WHEEL_COLORS[i % WHEEL_COLORS.length]} ${i * seg}deg ${(i + 1) * seg}deg`).join(",")})`;

  return (
    <div className="lla-overlay" onClick={() => { if (!overlay.spinning) onClose(); }}>
      <div className="lla-wheelbox">
        <div className="lla-wheel2-wrap">
          <div className="lla-wheel2" style={{ background: bg, transform: `rotate(${rot}deg)`, transition: overlay.spinning ? "transform 4s cubic-bezier(.12,.85,.15,1)" : "none" }}>
            {names.map((n, i) => (
              <div key={i} className="lla-seg" style={{ transform: `rotate(${i * seg + seg / 2}deg)` }}>
                <span>{truncName(n)}</span>
              </div>
            ))}
            <div className="lla-wheel2-hub" />
          </div>
          <div className="lla-wheel-ptr" />
        </div>
        <div className="lla-wheel-name">{overlay.spinning ? "…" : overlay.winner}</div>
        <div className="lla-wheel-cap">{overlay.spinning ? "La roue tourne…" : "🎉 Gagnant !"}</div>
      </div>
    </div>
  );
}

/** Modale streamer : liste des participants, ajout manuel, retrait (croix). */
export function ParticipantListModal({ engine }: { engine: ActionableEngine }) {
  const id = engine.listFor;
  const e = engine.events.find((x) => x.id === id);
  const [name, setName] = React.useState("");
  if (!id || !e) return null;
  return (
    <div className="lla-modal" onClick={() => engine.setListFor(null)}>
      <div className="lla-modal-box" onClick={(ev) => ev.stopPropagation()}>
        <div className="lla-modal-head">
          <b>Participants — {META[e.kind].t}</b>
          <button className="lla-modal-x" onClick={() => engine.setListFor(null)}>✕</button>
        </div>
        <div className="lla-modal-add">
          <input value={name} placeholder="Ajouter un pseudo…" onChange={(ev) => setName(ev.target.value)}
            onKeyDown={(ev) => { if (ev.key === "Enter") { engine.addParticipant(e.id, name); setName(""); } }} />
          <button onClick={() => { engine.addParticipant(e.id, name); setName(""); }}>Ajouter</button>
        </div>
        <div className="lla-modal-list">
          {e.participants.length === 0 ? <div className="lla-modal-empty">Aucun participant</div> : null}
          {e.participants.map((p) => (
            <div key={p} className="lla-modal-row">
              <span>{p}</span>
              <button className="lla-modal-rm" onClick={() => engine.removeParticipant(e.id, p)}>✕</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
