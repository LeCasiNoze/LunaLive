// web/src/components/chat/ActiveEventsBar.tsx
//
// Barre d'events actionnables épinglée en haut du chat (rain, roue,
// prédiction, coffre, combo follow). Chaque chip gère son propre timer.
// Le "récap dans le flux" n'est pas rendu ici : on appelle props.recap(html)
// et c'est au parent de le poster dans le fil de messages.

import * as React from "react";
import "./specialEvents.css";

export type ActiveEvent = {
  id: string;
  type: "rain" | "wheel" | "predict" | "chest" | "combo";
  data: any;
};

const DUR = { rain: 45, wheel: 60, predict: 120, chest: 30, comboIdle: 15 };

function fmt(s: number): string {
  return "00:" + String(Math.max(0, s)).padStart(2, "0");
}

/* ─── Rain ───────────────────────────────────────────────── */
function RainChip({ id, data, onExpire, onJoinRain, recap }: {
  id: string;
  data: any;
  onExpire: (id: string) => void;
  onJoinRain: (id: string) => void;
  recap: (html: string) => void;
}) {
  const pot = Number(data?.pot ?? 0);
  const [count, setCount] = React.useState(Number(data?.participants ?? 0));
  const [joined, setJoined] = React.useState(false);
  const [remaining, setRemaining] = React.useState(DUR.rain);
  const expiredRef = React.useRef(false);
  const countRef = React.useRef(count);
  React.useEffect(() => { countRef.current = count; }, [count]);

  React.useEffect(() => {
    const iv = setInterval(() => {
      setRemaining(t => {
        const next = t - 1;
        if (next <= 0 && !expiredRef.current) {
          expiredRef.current = true;
          clearInterval(iv);
          onExpire(id);
          recap(`🌧️ Rain terminée — <b>${countRef.current}</b> ont partagé ${pot} rubis`);
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function handleJoin() {
    if (joined) return;
    setJoined(true);
    setCount(c => c + 1);
    onJoinRain(id);
  }

  return (
    <div className="lle-chip lle-chip--rain" data-id={id}>
      <div className="lle-chip__row">
        <span className="lle-chip__ic">💎</span>
        <div className="lle-chip__mid">
          <div className="lle-chip__t">Rain de rubis</div>
          <div className="lle-chip__meta">{fmt(remaining)} · {count} pers.</div>
        </div>
        <button className="lle-chip__cta" disabled={joined} onClick={handleJoin}>
          {joined ? "✓ Récupéré" : "Récupérer 💎"}
        </button>
      </div>
      <div className="lle-chip__prog"><i style={{ width: `${Math.max(0, remaining / DUR.rain * 100)}%` }} /></div>
    </div>
  );
}

/* ─── Wheel ──────────────────────────────────────────────── */
function WheelChip({ id, onExpire, onSpin, recap }: {
  id: string;
  data: any;
  onExpire: (id: string) => void;
  onSpin: (id: string) => void;
  recap: (html: string) => void;
}) {
  const [remaining, setRemaining] = React.useState(DUR.wheel);
  const [spinning, setSpinning] = React.useState(false);
  const expiredRef = React.useRef(false);
  const spinTimeoutRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    const iv = setInterval(() => {
      setRemaining(t => {
        const next = t - 1;
        if (next <= 0 && !expiredRef.current) {
          expiredRef.current = true;
          clearInterval(iv);
          onExpire(id);
          recap("🎡 Roue fermée");
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  React.useEffect(() => () => {
    if (spinTimeoutRef.current !== null) window.clearTimeout(spinTimeoutRef.current);
  }, []);

  function handleSpin() {
    if (spinning || expiredRef.current) return;
    setSpinning(true);
    onSpin(id);
    spinTimeoutRef.current = window.setTimeout(() => {
      if (expiredRef.current) return;
      expiredRef.current = true;
      const prizes = ["×5 Bonus", "+250 rubis", "Skin rare", "×2 Multi", "Coffre gratuit"];
      const prize = prizes[Math.floor(Math.random() * prizes.length)];
      recap(`🎡 Roue : tu gagnes <b>${prize}</b> 🎉`);
      onExpire(id);
    }, 1800);
  }

  return (
    <div className="lle-chip lle-chip--wheel" data-id={id}>
      <div className="lle-chip__row">
        <span className="lle-chip__ic">🎡</span>
        <div className="lle-chip__mid">
          <div className="lle-chip__t">Roue ouverte</div>
          <div className="lle-chip__meta">{fmt(remaining)} · bonus mystère</div>
        </div>
        <button className="lle-chip__cta" disabled={spinning} onClick={handleSpin}>
          {spinning ? "Tourne…" : "Participer 🎡"}
        </button>
      </div>
      <div className="lle-chip__prog"><i style={{ width: `${Math.max(0, remaining / DUR.wheel * 100)}%` }} /></div>
    </div>
  );
}

/* ─── Predict ────────────────────────────────────────────── */
function PredictChip({ id, data, onExpire, onVote, recap }: {
  id: string;
  data: any;
  onExpire: (id: string) => void;
  onVote: (id: string, opt: "yes" | "no") => void;
  recap: (html: string) => void;
}) {
  const question = String(data?.question ?? "Prédiction en cours");
  const opt1 = String(data?.option1 ?? "OUI");
  const opt2 = String(data?.option2 ?? "NON");
  const [remaining, setRemaining] = React.useState(DUR.predict);
  const [open, setOpen] = React.useState(false);
  const [voted, setVoted] = React.useState(false);
  const [chosen, setChosen] = React.useState<"yes" | "no" | null>(null);
  const [yesPct, setYesPct] = React.useState(50);
  const expiredRef = React.useRef(false);

  React.useEffect(() => {
    const iv = setInterval(() => {
      setRemaining(t => {
        const next = t - 1;
        if (next <= 0 && !expiredRef.current) {
          expiredRef.current = true;
          clearInterval(iv);
          onExpire(id);
          const y = 30 + Math.floor(Math.random() * 40);
          const winner = y >= 50 ? opt1 : opt2;
          recap(`🔮 Résultat : <b>${winner} ${Math.max(y, 100 - y)}%</b>`);
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function handleVote(opt: "yes" | "no") {
    if (voted) return;
    setVoted(true);
    setChosen(opt);
    setYesPct(30 + Math.floor(Math.random() * 40));
    onVote(id, opt);
  }

  const noPct = 100 - yesPct;

  return (
    <div className={`lle-chip lle-chip--predict${open ? " lle-open" : ""}`} data-id={id}>
      <div className="lle-chip__row">
        <span className="lle-chip__ic">🔮</span>
        <div className="lle-chip__mid">
          <div className="lle-chip__t">Prédiction</div>
          <div className="lle-chip__meta">
            {voted ? <>Vote : <b>{chosen === "yes" ? opt1 : opt2}</b> — en attente</> : `${fmt(remaining)} · ${question}`}
          </div>
        </div>
        <button className="lle-chip__cta" onClick={() => setOpen(o => !o)}>Voter</button>
      </div>
      <div className="lle-chip__expand">
        <div
          className="lle-pbar lle-yes"
          style={{ pointerEvents: voted ? "none" : undefined, opacity: voted ? (chosen === "yes" ? 1 : .5) : undefined }}
          onClick={() => handleVote("yes")}>
          <span className="lle-fill" style={{ ["--w" as any]: `${yesPct}%` } as React.CSSProperties} />
          <span className="lle-lbl">{opt1}</span>
          <span className="lle-pct">{yesPct}%</span>
        </div>
        <div
          className="lle-pbar lle-no"
          style={{ pointerEvents: voted ? "none" : undefined, opacity: voted ? (chosen === "no" ? 1 : .5) : undefined }}
          onClick={() => handleVote("no")}>
          <span className="lle-fill" style={{ ["--w" as any]: `${noPct}%` } as React.CSSProperties} />
          <span className="lle-lbl">{opt2}</span>
          <span className="lle-pct">{noPct}%</span>
        </div>
      </div>
      <div className="lle-chip__prog"><i style={{ width: `${Math.max(0, remaining / DUR.predict * 100)}%` }} /></div>
    </div>
  );
}

/* ─── Chest ──────────────────────────────────────────────── */
function ChestChip({ id, data, onExpire, onChestOpen, recap }: {
  id: string;
  data: any;
  onExpire: (id: string) => void;
  onChestOpen: (id: string) => void;
  recap: (html: string) => void;
}) {
  const loot = Number(data?.loot ?? 0);
  const [remaining, setRemaining] = React.useState(DUR.chest);
  const [opened, setOpened] = React.useState(false);
  const expiredRef = React.useRef(false);
  const openTimeoutRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    const iv = setInterval(() => {
      setRemaining(t => {
        const next = t - 1;
        if (next <= 0 && !expiredRef.current) {
          expiredRef.current = true;
          clearInterval(iv);
          onExpire(id);
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  React.useEffect(() => () => {
    if (openTimeoutRef.current !== null) window.clearTimeout(openTimeoutRef.current);
  }, []);

  function handleOpen() {
    if (opened || expiredRef.current) return;
    setOpened(true);
    onChestOpen(id);
    recap("📦 Tu as ouvert ton coffre 🎁");
    openTimeoutRef.current = window.setTimeout(() => {
      if (expiredRef.current) return;
      expiredRef.current = true;
      onExpire(id);
    }, 1400);
  }

  return (
    <div className="lle-chip lle-chip--chest" data-id={id}>
      <div className="lle-chip__row">
        <span className="lle-chip__ic">📦</span>
        <div className="lle-chip__mid">
          <div className="lle-chip__t">Coffre commu.</div>
          <div className="lle-chip__meta">{fmt(remaining)} · {loot} rubis</div>
        </div>
        <button className="lle-chip__cta" disabled={opened} onClick={handleOpen}>
          {opened ? "✓ Ouvert" : "Ouvrir 🗝️"}
        </button>
      </div>
      <div className="lle-chip__prog"><i style={{ width: `${Math.max(0, remaining / DUR.chest * 100)}%` }} /></div>
    </div>
  );
}

/* ─── Combo (fenêtre glissante 15s, ré-armée sur data.mult) ─ */
function ComboChip({ id, data, onExpire, onComboAdvance, recap }: {
  id: string;
  data: any;
  onExpire: (id: string) => void;
  onComboAdvance: (nextMult: number, kind: "follow" | "sub") => void;
  recap: (html: string) => void;
}) {
  const mult = Number(data?.mult ?? 1);
  const kind: "follow" | "sub" = data?.kind === "sub" ? "sub" : "follow";
  const isSub = kind === "sub";
  const ic = isSub ? "⭐" : "🔥";
  const [remaining, setRemaining] = React.useState(DUR.comboIdle);
  const expiredRef = React.useRef(false);
  const multRef = React.useRef(mult);
  React.useEffect(() => { multRef.current = mult; }, [mult]);

  React.useEffect(() => {
    expiredRef.current = false;
    setRemaining(DUR.comboIdle);
    const iv = setInterval(() => {
      setRemaining(t => {
        const next = t - 1;
        if (next <= 0 && !expiredRef.current) {
          expiredRef.current = true;
          clearInterval(iv);
          onExpire(id);
          recap(`${ic} Combo ${isSub ? "sub" : "follow"} terminé à <b>x${multRef.current}</b>`);
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, mult]);

  return (
    <div className={`lle-chip ${isSub ? "lle-chip--combosub" : "lle-chip--combo"}`} data-id={id}>
      <div className="lle-chip__row">
        <span className="lle-chip__ic">{ic}</span>
        <div className="lle-chip__mid">
          <div className="lle-chip__t">Combo {isSub ? "sub" : "follow"}</div>
          <div className="lle-chip__meta">x{mult} en cours {ic}</div>
        </div>
        <button className="lle-chip__cta" onClick={() => onComboAdvance(mult + 1, kind)}>Combo x{mult + 1}</button>
      </div>
      <div className="lle-chip__prog"><i style={{ width: `${Math.max(0, remaining / DUR.comboIdle * 100)}%` }} /></div>
    </div>
  );
}

/* ─── Bar ────────────────────────────────────────────────── */
export default function ActiveEventsBar(props: {
  events: ActiveEvent[];
  onExpire: (id: string) => void;
  onJoinRain: (id: string) => void;
  onSpin: (id: string) => void;
  onVote: (id: string, opt: "yes" | "no") => void;
  onChestOpen: (id: string) => void;
  onComboAdvance: (nextMult: number, kind: "follow" | "sub") => void;
  recap: (html: string) => void;
}): React.JSX.Element | null {
  if (props.events.length === 0) return null;

  return (
    <div className="lle-pinbar">
      {props.events.map(ev => {
        switch (ev.type) {
          case "rain":
            return <RainChip key={ev.id} id={ev.id} data={ev.data} onExpire={props.onExpire} onJoinRain={props.onJoinRain} recap={props.recap} />;
          case "wheel":
            return <WheelChip key={ev.id} id={ev.id} data={ev.data} onExpire={props.onExpire} onSpin={props.onSpin} recap={props.recap} />;
          case "predict":
            return <PredictChip key={ev.id} id={ev.id} data={ev.data} onExpire={props.onExpire} onVote={props.onVote} recap={props.recap} />;
          case "chest":
            return <ChestChip key={ev.id} id={ev.id} data={ev.data} onExpire={props.onExpire} onChestOpen={props.onChestOpen} recap={props.recap} />;
          case "combo":
            return <ComboChip key={ev.id} id={ev.id} data={ev.data} onExpire={props.onExpire} onComboAdvance={props.onComboAdvance} recap={props.recap} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
