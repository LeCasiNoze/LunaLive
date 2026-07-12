// web/src/pages/LevelUpDevPage.tsx
// Page de dev (non listée) pour JUGER l'animation de passage de niveau.
// À NETTOYER avant lancement (comme /dev/special-events).
import * as React from "react";
import { LevelUpPopup, type LevelUpData } from "../components/LevelUpPopup";

const TIER_LABELS = [
  "Bronze", "Argent", "Or", "Émeraude", "Saphir",
  "Améthyste", "Rubis", "Cyan", "Rose", "Légende",
];

export default function LevelUpDevPage(): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  const [data, setData] = React.useState<LevelUpData | null>(null);
  const [level, setLevel] = React.useState(12);
  const [tier, setTier] = React.useState(1);
  const [title, setTitle] = React.useState("Argent II");

  const trigger = () => {
    setData({ level, title, tier });
    setOpen(false);
    // re-mount pour rejouer l'anim + le son à chaque clic
    requestAnimationFrame(() => setOpen(true));
  };

  return (
    <div style={S.page}>
      <h1 style={S.h1}>⭐ Animation passage de niveau</h1>
      <p style={S.sub}>Page de test — juge l'animation + le son. (À nettoyer avant lancement.)</p>

      <div style={S.card}>
        <label style={S.row}><span style={S.lbl}>Niveau</span>
          <input type="number" value={level} min={1} max={100} onChange={(e) => setLevel(Number(e.target.value))} style={S.input} />
        </label>
        <label style={S.row}><span style={S.lbl}>Palier</span>
          <select value={tier} onChange={(e) => { const t = Number(e.target.value); setTier(t); setTitle(`${TIER_LABELS[t]} ${["I","II","III"][level % 3] || "I"}`); }} style={S.input}>
            {TIER_LABELS.map((l, i) => <option key={i} value={i}>{i} — {l}</option>)}
          </select>
        </label>
        <label style={S.row}><span style={S.lbl}>Titre</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={S.input} />
        </label>
        <button style={S.btn} onClick={trigger}>🎉 Déclencher l'animation</button>
        <p style={S.hint}>Le son se joue au clic (Web Audio, aucun asset). Clique n'importe où sur l'overlay pour fermer.</p>
      </div>

      <LevelUpPopup open={open} data={data} onClose={() => setOpen(false)} />
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#0a0713", color: "rgba(235,232,255,.92)", padding: "40px 24px", fontFamily: "system-ui, sans-serif", display: "flex", flexDirection: "column", alignItems: "center" },
  h1: { fontSize: 24, fontWeight: 800, margin: 0 },
  sub: { fontSize: 13, opacity: .6, margin: "6px 0 24px" },
  card: { width: "min(420px, 100%)", borderRadius: 16, border: "1px solid rgba(124,92,252,.2)", background: "rgba(20,15,32,.7)", padding: 20, display: "flex", flexDirection: "column", gap: 12 },
  row: { display: "flex", alignItems: "center", gap: 12 },
  lbl: { fontSize: 13, opacity: .7, minWidth: 60 },
  input: { flex: 1, height: 38, borderRadius: 9, background: "rgba(0,0,0,.3)", color: "inherit", border: "1px solid rgba(124,92,252,.2)", padding: "0 10px", fontSize: 14 },
  btn: { height: 46, marginTop: 6, borderRadius: 12, border: "1px solid rgba(124,92,252,.4)", background: "linear-gradient(135deg, rgba(124,92,252,.4), rgba(91,142,248,.25))", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer" },
  hint: { fontSize: 11.5, opacity: .5, margin: "4px 0 0", lineHeight: 1.5 },
};
