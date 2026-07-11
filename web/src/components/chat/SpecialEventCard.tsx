// web/src/components/chat/SpecialEventCard.tsx
//
// Carte "célébration" affichée dans le flux du chat : raid, follow,
// combo (follow enchaîné), sub, don, boss, level. Port fidèle des scènes
// animées CSS + particules canvas du prototype chat-events.html.
// Le shake du feed N'EST PAS géré ici (responsabilité du parent).

import * as React from "react";
import "./specialEvents.css";
import { mountFieldFor } from "./specialParticles";

export type SpecialEventType =
  | "raid" | "follow" | "combo" | "sub" | "don" | "chest" | "rain" | "wheel" | "predict" | "boss" | "level";

function Runner() {
  // Silhouette de coureur penché en avant, foulée figée (le bob CSS anime la course).
  return (
    <svg viewBox="0 0 22 30" width="22" height="30">
      <g fill="#2f2160">
        <circle cx="13" cy="5" r="3" />
        <rect x="10" y="7" width="3.4" height="12" rx="1.7" transform="rotate(18 11 8)" />
        <rect x="11" y="9" width="6" height="2.2" rx="1.1" transform="rotate(35 11 10)" />
        <rect x="5" y="10" width="6" height="2.2" rx="1.1" transform="rotate(-25 11 11)" />
        <rect x="8.5" y="17" width="2.6" height="10" rx="1.3" transform="rotate(24 9.8 18)" />
        <rect x="8.5" y="17" width="2.6" height="10" rx="1.3" transform="rotate(-20 9.8 18)" />
      </g>
    </svg>
  );
}

// Foule qui déboule : profondeur via scale/opacity/bottom, staggerée.
const RAID_RUNNERS = [
  { d: 0.5, o: 0.4, b: 26, dur: 3.0, delay: 0.0 },
  { d: 0.62, o: 0.55, b: 21, dur: 2.7, delay: 0.9 },
  { d: 0.72, o: 0.68, b: 16, dur: 2.9, delay: 0.4 },
  { d: 0.85, o: 0.8, b: 11, dur: 2.5, delay: 1.4 },
  { d: 0.95, o: 0.9, b: 6, dur: 2.3, delay: 0.2 },
  { d: 1.12, o: 1, b: 2, dur: 2.1, delay: 1.0 },
  { d: 0.8, o: 0.75, b: 13, dur: 2.6, delay: 1.8 },
  { d: 1.0, o: 0.95, b: 4, dur: 2.35, delay: 0.6 },
];
const RAID_STREAKS = [
  { top: 18, sdur: 0.9, sdelay: 0.2 },
  { top: 33, sdur: 1.1, sdelay: 0.7 },
  { top: 47, sdur: 1.0, sdelay: 1.2 },
  { top: 27, sdur: 0.8, sdelay: 1.6 },
];

export default function SpecialEventCard(props: {
  type: SpecialEventType;
  data: any;
  currentUsername: string | null;
  onGg: (who: string | null) => void;
  onCombo: (nextMult: number) => void;
}): React.JSX.Element {
  const { type, data } = props;
  const [ggClicked, setGgClicked] = React.useState(false);
  const [allDisabled, setAllDisabled] = React.useState(false);

  function handleGg() {
    props.onGg(data?.who ?? data?.from ?? null);
    setGgClicked(true);
  }

  function handleCombo(currentMult: number) {
    props.onCombo(currentMult + 1);
    setAllDisabled(true);
  }

  const combo = type === "combo";
  const mult = Number(data?.mult ?? 1);

  // pfKind : quel jeu de particules monter sur le canvas .lle-pf de cette
  // carte (null = pas de canvas, comme le follow simple dans le prototype)
  let pfKind: string | null = null;
  switch (type) {
    case "raid": pfKind = "raid"; break;
    case "combo": pfKind = "combo"; break;
    case "sub": pfKind = "sub"; break;
    case "don": pfKind = "don"; break;
    case "boss": pfKind = "boss"; break;
    case "level": pfKind = "level"; break;
    default: pfKind = null; break;
  }

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  React.useEffect(() => {
    if (!pfKind) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const field = mountFieldFor(pfKind, canvas);
    return () => field.destroy();
  }, [pfKind]);

  let icon: React.ReactNode = null;
  let epic = false;
  let stage: React.ReactNode = null;
  let title: React.ReactNode = null;
  let sub: React.ReactNode = null;
  let value: React.ReactNode = null;
  let actions: React.ReactNode = null;

  switch (type) {
    case "raid": {
      const from = data?.from ?? null;
      const viewers = Number(data?.viewers ?? 0);
      icon = "⚔️";
      epic = true;
      stage = (
        <div className="lle-crowd">
          {RAID_STREAKS.map((s, i) => (
            <span key={`s${i}`} className="lle-speedline" style={{ top: s.top, ["--sdur" as any]: `${s.sdur}s`, ["--sdelay" as any]: `${s.sdelay}s` }} />
          ))}
          {RAID_RUNNERS.map((r, i) => (
            <span key={i} className="lle-runner" style={{ ["--b" as any]: `${r.b}px`, ["--o" as any]: r.o, ["--dur" as any]: `${r.dur}s`, ["--delay" as any]: `${r.delay}s` }}>
              <span className="lle-runner-d" style={{ ["--d" as any]: r.d }}>
                <span className="lle-runner-b"><Runner /></span>
              </span>
            </span>
          ))}
        </div>
      );
      title = <>Raid de <span className="lle-who">{from}</span></>;
      sub = "débarque avec sa communauté";
      value = <>+{viewers}<small>viewers</small></>;
      actions = <button className="lle-btn" disabled={ggClicked} onClick={handleGg}>Souhaiter la bienvenue 👋</button>;
      break;
    }

    case "follow":
    case "combo": {
      const who = data?.who ?? null;
      icon = combo ? "🔥" : "💙";
      epic = combo;
      stage = (
        <>
          <div className="lle-hearts">
            {Array.from({ length: 6 }).map((_, i) => (
              <i key={i} style={{ left: `${12 + i * 14}%`, animationDelay: `${i * .35}s` }}>{combo ? "⚡" : "💙"}</i>
            ))}
          </div>
          {combo ? (
            <div className="lle-combo-burst"><span className="lle-combo-x">COMBO {mult}x 🔥</span></div>
          ) : null}
        </>
      );
      title = combo ? `Combo follow ${mult}x` : "Nouveau follow";
      sub = <><b>{who}</b> {combo ? "enchaîne le combo !" : "vient de suivre la chaîne"}</>;
      actions = (
        <>
          <button className="lle-btn lle-ghost" disabled={ggClicked} onClick={handleGg}>GG !</button>
          <button className="lle-btn" disabled={allDisabled} onClick={() => handleCombo(mult)}>
            Combo {combo ? `${mult + 1}x` : ""} <span className="lle-k">tu follow aussi</span>
          </button>
        </>
      );
      break;
    }

    case "sub": {
      const who = data?.who ?? null;
      const months = Number(data?.months ?? 1);
      icon = "⭐";
      epic = true;
      stage = <div className="lle-crown"><span className="lle-c">👑</span></div>;
      title = <><span className="lle-who">{who}</span> s'abonne</>;
      sub = <>Palier {months} mois — merci pour le soutien</>;
      value = <>{months}<small>mois</small></>;
      actions = <button className="lle-btn lle-ghost" disabled={ggClicked} onClick={handleGg}>GG !</button>;
      break;
    }

    case "don": {
      const who = data?.who ?? null;
      const amount = Number(data?.amount ?? 0);
      icon = "💚";
      epic = true;
      stage = null;
      title = <><span className="lle-who">{who}</span> a fait un don</>;
      sub = data?.message ?? "« Continue comme ça, énorme ! »";
      value = <>{amount.toFixed(2).replace(".", ",")} €</>;
      actions = <button className="lle-btn lle-ghost" disabled={ggClicked} onClick={handleGg}>Remercier 💚</button>;
      break;
    }

    case "boss": {
      icon = "🔥";
      epic = true;
      stage = (
        <>
          <div className="lle-boss-scene"><span className="lle-skull">💀</span></div>
          <div className="lle-flames" />
        </>
      );
      title = "Boss vaincu !";
      sub = "La communauté a fait tomber le boss";
      value = <>×3<small>récompense</small></>;
      actions = <button className="lle-btn" disabled={ggClicked} onClick={handleGg}>Récupérer ma part 🏆</button>;
      break;
    }

    case "level": {
      const who = data?.who ?? null;
      const level = Number(data?.level ?? 1);
      icon = "⭐";
      epic = true;
      stage = <div className="lle-lvl-scene"><div className="lle-lvl-badge">{level}</div></div>;
      title = <><span className="lle-who">{who}</span> passe niveau {level}</>;
      sub = "Nouveau titre débloqué";
      actions = <button className="lle-btn lle-ghost" disabled={ggClicked} onClick={handleGg}>Bravo ! 🎉</button>;
      break;
    }

    default:
      // chest / rain / wheel / predict : gérés par ActiveEventsBar (barre
      // épinglée), pas comme carte de célébration dans le flux.
      return <></>;
  }

  return (
    <div className={`lle-ev lle-ev--${type}`} data-tier={epic ? "epic" : undefined}>
      {epic ? <div className="lle-flash" /> : null}
      {pfKind ? <canvas className="lle-pf" ref={canvasRef} /> : null}
      <div className="lle-ev__stage">{stage}</div>
      <div className="lle-ev__body">
        <div className="lle-ev__icon">{icon}</div>
        <div className="lle-ev__text">
          <div className="lle-ev__title">{title}</div>
          <div className="lle-ev__sub">{sub}</div>
        </div>
        {value ? <div className="lle-ev__value">{value}</div> : null}
      </div>
      <div className="lle-ev__actions">{actions}</div>
    </div>
  );
}
