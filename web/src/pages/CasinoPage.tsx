// web/src/pages/CasinoPage.tsx
// ─── REWORK VISUEL Purple Velvet ─── logique 100% identique à l'original ───
import * as React from "react";
import { useParams } from "react-router-dom";
import {
  getCasino, getCasinoComments, postCasinoComment, reactToCasinoComment,
  setCasinoRating, absApiUrl,
  type CasinoComment, type CasinoLink, type CasinoDetailResp,
} from "../lib/api_casinos";
import { useAuth } from "../auth/AuthProvider";
import { setSeo, setDynamicRouteSeo } from "../lib/seo";
const DEV = Boolean(import.meta.env.DEV);

/* ─────────────────────────────────────────────
   Utils (identiques à l'original)
───────────────────────────────────────────── */
function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)); }

function numFromAny(v: any): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(",", "."); const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function splitList(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(x => String(x)).filter(x => x != null && String(x).trim() !== "");
  try { const j = JSON.parse(String(v)); if (Array.isArray(j)) return j.map(x => String(x)).filter(x => x != null && String(x).trim() !== ""); } catch {}
  return [];
}

function sortLinks(links: CasinoLink[]) {
  return [...links].sort((a: any, b: any) => {
    const ap = a?.pinnedRank ?? 999999, bp = b?.pinnedRank ?? 999999;
    if (ap !== bp) return ap - bp;
    return (b?.streamer?.followsCount ?? 0) - (a?.streamer?.followsCount ?? 0);
  });
}

function linkHref(l: any): string {
  const raw = (l?.goUrl || l?.targetUrl || "").trim();
  return absApiUrl(raw) || "#";
}

function fmtRating(v: number, decimals = 1) {
  const n = Number.isFinite(v) ? v : 0;
  return n.toFixed(decimals).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1").replace(".", ",");
}
function fmtRatingOutOf5(v: number) { return `${fmtRating(v, 1)}/5`; }

function pickStreamerAvatarUrl(link: any) {
  const s = link?.streamer ?? null;
  const uid = link?.ownerUserId ?? link?.userId ?? s?.ownerUserId ?? s?.userId ?? s?.owner_user_id ?? s?.user_id ?? null;
  const direct = s?.avatarUrl ? absApiUrl(s.avatarUrl) || s.avatarUrl : null;
  const byUid = uid ? absApiUrl(`/avatars/u/${uid}?v=${Math.floor(Date.now() / 60000)}`) : null;
  return { url: direct || byUid, debug: { linkId: link?.id, uid, streamerName: s?.displayName, directAvatarUrl: s?.avatarUrl ?? null, computed: direct || byUid, fields: { link_ownerUserId: link?.ownerUserId ?? null, link_userId: link?.userId ?? null, streamer_ownerUserId: s?.ownerUserId ?? s?.owner_user_id ?? null, streamer_userId: s?.userId ?? s?.user_id ?? null } } };
}

function pickUserAvatarUrlFromComment(c: any) {
  const uid = c?.userId ?? c?.ownerUserId ?? c?.authorUserId ?? null;
  return { url: uid ? absApiUrl(`/avatars/u/${uid}?v=${Math.floor(Date.now() / 60000)}`) : null, uid };
}

/* ─────────────────────────────────────────────
   UI Atoms — Purple Velvet
───────────────────────────────────────────── */

function Pill({
  tone,
  children,
  title,
}: {
  tone: "neutral" | "brand" | "warn" | "danger";
  children: React.ReactNode;
  title?: string;
}) {
  const map: Record<string, { bg: string; bd: string; color: string }> = {
    brand:   { bg: "rgba(124,92,252,.12)", bd: "rgba(124,92,252,.28)", color: "rgba(196,181,253,.88)" },
    warn:    { bg: "rgba(91,142,248,.10)", bd: "rgba(91,142,248,.26)", color: "rgba(147,197,253,.82)" },
    danger:  { bg: "rgba(239,68,68,.10)",  bd: "rgba(239,68,68,.26)",  color: "rgba(252,165,165,.82)" },
    neutral: { bg: "rgba(124,92,252,.08)", bd: "rgba(124,92,252,.18)", color: "rgba(196,181,253,.80)" },
  };
  const t = map[tone] ?? map.neutral;
  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 11px",
        borderRadius: 999,
        border: `1px solid ${t.bd}`,
        background: t.bg,
        color: t.color,
        fontSize: 12,
        fontWeight: 700,
        whiteSpace: "nowrap",
        backdropFilter: "blur(10px)",
        fontFamily: "'Syne',system-ui,sans-serif",
      }}
    >
      {children}
    </span>
  );
}

/* ── GlassCard with forwardRef (identique à l'original) ── */
const GlassCard = React.forwardRef<
  HTMLDivElement,
  { children: React.ReactNode; style?: React.CSSProperties; className?: string }
>(function GlassCard({ children, style, className }, ref) {
  return (
    <div
      ref={ref}
      className={className}
      style={{
        borderRadius: 22,
        border: "1px solid rgba(124,92,252,.14)",
        background: "rgba(11,9,22,.86)",
        boxShadow: "0 18px 55px rgba(0,0,0,.34), 0 0 0 1px rgba(167,139,250,.04) inset",
        backdropFilter: "blur(14px)",
        position: "relative",
        overflow: "hidden",
        ...style,
      }}
    >
      {/* reflet haut signature Purple Velvet */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 0, left: "8%", right: "8%",
          height: 1,
          background: "linear-gradient(90deg, transparent, rgba(167,139,250,.32) 40%, rgba(91,142,248,.22) 60%, transparent)",
          pointerEvents: "none",
        }}
      />
      {children}
    </div>
  );
});

function SectionTitle({
  title,
  subtitle,
  right,
  icon,
}: {
  title: string;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  icon?: string;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
      <div style={{ display: "grid", gap: 6 }}>
        <div
          style={{
            fontSize: 22,
            fontFamily: "'Syne',system-ui,sans-serif",
            fontWeight: 800,
            letterSpacing: -0.6,
            background: "linear-gradient(90deg, #fbbf24, #a78bfa, #5b8ef8)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            filter: "drop-shadow(0 8px 20px rgba(0,0,0,.35))",
          }}
        >
          {icon ? `${icon} ` : ""}{title}
        </div>
        {subtitle ? <div className="mutedSmall">{subtitle}</div> : null}
      </div>
      {right ? <div>{right}</div> : null}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Stars (identiques à l'original — avec halves)
───────────────────────────────────────────── */
function StarSvg({ fill }: { fill: 0 | 0.5 | 1 }) {
  const id = React.useId(); const gradId = `half-${id}`;
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      {fill === 0.5 ? (
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="50%" stopColor="currentColor" />
            <stop offset="50%" stopColor="transparent" stopOpacity="1" />
          </linearGradient>
        </defs>
      ) : null}
      <path
        d="M12 2.6l2.9 6.2 6.8.7-5.1 4.4 1.5 6.6L12 17.9 5.9 20.5 7.4 13.9 2.3 9.5l6.8-.7L12 2.6z"
        fill={fill === 1 ? "currentColor" : fill === 0.5 ? `url(#${gradId})` : "transparent"}
        stroke="currentColor"
        strokeWidth="1.4"
        opacity={fill === 0 ? 0.55 : 1}
      />
    </svg>
  );
}

function getStarFill(i: number, rating: number): 0 | 0.5 | 1 {
  if (i + 1 <= Math.floor(rating)) return 1;
  const frac = rating - Math.floor(rating);
  if (i === Math.floor(rating) && frac >= 0.25 && frac < 0.75) return 0.5;
  if (i === Math.floor(rating) && frac >= 0.75) return 1;
  return 0;
}

function StarsInline({ rating, showNumber = true, size = 18 }: { rating: number; showNumber?: boolean; size?: number }) {
  const r = clamp(rating, 0, 5);
  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <span style={{ display: "inline-flex", gap: 3, alignItems: "center", color: "rgba(251,191,36,.92)" }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} style={{ display: "inline-flex", lineHeight: 0, fontSize: size }}>
            <StarSvg fill={getStarFill(i, r)} />
          </span>
        ))}
      </span>
      {showNumber ? <span style={{ opacity: 0.9, fontFamily: "'Syne',system-ui,sans-serif", fontSize: 12, fontWeight: 700 }}>{fmtRatingOutOf5(r)}</span> : null}
    </span>
  );
}

function StarPicker({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  const [hover, setHover] = React.useState<number | null>(null);
  const v = hover ?? value;
  return (
    <div
      style={{
        display: "inline-flex",
        gap: 8,
        padding: 8,
        borderRadius: 999,
        border: "1px solid rgba(124,92,252,.18)",
        background: "rgba(124,92,252,.06)",
        boxShadow: "0 10px 30px rgba(0,0,0,.22)",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {Array.from({ length: 5 }).map((_, i) => {
        const starVal = i + 1;
        const filled = starVal <= v;
        return (
          <button
            key={starVal}
            type="button"
            disabled={disabled}
            onMouseEnter={() => setHover(starVal)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onChange(starVal)}
            aria-label={`${starVal} étoile`}
            title={`${starVal}/5`}
            style={{
              width: 38,
              height: 38,
              borderRadius: 14,
              border: filled ? "1px solid rgba(251,191,36,.28)" : "1px solid rgba(124,92,252,.14)",
              background: filled
                ? "linear-gradient(180deg, rgba(251,191,36,.18), rgba(167,139,250,.14))"
                : "rgba(124,92,252,.06)",
              color: filled ? "rgba(255,255,255,.92)" : "rgba(255,255,255,.75)",
              display: "grid",
              placeItems: "center",
              cursor: disabled ? "not-allowed" : "pointer",
              transform: hover === starVal && !disabled ? "translateY(-1px) scale(1.04)" : "none",
              transition: "transform .12s ease, background .12s ease, box-shadow .12s ease",
              boxShadow: filled ? "0 8px 24px rgba(0,0,0,.22)" : "none",
            }}
          >
            <StarSvg fill={filled ? 1 : 0} />
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Logo backdrop (identique à l'original)
───────────────────────────────────────────── */
function LogoBackdrop({ url, opacity = 0.16, scale = 1.08, position = "center" }: {
  url: string | null | undefined;
  opacity?: number;
  scale?: number;
  position?: string;
}) {
  if (!url) return null;
  return (
    <>
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url(${url})`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: position,
          backgroundSize: "cover",
          opacity,
          transform: `scale(${scale})`,
          filter: "contrast(1.08) saturate(1.25) brightness(1.05)",
          pointerEvents: "none",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(90deg, rgba(0,0,0,.58), rgba(0,0,0,.18) 55%, rgba(0,0,0,.58)), radial-gradient(900px 420px at 50% 0%, rgba(255,255,255,.06), transparent 60%)",
          pointerEvents: "none",
        }}
      />
    </>
  );
}

/* ─────────────────────────────────────────────
   Page — logique 100% identique à l'original
───────────────────────────────────────────── */
export default function CasinoPage() {
  const { slug } = useParams();
  const auth: any = useAuth();
  const user = auth?.user ?? null;
  const token: string | null = auth?.token ?? auth?.accessToken ?? auth?.jwt ?? null;

  const [loading, setLoading]           = React.useState(true);
  const [data, setData]                 = React.useState<CasinoDetailResp | null>(null);
  const [error, setError]               = React.useState<string | null>(null);
  const [commentSort, setCommentSort]   = React.useState<"new" | "useful">("new");
  const [comments, setComments]         = React.useState<CasinoComment[]>([]);
  const [nextCursor, setNextCursor]     = React.useState<string | null>(null);
  const [loadingComments, setLoadingComments] = React.useState(false);
  const [myRating, setMyRating]         = React.useState(0);
  const [myRatingInit, setMyRatingInit] = React.useState(false);
  const [savingRating, setSavingRating] = React.useState(false);
  const [body, setBody]                 = React.useState("");
  type PickedImg = { file: File; url: string };
  const [files, setFiles]               = React.useState<File[]>([]);
  const [pickedImgs, setPickedImgs]     = React.useState<PickedImg[]>([]);
  const [posting, setPosting]           = React.useState(false);

  const refOverview = React.useRef<HTMLDivElement>(null);
  const refRate     = React.useRef<HTMLDivElement>(null);
  const refComments = React.useRef<HTMLDivElement>(null);
  const refSupport  = React.useRef<HTMLDivElement>(null);

  function revokePicked(list: PickedImg[]) { for (const it of list) { try { URL.revokeObjectURL(it.url); } catch {} } }
  function clearPicked() { setFiles([]); setPickedImgs(prev => { revokePicked(prev); return []; }); }


  async function loadCasino() {
    if (!slug) return; setLoading(true); setError(null);
    try {
      const r = await getCasino(slug); setData(r);
      const mine =
        numFromAny((r as any)?.myRating) ?? numFromAny((r as any)?.my_rating) ??
        numFromAny((r as any)?.stats?.myRating) ?? numFromAny((r as any)?.stats?.my_rating) ??
        numFromAny((r as any)?.userRating) ?? numFromAny((r as any)?.user_rating) ?? null;
      if (!myRatingInit) { setMyRating(mine != null ? clamp(Math.round(mine), 0, 5) : 0); setMyRatingInit(true); }
      if (DEV) { console.log("[CasinoPage] myRating from API =", mine); console.log("[CasinoPage] links raw =", (r as any)?.links); console.log("[CasinoPage] bonusLink raw =", (r as any)?.bonusLink); }
    } catch (e: any) { setError(e?.message || "error"); }
    finally { setLoading(false); }
  }

  async function loadComments(opts?: { reset?: boolean }) {
    if (!slug) return; setLoadingComments(true);
    try {
      const r = await (getCasinoComments as any)(slug, { sort: commentSort, limit: 30, cursor: opts?.reset ? null : nextCursor }, token);
      setNextCursor(r.nextCursor);
      setComments(prev => opts?.reset ? r.items : [...prev, ...r.items]);
    } finally { setLoadingComments(false); }
  }

  React.useEffect(() => { return () => { revokePicked(pickedImgs); }; }, []); // eslint-disable-line
  React.useEffect(() => { setMyRatingInit(false); loadCasino(); }, [slug, token]); // eslint-disable-line
  React.useEffect(() => { setComments([]); setNextCursor(null); loadComments({ reset: true }); }, [commentSort, slug, token]); // eslint-disable-line

  React.useEffect(() => {
    if (!DEV || !data) return;
    const linksSorted = sortLinks((data as any).links || []);
    const streamerLinks = linksSorted.filter((l: any) => l.streamer);
    const rows = streamerLinks.map((l: any) => { const p = pickStreamerAvatarUrl(l); return { linkId: l?.id, streamerName: l?.streamer?.displayName, computedAvatar: p.url, uid: p.debug.uid, streamer_avatarUrl: p.debug.directAvatarUrl }; });
    console.table(rows);
  }, [data]);

  async function onSaveRating(v: number) {
    if (!data) return;
    if (!user || !token) { alert("Connecte-toi pour noter."); return; }
    setMyRating(v); setSavingRating(true);
    try {
      await (setCasinoRating as any)((data as any).casino.id, v, token);
      const fresh = await getCasino((data as any).casino.slug); setData(fresh);
      const mine = numFromAny((fresh as any)?.myRating) ?? numFromAny((fresh as any)?.my_rating) ?? numFromAny((fresh as any)?.stats?.myRating) ?? numFromAny((fresh as any)?.stats?.my_rating) ?? numFromAny((fresh as any)?.userRating) ?? numFromAny((fresh as any)?.user_rating) ?? null;
      if (mine != null) setMyRating(clamp(Math.round(mine), 0, 5));
    } catch (e: any) { alert(e?.message || "Erreur note"); }
    finally { setSavingRating(false); }
  }

  function onPickFiles(list: FileList | null) {
    if (!list) return;
    const arr = Array.from(list).slice(0, 3);
    setPickedImgs(prev => { revokePicked(prev); return []; });
    const next = arr.map(f => ({ file: f, url: URL.createObjectURL(f) }));
    setFiles(arr); setPickedImgs(next);
  }

  async function onPost() {
    if (!data) return;
    if (!user || !token) { alert("Connecte-toi pour publier."); return; }
    const text = body.trim(); if (!text) return;
    const imgsSnap = pickedImgs; const filesSnap = files;
    setPosting(true);
    try {
      const r = await (postCasinoComment as any)((data as any).casino.id, text, filesSnap, token);
      setBody("");
      if (r.status === "published") { clearPicked(); setComments([]); setNextCursor(null); await loadComments({ reset: true }); }
      else {
        const pending: CasinoComment = { id: `local_pending_${Date.now()}`, body: text, createdAt: new Date().toISOString(), userId: (user as any).id ?? 0, username: (user as any).username ?? "Moi", hasImages: imgsSnap.length > 0, authorRating: myRating ? myRating : null, upCount: 0, downCount: 0, myReaction: null, images: imgsSnap.map(p => ({ url: p.url, w: null, h: null, sizeBytes: p.file.size })) };
        clearPicked(); setComments(prev => [pending, ...prev]);
      }
    } catch (e: any) { alert(e?.message || "Erreur publication"); }
    finally { setPosting(false); }
  }

  async function toggleReaction(commentId: string, current: "up" | "down" | null, next: "up" | "down") {
    if (!user || !token) { alert("Connecte-toi pour réagir."); return; }
    const newKind: "up" | "down" | null = current === next ? null : next;
    setComments(prev => prev.map(c => {
      if (c.id !== commentId) return c;
      let up = c.upCount, down = c.downCount;
      if (c.myReaction === "up") up -= 1; if (c.myReaction === "down") down -= 1;
      if (newKind === "up") up += 1; if (newKind === "down") down += 1;
      return { ...c, myReaction: newKind, upCount: clamp(up, 0, 1e9), downCount: clamp(down, 0, 1e9) };
    }));
    try { await (reactToCasinoComment as any)(commentId, newKind, token); }
    catch (e: any) { alert(e?.message || "Erreur réaction"); setComments([]); setNextCursor(null); await loadComments({ reset: true }); }
  }

  React.useEffect(() => {
    if (!slug) return;
    
    // Use dynamic SEO for fallback when data is not loaded yet
    setDynamicRouteSeo(`/casinos/${slug}`);
  }, [slug]);

  React.useEffect(() => {
    const currentCasino = data?.casino;
    if (!currentCasino?.name || !currentCasino?.slug) return;

    setSeo({
      title: `${currentCasino.name} — Avis et note casino | LunaLive`,
      description: `Découvre ${currentCasino.name} sur LunaLive : note LunaLive, avis de la communauté, bonus et informations détaillées.`,
      path: `/casinos/${encodeURIComponent(currentCasino.slug)}`,
    });
  }, [data?.casino?.slug, data?.casino?.name]);
    
  if (loading) return <div className="container"><div className="muted">Chargement…</div></div>;
  if (error || !data) return <div className="container"><div className="alert">{error || "Introuvable"}</div></div>;

  const casino = data.casino; const stats = data.stats;
  const pros = splitList((casino as any).pros); const cons = splitList((casino as any).cons);
  const linksSorted   = sortLinks((data as any).links || []);
  const streamerLinks = linksSorted.filter((l: any) => l.streamer);
  const bonusLink     = (data as any).bonusLink;
  const bonusCtaText  = (casino.bonusHeadline || "").trim() || "Récupérez votre bonus";
  const avg     = numFromAny((stats as any)?.avgRating) ?? 0;
  const rc      = Number((stats as any)?.ratingsCount ?? 0) || 0;
  const teamNum = numFromAny((casino as any).teamRating) ?? 0;
  const logoSrc = absApiUrl((casino as any).logoUrl) || (casino as any).logoUrl || null;
  const watchLevel = (casino as any).watchLevel || "none";
  const isAvoid = watchLevel === "avoid";
  const isWatch = watchLevel === "watch";

  return (
    <main className="container casinoDetailPage">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@500;700;800&display=swap');

        .casinoDetailPage {
          position: relative;
          padding-bottom: 28px;
        }
        .casinoDetailPage::before {
          content: "";
          position: fixed;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          background:
            radial-gradient(1100px 420px at 18% 0%, rgba(124,92,252,.20), transparent 62%),
            radial-gradient(1200px 500px at 80% 10%, rgba(91,142,248,.18), transparent 62%),
            radial-gradient(1200px 600px at 50% 95%, rgba(59,77,200,.16), transparent 64%),
            linear-gradient(180deg, transparent, rgba(0,0,0,.08));
        }

        @media (max-width: 980px) {
          .casinoGrid { grid-template-columns: 1fr !important; }
        }

        .cd-anchor {
          height: 32px; padding: 0 13px; border-radius: 11px; cursor: pointer;
          font-family: 'Syne', system-ui, sans-serif; font-size: 11px; font-weight: 700;
          border: 1px solid rgba(124,92,252,.16); background: rgba(124,92,252,.06);
          color: rgba(200,195,240,.72);
          transition: background 130ms ease, border-color 130ms ease;
        }
        .cd-anchor:hover { background: rgba(124,92,252,.14); border-color: rgba(124,92,252,.30); color: rgba(196,181,253,.90); }

        .cd-textarea {
          width: 100%; min-height: 110px; resize: vertical;
          border-radius: 14px;
          border: 1px solid rgba(124,92,252,.16); background: rgba(124,92,252,.06);
          color: inherit; padding: 12px; outline: none; line-height: 1.6;
          font-family: 'Syne', system-ui, sans-serif; font-size: 13px; font-weight: 500;
          transition: border-color 150ms ease, box-shadow 150ms ease;
        }
        .cd-textarea:focus { border-color: rgba(124,92,252,.36); box-shadow: 0 0 0 3px rgba(124,92,252,.08); }

        .cd-file-btn {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 8px 12px; border-radius: 11px; cursor: pointer;
          border: 1px solid rgba(124,92,252,.16); background: rgba(124,92,252,.06);
          color: rgba(200,195,240,.72);
          font-family: 'Syne', system-ui, sans-serif; font-size: 12px; font-weight: 700;
          transition: background 130ms ease;
        }
        .cd-file-btn:hover { background: rgba(124,92,252,.12); }

        .cd-post-btn {
          height: 36px; padding: 0 16px; border-radius: 11px; cursor: pointer;
          font-family: 'Syne', system-ui, sans-serif; font-size: 12px; font-weight: 700;
          border: 1px solid rgba(124,92,252,.30);
          background: linear-gradient(135deg, rgba(124,92,252,.26), rgba(59,77,200,.18), rgba(91,142,248,.12));
          color: rgba(235,232,255,.94);
          transition: filter 140ms ease;
        }
        .cd-post-btn:hover:not(:disabled) { filter: brightness(1.12); }
        .cd-post-btn:disabled { opacity: .45; cursor: not-allowed; }

        .cd-react-btn {
          padding: 7px 10px; border-radius: 999px;
          border: 1px solid rgba(124,92,252,.14); background: rgba(124,92,252,.06);
          color: rgba(200,195,240,.72); cursor: pointer;
          display: inline-flex; gap: 7px; align-items: center;
          font-family: 'Syne', system-ui, sans-serif; font-size: 12px; font-weight: 700;
          transition: background 130ms ease;
        }
        .cd-react-btn:hover:not(:disabled) { background: rgba(124,92,252,.12); color: rgba(196,181,253,.90); }
        .cd-react-btn:disabled { opacity: .50; cursor: not-allowed; }

        .cd-select {
          padding: 8px 12px; border-radius: 11px;
          border: 1px solid rgba(124,92,252,.16); background: rgba(11,9,22,.90);
          color: rgba(200,195,240,.80); cursor: pointer;
          font-family: 'Syne', system-ui, sans-serif; font-size: 11px; font-weight: 700;
          outline: none; appearance: none; -webkit-appearance: none; padding-right: 26px;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='rgba(167,139,250,0.6)'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 8px center;
        }

        .cd-sl-link {
          width: 100%; margin-top: 10px; height: 34px; border-radius: 11px;
          display: inline-flex; justify-content: center; align-items: center;
          border: 1px solid rgba(124,92,252,.18); background: rgba(124,92,252,.08);
          color: rgba(196,181,253,.80);
          font-family: 'Syne', system-ui, sans-serif; font-size: 12px; font-weight: 700;
          text-decoration: none;
          transition: background 130ms ease, border-color 130ms ease;
        }
        .cd-sl-link:hover { background: rgba(124,92,252,.16); border-color: rgba(124,92,252,.30); }

        .cd-bonus-btn {
          width: 100%; height: 40px; border-radius: 13px; cursor: pointer;
          display: inline-flex; justify-content: center; align-items: center; gap: 8px;
          border: 1px solid rgba(251,191,36,.28);
          background: linear-gradient(135deg, rgba(251,191,36,.18), rgba(167,139,250,.12), rgba(91,142,248,.10));
          color: rgba(235,232,255,.94);
          font-family: 'Syne', system-ui, sans-serif; font-size: 13px; font-weight: 700;
          text-decoration: none; transition: filter 140ms ease;
        }
        .cd-bonus-btn:hover { filter: brightness(1.12); }
      `}</style>

      <div style={{ position: "relative", zIndex: 1 }}>
        {/* HERO */}
        <GlassCard
          style={{
            position: "relative",
            overflow: "hidden",
            padding: 16,
            borderRadius: 26,
            background:
              "radial-gradient(900px 280px at 20% 0%, rgba(124,92,252,.14), transparent 60%), rgba(11,9,22,.88)",
          }}
        >
          <LogoBackdrop url={logoSrc} opacity={0.16} scale={1.08} position="center" />

          <div style={{ position: "relative", display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 260 }}>
              <div
                style={{
                  width: 56, height: 56, borderRadius: 18,
                  border: "1px solid rgba(124,92,252,.24)",
                  background: "rgba(0,0,0,.22)",
                  overflow: "hidden", display: "grid", placeItems: "center",
                }}
              >
                {logoSrc
                  ? <img src={logoSrc} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <div style={{ width: 34, height: 34, borderRadius: 12, background: "rgba(124,92,252,.12)" }} />}
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 26, fontFamily: "'Syne',system-ui,sans-serif", fontWeight: 800, letterSpacing: -0.7, lineHeight: 1.05 }}>
                  {casino.name}
                </div>
                <div className="mutedSmall" style={{ marginTop: 6 }}>
                  Notes & retours de la communauté • Transparence • 18+
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                  <Pill tone="neutral" title={`Note moyenne ${fmtRatingOutOf5(avg)}`}>
                    ⭐ <StarsInline rating={avg} showNumber />
                    <span style={{ opacity: 0.72 }}>• {rc.toLocaleString("fr-FR")} avis</span>
                  </Pill>
                  <Pill tone="brand" title={`Avis LunaLive ${fmtRatingOutOf5(teamNum)}`}>
                    💜 <StarsInline rating={teamNum} showNumber />
                  </Pill>
                  {isAvoid ? <Pill tone="danger">⛔ À éviter</Pill> : null}
                  {!isAvoid && isWatch ? <Pill tone="warn">👀 Sous surveillance</Pill> : null}
                </div>
              </div>
            </div>
          </div>

          {watchLevel !== "none" ? (
            <div style={{ position: "relative", marginTop: 12 }}>
              <GlassCard
                style={{
                  padding: 12, borderRadius: 18,
                  border: `1px solid ${isAvoid ? "rgba(239,68,68,.22)" : "rgba(91,142,248,.22)"}`,
                  background: isAvoid
                    ? "linear-gradient(180deg, rgba(239,68,68,.10), rgba(0,0,0,.14))"
                    : "linear-gradient(180deg, rgba(91,142,248,.10), rgba(0,0,0,.14))",
                }}
              >
                <div style={{ fontFamily: "'Syne',system-ui,sans-serif", fontWeight: 800 }}>
                  {isAvoid ? "⛔ À éviter" : "👀 Sous surveillance"}
                </div>
                <div className="mutedSmall" style={{ marginTop: 6 }}>
                  {(casino as any).watchReason || "Raison non précisée."}
                </div>
              </GlassCard>
            </div>
          ) : null}

          <div style={{ position: "relative", marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="cd-anchor" type="button" onClick={() => refOverview.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>✨ Aperçu</button>
            <button className="cd-anchor" type="button" onClick={() => refRate.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>⭐ Noter</button>
            <button className="cd-anchor" type="button" onClick={() => refComments.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>💬 Avis & Screens</button>
            <button className="cd-anchor" type="button" onClick={() => refSupport.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>🤝 Soutenir</button>
          </div>
        </GlassCard>

        {/* GRID 2 COL */}
        <div className="casinoGrid" style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 14, marginTop: 14, alignItems: "start" }}>

          {/* MAIN */}
          <div style={{ display: "grid", gap: 14 }}>

            {/* OVERVIEW */}
            <GlassCard ref={refOverview} style={{ padding: 16 }}>
              <SectionTitle title="Aperçu" icon="🧭" />
              <div style={{ marginTop: 12 }}>
                {casino.description
                  ? <div style={{ lineHeight: 1.7, opacity: 0.92, whiteSpace: "pre-wrap" }}>{casino.description}</div>
                  : <div className="mutedSmall">Description à venir.</div>}
              </div>

              <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
                <GlassCard style={{ padding: 14, borderRadius: 18, border: "1px solid rgba(52,211,153,.22)", background: "radial-gradient(700px 240px at 20% 0%, rgba(52,211,153,.12), transparent 60%), rgba(11,9,22,.88)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    <div style={{ fontFamily: "'Syne',system-ui,sans-serif", fontWeight: 800, letterSpacing: -0.4 }}>✅ Points forts</div>
                    <Pill tone="neutral">{pros.length || 0}</Pill>
                  </div>
                  {pros.length ? <ul style={{ margin: "10px 0 0", paddingLeft: 18, lineHeight: 1.8 }}>{pros.map((x, i) => <li key={i} style={{ whiteSpace: "pre-wrap" }}>{x}</li>)}</ul>
                    : <div className="mutedSmall" style={{ marginTop: 10 }}>—</div>}
                </GlassCard>

                <GlassCard style={{ padding: 14, borderRadius: 18, border: "1px solid rgba(239,68,68,.20)", background: "radial-gradient(700px 240px at 20% 0%, rgba(239,68,68,.10), transparent 60%), rgba(11,9,22,.88)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    <div style={{ fontFamily: "'Syne',system-ui,sans-serif", fontWeight: 800, letterSpacing: -0.4 }}>⚠️ Points faibles</div>
                    <Pill tone="neutral">{cons.length || 0}</Pill>
                  </div>
                  {cons.length ? <ul style={{ margin: "10px 0 0", paddingLeft: 18, lineHeight: 1.8 }}>{cons.map((x, i) => <li key={i} style={{ whiteSpace: "pre-wrap" }}>{x}</li>)}</ul>
                    : <div className="mutedSmall" style={{ marginTop: 10 }}>—</div>}
                </GlassCard>
              </div>

              {(casino as any).teamReview ? (
                <GlassCard style={{ marginTop: 14, padding: 14, borderRadius: 18, border: "1px solid rgba(124,92,252,.22)", background: "radial-gradient(800px 260px at 20% 0%, rgba(124,92,252,.16), transparent 60%), rgba(11,9,22,.88)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ fontFamily: "'Syne',system-ui,sans-serif", fontWeight: 800 }}>💜 Avis LunaLive</div>
                    <Pill tone="brand" title={`Avis LunaLive ${fmtRatingOutOf5(teamNum)}`}>
                      <StarsInline rating={teamNum} showNumber />
                    </Pill>
                  </div>
                  <div className="mutedSmall" style={{ marginTop: 10, whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
                    {(casino as any).teamReview}
                  </div>
                </GlassCard>
              ) : null}
            </GlassCard>

            {/* RATE */}
            <GlassCard ref={refRate} style={{ padding: 16 }}>
              <SectionTitle
                title="Donner une note"
                subtitle="1 note par compte, modifiable à tout moment."
                icon="⭐"
                right={
                  myRating
                    ? <Pill tone="brand" title={`Votre note ${myRating}/5`}>
                        <StarsInline rating={myRating} showNumber={false} />
                        <span style={{ opacity: 0.9 }}>{`${myRating}/5`}</span>
                      </Pill>
                    : <Pill tone="neutral">Votre note : —</Pill>
                }
              />
              <div style={{ marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <StarPicker value={myRating} onChange={onSaveRating} disabled={savingRating} />
                <div className="mutedSmall" style={{ opacity: 0.95 }}>
                  {!user || !token ? "Connecte-toi pour noter." : savingRating ? "Enregistrement…" : "Clique sur une étoile ✨"}
                </div>
              </div>
            </GlassCard>

            {/* COMMENTS */}
            <GlassCard ref={refComments} style={{ padding: 16 }}>
              <SectionTitle
                title="Avis & Screens"
                subtitle="Partage un avis, un retrait, une big win… Ajoute jusqu'à 3 images."
                icon="💬"
                right={
                  <select className="cd-select" value={commentSort} onChange={e => setCommentSort(e.target.value as any)}>
                    <option value="new">Plus récents</option>
                    <option value="useful">Plus utiles</option>
                  </select>
                }
              />

              {/* Composer */}
              <div style={{ marginTop: 12 }}>
                <GlassCard style={{ padding: 12, borderRadius: 18, border: "1px solid rgba(124,92,252,.10)", background: "rgba(0,0,0,.16)" }}>
                  <textarea
                    className="cd-textarea"
                    value={body}
                    onChange={e => setBody(e.target.value)}
                    placeholder="Partager un avis, un retrait, un win…"
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
                    <label className="cd-file-btn" title="Ajoute jusqu'à 3 images">
                      🖼️ + Images (max 3)
                      <input type="file" accept="image/*" multiple onChange={e => onPickFiles(e.target.files)} style={{ display: "none" }} />
                    </label>
                    <button className="cd-post-btn" onClick={onPost} disabled={posting || !body.trim() || !user || !token}>
                      {posting ? "Publication…" : "Publier"}
                    </button>
                  </div>

                  {pickedImgs.length > 0 ? (
                    <div style={{ marginTop: 10 }}>
                      <div className="mutedSmall">
                        {pickedImgs.length} image{pickedImgs.length > 1 ? "s" : ""} chargée{pickedImgs.length > 1 ? "s" : ""} ✅
                      </div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                        {pickedImgs.map((p, idx) => (
                          <div key={idx} style={{ position: "relative" }}>
                            <img src={p.url} alt="" style={{ width: 140, height: 92, objectFit: "cover", borderRadius: 14, border: "1px solid rgba(124,92,252,.20)", boxShadow: "0 12px 36px rgba(0,0,0,.28)" }} />
                            <button
                              type="button"
                              onClick={() => {
                                setPickedImgs(prev => {
                                  const copy = [...prev]; const removed = copy.splice(idx, 1)[0];
                                  if (removed) { try { URL.revokeObjectURL(removed.url); } catch {} }
                                  setFiles(copy.map(x => x.file)); return copy;
                                });
                              }}
                              style={{ position: "absolute", top: -8, right: -8, width: 26, height: 26, borderRadius: 999, border: "1px solid rgba(124,92,252,.22)", background: "rgba(0,0,0,.60)", color: "white", cursor: "pointer" }}
                              aria-label="Retirer l'image"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {!user || !token ? <div className="mutedSmall" style={{ marginTop: 10 }}>Connecte-toi pour publier / réagir.</div> : null}
                </GlassCard>
              </div>

              {/* Comment list */}
              <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
                {comments.length === 0 && !loadingComments
                  ? <div className="mutedSmall">Aucun message pour l'instant.</div>
                  : null}

                {comments.map(c => {
                  const pending = String(c.id).startsWith("local_pending_");
                  const initials = String(c.username || "?").slice(0, 1).toUpperCase();
                  const picked = pickUserAvatarUrlFromComment(c);
                  const avatar = picked.url;
                  const authorRatingNum = c.authorRating != null ? numFromAny(c.authorRating) : null;

                  return (
                    <GlassCard
                      key={c.id}
                      style={{
                        padding: 12,
                        borderRadius: 18,
                        border: pending ? "1px solid rgba(91,142,248,.22)" : "1px solid rgba(124,92,252,.10)",
                        background: pending ? "linear-gradient(180deg, rgba(91,142,248,.08), rgba(0,0,0,.14))" : "rgba(0,0,0,.14)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          {/* Avatar */}
                          <div
                            style={{ width: 36, height: 36, borderRadius: 13, position: "relative", overflow: "hidden", display: "grid", placeItems: "center", fontFamily: "'Syne',system-ui,sans-serif", fontWeight: 800, border: "1px solid rgba(124,92,252,.18)", background: "rgba(0,0,0,.28)" }}
                            title={c.username}
                          >
                            {initials}
                            {avatar ? (
                              <img src={avatar} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                            ) : null}
                          </div>

                          <div>
                            <div style={{ fontFamily: "'Syne',system-ui,sans-serif", fontWeight: 700, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                              <span>{c.username}</span>
                              <span className="mutedSmall">• {new Date(c.createdAt).toLocaleString("fr-FR")}</span>
                              {authorRatingNum != null ? (
                                <Pill tone="neutral" title={`Note ${fmtRatingOutOf5(authorRatingNum)}`}>
                                  <StarsInline rating={authorRatingNum} showNumber={false} />
                                  <span style={{ opacity: 0.9 }}>{fmtRatingOutOf5(authorRatingNum)}</span>
                                </Pill>
                              ) : null}
                              {pending ? <Pill tone="warn">⏳ En attente</Pill> : null}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <button className="cd-react-btn" onClick={() => toggleReaction(c.id, c.myReaction, "up")} disabled={!user || !token}>
                            👍 <b>{c.upCount}</b>
                          </button>
                          <button className="cd-react-btn" onClick={() => toggleReaction(c.id, c.myReaction, "down")} disabled={!user || !token}>
                            👎 <b>{c.downCount}</b>
                          </button>
                        </div>
                      </div>

                      <div style={{ marginTop: 10, whiteSpace: "pre-wrap", lineHeight: 1.7, opacity: 0.95 }}>{c.body}</div>

                      {c.images?.length > 0 ? (
                        <div style={{ marginTop: 12, display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                          {c.images.map((im, i) => {
                            const src = absApiUrl(im.url) || im.url;
                            return (
                              <a key={i} href={src} target="_blank" rel="noreferrer" style={{ borderRadius: 16, overflow: "hidden", border: "1px solid rgba(124,92,252,.18)", background: "rgba(0,0,0,.16)", boxShadow: "0 14px 40px rgba(0,0,0,.28)" }}>
                                <img src={src} alt="" style={{ width: "100%", height: 160, objectFit: "cover", display: "block" }} />
                              </a>
                            );
                          })}
                        </div>
                      ) : null}
                    </GlassCard>
                  );
                })}

                <div style={{ display: "flex", justifyContent: "center", paddingTop: 8 }}>
                  {loadingComments
                    ? <div className="mutedSmall">Chargement…</div>
                    : nextCursor ? <button className="btnSecondary" onClick={() => loadComments()}>Charger plus</button>
                    : null}
                </div>
              </div>
            </GlassCard>
          </div>

          {/* SIDE */}
          <div style={{ display: "grid", gap: 14 }}>
            <GlassCard
              ref={refSupport}
              style={{ padding: 16, position: "relative", overflow: "hidden" }}
            >
              {/* déco sans logo casino */}
              <div aria-hidden style={{ position: "absolute", inset: -2, pointerEvents: "none", opacity: 0.75,
                background: "radial-gradient(900px 320px at 20% 0%, rgba(251,191,36,.10), transparent 60%), radial-gradient(900px 320px at 90% 10%, rgba(124,92,252,.12), transparent 62%), repeating-linear-gradient(135deg, rgba(255,255,255,.04), rgba(255,255,255,.04) 1px, transparent 1px, transparent 10px)" }} />
              <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(180deg, rgba(0,0,0,.10), rgba(0,0,0,.26))" }} />

              <div style={{ position: "relative" }}>
                <SectionTitle title="Soutenir un créateur" subtitle="Passe par un lien — ça aide directement le créateur 💜" icon="🤝" />

                <div style={{ marginTop: 12 }}>
                  {bonusLink
                    ? <a className="cd-bonus-btn" href={linkHref(bonusLink)} target="_blank" rel="noreferrer">🎁 {bonusCtaText}</a>
                    : <div className="mutedSmall">Bonus indisponible</div>}
                </div>

                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  {streamerLinks.length === 0
                    ? <div className="mutedSmall">Aucun créateur référencé pour ce casino.</div>
                    : streamerLinks.map((l: any) => {
                        const s = l.streamer!;
                        const initial = String(s.displayName || "?").slice(0, 1).toUpperCase();
                        const picked = pickStreamerAvatarUrl(l);
                        const avatar = picked.url;

                        return (
                          <GlassCard key={l.id} style={{ padding: 12, borderRadius: 18, border: "1px solid rgba(124,92,252,.12)", background: "rgba(0,0,0,.16)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                              <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
                                {/* Streamer avatar */}
                                <div
                                  style={{ width: 42, height: 42, borderRadius: 16, position: "relative", overflow: "hidden", border: "1px solid rgba(124,92,252,.22)", background: "rgba(0,0,0,.28)", display: "grid", placeItems: "center", fontFamily: "'Syne',system-ui,sans-serif", fontWeight: 800 }}
                                  title={s.displayName}
                                >
                                  {initial}
                                  {avatar ? (
                                    <img src={avatar} alt=""
                                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                                      onLoad={() => { if (!DEV) return; console.log("[CasinoPage] avatar OK", picked.debug); }}
                                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; if (!DEV) return; console.log("[CasinoPage] avatar FAIL", picked.debug); }} />
                                  ) : null}
                                </div>

                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontFamily: "'Syne',system-ui,sans-serif", fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.displayName}</div>
                                  <div className="mutedSmall">{(s.followsCount ?? 0).toLocaleString("fr-FR")} followers</div>
                                </div>
                              </div>

                              {l.pinnedRank != null ? <Pill tone="neutral">📌 Pin</Pill> : null}
                            </div>

                            <a className="cd-sl-link" href={linkHref(l)} target="_blank" rel="noreferrer">
                              {(l.label || "").trim() || "Passer par son lien"}
                            </a>
                          </GlassCard>
                        );
                      })}
                </div>

                <div className="mutedSmall" style={{ marginTop: 12, opacity: 0.85 }}>
                  18+ • Jouez responsable
                </div>
              </div>
            </GlassCard>
          </div>
        </div>
      </div>
    </main>
  );
}