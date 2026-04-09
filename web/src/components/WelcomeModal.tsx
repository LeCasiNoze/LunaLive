// web/src/components/WelcomeModal.tsx
import * as React from "react";
import { createPortal } from "react-dom";
const DISCORD_INVITE_URL = "https://discord.gg/93BFrsBWWB";

/* CSS injecté UNE FOIS au niveau module */
const STYLE_ID = "welcome-styles-v1";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
@keyframes welcome-fade-in { from{opacity:0} to{opacity:1} }
@keyframes welcome-slide-up { from{opacity:0;transform:translateY(20px) scale(.95)} to{opacity:1;transform:translateY(0) scale(1)} }
.welcome-backdrop{
  position:fixed;inset:0;z-index:3200;
  display:grid;place-items:center;padding:20px;
  background:rgba(4,3,10,.85);
  backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
  animation:welcome-fade-in 300ms ease;
}
.welcome-dialog{
  width:100%;max-width:420px;
  background:linear-gradient(135deg, rgba(28,25,52,.96), rgba(20,18,40,.98));
  border:1px solid rgba(124,92,252,.22);
  border-radius:18px;
  box-shadow:0 24px 48px rgba(0,0,0,.4),0 0 0 1px rgba(124,92,252,.08);
  animation:welcome-slide-up 400ms cubic-bezier(.16,1,.3,1);
  overflow:hidden;
}
.welcome-header{
  padding:24px 24px 20px;
  text-align:center;
  border-bottom:1px solid rgba(124,92,252,.12);
}
.welcome-icon{
  width:48px;height:48px;margin:0 auto 16px;
  background:linear-gradient(135deg, rgba(124,92,252,.15), rgba(59,77,200,.12));
  border:1px solid rgba(124,92,252,.25);
  border-radius:14px;
  display:flex;align-items:center;justify-content:center;
  font-size:20px;
}
.welcome-title{
  font-size:18px;font-weight:700;color:rgba(235,232,255,.92);
  margin:0 0 8px;
  line-height:1.3;
}
.welcome-subtitle{
  font-size:13px;color:rgba(167,155,220,.65);
  margin:0;
  line-height:1.4;
}
.welcome-body{
  padding:24px;
  display:flex;flex-direction:column;gap:16px;
}
.welcome-section{
  display:flex;flex-direction:column;gap:8px;
}
.welcome-section-title{
  font-size:12px;font-weight:700;text-transform:uppercase;
  letter-spacing:.06em;color:rgba(124,92,252,.85);
  margin:0;
}
.welcome-section-text{
  font-size:14px;color:rgba(235,232,255,.78);
  line-height:1.5;margin:0;
}
.welcome-footer{
  padding:20px 24px 24px;
  border-top:1px solid rgba(124,92,252,.12);
}
.welcome-btn{
  width:100%;
  padding:12px 20px;
  background:linear-gradient(135deg, rgba(124,92,252,.88), rgba(59,77,200,.86));
  border:1px solid rgba(124,92,252,.4);
  border-radius:12px;
  color:rgba(255,255,255,.95);
  font-size:14px;font-weight:600;
  cursor:pointer;
  transition:all 200ms ease;
  outline:none;-webkit-tap-highlight-color:transparent;
}
.welcome-btn:hover{
  background:linear-gradient(135deg, rgba(124,92,252,.94), rgba(59,77,200,.92));
  border-color:rgba(124,92,252,.6);
  transform:translateY(-1px);
  box-shadow:0 8px 16px rgba(124,92,252,.25);
}
.welcome-btn:active{
  transform:translateY(0);
}
.welcome-close{
  position:absolute;top:16px;right:16px;
  width:28px;height:28px;border-radius:8px;
  border:1px solid rgba(124,92,252,.18);background:rgba(255,255,255,.04);
  color:rgba(235,232,255,.55);cursor:pointer;display:grid;place-items:center;
  font-size:11px;
  transition:all 150ms ease;
}
.welcome-close:hover{
  background:rgba(124,92,252,.12);border-color:rgba(124,92,252,.36);
  color:rgba(235,232,255,.75);
}
`;
  document.head.appendChild(el);
}

export function WelcomeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return createPortal(
    <div className="welcome-backdrop" role="presentation"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="welcome-dialog" role="dialog" aria-modal="true"
        onMouseDown={e => e.stopPropagation()}>

        {/* Header */}
        <div className="welcome-header">
          <button className="welcome-close" type="button" aria-label="Fermer" onClick={onClose}>×</button>
          <div className="welcome-icon">
  <img src="/logo_onglet.png" alt="LunaLive" style={{ width: "28px", height: "28px" }} />
</div>
          <h2 className="welcome-title">Bienvenue sur LunaLive !</h2>
          <p className="welcome-subtitle">Nous sommes ravis de vous accueillir sur notre plateforme</p>
        </div>

        {/* Body */}
        <div className="welcome-body">
          <div className="welcome-section">
            <h3 className="welcome-section-title">Pour les Streamers</h3>
            <p className="welcome-section-text">
              Vous souhaitez devenir streamer ? Rejoignez notre Discord pour déposer votre candidature et accéder à toutes les informations nécessaires.
            </p>
          </div>

          <div className="welcome-section">
            <h3 className="welcome-section-title">Pour les Viewers</h3>
            <p className="welcome-section-text">
              Gagnez des points et participez à l'économie de la plateforme en rejoignant notre communauté Discord.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="welcome-footer">
          <a 
            href={DISCORD_INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="welcome-btn"
            onClick={onClose}
          >
            Rejoindre le Discord
          </a>
        </div>
      </div>
    </div>,
    document.body
  );
}
