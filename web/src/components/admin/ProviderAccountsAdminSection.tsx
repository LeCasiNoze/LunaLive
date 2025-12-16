import * as React from "react";
import {
  adminListProviderAccounts,
  adminCreateProviderAccount,
  adminAssignProviderAccount,
  adminReleaseProviderAccount,
  adminDeleteProviderAccount,
  adminListUsers,
  getStreamers,
  type AdminProviderAccountRow,
} from "../../lib/api";

function maskUrl(u: string) {
  if (!u) return "";
  return u.length > 46 ? u.slice(0, 46) + "…" : u;
}

export function ProviderAccountsAdminSection({ adminKey }: { adminKey: string }) {
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const [accounts, setAccounts] = React.useState<AdminProviderAccountRow[]>([]);
  const [eligibleStreamers, setEligibleStreamers] = React.useState<
    Array<{ streamerId: string; label: string }>
  >([]);

  // form single add
  const [channelSlug, setChannelSlug] = React.useState("");
  const [rtmpUrl, setRtmpUrl] = React.useState("");
  const [streamKey, setStreamKey] = React.useState("");

  // bulk add
  const [bulk, setBulk] = React.useState("");

  async function refresh() {
    setErr(null);
    const [a, users, streamers] = await Promise.all([
      adminListProviderAccounts(adminKey),
      adminListUsers(adminKey),
      getStreamers(),
    ]);

    setAccounts(a.accounts);

    // streamers map by slug -> id
    const slugToId = new Map<string, string>();
    for (const s of streamers) slugToId.set(String(s.slug), String(s.id));

    // which streamerIds already assigned
    const assigned = new Set<string>();
    for (const acc of a.accounts) {
      if (acc.assignedStreamerId) assigned.add(String(acc.assignedStreamerId));
    }

    // eligible = users role streamer/admin with streamerSlug, and not already assigned
    const eligible: Array<{ streamerId: string; label: string }> = [];
    for (const u of users.users) {
      const isStreamer = u.role === "streamer" || u.role === "admin";
      if (!isStreamer) continue;
      if (!u.streamerSlug) continue;

      const sid = slugToId.get(u.streamerSlug);
      if (!sid) continue;
      if (assigned.has(String(sid))) continue;

      eligible.push({ streamerId: sid, label: `${u.username} (${u.streamerSlug})` });
    }

    eligible.sort((x, y) => x.label.localeCompare(y.label));
    setEligibleStreamers(eligible);
  }

  React.useEffect(() => {
    refresh().catch((e: any) => setErr(String(e?.message || e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey]);

  async function addOne() {
    setBusy(true);
    setErr(null);
    try {
      await adminCreateProviderAccount(adminKey, {
        provider: "dlive",
        channelSlug: channelSlug.trim(),
        rtmpUrl: rtmpUrl.trim(),
        streamKey: streamKey.trim(),
      });
      setChannelSlug("");
      setRtmpUrl("");
      setStreamKey("");
      await refresh();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  function parseBulk(input: string) {
    // format: channelSlug | rtmpUrl | streamKey (separator: "|" or "," or ";")
    const lines = input
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const out: Array<{ channelSlug: string; rtmpUrl: string; streamKey: string }> = [];

    for (const line of lines) {
      const parts = line.includes("|")
        ? line.split("|")
        : line.includes(";")
        ? line.split(";")
        : line.split(",");

      const [a, b, c] = parts.map((p) => String(p || "").trim());
      if (!a || !b || !c) continue;
      out.push({ channelSlug: a, rtmpUrl: b, streamKey: c });
    }

    return out;
  }

  async function addBulk() {
    const items = parseBulk(bulk);
    if (!items.length) {
      setErr("Bulk invalide. Format: channelSlug | rtmpUrl | streamKey (1 par ligne)");
      return;
    }

    setBusy(true);
    setErr(null);
    try {
      for (const it of items) {
        // on insert un par un (MVP). Si un échoue, on continue.
        try {
          await adminCreateProviderAccount(adminKey, {
            provider: "dlive",
            channelSlug: it.channelSlug,
            rtmpUrl: it.rtmpUrl,
            streamKey: it.streamKey,
          });
        } catch {}
      }
      setBulk("");
      await refresh();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel" style={{ marginTop: 14 }}>
      <div className="panelTitle">Comptes DLive (pool)</div>
      <div className="muted" style={{ marginBottom: 10 }}>
        Ajout, assignation, dissociation. Les clés ne sont pas affichées ici (mais stockées en DB).
      </div>

      {err && <div className="hint">⚠️ {err}</div>}

      {/* Add one */}
      <div className="panel" style={{ marginTop: 10 }}>
        <div className="panelTitle">Ajouter un compte</div>

        <div className="field">
          <label>Channel slug</label>
          <input value={channelSlug} onChange={(e) => setChannelSlug(e.target.value)} placeholder="ex: channel-1" />
        </div>

        <div className="field">
          <label>RTMP URL</label>
          <input value={rtmpUrl} onChange={(e) => setRtmpUrl(e.target.value)} placeholder="rtmp://..." />
        </div>

        <div className="field">
          <label>Stream Key</label>
          <input value={streamKey} onChange={(e) => setStreamKey(e.target.value)} placeholder="(secret)" />
        </div>

        <button className="btnPrimary" onClick={addOne} disabled={busy}>
          {busy ? "…" : "Ajouter"}
        </button>
      </div>

      {/* Bulk */}
      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panelTitle">Ajout en masse (50+)</div>
        <div className="mutedSmall" style={{ marginBottom: 8 }}>
          1 ligne = <b>channelSlug | rtmpUrl | streamKey</b>
        </div>

        <div className="field">
          <label>Bulk</label>
          <textarea
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            rows={6}
            placeholder={"channel-1 | rtmp://... | KEY1\nchannel-2 | rtmp://... | KEY2"}
          />
        </div>

        <button className="btnGhost" onClick={addBulk} disabled={busy}>
          {busy ? "…" : "Importer"}
        </button>
      </div>

      {/* List */}
      <div style={{ marginTop: 14 }}>
        <div className="panelTitle">Liste</div>

        {accounts.map((acc) => {
          const isAssigned = !!acc.assignedStreamerId;

          return (
            <div
              key={acc.id}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                padding: "10px 0",
                borderTop: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <b>#{acc.id}</b>{" "}
                  <span className="mutedSmall">
                    {acc.provider} / {acc.channelSlug}
                  </span>
                  <div className="mutedSmall">RTMP: {maskUrl(acc.rtmpUrl)}</div>
                </div>

                {isAssigned ? (
                  <button
                    className="btnGhostSmall"
                    onClick={async () => {
                      await adminReleaseProviderAccount(adminKey, acc.id);
                      await refresh();
                    }}
                    disabled={busy}
                  >
                    Dissocier
                  </button>
                ) : (
                  <button
                    className="btnGhostSmall"
                    onClick={async () => {
                      await adminDeleteProviderAccount(adminKey, acc.id);
                      await refresh();
                    }}
                    disabled={busy}
                  >
                    Supprimer
                  </button>
                )}
              </div>

              <div className="mutedSmall">
                Statut :{" "}
                {isAssigned ? (
                  <>
                    <b>ASSIGNÉ</b> → {acc.assignedUsername || "?"}{" "}
                    <span className="mutedSmall">
                      ({acc.assignedStreamerSlug || "?"})
                    </span>
                  </>
                ) : (
                  <b>LIBRE</b>
                )}
              </div>

              {!isAssigned && (
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <select
                    defaultValue=""
                    onChange={async (e) => {
                      const sid = e.target.value;
                      if (!sid) return;
                      await adminAssignProviderAccount(adminKey, acc.id, sid);
                      await refresh();
                    }}
                  >
                    <option value="">Associer à un streamer…</option>
                    {eligibleStreamers.map((s) => (
                      <option key={s.streamerId} value={s.streamerId}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <span className="mutedSmall">
                    {eligibleStreamers.length ? "" : "Aucun streamer sans compte"}
                  </span>
                </div>
              )}
            </div>
          );
        })}

        {!accounts.length && <div className="mutedSmall">Aucun compte</div>}
      </div>
    </div>
  );
}
