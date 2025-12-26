// web/src/components/admin/CasinosAdminSection.tsx
import * as React from "react";
import { getStreamers } from "../../lib/api";
import {
  adminCasinosList,
  adminCasinosCreate,
  adminCasinosUpdate,
  adminCasinoLinksList,
  adminCasinoLinksCreate,
  adminCasinoLinksUpdate,
  type AdminCasino,
  type AdminCasinoLink,
} from "../../lib/api_admin_casinos";

function toLines(v: any): string {
  if (!v) return "";
  if (Array.isArray(v)) return v.map((x) => String(x)).join("\n");
  try {
    const j = JSON.parse(String(v));
    if (Array.isArray(j)) return j.map((x) => String(x)).join("\n");
  } catch {}
  return String(v);
}

export function CasinosAdminSection({ adminKey }: { adminKey: string }) {
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  const [casinos, setCasinos] = React.useState<AdminCasino[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const [links, setLinks] = React.useState<AdminCasinoLink[]>([]);
  const [loadingLinks, setLoadingLinks] = React.useState(false);

  const [streamers, setStreamers] = React.useState<any[]>([]);

  const selected = React.useMemo(
    () => casinos.find((c) => c.id === selectedId) || null,
    [casinos, selectedId]
  );

  const [form, setForm] = React.useState<any>({});
  React.useEffect(() => {
    if (!selected) return;
    setForm({
      slug: selected.slug,
      name: selected.name,
      logoUrl: selected.logoUrl ?? "",
      status: selected.status,
      featuredRank: selected.featuredRank ?? "",
      bonusHeadline: selected.bonusHeadline ?? "",
      description: selected.description ?? "",
      pros: toLines(selected.pros),
      cons: toLines(selected.cons),
      teamRating: selected.teamRating ?? "",
      teamReview: selected.teamReview ?? "",
      watchLevel: selected.watchLevel,
      watchReason: selected.watchReason ?? "",
    });
  }, [selectedId]); // eslint-disable-line

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      const r = await adminCasinosList(adminKey);
      setCasinos(r.casinos);
      if (!selectedId && r.casinos[0]) setSelectedId(r.casinos[0].id);
    } catch (e: any) {
      setErr(e?.message || "error");
    } finally {
      setLoading(false);
    }
  }

  async function refreshLinks(casinoId: string) {
    setLoadingLinks(true);
    try {
      const r = await adminCasinoLinksList(adminKey, casinoId);
      setLinks(r.links);
    } finally {
      setLoadingLinks(false);
    }
  }

  React.useEffect(() => {
    refresh();
    getStreamers().then(setStreamers).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!selectedId) return;
    refreshLinks(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // create
  const [newSlug, setNewSlug] = React.useState("");
  const [newName, setNewName] = React.useState("");

  // add link
  const [linkKind, setLinkKind] = React.useState<"bonus" | "streamer">("bonus");
  const [linkUrl, setLinkUrl] = React.useState("");
  const [linkLabel, setLinkLabel] = React.useState("");
  const [linkPinned, setLinkPinned] = React.useState<string>("");
  const [linkStreamer, setLinkStreamer] = React.useState<string>("");

  return (
    <div className="panel" style={{ marginTop: 14 }}>
      <div className="panelTitle">Gestion Casinos (TrustPilot)</div>
      {err && <div className="hint">⚠️ {err}</div>}
      {loading && <div className="mutedSmall">Chargement…</div>}

      {!loading && (
        <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 14 }}>
          {/* LEFT LIST */}
          <div>
            <div className="mutedSmall" style={{ marginBottom: 8 }}>
              Casinos ({casinos.length})
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
                placeholder="slug (brutalcasino)"
                style={{ flex: 1 }}
              />
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nom"
                style={{ flex: 1 }}
              />
            </div>
            <button
              className="btnPrimary"
              onClick={async () => {
                const slug = newSlug.trim().toLowerCase();
                const name = newName.trim();
                if (!slug || !name) return;
                await adminCasinosCreate(adminKey, { slug, name, status: "published" });
                setNewSlug("");
                setNewName("");
                await refresh();
              }}
            >
              + Ajouter casino
            </button>

            <div style={{ marginTop: 10 }}>
              {casinos.map((c) => (
                <button
                  key={c.id}
                  className="btnGhostSmall"
                  style={{
                    width: "100%",
                    textAlign: "left",
                    marginTop: 8,
                    border:
                      c.id === selectedId
                        ? "1px solid rgba(126,76,179,0.55)"
                        : "1px solid rgba(255,255,255,0.08)",
                  }}
                  onClick={() => setSelectedId(c.id)}
                >
                  <b>{c.name}</b>{" "}
                  <span className="mutedSmall">
                    ({c.slug}) • {c.avgRating.toFixed(1)}/5 • {c.ratingsCount} avis
                  </span>
                </button>
              ))}
              {!casinos.length && <div className="mutedSmall">Aucun casino</div>}
            </div>
          </div>

          {/* RIGHT EDIT */}
          <div>
            {!selected ? (
              <div className="mutedSmall">Sélectionne un casino</div>
            ) : (
              <>
                <div className="panelTitle" style={{ marginBottom: 8 }}>
                  Édition — {selected.name}
                </div>

                <div className="field">
                  <label>Slug</label>
                  <input
                    value={form.slug ?? ""}
                    onChange={(e) => setForm((p: any) => ({ ...p, slug: e.target.value }))}
                  />
                </div>

                <div className="field">
                  <label>Nom</label>
                  <input
                    value={form.name ?? ""}
                    onChange={(e) => setForm((p: any) => ({ ...p, name: e.target.value }))}
                  />
                </div>

                <div className="field">
                  <label>Logo URL (optionnel)</label>
                  <input
                    value={form.logoUrl ?? ""}
                    onChange={(e) => setForm((p: any) => ({ ...p, logoUrl: e.target.value }))}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  <div className="field">
                    <label>Status</label>
                    <select
                      value={form.status ?? "published"}
                      onChange={(e) => setForm((p: any) => ({ ...p, status: e.target.value }))}
                    >
                      <option value="published">published</option>
                      <option value="hidden">hidden</option>
                      <option value="disabled">disabled</option>
                    </select>
                  </div>

                  <div className="field">
                    <label>Featured rank</label>
                    <input
                      value={form.featuredRank ?? ""}
                      onChange={(e) => setForm((p: any) => ({ ...p, featuredRank: e.target.value }))}
                      placeholder="1,2,3…"
                    />
                  </div>

                  <div className="field">
                    <label>Watch</label>
                    <select
                      value={form.watchLevel ?? "none"}
                      onChange={(e) => setForm((p: any) => ({ ...p, watchLevel: e.target.value }))}
                    >
                      <option value="none">none</option>
                      <option value="watch">watch</option>
                      <option value="avoid">avoid</option>
                    </select>
                  </div>
                </div>

                <div className="field">
                  <label>Watch reason</label>
                  <input
                    value={form.watchReason ?? ""}
                    onChange={(e) => setForm((p: any) => ({ ...p, watchReason: e.target.value }))}
                    placeholder="raison courte"
                  />
                </div>

                <div className="field">
                  <label>Bonus headline</label>
                  <input
                    value={form.bonusHeadline ?? ""}
                    onChange={(e) => setForm((p: any) => ({ ...p, bonusHeadline: e.target.value }))}
                    placeholder="ex: 200% jusqu’à 300€"
                  />
                </div>

                <div className="field">
                  <label>Description</label>
                  <textarea
                    value={form.description ?? ""}
                    onChange={(e) => setForm((p: any) => ({ ...p, description: e.target.value }))}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div className="field">
                    <label>Pros (1 par ligne)</label>
                    <textarea
                      value={form.pros ?? ""}
                      onChange={(e) => setForm((p: any) => ({ ...p, pros: e.target.value }))}
                    />
                  </div>
                  <div className="field">
                    <label>Cons (1 par ligne)</label>
                    <textarea
                      value={form.cons ?? ""}
                      onChange={(e) => setForm((p: any) => ({ ...p, cons: e.target.value }))}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 10 }}>
                  <div className="field">
                    <label>Team rating</label>
                    <input
                      value={form.teamRating ?? ""}
                      onChange={(e) => setForm((p: any) => ({ ...p, teamRating: e.target.value }))}
                      placeholder="4.2"
                    />
                  </div>
                  <div className="field">
                    <label>Team review</label>
                    <input
                      value={form.teamReview ?? ""}
                      onChange={(e) => setForm((p: any) => ({ ...p, teamReview: e.target.value }))}
                    />
                  </div>
                </div>

                <button
                  className="btnPrimary"
                  onClick={async () => {
                    await adminCasinosUpdate(adminKey, selected.id, {
                      slug: form.slug,
                      name: form.name,
                      logoUrl: form.logoUrl || null,
                      status: form.status,
                      featuredRank: form.featuredRank === "" ? null : Number(form.featuredRank),
                      bonusHeadline: form.bonusHeadline || null,
                      description: form.description || null,
                      pros: form.pros,
                      cons: form.cons,
                      teamRating: form.teamRating === "" ? null : Number(form.teamRating),
                      teamReview: form.teamReview || null,
                      watchLevel: form.watchLevel,
                      watchReason: form.watchReason || null,
                    });
                    await refresh();
                  }}
                >
                  Sauvegarder
                </button>

                {/* LINKS */}
                <div className="panelTitle" style={{ marginTop: 16 }}>
                  Liens affiliés
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 10, marginBottom: 10 }}>
                  <div className="field">
                    <label>Type</label>
                    <select value={linkKind} onChange={(e) => setLinkKind(e.target.value as any)}>
                      <option value="bonus">Bonus (plateforme)</option>
                      <option value="streamer">Streamer</option>
                    </select>
                  </div>

                  <div className="field">
                    <label>Target URL</label>
                    <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." />
                  </div>
                </div>

                {linkKind === "streamer" && (
                  <div className="field">
                    <label>Streamer</label>
                    <select value={linkStreamer} onChange={(e) => setLinkStreamer(e.target.value)}>
                      <option value="">— choisir —</option>
                      {streamers.map((s: any) => (
                        <option key={s.id} value={s.slug}>
                          {s.displayName} ({s.slug})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 180px", gap: 10 }}>
                  <div className="field">
                    <label>Label (optionnel)</label>
                    <input value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} placeholder="LeCasiNoze" />
                  </div>
                  <div className="field">
                    <label>Pinned rank</label>
                    <input value={linkPinned} onChange={(e) => setLinkPinned(e.target.value)} placeholder="0,1,2…" />
                  </div>
                </div>

                <button
                  className="btnPrimary"
                  onClick={async () => {
                    if (!selectedId) return;
                    if (!linkUrl.trim()) return;
                    if (linkKind === "streamer" && !linkStreamer) return;

                    await adminCasinoLinksCreate(adminKey, selectedId, {
                      kind: linkKind,
                      targetUrl: linkUrl.trim(),
                      label: linkLabel.trim() || null,
                      pinnedRank: linkPinned === "" ? null : Number(linkPinned),
                      streamerSlug: linkKind === "streamer" ? linkStreamer : null,
                    });

                    setLinkUrl("");
                    setLinkLabel("");
                    setLinkPinned("");
                    setLinkStreamer("");
                    await refreshLinks(selectedId);
                  }}
                >
                  + Ajouter lien
                </button>

                <div style={{ marginTop: 10 }}>
                  {loadingLinks && <div className="mutedSmall">Chargement liens…</div>}
                  {!loadingLinks &&
                    links.map((l) => (
                      <div
                        key={l.id}
                        style={{
                          borderTop: "1px solid rgba(255,255,255,0.06)",
                          padding: "10px 0",
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                        }}
                      >
                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <div style={{ flex: 1 }}>
                            <b>
                              {l.ownerUserId == null
                                ? "BONUS (plateforme)"
                                : l.streamerDisplayName
                                ? `${l.streamerDisplayName} (${l.streamerSlug})`
                                : l.ownerUsername || "Streamer"}
                            </b>{" "}
                            <span className="mutedSmall">#{l.pinnedRank ?? "—"}</span>
                          </div>

                          <label className="mutedSmall" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <input
                              type="checkbox"
                              checked={!!l.enabled}
                              onChange={async (e) => {
                                await adminCasinoLinksUpdate(adminKey, l.id, { enabled: e.target.checked });
                                await refreshLinks(selectedId!);
                              }}
                            />
                            enabled
                          </label>
                        </div>

                        <input
                          value={l.label ?? ""}
                          onChange={(e) => setLinks((prev) => prev.map((x) => (x.id === l.id ? { ...x, label: e.target.value } : x)))}
                          placeholder="label"
                        />
                        <input
                          value={l.targetUrl}
                          onChange={(e) => setLinks((prev) => prev.map((x) => (x.id === l.id ? { ...x, targetUrl: e.target.value } : x)))}
                          placeholder="target url"
                        />

                        <div style={{ display: "flex", gap: 10 }}>
                          <input
                            style={{ width: 140 }}
                            value={l.pinnedRank ?? ""}
                            onChange={(e) =>
                              setLinks((prev) =>
                                prev.map((x) => (x.id === l.id ? { ...x, pinnedRank: e.target.value === "" ? null : Number(e.target.value) } : x))
                              )
                            }
                            placeholder="pinned"
                          />
                          <button
                            className="btnGhostSmall"
                            onClick={async () => {
                              await adminCasinoLinksUpdate(adminKey, l.id, {
                                label: l.label ?? null,
                                targetUrl: l.targetUrl,
                                pinnedRank: l.pinnedRank ?? null,
                                enabled: !!l.enabled,
                              });
                              await refreshLinks(selectedId!);
                            }}
                          >
                            Save lien
                          </button>
                        </div>
                      </div>
                    ))}

                  {!loadingLinks && links.length === 0 && <div className="mutedSmall">Aucun lien</div>}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
