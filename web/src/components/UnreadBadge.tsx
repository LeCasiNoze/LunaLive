// web/src/components/UnreadBadge.tsx
import * as React from "react";

let cssInjected = false;

function ensureCss() {
  if (cssInjected) return;
  cssInjected = true;

  const css = `
  .llUnreadBang{
    display:inline-flex;
    align-items:center;
    justify-content:center;
    width: 18px;
    height: 18px;
    margin-left: 8px;
    border-radius: 999px;
    font-weight: 1200;
    font-size: 12px;
    line-height: 1;
    color: rgba(255,255,255,0.95);
    border: 1px solid rgba(255,255,255,0.18);
    background: rgba(124,77,255,0.28);
    box-shadow: 0 0 0 2px rgba(124,77,255,0.10), 0 12px 30px rgba(0,0,0,0.25);
    transform: translateY(-0.5px);
    animation: llUnreadPulse 1.25s ease-in-out infinite;
  }
  @keyframes llUnreadPulse{
    0%{ transform: translateY(-0.5px) scale(1); filter: brightness(1); }
    50%{ transform: translateY(-0.5px) scale(1.10); filter: brightness(1.15); }
    100%{ transform: translateY(-0.5px) scale(1); filter: brightness(1); }
  }
  @media (prefers-reduced-motion: reduce){
    .llUnreadBang{ animation: none; }
  }`;

  const tag = document.createElement("style");
  tag.setAttribute("data-ll-unread", "1");
  tag.textContent = css;
  document.head.appendChild(tag);
}

export function UnreadBadge({ show, title }: { show: boolean; title?: string }) {
  React.useEffect(() => ensureCss(), []);
  if (!show) return null;
  return (
    <span className="llUnreadBang" title={title || "Nouveau"}>
      !
    </span>
  );
}
