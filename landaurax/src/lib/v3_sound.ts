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

export const sfx = {
  click: () => tone(880, 50, { type: "square", gain: 0.08 }),
  spin: (durMs = 4000) => noise(durMs, 0.04, 800, { sweepTo: 200 }),
  wheelTicks: (durMs: number) => {
    const c = ctx();
    if (!c) return;
    let elapsed = 0;
    const tick = () => {
      if (elapsed >= durMs) return;
      const progress = elapsed / durMs;
      const gainNow = 0.022 + (1 - progress) * 0.022;
      const pitch = 380 - progress * 140;
      tone(pitch, 22, { type: "sine", gain: gainNow });
      const delay = 60 + Math.pow(progress, 2.2) * 980;
      elapsed += delay;
      setTimeout(tick, delay);
    };
    tick();
  },
  tick: () => tone(1200, 25, { type: "square", gain: 0.06 }),
  reelStop: () => {
    tone(120, 80, { type: "triangle", gain: 0.18 });
    tone(220, 60, { type: "square", gain: 0.08, delayMs: 30 });
  },
  tension: (durMs = 1500) => {
    tone(220, durMs, { type: "sawtooth", gain: 0.06, sweepTo: 880 });
    noise(durMs, 0.03, 600, { sweepTo: 2400 });
  },
  reveal: () => {
    tone(880, 80, { type: "triangle", gain: 0.15 });
    tone(1320, 100, { type: "triangle", gain: 0.10, delayMs: 60 });
  },
  win: () => {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => tone(f, 220, { type: "triangle", gain: 0.18, delayMs: i * 90 }));
    tone(2093, 300, { type: "sine", gain: 0.10, delayMs: 360 });
  },
  loss: () => {
    tone(440, 200, { type: "triangle", gain: 0.12, sweepTo: 220 });
  },
  boom: () => {
    noise(400, 0.25, 200);
    tone(80, 200, { type: "sawtooth", gain: 0.20, sweepTo: 30 });
  },
  coin: () => {
    tone(1318, 60, { type: "sine", gain: 0.12 });
    tone(1568, 80, { type: "sine", gain: 0.10, delayMs: 50 });
  },
  scratch: () => noise(80, 0.06, 3000),
};
