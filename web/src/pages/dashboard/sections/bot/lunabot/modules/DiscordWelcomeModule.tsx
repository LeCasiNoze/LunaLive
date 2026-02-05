import * as React from "react";
import { getMyBotDiscordWelcome, setMyBotDiscordWelcome, type ApiBotDiscordWelcome } from "../api";

type Props = {
  token: string;
  onReload?: () => void;
};

const TPL_HINT = `Variables disponibles :
- {user} -> mention (@user)
- {username} -> pseudo
- {server} -> nom du serveur
- {memberCount} -> nb de membres
Tu peux aussi ping un rôle via <@&ROLE_ID>.`;

function FieldLabel({ title, desc }: { title: string; desc?: string }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontWeight: 950, fontSize: 12 }}>{title}</div>
      {desc ? <div className="muted" style={{ fontSize: 12, opacity: 0.75, marginTop: 3 }}>{desc}</div> : null}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  desc,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  desc?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="btnGhostInline"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        width: "100%",
        textAlign: "left",
        padding: "10px 12px",
        borderRadius: 14,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 950, fontSize: 12 }}>{label}</div>
        {desc ? <div className="muted" style={{ fontSize: 12, opacity: 0.75, marginTop: 3 }}>{desc}</div> : null}
      </div>

      <span
        aria-hidden
        style={{
          width: 44,
          height: 26,
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.14)",
          background: checked ? "rgba(60, 240, 180, 0.20)" : "rgba(0,0,0,0.18)",
          position: "relative",
          flex: "0 0 auto",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 3,
            left: checked ? 22 : 4,
            width: 20,
            height: 20,
            borderRadius: 999,
            background: "rgba(255,255,255,0.88)",
            opacity: checked ? 0.95 : 0.75,
            transition: "left .12s ease",
          }}
        />
      </span>
    </button>
  );
}

export function DiscordWelcomeModule({ token, onReload }: Props) {
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const [data, setData] = React.useState<ApiBotDiscordWelcome | null>(null);

  // form state
  const [welcomeEnabled, setWelcomeEnabled] = React.useState(true);
  const [welcomeChannelId, setWelcomeChannelId] = React.useState<string>("");
  const [welcomeMessage, setWelcomeMessage] = React.useState<string>("Bienvenue {user} sur **{server}** !");

  const [goodbyeEnabled, setGoodbyeEnabled] = React.useState(false);
  const [goodbyeChannelId, setGoodbyeChannelId] = React.useState<string>("");
  const [goodbyeMessage, setGoodbyeMessage] = React.useState<string>("{username} a quitté **{server}**.");

  async function reload() {
    if (!token) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await getMyBotDiscordWelcome(token);
      setData(r);

      if (r?.config) {
        setWelcomeEnabled(Boolean(r.config.welcomeEnabled));
        setWelcomeChannelId(r.config.welcomeChannelId ?? "");
        setWelcomeMessage(r.config.welcomeMessage ?? "Bienvenue {user} sur **{server}** !");

        setGoodbyeEnabled(Boolean(r.config.goodbyeEnabled));
        setGoodbyeChannelId(r.config.goodbyeChannelId ?? "");
        setGoodbyeMessage(r.config.goodbyeMessage ?? "{username} a quitté **{server}**.");
      }
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const guildId = data?.guildId ?? null;
  const noGuild = !guildId;

  const dirty =
    (data?.config?.welcomeEnabled ?? true) !== welcomeEnabled ||
    String(data?.config?.welcomeChannelId ?? "") !== welcomeChannelId ||
    String(data?.config?.welcomeMessage ?? "") !== welcomeMessage ||
    (data?.config?.goodbyeEnabled ?? false) !== goodbyeEnabled ||
    String(data?.config?.goodbyeChannelId ?? "") !== goodbyeChannelId ||
    String(data?.config?.goodbyeMessage ?? "") !== goodbyeMessage;

  async function save() {
    if (!token) return;
    setSaving(true);
    setErr(null);
    try {
      const resp = await setMyBotDiscordWelcome(token, {
        welcomeEnabled,
        welcomeChannelId: welcomeChannelId.trim() ? welcomeChannelId.trim() : null,
        welcomeMessage: welcomeMessage.trim() ? welcomeMessage.trim() : null,

        goodbyeEnabled,
        goodbyeChannelId: goodbyeChannelId.trim() ? goodbyeChannelId.trim() : null,
        goodbyeMessage: goodbyeMessage.trim() ? goodbyeMessage.trim() : null,
      });

      setData(resp);
      onReload?.();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div
        style={{
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(0,0,0,0.18)",
          padding: 12,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 1050, fontSize: 14 }}>👋 Welcome / Goodbye</div>
            <div className="muted" style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
              Messages d’arrivée et de départ (config par serveur Discord claim).
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span
              style={{
                padding: "8px 10px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(0,0,0,0.14)",
                fontSize: 12,
                opacity: 0.9,
              }}
            >
              {guildId ? `Guild: ${guildId}` : "Guild: —"}
            </span>

            <button className="btnGhostInline" onClick={() => reload()} disabled={loading || saving}>
              {loading ? "Chargement…" : "Rafraîchir"}
            </button>

            <button
              className="btnPrimary"
              onClick={() => save()}
              disabled={saving || loading || noGuild || !dirty}
              title={noGuild ? "Tu dois d’abord claim un serveur Discord" : dirty ? "Enregistrer" : "Aucun changement"}
            >
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>

        {err ? (
          <div
            style={{
              marginTop: 10,
              padding: "10px 12px",
              borderRadius: 14,
              border: "1px solid rgba(255,90,90,0.22)",
              background: "rgba(255,90,90,0.10)",
              color: "rgba(255,200,200,0.92)",
              fontSize: 12,
              fontWeight: 850,
            }}
          >
            ⚠️ {err}
          </div>
        ) : null}

        {noGuild ? (
          <div
            style={{
              marginTop: 10,
              padding: "10px 12px",
              borderRadius: 14,
              border: "1px solid rgba(255,190,60,0.28)",
              background: "rgba(255,190,60,0.10)",
              color: "rgba(255,235,210,0.92)",
              fontSize: 12,
              fontWeight: 850,
            }}
          >
            🟡 Aucun serveur Discord n’est claim pour ce streamer. Claim un serveur dans “Setup Discord” (ou via ta route
            claim) pour activer cette config.
          </div>
        ) : null}
      </div>

      {/* Welcome */}
      <div
        style={{
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(0,0,0,0.18)",
          padding: 12,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 1050, fontSize: 14 }}>✅ Message de bienvenue</div>
            <div className="muted" style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
              Envoyé quand un membre rejoint.
            </div>
          </div>
        </div>

        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          <Toggle
            checked={welcomeEnabled}
            onChange={setWelcomeEnabled}
            label={welcomeEnabled ? "Activé" : "Désactivé"}
            desc="Active/désactive l’envoi du message."
          />

          <div>
            <FieldLabel
              title="Salon (Channel ID)"
              desc="Colle l’ID du salon Discord (clic droit sur le salon → Copier l’identifiant)."
            />
            <input
              value={welcomeChannelId}
              onChange={(e) => setWelcomeChannelId(e.target.value)}
              placeholder="ex: 1467142148431413370"
              className="llBotSearch"
              style={{ width: "100%" }}
              disabled={!guildId}
            />
          </div>

          <div>
            <FieldLabel title="Texte" desc={TPL_HINT} />
            <textarea
              value={welcomeMessage}
              onChange={(e) => setWelcomeMessage(e.target.value)}
              rows={4}
              className="llBotSearch"
              style={{ width: "100%", height: "auto", padding: 12, borderRadius: 14 }}
              disabled={!guildId}
            />
          </div>

          <div
            style={{
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(0,0,0,0.14)",
              padding: 10,
            }}
          >
            <div style={{ fontWeight: 950, fontSize: 12, marginBottom: 6 }}>Aperçu rapide</div>
            <div className="muted" style={{ fontSize: 12, opacity: 0.8, lineHeight: 1.35 }}>
              {welcomeMessage
                .replaceAll("{user}", "@User")
                .replaceAll("{username}", "User")
                .replaceAll("{server}", "Mon Serveur")
                .replaceAll("{memberCount}", "1234")}
            </div>
          </div>
        </div>
      </div>

      {/* Goodbye */}
      <div
        style={{
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(0,0,0,0.18)",
          padding: 12,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 1050, fontSize: 14 }}>🚪 Message de départ</div>
            <div className="muted" style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
              Envoyé quand un membre quitte.
            </div>
          </div>
        </div>

        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          <Toggle
            checked={goodbyeEnabled}
            onChange={setGoodbyeEnabled}
            label={goodbyeEnabled ? "Activé" : "Désactivé"}
            desc="Par défaut désactivé."
          />

          <div>
            <FieldLabel
              title="Salon (Channel ID)"
              desc="Tu peux mettre un salon staff/admin si tu veux log les départs."
            />
            <input
              value={goodbyeChannelId}
              onChange={(e) => setGoodbyeChannelId(e.target.value)}
              placeholder="ex: 1467xxxxxxxxxxxxxxx"
              className="llBotSearch"
              style={{ width: "100%" }}
              disabled={!guildId}
            />
          </div>

          <div>
            <FieldLabel title="Texte" desc={TPL_HINT} />
            <textarea
              value={goodbyeMessage}
              onChange={(e) => setGoodbyeMessage(e.target.value)}
              rows={4}
              className="llBotSearch"
              style={{ width: "100%", height: "auto", padding: 12, borderRadius: 14 }}
              disabled={!guildId}
            />
          </div>

          <div
            style={{
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(0,0,0,0.14)",
              padding: 10,
            }}
          >
            <div style={{ fontWeight: 950, fontSize: 12, marginBottom: 6 }}>Aperçu rapide</div>
            <div className="muted" style={{ fontSize: 12, opacity: 0.8, lineHeight: 1.35 }}>
              {goodbyeMessage
                .replaceAll("{user}", "@User")
                .replaceAll("{username}", "User")
                .replaceAll("{server}", "Mon Serveur")
                .replaceAll("{memberCount}", "1234")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
