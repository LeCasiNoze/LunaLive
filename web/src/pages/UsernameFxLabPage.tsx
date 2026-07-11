// Laboratoire des pseudos animés moteur (PixiJS+GSAP) — /dev/username-effects
// Page utilitaire non listée : itération/validation AVANT toute intégration
// au chat. Pseudo libre + presets, effet, qualité, intensité, pause/restart,
// fonds multiples, N instances simultanées, FPS + compteurs de fuites.
import { useEffect, useState } from "react";
import AnimatedUsername from "../fx/username/AnimatedUsername";
import type { FxQuality, FxRarity } from "../fx/username/types";

const PRESETS = ["Zoé", "LeCasiNoze", "Xx_Dark_Sasuke_du_93_xX", "🔥LunaFan🔥"];
const BGS: { id: string; label: string; css: React.CSSProperties }[] = [
  { id: "chat", label: "Chat sombre", css: { background: "#0b0b12" } },
  { id: "card", label: "Carte", css: { background: "linear-gradient(150deg, #171528, #0d0c16)" } },
  { id: "light", label: "Clair", css: { background: "#e5e7eb" } },
  {
    id: "damier",
    label: "Damier",
    css: {
      background:
        "repeating-conic-gradient(#26262e 0% 25%, #16161c 0% 50%) 0 0 / 24px 24px",
    },
  },
];

type EffectMeta = { id: string; label: string; rarity: string; loopSeconds?: number };

export default function UsernameFxLabPage() {
  const [effects, setEffects] = useState<EffectMeta[]>([]);
  const [username, setUsername] = useState("LeCasiNoze");
  const [effectId, setEffectId] = useState("garden-of-ashes");
  const [quality, setQuality] = useState<FxQuality>("high");
  const [intensity, setIntensity] = useState(1);
  const [size, setSize] = useState(26);
  const [paused, setPaused] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [bg, setBg] = useState("chat");
  const [count, setCount] = useState(1);
  const [stats, setStats] = useState({ fps: 0, instances: 0, particles: 0 });

  useEffect(() => {
    let alive = true;
    (async () => {
      const mod = await import("../fx/username/mount");
      if (!alive) return;
      setEffects(
        mod.listEffects().map((e) => ({
          id: e.id,
          label: e.label,
          rarity: e.rarity,
          loopSeconds: e.loopSeconds,
        })),
      );
    })();
    const iv = setInterval(async () => {
      try {
        const mod = await import("../fx/username/mount");
        const s = await mod.getFxStats();
        if (alive) setStats(s);
      } catch {
        /* moteur pas encore chargé */
      }
    }, 500);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);

  const bgCss = BGS.find((b) => b.id === bg)?.css ?? BGS[0].css;
  const meta = effects.find((e) => e.id === effectId);

  return (
    <main className="container" style={{ maxWidth: 900, display: "grid", gap: 14, paddingBottom: 60 }}>
      <div>
        <h1 style={{ margin: "18px 0 4px", fontSize: 24 }}>🧪 Labo pseudos animés</h1>
        <p style={{ margin: 0, opacity: 0.7, fontSize: 13 }}>
          Moteur PixiJS + GSAP. Page dev non listée — rien ici ne touche le chat.
        </p>
      </div>

      {/* Contrôles */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", fontSize: 13 }}>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={{
            background: "rgba(0,0,0,0.35)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 10,
            color: "#e5e7eb",
            padding: "8px 12px",
            fontSize: 14,
            minWidth: 200,
          }}
        />
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => setUsername(p)}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "#cbd5e1", cursor: "pointer", fontSize: 12 }}
          >
            {p}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", fontSize: 13 }}>
        <select value={effectId} onChange={(e) => setEffectId(e.target.value)} style={{ padding: "8px 10px", borderRadius: 10, background: "rgba(0,0,0,0.35)", color: "#e5e7eb", border: "1px solid rgba(255,255,255,0.15)" }}>
          {effects.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label} ({e.rarity}{e.loopSeconds ? ` · ${e.loopSeconds}s` : ""})
            </option>
          ))}
        </select>
        <select value={quality} onChange={(e) => setQuality(e.target.value as FxQuality)} style={{ padding: "8px 10px", borderRadius: 10, background: "rgba(0,0,0,0.35)", color: "#e5e7eb", border: "1px solid rgba(255,255,255,0.15)" }}>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
        </select>
        <label>
          intensité {intensity.toFixed(1)}
          <input type="range" min={0.2} max={1} step={0.1} value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} />
        </label>
        <label>
          taille {size}px
          <input type="range" min={14} max={48} step={2} value={size} onChange={(e) => setSize(Number(e.target.value))} />
        </label>
        <label>
          instances {count}
          <input type="range" min={1} max={50} step={1} value={count} onChange={(e) => setCount(Number(e.target.value))} />
        </label>
        <button onClick={() => setPaused((p) => !p)} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.15)", background: paused ? "rgba(74,222,128,0.15)" : "rgba(255,255,255,0.06)", color: "#e5e7eb", cursor: "pointer" }}>
          {paused ? "▶ Lire" : "⏸ Pause"}
        </button>
        <button onClick={() => setNonce((x) => x + 1)} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "#e5e7eb", cursor: "pointer" }}>
          ⟲ Restart
        </button>
        <span style={{ display: "flex", gap: 6 }}>
          {BGS.map((b) => (
            <button key={b.id} onClick={() => setBg(b.id)} style={{ padding: "6px 10px", borderRadius: 8, border: bg === b.id ? "1px solid #a78bfa" : "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "#cbd5e1", cursor: "pointer", fontSize: 12 }}>
              {b.label}
            </button>
          ))}
        </span>
      </div>

      {/* Stats */}
      <div style={{ fontSize: 12, fontFamily: "monospace", opacity: 0.8 }} data-fx-stats>
        FPS {stats.fps} · instances {stats.instances} · particules vivantes {stats.particles}
        {meta ? ` · boucle ~${meta.loopSeconds ?? "?"}s` : ""}
      </div>

      {/* Scène */}
      <div
        data-fx-scene
        style={{
          ...bgCss,
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.1)",
          padding: "26px 18px",
          display: "flex",
          flexDirection: "column",
          gap: 18,
          alignItems: "center",
          minHeight: 220,
          justifyContent: "center",
        }}
      >
        {Array.from({ length: count }, (_, i) => (
          <AnimatedUsername
            key={`${nonce}-${i}-${effectId}-${username}-${quality}-${size}`}
            username={username}
            effectId={effectId}
            rarity={(meta?.rarity as FxRarity) ?? "mythic"}
            context="lab"
            intensity={intensity}
            quality={quality}
            size={size}
            paused={paused}
          />
        ))}
      </div>
    </main>
  );
}
