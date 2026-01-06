import * as React from "react";
import { BOT_TEXT_MAX, normalizeMultiline } from "../text";
import { botTestSend } from "../api";

export function TestSendModule({
  token,
  onSent,
}: {
  token: string;
  onSent: () => Promise<void>;
}) {
  const [testBody, setTestBody] = React.useState("Test LunaBot ✅");

  return (
    <div className="panel" style={{ padding: 14, borderRadius: 18 }}>
      <div className="panelTitle">Envoyer un message bot</div>
      <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
        Utile pour valider que le bot “push chat” fonctionne.
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <div style={{ flex: "1 1 360px", minWidth: 240 }}>
          <textarea
            value={testBody}
            onChange={(e) => setTestBody(e.target.value)}
            placeholder="Message"
            maxLength={BOT_TEXT_MAX}
            rows={3}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(0,0,0,0.12)",
              color: "inherit",
              resize: "vertical",
              lineHeight: 1.25,
            }}
          />
          <div
            className="muted"
            style={{
              marginTop: 4,
              fontSize: 12,
              display: "flex",
              justifyContent: "flex-end",
              fontWeight: 900,
              opacity: 0.8,
            }}
          >
            {testBody.length}/{BOT_TEXT_MAX}
          </div>
        </div>

        <button
          className="btnGhostInline"
          onClick={async () => {
            await botTestSend(token, normalizeMultiline(testBody));
            await onSent();
          }}
        >
          Envoyer
        </button>
      </div>
    </div>
  );
}
