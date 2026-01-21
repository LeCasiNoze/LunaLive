// web/src/components/ReportModal.tsx
import * as React from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthProvider";
import {
  createReport,
  type ReportKind,
  type ReportTarget,
  type ReportAttachment,
} from "../lib/api_reports";

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function readFileAsDataUrl(file: File): Promise<{
  dataUrl: string;
  mime: string;
  size: number;
  name: string;
}> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("file_read_failed"));
    r.onload = () =>
      resolve({
        dataUrl: String(r.result || ""),
        mime: file.type || "image/png",
        size: file.size,
        name: file.name,
      });
    r.readAsDataURL(file);
  });
}

export function ReportModal({
  open,
  onClose,
  preset,
}: {
  open: boolean;
  onClose: () => void;
  preset?: { kind?: ReportKind; target?: ReportTarget } | null;
}) {
  const authAny = useAuth() as any;
  const token = authAny?.token as string | null;

  const target = preset?.target;

  const [kind, setKind] = React.useState<ReportKind>(preset?.kind ?? "report");
  const [category, setCategory] = React.useState<string>("spam");
  const [subject, setSubject] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [attachments, setAttachments] = React.useState<ReportAttachment[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [okMsg, setOkMsg] = React.useState<string | null>(null);
  const [errMsg, setErrMsg] = React.useState<string | null>(null);

  const catsReport = [
    ["spam", "Spam / pub"],
    ["harassment", "Harcèlement / toxicité"],
    ["scam", "Arnaque / phishing"],
    ["cheating", "Triche / exploit"],
    ["underage", "Mineur / contenu interdit"],
    ["other", "Autre"],
  ] as const;

  const catsFeedback = [
    ["bug", "Bug"],
    ["suggestion", "Suggestion"],
    ["uiux", "UI / UX"],
    ["performance", "Perf / lags"],
    ["other", "Autre"],
  ] as const;

  const catList = kind === "feedback" ? catsFeedback : catsReport;
  const maxScreens = 3;

  React.useEffect(() => {
    if (!open) return;

    setOkMsg(null);
    setErrMsg(null);
    setBusy(false);

    const nextKind = preset?.kind ?? "report";
    setKind(nextKind);

    // catégorie par défaut selon kind
    const nextCategory = nextKind === "feedback" ? "suggestion" : "spam";
    setCategory(nextCategory);

    // sujet auto si cible connue
    const tUser = target?.username ? `@${target.username}` : "";
    const tSlug = target?.slug ? `(${target.slug})` : "";
    const auto =
      target?.username || target?.slug
        ? `${nextKind === "feedback" ? "Suggestion" : "Signalement"} ${tUser} ${tSlug}`.trim()
        : "";
    setSubject(auto);

    setDescription("");
    setAttachments([]);
  }, [open, preset?.kind, target?.username, target?.slug]);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function onPickFiles(files: FileList | null) {
    if (!files) return;
    setErrMsg(null);

    const room = clamp(maxScreens - attachments.length, 0, maxScreens);
    const arr = Array.from(files).slice(0, room);
    if (!arr.length) return;

    try {
      const mapped = await Promise.all(arr.map(readFileAsDataUrl));

      // soft limit: évite les énormes screenshots (base64 gonfle)
      const filtered = mapped
        .filter((x) => x.dataUrl.startsWith("data:image/"))
        .filter((x) => x.dataUrl.length <= 2_600_000)
        .map((x) => ({ name: x.name, dataUrl: x.dataUrl, mime: x.mime, size: x.size }));

      setAttachments((prev) => [...prev, ...filtered].slice(0, maxScreens));
    } catch {
      setErrMsg("Impossible de lire l’image. Réessaie avec un fichier plus petit.");
    }
  }

  function removeAttachment(i: number) {
    setAttachments((prev) => prev.filter((_, idx) => idx !== i));
  }

  function validate(): string | null {
    if (!token) return "Tu dois être connecté pour envoyer un signalement/retour.";
    if (!subject.trim()) return "Le sujet est requis.";
    if (!description.trim()) return "La description est requise.";
    return null;
  }

  async function onSubmit() {
    const v = validate();
    if (v) {
      setErrMsg(v);
      return;
    }

    setBusy(true);
    setErrMsg(null);
    setOkMsg(null);

    try {
      const payload = {
        kind,
        category,
        subject: subject.trim().slice(0, 140),
        description: description.trim().slice(0, 4000),
        target: target ?? undefined,
        attachments,
      };

      const r = await createReport(token as string, payload);
      setOkMsg(`Merci ! Envoyé (#${r.id}).`);

      // Petit reset, mais on garde la modale ouverte pour feedback visuel
      setDescription("");
      setAttachments([]);
    } catch {
      setErrMsg("Erreur lors de l’envoi. Réessaie.");
    } finally {
      setBusy(false);
    }
  }

  const title = kind === "feedback" ? "💡 Retour / Suggestion" : "⚑ Signalement";
  const hint =
    kind === "report"
      ? "Décris ce qu’il s’est passé (contexte, où, quand). Si possible, ajoute des détails utiles."
      : "Explique l’idée ou le bug, et si possible comment le reproduire.";

  return createPortal(
    <div
      className="llReportOverlay"
      role="dialog"
      aria-modal="true"
      aria-label="Signalement / Retour"
      onMouseDown={(e) => {
        // click overlay => close (mais pas si click dans la card)
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <style>{`
        .llReportOverlay{
          position: fixed; inset: 0; z-index: 2000;
          background: rgba(0,0,0,0.58);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          display: grid;
          place-items: center;
          padding: 18px;
        }

        .llReportCard{
          width: min(920px, 100%);
          max-height: min(86vh, 980px);
          overflow: auto;
          border-radius: 22px;
          border: 1px solid rgba(255,255,255,0.12);
          background:
            radial-gradient(1100px 280px at 12% 0%, rgba(140,90,255,0.22), rgba(0,0,0,0) 60%),
            radial-gradient(1000px 280px at 88% 0%, rgba(255,90,180,0.12), rgba(0,0,0,0) 55%),
            rgba(10,12,18,0.94);
          box-shadow: 0 30px 120px rgba(0,0,0,0.60);
        }

        .llReportHead{
          position: sticky; top: 0; z-index: 2;
          padding: 14px 16px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          background: rgba(10,12,18,0.78);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          display:flex; align-items:center; justify-content:space-between; gap: 10px;
        }
        .llReportTitle{ font-weight: 1100; letter-spacing: -0.2px; }
        .llReportClose{
          height: 36px; padding: 0 12px; border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.05);
          color: inherit; cursor:pointer; font-weight: 1100;
        }
        .llReportClose:hover{ background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.18); }

        .llReportBody{ padding: 16px; }
        .llRow{ display:flex; gap: 12px; flex-wrap: wrap; align-items: flex-end; }
        .llField{ flex: 1 1 260px; min-width: 240px; }

        .llLabel{ font-size: 12px; opacity: .78; margin: 0 0 6px; }
        .llInput, .llSelect, .llTextarea{
          width: 100%;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.92);
          padding: 10px 12px;
          font-weight: 750;
          outline: none;
        }
        .llInput::placeholder, .llTextarea::placeholder{ color: rgba(255,255,255,0.45); }

        .llInput:focus, .llSelect:focus, .llTextarea:focus{
          border-color: rgba(140,90,255,0.45);
          box-shadow: 0 0 0 3px rgba(140,90,255,0.16);
        }

        .llTextarea{
          min-height: 170px;
          resize: vertical;
          font-weight: 650;
          line-height: 1.35;
        }

        .llHint{
          font-size: 12px;
          opacity: .70;
          margin-top: 6px;
        }

        .llTargetPill{
          display:inline-flex; align-items:center; gap: 8px;
          height: 34px; padding: 0 12px; border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.05);
          font-weight: 900; font-size: 13px;
        }

        .llDivider{
          margin: 14px 0;
          height: 1px;
          background: rgba(255,255,255,0.08);
        }

        .llBtn{
          height: 40px; padding: 0 14px; border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.05);
          color: inherit; cursor:pointer; font-weight: 1100;
          display:inline-flex; align-items:center; gap: 8px;
        }
        .llBtn:hover{ background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.18); }
        .llBtn:disabled{ opacity: .55; cursor: not-allowed; transform: none; }

        .llBtnPrimary{
          border-color: rgba(140,90,255,0.22);
          background: linear-gradient(90deg, rgba(140,90,255,0.34), rgba(80,160,255,0.22), rgba(255,90,180,0.16));
          box-shadow: 0 18px 50px rgba(0,0,0,0.25);
        }
        .llBtnPrimary:hover{ filter: brightness(1.06); }

        .llMsgOk{
          margin-top: 10px; padding: 10px 12px; border-radius: 14px;
          border: 1px solid rgba(120,255,180,0.22);
          background: rgba(120,255,180,0.08);
          font-weight: 900;
        }
        .llMsgErr{
          margin-top: 10px; padding: 10px 12px; border-radius: 14px;
          border: 1px solid rgba(255,90,180,0.22);
          background: rgba(255,90,180,0.10);
          font-weight: 900;
        }

        /* ✅ Fix dropdowns: éviter le fond blanc + options lisibles */
        .llSelect{
          appearance: none;
          -webkit-appearance: none;
          -moz-appearance: none;
          padding-right: 38px;
          background-image:
            linear-gradient(45deg, transparent 50%, rgba(255,255,255,0.78) 50%),
            linear-gradient(135deg, rgba(255,255,255,0.78) 50%, transparent 50%),
            radial-gradient(circle at 50% 50%, rgba(255,255,255,0.16), rgba(0,0,0,0));
          background-position:
            calc(100% - 18px) 16px,
            calc(100% - 12px) 16px,
            calc(100% - 20px) 50%;
          background-size: 6px 6px, 6px 6px, 22px 22px;
          background-repeat: no-repeat;
        }

        /* Très important: les options héritent pas forcément du theme -> forcer */
        .llSelect option{
          background: rgb(12, 14, 20);
          color: rgba(255,255,255,0.92);
        }

        .llAttachRow{ display:flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
        .llThumbWrap{
          position: relative;
          width: 128px;
        }
        .llThumb{
          width: 128px; height: 92px; object-fit: cover;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.03);
          display:block;
        }
        .llThumbDel{
          position:absolute;
          top: 6px; right: 6px;
          width: 28px; height: 28px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(0,0,0,0.45);
          color: rgba(255,255,255,0.92);
          cursor: pointer;
          display:grid;
          place-items:center;
          font-weight: 1100;
        }
        .llThumbDel:hover{
          background: rgba(255,90,180,0.18);
          border-color: rgba(255,90,180,0.28);
        }

        @media (max-width: 520px){
          .llField{ min-width: 100%; }
          .llReportBody{ padding: 14px; }
        }
      `}</style>

      <div className="llReportCard">
        <div className="llReportHead">
          <div className="llReportTitle">{title}</div>
          <button className="llReportClose" onClick={onClose}>
            Fermer
          </button>
        </div>

        <div className="llReportBody">
          {!!(target?.username || target?.slug) && (
            <div
              style={{
                marginBottom: 12,
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <span className="llTargetPill">
                🎯 Cible: {target?.username ? `@${target.username}` : target?.slug}
              </span>
              {target?.url && (
                <span
                  className="llHint"
                  title={target.url}
                  style={{
                    maxWidth: 560,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {target.url}
                </span>
              )}
            </div>
          )}

          <div className="llRow">
            <div className="llField">
              <div className="llLabel">Type</div>
              <select
                className="llSelect"
                value={kind}
                onChange={(e) => setKind(e.target.value === "feedback" ? "feedback" : "report")}
              >
                <option value="report">Signalement</option>
                <option value="feedback">Retour / Suggestion</option>
              </select>
              <div className="llHint">Même écran, catégories adaptées.</div>
            </div>

            <div className="llField">
              <div className="llLabel">Catégorie</div>
              <select
                className="llSelect"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {catList.map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
              <div className="llHint">Choisis le plus proche, même si c’est “Autre”.</div>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div className="llLabel">Sujet</div>
            <input
              className="llInput"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Ex: Spam en chat / Bug sur la page Lives..."
              maxLength={140}
            />
            <div className="llHint">
              {subject.trim().length}/140
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div className="llLabel">Description</div>
            <textarea
              className="llTextarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={hint}
              maxLength={4000}
            />
            <div className="llHint">
              Astuce: pour un bug, ajoute “Étapes pour reproduire” + “Résultat attendu” + “Résultat obtenu”.
              <span style={{ float: "right", opacity: 0.75 }}>
                {description.trim().length}/4000
              </span>
            </div>
          </div>

          <div className="llDivider" />

          <div>
            <div className="llLabel">Screenshots (optionnel, {attachments.length}/{maxScreens})</div>

            <div className="llRow" style={{ alignItems: "center" }}>
              <label className="llBtn" style={{ cursor: "pointer" }}>
                📷 Ajouter
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: "none" }}
                  onChange={(e) => onPickFiles(e.target.files)}
                />
              </label>

              <button
                className="llBtn"
                onClick={() => setAttachments([])}
                disabled={!attachments.length}
                title="Retirer les images"
              >
                🧹 Vider
              </button>

              <div className="llHint" style={{ margin: 0 }}>
                Limite: 3 images. Si une image est trop lourde, réduis-la.
              </div>
            </div>

            {!!attachments.length && (
              <div className="llAttachRow">
                {attachments.map((a, i) => (
                  <div className="llThumbWrap" key={i}>
                    <img className="llThumb" src={a.dataUrl} alt={a.name} />
                    <button
                      className="llThumbDel"
                      onClick={() => removeAttachment(i)}
                      title="Supprimer"
                      aria-label="Supprimer l'image"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ marginTop: 16, display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button className="llBtn" onClick={onClose} disabled={busy}>
              Annuler
            </button>
            <button className="llBtn llBtnPrimary" onClick={onSubmit} disabled={busy}>
              {busy ? "Envoi..." : "Envoyer"}
            </button>
          </div>

          {okMsg && <div className="llMsgOk">{okMsg}</div>}
          {errMsg && <div className="llMsgErr">{errMsg}</div>}
        </div>
      </div>
    </div>,
    document.body
  );
}
