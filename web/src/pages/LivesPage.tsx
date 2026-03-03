// web/src/pages/LivesPage.tsx
import * as React from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Hls from "hls.js";

import { formatViewers } from "../lib/format";
import { getLives } from "../lib/api";
import { svgThumb } from "../lib/thumb";
import type { LiveCard } from "../lib/types";
import { setSeo } from "../lib/seo";

import { DailyWheelCard } from "../components/DailyWheelCard";
import { DailyBonusAccessCard } from "../components/DailyBonusAccessCard";
import { useAuth } from "../auth/AuthProvider";
import { useIsMobile } from "../hooks/useIsMobile";
import LivesPageMobile from "./LivesPage.mobile";
import "./LivesPage.css";

export type LiveCardVM = LiveCard & {
  thumbFallback: string;
  thumbFinal: string;
  durationLabel?: string | null;
  featured?: boolean;
};

export type ClipVM = {
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

const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

/* ─── utils ─────────────────────────────────────────────────────────── */
function formatDurationDot(startIso: string, nowMs: number) {
  const start = Date.parse(startIso);
  if (!Number.isFinite(start)) return null;
  const diff = Math.max(0, nowMs - start);
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return `${h}.${String(m).padStart(2, "0")}`;
}

function with5MinBust(url: string, nowMs: number) {
  const t = Math.floor(nowMs / 300000);
  return url.includes("?") ? `${url}&t=${t}` : `${url}?t=${t}`;
}

function absolutize(url: string | null) {
  if (!url) return null;
  const u = String(url);
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/") && API_BASE) return `${API_BASE}${u}`;
  return u;
}

function preloadImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload  = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
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

function safeTitle(v: any) {
  return String(v || "clip").trim().replace(/[^a-z0-9-_]+/gi, "_").slice(0, 80) || "clip";
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function fetchMp4BlobWithProgress(
  clipId: number,
  onProgress: (loaded: number, total: number | null) => void
) {
  const url = `${API_BASE}/clips/${clipId}/mp4`;
  const r = await fetch(url, { method: "GET" });
  if (!r.ok || !r.body) {
    const txt = await r.text().catch(() => "");
    throw new Error(`download_${r.status}${txt ? `:${txt.slice(0, 120)}` : ""}`);
  }
  const total = Number(r.headers.get("content-length") || 0) || null;
  const reader = r.body.getReader();
  let loaded = 0;
  const parts: BlobPart[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    parts.push(new Uint8Array(value));
    loaded += value.byteLength;
    onProgress(loaded, total);
  }
  return new Blob(parts, { type: r.headers.get("content-type") || "video/mp4" });
}

/* ─── UI primitives ─────────────────────────────────────────────────── */

function Pill({
  tone, children, title,
}: {
  tone: "neutral" | "live" | "brand" | "gold";
  children: React.ReactNode;
  title?: string;
}) {
  const map: Record<string, { bg: string; bd: string; color?: string }> = {
    brand:   { bg: "rgba(124,92,252,0.16)",  bd: "rgba(124,92,252,0.30)" },
    live:    { bg: "rgba(239,68,68,0.14)",   bd: "rgba(239,68,68,0.28)",  color: "#fca5a5" },
    gold:    { bg: "rgba(251,191,36,0.14)",  bd: "rgba(251,191,36,0.28)", color: "#fde68a" },
    neutral: { bg: "rgba(0,0,0,0.48)",       bd: "rgba(255,255,255,0.10)" },
  };
  const t = map[tone] ?? map.neutral;
  return (
    <span title={title} style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "5px 10px", borderRadius: 999,
      border: `1px solid ${t.bd}`, background: t.bg,
      fontSize: 11, fontFamily: "var(--ll-font-display)",
      fontWeight: 700, letterSpacing: "-0.05px",
      color: t.color ?? "rgba(235,232,255,0.92)",
      whiteSpace: "nowrap",
      backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
    }}>
      {children}
    </span>
  );
}

function GlassCard({ children, style, className }: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <div className={className} style={{
      position: "relative", borderRadius: 20,
      border: "1px solid rgba(124,92,252,0.14)",
      background: "rgba(13,11,24,0.82)",
      boxShadow: "0 18px 55px rgba(0,0,0,0.38)",
      backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
      overflow: "hidden", ...style,
    }}>
      {/* Reflet haut signature */}
      <div aria-hidden style={{
        position: "absolute", top: 0, left: "8%", right: "8%", height: 1,
        background: "linear-gradient(90deg, transparent, rgba(167,139,250,0.35) 40%, rgba(91,142,248,0.25) 60%, transparent)",
        pointerEvents: "none", zIndex: 2,
      }} />
      {children}
    </div>
  );
}

function LiveBackdrop({ url }: { url: string }) {
  return (
    <>
      <div aria-hidden style={{
        position: "absolute", inset: 0,
        backgroundImage: `url(${url})`,
        backgroundRepeat: "no-repeat", backgroundPosition: "center",
        backgroundSize: "contain", backgroundColor: "rgba(0,0,0,0.35)",
        opacity: 0.92, filter: "contrast(1.06) saturate(1.18) brightness(1.02)",
        pointerEvents: "none",
      }} />
      <div aria-hidden style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(90deg, rgba(0,0,0,0.62), rgba(0,0,0,0.22) 55%, rgba(0,0,0,0.70)), radial-gradient(900px 420px at 50% 0%, rgba(255,255,255,0.06), rgba(0,0,0,0) 60%)",
        pointerEvents: "none",
      }} />
    </>
  );
}

/* ─── LiveCard shared inner layout ─────────────────────────────────── */
function LiveCardBody({ live, accentColor }: {
  live: LiveCardVM & { followersCount?: number; avatarUrl?: string | null };
  accentColor: string;
}) {
  return (
    <div style={{ padding: "12px 14px 14px" }}>
      <div className="liveTitle" title={live.title || ""} style={{
        fontFamily: "var(--ll-font-display)", fontWeight: 700, fontSize: 13,
        letterSpacing: "-0.2px", color: "rgba(200,195,240,0.88)",
      }}>
        {live.title || "—"}
      </div>

      <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 12, overflow: "hidden",
          border: `1px solid ${accentColor}`, background: "rgba(0,0,0,0.35)",
          flexShrink: 0,
        }} aria-hidden>
          <img
            src={absolutize((live as any).avatarUrl || (live as any).avatar_url || null) || svgThumb(live.displayName || "Streamer")}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).src = svgThumb(live.displayName || "Streamer"); }}
          />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontFamily: "var(--ll-font-display)", fontWeight: 700, fontSize: 13,
            letterSpacing: "-0.3px", whiteSpace: "nowrap", overflow: "hidden",
            textOverflow: "ellipsis", color: "rgba(235,232,255,0.94)",
          }} title={live.displayName}>
            {live.displayName}
          </div>
          <div style={{
            fontSize: 11, fontFamily: "var(--ll-font-display)", fontWeight: 500,
            color: "rgba(167,155,220,0.52)", marginTop: 1,
          }}>
            {formatViewers(Number((live as any).followersCount || 0))} follow
          </div>
        </div>
      </div>

      {/* Trait bas signature */}
      <div aria-hidden style={{
        marginTop: 12, height: 1, borderRadius: 999,
        background: accentColor.includes("251,191") // gold
          ? "linear-gradient(90deg, rgba(251,191,36,0.0), rgba(251,191,36,0.40), rgba(251,191,36,0.0))"
          : "linear-gradient(90deg, rgba(124,92,252,0.0), rgba(124,92,252,0.35), rgba(91,142,248,0.25), rgba(91,142,248,0.0))",
      }} />
    </div>
  );
}

/* ─── Fetch helpers ─────────────────────────────────────────────────── */
async function fetchStreamersIndex(): Promise<{
  featuredLiveSlugs: Set<string>;
  metaBySlug: Map<string, { avatarUrl: string | null; followersCount: number }>;
}> {
  try {
    const res = await fetch(`${API_BASE}/streamers`, { headers: { "content-type": "application/json" } });
    const data = await res.json().catch(() => null);
    if (!res.ok || !Array.isArray(data)) return { featuredLiveSlugs: new Set(), metaBySlug: new Map() };

    const featuredLiveSlugs = new Set<string>();
    const metaBySlug = new Map<string, { avatarUrl: string | null; followersCount: number }>();

    for (const s of data) {
      if (!s) continue;
      const slug = String(s.slug || "").trim();
      if (!slug) continue;
      if (!!s.isLive && !!s.featured) featuredLiveSlugs.add(slug);

      const avatarUrlRaw = s.avatarUrl != null ? String(s.avatarUrl)
        : s.avatar_url != null ? String(s.avatar_url)
        : s.profilePictureUrl != null ? String(s.profilePictureUrl)
        : s.profile_picture_url != null ? String(s.profile_picture_url)
        : null;

      const followersCount = Number(
        s.followsCount ?? s.follows_count ?? s.followersCount ??
        s.followers_count ?? s.followers ?? s.followersTotal ?? s.followers_total ?? 0
      ) || 0;

      metaBySlug.set(slug, { avatarUrl: avatarUrlRaw ? absolutize(avatarUrlRaw) : null, followersCount });
    }
    return { featuredLiveSlugs, metaBySlug };
  } catch {
    return { featuredLiveSlugs: new Set(), metaBySlug: new Map() };
  }
}

const followsCache = new Map<string, { n: number; ts: number }>();

async function fetchFollowsCountBySlug(slug: string, token: string | null): Promise<number | null> {
  const s = String(slug || "").trim().toLowerCase();
  if (!s) return null;
  const cached = followsCache.get(s);
  const now = Date.now();
  if (cached && now - cached.ts < 120_000) return cached.n;
  try {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = await fetch(`${API_BASE}/streamers/${encodeURIComponent(s)}`, { headers });
    const j = await r.json().catch(() => null);
    const out = Number.isFinite(Number(j?.followsCount)) ? Number(j.followsCount) : 0;
    followsCache.set(s, { n: out, ts: now });
    return out;
  } catch { return null; }
}

async function fetchFollowsCountsForLives(slugs: string[], token: string | null): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const uniq = Array.from(new Set(slugs.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean)));
  if (!uniq.length) return out;
  let i = 0;
  const worker = async () => {
    while (i < uniq.length) {
      const slug = uniq[i++]!;
      const n = await fetchFollowsCountBySlug(slug, token);
      if (typeof n === "number") out.set(slug, n);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, uniq.length) }, worker));
  return out;
}

async function fetchViewersBatchPublic(slugs: string[]): Promise<Map<string, number> | null> {
  if (!slugs.length) return new Map();
  try {
    const url = `${API_BASE}/api/viewers?slugs=${encodeURIComponent(slugs.join(","))}&_=${Date.now()}`;
    const r = await fetch(url, { cache: "no-store" });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || j.ok === false) return null;
    const raw = j.viewers ?? j.counts ?? j.data ?? null;
    if (!raw || typeof raw !== "object") return null;
    const m = new Map<string, number>();
    for (const [k, v] of Object.entries(raw)) {
      const n = Number(v);
      m.set(String(k).toLowerCase(), Number.isFinite(n) ? n : 0);
    }
    return m;
  } catch { return null; }
}

async function fetchViewersPerSlugOverlay(slugs: string[], token: string | null): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!slugs.length || !token) return out;
  await Promise.allSettled(slugs.map(async (slug) => {
    const s = String(slug || "").trim().toLowerCase();
    if (!s) return;
    try {
      const r = await fetch(`${API_BASE}/overlay/api/viewers?slug=${encodeURIComponent(s)}&_=${Date.now()}`, {
        cache: "no-store", headers: { Authorization: `Bearer ${token}` },
      });
      const j = await r.json().catch(() => null);
      const v = Number(j?.viewers ?? j?.count);
      out.set(s, Number.isFinite(v) ? v : 0);
    } catch { out.set(s, 0); }
  }));
  return out;
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

/* ─── ClipLikesBadge ─────────────────────────────────────────────────── */
function ClipLikesBadge({ likes, corner }: { likes: number; corner: "tl" | "tr" | "br" | "bl" }) {
  const pos: Record<string, React.CSSProperties> = {
    tl: { top: 8, left: 8 }, tr: { top: 8, right: 8 },
    br: { bottom: 8, right: 8 }, bl: { bottom: 8, left: 8 },
  };
  return (
    <span style={{
      position: "absolute", ...pos[corner],
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "5px 9px", borderRadius: 999,
      fontSize: 11, fontFamily: "var(--ll-font-display)", fontWeight: 700,
      background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.10)",
      backdropFilter: "blur(10px)", pointerEvents: "none",
    }} title={`${likes} likes`}>
      ❤️ {likes}
    </span>
  );
}

/* ─── CSS modals clips ───────────────────────────────────────────────── */
const CLIP_MODAL_CSS = `
@keyframes cpm-fade-in  { from{opacity:0} to{opacity:1} }
@keyframes cpm-slide-up { from{opacity:0;transform:translateY(18px) scale(.97)} to{opacity:1;transform:translateY(0) scale(1)} }

/* ── Backdrop ── */
.cpm-backdrop {
  position:fixed;inset:0;
  display:grid;place-items:center;padding:16px;
  background:rgba(4,3,10,.80);
  backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
  animation:cpm-fade-in 180ms ease;
}

/* ── Dialog générique ── */
.cpm-dialog {
  position:relative;width:100%;
  border-radius:22px;
  border:1px solid rgba(124,92,252,.22);
  background:rgba(11,9,22,.96);
  box-shadow:0 40px 100px rgba(0,0,0,.72),0 0 0 1px rgba(167,139,250,.07) inset,0 0 60px rgba(124,92,252,.09);
  backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
  overflow:hidden;
  animation:cpm-slide-up 260ms cubic-bezier(.22,1,.36,1);
  display:flex;flex-direction:column;
  max-height:calc(100vh - 32px);
}
.cpm-dialog::before {
  content:"";position:absolute;top:0;left:6%;right:6%;height:1px;
  background:linear-gradient(90deg,transparent,rgba(167,139,250,.48) 35%,rgba(91,142,248,.34) 65%,transparent);
  pointer-events:none;z-index:2;
}
.cpm-dialog::after {
  content:"";position:absolute;top:-60px;left:-60px;
  width:300px;height:190px;border-radius:50%;
  background:radial-gradient(ellipse,rgba(124,92,252,.12),transparent 70%);
  pointer-events:none;z-index:0;
}

/* ── Header ── */
.cpm-header {
  position:relative;z-index:1;
  display:flex;align-items:flex-start;justify-content:space-between;gap:12px;
  padding:15px 18px 13px;
  border-bottom:1px solid rgba(124,92,252,.10);
  flex-shrink:0;
}
.cpm-header-left { display:flex;flex-direction:column;gap:4px;min-width:0;flex:1; }

.cpm-clip-title {
  font-weight:800;font-size:15px;letter-spacing:-.3px;line-height:1.2;
  color:rgba(235,232,255,.94);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
}
.cpm-clip-meta {
  display:flex;align-items:center;gap:8px;flex-wrap:wrap;
  font-size:11px;font-weight:500;
  color:rgba(167,155,220,.55);
}
.cpm-clip-meta a {
  color:rgba(196,181,253,.80);font-weight:700;text-decoration:none;
  transition:color 150ms ease;
}
.cpm-clip-meta a:hover { color:rgba(224,210,255,.96); }
.cpm-meta-dot { opacity:.45; }

.cpm-header-actions {
  display:inline-flex;gap:7px;align-items:center;flex-shrink:0;flex-wrap:wrap;
}

.cpm-btn-like {
  display:inline-flex;align-items:center;gap:7px;
  height:36px;padding:0 13px;border-radius:11px;
  border:1px solid rgba(239,68,68,.22);background:rgba(239,68,68,.08);
  color:rgba(252,165,165,.85);cursor:pointer;
  font-size:12px;font-weight:700;
  outline:none;-webkit-tap-highlight-color:transparent;
  transition:background 150ms ease,border-color 150ms ease,transform 120ms cubic-bezier(.22,1,.36,1);
}
.cpm-btn-like:hover:not(:disabled) { background:rgba(239,68,68,.14);border-color:rgba(239,68,68,.36);transform:translateY(-1px); }
.cpm-btn-like:disabled { opacity:.40;cursor:not-allowed; }
.cpm-btn-like.is-liked { border-color:rgba(239,68,68,.40);background:rgba(239,68,68,.16);color:rgba(252,165,165,.95); }

.cpm-btn-action {
  height:36px;padding:0 13px;border-radius:11px;
  border:1px solid rgba(124,92,252,.22);background:rgba(124,92,252,.07);
  color:rgba(200,195,240,.75);cursor:pointer;
  font-size:12px;font-weight:700;
  outline:none;-webkit-tap-highlight-color:transparent;
  transition:background 150ms ease,border-color 150ms ease,transform 120ms cubic-bezier(.22,1,.36,1);
}
.cpm-btn-action:hover:not(:disabled) { background:rgba(124,92,252,.13);border-color:rgba(124,92,252,.35);transform:translateY(-1px); }
.cpm-btn-action:disabled { opacity:.35;cursor:not-allowed; }
.cpm-btn-action.is-danger {
  border-color:rgba(239,68,68,.24);background:rgba(239,68,68,.08);color:rgba(252,165,165,.75);
}
.cpm-btn-action.is-danger:hover:not(:disabled) { background:rgba(239,68,68,.14);border-color:rgba(239,68,68,.40);transform:translateY(-1px); }

.cpm-btn-close {
  width:36px;height:36px;border-radius:11px;flex-shrink:0;
  border:1px solid rgba(124,92,252,.18);background:rgba(255,255,255,.04);
  color:rgba(235,232,255,.65);cursor:pointer;display:grid;place-items:center;font-size:14px;
  outline:none;-webkit-tap-highlight-color:transparent;
  transition:background 150ms ease,border-color 150ms ease,transform 130ms cubic-bezier(.22,1,.36,1);
}
.cpm-btn-close:hover { background:rgba(124,92,252,.12);border-color:rgba(124,92,252,.36);transform:scale(1.06); }
.cpm-btn-close:disabled { opacity:.40;cursor:not-allowed; }

.cpm-body {
  position:relative;z-index:1;
  padding:14px 16px 16px;
  display:flex;flex-direction:column;gap:12px;
  overflow-y:auto;flex:1;
  scrollbar-width:thin;scrollbar-color:rgba(124,92,252,.22) transparent;
}
.cpm-body::-webkit-scrollbar{width:4px}
.cpm-body::-webkit-scrollbar-track{background:transparent}
.cpm-body::-webkit-scrollbar-thumb{background:rgba(124,92,252,.22);border-radius:4px}

.cpm-video {
  width:100%;border-radius:14px;
  background:#000;
  border:1px solid rgba(124,92,252,.16);
  display:block;
}

.cpm-status {
  padding:8px 12px;border-radius:10px;
  border:1px solid rgba(124,92,252,.16);background:rgba(124,92,252,.08);
  font-size:11px;font-weight:500;
  color:rgba(200,195,240,.80);
}

.cpm-progress-wrap {
  height:3px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden;
}
.cpm-progress-bar {
  height:100%;border-radius:999px;
  background:linear-gradient(90deg,rgba(124,92,252,.70),rgba(91,142,248,.70));
  transition:width 200ms ease;
}

.cpm-list { display:flex;flex-direction:column;gap:7px; }

.cpm-list-item {
  display:grid;grid-template-columns:46px 1fr auto;gap:12px;align-items:center;
  width:100%;text-align:left;cursor:pointer;
  padding:11px 13px;border-radius:14px;
  border:1px solid rgba(124,92,252,.12);background:rgba(124,92,252,.04);
  color:inherit;
  outline:none;-webkit-tap-highlight-color:transparent;
  transition:background 140ms ease,border-color 140ms ease,transform 120ms cubic-bezier(.22,1,.36,1);
}
.cpm-list-item:hover { background:rgba(124,92,252,.10);border-color:rgba(124,92,252,.24);transform:translateX(2px); }

.cpm-list-avatar {
  width:46px;height:46px;border-radius:13px;overflow:hidden;
  border:1px solid rgba(124,92,252,.18);background:rgba(0,0,0,.35);flex-shrink:0;
}
.cpm-list-avatar img { width:100%;height:100%;object-fit:cover;display:block; }

.cpm-list-info { display:flex;flex-direction:column;gap:4px;min-width:0; }
.cpm-list-title {
  font-weight:700;font-size:12px;letter-spacing:-.15px;
  color:rgba(235,232,255,.90);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
}
.cpm-list-sub {
  font-size:10px;font-weight:500;
  color:rgba(167,155,220,.50);
}

.cpm-list-right { display:flex;flex-direction:column;align-items:flex-end;gap:5px; }
.cpm-list-likes {
  display:inline-flex;gap:5px;align-items:center;
  padding:4px 9px;border-radius:999px;
  background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.10);
  font-weight:700;font-size:11px;
  color:rgba(235,232,255,.85);white-space:nowrap;
}
.cpm-list-open {
  font-size:10px;font-weight:600;
  color:rgba(124,92,252,.60);
}

.cpm-empty {
  font-size:12px;font-weight:500;
  color:rgba(167,155,220,.45);padding:8px 0;text-align:center;
}
`;


/* ─── ClipPlayerModal ────────────────────────────────────────────────── */
function ClipPlayerModal({ clip, token, canModerate, onPatchClip, onRemoveClip, onClose, zIndex }: {
  clip: ClipVM; token: string | null; canModerate: boolean;
  onPatchClip: (id: number, patch: Partial<ClipVM>) => void;
  onRemoveClip: (id: number) => void;
  onClose: () => void; zIndex: number;
}) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [busy, setBusy] = React.useState<null | "liking" | "downloading" | "deleting">(null);
  const [status, setStatus] = React.useState<string | null>(null);
  const [pct, setPct] = React.useState<number>(0);

  const mp4 = String((clip as any).clipUrl || "").trim() || null;
  const canLike     = !!token && !clip.myLiked;
  const canDownload = canModerate && !!mp4;
  const canDelete   = canModerate && !!token;

  React.useEffect(() => {
    const video = videoRef.current; if (!video) return;
    const mp4Url = String((clip as any).clipUrl || "").trim() || null;
    const hlsUrl = clip.vodUrl;
    let hls: Hls | null = null;
    video.preload = "metadata";

    if (mp4Url) {
      video.src = mp4Url;
      const onMeta = () => video.play().catch(() => {});
      video.addEventListener("loadedmetadata", onMeta);
      return () => {
        try { video.removeEventListener("loadedmetadata", onMeta); } catch {}
        try { video.pause(); } catch {}
        try { video.removeAttribute("src"); video.load(); } catch {}
      };
    }

    if (!hlsUrl) return;
    const start = Math.max(0, Number(clip.startSec || 0));
    const end   = Math.max(start + 1, start + Math.max(1, Number(clip.durationSec || 0)));
    const EPS   = 0.25;

    const cleanup = () => {
      try { video.pause(); } catch {}
      try { video.removeEventListener("timeupdate", onTimeUpdate); video.removeEventListener("seeking", onSeeking); video.removeEventListener("loadedmetadata", onLoadedMeta); } catch {}
      try { video.removeAttribute("src"); video.load(); } catch {}
    };

    const onTimeUpdate = () => { try { if (video.currentTime >= end - EPS) { video.pause(); video.currentTime = end - EPS; } } catch {} };
    const onSeeking    = () => { try { if (video.currentTime < start - EPS) video.currentTime = start; if (video.currentTime > end - EPS) video.currentTime = end - EPS; } catch {} };
    const onLoadedMeta = () => { try { video.currentTime = start; } catch {} video.play().catch(() => {}); };

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("seeking", onSeeking);

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = hlsUrl;
      video.addEventListener("loadedmetadata", onLoadedMeta);
      return cleanup;
    }

    if (Hls.isSupported()) {
      hls = new Hls({ autoStartLoad: false, startPosition: start, maxBufferLength: 30, backBufferLength: 0 });
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MEDIA_ATTACHED, () => { try { hls?.startLoad(start); } catch {} });
      hls.on(Hls.Events.MANIFEST_PARSED, () => { try { video.currentTime = start; } catch {} video.play().catch(() => {}); });
      return () => { try { hls?.destroy(); } catch {} cleanup(); };
    }

    video.src = hlsUrl;
    video.addEventListener("loadedmetadata", onLoadedMeta);
    return cleanup;
  }, [clip]);

  async function doLike() {
    if (!token) { setStatus("Connecte-toi pour liker."); return; }
    if (!canLike || busy) return;
    setBusy("liking"); setStatus(null);
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
    } finally { setBusy(null); }
  }

  async function doDownload() {
    if (!canDownload || busy) return;
    setBusy("downloading"); setStatus("Téléchargement…"); setPct(0);
    try {
      const blob = await fetchMp4BlobWithProgress(clip.id, (loaded, total) => {
        setPct(total ? Math.max(1, Math.min(99, Math.round((loaded / total) * 100))) : Math.max(1, Math.min(99, Math.round((loaded / (1024 * 1024)) * 6))));
      });
      downloadBlob(blob, `top-clip-${clip.id}-${safeTitle(clip.title)}.mp4`);
      setPct(100); setStatus("Téléchargé ✓");
    } catch (e: any) { setStatus(`Erreur download : ${String(e?.message || "failed")}`); }
    finally { setBusy(null); }
  }

  async function doDelete() {
    if (!canDelete || !token || busy) return;
    if (!window.confirm("Supprimer ce clip ?")) return;
    setBusy("deleting"); setStatus(null);
    try {
      const res = await fetch(`${API_BASE}/clips/${clip.id}/delete`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j || j.ok === false) throw new Error(String(j?.error || `http_${res.status}`));
      onRemoveClip(clip.id); onClose();
    } catch (e: any) { setStatus(`Erreur suppression : ${String(e?.message || "failed")}`); }
    finally { setBusy(null); }
  }

  return createPortal(
    <>
      <style dangerouslySetInnerHTML={{__html: CLIP_MODAL_CSS}} />
      <div className="cpm-backdrop" onClick={onClose} role="presentation" style={{ zIndex }}>
        <div className="cpm-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" style={{ maxWidth: 960 }}>

          <div className="cpm-header">
            <div className="cpm-header-left">
              <div className="cpm-clip-title">{clip.title || "Clip"}</div>
              <div className="cpm-clip-meta">
                <span>Par{" "}
                  <Link to={clip.streamerSlug ? `/s/${encodeURIComponent(clip.streamerSlug)}` : "#"} onClick={onClose}>
                    {clip.streamerName || clip.streamerSlug || "Streamer"}
                  </Link>
                </span>
                <span className="cpm-meta-dot">•</span>
                <span>❤️ {Number(clip.likesCount || 0)}</span>
                <span className="cpm-meta-dot">•</span>
                <span>{fmtDuration(clip.durationSec)}</span>
                <span className="cpm-meta-dot">•</span>
                <span>{timeAgo(clip.createdAtMs)}</span>
              </div>
            </div>

            <div className="cpm-header-actions">
              <button
                className={`cpm-btn-like${clip.myLiked ? " is-liked" : ""}`}
                type="button"
                onClick={() => void doLike()}
                disabled={!!busy || !canLike}
                title={!token ? "Connecte-toi pour liker" : clip.myLiked ? "Déjà liké" : "Liker ce clip"}
              >
                <span>{clip.myLiked ? "❤️" : "🤍"}</span>
                <span>{Number(clip.likesCount || 0)}</span>
              </button>

              {canModerate && (
                <>
                  <button
                    className="cpm-btn-action"
                    type="button"
                    onClick={() => void doDownload()}
                    disabled={!canDownload || !!busy}
                    title={!mp4 ? "Vidéo pas encore disponible" : "Télécharger le clip"}
                  >
                    {busy === "downloading" ? `${pct ? `${pct}%` : "…"}` : "Download"}
                  </button>
                  <button
                    className="cpm-btn-action is-danger"
                    type="button"
                    onClick={() => void doDelete()}
                    disabled={!canDelete || !!busy}
                    title="Supprimer le clip"
                  >
                    {busy === "deleting" ? "…" : "Supprimer"}
                  </button>
                </>
              )}

              <button className="cpm-btn-close" type="button" aria-label="Fermer" onClick={onClose} disabled={!!busy}>✕</button>
            </div>
          </div>

          <div className="cpm-body">
            {!mp4 && !clip.vodUrl ? (
              <div className="cpm-empty">Vidéo indisponible pour le moment.</div>
            ) : (
              <video ref={videoRef} className="cpm-video" controls playsInline />
            )}

            {busy === "downloading" && pct > 0 && pct < 100 && (
              <div className="cpm-progress-wrap">
                <div className="cpm-progress-bar" style={{ width: `${pct}%` }} />
              </div>
            )}

            {status && <div className="cpm-status">{status}</div>}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

/* ─── MonthClipsListModal ────────────────────────────────────────────── */
function MonthClipsListModal({ title, clips, total, onClose, onPickClip, zIndex }: {
  title: string; clips: ClipVM[]; total: number;
  onClose: () => void; onPickClip: (c: ClipVM) => void; zIndex: number;
}) {
  return createPortal(
    <>
      <style dangerouslySetInnerHTML={{__html: CLIP_MODAL_CSS}} />
      <div className="cpm-backdrop" onClick={onClose} role="presentation" style={{ zIndex }}>
        <div className="cpm-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" style={{ maxWidth: 760 }}>

          <div className="cpm-header">
            <div className="cpm-header-left">
              <div className="cpm-clip-title">{title}</div>
              <div className="cpm-clip-meta">
                <span>Tri par ❤️ les plus likés</span>
                <span className="cpm-meta-dot">•</span>
                <span>{total || clips.length} clip{(total || clips.length) > 1 ? "s" : ""}</span>
              </div>
            </div>
            <div className="cpm-header-actions">
              <button className="cpm-btn-close" type="button" aria-label="Fermer" onClick={onClose}>✕</button>
            </div>
          </div>

          <div className="cpm-body">
            {clips.length === 0 ? (
              <div className="cpm-empty">Aucun clip pour le moment.</div>
            ) : (
              <div className="cpm-list">
                {clips.map((c) => {
                  const name = c.streamerName || c.streamerSlug || "Streamer";
                  return (
                    <button key={c.id} type="button" className="cpm-list-item" onClick={() => onPickClip(c)}>
                      <div className="cpm-list-avatar" aria-hidden>
                        {c.avatarUrl && (
                          <img
                            src={absolutize(c.avatarUrl) || c.avatarUrl} alt=""
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                          />
                        )}
                      </div>
                      <div className="cpm-list-info">
                        <div className="cpm-list-title">{c.title || "(sans titre)"}</div>
                        <div className="cpm-list-sub">
                          {name} · {timeAgo(c.createdAtMs)} · {fmtDuration(c.durationSec)}
                        </div>
                      </div>
                      <div className="cpm-list-right">
                        <div className="cpm-list-likes" title="Likes">❤️ {Number(c.likesCount || 0)}</div>
                        <div className="cpm-list-open">▶ Ouvrir</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

/* ─── LivesPage ──────────────────────────────────────────────────────── */
export default function LivesPage() {
  const [lives, setLives] = React.useState<LiveCardVM[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const [clips, setClips] = React.useState<ClipVM[]>([]);
  const [clipsTotal, setClipsTotal] = React.useState(0);
  const [clipsLoading, setClipsLoading] = React.useState(false);

  const [openMonthList, setOpenMonthList] = React.useState(false);
  const [openClip, setOpenClip] = React.useState<ClipVM | null>(null);

  const refreshLockRef = React.useRef(false);
  const preloadedRef   = React.useRef<Set<string>>(new Set());

  const authAny = useAuth() as any;
  const token: string | null = authAny?.token || null;
  const user   = authAny?.user as any | null;
  const username = String(user?.username || "");
  const role     = String(user?.role || "");
  const isAdmin  = role === "admin";
  const canModerateClips = isAdmin || username.toLowerCase() === "lecasinoze";
  const isMobile = useIsMobile();

  const location = useLocation();
  const navigate  = useNavigate();

  React.useEffect(() => {
    setSeo({
      title: "LunaLive — Lives casino FR, streamers en direct et clips",
      description:
        "Regarde des lives casino en français sur LunaLive : streamers en direct, clips, pages casinos, hunts et événements de la communauté.",
      path: "/",
    });
  }, []);

  React.useEffect(() => {
    const open = new URLSearchParams(location.search).get("open");
    if (open === "clips") setOpenMonthList(true);
  }, [location.search]);

  const mergeThumbFinal = React.useCallback((prev: LiveCardVM[], nextBase: LiveCardVM[]) => {
    const prevMap = new Map(prev.map((x) => [String(x.slug || x.id), x] as const));
    return nextBase.map((x) => {
      const old = prevMap.get(String(x.slug || x.id));
      return { ...x, thumbFinal: old?.thumbFinal || x.thumbFinal };
    });
  }, []);

  const load = React.useCallback(async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    if (refreshLockRef.current) return;
    refreshLockRef.current = true;
    if (silent) setRefreshing(true); else setLoading(true);
    setErr(null);

    try {
      const nowMs = Date.now();
      const data  = await getLives();

      const vmBase: LiveCardVM[] = (data as any[]).map((x: any) => {
        const fallback     = svgThumb(x.displayName);
        const rawThumbUrl  = absolutize(x.thumbUrl || x.thumb_url || null);
        const thumbUrl     = rawThumbUrl ? with5MinBust(String(rawThumbUrl), nowMs) : null;
        const started      = x.liveStartedAt || x.live_started_at || null;
        return { ...x, thumbFallback: fallback, thumbFinal: thumbUrl || fallback, durationLabel: started ? formatDurationDot(String(started), nowMs) : null };
      });

      const { featuredLiveSlugs, metaBySlug } = await fetchStreamersIndex();

      const vmWithFeatured = vmBase.map((x) => {
        const slug = String(x.slug || "").trim();
        const meta = slug ? metaBySlug.get(slug) : undefined;
        return {
          ...x,
          featured: x?.featured != null ? !!(x as any).featured : featuredLiveSlugs.has(slug),
          avatarUrl: (x as any).avatarUrl ?? (x as any).avatar_url ?? meta?.avatarUrl ?? null,
          followersCount: Number((x as any).followsCount ?? (x as any).follows_count ?? (x as any).followersCount ?? (x as any).followers_count ?? (x as any).followers ?? meta?.followersCount ?? 0) || 0,
        } as any;
      });

      const slugs = vmWithFeatured.map((x) => String((x as any).slug || "").trim().toLowerCase()).filter(Boolean);
      let viewersMap = await fetchViewersBatchPublic(slugs);
      if (!viewersMap) viewersMap = await fetchViewersPerSlugOverlay(slugs, token);

      const vmWithViewers = vmWithFeatured.map((x) => {
        const slug = String((x as any).slug || "").trim().toLowerCase();
        const ov   = viewersMap?.get(slug);
        return { ...(x as any), viewers: ov != null ? ov : (Number((x as any).viewers ?? 0) || 0) } as any;
      });

      const followsMap = await fetchFollowsCountsForLives(
        vmWithViewers.map((x) => String((x as any).slug || "").trim().toLowerCase()).filter(Boolean),
        token
      );

      const vmFinal = vmWithViewers.map((x) => {
        const slug = String((x as any).slug || "").trim().toLowerCase();
        const n    = followsMap.get(slug);
        return typeof n === "number" ? { ...(x as any), followersCount: n } as any : x as any;
      });

      setLives((prev) => mergeThumbFinal(prev, vmFinal));

      await Promise.allSettled(vmFinal.map(async (live) => {
        const nowThumb = absolutize((live as any).thumbUrl || (live as any).thumb_url || null);
        const url = nowThumb ? with5MinBust(String(nowThumb), nowMs) : null;
        if (!url || preloadedRef.current.has(url)) return;
        preloadedRef.current.add(url);
        const ok = await preloadImage(url);
        if (!ok) return;
        setLives((prev) => prev.map((p) =>
          String(p.slug || p.id) === String((live as any).slug || (live as any).id) ? { ...p, thumbFinal: url } : p
        ));
      }));

    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      refreshLockRef.current = false;
      if (silent) setRefreshing(false); else setLoading(false);
    }
  }, [mergeThumbFinal, token]);

  const loadClips = React.useCallback(async () => {
    setClipsLoading(true);
    try {
      const r = await fetchTopClipsMonth(token);
      setClips(r.clips);
      setClipsTotal(r.total || r.clips.length);
    } finally { setClipsLoading(false); }
  }, [token]);

  React.useEffect(() => { load(); loadClips(); }, [load, loadClips]);

  React.useEffect(() => {
    const id = window.setInterval(() => { if (document.visibilityState === "visible") load({ silent: true }); }, 20_000);
    const onVis = () => { if (document.visibilityState === "visible") load({ silent: true }); };
    document.addEventListener("visibilitychange", onVis);
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [load]);

  const totals = React.useMemo(() => ({
    liveCount:    lives.length,
    viewersTotal: lives.reduce((acc, x) => acc + (Number(x.viewers) || 0), 0),
  }), [lives]);

  const sorted       = React.useMemo(() => [...lives].sort((a, b) => Number(b.viewers) - Number(a.viewers)), [lives]);
  const featuredLives = React.useMemo(() => sorted.filter((x) => !!x.featured), [sorted]);
  const normalLives   = React.useMemo(() => sorted.filter((x) => !x.featured),  [sorted]);

  const clipsTop4       = React.useMemo(() => clips.slice(0, 4), [clips]);
  const extraClipsCount = Math.max(0, clipsTotal - clipsTop4.length);
  const hasMoreThan4    = clipsTotal > 4;

  function onClickMonthClip(c: ClipVM) {
    if (hasMoreThan4) { setOpenMonthList(true); return; }
    setOpenClip(c);
  }

  const patchClip = React.useCallback((id: number, patch: Partial<ClipVM>) => {
    setClips((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    setOpenClip((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));
  }, []);

  const removeClip = React.useCallback((id: number) => {
    setClips((prev) => prev.filter((x) => x.id !== id));
    setClipsTotal((n) => Math.max(0, (Number(n) || 0) - 1));
  }, []);

  /* ── Mobile branch ── */
  if (isMobile) {
    return (
      <>
        <LivesPageMobile
          apiBase={API_BASE} lives={lives} loading={loading} refreshing={refreshing}
          err={err} totals={totals} featuredLives={featuredLives as any} normalLives={normalLives as any}
          clipsTop4={clipsTop4 as any} clipsTotal={clipsTotal} clipsLoading={clipsLoading}
          extraClipsCount={extraClipsCount} hasMoreThan4={hasMoreThan4}
          onOpenMonthList={() => setOpenMonthList(true)} onOpenClip={(c) => setOpenClip(c)}
        />
        {openMonthList ? (
          <MonthClipsListModal title="🎬 Clips du mois" clips={clips} total={clipsTotal || clips.length}
            onClose={() => { setOpenMonthList(false); if (location.search) navigate(location.pathname, { replace: true }); }}
            onPickClip={(c) => setOpenClip(c)} zIndex={79} />
        ) : null}
        {openClip ? (
          <ClipPlayerModal clip={openClip} token={token} canModerate={canModerateClips}
            onPatchClip={patchClip} onRemoveClip={removeClip} onClose={() => setOpenClip(null)} zIndex={80} />
        ) : null}
      </>
    );
  }

  /* ── Desktop ── */
  return (
    <main className="container livesPage">
      <div className="livesWrap">

        {/* ── Page header ── */}
        <div className="livesHeader">
          <div style={{ display: "grid", gap: 6, minWidth: 280 }}>
            <h1 className="livesH1">LunaLive</h1>
            <div className="mutedSmall" style={{ maxWidth: 760 }}>
              Bienvenue sur votre plateforme dédiée à la commu casino.
              {refreshing ? <span style={{ marginLeft: 10, opacity: 0.8 }}><span className="livePing" aria-hidden /></span> : null}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
            <Pill tone="live" title="Nombre de lives en direct">🔴 Live <b>{totals.liveCount}</b></Pill>
            <Pill tone="neutral" title="Viewers total sur la plateforme">👁 Viewers <b>{formatViewers(totals.viewersTotal)}</b></Pill>
          </div>
        </div>

        {err ? <div className="alert" style={{ marginTop: 12 }}>{err}</div> : null}

        <div className="livesLayout">

          {/* ── Sidebar ── */}
          <aside className="livesSidebar">
            <DailyWheelCard />
            <DailyBonusAccessCard />

            <div className="sidebarDivider" />

            {/* Clips du mois */}
            <div className="clipsCard sidebarCard">
              <div style={{ padding: "14px 16px 0" }}>
                <div className="sectionTitle" style={{ margin: "0 0 10px" }}>
                  <h2 style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{
                      width: 20, height: 20, borderRadius: 7,
                      background: "linear-gradient(135deg, rgba(124,92,252,0.50), rgba(59,77,200,0.40))",
                      border: "1px solid rgba(124,92,252,0.25)",
                      display: "grid", placeItems: "center", fontSize: 11, flexShrink: 0,
                      boxShadow: "0 0 10px rgba(124,92,252,0.22)",
                    }} aria-hidden>🎬</span>
                    Clips du mois
                  </h2>
                  {clipsLoading ? (
                    <span className="sectionHint" style={{ opacity: 0.5 }}>…</span>
                  ) : clipsTotal > 0 ? (
                    <span className="sectionHint">{clipsTotal} clip{clipsTotal > 1 ? "s" : ""}</span>
                  ) : null}
                </div>
              </div>

              {clipsTop4.length === 0 ? (
                <div className="mutedSmall" style={{ padding: "0 16px 14px", opacity: 0.6 }}>
                  {clipsLoading ? "Chargement…" : "Aucun clip pour le moment."}
                </div>
              ) : (
                <div style={{ padding: "0 14px 14px" }}>
                  <div className="clipsGrid">
                    {clipsTop4.map((c, idx) => {
                      const raw    = c.thumbUrl ? absolutize(c.thumbUrl) || c.thumbUrl : null;
                      const thumb  = raw || svgThumb(c.streamerName || c.streamerSlug || "Clip");
                      const corner = (["tl", "tr", "bl", "br"] as const)[idx] ?? "tl";
                      return (
                        <button key={c.id} type="button" className="clipTile hoverGlow" onClick={() => onClickMonthClip(c)}
                          style={{ textDecoration: "none", color: "inherit", display: "block", padding: 0, cursor: "pointer" }}
                          title={hasMoreThan4 ? "Ouvrir la liste des clips du mois" : c.title ? `${c.title} — ${c.likesCount} likes` : `${c.likesCount} likes`}
                        >
                          <div className="clipThumb" style={{ backgroundImage: `url(${thumb})` }} />
                          <div className="clipPlay"><span>▶</span></div>
                          <ClipLikesBadge likes={c.likesCount} corner={corner} />
                          {c.avatarUrl ? (
                            <div className="clipMidAvatar" aria-hidden>
                              <img src={absolutize(c.avatarUrl) || c.avatarUrl} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                            </div>
                          ) : null}
                        </button>
                      );
                    })}
                    {extraClipsCount > 0 ? <div className="clipsCross" aria-hidden /> : null}
                    {extraClipsCount > 0 ? (
                      <button type="button" className="clipsMoreOverlay" onClick={() => setOpenMonthList(true)}
                        style={{ background: "transparent", border: 0, cursor: "pointer" }} title="Voir tous les clips du mois">
                        <div className="bubble"><strong>+{extraClipsCount}</strong> clips</div>
                      </button>
                    ) : null}
                  </div>

                  {hasMoreThan4 && (
                    <button type="button" onClick={() => setOpenMonthList(true)} style={{
                      marginTop: 10, width: "100%", padding: "7px 12px", borderRadius: 11,
                      border: "1px solid rgba(124,92,252,0.18)", background: "rgba(124,92,252,0.06)",
                      color: "rgba(167,139,250,0.80)", fontFamily: "var(--ll-font-display)",
                      fontSize: 11, fontWeight: 700, letterSpacing: "-0.1px", cursor: "pointer",
                      transition: "background 150ms ease, border-color 150ms ease",
                    }}
                    onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(124,92,252,0.12)"; b.style.borderColor = "rgba(124,92,252,0.32)"; }}
                    onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.background = "rgba(124,92,252,0.06)"; b.style.borderColor = "rgba(124,92,252,0.18)"; }}
                    >
                      Voir tous les clips →
                    </button>
                  )}
                </div>
              )}
            </div>
          </aside>

          {/* ── Main lives ── */}
          <section className="livesMain">
            {loading && lives.length === 0 ? null : (
              <>
                {/* Featured */}
                {featuredLives.length > 0 && (
                  <div style={{ marginTop: 0 }}>
                    <div className="sectionTitle">
                      <h2>✨ Mise en avant</h2>
                      <div className="sectionHint">Abonnés / premium</div>
                    </div>
                    <section className="livesGrid">
                      {featuredLives.map((live) => (
                        <Link key={live.id} to={`/s/${live.slug}`} className="liveLink">
                          <GlassCard className="hoverGlow" style={{
                            border: "1px solid rgba(251,191,36,0.22)",
                            background: "radial-gradient(700px 220px at 20% 0%, rgba(251,191,36,0.10), transparent 60%), radial-gradient(600px 200px at 90% 10%, rgba(124,92,252,0.08), transparent 55%), rgba(13,11,24,0.82)",
                          }}>
                            <div className="liveThumb" style={{ borderRadius: "18px 18px 0 0", border: "none" }}>
                              <LiveBackdrop url={live.thumbFinal} />
                              <div className="liveTopRow">
                                <Pill tone="gold" title="Mise en avant">✨ FEATURED</Pill>
                                {live.durationLabel ? <Pill tone="neutral" title="Durée du live">⏱ {live.durationLabel}</Pill> : <span />}
                              </div>
                              <div className="liveBottomRow">
                                <span />
                                <Pill tone="neutral" title="Viewers">👁 {formatViewers(live.viewers)}</Pill>
                              </div>
                            </div>
                            <LiveCardBody live={live as any} accentColor="rgba(251,191,36,0.24)" />
                          </GlassCard>
                        </Link>
                      ))}
                    </section>
                  </div>
                )}

                {/* Normal */}
                <div style={{ marginTop: 0 }}>
                  <section className="livesGrid">
                    {normalLives.map((live) => (
                      <Link key={live.id} to={`/s/${live.slug}`} className="liveLink">
                        <GlassCard className="hoverGlow" style={{
                          border: "1px solid rgba(124,92,252,0.16)",
                          background: "radial-gradient(600px 200px at 15% 0%, rgba(124,92,252,0.10), transparent 60%), rgba(13,11,24,0.82)",
                        }}>
                          <div className="liveThumb" style={{ borderRadius: "18px 18px 0 0", border: "none" }}>
                            <LiveBackdrop url={live.thumbFinal} />
                            <div className="liveTopRow">
                              <Pill tone="live" title="En direct"><span className="livePing" aria-hidden />LIVE</Pill>
                              {live.durationLabel ? <Pill tone="neutral" title="Durée du live">⏱ {live.durationLabel}</Pill> : <span />}
                            </div>
                            <div className="liveBottomRow">
                              <span />
                              <Pill tone="neutral" title="Viewers">👁 {formatViewers(live.viewers)}</Pill>
                            </div>
                          </div>
                          <LiveCardBody live={live as any} accentColor="rgba(124,92,252,0.20)" />
                        </GlassCard>
                      </Link>
                    ))}
                  </section>
                </div>
              </>
            )}
          </section>
        </div>
      </div>

      {openMonthList ? (
        <MonthClipsListModal title="🎬 Clips du mois" clips={clips} total={clipsTotal || clips.length}
          onClose={() => setOpenMonthList(false)} onPickClip={(c) => setOpenClip(c)} zIndex={79} />
      ) : null}

      {openClip ? (
        <ClipPlayerModal clip={openClip} token={token} canModerate={canModerateClips}
          onPatchClip={patchClip} onRemoveClip={removeClip} onClose={() => setOpenClip(null)} zIndex={80} />
      ) : null}
    </main>
  );
}