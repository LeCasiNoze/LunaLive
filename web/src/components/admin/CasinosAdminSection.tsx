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
  type AdminCasino,
  type AdminCasinoLink,
} from "../../lib/api_admin_casinos";

type Props = { adminKey: string };
type StreamerRow = { id: number; slug: string; displayName: string };

function linesToList(s: string) {
  return s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
}
function listToLines(arr: string[] | null | undefined) {
  return (arr || []).join("\n");
}

function slugify(s: string) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);
}

export function CasinosAdminSection({ adminKey }: Props) {
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  const [q, setQ] = React.useState("");
  const [items, setItems] = React.useState<AdminCasino[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const [streamers, setStreamers] = React.useState<StreamerRow[]>([]);
  const [links, setLinks] = React.useState<AdminCasinoLink[]>([]);
  const [loadingLinks, setLoadingLinks] = React.useState(false);

  // create form
  const [newSlug, setNewSlug] = React.useState("");
  const [newName, setNewName] = React.useState("");

  // add streamer link form
  const [addStreamerId, setAddStreamerId] = React.useState<number | "">("");
  const [addUrl, setAddUrl] = React.useState("");
  const [addLabel, setAddLabel] = React.useState("");
  const [addPinned, setAddPinned] = React.useState<number | "">("");

  async function refreshList() {
    setErr(null);
    setLoading(true);
    try {
      const r = await adminListCasinos(adminKey, { q });
      const list = Array.isArray(r.items) ? r.items : [];
      setItems(list);

      // garde la sélection si possible, sinon premier item
      setSelectedId((prev) => {
        if (prev && list.some((x) => x.id === prev)) return prev;
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
    setLoadingLinks(true);
    try {
      const r = await adminListCasinoLinks(adminKey, casinoId);
      setLinks(Array.isArray(r.items) ? r.items : []);
    } finally {
      setLoadingLinks(false);
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
      return;
    }
    refreshLinks(selectedId).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const selected = React.useMemo(() => {
    const list = Array.isArray(items) ? items : [];
    return list.find((x) => x.id === selectedId) || null;
  }, [items, selectedId]);

  function setSelectedPatch(patch: Partial<AdminCasino>) {
    if (!selected) return;
    setItems((prev) => (Array.isArray(prev) ? prev.map((c) => (c.id === selected.id ? ({ ...c, ...patch } as any) : c)) : []));
  }

  const safeLinks = Array.isArray(links) ? links : [];
  const bonusLink = safeLinks.find((l) => l.kind === "bonus") || null;
  const streamerLinks = safeLinks.filter((l) => l.kind === "streamer");

  return (
    <div className="panel" style={{ marginBottom: 14 }}>
      <div className="panelTitle">Gestion Casinos (TrustPilot)</div>
      {err && <div className="hint">⚠️ {err}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 12, marginTop: 12 }}>
        {/* LEFT */}
        <div className="panel" style={{ padding: 12 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher casino…" />
            <button className="btnPrimary" onClick={refreshList} disabled={loading}>
              OK
            </button>
          </div>

          <div style={{ marginTop: 10, opacity: 0.9, fontWeight: 900 }}>Créer un casino</div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
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
                const slug = slugify(newSlug.trim() || name);
                if (!name) throw new Error("Nom requis");
                if (!slug) throw new Error("Slug invalide");

                const r = await adminCreateCasino(adminKey, slug, name);
                setNewSlug("");
                setNewName("");
                await refreshList();
                if (r.id) setSelectedId(r.id);
              } catch (e: any) {
                setErr(String(e?.message || e));
              }
            }}
          >
            + Créer
          </button>

          <div style={{ marginTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10 }}>
            {items.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className="btnGhostSmall"
                style={{
                  width: "100%",
                  justifyContent: "space-between",
                  marginBottom: 6,
                  borderColor: c.id === selectedId ? "rgba(126,76,179,0.55)" : undefined,
                }}
              >
                <span style={{ textAlign: "left" }}>
                  <b>{c.name}</b> <span className="mutedSmall">({c.slug})</span>
                  <div className="mutedSmall" style={{ marginTop: 2 }}>
                    {c.status} {c.featuredRank != null ? `• #${c.featuredRank}` : ""} {c.watchLevel !== "none" ? `• ${c.watchLevel}` : ""}
                  </div>
                </span>
                <span style={{ opacity: 0.8 }}>→</span>
              </button>
            ))}
            {!items.length && !loading && <div className="mutedSmall">Aucun résultat</div>}
          </div>
        </div>

        {/* RIGHT */}
        <div className="panel" style={{ padding: 12 }}>
          {!selected ? (
            <div className="mutedSmall">Sélectionne un casino.</div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 1000, fontSize: 16 }}>{selected.name}</div>
                  <div className="mutedSmall">
                    {selected.slug} • id {selected.id}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btnSecondary"
                    onClick={async () => {
                      const next = selected.status === "published" ? "hidden" : "published";
                      setSelectedPatch({ status: next as any });
                      await adminUpdateCasino(adminKey, selected.id, { status: next as any });
                      await refreshList();
                    }}
                  >
                    {selected.status === "published" ? "Masquer" : "Publier"}
                  </button>

                  <button
                    className="btnPrimary"
                    onClick={async () => {
                      setErr(null);
                      try {
                        await adminUpdateCasino(adminKey, selected.id, selected);
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

              {/* Identité */}
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: 12, paddingTop: 12 }}>
                <div className="panelTitle">Identité</div>

                <div className="field">
                  <label>Nom</label>
                  <input className="input" value={selected.name} onChange={(e) => setSelectedPatch({ name: e.target.value })} />
                </div>

                <div className="field">
                  <label>Slug</label>
                  <input className="input" value={selected.slug} onChange={(e) => setSelectedPatch({ slug: e.target.value })} />
                </div>

                <div className="field">
                  <label>Logo URL</label>
                  <input className="input" value={selected.logoUrl || ""} onChange={(e) => setSelectedPatch({ logoUrl: e.target.value || null })} />
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <div className="field" style={{ flex: 1 }}>
                    <label>Status</label>
                    <select className="select" value={selected.status} onChange={(e) => setSelectedPatch({ status: e.target.value as any })}>
                      <option value="published">published</option>
                      <option value="hidden">hidden</option>
                      <option value="disabled">disabled</option>
                    </select>
                  </div>
                  <div className="field" style={{ width: 140 }}>
                    <label>Featured rank</label>
                    <input
                      className="input"
                      value={selected.featuredRank ?? ""}
                      onChange={(e) => setSelectedPatch({ featuredRank: e.target.value === "" ? null : Number(e.target.value) })}
                      placeholder="1,2,3…"
                    />
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <div className="field" style={{ flex: 1 }}>
                    <label>Watch level</label>
                    <select className="select" value={selected.watchLevel} onChange={(e) => setSelectedPatch({ watchLevel: e.target.value as any })}>
                      <option value="none">none</option>
                      <option value="watch">watch</option>
                      <option value="avoid">avoid</option>
                    </select>
                  </div>
                  <div className="field" style={{ flex: 2 }}>
                    <label>Watch reason</label>
                    <input className="input" value={selected.watchReason || ""} onChange={(e) => setSelectedPatch({ watchReason: e.target.value || null })} />
                  </div>
                </div>
              </div>

              {/* Présentation */}
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: 12, paddingTop: 12 }}>
                <div className="panelTitle">Présentation</div>

                <div className="field">
                  <label>Bonus headline</label>
                  <input className="input" value={selected.bonusHeadline || ""} onChange={(e) => setSelectedPatch({ bonusHeadline: e.target.value || null })} />
                </div>

                <div className="field">
                  <label>Description</label>
                  <textarea className="textarea" value={selected.description || ""} onChange={(e) => setSelectedPatch({ description: e.target.value || null })} />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div className="field">
                    <label>Pros (1 ligne = 1 point)</label>
                    <textarea className="textarea" value={listToLines(selected.pros)} onChange={(e) => setSelectedPatch({ pros: linesToList(e.target.value) })} />
                  </div>
                  <div className="field">
                    <label>Cons (1 ligne = 1 point)</label>
                    <textarea className="textarea" value={listToLines(selected.cons)} onChange={(e) => setSelectedPatch({ cons: linesToList(e.target.value) })} />
                  </div>
                </div>
              </div>

              {/* Avis LL */}
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: 12, paddingTop: 12 }}>
                <div className="panelTitle">Avis LunaLive</div>

                <div style={{ display: "flex", gap: 10 }}>
                  <div className="field" style={{ width: 160 }}>
                    <label>Team rating</label>
                    <input
                      className="input"
                      value={selected.teamRating ?? ""}
                      onChange={(e) => setSelectedPatch({ teamRating: e.target.value === "" ? null : Number(e.target.value) })}
                      placeholder="ex: 4.2"
                    />
                  </div>
                  <div className="field" style={{ flex: 1 }}>
                    <label>Team review</label>
                    <textarea className="textarea" value={selected.teamReview || ""} onChange={(e) => setSelectedPatch({ teamReview: e.target.value || null })} />
                  </div>
                </div>
              </div>

              {/* Sections */}
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: 12, paddingTop: 12 }}>
                <div className="panelTitle">Sections libres</div>

                <button
                  className="btnSecondary"
                  onClick={() => {
                    const next = [
                      ...(selected.sections || []),
                      { key: "new", title: "Nouvelle section", body: "", order: (selected.sections?.length || 0) + 1, isVisible: true },
                    ];
                    setSelectedPatch({ sections: next as any });
                  }}
                >
                  + Ajouter une section
                </button>

                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                  {(selected.sections || []).map((sec: any, idx: number) => (
                    <div key={idx} style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 10 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input
                          className="input"
                          value={sec.title || ""}
                          onChange={(e) => {
                            const title = e.target.value;
                            const key = sec.key && sec.key !== "new" ? sec.key : slugify(title) || "section";
                            const next = [...(selected.sections || [])];
                            next[idx] = { ...sec, title, key };
                            setSelectedPatch({ sections: next as any });
                          }}
                          placeholder="Titre"
                        />
                        <input
                          className="input"
                          value={sec.key || ""}
                          onChange={(e) => {
                            const next = [...(selected.sections || [])];
                            next[idx] = { ...sec, key: slugify(e.target.value) };
                            setSelectedPatch({ sections: next as any });
                          }}
                          placeholder="key"
                          style={{ width: 220 }}
                        />
                        <label style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 900 }}>
                          <input
                            type="checkbox"
                            checked={sec.isVisible !== false}
                            onChange={(e) => {
                              const next = [...(selected.sections || [])];
                              next[idx] = { ...sec, isVisible: e.target.checked };
                              setSelectedPatch({ sections: next as any });
                            }}
                          />
                          visible
                        </label>

                        <button
                          className="btnGhostSmall"
                          onClick={() => {
                            const next = [...(selected.sections || [])];
                            if (idx > 0) {
                              const tmp = next[idx - 1];
                              next[idx - 1] = next[idx];
                              next[idx] = tmp;
                            }
                            setSelectedPatch({ sections: next as any });
                          }}
                        >
                          ↑
                        </button>
                        <button
                          className="btnGhostSmall"
                          onClick={() => {
                            const next = [...(selected.sections || [])];
                            if (idx < next.length - 1) {
                              const tmp = next[idx + 1];
                              next[idx + 1] = next[idx];
                              next[idx] = tmp;
                            }
                            setSelectedPatch({ sections: next as any });
                          }}
                        >
                          ↓
                        </button>
                        <button
                          className="btnGhostSmall"
                          onClick={() => {
                            const next = [...(selected.sections || [])];
                            next.splice(idx, 1);
                            setSelectedPatch({ sections: next as any });
                          }}
                        >
                          Suppr
                        </button>
                      </div>

                      <textarea
                        className="textarea"
                        value={sec.body || ""}
                        onChange={(e) => {
                          const next = [...(selected.sections || [])];
                          next[idx] = { ...sec, body: e.target.value };
                          setSelectedPatch({ sections: next as any });
                        }}
                        placeholder="Contenu (texte/markdown simple)…"
                        style={{ marginTop: 8 }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Liens */}
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: 12, paddingTop: 12 }}>
                <div className="panelTitle">Liens</div>
                {loadingLinks && <div className="mutedSmall">Chargement liens…</div>}

                {/* BONUS */}
                <div style={{ marginTop: 8, fontWeight: 1000 }}>Lien bonus (CTA principal)</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 220px 120px", gap: 8, marginTop: 8 }}>
                  <input
                    className="input"
                    value={bonusLink?.targetUrl || ""}
                    placeholder="https://..."
                    onChange={(e) => {
                      const v = e.target.value;
                      setLinks((prev) => (Array.isArray(prev) ? prev.map((l) => (l.id === bonusLink?.id ? { ...l, targetUrl: v } : l)) : []));
                    }}
                  />
                  <input
                    className="input"
                    value={bonusLink?.label || ""}
                    placeholder="Label (optionnel)"
                    onChange={(e) => {
                      const v = e.target.value;
                      setLinks((prev) => (Array.isArray(prev) ? prev.map((l) => (l.id === bonusLink?.id ? { ...l, label: v } : l)) : []));
                    }}
                  />
                  <button
                    className="btnSecondary"
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

                {bonusLink && (
                  <div style={{ display: "flex", gap: 10, marginTop: 8, alignItems: "center" }}>
                    <label style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 900 }}>
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
                    <div className="mutedSmall">Astuce : 1 seul lien bonus actif recommandé.</div>
                  </div>
                )}

                {/* STREAMERS */}
                <div style={{ marginTop: 14, fontWeight: 1000 }}>Liens créateurs</div>

                <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "220px 1fr 180px 110px 120px", gap: 8 }}>
                  <select className="select" value={addStreamerId} onChange={(e) => setAddStreamerId(e.target.value ? Number(e.target.value) : "")}>
                    <option value="">Streamer…</option>
                    {streamers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.displayName}
                      </option>
                    ))}
                  </select>
                  <input className="input" value={addUrl} onChange={(e) => setAddUrl(e.target.value)} placeholder="https://..." />
                  <input className="input" value={addLabel} onChange={(e) => setAddLabel(e.target.value)} placeholder="Label" />
                  <input className="input" value={addPinned} onChange={(e) => setAddPinned(e.target.value === "" ? "" : Number(e.target.value))} placeholder="pin" />
                  <button
                    className="btnSecondary"
                    onClick={async () => {
                      if (!selected) return;
                      if (!addStreamerId || !addUrl.trim()) return;
                      await adminCreateCasinoLink(adminKey, selected.id, {
                        kind: "streamer",
                        streamerId: addStreamerId,
                        targetUrl: addUrl.trim(),
                        label: addLabel.trim() || null,
                        enabled: true,
                        pinnedRank: addPinned === "" ? null : Number(addPinned),
                      } as any);
                      setAddStreamerId("");
                      setAddUrl("");
                      setAddLabel("");
                      setAddPinned("");
                      await refreshLinks(selected.id);
                    }}
                  >
                    + Ajouter
                  </button>
                </div>

                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  {streamerLinks.map((l) => (
                    <div key={l.id} style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 10 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr 160px 110px", gap: 8, alignItems: "center" }}>
                        <select
                          className="select"
                          value={l.streamerId ?? ""}
                          onChange={(e) => {
                            const v = e.target.value ? Number(e.target.value) : null;
                            setLinks((prev) => (Array.isArray(prev) ? prev.map((x) => (x.id === l.id ? { ...x, streamerId: v } : x)) : []));
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
                            setLinks((prev) => (Array.isArray(prev) ? prev.map((x) => (x.id === l.id ? { ...x, targetUrl: v } : x)) : []));
                          }}
                          placeholder="https://..."
                        />

                        <input
                          className="input"
                          value={l.label || ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            setLinks((prev) => (Array.isArray(prev) ? prev.map((x) => (x.id === l.id ? { ...x, label: v } : x)) : []));
                          }}
                          placeholder="Label"
                        />

                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          <button
                            className="btnGhostSmall"
                            onClick={async () => {
                              await adminUpdateCasinoLink(adminKey, l.id, {
                                targetUrl: l.targetUrl,
                                label: l.label,
                                streamerId: l.streamerId,
                              } as any);
                              await refreshLinks(selected.id);
                            }}
                          >
                            Save
                          </button>

                          <button
                            className="btnGhostSmall"
                            onClick={async () => {
                              await adminUpdateCasinoLink(adminKey, l.id, { enabled: !l.enabled } as any);
                              await refreshLinks(selected.id);
                            }}
                          >
                            {l.enabled ? "Disable" : "Enable"}
                          </button>
                        </div>
                      </div>

                      <div style={{ marginTop: 8, display: "flex", gap: 10, alignItems: "center" }}>
                        <label style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 900 }}>
                          <input
                            type="checkbox"
                            checked={!!l.enabled}
                            onChange={(e) => {
                              const v = e.target.checked;
                              setLinks((prev) => (Array.isArray(prev) ? prev.map((x) => (x.id === l.id ? { ...x, enabled: v } : x)) : []));
                            }}
                          />
                          enabled
                        </label>

                        <span className="mutedSmall">pinnedRank</span>
                        <input
                          className="input"
                          style={{ width: 110 }}
                          value={l.pinnedRank ?? ""}
                          onChange={(e) => {
                            const v = e.target.value === "" ? null : Number(e.target.value);
                            setLinks((prev) => (Array.isArray(prev) ? prev.map((x) => (x.id === l.id ? { ...x, pinnedRank: v } : x)) : []));
                          }}
                        />
                        <button
                          className="btnGhostSmall"
                          onClick={async () => {
                            await adminUpdateCasinoLink(adminKey, l.id, { pinnedRank: l.pinnedRank } as any);
                            await refreshLinks(selected.id);
                          }}
                        >
                          Save pin
                        </button>
                      </div>
                    </div>
                  ))}

                  {streamerLinks.length === 0 && <div className="mutedSmall">Aucun lien créateur.</div>}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
