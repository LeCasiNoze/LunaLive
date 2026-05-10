// ─────────────────────────────────────────────────────────────────────────────
// V3 Sound — petite lib Web Audio pour les modèles M3-M6.
//
// Pas de fichiers audio (zero asset shipping). Tout est synthétisé via
// OscillatorNode + GainNode pour des sons courts (clic, ding, spin, win).
// AudioContext lazy-init au premier appel (Chrome/Safari requièrent un user
// gesture, donc on n'instancie qu'au premier click utilisateur).
// ─────────────────────────────────────────────────────────────────────────────

let _ctx: AudioContext | null = null;
let _muted = false;

function ctx(): AudioContext | null {
  if (_muted) return null;
  if (typeof window === "undefined") return null;
  if (_ctx) return _ctx;
  try {
    const C: any = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!C) return null;
    _ctx = new C();
    return _ctx;
  } catch {
    return null;
  }
}

export function setMuted(m: boolean) { _muted = m; }
export function isMuted() { return _muted; }

function tone(freq: number, durMs: number, opts?: { type?: OscillatorType; gain?: number; sweepTo?: number; delayMs?: number }) {
  const c = ctx();
  if (!c) return;
  const t0 = c.currentTime + (opts?.delayMs || 0) / 1000;
  const dur = durMs / 1000;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = opts?.type || "sine";
  osc.frequency.setValueAtTime(freq, t0);
  if (opts?.sweepTo) osc.frequency.exponentialRampToValueAtTime(opts.sweepTo, t0 + dur);
  const peak = Math.min(0.4, opts?.gain ?? 0.18);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(durMs: number, gain = 0.08, lowPass = 1500, opts?: { delayMs?: number; sweepTo?: number }) {
  const c = ctx();
  if (!c) return;
  const t0 = c.currentTime + (opts?.delayMs || 0) / 1000;
  const dur = durMs / 1000;
  const buffer = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(lowPass, t0);
  if (opts?.sweepTo) filter.frequency.exponentialRampToValueAtTime(opts.sweepTo, t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(g).connect(c.destination);
  src.start(t0);
  src.stop(t0 + dur);
}

// ─── Effets exposés ─────────────────────────────────────────────────────────

export const sfx = {
  /** Click générique sur bouton */
  click: () => tone(880, 50, { type: "square", gain: 0.08 }),

  /** Spin/whir : noise + sweep — pour roue qui tourne */
  spin: (durMs = 4000) => noise(durMs, 0.04, 800, { sweepTo: 200 }),

  /** Wheel ticks décélérants — clic mécanique de la roue qui ralentit
   *  progressivement (curve quadratique = match cubic-bezier visuel). */
  wheelTicks: (durMs: number) => {
    const c = ctx();
    if (!c) return;
    let elapsed = 0;
    const tick = () => {
      if (elapsed >= durMs) return;
      // Click court "clack" mécanique
      tone(1100, 18, { type: "square", gain: 0.10 });
      tone(420, 15, { type: "triangle", gain: 0.06, delayMs: 5 });
      const progress = elapsed / durMs;
      // Délai croît avec progress² → ticks denses au début, espacés à la fin
      const delay = 30 + Math.pow(progress, 2.2) * 580;
      elapsed += delay;
      setTimeout(tick, delay);
    };
    tick();
  },

  /** Ticktack régulier (slot) */
  tick: () => tone(1200, 25, { type: "square", gain: 0.06 }),

  /** Stop reel — clunk grave */
  reelStop: () => {
    tone(120, 80, { type: "triangle", gain: 0.18 });
    tone(220, 60, { type: "square", gain: 0.08, delayMs: 30 });
  },

  /** Tension — fréquence montante longue (build-up suspense) */
  tension: (durMs = 1500) => {
    tone(220, durMs, { type: "sawtooth", gain: 0.06, sweepTo: 880 });
    noise(durMs, 0.03, 600, { sweepTo: 2400 });
  },

  /** Reveal sparkle (carte qui se retourne) */
  reveal: () => {
    tone(880, 80, { type: "triangle", gain: 0.15 });
    tone(1320, 100, { type: "triangle", gain: 0.10, delayMs: 60 });
  },

  /** Win fanfare — arpeggio montant majeur (Do-Mi-Sol-Do) */
  win: () => {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => tone(f, 220, { type: "triangle", gain: 0.18, delayMs: i * 90 }));
    // Sparkle finish
    tone(2093, 300, { type: "sine", gain: 0.10, delayMs: 360 });
  },

  /** Loss / déception — descente */
  loss: () => {
    tone(440, 200, { type: "triangle", gain: 0.12, sweepTo: 220 });
  },

  /** Boom (M6 bombe) */
  boom: () => {
    noise(400, 0.25, 200);
    tone(80, 200, { type: "sawtooth", gain: 0.20, sweepTo: 30 });
  },

  /** Coin drop / collect */
  coin: () => {
    tone(1318, 60, { type: "sine", gain: 0.12 });
    tone(1568, 80, { type: "sine", gain: 0.10, delayMs: 50 });
  },

  /** Scratch (frottement) */
  scratch: () => noise(80, 0.06, 3000),
};
