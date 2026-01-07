// web/src/pages/dashboard/sections/bot/modules/CallsModule.tsx
import * as React from "react";
import {
  getCallsBans,
  getCallsConfig,
  getCallsProviderPolicy,
  getCallsQueue,
  patchCallsConfig,
  resetCallsQueue,
  deleteCallQueueItem,
  banCalls,
  unbanCalls,
  allowCallsProviders,
  unallowCallsProviders,
  allowOnlyCallsProvider,
  setCallsProviderPolicy,
  searchSlots,
  type ApiCallsConfig,
  type ApiCallQueueItem,
  type ApiCallBanRow,
  type ApiSlotSuggestion,
} from "../api";

type BanKind = "user" | "slot" | "provider";

function RowLabel({ label }: { label: string }) {
  return <span style={{ fontWeight: 950 }}>{label}</span>;
}

function SmallBtn(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={"btnGhostInline"}
      style={{ padding: "10px 12px", borderRadius: 14, fontWeight: 950, ...(props.style || {}) }}
    />
  );
}

export function CallsModule({ token, streamerSlug }: { token: string; streamerSlug: string }) {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  // settings
  const [cfg, setCfg] = React.useState<ApiCallsConfig | null>(null);

  // queue
  const [queue, setQueue] = React.useState<ApiCallQueueItem[]>([]);

  // bans
  const [banKind, setBanKind] = React.useState<BanKind>("user");
  const [bans, setBans] = React.useState<ApiCallBanRow[]>([]);
  const [banInput, setBanInput] = React.useState("");
  const [selectedBanKeys, setSelectedBanKeys] = React.useState<Record<string, boolean>>({});

  // slot suggestions (for slot ban)
  const [slotQ, setSlotQ] = React.useState("");
  const [slotSug, setSlotSug] = React.useState<ApiSlotSuggestion[]>([]);
  const [slotPick, setSlotPick] = React.useState<ApiSlotSuggestion | null>(null);

  // provider policy
  const [policyMode, setPolicyMode] = React.useState<"allow_all" | "allow_only">("allow_all");
  const [allowedProviders, setAllowedProviders] = React.useState<string[]>([]);
  const [providerInput, setProviderInput] = React.useState("");

  async function reloadAll() {
    setErr(null);
    setBusy(true);
    try {
      const [c, q, pol] = await Promise.all([
        getCallsConfig(streamerSlug, token),
        getCallsQueue(streamerSlug, token, 80, 0),
        getCallsProviderPolicy(streamerSlug, token),
      ]);

      setCfg(c.config);
      setQueue(q.items);

      setPolicyMode(pol.mode);
      setAllowedProviders(pol.allowed);

      // bans current tab
      const b = await getCallsBans(streamerSlug, token, banKind);
      setBans(b.items);
      setSelectedBanKeys({});
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setBusy(false);
    }
  }

  React.useEffect(() => {
    void reloadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const b = await getCallsBans(streamerSlug, token, banKind);
        setBans(b.items);
        setSelectedBanKeys({});
      } catch (e: any) {
        setErr(String(e?.message || "Erreur"));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [banKind]);

  React.useEffect(() => {
    if (banKind !== "slot") return;
    const q = slotQ.trim();
    if (q.length < 2) {
      setSlotSug([]);
      return;
    }
    const t = setTimeout(() => {
      void (async () => {
        try {
          const r = await searchSlots(q, 8);
          setSlotSug(r || []);
        } catch {
          setSlotSug([]);
        }
      })();
    }, 200);
    return () => clearTimeout(t);
  }, [slotQ, banKind]);

  async function saveConfig(patch: Partial<ApiCallsConfig>) {
    if (!cfg) return;
    setErr(null);
    setBusy(true);
    try {
      const r = await patchCallsConfig(streamerSlug, token, patch);
      setCfg(r.config);
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setBusy(false);
    }
  }

  async function refreshQueue() {
    setErr(null);
    try {
      const q = await getCallsQueue(streamerSlug, token, 80, 0);
      setQueue(q.items);
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    }
  }

  async function doResetQueue() {
    setErr(null);
    setBusy(true);
    try {
      await resetCallsQueue(streamerSlug, token);
      await refreshQueue();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setBusy(false);
    }
  }

  async function removeQueueItem(id: string) {
    setErr(null);
    setBusy(true);
    try {
      await deleteCallQueueItem(streamerSlug, token, id);
      await refreshQueue();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setBusy(false);
    }
  }

  async function reloadBans() {
    const b = await getCallsBans(streamerSlug, token, banKind);
    setBans(b.items);
    setSelectedBanKeys({});
  }

  async function addBan() {
    setErr(null);
    setBusy(true);
    try {
      if (banKind === "user") {
        const username = banInput.trim();
        if (!username) throw new Error("Username requis");
        await banCalls(streamerSlug, token, { kind: "user", username });
      } else if (banKind === "provider") {
        const provider = banInput.trim();
        if (!provider) throw new Error("Provider requis");
        await banCalls(streamerSlug, token, { kind: "provider", provider });
      } else {
        // slot
        const pick = slotPick;
        if (!pick) throw new Error("Choisis une machine (suggestions)");
        await banCalls(streamerSlug, token, { kind: "slot", slotName: pick.name, label: pick.name });
        setSlotPick(null);
        setSlotQ("");
        setSlotSug([]);
      }

      setBanInput("");
      await reloadBans();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setBusy(false);
    }
  }

  async function removeSelectedBans() {
    setErr(null);
    setBusy(true);
    try {
      const keys = bans
        .filter((b) => selectedBanKeys[b.banKey])
        .map((b) => b.banKey);

      if (!keys.length) return;

      await unbanCalls(streamerSlug, token, banKind, keys);
      await reloadBans();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setBusy(false);
    }
  }

  async function setMode(next: "allow_all" | "allow_only") {
    setErr(null);
    setBusy(true);
    try {
      await setCallsProviderPolicy(streamerSlug, token, next);
      const pol = await getCallsProviderPolicy(streamerSlug, token);
      setPolicyMode(pol.mode);
      setAllowedProviders(pol.allowed);
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setBusy(false);
    }
  }

  async function addAllowedProvider() {
    const p = providerInput.trim();
    if (!p) return;
    setErr(null);
    setBusy(true);
    try {
      await allowCallsProviders(streamerSlug, token, [p]);
      const pol = await getCallsProviderPolicy(streamerSlug, token);
      setPolicyMode(pol.mode);
      setAllowedProviders(pol.allowed);
      setProviderInput("");
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setBusy(false);
    }
  }

  async function removeAllowedProvider(p: string) {
    setErr(null);
    setBusy(true);
    try {
      await unallowCallsProviders(streamerSlug, token, [p]);
      const pol = await getCallsProviderPolicy(streamerSlug, token);
      setPolicyMode(pol.mode);
      setAllowedProviders(pol.allowed);
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setBusy(false);
    }
  }

  async function allowOnlyOneProvider() {
    const p = providerInput.trim();
    if (!p) return;
    setErr(null);
    setBusy(true);
    try {
      await allowOnlyCallsProvider(streamerSlug, token, p);
      const pol = await getCallsProviderPolicy(streamerSlug, token);
      setPolicyMode(pol.mode);
      setAllowedProviders(pol.allowed);
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setBusy(false);
    }
  }

  if (!cfg) {
    return (
      <div className="panel" style={{ padding: 14, borderRadius: 18 }}>
        <div className="panelTitle">Calls & Hunt</div>
        <div className="muted">{busy ? "Chargement…" : "Config indisponible"}</div>
        {err ? <div className="hint" style={{ marginTop: 10 }}>⚠️ {err}</div> : null}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {err && (
        <div className="hint">
          ⚠️ {err}
        </div>
      )}

      {/* SETTINGS */}
      <div className="panel" style={{ padding: 14, borderRadius: 18 }}>
        <div className="panelTitle" style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          <span>Paramètres calls</span>
          <span className="muted" style={{ fontSize: 12, fontWeight: 900 }}>
            @ {streamerSlug}
          </span>
        </div>

        <div style={{ marginTop: 10, display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={cfg.enabled}
              onChange={(e) => saveConfig({ enabled: e.target.checked })}
            />
            <RowLabel label="Calls activés" />
          </label>

          <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={cfg.allowListec}
              onChange={(e) => saveConfig({ allowListec: e.target.checked })}
            />
            <RowLabel label="Autoriser !listec" />
          </label>

          <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={cfg.showAcceptPublic}
              onChange={(e) => saveConfig({ showAcceptPublic: e.target.checked })}
            />
            <RowLabel label="Annonce publique des calls" />
          </label>

          <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={cfg.showCmdInChat}
              onChange={(e) => saveConfig({ showCmdInChat: e.target.checked })}
            />
            <RowLabel label="Afficher le message !call original" />
          </label>

          <div>
            <div style={{ fontWeight: 950, fontSize: 13 }}>Limite calls / user</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>
              0 = infini (mods/streamer/admin bypass).
            </div>
            <input
              value={String(cfg.perUserLimit)}
              onChange={(e) => {
                const v = Number(e.target.value);
                setCfg({ ...cfg, perUserLimit: Number.isFinite(v) ? v : cfg.perUserLimit });
              }}
              onBlur={() => saveConfig({ perUserLimit: cfg.perUserLimit })}
              type="number"
              min={0}
              max={10}
              style={{
                marginTop: 8,
                width: "100%",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(0,0,0,0.12)",
                color: "inherit",
              }}
            />
          </div>

          <div>
            <div style={{ fontWeight: 950, fontSize: 13 }}>Max items affichés par !listec</div>
            <input
              value={String(cfg.listecMax)}
              onChange={(e) => {
                const v = Number(e.target.value);
                setCfg({ ...cfg, listecMax: Number.isFinite(v) ? v : cfg.listecMax });
              }}
              onBlur={() => saveConfig({ listecMax: cfg.listecMax })}
              type="number"
              min={1}
              max={50}
              style={{
                marginTop: 8,
                width: "100%",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(0,0,0,0.12)",
                color: "inherit",
              }}
            />
          </div>
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <SmallBtn disabled={busy} onClick={() => reloadAll()}>
            {busy ? "…" : "Rafraîchir"}
          </SmallBtn>
        </div>
      </div>

      {/* PROVIDER POLICY */}
      <div className="panel" style={{ padding: 14, borderRadius: 18 }}>
        <div className="panelTitle">Providers autorisés</div>
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          Option “ban tous les providers sauf …” = mode <b>Autoriser seulement</b>.
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="radio" checked={policyMode === "allow_all"} onChange={() => setMode("allow_all")} />
            <span style={{ fontWeight: 950 }}>Autoriser tous</span>
          </label>

          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="radio" checked={policyMode === "allow_only"} onChange={() => setMode("allow_only")} />
            <span style={{ fontWeight: 950 }}>Autoriser seulement</span>
          </label>
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={providerInput}
            onChange={(e) => setProviderInput(e.target.value)}
            placeholder="provider (ex: pragmaticplay, hacksaw)"
            style={{
              flex: "1 1 260px",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(0,0,0,0.12)",
              color: "inherit",
            }}
          />

          <SmallBtn disabled={busy} onClick={addAllowedProvider}>
            Ajouter whitelist
          </SmallBtn>

          <SmallBtn disabled={busy} onClick={allowOnlyOneProvider} style={{ border: "1px solid rgba(255,190,60,0.35)" }}>
            Tout interdire sauf celui-là
          </SmallBtn>
        </div>

        {policyMode === "allow_only" ? (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            {allowedProviders.length === 0 ? (
              <div className="muted">Whitelist vide (du coup tout est refusé).</div>
            ) : (
              allowedProviders.map((p) => (
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
                  <div style={{ fontWeight: 950 }}>{p}</div>
                  <SmallBtn disabled={busy} onClick={() => removeAllowedProvider(p)}>
                    Retirer
                  </SmallBtn>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="muted" style={{ marginTop: 10 }}>
            Mode “Autoriser tous” actif.
          </div>
        )}
      </div>

      {/* QUEUE */}
      <div className="panel" style={{ padding: 14, borderRadius: 18 }}>
        <div className="panelTitle" style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          <span>Queue calls</span>
          <span className="muted" style={{ fontSize: 12 }}>
            {queue.length} item(s)
          </span>
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <SmallBtn disabled={busy} onClick={refreshQueue}>
            Refresh queue
          </SmallBtn>
          <SmallBtn disabled={busy} onClick={doResetQueue}>
            Reset queue
          </SmallBtn>
        </div>

        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {queue.length === 0 ? (
            <div className="muted">Aucun call en file.</div>
          ) : (
            queue.map((it) => (
              <div
                key={it.id}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  padding: 10,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(0,0,0,0.10)",
                }}
              >
                <div style={{ width: 44, height: 44, borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.10)" }}>
                  {it.imageUrl ? (
                    <img src={it.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  ) : (
                    <div className="muted" style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900 }}>
                      ?
                    </div>
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 950 }}>
                    #{it.pos} — {it.slotName}
                    {it.provider ? <span className="muted"> ({it.provider})</span> : null}
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    call par @{it.username}
                  </div>
                </div>

                <SmallBtn disabled={busy} onClick={() => removeQueueItem(it.id)}>
                  Supprimer
                </SmallBtn>
              </div>
            ))
          )}
        </div>
      </div>

      {/* BANS */}
      <div className="panel" style={{ padding: 14, borderRadius: 18 }}>
        <div className="panelTitle">Bans calls</div>

        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(["user", "slot", "provider"] as BanKind[]).map((k) => (
            <button
              key={k}
              className="btnGhostInline"
              onClick={() => setBanKind(k)}
              style={{
                padding: "10px 12px",
                borderRadius: 14,
                fontWeight: 950,
                border: banKind === k ? "1px solid rgba(124,77,255,0.55)" : "1px solid rgba(255,255,255,0.10)",
                background: banKind === k ? "rgba(124,77,255,0.14)" : "rgba(0,0,0,0.12)",
              }}
            >
              {k === "user" ? "Users" : k === "slot" ? "Machines" : "Providers"}
            </button>
          ))}
        </div>

        {/* add ban */}
        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
          {banKind !== "slot" ? (
            <input
              value={banInput}
              onChange={(e) => setBanInput(e.target.value)}
              placeholder={banKind === "user" ? "username" : "provider"}
              style={{
                flex: "1 1 260px",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(0,0,0,0.12)",
                color: "inherit",
              }}
            />
          ) : (
            <div style={{ flex: "1 1 360px", minWidth: 260 }}>
              <input
                value={slotQ}
                onChange={(e) => {
                  setSlotQ(e.target.value);
                  setSlotPick(null);
                }}
                placeholder="Rechercher une machine à ban (ex: Sweet Bonanza)"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(0,0,0,0.12)",
                  color: "inherit",
                }}
              />

              {slotSug.length > 0 && !slotPick ? (
                <div
                  style={{
                    marginTop: 8,
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(0,0,0,0.12)",
                    overflow: "hidden",
                  }}
                >
                  {slotSug.map((s) => (
                    <button
                      key={`${s.name}::${s.provider ?? ""}`}
                      type="button"
                      onClick={() => setSlotPick(s)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: 10,
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                        border: "none",
                        background: "transparent",
                        color: "inherit",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ width: 40, height: 40, borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.10)" }}>
                        {s.imageUrl ? (
                          <img src={s.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        ) : null}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 950, fontSize: 13, lineHeight: 1.1 }}>{s.name}</div>
                        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                          {s.provider ?? "—"}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}

              {slotPick ? (
                <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                  Sélection: <b>{slotPick.name}</b>{slotPick.provider ? ` (${slotPick.provider})` : ""}
                </div>
              ) : null}
            </div>
          )}

          <SmallBtn disabled={busy} onClick={addBan}>
            Ajouter ban
          </SmallBtn>

          <SmallBtn disabled={busy} onClick={removeSelectedBans}>
            Deban sélection
          </SmallBtn>
        </div>

        {/* list bans */}
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {bans.length === 0 ? (
            <div className="muted">Aucun ban.</div>
          ) : (
            bans.map((b) => (
              <div
                key={b.id}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  padding: 10,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(0,0,0,0.10)",
                }}
              >
                <input
                  type="checkbox"
                  checked={!!selectedBanKeys[b.banKey]}
                  onChange={(e) => setSelectedBanKeys((prev) => ({ ...prev, [b.banKey]: e.target.checked }))}
                />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 950 }}>
                    {b.label ? b.label : b.banKey}
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    key: {b.banKey}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <SmallBtn disabled={busy} onClick={reloadAll}>
          Tout rafraîchir
        </SmallBtn>
      </div>
    </div>
  );
}
