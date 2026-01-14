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

function StarPicker({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`starPicker ${disabled ? "disabled" : ""}`}>
      {Array.from({ length: 5 }).map((_, i) => {
        const v = i + 1;
        const on = v <= value;
        return (
          <button
            key={v}
            type="button"
            className={`starBtn ${on ? "on" : ""}`}
            onClick={() => onChange(v)}
            disabled={disabled}
            aria-label={`${v} étoile`}
          >
            ★
          </button>
        );
      })}
    </div>
  );
}

function splitList(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v))
    return v.map((x) => String(x)).filter((x) => x != null && String(x).trim() !== "");
  try {
    const j = JSON.parse(String(v));
    if (Array.isArray(j))
      return j.map((x) => String(x)).filter((x) => x != null && String(x).trim() !== "");
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

/**
 * Avatar URL resolver:
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

export default function CasinoPage() {
  const { slug } = useParams();
  // ⚠️ IMPORTANT: on récupère aussi token (selon ton AuthProvider)
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

  const [myRating, setMyRating] = React.useState(0);
  const [savingRating, setSavingRating] = React.useState(false);

  const [body, setBody] = React.useState("");
  type PickedImg = { file: File; url: string };

  const [files, setFiles] = React.useState<File[]>([]);
  const [pickedImgs, setPickedImgs] = React.useState<PickedImg[]>([]);

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

  const [posting, setPosting] = React.useState(false);

  const refOverview = React.useRef<HTMLDivElement>(null);
  const refRate = React.useRef<HTMLDivElement>(null);
  const refComments = React.useRef<HTMLDivElement>(null);
  const refSupport = React.useRef<HTMLDivElement>(null);

  async function loadCasino() {
    if (!slug) return;
    setLoading(true);
    setError(null);
    try {
      const r = await getCasino(slug);
      setData(r);
      setMyRating(0);
      if (DEV) {
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
      // ✅ token pour avoir myReaction (tryGetAuthUser côté API)
      const r = await (getCasinoComments as any)(slug, {
        sort: commentSort,
        limit: 30,
        cursor: opts?.reset ? null : nextCursor,
      }, token);

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
    loadCasino();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  React.useEffect(() => {
    setComments([]);
    setNextCursor(null);
    loadComments({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commentSort, slug, token]);

  // ✅ IMPORTANT: ce useEffect est AVANT les return
  React.useEffect(() => {
    if (!DEV) return;
    if (!data) {
      // eslint-disable-next-line no-console
      console.log("[CasinoPage] DEV debug: data = null");
      return;
    }

    const linksSorted = sortLinks((data as any).links || []);
    const streamerLinks = linksSorted.filter((l: any) => l.streamer);

    const rows = streamerLinks.map((l: any) => {
      const picked = pickStreamerAvatarUrl(l);
      return {
        linkId: l?.id,
        streamerName: l?.streamer?.displayName,
        computedAvatar: picked.url,
        uid: picked.debug.uid,
        link_ownerUserId: picked.debug.fields.link_ownerUserId,
        link_userId: picked.debug.fields.link_userId,
        streamer_ownerUserId: picked.debug.fields.streamer_ownerUserId,
        streamer_userId: picked.debug.fields.streamer_userId,
        streamer_avatarUrl: picked.debug.directAvatarUrl,
      };
    });

    // eslint-disable-next-line no-console
    console.table(rows);

    const casino = (data as any).casino;
    const bonusCtaText = (casino?.bonusHeadline || "").trim() || "Récupérez votre bonus";
    // eslint-disable-next-line no-console
    console.log("[CasinoPage] bonusCtaText =", bonusCtaText);
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
      // ✅ token obligatoire (route /me/...)
      await (setCasinoRating as any)((data as any).casino.id, v, token);
      const fresh = await getCasino((data as any).casino.slug);
      setData(fresh);
    } catch (e: any) {
      alert(e?.message || "Erreur note");
    } finally {
      setSavingRating(false);
    }
  }

  function onPickFiles(list: FileList | null) {
    if (!list) return;

    const arr = Array.from(list).slice(0, 3);

    // revoke anciens blobs
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

    // ✅ snapshot AVANT toute mutation
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
        // ✅ pending avec les URLs blob
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

    // Optimistic UI
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
      // ✅ token obligatoire (route /me/...)
      await (reactToCasinoComment as any)(commentId, newKind, token);
    } catch (e: any) {
      alert(e?.message || "Erreur réaction");
      setComments([]);
      setNextCursor(null);
      await loadComments({ reset: true });
    }
  }

  // ✅ returns OK maintenant (aucun hook après)
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

  const team = numFromAny((casino as any).teamRating);
  const teamTxt = team == null ? "—" : team.toFixed(1);

  const logoSrc = absApiUrl((casino as any).logoUrl) || (casino as any).logoUrl || null;

  return (
    <div className="container">
      <div className="casinoHeader">
        <div className="casinoHeaderLeft">
          <div className="casinoHeaderLogo">
            {logoSrc ? <img src={logoSrc} alt="" /> : <div className="casinoLogoPh" />}
          </div>

          <div className="casinoHeaderMeta">
            <h1 className="casinoH1">{casino.name}</h1>

            <div className="casinoHeaderRatings">
              <div className="ratingPill">
                ⭐ {avg.toFixed(1)}/5 <span className="mutedSmall">• {rc.toLocaleString("fr-FR")} avis</span>
              </div>
              <div className="ratingPill team">
                Avis LunaLive : <b>{teamTxt}/5</b>
              </div>
            </div>

            {casino.watchLevel !== "none" && (
              <div className={`watchBanner ${casino.watchLevel === "avoid" ? "danger" : "warn"}`}>
                <b>{casino.watchLevel === "avoid" ? "À éviter" : "Sous surveillance"}</b>
                <div className="mutedSmall">{casino.watchReason || "Raison non précisée."}</div>
              </div>
            )}
          </div>
        </div>

        {/* ✅ supprimé le bloc bouton/texte bonus en haut à droite */}
        <div className="casinoHeaderRight" />
      </div>

      <div className="casinoAnchors">
        <button className="chip" onClick={() => refOverview.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
          Aperçu
        </button>
        <button className="chip" onClick={() => refRate.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
          Noter
        </button>
        <button className="chip" onClick={() => refComments.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
          Avis
        </button>
        <button className="chip" onClick={() => refSupport.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
          Soutenir
        </button>
      </div>

      <div className="casinoTwoCol">
        {/* LEFT */}
        <div className="casinoMain">
          <div ref={refOverview} className="panel">
            <h2>Aperçu</h2>

            {casino.description ? (
              <p className="casinoDesc">{casino.description}</p>
            ) : (
              <p className="mutedSmall">Description à venir.</p>
            )}

            <div className="prosCons">
              <div className="pcCol">
                <div className="pcTitle">✅ Points forts</div>
                {pros.length ? (
                  <ul className="pcList">
                    {pros.map((x, i) => (
                      <li key={i} style={{ whiteSpace: "pre-wrap" }}>
                        {x}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mutedSmall">—</div>
                )}
              </div>

              <div className="pcCol">
                <div className="pcTitle">⚠️ Points faibles</div>
                {cons.length ? (
                  <ul className="pcList">
                    {cons.map((x, i) => (
                      <li key={i} style={{ whiteSpace: "pre-wrap" }}>
                        {x}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mutedSmall">—</div>
                )}
              </div>
            </div>

            {casino.teamReview && (
              <div className="teamBox">
                <div className="pcTitle">Avis LunaLive</div>
                <div className="mutedSmall" style={{ whiteSpace: "pre-wrap" }}>
                  {casino.teamReview}
                </div>
              </div>
            )}
          </div>

          <div ref={refRate} className="panel">
            <h2>Donner une note</h2>
            <div className="mutedSmall">1 note par compte, modifiable à tout moment.</div>

            <div className="rateRow">
              <StarPicker value={myRating} onChange={onSaveRating} disabled={savingRating} />
              <div className="mutedSmall">{myRating ? `${myRating}/5` : "—"}</div>
            </div>
            {(!user || !token) && <div className="mutedSmall">Connecte-toi pour noter.</div>}
          </div>

          <div ref={refComments} className="panel">
            <div className="commentsHead">
              <h2>Avis & Screens</h2>
              <div className="commentsTools">
                <select className="select" value={commentSort} onChange={(e) => setCommentSort(e.target.value as any)}>
                  <option value="new">Plus récents</option>
                  <option value="useful">Plus utiles</option>
                </select>
              </div>
            </div>

            <div className="composer">
              <textarea
                className="textarea"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Partager un avis, un retrait, un win…"
              />
              <div className="composerRow">
                <label className="fileBtn">
                  + Images (max 3)
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => onPickFiles(e.target.files)}
                    style={{ display: "none" }}
                  />
                </label>
                <button className="btnPrimary" onClick={onPost} disabled={posting || !body.trim()}>
                  Publier
                </button>
              </div>
              {pickedImgs.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div className="mutedSmall">
                    Image{pickedImgs.length > 1 ? "s" : ""} chargée{pickedImgs.length > 1 ? "s" : ""} ✅ • Validation requise
                  </div>

                  <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    {pickedImgs.map((p, idx) => (
                      <div key={idx} style={{ position: "relative" }}>
                        <img
                          src={p.url}
                          alt=""
                          style={{
                            width: 110,
                            height: 70,
                            objectFit: "cover",
                            borderRadius: 10,
                            border: "1px solid rgba(255,255,255,0.15)",
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
                            top: -6,
                            right: -6,
                            width: 22,
                            height: 22,
                            borderRadius: 999,
                            border: "none",
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
              )}
              {(!user || !token) && <div className="mutedSmall">Connecte-toi pour publier / réagir.</div>}
            </div>

            <div className="commentsScroll">
              {comments.length === 0 && !loadingComments && <div className="mutedSmall">Aucun message pour l’instant.</div>}

              {comments.map((c) => (
                <div
                  key={c.id}
                  className={`commentItem ${String(c.id).startsWith("local_pending_") ? "pending" : ""}`}
                >
                  <div className="commentTop">
                    <div className="commentUser">
                      <b>{c.username}</b>
                      <span className="mutedSmall"> • {new Date(c.createdAt).toLocaleString("fr-FR")}</span>
                      {c.authorRating != null && <span className="commentBadge">⭐ {c.authorRating}/5</span>}
                      {String(c.id).startsWith("local_pending_") && <span className="commentBadge warn">En attente</span>}
                    </div>
                  </div>

                  <div className="commentBody" style={{ whiteSpace: "pre-wrap" }}>
                    {c.body}
                  </div>

                  {c.images?.length > 0 && (
                    <div className="commentImgs">
                      {c.images.map((im, i) => {
                        const src = absApiUrl(im.url) || im.url;
                        return (
                          <a key={i} href={src} target="_blank" rel="noreferrer" className="commentImg">
                            <img src={src} alt="" />
                          </a>
                        );
                      })}
                    </div>
                  )}

                  <div className="reactions">
                    <button
                      className={`reactBtn ${c.myReaction === "up" ? "on" : ""}`}
                      onClick={() => toggleReaction(c.id, c.myReaction, "up")}
                      disabled={!user || !token}
                    >
                      👍 <span>{c.upCount}</span>
                    </button>
                    <button
                      className={`reactBtn ${c.myReaction === "down" ? "on" : ""}`}
                      onClick={() => toggleReaction(c.id, c.myReaction, "down")}
                      disabled={!user || !token}
                    >
                      👎 <span>{c.downCount}</span>
                    </button>
                  </div>
                </div>
              ))}

              <div className="commentsMore">
                {loadingComments && <div className="mutedSmall">Chargement…</div>}
                {!loadingComments && nextCursor && (
                  <button className="btnSecondary" onClick={() => loadComments()}>
                    Charger plus
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div ref={refSupport} className="casinoSide">
          <div className="sidePanel">
            <h3>Soutenir un créateur</h3>
            <div className="mutedSmall">Passe par un lien — ça aide directement le créateur 💜</div>

            {bonusLink ? (
              <a className="btnPrimary full" href={linkHref(bonusLink)} target="_blank" rel="noreferrer">
                {bonusCtaText}
              </a>
            ) : (
              <div className="mutedSmall" style={{ marginTop: 8 }}>
                Bonus indisponible
              </div>
            )}

            <div className="sideList">
              {streamerLinks.length === 0 ? (
                <div className="mutedSmall">Aucun créateur référencé pour ce casino.</div>
              ) : (
                streamerLinks.map((l: any) => {
                  const s = l.streamer!;
                  const initial = String(s.displayName || "?").slice(0, 1).toUpperCase();

                  const picked = pickStreamerAvatarUrl(l);
                  const avatar = picked.url;

                  return (
                    <div key={l.id} className="sideStreamer">
                      <div className="sideStreamerTop">
                        <div className="sideAvatar" style={{ position: "relative", overflow: "hidden" }}>
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
                                borderRadius: "999px",
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

                        <div className="sideInfo">
                          <div className="sideName">{s.displayName}</div>
                          <div className="mutedSmall">{(s.followsCount ?? 0).toLocaleString("fr-FR")} followers</div>
                        </div>

                        {l.pinnedRank != null && <span className="badge">Pin</span>}
                      </div>

                      <a className="btnSecondary full" href={linkHref(l)} target="_blank" rel="noreferrer">
                        {(l.label || "").trim() || "Passer par son lien"}
                      </a>
                    </div>
                  );
                })
              )}
            </div>

            {DEV ? (
              <div className="mutedSmall" style={{ marginTop: 10, opacity: 0.8 }}>
                DEV: regarde la console (console.table + avatar OK/FAIL)
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
