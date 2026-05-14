// ─────────────────────────────────────────────────────────────────────────────
// V3SocialProof — bandeau "notification" social proof flottant en bas de page.
//
// Inspiré du pattern Stake/Mystake : "Sofiane a débloqué son freebet 40€".
// Cycle automatique de messages générés à partir d'une liste de prénoms FR.
// Discret mais visible. Renforce le FOMO et la confiance.
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";

export type V3SocialProofProps = {
  /** Montant du bonus à afficher (ex: "40€"). Si vide, défaut "bonus". */
  bonusAmount?: string;
  /** Accent theme (gold par défaut). */
  accent?: string;
  /** AccentGlow pour les effets. */
  accentGlow?: string;
  /** Intervalle entre 2 notifications (ms). Default 5500ms. */
  intervalMs?: number;
  /** Durée d'affichage de chaque notif (ms). Default 4000ms. */
  visibleMs?: number;
};

const NAMES = [
  "Sofiane", "Lucas", "Maxime", "Karim", "Léo", "Mehdi", "Théo", "Anthony",
  "Romain", "Yanis", "Thomas", "Jordan", "Nathan", "Hugo", "Adam", "Rayan",
  "Enzo", "Mathéo", "Noah", "Jules", "Sami", "Alex", "Pierre", "Antoine",
  "Julien", "Florent", "Bilal", "Aymeric", "Bastien", "Mickaël",
];

const VARIANTS = [
  (n: string, b: string) => `${n} a débloqué son bonus ${b}`,
  (n: string, b: string) => `${n} vient de récupérer ${b}`,
  (n: string, b: string) => `${n} a sécurisé son freebet ${b}`,
  (n: string, b: string) => `${n} vient de gagner ${b}`,
];

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateMessage(bonus: string): string {
  const name = pickRandom(NAMES);
  const variant = pickRandom(VARIANTS);
  return variant(name, bonus);
}

export function V3SocialProof({
  bonusAmount,
  accent = "#22c55e",
  accentGlow = "rgba(34,197,94,.4)",
  intervalMs = 5500,
  visibleMs = 4000,
}: V3SocialProofProps) {
  const [visible, setVisible] = React.useState(false);
  const [message, setMessage] = React.useState<string>("");
  const bonusLabel = bonusAmount && bonusAmount.trim() ? bonusAmount : "bonus";

  React.useEffect(() => {
    let mounted = true;
    let visibleTimer: number | undefined;
    let cycleTimer: number | undefined;

    const showOne = () => {
      if (!mounted) return;
      setMessage(generateMessage(bonusLabel));
      setVisible(true);
      visibleTimer = window.setTimeout(() => {
        if (!mounted) return;
        setVisible(false);
      }, visibleMs);
    };

    // Première notification après un délai initial pour ne pas spam le mount
    const initial = window.setTimeout(showOne, 2500);
    cycleTimer = window.setInterval(showOne, intervalMs + visibleMs / 2);

    return () => {
      mounted = false;
      window.clearTimeout(initial);
      if (visibleTimer) window.clearTimeout(visibleTimer);
      if (cycleTimer) window.clearInterval(cycleTimer);
    };
  }, [bonusLabel, intervalMs, visibleMs]);

  return (
    <div
      className={`v3sp-root ${visible ? "v3sp-visible" : ""}`}
      role="status"
      aria-live="polite"
      style={{
        ["--v3sp-accent" as any]: accent,
        ["--v3sp-glow" as any]: accentGlow,
      }}
    >
      <style>{`
        .v3sp-root{position:fixed;left:50%;bottom:18px;transform:translate(-50%,40px);max-width:min(94vw,360px);padding:10px 14px 10px 12px;background:rgba(8,12,22,.92);border:1px solid rgba(255,255,255,.08);border-radius:999px;backdrop-filter:blur(14px);box-shadow:0 12px 32px rgba(0,0,0,.6),0 0 24px var(--v3sp-glow);display:flex;align-items:center;gap:10px;font-family:'Inter',-apple-system,sans-serif;font-size:.78rem;color:rgba(248,250,252,.92);z-index:9990;opacity:0;transition:opacity .35s ease,transform .35s cubic-bezier(.34,1.56,.64,1);pointer-events:none}
        .v3sp-root.v3sp-visible{opacity:1;transform:translate(-50%,0)}
        .v3sp-dot{flex-shrink:0;width:8px;height:8px;border-radius:50%;background:var(--v3sp-accent);box-shadow:0 0 10px var(--v3sp-glow);animation:v3sp-pulse 1.4s ease-in-out infinite}
        .v3sp-msg{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:.01em}
        .v3sp-msg strong{color:var(--v3sp-accent);font-weight:700}
        @keyframes v3sp-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.35);opacity:.55}}
      `}</style>
      <span className="v3sp-dot" />
      <span className="v3sp-msg">{message}</span>
    </div>
  );
}
