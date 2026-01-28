// web/src/pages/CasinoPage.tsx
import * as React from "react";
import { useParams } from "react-router-dom";
import {
  getCasino,
  getCasinoComments,
  postCasinoComment,
  reactToCasinoComment,
  setCasinoRating,
  absApiUrl,
  type CasinoComment,
  type CasinoLink,
  type CasinoDetailResp,
} from "../lib/api_casinos";
import { useAuth } from "../auth/AuthProvider";

const DEV = Boolean(import.meta.env.DEV);

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function numFromAny(v: any): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function splitList(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => String(x)).filter((x) => x != null && String(x).trim() !== "");
  try {
    const j = JSON.parse(String(v));
    if (Array.isArray(j)) return j.map((x) => String(x)).filter((x) => x != null && String(x).trim() !== "");
  } catch {}
  return [];
}

function sortLinks(links: CasinoLink[]) {
  return [...links].sort((a: any, b: any) => {
    const ap = a?.pinnedRank ?? 999999;
    const bp = b?.pinnedRank ?? 999999;
    if (ap !== bp) return ap - bp;

    const af = a?.streamer?.followsCount ?? 0;
    const bf = b?.streamer?.followsCount ?? 0;
    return bf - af;
  });
}

function linkHref(l: any): string {
  const raw = (l?.goUrl || l?.targetUrl || "").trim();
  const abs = absApiUrl(raw);
  return abs || "#";
}

/** Format rating nicely:
 * - drop trailing .0
 * - keep 1 decimal when needed
 * - FR decimal comma
 */
function fmtRating(v: number, decimals = 1) {
  const n = Number.isFinite(v) ? v : 0;
  const fixed = n.toFixed(decimals);
  const cleaned = fixed.replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
  return cleaned.replace(".", ",");
}

/** Badge text for ratings (no "5.0/5", just "5/5" or "4,6/5") */
function fmtRatingOutOf5(v: number) {
  return `${fmtRating(v, 1)}/5`;
}

/**
 * Avatar URL resolver (streamer links):
 * - priorité à streamer.avatarUrl si fourni par l’API
 * - sinon fallback sur /avatars/u/:userId
 */
function pickStreamerAvatarUrl(link: any) {
  const s = link?.streamer ?? null;

  const uid =
    link?.ownerUserId ??
    link?.userId ??
    s?.ownerUserId ??
    s?.userId ??
    s?.owner_user_id ??
    s?.user_id ??
    null;

  const direct = s?.avatarUrl ? absApiUrl(s.avatarUrl) || s.avatarUrl : null;

  // cache-bust soft (1/min)
  const byUid = uid ? absApiUrl(`/avatars/u/${uid}?v=${Math.floor(Date.now() / 60000)}`) : null;

  return {
    url: direct || byUid,
    debug: {
      linkId: link?.id,
      uid,
      streamerName: s?.displayName,
      directAvatarUrl: s?.avatarUrl ?? null,
      computed: direct || byUid,
      fields: {
        link_ownerUserId: link?.ownerUserId ?? null,
        link_userId: link?.userId ?? null,
        streamer_ownerUserId: s?.ownerUserId ?? s?.owner_user_id ?? null,
        streamer_userId: s?.userId ?? s?.user_id ?? null,
      },
    },
  };
}

/** Avatar resolver (comments): /avatars/u/:userId */
function pickUserAvatarUrlFromComment(c: any) {
  const uid = c?.userId ?? c?.ownerUserId ?? c?.authorUserId ?? null;
  const byUid = uid ? absApiUrl(`/avatars/u/${uid}?v=${Math.floor(Date.now() / 60000)}`) : null;
  return { url: byUid, uid };
}

/* ─────────────────────────────────────────────
   UI atoms (same DA as CheckTaSlot)
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
  const map: Record<string, { bg: string; bd: string }> = {
    brand: { bg: "rgba(140,90,255,0.14)", bd: "rgba(140,90,255,0.28)" },
    warn: { bg: "rgba(80,160,255,0.14)", bd: "rgba(80,160,255,0.26)" },
    danger: { bg: "rgba(255,90,120,0.14)", bd: "rgba(255,90,120,0.26)" },
    neutral: { bg: "rgba(255,255,255,0.06)", bd: "rgba(255,255,255,0.12)" },
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
        fontSize: 12,
        fontWeight: 1100,
        whiteSpace: "nowrap",
        backdropFilter: "blur(10px)",
      }}
    >
      {children}
    </span>
  );
}

/** ✅ FIX TS: forwardRef -> ref utilisable sur <GlassCard ref=... /> */
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
        border: "1px solid rgba(255,255,255,0.10)",
        background: "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(0,0,0,0.10))",
        boxShadow: "0 18px 55px rgba(0,0,0,0.28)",
        backdropFilter: "blur(10px)",
        ...style,
      }}
    >
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
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        alignItems: "baseline",
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "grid", gap: 6 }}>
        <div
          style={{
            fontSize: 22,
            fontWeight: 1400,
            letterSpacing: -0.6,
            background: "linear-gradient(90deg, rgba(255,210,110,1), rgba(180,140,255,1), rgba(80,160,255,1))",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            filter: "drop-shadow(0 10px 22px rgba(0,0,0,0.35))",
          }}
        >
          {icon ? `${icon} ` : ""}
          {title}
        </div>
        {subtitle ? <div className="mutedSmall">{subtitle}</div> : null}
      </div>
      {right ? <div>{right}</div> : null}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Stars (premium, with halves)
───────────────────────────────────────────── */

function StarSvg({ fill }: { fill: 0 | 0.5 | 1 }) {
  const id = React.useId();
  const gradId = `half-${id}`;
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
  const full = i + 1 <= Math.floor(rating);
  if (full) return 1;
  const frac = rating - Math.floor(rating);
  if (i === Math.floor(rating) && frac >= 0.25 && frac < 0.75) return 0.5;
  if (i === Math.floor(rating) && frac >= 0.75) return 1;
  return 0;
}

function StarsInline({
  rating,
  showNumber = true,
  size = 18,
}: {
  rating: number; // 0..5
  showNumber?: boolean;
  size?: number;
}) {
  const r = clamp(rating, 0, 5);
  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <span style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} style={{ display: "inline-flex", lineHeight: 0, fontSize: size }}>
            <StarSvg fill={getStarFill(i, r)} />
          </span>
        ))}
      </span>

      {/* ✅ Clean numbers: show only "4,6/5" (no "(4.6/5)" and no 5.0) */}
      {showNumber ? <span style={{ opacity: 0.9 }}>{fmtRatingOutOf5(r)}</span> : null}
    </span>
  );
}

function StarPicker({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const [hover, setHover] = React.useState<number | null>(null);
  const v = hover ?? value;

  return (
    <div
      style={{
        display: "inline-flex",
        gap: 8,
        padding: 8,
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.05)",
        boxShadow: "0 14px 40px rgba(0,0,0,0.25)",
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
              border: "1px solid rgba(255,255,255,0.12)",
              background: filled
                ? "linear-gradient(180deg, rgba(255,210,110,0.18), rgba(180,140,255,0.14))"
                : "rgba(0,0,0,0.18)",
              color: filled ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.75)",
              display: "grid",
              placeItems: "center",
              cursor: disabled ? "not-allowed" : "pointer",
              transform: hover === starVal && !disabled ? "translateY(-1px) scale(1.02)" : "none",
              transition: "transform .12s ease, background .12s ease, box-shadow .12s ease",
              boxShadow: filled ? "0 12px 28px rgba(0,0,0,0.25)" : "none",
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
   Backdrop logo helper (only for header/main cards)
───────────────────────────────────────────── */
function LogoBackdrop({
  url,
  opacity = 0.16,
  scale = 1.08,
  position = "center",
}: {
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
            "linear-gradient(90deg, rgba(0,0,0,0.58), rgba(0,0,0,0.18) 55%, rgba(0,0,0,0.58)), radial-gradient(900px 420px at 50% 0%, rgba(255,255,255,0.06), rgba(0,0,0,0) 60%)",
          pointerEvents: "none",
        }}
      />
    </>
  );
}

/* ─────────────────────────────────────────────
   Page
───────────────────────────────────────────── */

export default function CasinoPage() {
  const { slug } = useParams();
  const auth: any = useAuth();
  const user = auth?.user ?? null;
  const token: string | null = auth?.token ?? auth?.accessToken ?? auth?.jwt ?? null;

  const [loading, setLoading] = React.useState(true);
  const [data, setData] = React.useState<CasinoDetailResp | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [commentSort, setCommentSort] = React.useState<"new" | "useful">("new");
  const [comments, setComments] = React.useState<CasinoComment[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [loadingComments, setLoadingComments] = React.useState(false);

  // myRating: note locale (UI) ; myRatingInit: permet de ne pas écraser la valeur quand l'API arrive plus tard
  const [myRating, setMyRating] = React.useState(0);
  const [myRatingInit, setMyRatingInit] = React.useState(false);
  const [savingRating, setSavingRating] = React.useState(false);

  const [body, setBody] = React.useState("");
  type PickedImg = { file: File; url: string };
  const [files, setFiles] = React.useState<File[]>([]);
  const [pickedImgs, setPickedImgs] = React.useState<PickedImg[]>([]);
  const [posting, setPosting] = React.useState(false);

  const refOverview = React.useRef<HTMLDivElement>(null);
  const refRate = React.useRef<HTMLDivElement>(null);
  const refComments = React.useRef<HTMLDivElement>(null);
  const refSupport = React.useRef<HTMLDivElement>(null);

  function revokePicked(list: PickedImg[]) {
    for (const it of list) {
      try {
        URL.revokeObjectURL(it.url);
      } catch {}
    }
  }

  function clearPicked() {
    setFiles([]);
    setPickedImgs((prev) => {
      revokePicked(prev);
      return [];
    });
  }

  async function loadCasino() {
    if (!slug) return;
    setLoading(true);
    setError(null);
    try {
      const r = await getCasino(slug);
      setData(r);

      // ✅ Pré-remplissage: récupère la note perso si l'API la fournit
      // On supporte plusieurs noms possibles pour éviter les mismatchs back/front.
      const mine =
        numFromAny((r as any)?.myRating) ??
        numFromAny((r as any)?.my_rating) ??
        numFromAny((r as any)?.stats?.myRating) ??
        numFromAny((r as any)?.stats?.my_rating) ??
        numFromAny((r as any)?.userRating) ??
        numFromAny((r as any)?.user_rating) ??
        null;

      // Si on n'a pas encore initialisé, on hydrate le picker avec la note existante (1..5)
      if (!myRatingInit) {
        const v = mine != null ? clamp(Math.round(mine), 0, 5) : 0;
        setMyRating(v);
        setMyRatingInit(true);
      }

      if (DEV) {
        // eslint-disable-next-line no-console
        console.log("[CasinoPage] myRating from API =", mine);
        // eslint-disable-next-line no-console
        console.log("[CasinoPage] links raw =", (r as any)?.links);
        // eslint-disable-next-line no-console
        console.log("[CasinoPage] bonusLink raw =", (r as any)?.bonusLink);
      }
    } catch (e: any) {
      setError(e?.message || "error");
    } finally {
      setLoading(false);
    }
  }

  async function loadComments(opts?: { reset?: boolean }) {
    if (!slug) return;
    setLoadingComments(true);
    try {
      const r = await (getCasinoComments as any)(
        slug,
        {
          sort: commentSort,
          limit: 30,
          cursor: opts?.reset ? null : nextCursor,
        },
        token
      );

      setNextCursor(r.nextCursor);
      setComments((prev) => (opts?.reset ? r.items : [...prev, ...r.items]));
    } finally {
      setLoadingComments(false);
    }
  }

  React.useEffect(() => {
    return () => {
      revokePicked(pickedImgs);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    // reset init pour recharger proprement quand on change de casino / token
    setMyRatingInit(false);
    loadCasino();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, token]);

  React.useEffect(() => {
    setComments([]);
    setNextCursor(null);
    loadComments({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commentSort, slug, token]);

  React.useEffect(() => {
    if (!DEV) return;
    if (!data) return;

    const linksSorted = sortLinks((data as any).links || []);
    const streamerLinks = linksSorted.filter((l: any) => l.streamer);

    const rows = streamerLinks.map((l: any) => {
      const picked = pickStreamerAvatarUrl(l);
      return {
        linkId: l?.id,
        streamerName: l?.streamer?.displayName,
        computedAvatar: picked.url,
        uid: picked.debug.uid,
        streamer_avatarUrl: picked.debug.directAvatarUrl,
      };
    });

    // eslint-disable-next-line no-console
    console.table(rows);
  }, [data]);

  async function onSaveRating(v: number) {
    if (!data) return;
    if (!user || !token) {
      alert("Connecte-toi pour noter.");
      return;
    }
    setMyRating(v);
    setSavingRating(true);
    try {
      await (setCasinoRating as any)((data as any). (data as any).casino.id, v, token);
      // refresh pour avg/count + éventuellement myRating côté API
      const fresh = await getCasino((data as any).casino.slug);
      setData(fresh);

      const mine =
        numFromAny((fresh as any)?.myRating) ??
        numFromAny((fresh as any)?.my_rating) ??
        numFromAny((fresh as any)?.stats?.myRating) ??
        numFromAny((fresh as any)?.stats?.my_rating) ??
        numFromAny((fresh as any)?.userRating) ??
        numFromAny((fresh as any)?.user_rating) ??
        null;

      if (mine != null) setMyRating(clamp(Math.round(mine), 0, 5));
    } catch (e: any) {
      alert(e?.message || "Erreur note");
    } finally {
      setSavingRating(false);
    }
  }

  function onPickFiles(list: FileList | null) {
    if (!list) return;
    const arr = Array.from(list).slice(0, 3);

    setPickedImgs((prev) => {
      revokePicked(prev);
      return [];
    });

    const next = arr.map((f) => ({ file: f, url: URL.createObjectURL(f) }));
    setFiles(arr);
    setPickedImgs(next);
  }

  async function onPost() {
    if (!data) return;
    if (!user || !token) {
      alert("Connecte-toi pour publier.");
      return;
    }
    const text = body.trim();
    if (!text) return;

    const imgsSnap = pickedImgs;
    const filesSnap = files;

    setPosting(true);
    try {
      const r = await (postCasinoComment as any)((data as any).casino.id, text, filesSnap, token);

      setBody("");

      if (r.status === "published") {
        clearPicked();
        setComments([]);
        setNextCursor(null);
        await loadComments({ reset: true });
      } else {
        const pending: CasinoComment = {
          id: `local_pending_${Date.now()}`,
          body: text,
          createdAt: new Date().toISOString(),
          userId: (user as any).id ?? 0,
          username: (user as any).username ?? "Moi",
          hasImages: imgsSnap.length > 0,
          authorRating: myRating ? myRating : null,
          upCount: 0,
          downCount: 0,
          myReaction: null,
          images: imgsSnap.map((p) => ({
            url: p.url,
            w: null,
            h: null,
            sizeBytes: p.file.size,
          })),
        };

        clearPicked();
        setComments((prev) => [pending, ...prev]);
      }
    } catch (e: any) {
      alert(e?.message || "Erreur publication");
    } finally {
      setPosting(false);
    }
  }

  async function toggleReaction(commentId: string, current: "up" | "down" | null, next: "up" | "down") {
    if (!user || !token) {
      alert("Connecte-toi pour réagir.");
      return;
    }
    const newKind: "up" | "down" | null = current === next ? null : next;

    setComments((prev) =>
      prev.map((c) => {
        if (c.id !== commentId) return c;
        let up = c.upCount;
        let down = c.downCount;

        if (c.myReaction === "up") up -= 1;
        if (c.myReaction === "down") down -= 1;

        if (newKind === "up") up += 1;
        if (newKind === "down") down += 1;

        return { ...c, myReaction: newKind, upCount: clamp(up, 0, 1e9), downCount: clamp(down, 0, 1e9) };
      })
    );

    try {
      await (reactToCasinoComment as any)(commentId, newKind, token);
    } catch (e: any) {
      alert(e?.message || "Erreur réaction");
      setComments([]);
      setNextCursor(null);
      await loadComments({ reset: true });
    }
  }

  if (loading) {
    return (
      <div className="container">
        <div className="muted">Chargement…</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container">
        <div className="alert">{error || "Introuvable"}</div>
      </div>
    );
  }

  const casino = data.casino;
  const stats = data.stats;

  const pros = splitList((casino as any).pros);
  const cons = splitList((casino as any).cons);

  const linksSorted = sortLinks((data as any).links || []);
  const streamerLinks = linksSorted.filter((l: any) => l.streamer);
  const bonusLink = (data as any).bonusLink;

  const bonusCtaText = (casino.bonusHeadline || "").trim() || "Récupérez votre bonus";

  const avg = numFromAny((stats as any)?.avgRating) ?? 0;
  const rc = Number((stats as any)?.ratingsCount ?? 0) || 0;

  const teamNum = numFromAny((casino as any).teamRating) ?? 0;

  const logoSrc = absApiUrl((casino as any).logoUrl) || (casino as any).logoUrl || null;

  const watchLevel = (casino as any).watchLevel || "none";
  const isAvoid = watchLevel === "avoid";
  const isWatch = watchLevel === "watch";

  return (
    <main className="container casinoDetailPage">
      <style>{`
        .casinoDetailPage{
          position: relative;
          padding-bottom: 28px;
        }
        .casinoDetailPage::before{
          content:"";
          position: fixed;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          background:
            radial-gradient(1100px 420px at 18% 0%, rgba(255,90,180,0.22), rgba(0,0,0,0) 62%),
            radial-gradient(1200px 500px at 80% 10%, rgba(80,160,255,0.22), rgba(0,0,0,0) 62%),
            radial-gradient(1200px 600px at 50% 95%, rgba(140,90,255,0.22), rgba(0,0,0,0) 64%),
            linear-gradient(180deg, rgba(0,0,0,0.0), rgba(0,0,0,0.10));
        }

        @media (max-width: 980px){
          .casinoGrid{
            grid-template-columns: 1fr !important;
          }
        }
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
              "radial-gradient(900px 280px at 20% 0%, rgba(180,140,255,0.16), rgba(0,0,0,0) 60%), linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.12))",
          }}
        >
          <LogoBackdrop url={logoSrc} opacity={0.16} scale={1.08} position="center" />

          <div
            style={{
              position: "relative",
              display: "flex",
              justifyContent: "space-between",
              gap: 14,
              flexWrap: "wrap",
              alignItems: "flex-start",
            }}
          >
            <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 260 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 18,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(0,0,0,0.18)",
                  overflow: "hidden",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                {logoSrc ? (
                  <img src={logoSrc} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div style={{ width: 34, height: 34, borderRadius: 12, background: "rgba(255,255,255,0.10)" }} />
                )}
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 26, fontWeight: 1450, letterSpacing: -0.7, lineHeight: 1.05 }}>{casino.name}</div>
                <div className="mutedSmall" style={{ marginTop: 6 }}>
                  Notes & retours de la communauté • Transparence • 18+
                </div>

                {/* Pills: user rating + LunaLive stars + watch labels */}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                  <Pill tone="neutral" title={`Note moyenne ${fmtRatingOutOf5(avg)}`}>
                    ⭐ <StarsInline rating={avg} showNumber={true} />
                    <span style={{ opacity: 0.8 }}>• {rc.toLocaleString("fr-FR")} avis</span>
                  </Pill>

                  <Pill tone="brand" title={`Avis LunaLive ${fmtRatingOutOf5(teamNum)}`}>
                    💜 <StarsInline rating={teamNum} showNumber={true} />
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
                  padding: 12,
                  borderRadius: 18,
                  border: `1px solid ${isAvoid ? "rgba(255,90,120,0.22)" : "rgba(80,160,255,0.22)"}`,
                  background: isAvoid
                    ? "linear-gradient(180deg, rgba(255,90,120,0.12), rgba(0,0,0,0.14))"
                    : "linear-gradient(180deg, rgba(80,160,255,0.12), rgba(0,0,0,0.14))",
                }}
              >
                <div style={{ fontWeight: 1200 }}>{isAvoid ? "⛔ À éviter" : "👀 Sous surveillance"}</div>
                <div className="mutedSmall" style={{ marginTop: 6 }}>
                  {(casino as any).watchReason || "Raison non précisée."}
                </div>
              </GlassCard>
            </div>
          ) : null}

          {/* Anchors */}
          <div style={{ position: "relative", marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btnGhost" onClick={() => refOverview.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              ✨ Aperçu
            </button>
            <button className="btnGhost" onClick={() => refRate.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              ⭐ Noter
            </button>
            <button className="btnGhost" onClick={() => refComments.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              💬 Avis & Screens
            </button>
            <button className="btnGhost" onClick={() => refSupport.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              🤝 Soutenir
            </button>
          </div>
        </GlassCard>

        {/* GRID 2 COL */}
        <div className="casinoGrid" style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 14, marginTop: 14, alignItems: "start" }}>
          {/* MAIN */}
          <div style={{ display: "grid", gap: 14 }}>
            {/* OVERVIEW */}
            <GlassCard ref={refOverview} style={{ padding: 16 }}>
              <SectionTitle title="Aperçu" subtitle="" icon="🧭" />
              <div style={{ marginTop: 12 }}>
                {casino.description ? (
                  <div style={{ lineHeight: 1.7, opacity: 0.92, whiteSpace: "pre-wrap" }}>{casino.description}</div>
                ) : (
                  <div className="mutedSmall">Description à venir.</div>
                )}
              </div>

              {/* Pros / Cons premium */}
              <div
                style={{
                  marginTop: 14,
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                  gap: 12,
                }}
              >
                <GlassCard
                  style={{
                    padding: 14,
                    borderRadius: 18,
                    border: "1px solid rgba(80,240,170,0.22)",
                    background:
                      "radial-gradient(700px 240px at 20% 0%, rgba(80,240,170,0.16), rgba(0,0,0,0) 60%), linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.12))",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    <div style={{ fontWeight: 1400, letterSpacing: -0.4 }}>✅ Points forts</div>
                    <Pill tone="neutral">{pros.length || 0}</Pill>
                  </div>

                  {pros.length ? (
                    <ul style={{ margin: "10px 0 0", paddingLeft: 18, lineHeight: 1.8 }}>
                      {pros.map((x, i) => (
                        <li key={i} style={{ whiteSpace: "pre-wrap" }}>
                          {x}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="mutedSmall" style={{ marginTop: 10 }}>
                      —
                    </div>
                  )}
                </GlassCard>

                <GlassCard
                  style={{
                    padding: 14,
                    borderRadius: 18,
                    border: "1px solid rgba(255,90,120,0.20)",
                    background:
                      "radial-gradient(700px 240px at 20% 0%, rgba(255,90,120,0.14), rgba(0,0,0,0) 60%), linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.12))",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    <div style={{ fontWeight: 1400, letterSpacing: -0.4 }}>⚠️ Points faibles</div>
                    <Pill tone="neutral">{cons.length || 0}</Pill>
                  </div>

                  {cons.length ? (
                    <ul style={{ margin: "10px 0 0", paddingLeft: 18, lineHeight: 1.8 }}>
                      {cons.map((x, i) => (
                        <li key={i} style={{ whiteSpace: "pre-wrap" }}>
                          {x}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="mutedSmall" style={{ marginTop: 10 }}>
                      —
                    </div>
                  )}
                </GlassCard>
              </div>

              {(casino as any).teamReview ? (
                <GlassCard
                  style={{
                    marginTop: 14,
                    padding: 14,
                    borderRadius: 18,
                    border: "1px solid rgba(140,90,255,0.22)",
                    background:
                      "radial-gradient(800px 260px at 20% 0%, rgba(140,90,255,0.18), rgba(0,0,0,0) 60%), linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.12))",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 1400 }}>💜 Avis LunaLive</div>

                    <Pill tone="brand" title={`Avis LunaLive ${fmtRatingOutOf5(teamNum)}`}>
                      <StarsInline rating={teamNum} showNumber={true} />
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
                  myRating ? (
                    <Pill tone="brand" title={`Votre note ${myRating}/5`}>
                      {/* ✅ Just show stars (no extra "(x/5)") */}
                      <StarsInline rating={myRating} showNumber={false} />
                      <span style={{ opacity: 0.9 }}>{`${myRating}/5`}</span>
                    </Pill>
                  ) : (
                    <Pill tone="neutral">Votre note : —</Pill>
                  )
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
                subtitle="Partage un avis, un retrait, une big win… Ajoute jusqu’à 3 images."
                icon="💬"
                right={
                  <select className="select" value={commentSort} onChange={(e) => setCommentSort(e.target.value as any)}>
                    <option value="new">Plus récents</option>
                    <option value="useful">Plus utiles</option>
                  </select>
                }
              />

              {/* Composer premium */}
              <div style={{ marginTop: 12 }}>
                <GlassCard
                  style={{
                    padding: 12,
                    borderRadius: 18,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(0,0,0,0.16)",
                  }}
                >
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Partager un avis, un retrait, un win…"
                    style={{
                      width: "100%",
                      minHeight: 110,
                      resize: "vertical",
                      borderRadius: 16,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(255,255,255,0.04)",
                      color: "inherit",
                      padding: 12,
                      outline: "none",
                      lineHeight: 1.6,
                      fontWeight: 700,
                    }}
                  />

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      flexWrap: "wrap",
                      alignItems: "center",
                      marginTop: 10,
                    }}
                  >
                    <label
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "8px 12px",
                        borderRadius: 999,
                        border: "1px solid rgba(255,255,255,0.12)",
                        background: "rgba(255,255,255,0.06)",
                        cursor: "pointer",
                        fontWeight: 900,
                        fontSize: 12,
                      }}
                      title="Ajoute jusqu’à 3 images"
                    >
                      🖼️ + Images (max 3)
                      <input type="file" accept="image/*" multiple onChange={(e) => onPickFiles(e.target.files)} style={{ display: "none" }} />
                    </label>

                    <button className="btnPrimary" onClick={onPost} disabled={posting || !body.trim() || !user || !token}>
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
                            <img
                              src={p.url}
                              alt=""
                              style={{
                                width: 140,
                                height: 92,
                                objectFit: "cover",
                                borderRadius: 16,
                                border: "1px solid rgba(255,255,255,0.14)",
                                boxShadow: "0 14px 40px rgba(0,0,0,0.28)",
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setPickedImgs((prev) => {
                                  const copy = [...prev];
                                  const removed = copy.splice(idx, 1)[0];
                                  if (removed) {
                                    try {
                                      URL.revokeObjectURL(removed.url);
                                    } catch {}
                                  }
                                  setFiles(copy.map((x) => x.file));
                                  return copy;
                                });
                              }}
                              style={{
                                position: "absolute",
                                top: -8,
                                right: -8,
                                width: 26,
                                height: 26,
                                borderRadius: 999,
                                border: "1px solid rgba(255,255,255,0.14)",
                                background: "rgba(0,0,0,0.55)",
                                color: "white",
                                cursor: "pointer",
                              }}
                              aria-label="Retirer l'image"
                              title="Retirer"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {!user || !token ? (
                    <div className="mutedSmall" style={{ marginTop: 10 }}>
                      Connecte-toi pour publier / réagir.
                    </div>
                  ) : null}
                </GlassCard>
              </div>

              {/* List */}
              <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
                {comments.length === 0 && !loadingComments ? <div className="mutedSmall">Aucun message pour l’instant.</div> : null}

                {comments.map((c) => {
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
                        border: pending ? "1px solid rgba(80,160,255,0.22)" : "1px solid rgba(255,255,255,0.10)",
                        background: pending ? "linear-gradient(180deg, rgba(80,160,255,0.10), rgba(0,0,0,0.14))" : "rgba(0,0,0,0.14)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          {/* comment avatar */}
                          <div
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 14,
                              position: "relative",
                              overflow: "hidden",
                              display: "grid",
                              placeItems: "center",
                              fontWeight: 1100,
                              border: "1px solid rgba(255,255,255,0.12)",
                              background: "rgba(255,255,255,0.05)",
                            }}
                            title={c.username}
                          >
                            {initials}
                            {avatar ? (
                              <img
                                src={avatar}
                                alt=""
                                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).style.display = "none";
                                }}
                              />
                            ) : null}
                          </div>

                          <div>
                            <div style={{ fontWeight: 1200, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                              <span>{c.username}</span>
                              <span className="mutedSmall">• {new Date(c.createdAt).toLocaleString("fr-FR")}</span>

                              {authorRatingNum != null ? (
                                <Pill tone="neutral" title={`Note ${fmtRatingOutOf5(authorRatingNum)}`}>
                                  {/* ✅ stars + "4/5" (clean) */}
                                  <StarsInline rating={authorRatingNum} showNumber={false} />
                                  <span style={{ opacity: 0.9 }}>{fmtRatingOutOf5(authorRatingNum)}</span>
                                </Pill>
                              ) : null}

                              {pending ? <Pill tone="warn">⏳ En attente</Pill> : null}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <button
                            className="btnGhost"
                            onClick={() => toggleReaction(c.id, c.myReaction, "up")}
                            disabled={!user || !token}
                            style={{
                              padding: "8px 10px",
                              borderRadius: 999,
                              display: "inline-flex",
                              gap: 8,
                              alignItems: "center",
                              opacity: !user || !token ? 0.6 : 1,
                            }}
                          >
                            👍 <b>{c.upCount}</b>
                          </button>
                          <button
                            className="btnGhost"
                            onClick={() => toggleReaction(c.id, c.myReaction, "down")}
                            disabled={!user || !token}
                            style={{
                              padding: "8px 10px",
                              borderRadius: 999,
                              display: "inline-flex",
                              gap: 8,
                              alignItems: "center",
                              opacity: !user || !token ? 0.6 : 1,
                            }}
                          >
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
                              <a
                                key={i}
                                href={src}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  borderRadius: 18,
                                  overflow: "hidden",
                                  border: "1px solid rgba(255,255,255,0.14)",
                                  background: "rgba(0,0,0,0.16)",
                                  boxShadow: "0 16px 45px rgba(0,0,0,0.30)",
                                }}
                              >
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
                  {loadingComments ? (
                    <div className="mutedSmall">Chargement…</div>
                  ) : nextCursor ? (
                    <button className="btnSecondary" onClick={() => loadComments()}>
                      Charger plus
                    </button>
                  ) : null}
                </div>
              </div>
            </GlassCard>
          </div>

          {/* SIDE */}
          <div style={{ display: "grid", gap: 14 }}>
            {/* Support (NO casino logo backdrop) */}
            <GlassCard
              ref={refSupport}
              style={{
                padding: 16,
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* décoratif léger (sans logo casino) */}
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  inset: -2,
                  background:
                    "radial-gradient(900px 320px at 20% 0%, rgba(255,210,110,0.14), rgba(0,0,0,0) 60%), radial-gradient(900px 320px at 90% 10%, rgba(140,90,255,0.16), rgba(0,0,0,0) 62%), repeating-linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.06) 1px, rgba(0,0,0,0) 1px, rgba(0,0,0,0) 10px)",
                  opacity: 0.75,
                  pointerEvents: "none",
                }}
              />
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "linear-gradient(180deg, rgba(0,0,0,0.12), rgba(0,0,0,0.28))",
                  pointerEvents: "none",
                }}
              />

              <div style={{ position: "relative" }}>
                <SectionTitle title="Soutenir un créateur" subtitle="Passe par un lien — ça aide directement le créateur 💜" icon="🤝" />

                <div style={{ marginTop: 12 }}>
                  {bonusLink ? (
                    <a
                      className="btnPrimary"
                      style={{ width: "100%", display: "inline-flex", justifyContent: "center" }}
                      href={linkHref(bonusLink)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      🎁 {bonusCtaText}
                    </a>
                  ) : (
                    <div className="mutedSmall">Bonus indisponible</div>
                  )}
                </div>

                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  {streamerLinks.length === 0 ? (
                    <div className="mutedSmall">Aucun créateur référencé pour ce casino.</div>
                  ) : (
                    streamerLinks.map((l: any) => {
                      const s = l.streamer!;
                      const initial = String(s.displayName || "?").slice(0, 1).toUpperCase();

                      const picked = pickStreamerAvatarUrl(l);
                      const avatar = picked.url;

                      return (
                        <GlassCard
                          key={l.id}
                          style={{
                            padding: 12,
                            borderRadius: 18,
                            background: "rgba(0,0,0,0.16)",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                            <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
                              <div
                                style={{
                                  width: 42,
                                  height: 42,
                                  borderRadius: 18,
                                  position: "relative",
                                  overflow: "hidden",
                                  border: "1px solid rgba(255,255,255,0.14)",
                                  background: "rgba(255,255,255,0.06)",
                                  display: "grid",
                                  placeItems: "center",
                                  fontWeight: 1200,
                                }}
                                title={s.displayName}
                              >
                                {initial}
                                {avatar ? (
                                  <img
                                    src={avatar}
                                    alt=""
                                    style={{
                                      position: "absolute",
                                      inset: 0,
                                      width: "100%",
                                      height: "100%",
                                      objectFit: "cover",
                                    }}
                                    onLoad={() => {
                                      if (!DEV) return;
                                      // eslint-disable-next-line no-console
                                      console.log("[CasinoPage] avatar OK", picked.debug);
                                    }}
                                    onError={(e) => {
                                      (e.currentTarget as HTMLImageElement).style.display = "none";
                                      if (!DEV) return;
                                      // eslint-disable-next-line no-console
                                      console.log("[CasinoPage] avatar FAIL", picked.debug);
                                    }}
                                  />
                                ) : null}
                              </div>

                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 1200, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {s.displayName}
                                </div>
                                <div className="mutedSmall">{(s.followsCount ?? 0).toLocaleString("fr-FR")} followers</div>
                              </div>
                            </div>

                            {l.pinnedRank != null ? <Pill tone="neutral">📌 Pin</Pill> : null}
                          </div>

                          <a
                            className="btnSecondary"
                            style={{ width: "100%", marginTop: 10, display: "inline-flex", justifyContent: "center" }}
                            href={linkHref(l)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {(l.label || "").trim() || "Passer par son lien"}
                          </a>
                        </GlassCard>
                      );
                    })
                  )}
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
