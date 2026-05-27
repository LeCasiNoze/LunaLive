// ─────────────────────────────────────────────────────────────────────────────
// V3PseudoKeyframes — injecte les @keyframes des animations pseudo dans le DOM.
// A monter une fois dans chaque modele V3 (idempotent via id).
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";

export function V3PseudoKeyframes() {
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById("v3p-keyframes")) return;
    const tag = document.createElement("style");
    tag.id = "v3p-keyframes";
    tag.textContent = `
      .v3p-anim-pulse{animation:v3p-pulse 2.2s ease-in-out infinite;display:inline-block}
      .v3p-anim-float{animation:v3p-float 3.6s ease-in-out infinite;display:inline-block}
      .v3p-anim-shimmer{background-size:200% 100% !important;animation:v3p-shimmer 4s linear infinite}
      .v3p-anim-glow{animation:v3p-glow 2.4s ease-in-out infinite;display:inline-block}
      .v3p-anim-bounce{animation:v3p-bounce 1.8s cubic-bezier(.36,1.4,.5,1) infinite;display:inline-block}
      @keyframes v3p-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
      @keyframes v3p-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
      @keyframes v3p-shimmer{to{background-position:200% 0}}
      @keyframes v3p-glow{0%,100%{filter:drop-shadow(0 0 8px currentColor)}50%{filter:drop-shadow(0 0 22px currentColor)}}
      @keyframes v3p-bounce{0%,100%{transform:translateY(0)}40%{transform:translateY(-10px)}60%{transform:translateY(-3px)}}
      @media (prefers-reduced-motion:reduce){
        .v3p-anim-pulse,.v3p-anim-float,.v3p-anim-shimmer,.v3p-anim-glow,.v3p-anim-bounce{animation:none !important}
      }
    `;
    document.head.appendChild(tag);
  }, []);
  return null;
}
