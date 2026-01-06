// web/src/pages/dashboard/sections/bot/lunabot/modules/ObsWidgetModule.tsx
import * as React from "react";
import {
  obsGetWidgetsConfig,
  obsSaveWidgetsConfig,
  obsSaveViewConfig,
  obsSendTestAlert,
  obsUploadAlertFile,
  type WidgetsConfig,
} from "../obs_api";

const InlineLabel = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 12, fontWeight: 950, opacity: 0.95 }}>{children}</div>
);

type Preset = { name: string; fg: string; bg: string; txt: string };

const FREE_PRESETS: Preset[] = [
  { name: "Night Blue", fg: "#2563eb", bg: "#0b1220", txt: "#ffffff" },
  { name: "Bumblebee", fg: "#fde047", bg: "#0b1220", txt: "#ffffff" },
  { name: "Grape", fg: "#7c3aed", bg: "#1a1224", txt: "#ffffff" },
];

const PREMIUM_PRESETS: Preset[] = [
  { name: "Dark Teal", fg: "#0f766e", bg: "#0a0f10", txt: "#ffffff" },
  { name: "Ocean", fg: "#0e7490", bg: "#0e1b24", txt: "#ffffff" },
  { name: "Sky Light", fg: "#bae6fd", bg: "#ffffff", txt: "#111111" },
  { name: "Rose Light", fg: "#fecaca", bg: "#ffffff", txt: "#111111" },
  { name: "Grape Light", fg: "#e9d5ff", bg: "#ffffff", txt: "#111111" },
  { name: "Glacier", fg: "#c7d2fe", bg: "#f3f4f6", txt: "#111111" },
  { name: "Aqua Paper", fg: "#99f6e4", bg: "#f8fafc", txt: "#111111" },
  { name: "Ash", fg: "#6b7280", bg: "#111827", txt: "#ffffff" },
];

// Animations Follow Goal
const PASSIVE_ANIMS = [
  { id: "none", label: "Aucune" },
  { id: "scanline", label: "Reflet fluide (scanline)" },
  { id: "barber", label: "Rayures diagonales (barber)" },
  { id: "rainbowfill", label: "Remplissage arc-en-ciel animé" },
] as const;

const SPECIAL_ANIMS = [
  { id: "none", label: "Aucune" },
  { id: "confetti", label: "Confettis + badge +1" },
] as const;

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function sh(hex: string) {
  return String(hex || "").replace(/^#/, "");
}

function inputStyle(): React.CSSProperties {
  return {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.22)",
    color: "rgba(255,255,255,0.92)",
    outline: "none",
    fontWeight: 800,
  };
}

function detailsStyle(): React.CSSProperties {
  return {
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.10)",
    padding: 12,
  };
}

function Tabs({
  tab,
  setTab,
}: {
  tab: "goal" | "chat" | "viewers" | "alerts";
  setTab: (t: "goal" | "chat" | "viewers" | "alerts") => void;
}) {
  const items = [
    { k: "goal", label: "Follow Goal" },
    { k: "chat", label: "Chat" },
    { k: "viewers", label: "Viewers" },
    { k: "alerts", label: "Alerts" },
  ] as const;

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {items.map((it) => {
        const active = tab === it.k;
        return (
          <button
            key={it.k}
            type="button"
            className="btnGhostInline"
            onClick={() => setTab(it.k)}
            style={{
              padding: "10px 12px",
              borderRadius: 999,
              fontWeight: 950,
              border: active
                ? "1px solid rgba(124,77,255,0.55)"
                : "1px solid rgba(255,255,255,0.10)",
              background: active ? "rgba(124,77,255,0.14)" : "rgba(0,0,0,0.12)",
            }}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

// ✅ Chat overlay: on ne laisse modifiable que la largeur max
const CHAT_FIXED = {
  scale: 1.6,
  font: 22,
  line: 1.3,
  max_lines: 8,
  life_sec: 0,
} as const;

export function ObsWidgetModule({
  token,
  streamerSlug,
  streamerName,
  userId,
}: {
  token: string;
  streamerSlug: string;
  streamerName: string;
  userId: string | number;
}) {
  // tabs
  const [tab, setTab] = React.useState<"goal" | "chat" | "viewers" | "alerts">("goal");

  // shared colors (goal/viewers)
  const [fg, setFg] = React.useState("#ffffff");
  const [bg, setBg] = React.useState("#1f1f1f");
  const [txt, setTxt] = React.useState("#ffffff");
  const [goalTarget, setGoalTarget] = React.useState<number>(100);

  // chat (✅ seul maxw est modifiable)
  const [maxw, setMaxw] = React.useState(420);

  // valeurs fixes (non modifiables dans la modale)
  const scale = CHAT_FIXED.scale;
  const font = CHAT_FIXED.font;
  const line = CHAT_FIXED.line;
  const chatMax = CHAT_FIXED.max_lines;
  const chatLife = CHAT_FIXED.life_sec;

  // alerts
  const [alertsKind, setAlertsKind] = React.useState<"follow" | "donation">("follow");
  const [alertTpl, setAlertTpl] = React.useState("Merci @{user} pour le follow 💜");
  const [alertImg, setAlertImg] = React.useState<string | null>(null);
  const [alertSound, setAlertSound] = React.useState<string | null>(null);
  const [alertVol, setAlertVol] = React.useState(1);
  const [testing, setTesting] = React.useState(false);
  const [testFollow, setTestFollow] = React.useState("TestFollower");
  const [testDonor, setTestDonor] = React.useState("TestDonor");
  const [testAmount, setTestAmount] = React.useState<number>(1);
  const [testGift, setTestGift] = React.useState("Lemon");

  const [savedMsg, setSavedMsg] = React.useState<string | null>(null);
  const [showUrl, setShowUrl] = React.useState(false);
  const [showAlertUrl, setShowAlertUrl] = React.useState(false);

  const [savingChat, setSavingChat] = React.useState(false);
  const [savingGoal, setSavingGoal] = React.useState(false);
  const [savingViewers, setSavingViewers] = React.useState(false);
  const [savingAlerts, setSavingAlerts] = React.useState(false);

  const lastCfgRef = React.useRef<WidgetsConfig | null>(null);

  // Goal animations
  const [goalAnimPassive, setGoalAnimPassive] = React.useState<string>("none");
  const [goalAnimSpecial, setGoalAnimSpecial] = React.useState<string>("none");
  const [goalAnimEnabled, setGoalAnimEnabled] = React.useState<boolean>(true);

  function flash(msg = "Enregistré ✅") {
    setSavedMsg(msg);
    window.setTimeout(() => setSavedMsg(null), 2000);
  }
  function applyPreset(p: Preset) {
    setFg(p.fg);
    setBg(p.bg);
    setTxt(p.txt);
  }

  // load config on mount (module opens inside modal)
  React.useEffect(() => {
    (async () => {
      try {
        const r = await obsGetWidgetsConfig(token);
        if (!r?.ok || !r.config) return;

        lastCfgRef.current = r.config;

        const a = (r.config as any).alerts || {};
        setAlertImg(a.follow_img ?? null);
        setAlertSound(a.follow_sound ?? null);

        const followTpl = String(a.follow_tpl ?? "Merci @{user} pour le follow 💜");
        const followVol = Number(a.sound_vol ?? 1);

        const donTpl = String(a.donation_tpl ?? "Merci {user} pour {amount} {gift} !");
        const donVol = Number(a.donation_vol ?? 0.9);

        if (alertsKind === "donation") {
          setAlertTpl(donTpl);
          setAlertVol(donVol);
        } else {
          setAlertTpl(followTpl);
          setAlertVol(followVol);
        }

        // Chat (✅ uniquement maxw)
        setMaxw((r.config as any).chat?.maxw ?? 420);

        // Goal
        setFg((r.config as any).goal?.fg ?? "#ffffff");
        setBg((r.config as any).goal?.bg ?? "#1f1f1f");
        setTxt((r.config as any).goal?.txt ?? "#ffffff");
        setGoalTarget(Number((r.config as any).goal?.target ?? 100));

        // Goal animations
        setGoalAnimPassive((r.config as any).goal?.anim_passive ?? "none");
        setGoalAnimSpecial((r.config as any).goal?.anim_special ?? "none");
        setGoalAnimEnabled(Boolean((r.config as any).goal?.anim_enabled ?? true));
      } catch {
        // ignore
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // when alertsKind switches, use cached config
  React.useEffect(() => {
    const cfg = lastCfgRef.current as any;
    if (!cfg) return;
    const a = cfg.alerts || {};
    if (alertsKind === "donation") {
      setAlertTpl(String(a.donation_tpl ?? "Merci {user} pour {amount} {gift} !"));
      setAlertVol(Number(a.donation_vol ?? 0.9));
    } else {
      setAlertTpl(String(a.follow_tpl ?? "Merci @{user} pour le follow 💜"));
      setAlertVol(Number(a.sound_vol ?? 1));
    }
  }, [alertsKind]);

  // debounce sync view-config (comme NozeBot)
  React.useEffect(() => {
    const t = window.setTimeout(() => {
      obsSaveViewConfig(token, {
        scale: CHAT_FIXED.scale,
        font: CHAT_FIXED.font,
        line: CHAT_FIXED.line,
        maxw,
      }).catch(() => {});
    }, 500);
    return () => window.clearTimeout(t);
  }, [token, maxw]);

  // IMPORTANT: les overlays /overlay/obs/*.html sont servis par le WEB (public/), pas par l’API.
  const base =
    typeof window !== "undefined"
      ? String(window.location.origin).replace(/\/+$/, "")
      : "";

  const API_BASE =
    (import.meta.env.VITE_API_BASE as string | undefined) ||
    "https://lunalive-api.onrender.com";

  const uid = String(userId ?? "0");

  // chat url (couleurs = streamer appearance => chat.html fetch /streamer/me/appearance)
  const chatParams = new URLSearchParams();
  chatParams.set("uid", uid);
  chatParams.set("slug", streamerSlug);
  chatParams.set("token", token); // secret
  chatParams.set("api", API_BASE); // permet au HTML statique d'appeler l'API

  // dimensions/affichage
  chatParams.set("mw", String(Math.max(260, maxw || 420)));
  chatParams.set("lh", String(line));
  chatParams.set("scale", String(scale));
  chatParams.set("font", String(font));

  // comportement
  chatParams.set("max", String(Math.max(1, Number(chatMax) || CHAT_FIXED.max_lines)));
  chatParams.set("life", String(Math.max(0, Number(chatLife) || CHAT_FIXED.life_sec)));

  chatParams.set("poll", "8000");

  const chatObsUrl = `${base}/overlay/obs/chat.html?${chatParams.toString()}`;

  const viewersObsUrl =
    `${base}/overlay/obs/viewers.html?uid=${encodeURIComponent(uid)}&slug=${encodeURIComponent(
      streamerSlug
    )}&token=${encodeURIComponent(token)}` +
    `&api=${encodeURIComponent(API_BASE)}` +
    `&name=${encodeURIComponent(streamerName)}&fg=${encodeURIComponent(sh(fg))}&bg=${encodeURIComponent(
      sh(bg)
    )}&pos=br&sec=8&poll=8000`;

  const goalObsUrl =
    `${base}/overlay/obs/follow-goal.html?uid=${encodeURIComponent(uid)}&slug=${encodeURIComponent(
      streamerSlug
    )}&token=${encodeURIComponent(token)}` +
    `&api=${encodeURIComponent(API_BASE)}` +
    `&name=${encodeURIComponent(streamerName)}&step=50&fg=${encodeURIComponent(sh(fg))}&bg=${encodeURIComponent(
      sh(bg)
    )}&txt=${encodeURIComponent(sh(txt))}` +
    `&target=${encodeURIComponent(Math.max(1, Number(goalTarget) || 1))}` +
    `&ap=${encodeURIComponent(goalAnimPassive)}` +
    `&as=${encodeURIComponent(goalAnimSpecial)}` +
    `&ae=${encodeURIComponent(goalAnimEnabled ? 1 : 0)}` +
    `&poll=8000`;

  const alertsObsUrl =
    `${base}/overlay/obs/alerts.html?uid=${encodeURIComponent(uid)}&slug=${encodeURIComponent(
      streamerSlug
    )}&token=${encodeURIComponent(token)}` +
    `&name=${encodeURIComponent(streamerName)}&event=${alertsKind}&poll=8000`;

  function copy(text: string) {
    navigator.clipboard?.writeText(text).then(
      () => flash("URL copiée ✅"),
      () => {
        // eslint-disable-next-line no-alert
        prompt("Copie l’URL :", text);
      }
    );
  }

  async function saveChat() {
    setSavingChat(true);
    try {
      await obsSaveWidgetsConfig(token, {
        chat: {
          maxw,
          // fixes
          scale: CHAT_FIXED.scale,
          font: CHAT_FIXED.font,
          line: CHAT_FIXED.line,
          max_lines: CHAT_FIXED.max_lines,
          life_sec: CHAT_FIXED.life_sec,
        },
      });
      flash("Chat enregistré ✅");
    } catch {
      flash("Erreur lors de l’enregistrement ❌");
    } finally {
      setSavingChat(false);
    }
  }

  async function saveGoal() {
    setSavingGoal(true);
    try {
      await obsSaveWidgetsConfig(token, {
        goal: {
          fg,
          bg,
          txt,
          step: 50,
          compact: 1,
          target: Math.max(1, Number(goalTarget) || 1),
          anim_passive: goalAnimPassive,
          anim_special: goalAnimSpecial,
          anim_enabled: goalAnimEnabled ? 1 : 0,
        },
      });
      flash("Follow Goal enregistré ✅");
    } catch {
      flash("Erreur lors de l’enregistrement ❌");
    } finally {
      setSavingGoal(false);
    }
  }

  async function saveViewers() {
    setSavingViewers(true);
    try {
      await obsSaveWidgetsConfig(token, {
        viewers: { fg, bg, pos: "br", sec: 8 },
      });
      flash("Viewers enregistré ✅");
    } catch {
      flash("Erreur lors de l’enregistrement ❌");
    } finally {
      setSavingViewers(false);
    }
  }

  async function saveAlerts() {
    setSavingAlerts(true);
    try {
      const payload =
        alertsKind === "donation"
          ? { alerts: { donation_tpl: alertTpl, donation_vol: clamp(alertVol, 0, 1) } }
          : { alerts: { follow_tpl: alertTpl, sound_vol: clamp(alertVol, 0, 1) } };

      await obsSaveWidgetsConfig(token, payload as any);
      flash(alertsKind === "donation" ? "Alert Donation enregistrée ✅" : "Alert Follow enregistrée ✅");
    } catch {
      flash("Erreur lors de l’enregistrement ❌");
    } finally {
      setSavingAlerts(false);
    }
  }

  async function uploadAlertFile(kind: "image" | "sound", file: File) {
    const r = await obsUploadAlertFile(token, { kind, event: alertsKind, file });
    if (kind === "image") setAlertImg(r.url);
    else setAlertSound(r.url);
    flash(kind === "image" ? "Image importée ✅" : "Son importé ✅");
  }

  async function testOverlay() {
    setTesting(true);
    try {
      if (alertsKind === "donation") {
        await obsSendTestAlert(token, {
          event: "donation",
          name: (testDonor || "TestDonor").trim(),
          amount: Math.max(0, Number(testAmount || 0)),
          gift: (testGift || "Lemon").trim(),
          uid: Number(uid) || undefined,
        });
      } else {
        await obsSendTestAlert(token, {
          event: "follow",
          name: (testFollow || "TestFollower").trim(),
          uid: Number(uid) || undefined,
        });
      }
      flash("Alerte envoyée ✅");
    } catch {
      flash("Échec d’envoi ❌");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Tabs tab={tab} setTab={setTab} />

      {/* === ALERTS === */}
      {tab === "alerts" && (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btnGhostInline"
              onClick={() => setAlertsKind("follow")}
              style={{
                padding: "10px 12px",
                borderRadius: 999,
                fontWeight: 950,
                border:
                  alertsKind === "follow"
                    ? "1px solid rgba(124,77,255,0.55)"
                    : "1px solid rgba(255,255,255,0.10)",
                background: alertsKind === "follow" ? "rgba(124,77,255,0.14)" : "rgba(0,0,0,0.12)",
              }}
            >
              Follow
            </button>

            <button
              type="button"
              className="btnGhostInline"
              onClick={() => setAlertsKind("donation")}
              style={{
                padding: "10px 12px",
                borderRadius: 999,
                fontWeight: 950,
                border:
                  alertsKind === "donation"
                    ? "1px solid rgba(124,77,255,0.55)"
                    : "1px solid rgba(255,255,255,0.10)",
                background: alertsKind === "donation" ? "rgba(124,77,255,0.14)" : "rgba(0,0,0,0.12)",
              }}
            >
              Donation
            </button>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <InlineLabel>URL OBS — Alerts / {alertsKind === "donation" ? "Donation" : "Follow"}</InlineLabel>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                style={{ ...inputStyle(), flex: 1, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                type={showAlertUrl ? "text" : "password"}
                value={alertsObsUrl}
                readOnly
              />
              <button
                className="btnGhostInline"
                type="button"
                onClick={() => setShowAlertUrl((v) => !v)}
                style={{ borderRadius: 14, padding: "10px 12px", fontWeight: 950 }}
              >
                {showAlertUrl ? "🙈" : "👁"}
              </button>
              <button
                className="btnGhostInline"
                type="button"
                onClick={() => copy(alertsObsUrl)}
                style={{ borderRadius: 14, padding: "10px 12px", fontWeight: 950 }}
              >
                Copier
              </button>
              <button
                className="btnGhostInline"
                type="button"
                onClick={() => window.open(alertsObsUrl, "_blank", "noopener")}
                style={{ borderRadius: 14, padding: "10px 12px", fontWeight: 950 }}
              >
                Ouvrir
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <InlineLabel>Tester {alertsKind === "donation" ? "une donation" : "un follow"}</InlineLabel>

            {alertsKind === "donation" ? (
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                  <input
                    style={inputStyle()}
                    value={testDonor}
                    onChange={(e) => setTestDonor(e.target.value)}
                    placeholder="Nom donateur"
                  />
                  <input
                    style={inputStyle()}
                    type="number"
                    min={0}
                    step={1}
                    value={testAmount}
                    onChange={(e) => setTestAmount(parseInt(e.target.value || "0", 10))}
                    placeholder="Montant"
                  />
                  <input
                    style={inputStyle()}
                    value={testGift}
                    onChange={(e) => setTestGift(e.target.value)}
                    placeholder="Gift (ex: Lemon)"
                  />
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    className="btnGhostInline"
                    type="button"
                    onClick={testOverlay}
                    disabled={testing}
                    style={{
                      borderRadius: 14,
                      padding: "10px 12px",
                      fontWeight: 950,
                      opacity: testing ? 0.7 : 1,
                    }}
                  >
                    {testing ? "Test…" : "Test Donation"}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  style={{ ...inputStyle(), flex: 1 }}
                  value={testFollow}
                  onChange={(e) => setTestFollow(e.target.value)}
                  placeholder="Nom du follower"
                />
                <button
                  className="btnGhostInline"
                  type="button"
                  onClick={testOverlay}
                  disabled={testing}
                  style={{
                    borderRadius: 14,
                    padding: "10px 12px",
                    fontWeight: 950,
                    opacity: testing ? 0.7 : 1,
                  }}
                >
                  {testing ? "Test…" : "Test Follow"}
                </button>
              </div>
            )}
          </div>

          <details style={detailsStyle()}>
            <summary style={{ cursor: "pointer", fontWeight: 950 }}>
              Message automatique ({alertsKind === "donation" ? "Donation" : "Follow"})
            </summary>
            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              <InlineLabel>Template</InlineLabel>
              <input
                style={{ ...inputStyle(), fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                value={alertTpl}
                onChange={(e) => setAlertTpl(e.target.value)}
                placeholder={
                  alertsKind === "donation"
                    ? "Ex: Merci {user} pour {amount} {gift} !"
                    : "Ex: Merci @{user} pour le follow 💜"
                }
              />
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  className="btnGhostInline"
                  type="button"
                  onClick={saveAlerts}
                  disabled={savingAlerts}
                  style={{
                    borderRadius: 14,
                    padding: "10px 12px",
                    fontWeight: 950,
                    opacity: savingAlerts ? 0.7 : 1,
                  }}
                >
                  {savingAlerts ? "Enregistrement…" : "Enregistrer"}
                </button>
              </div>
            </div>
          </details>

          <details style={detailsStyle()}>
            <summary style={{ cursor: "pointer", fontWeight: 950 }}>
              Médias ({alertsKind === "donation" ? "Donation" : "Follow"})
            </summary>

            <div style={{ marginTop: 10, display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gap: 8 }}>
                <InlineLabel>Image (PNG, JPG, WEBP)</InlineLabel>
                <input
                  style={inputStyle()}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={async (e) => {
                    const f = e.currentTarget.files?.[0];
                    if (!f) return;
                    try {
                      await uploadAlertFile("image", f);
                    } finally {
                      e.currentTarget.value = "";
                    }
                  }}
                />
                {alertImg ? (
                  <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.10)", padding: 10 }}>
                    <img src={alertImg} alt="alert" style={{ width: "100%", height: "auto", borderRadius: 10 }} />
                    <div className="muted" style={{ fontSize: 11, marginTop: 6, wordBreak: "break-all" }}>
                      {alertImg}
                    </div>
                  </div>
                ) : (
                  <div className="muted" style={{ fontSize: 12 }}>
                    Aucune image pour l’instant.
                  </div>
                )}
              </div>

              <div style={{ height: 1, background: "rgba(255,255,255,0.10)" }} />

              <div style={{ display: "grid", gap: 8 }}>
                <InlineLabel>Son (MP3, WAV, OGG) + volume</InlineLabel>
                <input
                  style={inputStyle()}
                  type="file"
                  accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg"
                  onChange={async (e) => {
                    const f = e.currentTarget.files?.[0];
                    if (!f) return;
                    try {
                      await uploadAlertFile("sound", f);
                    } finally {
                      e.currentTarget.value = "";
                    }
                  }}
                />
                {alertSound ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    <audio src={alertSound} controls />
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <span className="muted" style={{ fontSize: 12, fontWeight: 900 }}>
                        Volume
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={alertVol}
                        onChange={(e) => setAlertVol(parseFloat(e.target.value))}
                      />
                      <button
                        className="btnGhostInline"
                        type="button"
                        onClick={saveAlerts}
                        disabled={savingAlerts}
                        style={{
                          borderRadius: 14,
                          padding: "10px 12px",
                          fontWeight: 950,
                          opacity: savingAlerts ? 0.7 : 1,
                        }}
                      >
                        {savingAlerts ? "…" : "Sauver volume"}
                      </button>
                    </div>
                    <div className="muted" style={{ fontSize: 11, wordBreak: "break-all" }}>
                      {alertSound}
                    </div>
                  </div>
                ) : (
                  <div className="muted" style={{ fontSize: 12 }}>
                    Aucun son pour l’instant.
                  </div>
                )}
              </div>
            </div>
          </details>

          <div style={{ display: "grid", gap: 8 }}>
            <InlineLabel>Aperçu</InlineLabel>
            <div
              style={{
                borderRadius: 14,
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(0,0,0,0.18)",
              }}
            >
              <iframe
                key={alertsObsUrl}
                src={alertsObsUrl}
                title={`Aperçu Alerts — ${alertsKind}`}
                style={{ width: "100%", height: 160, border: 0 }}
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              L’aperçu charge la même URL que celle à coller dans OBS.
            </div>
          </div>

          <div className="muted" style={{ fontSize: 12, minHeight: 18 }}>
            {savedMsg}
          </div>
        </div>
      )}

      {/* === CHAT === */}
      {tab === "chat" && (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gap: 8 }}>
            <InlineLabel>URL OBS (source Navigateur)</InlineLabel>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                style={{ ...inputStyle(), flex: 1, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                type={showUrl ? "text" : "password"}
                value={chatObsUrl}
                readOnly
              />
              <button
                className="btnGhostInline"
                type="button"
                onClick={() => setShowUrl((v) => !v)}
                style={{ borderRadius: 14, padding: "10px 12px", fontWeight: 950 }}
              >
                {showUrl ? "🙈" : "👁"}
              </button>
              <button
                className="btnGhostInline"
                type="button"
                onClick={() => copy(chatObsUrl)}
                style={{ borderRadius: 14, padding: "10px 12px", fontWeight: 950 }}
              >
                Copier
              </button>
              <button
                className="btnGhostInline"
                type="button"
                onClick={() => window.open(chatObsUrl, "_blank", "noopener")}
                style={{ borderRadius: 14, padding: "10px 12px", fontWeight: 950 }}
              >
                Ouvrir
              </button>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              Couleurs : proviennent du style streamer (Appearance). Ici : uniquement affichage/dimensions.
            </div>
          </div>

          <details style={detailsStyle()} open>
            <summary style={{ cursor: "pointer", fontWeight: 950 }}>Affichage</summary>

            <div
              style={{
                marginTop: 10,
                display: "grid",
                gap: 10,
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              }}
            >
              <div style={{ display: "grid", gap: 6 }}>
                <InlineLabel>Largeur max (px)</InlineLabel>
                <input
                  style={{ ...inputStyle(), fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                  type="number"
                  min={280}
                  max={1400}
                  value={maxw}
                  onChange={(e) => setMaxw(parseInt(e.target.value || "420", 10))}
                />
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <InlineLabel>Recommandations OBS</InlineLabel>
                <ul className="muted" style={{ fontSize: 12, paddingLeft: 18, margin: 0, lineHeight: 1.5 }}>
                  <li>Source Navigateur : <b>850 × 1000</b></li>
                  <li>Place le bas du chat au <b>bas du cadre</b></li>
                  <li>Ancre <b>bas-gauche</b> puis <b>crop le haut</b> si besoin</li>
                </ul>
              </div>
            </div>
          </details>

          <div style={{ display: "grid", gap: 8 }}>
            <InlineLabel>Aperçu</InlineLabel>
            <div
              style={{
                borderRadius: 14,
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(0,0,0,0.18)",
              }}
            >
              <iframe
                key={chatObsUrl}
                src={chatObsUrl}
                title="Aperçu Chat"
                style={{ width: "100%", height: 180, border: 0 }}
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <div className="muted" style={{ fontSize: 12, minHeight: 18 }}>
              {savedMsg}
            </div>
            <button
              className="btnGhostInline"
              type="button"
              onClick={saveChat}
              disabled={savingChat}
              style={{ borderRadius: 14, padding: "10px 12px", fontWeight: 950, opacity: savingChat ? 0.7 : 1 }}
            >
              {savingChat ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
      )}

      {/* === GOAL === */}
      {tab === "goal" && (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gap: 8 }}>
            <InlineLabel>URL OBS (source Navigateur)</InlineLabel>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                style={{ ...inputStyle(), flex: 1, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                type={showUrl ? "text" : "password"}
                value={goalObsUrl}
                readOnly
              />
              <button
                className="btnGhostInline"
                type="button"
                onClick={() => setShowUrl((v) => !v)}
                style={{ borderRadius: 14, padding: "10px 12px", fontWeight: 950 }}
              >
                {showUrl ? "🙈" : "👁"}
              </button>
              <button
                className="btnGhostInline"
                type="button"
                onClick={() => copy(goalObsUrl)}
                style={{ borderRadius: 14, padding: "10px 12px", fontWeight: 950 }}
              >
                Copier
              </button>
              <button
                className="btnGhostInline"
                type="button"
                onClick={() => window.open(goalObsUrl, "_blank", "noopener")}
                style={{ borderRadius: 14, padding: "10px 12px", fontWeight: 950 }}
              >
                Ouvrir
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gap: 6, maxWidth: 320 }}>
            <InlineLabel>Objectif (target)</InlineLabel>
            <input
              style={{ ...inputStyle(), fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
              type="number"
              min={1}
              value={goalTarget}
              onChange={(e) => setGoalTarget(Math.max(1, parseInt(e.target.value || "1", 10)))}
            />
            <div className="muted" style={{ fontSize: 12 }}>
              Nombre de follows visé (ex. 250).
            </div>
          </div>

          <details style={detailsStyle()}>
            <summary style={{ cursor: "pointer", fontWeight: 950 }}>Couleurs</summary>

            <div style={{ marginTop: 10, display: "grid", gap: 12 }}>
              <div>
                <div
                  className="muted"
                  style={{ fontSize: 11, fontWeight: 950, letterSpacing: 0.6, textTransform: "uppercase" }}
                >
                  Presets (remplissage / fond / texte)
                </div>

                <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                  Gratuit
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                  {FREE_PRESETS.map((p) => (
                    <button
                      key={`goal-free-${p.name}`}
                      className="btnGhostInline"
                      type="button"
                      onClick={() => applyPreset(p)}
                      style={{ borderRadius: 14, padding: "10px 12px", fontWeight: 950 }}
                      title={`${p.name} — fg:${p.fg} bg:${p.bg} txt:${p.txt}`}
                    >
                      <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                        <span style={{ width: 14, height: 14, borderRadius: 4, background: p.fg }} />
                        <span
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: 4,
                            background: p.bg,
                            border: "1px solid rgba(255,255,255,0.18)",
                          }}
                        />
                        <span
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: 4,
                            background: p.txt,
                            border: "1px solid rgba(255,255,255,0.18)",
                          }}
                        />
                        {p.name}
                      </span>
                    </button>
                  ))}
                </div>

                <div style={{ height: 1, background: "rgba(255,255,255,0.10)", margin: "12px 0" }} />

                <div className="muted" style={{ fontSize: 12 }}>
                  Premium
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                  {PREMIUM_PRESETS.map((p) => (
                    <button
                      key={`goal-pro-${p.name}`}
                      className="btnGhostInline"
                      type="button"
                      onClick={() => applyPreset(p)}
                      style={{ borderRadius: 14, padding: "10px 12px", fontWeight: 950 }}
                      title={`${p.name} — fg:${p.fg} bg:${p.bg} txt:${p.txt}`}
                    >
                      <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                        <span style={{ width: 14, height: 14, borderRadius: 4, background: p.fg }} />
                        <span
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: 4,
                            background: p.bg,
                            border: "1px solid rgba(255,255,255,0.18)",
                          }}
                        />
                        <span
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: 4,
                            background: p.txt,
                            border: "1px solid rgba(255,255,255,0.18)",
                          }}
                        />
                        {p.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div
                  className="muted"
                  style={{ fontSize: 11, fontWeight: 950, letterSpacing: 0.6, textTransform: "uppercase" }}
                >
                  Couleurs personnalisées
                </div>

                <div
                  style={{
                    marginTop: 10,
                    display: "grid",
                    gap: 10,
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  }}
                >
                  <div style={{ display: "grid", gap: 6 }}>
                    <InlineLabel>Remplissage</InlineLabel>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        type="color"
                        value={fg}
                        onChange={(e) => setFg(e.target.value)}
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.12)",
                          background: "transparent",
                        }}
                      />
                      <input
                        style={{ ...inputStyle(), fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                        value={fg}
                        onChange={(e) => setFg(e.target.value)}
                      />
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 6 }}>
                    <InlineLabel>Fond</InlineLabel>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        type="color"
                        value={bg}
                        onChange={(e) => setBg(e.target.value)}
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.12)",
                          background: "transparent",
                        }}
                      />
                      <input
                        style={{ ...inputStyle(), fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                        value={bg}
                        onChange={(e) => setBg(e.target.value)}
                      />
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 6 }}>
                    <InlineLabel>Texte</InlineLabel>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        type="color"
                        value={txt}
                        onChange={(e) => setTxt(e.target.value)}
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.12)",
                          background: "transparent",
                        }}
                      />
                      <input
                        style={{ ...inputStyle(), fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                        value={txt}
                        onChange={(e) => setTxt(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </details>

          <details style={detailsStyle()}>
            <summary style={{ cursor: "pointer", fontWeight: 950 }}>Animations</summary>

            <div style={{ marginTop: 10, display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gap: 8 }}>
                <InlineLabel>Animation passive</InlineLabel>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {PASSIVE_ANIMS.map((a) => {
                    const active = goalAnimPassive === a.id;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        className="btnGhostInline"
                        onClick={() => setGoalAnimPassive(active && a.id !== "none" ? "none" : a.id)}
                        style={{
                          borderRadius: 14,
                          padding: "10px 12px",
                          fontWeight: 950,
                          border: active ? "1px solid rgba(124,77,255,0.55)" : "1px solid rgba(255,255,255,0.10)",
                          background: active ? "rgba(124,77,255,0.14)" : "rgba(0,0,0,0.12)",
                        }}
                        title={active ? "Cliquer pour désactiver" : a.label}
                      >
                        {active ? `✅ ${a.label}` : a.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ height: 1, background: "rgba(255,255,255,0.10)" }} />

              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <InlineLabel>Animation spéciale “+1”</InlineLabel>
                  <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontWeight: 900, fontSize: 12, opacity: 0.9 }}>
                    <input type="checkbox" checked={goalAnimEnabled} onChange={(e) => setGoalAnimEnabled(e.target.checked)} />
                    Activer
                  </label>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {SPECIAL_ANIMS.map((a) => {
                    const active = goalAnimSpecial === a.id;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        className="btnGhostInline"
                        onClick={() => setGoalAnimSpecial(active && a.id !== "none" ? "none" : a.id)}
                        style={{
                          borderRadius: 14,
                          padding: "10px 12px",
                          fontWeight: 950,
                          border: active ? "1px solid rgba(124,77,255,0.55)" : "1px solid rgba(255,255,255,0.10)",
                          background: active ? "rgba(124,77,255,0.14)" : "rgba(0,0,0,0.12)",
                        }}
                        title={active ? "Cliquer pour désactiver" : a.label}
                      >
                        {active ? `✅ ${a.label}` : a.label}
                      </button>
                    );
                  })}
                </div>

                <div className="muted" style={{ fontSize: 12 }}>
                  Les animations spéciales se jouent automatiquement lors d’un nouveau follow (+1).
                </div>
              </div>
            </div>
          </details>

          <div style={{ display: "grid", gap: 8 }}>
            <InlineLabel>Aperçu</InlineLabel>
            <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid rgba(255,255,255,0.10)", background: "rgba(0,0,0,0.18)" }}>
              <iframe
                key={goalObsUrl}
                src={`${goalObsUrl}&compact=1`}
                title="Aperçu Follow Goal"
                style={{ width: "100%", height: 160, border: 0 }}
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div className="muted" style={{ fontSize: 12, minHeight: 18 }}>
              {savedMsg}
            </div>
            <button className="btnGhostInline" type="button" onClick={saveGoal} disabled={savingGoal} style={{ borderRadius: 14, padding: "10px 12px", fontWeight: 950, opacity: savingGoal ? 0.7 : 1 }}>
              {savingGoal ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
      )}

      {/* === VIEWERS === */}
      {tab === "viewers" && (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gap: 8 }}>
            <InlineLabel>URL OBS (source Navigateur)</InlineLabel>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                style={{ ...inputStyle(), flex: 1, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                type={showUrl ? "text" : "password"}
                value={viewersObsUrl}
                readOnly
              />
              <button className="btnGhostInline" type="button" onClick={() => setShowUrl((v) => !v)} style={{ borderRadius: 14, padding: "10px 12px", fontWeight: 950 }}>
                {showUrl ? "🙈" : "👁"}
              </button>
              <button className="btnGhostInline" type="button" onClick={() => copy(viewersObsUrl)} style={{ borderRadius: 14, padding: "10px 12px", fontWeight: 950 }}>
                Copier
              </button>
              <button className="btnGhostInline" type="button" onClick={() => window.open(viewersObsUrl, "_blank", "noopener")} style={{ borderRadius: 14, padding: "10px 12px", fontWeight: 950 }}>
                Ouvrir
              </button>
            </div>
          </div>

          <details style={detailsStyle()}>
            <summary style={{ cursor: "pointer", fontWeight: 950 }}>Couleurs rapides</summary>

            <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
              <div>
                <div className="muted" style={{ fontSize: 11, fontWeight: 950, letterSpacing: 0.6, textTransform: "uppercase" }}>
                  Gratuit
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                  {FREE_PRESETS.map((p) => (
                    <button
                      key={`vw-free-${p.name}`}
                      className="btnGhostInline"
                      type="button"
                      onClick={() => {
                        setFg(p.fg);
                        setBg(p.bg);
                      }}
                      style={{ borderRadius: 14, padding: "10px 12px", fontWeight: 950 }}
                      title={`${p.name} — fg:${p.fg} bg:${p.bg}`}
                    >
                      <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                        <span style={{ width: 14, height: 14, borderRadius: 4, background: p.fg }} />
                        <span style={{ width: 14, height: 14, borderRadius: 4, background: p.bg, border: "1px solid rgba(255,255,255,0.18)" }} />
                        {p.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ height: 1, background: "rgba(255,255,255,0.10)" }} />

              <div>
                <div className="muted" style={{ fontSize: 11, fontWeight: 950, letterSpacing: 0.6, textTransform: "uppercase" }}>
                  Premium
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                  {PREMIUM_PRESETS.map((p) => (
                    <button
                      key={`vw-pro-${p.name}`}
                      className="btnGhostInline"
                      type="button"
                      onClick={() => {
                        setFg(p.fg);
                        setBg(p.bg);
                      }}
                      style={{ borderRadius: 14, padding: "10px 12px", fontWeight: 950 }}
                      title={`${p.name} — fg:${p.fg} bg:${p.bg}`}
                    >
                      <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                        <span style={{ width: 14, height: 14, borderRadius: 4, background: p.fg }} />
                        <span style={{ width: 14, height: 14, borderRadius: 4, background: p.bg, border: "1px solid rgba(255,255,255,0.18)" }} />
                        {p.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </details>

          <details style={detailsStyle()}>
            <summary style={{ cursor: "pointer", fontWeight: 950 }}>Couleurs personnalisées</summary>

            <div style={{ marginTop: 10, display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              <div style={{ display: "grid", gap: 6 }}>
                <InlineLabel>Texte</InlineLabel>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="color" value={fg} onChange={(e) => setFg(e.target.value)} style={{ width: 44, height: 44, borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", background: "transparent" }} />
                  <input style={{ ...inputStyle(), fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }} value={fg} onChange={(e) => setFg(e.target.value)} />
                </div>
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <InlineLabel>Fond</InlineLabel>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} style={{ width: 44, height: 44, borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", background: "transparent" }} />
                  <input style={{ ...inputStyle(), fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }} value={bg} onChange={(e) => setBg(e.target.value)} />
                </div>
              </div>
            </div>
          </details>

          <div style={{ display: "grid", gap: 8 }}>
            <InlineLabel>Aperçu</InlineLabel>
            <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid rgba(255,255,255,0.10)", background: "rgba(0,0,0,0.18)" }}>
              <iframe
                key={viewersObsUrl}
                src={`${viewersObsUrl}&compact=1`}
                title="Aperçu Viewers"
                style={{ width: "100%", height: 150, border: 0 }}
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div className="muted" style={{ fontSize: 12, minHeight: 18 }}>
              {savedMsg}
            </div>
            <button className="btnGhostInline" type="button" onClick={saveViewers} disabled={savingViewers} style={{ borderRadius: 14, padding: "10px 12px", fontWeight: 950, opacity: savingViewers ? 0.7 : 1 }}>
              {savingViewers ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
