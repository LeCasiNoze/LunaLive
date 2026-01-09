import * as React from "react";
import { Settings } from "lucide-react";
import {
  getCallsHuntState,
  callsHuntPass,
  callsHuntBonusDrop,
  callsHuntOpen,
  callsHuntPay,
  callsHuntSetStart,
  callsHuntSetBet,
  callsHuntReset,
  type ApiCallsHuntState,
  type ApiHuntQueueItem,
  type ApiHuntBonusDrop,
} from "../../lib/api";

const fmtEur = (n: any) => `${(Number(n) || 0).toFixed(2)}€`;

function asArr<T>(v: any): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function getOpening(s: ApiCallsHuntState | null) {
  if (!s) return false;
  const phase = (s as any)?.hunt?.phase;
  return s.mode === "open" || (s as any).opening === true || phase === "open" || (s as any)?.hunt?.opened === true;
}

function getStartRaw(s: ApiCallsHuntState | null): number | null {
  if (!s) return null;
  // ✅ backend renvoie startEur: null | number
  const v = (s as any).startEur ?? (s as any)?.hunt?.start ?? null;
  if (v === null || typeof v === "undefined") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pickBonusDrops(s: ApiCallsHuntState | null): ApiHuntBonusDrop[] {
  if (!s) return [];
  const explicit = asArr<ApiHuntBonusDrop>((s as any).bonusDrops);
  if (explicit.length) return explicit;

  const q = asArr<ApiHuntQueueItem>((s as any).queue);
  return q
    .filter((it: any) => Number(it?.betEur ?? 0) > 0)
    .map((it: any) => ({
      id: it.id,
      slotName: it.slotName,
      provider: it.provider,
      username: it.username,
      imageUrl: it.imageUrl,
      betEur: Number(it.betEur ?? 0) || 0,
      payEur: it.payEur ?? null,
    }));
}

function Panel({ title, right, children }: any) {
  return (
    <div className="panel" style={{ padding: 14, borderRadius: 18 }}>
      <div className="panelTitle" style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <span>{title}</span>
        {right ? <span>{right}</span> : null}
      </div>
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  );
}

function SmallBtn(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="btnGhostInline"
      style={{
        padding: "10px 12px",
        borderRadius: 14,
        fontWeight: 950,
        ...(props.style || {}),
      }}
    />
  );
}

function Thumb({ url }: { url?: string | null }) {
  return (
    <div
      style={{
        width: 44,
        height: 44,
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(0,0,0,0.12)",
        flex: "0 0 auto",
      }}
    >
      {url ? (
        <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        <div className="muted" style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", fontWeight: 900 }}>
          ?
        </div>
      )}
    </div>
  );
}

export function HuntTabs({
  token,
  streamerSlug,
  canModerate,
}: {
  token: string;
  streamerSlug: string;
  canModerate: boolean;
}) {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const [state, setState] = React.useState<ApiCallsHuntState | null>(null);

  const [showOpts, setShowOpts] = React.useState(false);
  const [startInp, setStartInp] = React.useState("");
  const [betInp, setBetInp] = React.useState("");
  const [payInp, setPayInp] = React.useState("");

  async function load() {
    const s = await getCallsHuntState(streamerSlug, token);
    setState(s);

    const startRaw = getStartRaw(s);
    setStartInp(startRaw !== null ? String(startRaw) : "");
  }

  React.useEffect(() => {
    let alive = true;

    void (async () => {
      try {
        await load();
      } catch (e: any) {
        if (!alive) return;
        setErr(String(e?.message || "Erreur"));
      }
    })();

    const t = setInterval(() => {
      void (async () => {
        try {
          await load();
        } catch (e: any) {
          if (!alive) return;
          setErr(String(e?.message || "Erreur"));
        }
      })();
    }, 1500);

    return () => {
      alive = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, streamerSlug]);

  const opening = getOpening(state);

  const currentFarm = (state as any)?.currentCall ?? null;
  const currentOpen = (state as any)?.currentOpenItem ?? null;

  const bonusDrops = pickBonusDrops(state);

  const startRaw = getStartRaw(state);
  const hasStart = startRaw !== null && startRaw > 0;
  const startEur = startRaw ?? 0;

  const callsCount =
    Number((state as any)?.callsCount) ||
    (asArr<any>((state as any)?.queue).filter((x) => !(Number(x?.betEur ?? 0) > 0)).length);
  const bonusCount = Number((state as any)?.bonusCount) || bonusDrops.length;

  async function doPass() {
    if (!canModerate) return;
    setErr(null);
    setBusy(true);
    try {
      await callsHuntPass(streamerSlug, token);
      await load();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setBusy(false);
    }
  }

  async function doBonus() {
    if (!canModerate) return;
    setErr(null);
    setBusy(true);
    try {
      await callsHuntBonusDrop(streamerSlug, token);
      await load();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setBusy(false);
    }
  }

  async function doOpen() {
    if (!canModerate) return;
    setErr(null);
    setBusy(true);
    try {
      await callsHuntOpen(streamerSlug, token);
      await load();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setBusy(false);
    }
  }

  async function doPay() {
    if (!canModerate) return;
    const v = Number(payInp);
    if (!Number.isFinite(v) || v < 0) {
      setErr("Pay invalide");
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      await callsHuntPay(streamerSlug, token, v);
      setPayInp("");
      await load();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setBusy(false);
    }
  }

  async function doSetStart() {
    if (!canModerate) return;
    const v = Number(startInp);
    if (!Number.isFinite(v) || v <= 0) {
      setErr("Start invalide");
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      await callsHuntSetStart(streamerSlug, token, v);
      await load();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur (route start ?)"));
    } finally {
      setBusy(false);
    }
  }

  async function doSetBet() {
    if (!canModerate) return;
    const v = Number(betInp);
    if (!Number.isFinite(v) || v <= 0) {
      setErr("Bet invalide");
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      await callsHuntSetBet(streamerSlug, token, v);
      setBetInp("");
      await load();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur (route bet ?)"));
    } finally {
      setBusy(false);
    }
  }

  async function doReset() {
    if (!canModerate) return;
    const ok = window.confirm("Reset Hunt ? (Start + machines + session seront supprimés)");
    if (!ok) return;

    setErr(null);
    setBusy(true);
    try {
      await callsHuntReset(streamerSlug, token);
      setPayInp("");
      setBetInp("");
      setStartInp("");
      await load();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {err ? <div className="hint">⚠️ {err}</div> : null}

      <Panel
        title={
          <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
            Hunt
            <span
              style={{
                fontSize: 11,
                fontWeight: 950,
                padding: "3px 8px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.10)",
                background: opening ? "rgba(124,77,255,0.14)" : "rgba(0,0,0,0.12)",
              }}
            >
              {opening ? "OUVERTURE" : "FARM"}
            </span>
          </span>
        }
        right={
          canModerate ? (
            <button
              onClick={() => setShowOpts((v) => !v)}
              className="btnGhostInline"
              style={{ padding: "8px 10px", borderRadius: 12, display: "inline-flex", gap: 8, alignItems: "center" }}
              title="Options Hunt"
            >
              <Settings size={16} />
            </button>
          ) : null
        }
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
          <div>
            <div className="muted" style={{ fontSize: 12 }}>Start</div>
            <div style={{ fontWeight: 950 }}>{fmtEur(startEur)}</div>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 12 }}>Calls en cours</div>
            <div style={{ fontWeight: 950 }}>{callsCount}</div>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 12 }}>Bonus drops</div>
            <div style={{ fontWeight: 950 }}>{bonusCount}</div>
          </div>
        </div>

        {/* ✅ Setup start visible direct si pas de start */}
        {canModerate && !hasStart ? (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 14,
              border: "1px solid rgba(124,77,255,0.22)",
              background: "rgba(124,77,255,0.10)",
              display: "flex",
              gap: 10,
              alignItems: "flex-end",
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: "1 1 220px" }}>
              <div style={{ fontWeight: 950, fontSize: 12 }}>Set up a start</div>
              <input
                value={startInp}
                onChange={(e) => setStartInp(e.target.value)}
                placeholder="ex: 200"
                style={{
                  width: "100%",
                  marginTop: 6,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(0,0,0,0.12)",
                  color: "inherit",
                }}
              />
            </div>
            <SmallBtn disabled={busy} onClick={doSetStart} style={{ border: "1px solid rgba(124,77,255,0.45)" }}>
              Valider start
            </SmallBtn>
          </div>
        ) : null}

        {/* Options engrenage */}
        {canModerate && showOpts ? (
          <div
            style={{
              marginTop: 10,
              padding: 12,
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(0,0,0,0.10)",
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "flex-end",
            }}
          >
            <div style={{ flex: "1 1 180px" }}>
              <div style={{ fontWeight: 950, fontSize: 12 }}>Start</div>
              <input
                value={startInp}
                onChange={(e) => setStartInp(e.target.value)}
                placeholder="ex: 200"
                style={{
                  width: "100%",
                  marginTop: 6,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(0,0,0,0.12)",
                  color: "inherit",
                }}
              />
            </div>
            <SmallBtn disabled={busy} onClick={doSetStart}>Set start</SmallBtn>

            <div style={{ flex: "1 1 180px" }}>
              <div style={{ fontWeight: 950, fontSize: 12 }}>Bet</div>
              <input
                value={betInp}
                onChange={(e) => setBetInp(e.target.value)}
                placeholder="ex: 0.20"
                style={{
                  width: "100%",
                  marginTop: 6,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(0,0,0,0.12)",
                  color: "inherit",
                }}
              />
            </div>
            <SmallBtn disabled={busy} onClick={doSetBet}>Set bet</SmallBtn>

            <div style={{ flex: "1 1 100%", height: 1, background: "rgba(255,255,255,0.08)" }} />

            <SmallBtn
              disabled={busy}
              onClick={doReset}
              style={{ border: "1px solid rgba(255,80,80,0.35)", background: "rgba(255,80,80,0.10)" }}
            >
              Reset Hunt
            </SmallBtn>
          </div>
        ) : null}
      </Panel>

      {/* Machine en cours / Bonus en cours */}
      <Panel title={opening ? "Bonus en cours" : "Machine en cours"}>
        {!opening ? (
          currentFarm ? (
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <Thumb url={currentFarm.imageUrl} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 950, fontSize: 14, lineHeight: 1.2 }}>
                  {currentFarm.slotName || "—"}
                  {currentFarm.provider ? <span className="muted"> ({currentFarm.provider})</span> : null}
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                  call par @{currentFarm.username || "?"}
                </div>
              </div>

              {canModerate ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <SmallBtn disabled={busy} onClick={doBonus} style={{ border: "1px solid rgba(124,77,255,0.45)" }}>
                    Bonus
                  </SmallBtn>
                  <SmallBtn disabled={busy} onClick={doPass}>Pass</SmallBtn>
                </div>
              ) : null}
            </div>
          ) : (
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <div className="muted">Aucune machine.</div>
              {canModerate ? (
                <SmallBtn disabled={busy} onClick={doOpen} style={{ border: "1px solid rgba(124,77,255,0.45)" }}>
                  Ouvrir le hunt
                </SmallBtn>
              ) : null}
            </div>
          )
        ) : currentOpen ? (
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Thumb url={currentOpen.imageUrl ?? currentOpen.image_url} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 950, fontSize: 14, lineHeight: 1.2 }}>
                {currentOpen.slotName ?? currentOpen.name ?? "—"}
                {currentOpen.provider ? <span className="muted"> ({currentOpen.provider})</span> : null}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                bet: <b>{fmtEur((currentOpen.betEur ?? currentOpen.bet) ?? 0)}</b>
              </div>
            </div>

            {canModerate ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end" }}>
                <input
                  value={payInp}
                  onChange={(e) => setPayInp(e.target.value)}
                  placeholder="Pay du bonus (ex: 45.20)"
                  style={{
                    width: 220,
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(0,0,0,0.12)",
                    color: "inherit",
                  }}
                />
                <SmallBtn disabled={busy} onClick={doPay} style={{ border: "1px solid rgba(124,77,255,0.45)" }}>
                  Valider
                </SmallBtn>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="muted">Aucun bonus à ouvrir.</div>
        )}
      </Panel>

      {/* Bonus drops */}
      <Panel title={`Bonus drops (${bonusDrops.length})`}>
        {bonusDrops.length === 0 ? (
          <div className="muted">
            Aucun bonus drop pour l’instant.
            <br />
            (Quand une machine a une bet, elle doit apparaître ici.)
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {bonusDrops.map((b: any, idx) => (
              <div
                key={String(b.id ?? `${b.slotName}-${idx}`)}
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
                <Thumb url={b.imageUrl} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 950, fontSize: 13, lineHeight: 1.2 }}>
                    #{idx + 1} — {b.slotName || "—"}
                    {b.provider ? <span className="muted"> ({b.provider})</span> : null}
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    bet: <b>{fmtEur(b.betEur ?? 0)}</b>
                    {Number(b.payEur) >= 0 ? (
                      <span className="muted"> — pay: <b>{fmtEur(b.payEur)}</b></span>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
