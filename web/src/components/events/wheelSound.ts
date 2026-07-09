// Effet sonore de la roue, 100% synthétisé (Web Audio) — pas d'asset à charger.
// Une série de "ticks" qui ralentissent sur toute la durée du spin (comme le
// clapet d'une vraie roue), puis un "ding" final. Silencieux si l'audio n'est
// pas dispo (navigateur, autoplay bloqué) — jamais d'erreur remontée.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

function tick(ac: AudioContext, at: number) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = "square";
  o.frequency.value = 1150;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(0.09, at + 0.001);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.028);
  o.connect(g);
  g.connect(ac.destination);
  o.start(at);
  o.stop(at + 0.035);
}

function ding(ac: AudioContext, at: number) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(1320, at);
  o.frequency.exponentialRampToValueAtTime(880, at + 0.18);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(0.22, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.55);
  o.connect(g);
  g.connect(ac.destination);
  o.start(at);
  o.stop(at + 0.6);
}

// Doit être appelé depuis un geste utilisateur (clic sur "Tourner") pour que
// l'AudioContext démarre. `durationMs` = durée totale de la rotation.
export function playSpinSound(durationMs: number) {
  const ac = getCtx();
  if (!ac) return;
  const start = ac.currentTime + 0.01;
  const total = durationMs / 1000;
  const end = start + total;
  let t = start;
  let guard = 0;
  // Intervalle entre ticks : très court au début, croît en fin (ralentissement
  // façon roue). progress² accentue le suspens sur la dernière portion.
  while (t < end && guard < 400) {
    tick(ac, t);
    const progress = (t - start) / total;
    const interval = 0.028 + progress * progress * 0.28; // ~28ms -> ~300ms
    t += interval;
    guard++;
  }
  ding(ac, end);
}
