// web/src/layout/BottomTabs.tsx
// ─────────────────────────────────────────────────────────────────────────────
//  LunaLive — BottomTabs mobile  |  Design : Purple Velvet × Blue Night
//  + modal clips CENTRÉE (pas de sheet dégueulasse)
// ─────────────────────────────────────────────────────────────────────────────
import * as React from "react";
import { NavLink, Link, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { UnreadBadge } from "../components/UnreadBadge";
import { publicGetContent } from "../lib/api";
import { contentVersionFromItem, isUnread } from "../lib/unread_seen";
import { DailyWheelCard } from "../components/DailyWheelCard";
import { DailyBonusAccessCard } from "../components/DailyBonusAccessCard";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

/* ─── Types ─────────────────────────────────────────────────────────── */
type ClipVM = {
  id: number;
  streamerSlug: string;
  streamerName: string | null;
  avatarUrl: string | null;
  title: string | null;
  createdAtMs: number;
  vodUrl: string | null;
  startSec: number;
  durationSec: number;
  clipUrl?: string | null;
  thumbUrl: string | null;
  likesCount: number;
  myLiked?: boolean;
};

/* ─── helpers ────────────────────────────────────────────────────────── */
function absolutize(url: string | null): string | null {
  if (!url) return null;
  const u = String(url);
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/")) return `${API_BASE}${u}`;
  return u;
}

function initials(name: string) {
  const s = (name || "?").trim();
  const parts = s.split(/[\s._-]+/g).filter(Boolean);
  const a = parts[0]?.[0] ?? s[0];
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] : s[1];
  return (a + (b ?? "")).toUpperCase();
}

function getAvatarUrl(u: any): string | null {
  const v = [u?.avatarUrl, u?.avatar_url, u?.avatar, u?.photoUrl, u?.photo_url, u?.picture, u?.imageUrl, u?.image_url].filter(Boolean)[0];
  if (!v) return null;
  return absolutize(String(v)) ?? String(v);
}

function pickUserAvatarUrl(user: any) {
  const uid    = user?.id != null ? Number(user.id) : null;
  const direct = getAvatarUrl(user);
  const byUid  = uid ? absolutize(`/avatars/u/${uid}?v=${Math.floor(Date.now() / 60000)}`) : null;
  return direct || byUid;
}

function timeAgo(ms: number) {
  const d = Date.now() - (ms || 0);
  const mins = Math.floor(d / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} j`;
}

function fmtDuration(sec: number) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

async function fetchTopClipsMonth(token?: string | null): Promise<{ total: number; clips: ClipVM[] }> {
  try {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/clips/top?range=month&limit=24`, { headers });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || j.ok === false) return { total: 0, clips: [] };
    const arr = Array.isArray(j.clips) ? j.clips : Array.isArray(j) ? j : [];
    const total = Number(j.total ?? arr.length ?? 0) || 0;
    const clips = arr.map((x: any) => {
      const id = Number(x?.id);
      if (!Number.isFinite(id) || id <= 0) return null;
      return {
        id,
        streamerSlug: String(x?.streamerSlug ?? x?.streamer_slug ?? ""),
        streamerName: x?.streamerDisplayName != null ? String(x.streamerDisplayName)
          : x?.streamer_display_name != null ? String(x.streamer_display_name)
          : x?.streamerName != null ? String(x.streamerName)
          : x?.streamer_name != null ? String(x.streamer_name) : null,
        likesCount: Number(x?.likesCount ?? x?.likes_count ?? x?.likes ?? 0) || 0,
        myLiked: x?.myLiked != null ? !!x.myLiked : x?.my_liked != null ? !!x.my_liked : undefined,
        thumbUrl: x?.thumbUrl ? String(x.thumbUrl) : x?.thumb_url ? String(x.thumb_url) : null,
        vodUrl: x?.vodUrl != null ? String(x.vodUrl) : x?.vod_url != null ? String(x.vod_url) : null,
        startSec: Number(x?.startSec ?? x?.start_sec ?? 0) || 0,
        durationSec: Number(x?.durationSec ?? x?.duration_sec ?? 0) || 0,
        clipUrl: (x?.clipUrl ?? x?.clip_url ?? x?.mp4_url ?? x?.mp4Url) != null
          ? absolutize(String(x?.clipUrl ?? x?.clip_url ?? x?.mp4_url ?? x?.mp4Url))
          : null,
        createdAtMs: Number(x?.createdAtMs ?? x?.created_at_ms ?? x?.created_ts ?? 0) || 0,
        avatarUrl: x?.avatarUrl != null ? String(x.avatarUrl)
          : x?.streamerAvatarUrl != null ? String(x.streamerAvatarUrl)
          : x?.streamer_avatar_url != null ? String(x.streamer_avatar_url) : null,
        title: x?.title != null ? String(x.title) : null,
      } satisfies ClipVM;
    }).filter(Boolean) as ClipVM[];
    return { total, clips };
  } catch { return { total: 0, clips: [] }; }
}

/* ─── CSS ────────────────────────────────────────────────────────────── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@500;700;800&display=swap');

.bt-root {
  --bt-purple:      #7c5cfc;
  --bt-purple-2:    #a78bfa;
  --bt-purple-pale: #c4b5fd;
  --bt-blue:        #5b8ef8;
  --bt-text-1:      rgba(235,232,255,.96);
  --bt-text-2:      rgba(180,185,230,.70);
  --bt-text-3:      rgba(140,145,195,.48);
  --bt-border:      rgba(124,92,252,.18);
  --bt-safe:        env(safe-area-inset-bottom, 0px);
  --bt-ease:        cubic-bezier(.22,1,.36,1);
  --bt-grad: linear-gradient(105deg,#c4b5fd 0%,#7c5cfc 35%,#5b8ef8 70%,#93c5fd 100%);
}

.bt-bar {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 80;
  padding: 8px 10px calc(8px + var(--bt-safe));
  background: rgba(8,7,18,.88);
  border-top: 1px solid rgba(124,92,252,.16);
  backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
  display: grid; grid-template-columns: 1fr auto 1fr; gap: 8px; align-items: center;
}
.bt-bar::before {
  content:""; position:absolute; top:0; left:5%; right:5%; height:1px;
  background: linear-gradient(90deg,transparent,rgba(167,139,250,.35) 38%,rgba(91,142,248,.26) 64%,transparent);
  pointer-events:none;
}

.bt-spacer { height: calc(72px + var(--bt-safe)); }

.bt-tab {
  display: flex; align-items: center; justify-content: center; gap: 7px;
  padding: 10px 12px; border-radius: 15px;
  border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.04);
  color: var(--bt-text-2); text-decoration: none; min-height: 46px;
  font-family: 'Syne', system-ui, sans-serif; font-size: 12px; font-weight: 700; letter-spacing: -.1px;
  transition: color 150ms ease, background 150ms ease, border-color 150ms ease, transform 120ms var(--bt-ease);
  -webkit-tap-highlight-color: transparent; user-select: none; position: relative;
}
.bt-tab:active { transform: scale(.97); }
.bt-tab.active {
  color: rgba(196,181,253,.95); border-color: rgba(124,92,252,.32); background: rgba(124,92,252,.10);
}
.bt-tab-dot {
  position: absolute; bottom: 6px; left: 50%; transform: translateX(-50%);
  width: 3px; height: 3px; border-radius: 999px; background: rgba(167,139,250,0);
  transition: background 160ms ease, width 200ms var(--bt-ease);
}
.bt-tab.active .bt-tab-dot { background: rgba(167,139,250,.72); width: 14px; }
.bt-tab.active .bt-tab-icon { filter: drop-shadow(0 0 6px rgba(167,139,250,.55)); }
.bt-tab-icon  { font-size: 17px; line-height: 1; }
.bt-tab-label { font-size: 11px; font-weight: 700; letter-spacing: .02em; text-transform: uppercase; }

.bt-fab {
  position: relative; width: 54px; height: 48px; border-radius: 17px;
  border: 1px solid rgba(124,92,252,.30);
  background: linear-gradient(135deg, rgba(124,92,252,.22), rgba(59,77,200,.18), rgba(91,142,248,.14));
  color: rgba(220,210,255,.95); cursor: pointer;
  font-size: 22px; font-weight: 700; line-height: 1; display: grid; place-items: center;
  box-shadow: 0 0 0 1px rgba(167,139,250,.08) inset, 0 8px 28px rgba(0,0,0,.40);
  transition: transform 120ms var(--bt-ease), filter 150ms ease, box-shadow 150ms ease;
  -webkit-tap-highlight-color: transparent; user-select: none;
}
.bt-fab:hover { filter: brightness(1.12); }
.bt-fab:active { transform: scale(.94); box-shadow: 0 0 0 1px rgba(167,139,250,.12) inset, 0 4px 14px rgba(0,0,0,.38); }
.bt-fab::before {
  content:""; position:absolute; top:0; left:12%; right:12%; height:1px;
  background: linear-gradient(90deg, transparent, rgba(167,139,250,.50) 45%, transparent);
  border-radius:999px; pointer-events:none;
}

/* ═══════════════════════════════════════════════════════════════════════
   BACKDROP + SHEET (menu bottom tabs)
═══════════════════════════════════════════════════════════════════════ */
.bt-backdrop {
  position: fixed; inset: 0; z-index: 120;
  background: rgba(4,3,10,.78); display: grid; align-items: end;
  backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
  animation: bt-fade-in 180ms ease;
}
@keyframes bt-fade-in { from{opacity:0} to{opacity:1} }

.bt-sheet {
  position: relative; width: min(720px, 100%); margin: 0 auto;
  border-radius: 22px 22px 0 0; border: 1px solid rgba(124,92,252,.22); border-bottom: 0;
  background: rgba(11,9,22,.96);
  box-shadow: 0 -30px 80px rgba(0,0,0,.60), 0 0 0 1px rgba(167,139,250,.06) inset;
  backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
  overflow: hidden; animation: bt-slide-up 260ms cubic-bezier(.22,1,.36,1);
}
@keyframes bt-slide-up { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }
.bt-sheet::before {
  content:""; position:absolute; top:0; left:6%; right:6%; height:1px;
  background: linear-gradient(90deg,transparent,rgba(167,139,250,.48) 35%,rgba(91,142,248,.34) 65%,transparent);
  pointer-events:none; z-index:2;
}
.bt-sheet::after {
  content:""; position:absolute; top:-60px; left:-60px; width:280px; height:170px; border-radius:50%;
  background: radial-gradient(ellipse,rgba(124,92,252,.12),transparent 70%);
  pointer-events:none;
}

.bt-sheet-top {
  position: relative; z-index:1;
  display: flex; justify-content: space-between; align-items: center;
  padding: 14px 16px 12px; border-bottom: 1px solid rgba(124,92,252,.10);
}
.bt-sheet-title {
  font-family: 'Syne', system-ui, sans-serif;
  font-weight: 800; font-size: 15px; letter-spacing: -.3px;
  color: rgba(235,232,255,.92);
}
.bt-sheet-body {
  position: relative; z-index:1;
  padding: 12px 14px; padding-bottom: calc(16px + var(--bt-safe));
  max-height: min(80vh, 760px); overflow-y: auto;
  display: grid; gap: 10px;
  scrollbar-width: thin; scrollbar-color: rgba(124,92,252,.22) transparent;
}
.bt-sheet-body::-webkit-scrollbar { width:4px; }
.bt-sheet-body::-webkit-scrollbar-track { background:transparent; }
.bt-sheet-body::-webkit-scrollbar-thumb { background:rgba(124,92,252,.22); border-radius:4px; }

.bt-close {
  width:36px; height:36px; border-radius:11px;
  border: 1px solid rgba(124,92,252,.18); background: rgba(255,255,255,.04);
  color: rgba(235,232,255,.65); cursor:pointer; display:grid; place-items:center; font-size:14px;
  transition: background 150ms ease, border-color 150ms ease, transform 130ms var(--bt-ease);
  -webkit-tap-highlight-color:transparent;
}
.bt-close:hover { background:rgba(124,92,252,.12); border-color:rgba(124,92,252,.36); transform:scale(1.06); }

.bt-me {
  display:flex; align-items:center; gap:12px; padding: 12px 14px; border-radius: 16px;
  border: 1px solid rgba(124,92,252,.18); background: rgba(124,92,252,.06);
  text-decoration:none; color:inherit;
  transition: background 140ms ease, border-color 140ms ease, transform 120ms var(--bt-ease);
  -webkit-tap-highlight-color:transparent;
}
.bt-me:active { transform:scale(.98); }
.bt-me:hover  { background:rgba(124,92,252,.10); border-color:rgba(124,92,252,.28); }

.bt-me-ava {
  width:46px; height:46px; border-radius:15px; flex-shrink:0; overflow:hidden;
  border: 1px solid rgba(124,92,252,.22); background: rgba(0,0,0,.35);
  display:grid; place-items:center;
  font-family:'Syne',system-ui,sans-serif; font-size:14px; font-weight:800;
  color:rgba(196,181,253,.80);
}
.bt-me-ava img { width:100%; height:100%; object-fit:cover; display:block; }
.bt-me-name {
  font-family:'Syne',system-ui,sans-serif; font-weight:700; font-size:13px; letter-spacing:-.2px;
  color:rgba(235,232,255,.94); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.bt-me-sub {
  font-family:'Syne',system-ui,sans-serif; font-size:11px; font-weight:500;
  color:rgba(167,155,220,.48); margin-top:3px;
}
.bt-me-arrow { margin-left:auto; flex-shrink:0; font-size:12px; color:rgba(124,92,252,.55); }

.bt-divider {
  height:1px; border-radius:999px; margin:2px 0;
  background: linear-gradient(90deg,rgba(124,92,252,0),rgba(124,92,252,.18),rgba(91,142,248,.12),rgba(91,142,248,0));
}

.bt-section-label {
  font-family:'Syne',system-ui,sans-serif;
  font-size:10px; font-weight:700; letter-spacing:.18em; text-transform:uppercase;
  color:rgba(140,145,195,.48); padding: 2px 2px 4px;
  display:flex; align-items:center; gap:8px;
}
.bt-section-label::before {
  content:""; width:3px; height:10px; border-radius:2px; flex-shrink:0;
  background: linear-gradient(180deg,#a78bfa,#5b8ef8);
}

.bt-menu-list { display:grid; gap:8px; }

.bt-menu-item {
  display:flex; align-items:center; justify-content:space-between; gap:12px;
  padding: 11px 13px; border-radius:14px;
  border: 1px solid rgba(124,92,252,.12); background: rgba(124,92,252,.04);
  color:rgba(235,232,255,.88); text-decoration:none; cursor:pointer;
  font-family:'Syne',system-ui,sans-serif; font-size:13px; font-weight:700; letter-spacing:-.15px;
  text-align:left; width:100%;
  transition: background 140ms ease, border-color 140ms ease, transform 120ms var(--bt-ease);
  -webkit-tap-highlight-color:transparent;
}
.bt-menu-item:hover  { background:rgba(124,92,252,.10); border-color:rgba(124,92,252,.24); }
.bt-menu-item:active { transform:translateX(2px); }
.bt-menu-item-left { display:inline-flex; align-items:center; gap:10px; min-width:0; }
.bt-menu-item-icon { font-size:16px; flex-shrink:0; }
.bt-menu-item-label { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.bt-menu-item-arrow { font-size:11px; color:rgba(124,92,252,.50); flex-shrink:0; }

.bt-menu-item-danger {
  border-color:rgba(239,68,68,.14); background:rgba(239,68,68,.04); color:rgba(252,165,165,.75);
}
.bt-menu-item-danger:hover { background:rgba(239,68,68,.10); border-color:rgba(239,68,68,.28); }
.bt-menu-item-danger .bt-menu-item-arrow { color:rgba(239,68,68,.40); }

.bt-rewards-wrap {
  display:grid; gap:8px; padding: 12px; border-radius:16px;
  border: 1px solid rgba(124,92,252,.14); background: rgba(124,92,252,.04);
}
.bt-rewards-label {
  display:flex; align-items:center; gap:9px;
  font-family:'Syne',system-ui,sans-serif; font-size:11px; font-weight:700;
  color:rgba(167,139,250,.70);
}

/* ═══════════════════════════════════════════════════════════════════════
   MODAL CLIPS CENTRÉE (pas de sheet)
═══════════════════════════════════════════════════════════════════════ */
.bt-modal-backdrop {
  position:fixed; inset:0; z-index:125;
  background:rgba(4,3,10,.82);
  backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px);
  display:grid; place-items:center; padding:16px;
  animation:bt-fade-in 180ms ease;
}

.bt-modal-dialog {
  position:relative; width:100%; max-width:680px;
  border-radius:22px;
  border:1px solid rgba(124,92,252,.22);
  background:rgba(11,9,22,.98);
  box-shadow:0 40px 100px rgba(0,0,0,.72), 0 0 0 1px rgba(167,139,250,.07) inset, 0 0 60px rgba(124,92,252,.09);
  backdrop-filter:blur(24px); -webkit-backdrop-filter:blur(24px);
  overflow:hidden;
  animation:bt-modal-in 260ms cubic-bezier(.22,1,.36,1);
  display:flex; flex-direction:column;
  max-height:calc(100vh - 32px);
}
@keyframes bt-modal-in { from { opacity:0; transform:translateY(18px) scale(.97); } to { opacity:1; transform:translateY(0) scale(1); } }

.bt-modal-dialog::before {
  content:""; position:absolute; top:0; left:6%; right:6%; height:1px;
  background:linear-gradient(90deg,transparent,rgba(167,139,250,.48) 35%,rgba(91,142,248,.34) 65%,transparent);
  pointer-events:none; z-index:2;
}
.bt-modal-dialog::after {
  content:""; position:absolute; top:-60px; left:-60px;
  width:300px; height:190px; border-radius:50%;
  background:radial-gradient(ellipse,rgba(124,92,252,.12),transparent 70%);
  pointer-events:none; z-index:0;
}

.bt-modal-header {
  position:relative; z-index:1;
  display:flex; justify-content:space-between; align-items:center;
  padding:15px 18px 13px;
  border-bottom:1px solid rgba(124,92,252,.10);
  flex-shrink:0;
}
.bt-modal-header-left { display:flex; flex-direction:column; gap:4px; min-width:0; flex:1; }

.bt-modal-title {
  font-family:'Syne',system-ui,sans-serif;
  font-weight:800; font-size:15px; letter-spacing:-.3px;
  color:rgba(235,232,255,.94);
}
.bt-modal-meta {
  display:flex; align-items:center; gap:8px; flex-wrap:wrap;
  font-size:11px; font-weight:500;
  color:rgba(167,155,220,.55);
}
.bt-modal-meta-dot { opacity:.45; }

.bt-modal-body {
  position:relative; z-index:1;
  padding:14px 16px 16px;
  overflow-y:auto; flex:1;
  scrollbar-width:thin; scrollbar-color:rgba(124,92,252,.22) transparent;
}
.bt-modal-body::-webkit-scrollbar { width:4px; }
.bt-modal-body::-webkit-scrollbar-track { background:transparent; }
.bt-modal-body::-webkit-scrollbar-thumb { background:rgba(124,92,252,.22); border-radius:4px; }

/* Liste clips dans modal */
.bt-clips-list { display:flex; flex-direction:column; gap:8px; }

.bt-clip-item {
  display:grid; grid-template-columns:80px 1fr; gap:12px; align-items:center;
  width:100%; text-align:left; cursor:pointer;
  padding:11px 13px; border-radius:14px;
  border:1px solid rgba(124,92,252,.12); background:rgba(124,92,252,.04);
  color:inherit;
  transition: background 140ms ease, border-color 140ms ease, transform 120ms var(--bt-ease);
  -webkit-tap-highlight-color:transparent;
}
.bt-clip-item:hover { background:rgba(124,92,252,.10); border-color:rgba(124,92,252,.24); }
.bt-clip-item:active { transform:translateX(2px); }

.bt-clip-thumb {
  width:80px; height:45px; border-radius:11px; overflow:hidden;
  border:1px solid rgba(124,92,252,.14); background:rgba(0,0,0,.35);
  position:relative; flex-shrink:0;
}
.bt-clip-thumb-bg {
  position:absolute; inset:0;
  background-size:cover; background-position:center; background-repeat:no-repeat;
  opacity:.88;
}
.bt-clip-thumb-play {
  position:absolute; inset:0; display:grid; place-items:center;
  font-size:18px; color:rgba(255,255,255,.85);
  text-shadow:0 2px 8px rgba(0,0,0,.60);
}

.bt-clip-info { display:flex; flex-direction:column; gap:4px; min-width:0; }
.bt-clip-title {
  font-weight:700; font-size:12px; letter-spacing:-.15px;
  color:rgba(235,232,255,.90);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.bt-clip-meta {
  font-size:10px; font-weight:500;
  color:rgba(167,155,220,.50);
  display:flex; align-items:center; gap:6px; flex-wrap:wrap;
}

.bt-clip-likes {
  display:inline-flex; gap:5px; align-items:center;
  padding:4px 9px; border-radius:999px;
  background:rgba(0,0,0,.45); border:1px solid rgba(255,255,255,.10);
  font-weight:700; font-size:11px;
  color:rgba(235,232,255,.85); white-space:nowrap;
}

.bt-empty {
  font-size:12px; font-weight:500;
  color:rgba(167,155,220,.45); padding:8px 0; text-align:center;
}

/* ═══════════════════════════════════════════════════════════════════════
   CLIP PLAYER
═══════════════════════════════════════════════════════════════════════ */
.bt-player-backdrop {
  position:fixed; inset:0; z-index:130;
  background:rgba(4,3,10,.82);
  backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px);
  display:grid; place-items:center; padding:16px;
  animation:bt-fade-in 180ms ease;
}

.bt-player-dialog {
  position:relative; width:100%; max-width:720px;
  border-radius:22px;
  border:1px solid rgba(124,92,252,.22);
  background:rgba(11,9,22,.98);
  box-shadow:0 40px 100px rgba(0,0,0,.72), 0 0 0 1px rgba(167,139,250,.07) inset;
  backdrop-filter:blur(24px); -webkit-backdrop-filter:blur(24px);
  overflow:hidden;
  animation:bt-modal-in 260ms cubic-bezier(.22,1,.36,1);
  display:flex; flex-direction:column;
  max-height:calc(100vh - 32px);
}
.bt-player-dialog::before {
  content:""; position:absolute; top:0; left:6%; right:6%; height:1px;
  background:linear-gradient(90deg,transparent,rgba(167,139,250,.48) 35%,rgba(91,142,248,.34) 65%,transparent);
  pointer-events:none; z-index:2;
}

.bt-player-header {
  position:relative; z-index:1;
  display:flex; align-items:flex-start; justify-content:space-between; gap:12px;
  padding:15px 18px 13px;
  border-bottom:1px solid rgba(124,92,252,.10);
  flex-shrink:0;
}
.bt-player-header-left { display:flex; flex-direction:column; gap:4px; min-width:0; flex:1; }

.bt-player-title {
  font-weight:800; font-size:15px; letter-spacing:-.3px; line-height:1.2;
  color:rgba(235,232,255,.94);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.bt-player-meta {
  display:flex; align-items:center; gap:8px; flex-wrap:wrap;
  font-size:11px; font-weight:500;
  color:rgba(167,155,220,.55);
}
.bt-player-meta a {
  color:rgba(196,181,253,.80); font-weight:700; text-decoration:none;
  transition:color 150ms ease;
}
.bt-player-meta a:hover { color:rgba(224,210,255,.96); }

.bt-player-actions {
  display:inline-flex; gap:7px; align-items:center; flex-shrink:0; flex-wrap:wrap;
}

.bt-player-like {
  display:inline-flex; align-items:center; gap:7px;
  height:36px; padding:0 13px; border-radius:11px;
  border:1px solid rgba(239,68,68,.22); background:rgba(239,68,68,.08);
  color:rgba(252,165,165,.85); cursor:pointer;
  font-size:12px; font-weight:700;
  transition:background 150ms ease, border-color 150ms ease, transform 120ms var(--bt-ease);
  -webkit-tap-highlight-color:transparent;
}
.bt-player-like:hover:not(:disabled) { background:rgba(239,68,68,.14); border-color:rgba(239,68,68,.36); transform:translateY(-1px); }
.bt-player-like:disabled { opacity:.40; cursor:not-allowed; }
.bt-player-like.is-liked { border-color:rgba(239,68,68,.40); background:rgba(239,68,68,.16); color:rgba(252,165,165,.95); }

.bt-player-body {
  position:relative; z-index:1;
  padding:14px 16px 16px;
  display:flex; flex-direction:column; gap:12px;
  overflow-y:auto; flex:1;
}

.bt-player-video {
  width:100%; border-radius:14px;
  background:#000;
  border:1px solid rgba(124,92,252,.16);
  display:block;
}

.bt-player-status {
  padding:8px 12px; border-radius:10px;
  border:1px solid rgba(124,92,252,.16); background:rgba(124,92,252,.08);
  font-size:11px; font-weight:500;
  color:rgba(200,195,240,.80);
}
`;

let _btCssInjected = false;
function useBottomTabsStyles() {
  React.useEffect(() => {
    if (_btCssInjected) return;
    const el = document.createElement("style");
    el.id = "bt-css"; el.textContent = CSS;
    document.head.appendChild(el);
    _btCssInjected = true;
  }, []);
}

/* ─── Types ─────────────────────────────────────────────────────────── */
type MenuLink   = { kind: "link";   to: string; label: string; icon?: string; danger?: boolean };
type MenuAction = { kind: "action"; label: string; icon?: string; danger?: boolean; onClick: () => void };
type MenuItem   = MenuLink | MenuAction;

/* ─── ClipsListModal (MODAL CENTRÉE) ─────────────────────────────────── */
function ClipsListModal({ clips, total, onClose, onPickClip }: {
  clips: ClipVM[]; total: number;
  onClose: () => void; onPickClip: (c: ClipVM) => void;
}) {
  return (
    <div className="bt-modal-backdrop" onClick={onClose} role="presentation">
      <div className="bt-modal-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {/* Header */}
        <div className="bt-modal-header">
          <div className="bt-modal-header-left">
            <div className="bt-modal-title">🎬 Clips du mois</div>
            <div className="bt-modal-meta">
              <span>Tri par ❤️ les plus likés</span>
              <span className="bt-modal-meta-dot">•</span>
              <span>{total || clips.length} clip{(total || clips.length) > 1 ? "s" : ""}</span>
            </div>
          </div>
          <button className="bt-close" type="button" aria-label="Fermer" onClick={onClose}>✕</button>
        </div>

        {/* Body */}
        <div className="bt-modal-body">
          {clips.length === 0 ? (
            <div className="bt-empty">Aucun clip pour le moment.</div>
          ) : (
            <div className="bt-clips-list">
              {clips.map((c) => {
                const name = c.streamerName || c.streamerSlug || "Streamer";
                const thumbUrl = absolutize(c.thumbUrl) || c.thumbUrl;
                return (
                  <button key={c.id} type="button" className="bt-clip-item" onClick={() => onPickClip(c)}>
                    {/* Thumb */}
                    <div className="bt-clip-thumb">
                      {thumbUrl && (
                        <div className="bt-clip-thumb-bg" style={{ backgroundImage: `url(${thumbUrl})` }} />
                      )}
                      <div className="bt-clip-thumb-play">▶</div>
                    </div>

                    {/* Info */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                      <div className="bt-clip-info">
                        <div className="bt-clip-title">{c.title || "(sans titre)"}</div>
                        <div className="bt-clip-meta">
                          <span>{name}</span>
                          <span className="bt-modal-meta-dot">•</span>
                          <span>{timeAgo(c.createdAtMs)}</span>
                          <span className="bt-modal-meta-dot">•</span>
                          <span>{fmtDuration(c.durationSec)}</span>
                        </div>
                      </div>
                      <div className="bt-clip-likes">❤️ {Number(c.likesCount || 0)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── ClipPlayerModal ────────────────────────────────────────────────── */
function ClipPlayerModal({ clip, token, onPatchClip, onClose }: {
  clip: ClipVM; token: string | null;
  onPatchClip: (id: number, patch: Partial<ClipVM>) => void;
  onClose: () => void;
}) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);

  const mp4 = String((clip as any).clipUrl || "").trim() || null;
  const canLike = !!token && !clip.myLiked;

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video || !mp4) return;
    video.src = mp4;
    const onMeta = () => video.play().catch(() => {});
    video.addEventListener("loadedmetadata", onMeta);
    return () => {
      try { video.removeEventListener("loadedmetadata", onMeta); } catch {}
      try { video.pause(); } catch {}
      try { video.removeAttribute("src"); video.load(); } catch {}
    };
  }, [clip, mp4]);

  async function doLike() {
    if (!token) { setStatus("Connecte-toi pour liker."); return; }
    if (!canLike || busy) return;
    setBusy(true); setStatus(null);
    onPatchClip(clip.id, { myLiked: true, likesCount: Math.max(0, Number(clip.likesCount || 0) + 1) });
    try {
      const res = await fetch(`${API_BASE}/clips/${clip.id}/like`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ like: true }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j || j.ok === false) throw new Error(String(j?.error || `http_${res.status}`));
      onPatchClip(clip.id, { myLiked: !!j.myLiked, likesCount: Number(j.likesCount || 0) || 0 });
      setStatus("Liké ✅");
    } catch (e: any) {
      onPatchClip(clip.id, { myLiked: clip.myLiked, likesCount: clip.likesCount });
      setStatus(`Erreur like : ${String(e?.message || "failed")}`);
    } finally { setBusy(false); }
  }

  return (
    <div className="bt-player-backdrop" onClick={onClose} role="presentation">
      <div className="bt-player-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="bt-player-header">
          <div className="bt-player-header-left">
            <div className="bt-player-title">{clip.title || "Clip"}</div>
            <div className="bt-player-meta">
              <span>Par{" "}
                <Link to={clip.streamerSlug ? `/s/${encodeURIComponent(clip.streamerSlug)}` : "#"} onClick={onClose}>
                  {clip.streamerName || clip.streamerSlug || "Streamer"}
                </Link>
              </span>
              <span className="bt-modal-meta-dot">•</span>
              <span>❤️ {Number(clip.likesCount || 0)}</span>
              <span className="bt-modal-meta-dot">•</span>
              <span>{fmtDuration(clip.durationSec)}</span>
              <span className="bt-modal-meta-dot">•</span>
              <span>{timeAgo(clip.createdAtMs)}</span>
            </div>
          </div>

          <div className="bt-player-actions">
            <button
              className={`bt-player-like${clip.myLiked ? " is-liked" : ""}`}
              type="button"
              onClick={() => void doLike()}
              disabled={busy || !canLike}
              title={!token ? "Connecte-toi pour liker" : clip.myLiked ? "Déjà liké" : "Liker ce clip"}
            >
              <span>{clip.myLiked ? "❤️" : "🤍"}</span>
              <span>{Number(clip.likesCount || 0)}</span>
            </button>
            <button className="bt-close" type="button" aria-label="Fermer" onClick={onClose} disabled={busy}>✕</button>
          </div>
        </div>

        <div className="bt-player-body">
          {!mp4 ? (
            <div className="bt-empty">Vidéo indisponible pour le moment.</div>
          ) : (
            <video ref={videoRef} className="bt-player-video" controls playsInline />
          )}
          {status && <div className="bt-player-status">{status}</div>}
        </div>
      </div>
    </div>
  );
}

/* ─── Composant principal ───────────────────────────────────────────── */
export function BottomTabs() {
  useBottomTabsStyles();

  const location = useLocation();
  const authAny   = useAuth() as any;
  const userAny   = authAny?.user ?? null;
  const token     = authAny?.token ?? null;

  const CONTENT_KEYS = ["daily_bonus_infos", "guide_viewer", "guide_streamer"] as const;
  const [unreadBonus, setUnreadBonus] = React.useState(false);

  const reloadUnreadBonus = React.useCallback(async () => {
    if (!token) { setUnreadBonus(false); return; }
    try {
      const results = await Promise.all(
        CONTENT_KEYS.map(async (k) => {
          const r: any = await publicGetContent(k);
          const item = r?.item ?? null;
          if (!item) return false;
          return isUnread(`content:${k}`, contentVersionFromItem(item));
        })
      );
      setUnreadBonus(results.some(Boolean));
    } catch { setUnreadBonus(false); }
  }, [token]);

  React.useEffect(() => { reloadUnreadBonus(); }, [reloadUnreadBonus]);
  React.useEffect(() => {
    const onSeen    = () => reloadUnreadBonus();
    const onStorage = () => reloadUnreadBonus();
    window.addEventListener("ll:content-seen", onSeen as any);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("ll:content-seen", onSeen as any);
      window.removeEventListener("storage", onStorage);
    };
  }, [reloadUnreadBonus]);

  const username  = String(userAny?.username || "");
  const avatarSrc = pickUserAvatarUrl(userAny);
  const [avatarOk, setAvatarOk] = React.useState(true);
  React.useEffect(() => setAvatarOk(true), [avatarSrc]);

  const [open, setOpen] = React.useState(false);

  const [clips, setClips] = React.useState<ClipVM[]>([]);
  const [clipsTotal, setClipsTotal] = React.useState(0);
  const [showClipsList, setShowClipsList] = React.useState(false);
  const [showClipPlayer, setShowClipPlayer] = React.useState<ClipVM | null>(null);

  const loadClips = React.useCallback(async () => {
    try {
      const r = await fetchTopClipsMonth(token);
      setClips(r.clips);
      setClipsTotal(r.total || r.clips.length);
    } catch {
      // Silent fail
    }
  }, [token]);

  React.useEffect(() => { loadClips(); }, [loadClips]);

  function patchClip(id: number, patch: Partial<ClipVM>) {
    setClips((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    setShowClipPlayer((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));
  }

  function openClipsList() {
    setShowClipsList(true);
    setOpen(false);
  }

  React.useEffect(() => {
    setOpen(false);
    setShowClipsList(false);
    setShowClipPlayer(null);
  }, [location.pathname, location.search]);

  React.useEffect(() => {
    if (!open && !showClipsList && !showClipPlayer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showClipPlayer) {
          setShowClipPlayer(null);
          return;
        }
        if (showClipsList) setShowClipsList(false);
        else setOpen(false);
      }
    };
    const prev  = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = prev;
    };
  }, [open, showClipsList, showClipPlayer]);

  const tabCls = ({ isActive }: { isActive: boolean }) => `bt-tab${isActive ? " active" : ""}`;

  function openReport() {
    window.dispatchEvent(new Event("ui:report_open"));
    setOpen(false);
  }

  const menuItems: MenuItem[] = [
    { kind: "action", label: "Clips du mois", icon: "🎬", onClick: openClipsList },
    { kind: "link", to: "/casinos", label: "CheckTaSlot", icon: "🎰" },
    { kind: "link", to: "/hunt",    label: "Hunt",        icon: "🧿" },
    { kind: "link", to: "/shop",    label: "Shop",        icon: "🛍️" },
  ];

  return (
    <div className="bt-root">
      <nav className="bt-bar" aria-label="Navigation principale">
        <NavLink to="/" end className={tabCls} aria-label="Lives">
          <span className="bt-tab-icon">📡</span>
          <span className="bt-tab-label">Lives</span>
          <span className="bt-tab-dot" aria-hidden />
        </NavLink>

        <button type="button" className="bt-fab" onClick={() => setOpen(true)} aria-label="Ouvrir le menu" aria-haspopup="dialog" aria-expanded={open}>
          <span style={{ position:"absolute", top:6, right:7 }}>
            <UnreadBadge show={unreadBonus} title="Nouveautés • Bonus quotidien" />
          </span>
          ⋯
        </button>

        <NavLink to="/browse" className={tabCls} aria-label="Browse">
          <span className="bt-tab-icon">◈</span>
          <span className="bt-tab-label">Browse</span>
          <span className="bt-tab-dot" aria-hidden />
        </NavLink>
      </nav>

      <div className="bt-spacer" aria-hidden />

      {/* MENU (sheet du bas) */}
      {open && (
        <div className="bt-backdrop" role="presentation" onClick={() => setOpen(false)}>
          <div className="bt-sheet" role="dialog" aria-modal="true" aria-label="Menu" onClick={(e) => e.stopPropagation()}>
            <div className="bt-sheet-top">
              <span className="bt-sheet-title">Menu</span>
              <button className="bt-close" type="button" aria-label="Fermer" onClick={() => setOpen(false)}>✕</button>
            </div>

            <div className="bt-sheet-body">
              <Link to="/profile" className="bt-me" onClick={() => setOpen(false)} aria-label="Mon compte">
                <div className="bt-me-ava" aria-hidden>
                  {avatarSrc && avatarOk ? (
                    <img src={String(avatarSrc)} alt="" onError={() => setAvatarOk(false)} />
                  ) : (
                    <span>{initials(username)}</span>
                  )}
                </div>
                <div style={{ minWidth:0 }}>
                  <div className="bt-me-name">{username || "Mon compte"}</div>
                  <div className="bt-me-sub">Profil · Options</div>
                </div>
                <span className="bt-me-arrow" aria-hidden>›</span>
              </Link>

              <div className="bt-divider" aria-hidden />

              <div className="bt-section-label">Navigation</div>
              <div className="bt-menu-list">
                {menuItems.map((it) =>
                  it.kind === "link" ? (
                    <Link key={it.to} to={it.to} className={`bt-menu-item${it.danger ? " bt-menu-item-danger" : ""}`} onClick={() => setOpen(false)} aria-label={it.label}>
                      <span className="bt-menu-item-left">
                        <span className="bt-menu-item-icon" aria-hidden>{it.icon ?? "•"}</span>
                        <span className="bt-menu-item-label">{it.label}</span>
                      </span>
                      <span className="bt-menu-item-arrow" aria-hidden>›</span>
                    </Link>
                  ) : (
                    <button key={it.label} type="button" className={`bt-menu-item${it.danger ? " bt-menu-item-danger" : ""}`} onClick={it.onClick} aria-label={it.label}>
                      <span className="bt-menu-item-left">
                        <span className="bt-menu-item-icon" aria-hidden>{it.icon ?? "•"}</span>
                        <span className="bt-menu-item-label">{it.label}</span>
                      </span>
                      <span className="bt-menu-item-arrow" aria-hidden>›</span>
                    </button>
                  )
                )}
              </div>

              <div className="bt-divider" aria-hidden />

              <div className="bt-section-label">
                Récompenses
                <UnreadBadge show={unreadBonus} title="Nouveautés à lire" />
              </div>
              <div className="bt-rewards-wrap">
                <div className="bt-rewards-label">
                  <span aria-hidden>🎁</span> Bonus quotidien
                </div>
                <DailyBonusAccessCard />
              </div>
              <div className="bt-rewards-wrap">
                <DailyWheelCard />
              </div>

              <div className="bt-divider" aria-hidden />

              <button type="button" className="bt-menu-item bt-menu-item-danger" onClick={openReport} aria-label="Signaler un problème">
                <span className="bt-menu-item-left">
                  <span className="bt-menu-item-icon" aria-hidden>🚩</span>
                  <span className="bt-menu-item-label">Signaler un problème</span>
                </span>
                <span className="bt-menu-item-arrow" aria-hidden>›</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CLIPS (centrée) */}
      {showClipsList && (
        <ClipsListModal
          clips={clips}
          total={clipsTotal || clips.length}
          onClose={() => setShowClipsList(false)}
          onPickClip={(c) => setShowClipPlayer(c)}
        />
      )}

      {/* MODAL PLAYER (centrée) */}
      {showClipPlayer && (
        <ClipPlayerModal
          clip={showClipPlayer}
          token={token}
          onPatchClip={patchClip}
          onClose={() => setShowClipPlayer(null)}
        />
      )}
    </div>
  );
}