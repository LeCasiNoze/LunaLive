// web/src/components/admin/CasinosAdminSection.tsx
import * as React from "react";
import { getStreamers } from "../../lib/api";
import {
  adminListCasinos,
  adminCreateCasino,
  adminUpdateCasino,
  adminListCasinoLinks,
  adminCreateCasinoLink,
  adminUpdateCasinoLink,
  adminListPublishedCasinoComments,
  adminModerateCasinoComment,
  type AdminCasino,
  type AdminCasinoLink,
  type AdminCasinoComment,
} from "../../lib/api_admin_casinos";

type Props = { adminKey: string };
type StreamerRow = { id: number; slug: string; displayName: string };

type Tab = "identity" | "content" | "links" | "reviews";

function slugify(s: string) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}
function linesToList(s: string) {
  return String(s || "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
}
function listToLines(arr: string[] | null | undefined) {
  return (arr || []).join("\n");
}

function SegButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      className={active ? "btnPrimarySmall" : "btnGhostSmall"}
      type="button"
      onClick={onClick}
      style={{
        borderRadius: 999,
        padding: "8px 12px",
      }}
    >
      {children}
    </button>
  );
}

export function CasinosAdminSection({ adminKey }: Props) {
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  const [q, setQ] = React.useState("");
  const [items, setItems] = React.useState<AdminCasino[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const [tab, setTab] = React.useState<Tab>("identity");

  const [streamers, setStreamers] = React.useState<StreamerRow[]>([]);
  const [links, setLinks] = React.useState<AdminCasinoLink[]>([]);
  const [linksLoading, setLinksLoading] = React.useState(false);

  const [reviews, setReviews] = React.useState<AdminCasinoComment[]>([]);
  const [reviewsLoading, setReviewsLoading] = React.useState(false);
  const [reviewsCursor, setReviewsCursor] = React.useState<string | null>(null);
  const [reviewsQ, setReviewsQ] = React.useState("");
  const [reviewsHasMore, setReviewsHasMore] = React.useState(false);

  // create form
  const [newSlug, setNewSlug] = React.useState("");
  const [newName, setNewName] = React.useState("");

  // drafts textareas
  const [prosText, setProsText] = React.useState("");
  const [consText, setConsText] = React.useState("");

  async function refreshList() {
    setErr(null);
    setLoading(true);
    try {
      const r = await adminListCasinos(adminKey, { q });
      const list = Array.isArray(r.items) ? r.items : Array.isArray((r as any).casinos) ? (r as any).casinos : [];
      setItems(list);
      setSelectedId((prev) => {
        if (prev && list.some((x: { id: string }) => x.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
    } catch (e: any) {
      setErr(String(e?.message || e));
      setItems([]);
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  }

  async function refreshLinks(casinoId: string) {
    setLinksLoading(true);
    try {
      const r = await adminListCasinoLinks(adminKey, casinoId);
      const list = Array.isArray(r.items) ? r.items : Array.isArray((r as any).links) ? (r as any).links : [];
      setLinks(list);
    } finally {
      setLinksLoading(false);
    }
  }

  async function loadReviews(opts?: { reset?: boolean }) {
    if (!selectedId) return;
    setReviewsLoading(true);
    try {
      const cursor = opts?.reset ? null : reviewsCursor;
      const out = await adminListPublishedCasinoComments(adminKey, {
        casinoId: selectedId,
        q: reviewsQ.trim() || undefined,
        cursor: cursor || undefined,
        limit: 50,
      });
      const next = out.nextCursor ?? null;
      const it = out.items ?? [];
      setReviews((prev) => (opts?.reset ? it : [...prev, ...it]));
      setReviewsCursor(next);
      setReviewsHasMore(Boolean(next) && it.length > 0);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setReviewsLoading(false);
    }
  }

  React.useEffect(() => {
    refreshList();
    getStreamers()
      .then((s: any) => setStreamers((s || []) as StreamerRow[]))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!selectedId) {
      setLinks([]);
      setReviews([]);
      setReviewsCursor(null);
      setReviewsHasMore(false);
      return;
    }
    const casino = items.find((x) => x.id === selectedId);
    setProsText(listToLines(casino?.pros));
    setConsText(listToLines(casino?.cons));
    refreshLinks(selectedId).catch(() => {});
    setReviews([]);
    setReviewsCursor(null);
    setReviewsHasMore(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const selected = React.useMemo(() => items.find((x) => x.id === selectedId) || null, [items, selectedId]);

  function patchSelected(patch: Partial<AdminCasino>) {
    if (!selected) return;
    setItems((prev) => prev.map((c) => (c.id === selected.id ? ({ ...c, ...patch } as any) : c)));
  }

  const safeLinks = Array.isArray(links) ? links : [];
  const bonusLink = safeLinks.find((l: any) => l.kind === "bonus") || null;
  const streamerLinks = safeLinks.filter((l: any) => l.kind === "streamer");

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 420px) minmax(0, 1fr)", gap: 14 }}>
      {/* LEFT */}
      <div
        style={{
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.03)",
          overflow: "hidden",
          display: "grid",
          gridTemplateRows: "auto auto 1fr",
          minHeight: 640,
        }}
      >
        <div style={{ padding: 12, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher casino…" />
            <button className="btnPrimary" onClick={refreshList} disabled={loading}>
              OK
            </button>
          </div>
          {err ? <div className="hint" style={{ marginTop: 10 }}>⚠️ {err}</div> : null}
        </div>

        <div style={{ padding: 12, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontWeight: 950, marginBottom: 8 }}>Créer un casino</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <input className="input" value={newSlug} onChange={(e) => setNewSlug(e.target.value)} placeholder="slug (optionnel)" />
            <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="name" />
          </div>
          <button
            className="btnSecondary"
            style={{ marginTop: 8, width: "100%" }}
            onClick={async () => {
              setErr(null);
              try {
                const name = newName.trim();
                if (!name) throw new Error("Nom requis");
                const slug = slugify(newSlug.trim() || name);
                const r = await adminCreateCasino(adminKey, slug, name);
                setNewSlug("");
                setNewName("");
                await refreshList();
                if ((r as any).id) setSelectedId((r as any).id);
              } catch (e: any) {
                setErr(String(e?.message || e));
              }
            }}
          >
            + Créer
          </button>
        </div>

        <div style={{ padding: 10, overflow: "auto" }}>
          {items.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedId(c.id)}
              className="btnGhostSmall"
              style={{
                width: "100%",
                justifyContent: "space-between",
                marginBottom: 8,
                borderRadius: 14,
                padding: "10px 12px",
                borderColor: c.id === selectedId ? "rgba(167,139,250,0.55)" : "rgba(255,255,255,0.10)",
                background: c.id === selectedId ? "rgba(167,139,250,0.12)" : "rgba(255,255,255,0.04)",
              }}
            >
              <span style={{ textAlign: "left", minWidth: 0 }}>
                <div style={{ fontWeight: 950, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {c.name}
                </div>
                <div className="mutedSmall" style={{ marginTop: 4, opacity: 0.85 }}>
                  {c.slug} • {c.status}
                  {c.featuredRank != null ? ` • #${c.featuredRank}` : ""}
                </div>
              </span>
              <span style={{ opacity: 0.75 }}>→</span>
            </button>
          ))}
          {!items.length && !loading ? <div className="mutedSmall">Aucun résultat</div> : null}
        </div>
      </div>

      {/* RIGHT */}
      <div
        style={{
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.03)",
          overflow: "hidden",
          minHeight: 640,
          display: "grid",
          gridTemplateRows: "auto auto 1fr",
        }}
      >
        {!selected ? (
          <div style={{ padding: 14 }} className="mutedSmall">
            Sélectionne un casino.
          </div>
        ) : (
          <>
            {/* header */}
            <div style={{ padding: 14, borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 1000, fontSize: 16 }}>{selected.name}</div>
                <div className="mutedSmall">{selected.slug} • id {selected.id}</div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button
                  className="btnSecondary"
                  type="button"
                  onClick={async () => {
                    const next = selected.status === "published" ? "hidden" : "published";
                    patchSelected({ status: next as any });
                    await adminUpdateCasino(adminKey, selected.id, { status: next as any } as any);
                    await refreshList();
                  }}
                >
                  {selected.status === "published" ? "Masquer" : "Publier"}
                </button>

                <button
                  className="btnPrimary"
                  type="button"
                  onClick={async () => {
                    setErr(null);
                    try {
                      const pros = linesToList(prosText);
                      const cons = linesToList(consText);
                      patchSelected({ pros: pros as any, cons: cons as any });
                      await adminUpdateCasino(adminKey, selected.id, {
                        ...selected,
                        pros,
                        cons,
                      } as any);
                      await refreshList();
                      await refreshLinks(selected.id);
                    } catch (e: any) {
                      setErr(String(e?.message || e));
                    }
                  }}
                >
                  Enregistrer
                </button>
              </div>
            </div>

            {/* tabs */}
            <div style={{ padding: 12, borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", gap: 8, flexWrap: "wrap" }}>
              <SegButton active={tab === "identity"} onClick={() => setTab("identity")}>Identité</SegButton>
              <SegButton active={tab === "content"} onClick={() => setTab("content")}>Contenu</SegButton>
              <SegButton active={tab === "links"} onClick={() => setTab("links")}>Liens</SegButton>
              <SegButton
                active={tab === "reviews"}
                onClick={() => {
                  setTab("reviews");
                  if (!reviews.length) loadReviews({ reset: true });
                }}
              >
                Avis publiés
              </SegButton>
            </div>

            {/* body */}
            <div style={{ padding: 14, overflow: "auto" }}>
              {tab === "identity" ? (
                <div style={{ display: "grid", gap: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div className="field">
                      <label>Nom</label>
                      <input className="input" value={selected.name} onChange={(e) => patchSelected({ name: e.target.value })} />
                    </div>
                    <div className="field">
                      <label>Slug</label>
                      <input className="input" value={selected.slug} onChange={(e) => patchSelected({ slug: e.target.value })} />
                    </div>
                  </div>

                  <div className="field">
                    <label>Logo URL</label>
                    <input className="input" value={selected.logoUrl || ""} onChange={(e) => patchSelected({ logoUrl: e.target.value || null })} />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 160px", gap: 10 }}>
                    <div className="field">
                      <label>Status</label>
                      <select className="select" value={selected.status} onChange={(e) => patchSelected({ status: e.target.value as any })}>
                        <option value="published">published</option>
                        <option value="hidden">hidden</option>
                        <option value="disabled">disabled</option>
                      </select>
                    </div>
                    <div className="field">
                      <label>Featured rank</label>
                      <input
                        className="input"
                        value={selected.featuredRank ?? ""}
                        onChange={(e) => patchSelected({ featuredRank: e.target.value === "" ? null : Number(e.target.value) })}
                      />
                    </div>
                    <div className="field">
                      <label>Watch level</label>
                      <select className="select" value={selected.watchLevel} onChange={(e) => patchSelected({ watchLevel: e.target.value as any })}>
                        <option value="none">none</option>
                        <option value="watch">watch</option>
                        <option value="avoid">avoid</option>
                      </select>
                    </div>
                  </div>

                  <div className="field">
                    <label>Watch reason</label>
                    <input className="input" value={selected.watchReason || ""} onChange={(e) => patchSelected({ watchReason: e.target.value || null })} />
                  </div>
                </div>
              ) : null}

              {tab === "content" ? (
                <div style={{ display: "grid", gap: 12 }}>
                  <div className="field">
                    <label>Bonus headline</label>
                    <input className="input" value={selected.bonusHeadline || ""} onChange={(e) => patchSelected({ bonusHeadline: e.target.value || null })} />
                  </div>

                  <div className="field">
                    <label>Description</label>
                    <textarea className="textarea" value={selected.description || ""} onChange={(e) => patchSelected({ description: e.target.value || null })} />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div className="field">
                      <label>Pros (1 ligne = 1 point)</label>
                      <textarea className="textarea" value={prosText} onChange={(e) => setProsText(e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Cons (1 ligne = 1 point)</label>
                      <textarea className="textarea" value={consText} onChange={(e) => setConsText(e.target.value)} />
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 10 }}>
                    <div className="field">
                      <label>Team rating</label>
                      <input
                        className="input"
                        value={selected.teamRating ?? ""}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === "") return patchSelected({ teamRating: null as any });
                          const n = Number(String(raw).replace(",", "."));
                          patchSelected({ teamRating: Number.isFinite(n) ? (n as any) : (raw as any) });
                        }}
                      />
                    </div>
                    <div className="field">
                      <label>Team review</label>
                      <textarea className="textarea" value={selected.teamReview || ""} onChange={(e) => patchSelected({ teamReview: e.target.value || null })} />
                    </div>
                  </div>
                </div>
              ) : null}

              {tab === "links" ? (
                <div style={{ display: "grid", gap: 12 }}>
                  {linksLoading ? <div className="mutedSmall">Chargement…</div> : null}

                  <div style={{ fontWeight: 950 }}>Lien bonus (CTA principal)</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 220px 120px", gap: 8 }}>
                    <input
                      className="input"
                      value={bonusLink?.targetUrl || ""}
                      placeholder="https://..."
                      onChange={(e) => {
                        const v = e.target.value;
                        setLinks((prev) => prev.map((l: any) => (l.id === bonusLink?.id ? { ...l, targetUrl: v } : l)));
                      }}
                    />
                    <input
                      className="input"
                      value={bonusLink?.label || ""}
                      placeholder="Label (optionnel)"
                      onChange={(e) => {
                        const v = e.target.value;
                        setLinks((prev) => prev.map((l: any) => (l.id === bonusLink?.id ? { ...l, label: v } : l)));
                      }}
                    />
                    <button
                      className="btnSecondary"
                      type="button"
                      onClick={async () => {
                        if (!selected) return;
                        if (!bonusLink) {
                          await adminCreateCasinoLink(adminKey, selected.id, {
                            kind: "bonus",
                            targetUrl: "https://example.com",
                            enabled: true,
                            pinnedRank: 1,
                            label: "Bonus LunaLive",
                          } as any);
                          await refreshLinks(selected.id);
                          return;
                        }
                        await adminUpdateCasinoLink(adminKey, bonusLink.id, {
                          targetUrl: bonusLink.targetUrl,
                          label: bonusLink.label,
                        } as any);
                        await refreshLinks(selected.id);
                      }}
                    >
                      {bonusLink ? "Sauver" : "Créer"}
                    </button>
                  </div>

                  {bonusLink ? (
                    <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 900 }}>
                      <input
                        type="checkbox"
                        checked={!!bonusLink.enabled}
                        onChange={async (e) => {
                          await adminUpdateCasinoLink(adminKey, bonusLink.id, { enabled: e.target.checked } as any);
                          await refreshLinks(selected.id);
                        }}
                      />
                      enabled
                    </label>
                  ) : null}

                  <div style={{ marginTop: 10, fontWeight: 950 }}>Liens créateurs</div>

                  <div style={{ display: "grid", gap: 10 }}>
                    {streamerLinks.map((l: any) => (
                      <div key={l.id} style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 14, padding: 12, background: "rgba(255,255,255,0.03)" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr 160px 140px", gap: 8, alignItems: "center" }}>
                          <select
                            className="select"
                            value={l.streamerId ?? ""}
                            onChange={(e) => {
                              const v = e.target.value ? Number(e.target.value) : null;
                              setLinks((prev) => prev.map((x: any) => (x.id === l.id ? { ...x, streamerId: v } : x)));
                            }}
                          >
                            <option value="">—</option>
                            {streamers.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.displayName}
                              </option>
                            ))}
                          </select>

                          <input
                            className="input"
                            value={l.targetUrl || ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              setLinks((prev) => prev.map((x: any) => (x.id === l.id ? { ...x, targetUrl: v } : x)));
                            }}
                            placeholder="https://..."
                          />

                          <input
                            className="input"
                            value={l.label || ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              setLinks((prev) => prev.map((x: any) => (x.id === l.id ? { ...x, label: v } : x)));
                            }}
                            placeholder="Label"
                          />

                          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                            <button
                              className="btnGhostSmall"
                              type="button"
                              onClick={async () => {
                                await adminUpdateCasinoLink(adminKey, l.id, {
                                  targetUrl: l.targetUrl,
                                  label: l.label,
                                  streamerId: l.streamerId,
                                  enabled: l.enabled,
                                  pinnedRank: l.pinnedRank,
                                } as any);
                                await refreshLinks(selected.id);
                              }}
                            >
                              Save
                            </button>
                            <button
                              className="btnGhostSmall"
                              type="button"
                              onClick={async () => {
                                await adminUpdateCasinoLink(adminKey, l.id, { enabled: !l.enabled } as any);
                                await refreshLinks(selected.id);
                              }}
                            >
                              {l.enabled ? "Disable" : "Enable"}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}

                    {streamerLinks.length === 0 ? <div className="mutedSmall">Aucun lien créateur.</div> : null}
                  </div>
                </div>
              ) : null}

              {tab === "reviews" ? (
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <input
                      className="input"
                      value={reviewsQ}
                      onChange={(e) => setReviewsQ(e.target.value)}
                      placeholder="Rechercher dans les avis…"
                      style={{ flex: 1, minWidth: 260 }}
                    />
                    <button
                      className="btnSecondary"
                      type="button"
                      onClick={() => loadReviews({ reset: true })}
                      disabled={reviewsLoading}
                    >
                      {reviewsLoading ? "…" : "Rechercher"}
                    </button>
                  </div>

                  {reviews.map((r) => (
                    <div
                      key={r.id}
                      style={{
                        border: "1px solid rgba(255,255,255,0.10)",
                        borderRadius: 14,
                        padding: 12,
                        background: "rgba(255,255,255,0.03)",
                        display: "grid",
                        gap: 8,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                        <div>
                          <b>{r.username}</b> <span className="mutedSmall">({new Date(r.createdAt).toLocaleString()})</span>
                        </div>
                        <button
                          className="btnGhostSmall"
                          type="button"
                          onClick={async () => {
                            if (!confirm("Supprimer cet avis ?")) return;
                            await adminModerateCasinoComment(adminKey, r.id, { action: "delete" });
                            setReviews((prev) => prev.filter((x) => x.id !== r.id));
                          }}
                          style={{
                            borderColor: "rgba(239,68,68,0.30)",
                            background: "rgba(239,68,68,0.10)",
                          }}
                        >
                          🗑️ Supprimer
                        </button>
                      </div>
                      <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.45 }}>{r.body}</div>
                    </div>
                  ))}

                  {!reviews.length && !reviewsLoading ? <div className="mutedSmall">Aucun avis publié.</div> : null}

                  {reviewsHasMore ? (
                    <button className="btnSecondary" type="button" onClick={() => loadReviews()} disabled={reviewsLoading}>
                      {reviewsLoading ? "…" : "Charger plus"}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
