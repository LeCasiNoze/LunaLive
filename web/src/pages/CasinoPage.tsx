// web/src/pages/CasinoPage.tsx
import * as React from "react";
import { useParams } from "react-router-dom";
import {
  getCasino,
  getCasinoComments,
  postCasinoComment,
  reactToCasinoComment,
  setCasinoRating,
  type CasinoComment,
  type CasinoLink,
  type CasinoDetailResp,
} from "../lib/api_casinos";
import { useAuth } from "../auth/AuthProvider";

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
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
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  // au cas où c'est stocké en string json
  try {
    const j = JSON.parse(String(v));
    if (Array.isArray(j)) return j.map((x) => String(x)).filter(Boolean);
  } catch {}
  return [];
}

function sortLinks(links: CasinoLink[]) {
  return [...links].sort((a, b) => {
    const ap = a.pinnedRank ?? 999999;
    const bp = b.pinnedRank ?? 999999;
    if (ap !== bp) return ap - bp;
    const af = a.streamer?.followsCount ?? 0;
    const bf = b.streamer?.followsCount ?? 0;
    return bf - af;
  });
}

export default function CasinoPage() {
  const { slug } = useParams();
  const { user } = useAuth();

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
  const [files, setFiles] = React.useState<File[]>([]);
  const [posting, setPosting] = React.useState(false);

  const refOverview = React.useRef<HTMLDivElement>(null);
  const refRate = React.useRef<HTMLDivElement>(null);
  const refComments = React.useRef<HTMLDivElement>(null);
  const refSupport = React.useRef<HTMLDivElement>(null);

    function scrollTo(ref: { current: HTMLElement | null }) {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

  async function loadCasino() {
    if (!slug) return;
    setLoading(true);
    setError(null);
    try {
      const r = await getCasino(slug);
      setData(r);
      // V1: on ne récupère pas la note user depuis l’API -> on part à 0, puis on met à jour quand il clique
      setMyRating(0);
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
      const r = await getCasinoComments(slug, {
        sort: commentSort,
        limit: 30,
        cursor: opts?.reset ? null : nextCursor,
      });
      setNextCursor(r.nextCursor);
      setComments((prev) => (opts?.reset ? r.items : [...prev, ...r.items]));
    } finally {
      setLoadingComments(false);
    }
  }

  React.useEffect(() => {
    loadCasino();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  React.useEffect(() => {
    // reset comments on sort change
    setComments([]);
    setNextCursor(null);
    loadComments({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commentSort, slug]);

  async function onSaveRating(v: number) {
    if (!data) return;
    if (!user) {
      alert("Connecte-toi pour noter.");
      return;
    }
    setMyRating(v);
    setSavingRating(true);
    try {
      await setCasinoRating(data.casino.id, v);
      // refresh stats (optionnel)
      const fresh = await getCasino(data.casino.slug);
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
    setFiles(arr);
  }

  async function onPost() {
    if (!data) return;
    if (!user) {
      alert("Connecte-toi pour publier.");
      return;
    }
    const text = body.trim();
    if (!text) return;

    setPosting(true);
    try {
      const r = await postCasinoComment(data.casino.id, text, files);
      setBody("");
      setFiles([]);

      // si published => on reload en haut
      if (r.status === "published") {
        setComments([]);
        setNextCursor(null);
        await loadComments({ reset: true });
      } else {
        // pending (images) => on affiche en local un item “En attente”
        const pending: CasinoComment = {
          id: `local_pending_${Date.now()}`,
          body: text,
          createdAt: new Date().toISOString(),
          userId: (user as any).id ?? 0,
          username: (user as any).username ?? "Moi",
          hasImages: true,
          authorRating: myRating ? myRating : null,
          upCount: 0,
          downCount: 0,
          myReaction: null,
          images: files.map((f) => ({ url: URL.createObjectURL(f), w: null, h: null, sizeBytes: f.size })),
        };
        setComments((prev) => [pending, ...prev]);
      }
    } catch (e: any) {
      alert(e?.message || "Erreur publication");
    } finally {
      setPosting(false);
    }
  }

  async function toggleReaction(commentId: string, current: "up" | "down" | null, next: "up" | "down") {
    if (!user) {
      alert("Connecte-toi pour réagir.");
      return;
    }
    const newKind: "up" | "down" | null = current === next ? null : next;

    // optimistic update
    setComments((prev) =>
      prev.map((c) => {
        if (c.id !== commentId) return c;
        let up = c.upCount;
        let down = c.downCount;

        // remove current
        if (c.myReaction === "up") up -= 1;
        if (c.myReaction === "down") down -= 1;

        // apply new
        if (newKind === "up") up += 1;
        if (newKind === "down") down += 1;

        return { ...c, myReaction: newKind, upCount: clamp(up, 0, 1e9), downCount: clamp(down, 0, 1e9) };
      })
    );

    try {
      await reactToCasinoComment(commentId, newKind);
    } catch (e: any) {
      alert(e?.message || "Erreur réaction");
      // fallback: reload comments
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

  const pros = splitList(casino.pros);
  const cons = splitList(casino.cons);

  const linksSorted = sortLinks(data.links || []);
  const streamerLinks = linksSorted.filter((l) => l.ownerUserId != null && l.streamer);
  const bonusLink = data.bonusLink;

  return (
    <div className="container">
      <div className="casinoHeader">
        <div className="casinoHeaderLeft">
          <div className="casinoHeaderLogo">
            {casino.logoUrl ? <img src={casino.logoUrl} alt="" /> : <div className="casinoLogoPh" />}
          </div>

          <div className="casinoHeaderMeta">
            <h1 className="casinoH1">{casino.name}</h1>

            <div className="casinoHeaderRatings">
              <div className="ratingPill">
                ⭐ {stats.avgRating.toFixed(1)}/5 <span className="mutedSmall">• {stats.ratingsCount.toLocaleString("fr-FR")} avis</span>
              </div>
              <div className="ratingPill team">
                Avis LunaLive : <b>{casino.teamRating != null ? casino.teamRating.toFixed(1) : "—"}</b>/5
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

        <div className="casinoHeaderRight">
          {bonusLink ? (
            <a className="btnPrimary" href={bonusLink.goUrl} target="_blank" rel="noreferrer">
              Récupérez votre bonus
            </a>
          ) : (
            <div className="mutedSmall">Bonus indisponible</div>
          )}
          {casino.bonusHeadline && <div className="mutedSmall">{casino.bonusHeadline}</div>}
        </div>
      </div>

      <div className="casinoAnchors">
        <button className="chip" onClick={() => scrollTo(refOverview)}>Aperçu</button>
        <button className="chip" onClick={() => scrollTo(refRate)}>Noter</button>
        <button className="chip" onClick={() => scrollTo(refComments)}>Avis</button>
        <button className="chip" onClick={() => scrollTo(refSupport)}>Soutenir</button>
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
                  <ul className="pcList">{pros.map((x, i) => <li key={i}>{x}</li>)}</ul>
                ) : (
                  <div className="mutedSmall">—</div>
                )}
              </div>
              <div className="pcCol">
                <div className="pcTitle">⚠️ Points faibles</div>
                {cons.length ? (
                  <ul className="pcList">{cons.map((x, i) => <li key={i}>{x}</li>)}</ul>
                ) : (
                  <div className="mutedSmall">—</div>
                )}
              </div>
            </div>

            {casino.teamReview && (
              <div className="teamBox">
                <div className="pcTitle">Avis LunaLive</div>
                <div className="mutedSmall">{casino.teamReview}</div>
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
            {!user && <div className="mutedSmall">Connecte-toi pour noter.</div>}
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
              {files.length > 0 && (
                <div className="mutedSmall">
                  {files.length} image(s) • Les messages avec images nécessitent validation.
                </div>
              )}
            </div>

            <div className="commentsScroll">
              {comments.length === 0 && !loadingComments && (
                <div className="mutedSmall">Aucun message pour l’instant.</div>
              )}

              {comments.map((c) => (
                <div key={c.id} className={`commentItem ${String(c.id).startsWith("local_pending_") ? "pending" : ""}`}>
                  <div className="commentTop">
                    <div className="commentUser">
                      <b>{c.username}</b>
                      <span className="mutedSmall"> • {new Date(c.createdAt).toLocaleString("fr-FR")}</span>
                      {c.authorRating != null && (
                        <span className="commentBadge">⭐ {c.authorRating}/5</span>
                      )}
                      {String(c.id).startsWith("local_pending_") && (
                        <span className="commentBadge warn">En attente</span>
                      )}
                    </div>
                  </div>

                  <div className="commentBody">{c.body}</div>

                  {c.images?.length > 0 && (
                    <div className="commentImgs">
                      {c.images.map((im, i) => (
                        <a key={i} href={im.url} target="_blank" rel="noreferrer" className="commentImg">
                          <img src={im.url} alt="" />
                        </a>
                      ))}
                    </div>
                  )}

                  <div className="reactions">
                    <button
                      className={`reactBtn ${c.myReaction === "up" ? "on" : ""}`}
                      onClick={() => toggleReaction(c.id, c.myReaction, "up")}
                    >
                      👍 <span>{c.upCount}</span>
                    </button>
                    <button
                      className={`reactBtn ${c.myReaction === "down" ? "on" : ""}`}
                      onClick={() => toggleReaction(c.id, c.myReaction, "down")}
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
            <div className="mutedSmall">
              Passe par un lien — ça aide directement le créateur 💜
            </div>

            {bonusLink && (
              <a className="btnPrimary full" href={bonusLink.goUrl} target="_blank" rel="noreferrer">
                Récupérez votre bonus
              </a>
            )}

            <div className="sideList">
              {streamerLinks.length === 0 ? (
                <div className="mutedSmall">Aucun créateur référencé pour ce casino.</div>
              ) : (
                streamerLinks.map((l) => (
                  <div key={l.id} className="sideStreamer">
                    <div className="sideStreamerTop">
                      <div className="sideAvatar">{l.streamer!.displayName.slice(0, 1).toUpperCase()}</div>
                      <div className="sideInfo">
                        <div className="sideName">{l.streamer!.displayName}</div>
                        <div className="mutedSmall">{l.streamer!.followsCount.toLocaleString("fr-FR")} followers</div>
                      </div>
                      {l.pinnedRank != null && <span className="badge">Pin</span>}
                    </div>
                    <a className="btnSecondary full" href={l.goUrl} target="_blank" rel="noreferrer">
                      Passer par son lien
                    </a>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
