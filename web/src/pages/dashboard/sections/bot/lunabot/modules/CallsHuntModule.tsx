// web/src/pages/dashboard/sections/bot/modules/CallsHuntModule.tsx
import * as React from "react";

function apiBase() {
  return (import.meta as any).env?.VITE_API_BASE || "https://lunalive-api.onrender.com";
}

function toast(kind: "success" | "error", title: string, message?: string) {
  window.dispatchEvent(new CustomEvent("ui:toast", { detail: { kind, title, message } }));
}

type CallsConfig = {
  enabled: boolean;
  allowListec: boolean;
  listecMax: number;
  perUserLimit: number;
  showCmdInChat: boolean;
  showAcceptPublic: boolean;
};

type SlotSuggestion = { name: string; provider: string | null; imageUrl?: string | null };

type BansPayload = {
  users: { username: string; note: string | null }[];
  providers: { provider: string; note: string | null }[];
  slots: { slotKey: string; name: string; provider: string | null; imageUrl: string | null; note: string | null }[];
};

type ProviderPolicy = { mode: "allow_all" | "allow_only"; allowedProviders: string[] };

async function getJson<T>(url: string, token: string) {
  const r = await fetch(`${apiBase()}${url}`, { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.ok) throw new Error(j?.error || `http_${r.status}`);
  return j as T;
}

async function patchJson<T>(url: string, token: string, body: any) {
  const r = await fetch(`${apiBase()}${url}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.ok) throw new Error(j?.error || `http_${r.status}`);
  return j as T;
}

async function postJson<T>(url: string, token: string, body: any) {
  const r = await fetch(`${apiBase()}${url}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.ok) throw new Error(j?.error || `http_${r.status}`);
  return j as T;
}

async function searchSlots(q: string): Promise<SlotSuggestion[]> {
  const s = String(q || "").trim();
  if (s.length < 2) return [];
  const r = await fetch(`${apiBase()}/slots/search?q=${encodeURIComponent(s)}&limit=10`);
  const j = await r.json().catch(() => null);
  if (!j?.ok) return [];
  return (j.items || []) as SlotSuggestion[];
}

function pill(active: boolean): React.CSSProperties {
  return {
    padding: "8px 10px",
    borderRadius: 999,
    fontWeight: 950,
    border: active ? "1px solid rgba(124,77,255,0.55)" : "1px solid rgba(255,255,255,0.10)",
    background: active ? "rgba(124,77,255,0.14)" : "rgba(0,0,0,0.12)",
    cursor: "pointer",
  };
}

export function CallsHuntModule({ token, streamerSlug }: { token: string; streamerSlug: string }) {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const [config, setConfig] = React.useState<CallsConfig | null>(null);
  const [policy, setPolicy] = React.useState<ProviderPolicy | null>(null);
  const [bans, setBans] = React.useState<BansPayload | null>(null);

  // UI tabs inside module
  const [tab, setTab] = React.useState<"settings" | "bans" | "providers">("settings");

  // bans inputs
  const [banUser, setBanUser] = React.useState("");
  const [banProvider, setBanProvider] = React.useState("");
  const [banSlotQ, setBanSlotQ] = React.useState("");
  const [banSlotSug, setBanSlotSug] = React.useState<SlotSuggestion[]>([]);

  // providers allowlist input
  const [allowProv, setAllowProv] = React.useState("");

  async function reload() {
    setErr(null);
    setBusy(true);
    try {
      const cfg = await getJson<{ ok: boolean; config: CallsConfig }>(`/calls/${encodeURIComponent(streamerSlug)}/config`, token);
      setConfig(cfg.config);

      const pol = await getJson<{ ok: boolean; mode: ProviderPolicy["mode"]; allowedProviders: string[] }>(
        `/calls/${encodeURIComponent(streamerSlug)}/provider-policy`,
        token
      );
      setPolicy({ mode: pol.mode, allowedProviders: pol.allowedProviders || [] });

      const bn = await getJson<{ ok: boolean; bans: BansPayload }>(`/calls/${encodeURIComponent(streamerSlug)}/bans`, token);
      setBans(bn.bans);
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setBusy(false);
    }
  }

  React.useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // slot suggestions debounce
  React.useEffect(() => {
    const q = banSlotQ.trim();
    if (q.length < 2) {
      setBanSlotSug([]);
      return;
    }
    const t = window.setTimeout(() => {
      searchSlots(q)
        .then((x) => setBanSlotSug(x))
        .catch(() => setBanSlotSug([]));
    }, 140);
    return () => window.clearTimeout(t);
  }, [banSlotQ]);

  async function saveConfigPatch(patch: Partial<CallsConfig>) {
    if (!config) return;
    setErr(null);
    setBusy(true);
    try {
      const r = await patchJson<{ ok: boolean; config: CallsConfig }>(
        `/calls/${encodeURIComponent(streamerSlug)}/config`,
        token,
        patch
      );
      setConfig({
        enabled: !!(r as any).config?.enabled,
        allowListec: !!(r as any).config?.allowListec,
        listecMax: Number((r as any).config?.listecMax || 10),
        perUserLimit: Number((r as any).config?.perUserLimit || 2),
        showCmdInChat: !!(r as any).config?.showCmdInChat,
        showAcceptPublic: !!(r as any).config?.showAcceptPublic,
      });
      toast("success", "Sauvegardé ✅");
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
      toast("error", "Erreur", String(e?.message || "save_failed"));
    } finally {
      setBusy(false);
    }
  }

  async function addBan(kind: "user" | "provider" | "slot", value: string) {
    setErr(null);
    setBusy(true);
    try {
      await postJson(`/calls/${encodeURIComponent(streamerSlug)}/ban`, token, { kind, value });
      await reload();
      toast("success", "Ban ajouté ✅");
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
      toast("error", "Erreur", String(e?.message || "ban_failed"));
    } finally {
      setBusy(false);
    }
  }

  async function removeBan(kind: "user" | "provider" | "slot", values: string[]) {
    if (!values.length) return;
    setErr(null);
    setBusy(true);
    try {
      await postJson(`/calls/${encodeURIComponent(streamerSlug)}/unban`, token, { kind, values });
      await reload();
      toast("success", "Déban ✅");
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
      toast("error", "Erreur", String(e?.message || "unban_failed"));
    } finally {
      setBusy(false);
    }
  }

  async function savePolicy(next: ProviderPolicy) {
    setErr(null);
    setBusy(true);
    try {
      const r = await patchJson<{ ok: boolean; mode: ProviderPolicy["mode"]; allowedProviders: string[] }>(
        `/calls/${encodeURIComponent(streamerSlug)}/provider-policy`,
        token,
        { mode: next.mode, allowedProviders: next.allowedProviders }
      );
      setPolicy({ mode: r.mode, allowedProviders: r.allowedProviders || [] });
      toast("success", "Policy sauvegardée ✅");
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
      toast("error", "Erreur", String(e?.message || "policy_failed"));
    } finally {
      setBusy(false);
    }
  }

  if (!config || !policy || !bans) {
    return (
      <div className="panel" style={{ padding: 14, borderRadius: 18 }}>
        <div className="panelTitle">Call & Hunt</div>
        <div className="muted">{busy ? "Chargement…" : err ? `⚠️ ${err}` : "…"}</div>
        <button className="btnGhostInline" style={{ marginTop: 10 }} onClick={() => reload()} disabled={busy}>
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <div className="panel" style={{ padding: 14, borderRadius: 18 }}>
      <div className="panelTitle" style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <span>Call & Hunt</span>
        <span className="muted" style={{ fontSize: 12 }}>
          @{streamerSlug}
        </span>
      </div>

      {err && (
        <div className="hint" style={{ marginTop: 10 }}>
          ⚠️ {err}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <button className="btnGhostInline" style={pill(tab === "settings")} onClick={() => setTab("settings")}>
          Paramètres
        </button>
        <button className="btnGhostInline" style={pill(tab === "bans")} onClick={() => setTab("bans")}>
          Bans
        </button>
        <button className="btnGhostInline" style={pill(tab === "providers")} onClick={() => setTab("providers")}>
          Providers (allowlist)
        </button>

        <div style={{ marginLeft: "auto" }}>
          <button className="btnGhostInline" onClick={() => reload()} disabled={busy}>
            {busy ? "…" : "Rafraîchir"}
          </button>
        </div>
      </div>

      {/* SETTINGS */}
      {tab === "settings" ? (
        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <div
            style={{
              padding: 12,
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(0,0,0,0.10)",
              display: "grid",
              gap: 10,
            }}
          >
            <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 900 }}>
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => saveConfigPatch({ enabled: e.target.checked })}
              />
              Activer les calls
            </label>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: "0 0 220px" }}>
                <div className="muted" style={{ fontSize: 12, fontWeight: 900 }}>
                  Limite calls / user
                </div>
                <input
                  type="number"
                  value={config.perUserLimit}
                  min={0}
                  max={50}
                  onChange={(e) => setConfig({ ...config, perUserLimit: Number(e.target.value) })}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(0,0,0,0.12)",
                    color: "inherit",
                    marginTop: 6,
                  }}
                />
              </div>

              <div style={{ flex: "0 0 220px" }}>
                <div className="muted" style={{ fontSize: 12, fontWeight: 900 }}>
                  Max !listec
                </div>
                <input
                  type="number"
                  value={config.listecMax}
                  min={1}
                  max={50}
                  onChange={(e) => setConfig({ ...config, listecMax: Number(e.target.value) })}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(0,0,0,0.12)",
                    color: "inherit",
                    marginTop: 6,
                  }}
                />
              </div>

              <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                <button
                  className="btnGhostInline"
                  disabled={busy}
                  onClick={() =>
                    saveConfigPatch({
                      perUserLimit: config.perUserLimit,
                      listecMax: config.listecMax,
                    })
                  }
                >
                  Sauvegarder
                </button>
              </div>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 900 }}>
              <input
                type="checkbox"
                checked={config.allowListec}
                onChange={(e) => saveConfigPatch({ allowListec: e.target.checked })}
              />
              Autoriser la commande !listec
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 900 }}>
              <input
                type="checkbox"
                checked={config.showCmdInChat}
                onChange={(e) => saveConfigPatch({ showCmdInChat: e.target.checked })}
              />
              Afficher la commande tapée en chat (miroir overlay)
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 900 }}>
              <input
                type="checkbox"
                checked={config.showAcceptPublic}
                onChange={(e) => saveConfigPatch({ showAcceptPublic: e.target.checked })}
              />
              Afficher “call accepté” publiquement
            </label>
          </div>
        </div>
      ) : null}

      {/* BANS */}
      {tab === "bans" ? (
        <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
          {/* Users */}
          <div
            style={{
              padding: 12,
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(0,0,0,0.10)",
            }}
          >
            <div style={{ fontWeight: 950 }}>Ban users</div>

            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                value={banUser}
                onChange={(e) => setBanUser(e.target.value)}
                placeholder="username (ex: toto)"
                style={{
                  flex: "1 1 240px",
                  minWidth: 220,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(0,0,0,0.12)",
                  color: "inherit",
                }}
              />
              <button
                className="btnGhostInline"
                disabled={busy || !banUser.trim()}
                onClick={async () => {
                  const v = banUser.trim();
                  setBanUser("");
                  await addBan("user", v);
                }}
              >
                Bannir
              </button>
            </div>

            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {bans.users.length === 0 ? (
                <div className="muted">Aucun user banni.</div>
              ) : (
                bans.users.map((x) => (
                  <div
                    key={x.username}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      alignItems: "center",
                      padding: 10,
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: "rgba(0,0,0,0.10)",
                    }}
                  >
                    <div style={{ fontWeight: 900 }}>@{x.username}</div>
                    <button className="btnGhostInline" disabled={busy} onClick={() => removeBan("user", [x.username])}>
                      Déban
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Providers */}
          <div
            style={{
              padding: 12,
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(0,0,0,0.10)",
            }}
          >
            <div style={{ fontWeight: 950 }}>Ban providers</div>

            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                value={banProvider}
                onChange={(e) => setBanProvider(e.target.value)}
                placeholder="provider (ex: Hacksaw Gaming)"
                style={{
                  flex: "1 1 240px",
                  minWidth: 220,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(0,0,0,0.12)",
                  color: "inherit",
                }}
              />
              <button
                className="btnGhostInline"
                disabled={busy || !banProvider.trim()}
                onClick={async () => {
                  const v = banProvider.trim();
                  setBanProvider("");
                  await addBan("provider", v);
                }}
              >
                Bannir
              </button>
            </div>

            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {bans.providers.length === 0 ? (
                <div className="muted">Aucun provider banni.</div>
              ) : (
                bans.providers.map((x) => (
                  <div
                    key={x.provider}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      alignItems: "center",
                      padding: 10,
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: "rgba(0,0,0,0.10)",
                    }}
                  >
                    <div style={{ fontWeight: 900 }}>{x.provider}</div>
                    <button className="btnGhostInline" disabled={busy} onClick={() => removeBan("provider", [x.provider])}>
                      Déban
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Slots */}
          <div
            style={{
              padding: 12,
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(0,0,0,0.10)",
            }}
          >
            <div style={{ fontWeight: 950 }}>Ban machines (slots)</div>

            <div style={{ marginTop: 10 }}>
              <input
                value={banSlotQ}
                onChange={(e) => setBanSlotQ(e.target.value)}
                placeholder="Tape le nom…"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(0,0,0,0.12)",
                  color: "inherit",
                }}
              />

              {banSlotSug.length ? (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  {banSlotSug.map((it) => (
                    <button
                      key={`${it.name}-${it.provider || ""}`}
                      className="btnGhostInline"
                      style={{
                        padding: 10,
                        borderRadius: 12,
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        textAlign: "left",
                        justifyContent: "space-between",
                      }}
                      onClick={async () => {
                        setBanSlotQ("");
                        setBanSlotSug([]);
                        await addBan("slot", it.name);
                      }}
                      disabled={busy}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        {it.imageUrl ? (
                          <img
                            src={it.imageUrl}
                            alt=""
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: 10,
                              objectFit: "cover",
                              border: "1px solid rgba(255,255,255,0.10)",
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: 10,
                              border: "1px solid rgba(255,255,255,0.10)",
                              background: "rgba(255,255,255,0.06)",
                            }}
                          />
                        )}

                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {it.name}
                          </div>
                          {it.provider ? (
                            <div className="muted" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis" }}>
                              {it.provider}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <span style={{ fontWeight: 950, opacity: 0.9 }}>Bannir</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {bans.slots.length === 0 ? (
                <div className="muted">Aucune machine bannie.</div>
              ) : (
                bans.slots.map((x) => (
                  <div
                    key={x.slotKey}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      alignItems: "center",
                      padding: 10,
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: "rgba(0,0,0,0.10)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      {x.imageUrl ? (
                        <img
                          src={x.imageUrl}
                          alt=""
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 10,
                            objectFit: "cover",
                            border: "1px solid rgba(255,255,255,0.10)",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 10,
                            border: "1px solid rgba(255,255,255,0.10)",
                            background: "rgba(255,255,255,0.06)",
                          }}
                        />
                      )}

                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {x.name}
                        </div>
                        {x.provider ? (
                          <div className="muted" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis" }}>
                            {x.provider}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <button className="btnGhostInline" disabled={busy} onClick={() => removeBan("slot", [x.slotKey])}>
                      Déban
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* PROVIDERS allowlist */}
      {tab === "providers" ? (
        <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
          <div
            style={{
              padding: 12,
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(0,0,0,0.10)",
            }}
          >
            <div style={{ fontWeight: 950 }}>Mode providers</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              “Allow only” = bannir tous les providers sauf ceux listés.
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                className="btnGhostInline"
                style={pill(policy.mode === "allow_all")}
                disabled={busy}
                onClick={() => savePolicy({ ...policy, mode: "allow_all" })}
              >
                Autoriser tous
              </button>
              <button
                className="btnGhostInline"
                style={pill(policy.mode === "allow_only")}
                disabled={busy}
                onClick={() => savePolicy({ ...policy, mode: "allow_only" })}
              >
                Autoriser uniquement…
              </button>
            </div>

            <div style={{ marginTop: 12, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 12 }}>
              <div style={{ fontWeight: 950 }}>Allowlist</div>

              <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  value={allowProv}
                  onChange={(e) => setAllowProv(e.target.value)}
                  placeholder="Ajoute un provider (ex: Hacksaw Gaming)"
                  style={{
                    flex: "1 1 320px",
                    minWidth: 240,
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(0,0,0,0.12)",
                    color: "inherit",
                  }}
                />
                <button
                  className="btnGhostInline"
                  disabled={busy || !allowProv.trim()}
                  onClick={async () => {
                    const v = allowProv.trim();
                    setAllowProv("");

                    const next = Array.from(new Set([...(policy.allowedProviders || []), v]));
                    await savePolicy({ ...policy, mode: "allow_only", allowedProviders: next });
                  }}
                >
                  Ajouter
                </button>

                <button
                  className="btnGhostInline"
                  disabled={busy}
                  onClick={() => savePolicy({ ...policy, allowedProviders: [] })}
                >
                  Vider
                </button>
              </div>

              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                {policy.allowedProviders.length === 0 ? (
                  <div className="muted">Aucun provider dans l’allowlist.</div>
                ) : (
                  policy.allowedProviders.map((p) => (
                    <div
                      key={p}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        alignItems: "center",
                        padding: 10,
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.08)",
                        background: "rgba(0,0,0,0.10)",
                      }}
                    >
                      <div style={{ fontWeight: 900 }}>{p}</div>
                      <button
                        className="btnGhostInline"
                        disabled={busy}
                        onClick={async () => {
                          const next = policy.allowedProviders.filter((x) => x !== p);
                          await savePolicy({ ...policy, allowedProviders: next });
                        }}
                      >
                        Retirer
                      </button>
                    </div>
                  ))
                )}
              </div>

              {policy.mode === "allow_only" ? (
                <div className="hint" style={{ marginTop: 10 }}>
                  ✅ Mode actif : seuls les providers de la liste passent.
                </div>
              ) : (
                <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
                  Mode “Autoriser tous” : l’allowlist est ignorée.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
