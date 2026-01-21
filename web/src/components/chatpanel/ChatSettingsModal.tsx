// web/src/components/chatpanel/ChatSettingsModal.tsx
import type { ChatSettings } from "./chatpanel.helpers";

export function ChatSettingsModal(props: {
  open: boolean;
  canManage: boolean;
  loading: boolean;
  settings: ChatSettings;
  onClose: () => void;
  onToggle: (key: keyof ChatSettings) => Promise<void> | void;
}) {
  const { open, canManage, loading, settings, onClose, onToggle } = props;

  if (!open || !canManage) return null;

  const items: Array<{
    key: keyof ChatSettings;
    title: string;
    desc: string;
    value: boolean;
  }> = [
    { key: "allowLinks", title: "Autoriser les liens", desc: "Bloque les URLs dans les messages.", value: settings.allowLinks },
    { key: "followOnly", title: "Follow-only", desc: "Seuls les followers peuvent parler. (désactive sub-only si activé)", value: settings.followOnly },
    { key: "subOnly", title: "Sub-only", desc: "Seuls les subs actifs peuvent parler. (désactive follow-only si activé)", value: settings.subOnly },
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: 14,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 520,
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(18,14,26,0.98)",
          boxShadow: "0 20px 80px rgba(0,0,0,0.55)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div style={{ fontWeight: 950 }}>Options du chat</div>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 10px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.06)",
              color: "white",
              fontWeight: 900,
              cursor: "pointer",
            }}
            aria-label="Fermer"
            title="Fermer"
          >
            ✕
          </button>
        </div>

        <div style={{ padding: 14 }}>
          <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 800, marginBottom: 10 }}>
            Modérateur / propriétaire / admin uniquement. Les changements sont instantanés.
          </div>

          {items.map((it) => (
            <div
              key={it.key}
              style={{
                padding: 12,
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.04)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 10,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 950 }}>{it.title}</div>
                <div style={{ marginTop: 4, fontSize: 12, opacity: 0.80, fontWeight: 700 }}>{it.desc}</div>
              </div>

              <button
                type="button"
                disabled={loading}
                onClick={() => onToggle(it.key)}
                style={{
                  padding: "10px 12px",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: it.value ? "rgba(80,255,160,0.14)" : "rgba(255,255,255,0.06)",
                  color: "white",
                  fontWeight: 950,
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.7 : 1,
                  whiteSpace: "nowrap",
                  minWidth: 64,
                  textAlign: "center",
                }}
              >
                {loading ? "…" : it.value ? "ON" : "OFF"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
