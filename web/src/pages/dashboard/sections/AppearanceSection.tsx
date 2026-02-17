// web/src/pages/dashboard/sections/AppearanceSection.tsx
// ══════════════════════════════════════════════════════════════
//  PURPLE VELVET — AppearanceSection
//  Refonte UX : cards hiérarchisées, ColorRow Syne, preview live
// ══════════════════════════════════════════════════════════════
import * as React from "react";
import type { ApiMyStreamer } from "../../../lib/api";
import { useAuth } from "../../../auth/AuthProvider";

type SubBadge = { enabled:boolean; text:string; borderColor:string; textColor:string; };
type Appearance = {
  chat: {
    viewerSkinsLevel?: 1|2|3;
    usernameColor:string; messageColor:string;
    sub: { usernameColor:string; messageColor:string; badge:SubBadge; hat:{ id:string|null }; };
  };
};

const PRESETS = [
  { id:"ghost_purple", name:"Ghost Purple", hex:"#7C4DFF" },
  { id:"blue_lotus",   name:"Blue Lotus",   hex:"#4AA3FF" },
  { id:"neon_mint",    name:"Neon Mint",    hex:"#2EF2B3" },
  { id:"rose_nova",    name:"Rose Nova",    hex:"#FF4DD8" },
  { id:"sunset",       name:"Sunset",       hex:"#FF7A59" },
  { id:"gold",         name:"Gold",         hex:"#FFD54A" },
  { id:"ice",          name:"Ice",          hex:"#9AE6FF" },
  { id:"lime",         name:"Lime",         hex:"#A3FF4A" },
] as const;

function apiBase() { return (import.meta as any).env?.VITE_API_BASE || "https://lunalive-api.onrender.com"; }
function clampBadgeText(s: string) { return ((s||"").trim().replace(/[^\w\-]/g,"")||"SUB").slice(0,8); }
function pickAppearance(j: any): Appearance | null { const ap=(j?.appearance??j?.streamer?.appearance) as any; return ap?.chat ? ap as Appearance : null; }
function pickOfflineBgUrl(j: any): string | null { const u=j?.offlineBgUrl??j?.streamer?.offlineBgUrl??null; return typeof u==="string"&&u.trim()?u:null; }

async function loadImageBitmap(file: File): Promise<ImageBitmap|HTMLImageElement> {
  const anyGlobal:any = globalThis as any;
  if (typeof anyGlobal.createImageBitmap === "function") return await anyGlobal.createImageBitmap(file);
  const url = URL.createObjectURL(file);
  try { return await new Promise<HTMLImageElement>((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=url; }); }
  finally { URL.revokeObjectURL(url); }
}
function blobFromCanvas(canvas: HTMLCanvasElement, q=0.82): Promise<Blob> {
  return new Promise((res,rej)=>{ canvas.toBlob(b=>{ if(!b) return rej(new Error("toBlob_failed")); res(b); },"image/jpeg",q); });
}
async function makeOfflineBgJpeg(file: File, opts:{ w:number; h:number; quality?:number }): Promise<{ blob:Blob; previewUrl:string }> {
  const { w,h,quality=0.82 } = opts;
  const src = await loadImageBitmap(file);
  const sw=(src as any).width as number, sh=(src as any).height as number;
  const targetRatio=w/h, srcRatio=sw/sh;
  let cropW=sw,cropH=sh,sx=0,sy=0;
  if (srcRatio>targetRatio) { cropW=Math.round(sh*targetRatio); sx=Math.round((sw-cropW)/2); }
  else { cropH=Math.round(sw/targetRatio); sy=Math.round((sh-cropH)/2); }
  const canvas=document.createElement("canvas"); canvas.width=w; canvas.height=h;
  const ctx=canvas.getContext("2d"); if (!ctx) throw new Error("canvas_ctx_missing");
  ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality="high";
  ctx.drawImage(src as any,sx,sy,cropW,cropH,0,0,w,h);
  const blob=await blobFromCanvas(canvas,quality);
  return { blob, previewUrl:URL.createObjectURL(blob) };
}

/* ─── CSS ─────────────────────────────────────────────────── */
const APP_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@500;700;800&display=swap');

.app-split2 {
  display:grid; grid-template-columns:1fr 1fr; gap:14px; align-items:start;
}
@media (max-width:980px) { .app-split2 { grid-template-columns:1fr; } }

.app-section-card {
  padding:16px; border-radius:18px;
  border:1px solid rgba(124,92,252,.14);
  background:rgba(0,0,0,.18);
  margin-top:14px;
}

.app-subsection {
  padding:14px; border-radius:16px;
  border:1px solid rgba(124,92,252,.12);
  background:rgba(124,92,252,.05);
}

.app-card-title {
  font-family:'Syne',system-ui,sans-serif; font-weight:800; font-size:15px; letter-spacing:-.2px;
  background:linear-gradient(90deg,#c4b5fd,#a78bfa); -webkit-background-clip:text; background-clip:text; color:transparent;
}

.app-card-sub {
  font-family:'Syne',system-ui,sans-serif; font-size:11px; font-weight:600;
  color:rgba(167,139,250,.55); margin-top:5px;
}

.app-input {
  width:120px; padding:10px 12px; border-radius:13px;
  border:1px solid rgba(124,92,252,.20); background:rgba(124,92,252,.08);
  color:rgba(235,232,255,.92); outline:none;
  font-family:'Syne',system-ui,sans-serif; font-weight:700; font-size:14px;
}
.app-input:focus {
  border-color:rgba(124,92,252,.42); background:rgba(124,92,252,.12);
  box-shadow:0 0 0 3px rgba(124,92,252,.10);
}

.app-radio-option {
  display:flex; gap:10px; align-items:flex-start; padding:11px 13px;
  border-radius:14px; border:1px solid rgba(124,92,252,.12);
  background:rgba(124,92,252,.05); cursor:pointer;
  transition:all 140ms ease;
}
.app-radio-option:hover { border-color:rgba(124,92,252,.24); background:rgba(124,92,252,.10); }

.app-preview-box {
  padding:16px; border-radius:16px;
  border:1px solid rgba(124,92,252,.14);
  background:rgba(0,0,0,.20);
}

.app-offline-preview {
  border-radius:14px; overflow:hidden;
  border:1px solid rgba(124,92,252,.12);
}

.app-badge-preview {
  display:inline-flex; align-items:center;
  padding:5px 11px; border-radius:999px;
  font-family:'Syne',system-ui,sans-serif;
  font-size:11px; font-weight:800; letter-spacing:.04em;
}
`;

/* ─── SectionCard ─────────────────────────────────────────── */
function SectionCard({ title, subtitle, right, children }: { title:string; subtitle?:string; right?:React.ReactNode; children:React.ReactNode }) {
  return (
    <div className="app-section-card">
      <div style={{ display:"flex", justifyContent:"space-between", gap:12, alignItems:"flex-start", flexWrap:"wrap" }}>
        <div>
          <div className="app-card-title">{title}</div>
          {subtitle ? <div className="app-card-sub">{subtitle}</div> : null}
        </div>
        {right ? <div style={{ flexShrink:0 }}>{right}</div> : null}
      </div>
      <div style={{ marginTop:14 }}>{children}</div>
    </div>
  );
}

/* ─── ColorRow ────────────────────────────────────────────── */
function ColorRow({ label, value, onChange, help }: { label:string; value:string; onChange:(hex:string)=>void; help?:string }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:10, marginTop:14 }}>
      <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", gap:10 }}>
        <div style={{ fontWeight:800, fontSize:13, fontFamily:"'Syne',system-ui,sans-serif" }}>{label}</div>
        <code style={{ fontSize:11, color:"rgba(167,139,250,.70)", fontWeight:700, fontFamily:"monospace" }}>{value.toUpperCase()}</code>
      </div>
      <div style={{ display:"flex", flexWrap:"wrap", gap:7, alignItems:"center" }}>
        {PRESETS.map(p => (
          <button key={p.id} onClick={()=>onChange(p.hex)} title={p.name}
            style={{
              width:28, height:28, borderRadius:10, cursor:"pointer",
              background:p.hex,
              border: value.toUpperCase()===p.hex ? "2px solid rgba(255,255,255,.70)" : "1px solid rgba(255,255,255,.14)",
              boxShadow:"0 6px 18px rgba(0,0,0,.32)",
              transition:"all 130ms ease",
            }} />
        ))}
        <div style={{ display:"flex", alignItems:"center", gap:8, marginLeft:8 }}>
          <input type="color" value={value} onChange={e=>onChange(e.target.value)}
            style={{ width:38, height:32, border:"none", background:"transparent", cursor:"pointer", borderRadius:8 }} />
          <input className="app-input" value={value} onChange={e=>onChange(e.target.value)} placeholder="#RRGGBB" />
        </div>
      </div>
      {help ? <div style={{ fontSize:11, color:"rgba(167,139,250,.50)", fontWeight:600 }}>{help}</div> : null}
    </div>
  );
}

/* ─── Composant principal ─────────────────────────────────── */
export function AppearanceSection({ streamer }: { streamer: ApiMyStreamer }) {
  const { token } = useAuth();
  const [loading,        setLoading]        = React.useState(false);
  const [saving,         setSaving]         = React.useState(false);
  const [err,            setErr]            = React.useState<string|null>(null);
  const [ok,             setOk]             = React.useState<string|null>(null);
  const [offlineBgUrl,   setOfflineBgUrl]   = React.useState<string|null>(null);
  const [offlineUploading, setOfflineUploading] = React.useState(false);
  const [offlineDeleting,  setOfflineDeleting]  = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement|null>(null);
  const [offlineLocalPreview, setOfflineLocalPreview] = React.useState<string|null>(null);
  const [appearance, setAppearance] = React.useState<Appearance>({
    chat: {
      viewerSkinsLevel:1, usernameColor:"#7C4DFF", messageColor:"#FFFFFF",
      sub: { usernameColor:"#9AE6FF", messageColor:"#FFFFFF", badge:{ enabled:true, text:"SUB", borderColor:"#7C4DFF", textColor:"#FFFFFF" }, hat:{ id:null } },
    },
  });

  function toastOk(msg: string) { setOk(msg); window.setTimeout(()=>setOk(null),1400); }

  async function load() {
    if (!token) return;
    setLoading(true); setErr(null);
    try {
      const r = await fetch(`${apiBase()}/streamer/me/appearance`,{ headers:{ Authorization:`Bearer ${token}` } });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error||"appearance_failed");
      const ap = pickAppearance(j); if (!ap) throw new Error("appearance_missing");
      setAppearance(ap); setOfflineBgUrl(pickOfflineBgUrl(j));
    } catch(e:any) { setErr(String(e?.message||"Erreur")); }
    finally { setLoading(false); }
  }

  async function save() {
    if (!token) return;
    setSaving(true); setErr(null); setOk(null);
    try {
      const r = await fetch(`${apiBase()}/streamer/me/appearance`,{ method:"PATCH", headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`}, body:JSON.stringify({ appearance }) });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error||"save_failed");
      const ap=pickAppearance(j); if (!ap) throw new Error("save_ok_but_no_appearance");
      setAppearance(ap); setOfflineBgUrl(pickOfflineBgUrl(j)??offlineBgUrl);
      toastOk("Enregistré ✅");
    } catch(e:any) { setErr(String(e?.message||"Erreur")); }
    finally { setSaving(false); }
  }

  async function uploadOfflineBg(file: File) {
    if (!token) return;
    setErr(null); setOk(null);
    if (offlineLocalPreview) { try { URL.revokeObjectURL(offlineLocalPreview); } catch {} setOfflineLocalPreview(null); }
    setOfflineUploading(true);
    try {
      const { blob, previewUrl } = await makeOfflineBgJpeg(file,{ w:1600,h:900,quality:0.82 });
      setOfflineLocalPreview(previewUrl);
      const fd=new FormData(); fd.append("image",blob,"offline.jpg");
      const r=await fetch(`${apiBase()}/streamer/me/offline-bg`,{ method:"POST", headers:{ Authorization:`Bearer ${token}` }, body:fd });
      const j=await r.json().catch(()=>null);
      if (!r.ok||!j?.ok) throw new Error(j?.error||"upload_failed");
      if (typeof j.offlineBgUrl==="string") setOfflineBgUrl(j.offlineBgUrl); else await load();
      toastOk("Image offline mise à jour ✅");
    } catch(e:any) { setErr(String(e?.message||"Erreur upload")); }
    finally { setOfflineUploading(false); }
  }

  async function deleteOfflineBg() {
    if (!token) return;
    setErr(null); setOk(null); setOfflineDeleting(true);
    try {
      const r=await fetch(`${apiBase()}/streamer/me/offline-bg`,{ method:"DELETE", headers:{ Authorization:`Bearer ${token}` } });
      const j=await r.json().catch(()=>null);
      if (!r.ok||!j?.ok) throw new Error(j?.error||"delete_failed");
      setOfflineBgUrl(null);
      if (offlineLocalPreview) { try { URL.revokeObjectURL(offlineLocalPreview); } catch {} setOfflineLocalPreview(null); }
      toastOk("Image offline supprimée ✅");
    } catch(e:any) { setErr(String(e?.message||"Erreur suppression")); }
    finally { setOfflineDeleting(false); }
  }

  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, [token]);
  React.useEffect(() => () => { if (offlineLocalPreview) try { URL.revokeObjectURL(offlineLocalPreview); } catch {} }, []);

  const shownBg = offlineLocalPreview ?? offlineBgUrl;
  const busy = loading||saving||offlineUploading||offlineDeleting;

  return (
    <div className="panel">
      <style>{APP_CSS}</style>

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, marginBottom:6, flexWrap:"wrap" }}>
        <div>
          <div className="panelTitle" style={{ fontFamily:"'Syne',system-ui,sans-serif" }}>Apparence</div>
          <div style={{ fontSize:12, color:"rgba(167,139,250,.60)", fontFamily:"'Syne',system-ui,sans-serif", marginTop:4 }}>
            Chaîne : <strong style={{ color:"rgba(196,181,253,.80)" }}>@{streamer.slug}</strong>
          </div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button className="btnPrimary" onClick={save} disabled={busy}
            style={{ fontFamily:"'Syne',system-ui,sans-serif", fontWeight:800 }}>
            {saving ? "⏳ Enregistrement…" : "✓ Enregistrer"}
          </button>
          <button className="btnGhost" onClick={load} disabled={busy}
            style={{ fontFamily:"'Syne',system-ui,sans-serif", fontWeight:800 }}>
            🔄
          </button>
        </div>
      </div>

      {/* Alerts */}
      {err ? <div className="hint" style={{ opacity:.95, marginTop:10 }}>⚠️ {err}</div> : null}
      {ok  ? <div className="hint" style={{ opacity:.95, marginTop:10, borderColor:"rgba(52,211,153,.28)", background:"rgba(52,211,153,.08)", color:"rgba(110,231,183,.90)" }}>✨ {ok}</div> : null}
      {loading ? <div style={{ marginTop:10, fontSize:12, color:"rgba(196,181,253,.55)" }}>⏳ Chargement…</div> : null}

      {!loading ? (
        <>
          {/* ── IMAGE OFFLINE ── */}
          <SectionCard title="Image OFFLINE" subtitle="Recommandé : 16:9 · Export auto 1600×900 JPEG"
            right={
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                <button className="btnPrimarySmall" onClick={()=>fileRef.current?.click()} disabled={!token||offlineUploading||offlineDeleting}>
                  {offlineUploading ? "⏳ Upload…" : shownBg ? "Changer" : "Ajouter"}
                </button>
                <button className="btnGhostSmall" onClick={deleteOfflineBg} disabled={!token||!offlineBgUrl||offlineUploading||offlineDeleting}>
                  {offlineDeleting ? "⏳ Suppression…" : "Supprimer"}
                </button>
              </div>
            }>
            <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }}
              onChange={e=>{ const f=e.currentTarget.files?.[0]||null; e.currentTarget.value=""; if (f) uploadOfflineBg(f); }} />
            <div className="app-offline-preview">
              <div style={{
                aspectRatio:"16/9", display:"flex", alignItems:"flex-end",
                background: shownBg
                  ? `linear-gradient(to top,rgba(0,0,0,.65),rgba(0,0,0,.12)),url(${shownBg}) center/cover no-repeat`
                  : "rgba(124,92,252,.05)",
              }}>
                <div style={{ padding:16 }}>
                  <div style={{ fontWeight:800, fontSize:14, fontFamily:"'Syne',system-ui,sans-serif" }}>
                    {shownBg ? "Aperçu OFFLINE" : "Aucune image OFFLINE"}
                  </div>
                  <div style={{ marginTop:4, fontSize:12, color:"rgba(196,181,253,.70)", fontFamily:"'Syne',system-ui,sans-serif", maxWidth:480 }}>
                    {shownBg ? "Affiché sur ta page quand tu es hors ligne." : "Ajoute une image 16:9 — crop+resize automatique."}
                  </div>
                </div>
              </div>
            </div>
          </SectionCard>

          {/* ── CHAT ── */}
          <SectionCard title="Apparence — Chat">
            <div className="app-split2">
              {/* Viewer skins policy */}
              <div className="app-subsection">
                <div style={{ fontWeight:800, fontSize:14, fontFamily:"'Syne',system-ui,sans-serif", marginBottom:4 }}>Skins des viewers</div>
                <div style={{ fontSize:12, color:"rgba(167,139,250,.60)", fontFamily:"'Syne',system-ui,sans-serif", marginBottom:12 }}>
                  Laisse les viewers afficher leurs cosmétiques ou impose ton style.
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {([
                    { v:1, title:"Niveau 1 — Libre",          desc:"Viewers avec skin gardent leur skin. Sans skin → ton style." },
                    { v:2, title:"Niveau 2 — Bloquer pseudos", desc:"Couleur pseudo imposée (skins pseudo ignorés)." },
                    { v:3, title:"Niveau 3 — Tout bloquer",    desc:"Couleurs + cadrans viewers ignorés. Chat homogène." },
                  ] as const).map(o => (
                    <label key={o.v} className="app-radio-option">
                      <input type="radio" name="viewerSkinsLevel"
                        checked={Number(appearance.chat.viewerSkinsLevel??1)===o.v}
                        onChange={()=>setAppearance(a=>({ ...a, chat:{ ...a.chat, viewerSkinsLevel:o.v } }))}
                        style={{ marginTop:2, accentColor:"#7c5cfc" }} />
                      <div>
                        <div style={{ fontWeight:800, fontSize:13, fontFamily:"'Syne',system-ui,sans-serif" }}>{o.title}</div>
                        <div style={{ fontSize:11, color:"rgba(167,139,250,.60)", marginTop:2, fontFamily:"'Syne',system-ui,sans-serif" }}>{o.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Couleurs */}
              <div className="app-subsection">
                <div style={{ fontWeight:800, fontSize:14, fontFamily:"'Syne',system-ui,sans-serif", marginBottom:4 }}>Couleurs</div>
                <div style={{ fontSize:12, color:"rgba(167,139,250,.60)", fontFamily:"'Syne',system-ui,sans-serif" }}>
                  Appliquées selon ta politique skins.
                </div>
                <ColorRow label="Couleur des pseudos" value={appearance.chat.usernameColor}
                  onChange={hex=>setAppearance(a=>({ ...a, chat:{ ...a.chat, usernameColor:hex } }))} />
                <ColorRow label="Couleur des messages" value={appearance.chat.messageColor}
                  onChange={hex=>setAppearance(a=>({ ...a, chat:{ ...a.chat, messageColor:hex } }))} />
              </div>
            </div>
          </SectionCard>

          {/* ── APERÇU ── */}
          <SectionCard title="Aperçu live">
            <div className="app-preview-box">
              <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                {appearance.chat.sub.badge.enabled ? (
                  <span className="app-badge-preview"
                    style={{ border:`1px solid ${appearance.chat.sub.badge.borderColor}`, color:appearance.chat.sub.badge.textColor, background:"rgba(0,0,0,.18)" }}>
                    {appearance.chat.sub.badge.text}
                  </span>
                ) : null}
                <span style={{ fontWeight:800, fontFamily:"'Syne',system-ui,sans-serif", color:appearance.chat.usernameColor }}>
                  PseudoViewer
                </span>
                <span style={{ opacity:.55, fontSize:11 }}>12:34</span>
              </div>
              <div style={{ marginTop:8, color:appearance.chat.messageColor, fontFamily:"'Syne',system-ui,sans-serif", fontWeight:700, fontSize:14 }}>
                Exemple de message — "ça rend comment ?"
              </div>
            </div>
          </SectionCard>

          {/* ── SUB ── */}
          <SectionCard title="Section SUB" subtitle="Préparé maintenant, appliqué quand le système SUB sera branché.">
            <div className="app-subsection">
              <div className="app-split2">
                <div>
                  <ColorRow label="Couleur pseudo SUB" value={appearance.chat.sub.usernameColor}
                    onChange={hex=>setAppearance(a=>({ ...a, chat:{ ...a.chat, sub:{ ...a.chat.sub, usernameColor:hex } } }))} />
                  <ColorRow label="Couleur message SUB" value={appearance.chat.sub.messageColor}
                    onChange={hex=>setAppearance(a=>({ ...a, chat:{ ...a.chat, sub:{ ...a.chat.sub, messageColor:hex } } }))} />
                </div>
                <div>
                  <div style={{ fontWeight:800, fontSize:13, fontFamily:"'Syne',system-ui,sans-serif", marginBottom:10 }}>Badge SUB</div>
                  <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center", marginBottom:12 }}>
                    <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer" }}>
                      <input type="checkbox" checked={appearance.chat.sub.badge.enabled}
                        style={{ accentColor:"#7c5cfc" }}
                        onChange={e=>setAppearance(a=>({ ...a, chat:{ ...a.chat, sub:{ ...a.chat.sub, badge:{ ...a.chat.sub.badge, enabled:e.target.checked } } } }))} />
                      <span style={{ fontWeight:800, fontSize:13, fontFamily:"'Syne',system-ui,sans-serif" }}>Activé</span>
                    </label>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ fontSize:11, color:"rgba(167,139,250,.60)", fontWeight:700 }}>Texte (≤8)</span>
                      <input className="app-input" value={appearance.chat.sub.badge.text}
                        style={{ width:100, textTransform:"uppercase" }}
                        onChange={e=>setAppearance(a=>({ ...a, chat:{ ...a.chat, sub:{ ...a.chat.sub, badge:{ ...a.chat.sub.badge, text:clampBadgeText(e.target.value) } } } }))} />
                    </div>
                  </div>
                  <div className="app-split2">
                    <ColorRow label="Bordure badge" value={appearance.chat.sub.badge.borderColor}
                      onChange={hex=>setAppearance(a=>({ ...a, chat:{ ...a.chat, sub:{ ...a.chat.sub, badge:{ ...a.chat.sub.badge, borderColor:hex } } } }))} />
                    <ColorRow label="Texte badge" value={appearance.chat.sub.badge.textColor}
                      onChange={hex=>setAppearance(a=>({ ...a, chat:{ ...a.chat, sub:{ ...a.chat.sub, badge:{ ...a.chat.sub.badge, textColor:hex } } } }))} />
                  </div>
                  <div style={{ marginTop:10, fontSize:11, color:"rgba(167,139,250,.50)", fontFamily:"'Syne',system-ui,sans-serif" }}>
                    Hat avatar : placeholder stocké en DB (branché plus tard).
                  </div>
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Actions bas */}
          <div style={{ display:"flex", gap:10, marginTop:16, flexWrap:"wrap" }}>
            <button className="btnPrimary" onClick={save} disabled={busy}
              style={{ fontFamily:"'Syne',system-ui,sans-serif", fontWeight:800 }}>
              {saving ? "⏳ Enregistrement…" : "✓ Enregistrer"}
            </button>
            <button className="btnGhost" onClick={load} disabled={busy}
              style={{ fontFamily:"'Syne',system-ui,sans-serif", fontWeight:800 }}>
              🔄 Recharger
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}