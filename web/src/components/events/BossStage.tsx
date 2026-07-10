// Vitrine 3D du boss — enveloppe légère importée par EventPage. La scène r3f
// (three.js) est chargée en lazy pour rester hors du bundle principal ; si
// WebGL est indisponible ou si l'utilisateur a demandé "moins d'animations",
// on tombe sur un poster CSS statique. La couche confetti (braises/débris)
// est en 2D par-dessus le canvas et se déclenche AU MOMENT de l'impact de
// chaque arme (délai synchronisé avec l'animation 3D).
import React from "react";
import confetti from "canvas-confetti";
import { ATTACK_IMPACT_DELAY, type BossWeaponAnim } from "./boss3d/weapons";

const BossScene = React.lazy(() => import("./boss3d/BossScene"));

export type BossStageProps = {
  hpPct: number; // 0..1
  killed: boolean;
  expired: boolean;
  attackSeq: number;
  attackType: BossWeaponAnim;
  attackPower: number;
  /** Incrémente pour rejouer la cinématique de mort (mode entraînement). */
  deathReplaySeq?: number;
  /** Boss vaincu : compte à rebours des récompenses, affiché sur la scène. */
  rewardCountdown?: string;
};

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (c.getContext("webgl") || c.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

// Mobile / GPU faible → qualité réduite (moins de particules, bloom allégé,
// pixel-ratio plafonné) pour ne jamais faire ramer un téléphone.
function detectQuality(): "high" | "low" {
  try {
    const coarse = window.matchMedia?.("(pointer: coarse)")?.matches;
    const narrow = typeof window !== "undefined" && window.innerWidth < 768;
    const cores = navigator.hardwareConcurrency || 8;
    const mem = (navigator as any).deviceMemory as number | undefined;
    if (coarse || narrow || cores <= 4 || (mem != null && mem <= 4)) return "low";
  } catch {
    /* noop */
  }
  return "high";
}

const HIT_COLORS = ["#ff5a1f", "#ff9d4d", "#ffd08a", "#a78bfa", "#ffffff"];
const GOLD_COLORS = ["#ffd08a", "#fde68a", "#fff3d0", "#f59e0b", "#ffb066"];
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function BossPoster({ killed, expired }: Pick<BossStageProps, "killed" | "expired">) {
  const state = killed ? "killed" : expired ? "expired" : "alive";
  return (
    <div className={`evBossPoster evBossPoster--${state}`} aria-hidden="true">
      <div className="evBossPosterOrb" />
      <div className="evBossPosterRing" />
    </div>
  );
}

export default function BossStage(props: BossStageProps) {
  const { attackSeq, attackType, attackPower, killed } = props;
  const reduce = React.useMemo(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );
  const webgl = React.useMemo(() => hasWebGL(), []);
  const quality = React.useMemo(() => detectQuality(), []);
  const use3D = webgl && !reduce;

  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const fireRef = React.useRef<ReturnType<typeof confetti.create> | null>(null);

  React.useEffect(() => {
    if (!use3D || !canvasRef.current) return;
    const inst = confetti.create(canvasRef.current, { resize: true, useWorker: true });
    fireRef.current = inst;
    return () => {
      inst.reset();
      fireRef.current = null;
    };
  }, [use3D]);

  // Gerbe de braises synchronisée avec l'impact de l'arme.
  React.useEffect(() => {
    if (!use3D || attackSeq <= 0 || !fireRef.current) return;
    const fire = fireRef.current;
    const delay = (ATTACK_IMPACT_DELAY[attackType] ?? 0.3) * 1000;
    const p = clamp01(attackPower);
    const orbital = attackType === "orbital";
    const id = setTimeout(() => {
      fire({
        particleCount: Math.round(18 + p * 90),
        spread: orbital ? 130 : 60 + p * 40,
        startVelocity: orbital ? 48 : 26 + p * 16,
        origin: { x: 0.5, y: orbital ? 0.12 : 0.52 },
        colors: HIT_COLORS,
        scalar: orbital ? 1.2 : 0.9,
        ticks: orbital ? 200 : 100,
        gravity: 1,
        decay: 0.92,
      });
    }, delay);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attackSeq]);

  // Célébration de la mise à mort : au moment où la cinématique atteint
  // l'explosion (~1.6s), triple burst de confetti (feu puis or) + overlay
  // "BOSS VAINCU !". Partagée entre la transition live et le replay.
  const [victory, setVictory] = React.useState(false);
  const celebrate = React.useCallback(() => {
    const fire = fireRef.current;
    if (!fire) return [] as number[];
    const timers: number[] = [];
    timers.push(
      window.setTimeout(() => {
        fire({
          particleCount: 170,
          spread: 160,
          startVelocity: 46,
          origin: { x: 0.5, y: 0.46 },
          colors: HIT_COLORS,
          scalar: 1.15,
          ticks: 220,
        });
        setVictory(true);
      }, 1600)
    );
    timers.push(
      window.setTimeout(() => {
        fire({
          particleCount: 120,
          spread: 100,
          startVelocity: 52,
          origin: { x: 0.5, y: 0.62 },
          colors: GOLD_COLORS,
          scalar: 1.05,
          ticks: 240,
        });
      }, 1950)
    );
    timers.push(
      window.setTimeout(() => {
        fire({
          particleCount: 70,
          spread: 70,
          startVelocity: 34,
          angle: 60,
          origin: { x: 0.08, y: 0.85 },
          colors: GOLD_COLORS,
          scalar: 0.95,
          ticks: 200,
        });
        fire({
          particleCount: 70,
          spread: 70,
          startVelocity: 34,
          angle: 120,
          origin: { x: 0.92, y: 0.85 },
          colors: GOLD_COLORS,
          scalar: 0.95,
          ticks: 200,
        });
      }, 2300)
    );
    timers.push(window.setTimeout(() => setVictory(false), 5400));
    return timers;
  }, []);

  // Replay manuel de la mise à mort (mode entraînement).
  const { deathReplaySeq } = props;
  React.useEffect(() => {
    if (!use3D || !deathReplaySeq || deathReplaySeq <= 0) return;
    setVictory(false);
    const timers = celebrate();
    return () => timers.forEach((t) => clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deathReplaySeq]);

  // Mise à mort en direct — uniquement sur la transition vivant→mort
  // (pas de feux d'artifice pour un visiteur arrivant boss déjà tombé).
  const prevKilledRef = React.useRef(killed);
  React.useEffect(() => {
    const wasKilled = prevKilledRef.current;
    prevKilledRef.current = killed;
    if (!use3D || !killed || wasKilled) return;
    const timers = celebrate();
    return () => timers.forEach((t) => clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [killed]);

  return (
    <div className={`evBossStage${killed ? " isKilled" : ""}${props.expired && !killed ? " isExpired" : ""}`}>
      <div className="evBossStageGlow" aria-hidden="true" />
      {use3D ? (
        <React.Suspense fallback={<BossPoster {...props} />}>
          <BossScene {...props} quality={quality} />
        </React.Suspense>
      ) : (
        <BossPoster {...props} />
      )}
      {use3D ? <canvas ref={canvasRef} className="evBossConfetti" aria-hidden="true" /> : null}
      {props.rewardCountdown && !victory ? (
        <div className="evBossRewardChip">🏆 Boss vaincu — {props.rewardCountdown}</div>
      ) : null}
      {victory ? (
        <div className="evBossVictory" aria-hidden="true">
          <span className="evBossVictoryTitle">🏆 BOSS VAINCU !</span>
          <span className="evBossVictorySub">GG à toute la commu 💜 Récompenses à la clôture</span>
        </div>
      ) : null}
    </div>
  );
}
