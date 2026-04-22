import * as React from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SponsorBannerStyle =
  | "dark"          // fond sombre + bordure violet (référence)
  | "frosted"       // glassmorphism blur
  | "neon_border"   // bordure néon pulsée
  | "minimal"       // ligne de bas seulement
  | "transparent";  // texte nu, zéro fond

export type SponsorAnimStyle =
  | "stagger_up"    // lettres montent en stagger
  | "cascade"       // lettres tombent du haut en stagger
  | "roll"          // lettres remontent depuis leur masque (clip)
  | "glide"         // bloc entier glisse depuis la droite
  | "zoom"          // zoom avant → taille normale
  | "fade_word"     // mot par mot en fondu
  | "random";       // style aléatoire à chaque message

export type SponsorConfig = {
  enabled: boolean;
  command: string;          // ex: "!BONUS"
  commandLabel: string;     // ex: "Fait cette commande dans le chat"
  messages: string[];       // textes qui tournent
  bannerStyle: SponsorBannerStyle;
  animStyle: SponsorAnimStyle;
  interval: number;         // secondes entre chaque message
  x: number; y: number; w: number; h: number; // % du canvas
  // Tailles (px, calibrées 1920×1080 — CSS transform:scale les adapte au preview)
  textSize?: number;      // police message principal  (défaut 40)
  leftWidth?: number;     // largeur section gauche     (défaut 160)
  commandSize?: number;   // police bouton commande     (défaut 16)
  labelSize?: number;     // police label au-dessus     (défaut 11)
  gap?: number;           // espacement container       (défaut 20)
};

export const SPONSOR_BANNER_STYLES: Array<{ id: SponsorBannerStyle; label: string }> = [
  { id: "dark",        label: "Dark premium (fond sombre + bordure violet)" },
  { id: "frosted",     label: "Frosted glass (blur + transparence)" },
  { id: "neon_border", label: "Bordure néon pulsée" },
  { id: "minimal",     label: "Minimal (ligne inférieure seulement)" },
  { id: "transparent", label: "Transparent (texte seul)" },
];

export const SPONSOR_ANIM_STYLES: Array<{ id: SponsorAnimStyle; label: string }> = [
  { id: "random",     label: "🎲 Aléatoire — change à chaque message" },
  { id: "stagger_up", label: "Stagger up — lettres montent une par une" },
  { id: "cascade",    label: "Cascade — lettres tombent du haut" },
  { id: "roll",       label: "Roll — lettres remontent depuis leur masque" },
  { id: "glide",      label: "Glide — bloc glisse depuis la droite" },
  { id: "zoom",       label: "Zoom burst — grossit puis se pose" },
  { id: "fade_word",  label: "Fade mot par mot" },
];

export function defaultSponsor(): SponsorConfig {
  return {
    enabled: false,
    command: "!BONUS",
    commandLabel: "Fait cette commande dans le chat",
    messages: ["WAGER NON STICKY", "RETRAIT RAPIDE", "10% CASHBACK"],
    bannerStyle: "dark",
    animStyle: "stagger_up",
    interval: 4,
    x: 5, y: 87, w: 90, h: 11,
  };
}

// ─── CSS keyframes (injected once) ────────────────────────────────────────────

const KEYFRAMES = `
@keyframes sb-enter-up      { from { opacity:0; transform:translateY(18px)  } to { opacity:1; transform:translateY(0)     } }
@keyframes sb-exit-up       { from { opacity:1; transform:translateY(0)     } to { opacity:0; transform:translateY(-12px) } }
@keyframes sb-enter-cascade { from { opacity:0; transform:translateY(-22px) } to { opacity:1; transform:translateY(0)     } }
@keyframes sb-exit-cascade  { from { opacity:1; transform:translateY(0)     } to { opacity:0; transform:translateY(14px)  } }
@keyframes sb-enter-roll    { from { transform:translateY(105%)             } to { transform:translateY(0)                } }
@keyframes sb-exit-roll     { from { transform:translateY(0)                } to { transform:translateY(-105%)            } }
@keyframes sb-enter-glide   { from { opacity:0; transform:translateX(55px)  } to { opacity:1; transform:translateX(0)    } }
@keyframes sb-exit-glide    { from { opacity:1; transform:translateX(0)     } to { opacity:0; transform:translateX(-40px) } }
@keyframes sb-enter-zoom    { from { opacity:0; transform:scale(1.5)        } to { opacity:1; transform:scale(1)          } }
@keyframes sb-exit-zoom     { from { opacity:1; transform:scale(1)          } to { opacity:0; transform:scale(0.65)       } }
@keyframes sb-enter-fade    { from { opacity:0 } to { opacity:1 } }
@keyframes sb-exit-fade     { from { opacity:1 } to { opacity:0 } }
@keyframes sb-flicker {
  0%{opacity:0} 12%{opacity:.95} 22%{opacity:.05} 38%{opacity:1}
  52%{opacity:.15} 65%{opacity:1} 80%{opacity:.7} 100%{opacity:1}
}
@keyframes sb-neon-pulse {
  0%,100% { box-shadow: 0 0 8px 1px rgba(139,92,246,.55), inset 0 0 8px rgba(139,92,246,.08); }
  50%     { box-shadow: 0 0 22px 5px rgba(139,92,246,.9),  inset 0 0 16px rgba(139,92,246,.18); }
}
`;

let _kfInjected = false;
function ensureKeyframes() {
  if (_kfInjected) return;
  const s = document.createElement("style");
  s.textContent = KEYFRAMES;
  document.head.appendChild(s);
  _kfInjected = true;
}

// ─── Animation config per style ───────────────────────────────────────────────

type RealAnimStyle = Exclude<SponsorAnimStyle, "random">;
const REAL_ANIM_STYLES: RealAnimStyle[] = ["stagger_up", "cascade", "roll", "glide", "zoom", "fade_word"];

function pickRandom(): RealAnimStyle {
  return REAL_ANIM_STYLES[Math.floor(Math.random() * REAL_ANIM_STYLES.length)];
}

const ENTER_ANIM: Record<RealAnimStyle, string> = {
  stagger_up: "sb-enter-up",
  cascade:    "sb-enter-cascade",
  roll:       "sb-enter-roll",
  glide:      "sb-enter-glide",
  zoom:       "sb-enter-zoom",
  fade_word:  "sb-enter-fade",
};
const EXIT_ANIM: Record<RealAnimStyle, string> = {
  stagger_up: "sb-exit-up",
  cascade:    "sb-exit-cascade",
  roll:       "sb-exit-roll",
  glide:      "sb-exit-glide",
  zoom:       "sb-exit-zoom",
  fade_word:  "sb-exit-fade",
};
const ENTER_DUR: Record<RealAnimStyle, number> = {
  stagger_up: 520, cascade: 520, roll: 520,
  glide: 480, zoom: 440, fade_word: 600,
};
const EXIT_DUR = 320;

// ─── Message cycle hook ────────────────────────────────────────────────────────

type Phase = "enter" | "hold" | "exit";

// Coerce les configs stockées avec un style retiré (ex: "flicker" legacy) vers un fallback safe.
function normalizeStyle(style: SponsorAnimStyle | string | undefined): SponsorAnimStyle {
  if (style === "random") return "random";
  if (REAL_ANIM_STYLES.includes(style as RealAnimStyle)) return style as RealAnimStyle;
  return "stagger_up";
}

function useMessageCycle(messages: string[], intervalSecs: number, rawConfigStyle: SponsorAnimStyle) {
  const configStyle = normalizeStyle(rawConfigStyle);
  const [idx, setIdx]     = React.useState(0);
  const [phase, setPhase] = React.useState<Phase>("enter");
  // resolved = style concret en cours (jamais "random")
  const resolvedRef = React.useRef<RealAnimStyle>(
    configStyle === "random" ? pickRandom() : configStyle as RealAnimStyle
  );

  // Si le style config change (hors random), sync immédiat
  React.useEffect(() => {
    if (configStyle !== "random") resolvedRef.current = configStyle as RealAnimStyle;
  }, [configStyle]);

  React.useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    if (phase === "enter") {
      t = setTimeout(() => setPhase("hold"), ENTER_DUR[resolvedRef.current] + 100);
    } else if (phase === "hold") {
      t = setTimeout(() => setPhase("exit"), Math.max(intervalSecs * 1000, 1500));
    } else {
      t = setTimeout(() => {
        // Nouveau style aléatoire à chaque changement de message
        if (configStyle === "random") resolvedRef.current = pickRandom();
        setIdx(i => (i + 1) % messages.length);
        setPhase("enter");
      }, EXIT_DUR + 50);
    }
    return () => clearTimeout(t);
  }, [phase, intervalSecs, messages.length, configStyle]);

  return { idx, text: messages[idx], phase, resolvedAnimStyle: resolvedRef.current };
}

// ─── Animated text ────────────────────────────────────────────────────────────

const PER_CHAR_STYLES: SponsorAnimStyle[] = ["stagger_up", "cascade", "roll"];
const PER_WORD_STYLES: SponsorAnimStyle[] = ["fade_word"];
const EASE = "cubic-bezier(0.22,1,0.36,1)";

function AnimatedText({ text, phase, animStyle }: {
  text: string; phase: Phase; animStyle: RealAnimStyle;
}) {
  const enterAnim = ENTER_ANIM[animStyle];
  const exitAnim  = EXIT_ANIM[animStyle];
  const enterDur  = ENTER_DUR[animStyle];

  const charStyle = (i: number): React.CSSProperties =>
    phase === "hold"
      ? { display: "inline-block", opacity: 1 }
      : {
          display: "inline-block",
          animation: phase === "exit"
            ? `${exitAnim} ${EXIT_DUR}ms ease-in both`
            : `${enterAnim} ${enterDur}ms ${EASE} both`,
          animationDelay: phase === "enter" ? `${i * 28}ms` : "0ms",
        };

  const wordStyle = (i: number): React.CSSProperties =>
    phase === "hold"
      ? { display: "inline-block", marginRight: "0.28em", opacity: 1 }
      : {
          display: "inline-block",
          marginRight: "0.28em",
          animation: phase === "exit"
            ? `${exitAnim} ${EXIT_DUR}ms ease-in both`
            : `${enterAnim} ${enterDur}ms ${EASE} both`,
          animationDelay: phase === "enter" ? `${i * 85}ms` : "0ms",
        };

  const blockStyle: React.CSSProperties =
    phase === "hold"
      ? { display: "inline-block", opacity: 1 }
      : {
          display: "inline-block",
          animation: phase === "exit"
            ? `${exitAnim} ${EXIT_DUR}ms ease-in both`
            : `${enterAnim} ${enterDur}ms ${EASE} both`,
        };

  // ── Per-character
  if (PER_CHAR_STYLES.includes(animStyle)) {
    const isRoll = animStyle === "roll";
    return (
      <span>
        {text.split("").map((ch, i) =>
          ch === " "
            ? <span key={i} style={{ display: "inline-block", width: "0.32em" }}>&nbsp;</span>
            : isRoll
              ? (
                // roll: clip each char via overflow:hidden on wrapper
                <span key={i} style={{ display: "inline-block", overflow: "hidden", lineHeight: 1.1, verticalAlign: "bottom" }}>
                  <span style={charStyle(i)}>{ch}</span>
                </span>
              )
              : <span key={i} style={charStyle(i)}>{ch}</span>
        )}
      </span>
    );
  }

  // ── Per-word
  if (PER_WORD_STYLES.includes(animStyle)) {
    return (
      <span>
        {text.split(" ").map((w, i) => (
          <span key={i} style={wordStyle(i)}>{w}</span>
        ))}
      </span>
    );
  }

  // ── Whole block
  return <span style={blockStyle}>{text}</span>;
}

// ─── Banner container styles ───────────────────────────────────────────────────

// Toutes les tailles en px calibrées pour 1920×1080.
// Le preview canvas utilise CSS transform:scale() → les px scalent correctement.
// Les vw ne scalent PAS avec transform → éviter absolument.
function bannerContainerStyle(bs: SponsorBannerStyle): React.CSSProperties {
  const base: React.CSSProperties = {
    position: "absolute",
    display: "flex",
    alignItems: "center",
    padding: "0 28px",
    gap: "20px",
    overflow: "hidden",
  };
  switch (bs) {
    case "dark": return {
      ...base,
      background: "rgba(8,6,20,0.92)",
      border: "2px solid rgba(139,92,246,0.65)",
      borderRadius: 12,
      boxShadow: "0 0 18px rgba(139,92,246,0.25), inset 0 0 30px rgba(139,92,246,0.06)",
    };
    case "frosted": return {
      ...base,
      background: "rgba(15,10,35,0.45)",
      backdropFilter: "blur(14px)",
      WebkitBackdropFilter: "blur(14px)",
      border: "1px solid rgba(139,92,246,0.35)",
      borderRadius: 12,
    };
    case "neon_border": return {
      ...base,
      background: "rgba(8,6,20,0.88)",
      border: "2px solid rgba(139,92,246,0.7)",
      borderRadius: 12,
      animation: "sb-neon-pulse 2.4s ease-in-out infinite",
    };
    case "minimal": return {
      ...base,
      background: "transparent",
      borderBottom: "2px solid rgba(139,92,246,0.7)",
      padding: "0 14px",
    };
    case "transparent": return {
      ...base,
      background: "transparent",
    };
  }
}

// ─── Main component ────────────────────────────────────────────────────────────

export function SponsorBanner({ config }: { config: SponsorConfig }) {
  React.useEffect(() => { ensureKeyframes(); }, []);

  const { idx, text, phase, resolvedAnimStyle } = useMessageCycle(config.messages, config.interval, config.animStyle);

  if (!config.enabled) return null;

  const pos: React.CSSProperties = {
    left:   `${config.x}%`,
    top:    `${config.y}%`,
    width:  `${config.w}%`,
    height: `${config.h}%`,
  };

  const isDark = config.bannerStyle !== "transparent" && config.bannerStyle !== "minimal";
  const textSize    = config.textSize    ?? 40;
  const leftWidth   = config.leftWidth   ?? 160;
  const commandSize = config.commandSize ?? 16;
  const gap         = config.gap         ?? 20;

  return (
    <div style={{ ...bannerContainerStyle(config.bannerStyle), ...pos, gap }}>

      {/* ── Left section : command pill — compact, taille contrôlable */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        flexShrink: 0,
        width: leftWidth,
      }}>
        <div style={{
          background: "linear-gradient(135deg, #7c3aed, #9333ea)",
          borderRadius: Math.round(commandSize * 0.45),
          padding: `${Math.round(commandSize * 0.3)}px ${Math.round(commandSize * 1.1)}px`,
          fontSize: commandSize,
          fontWeight: 800,
          color: "#fff",
          letterSpacing: "0.04em",
          boxShadow: "0 0 12px rgba(147,51,234,0.6)",
          whiteSpace: "nowrap",
        }}>
          {config.command}
        </div>
      </div>

      {/* ── Divider */}
      <div style={{
        width: 1,
        alignSelf: "stretch",
        margin: "10px 0",
        background: isDark ? "rgba(139,92,246,0.4)" : "rgba(255,255,255,0.25)",
        flexShrink: 0,
      }} />

      {/* ── Right section : animated text */}
      <div style={{
        flex: 1,
        minWidth: 0,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <div
          key={idx}
          style={{
            fontSize: textSize,
            fontWeight: 900,
            color: "#ffffff",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            lineHeight: 1,
            whiteSpace: "nowrap",
            textAlign: "center",
            textShadow: isDark ? "0 0 20px rgba(139,92,246,0.5)" : "none",
          }}
        >
          <AnimatedText
            text={text}
            phase={phase}
            animStyle={resolvedAnimStyle}
          />
        </div>
      </div>
    </div>
  );
}
