// web/src/components/botmenu/SlotThumb.tsx
import * as React from "react";

export function SlotThumb({ url, size = 34 }: { url?: string | null; size?: number }) {
  const [broken, setBroken] = React.useState(false);

  const boxStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: 12,
    flex: "0 0 auto",
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.06)",
    overflow: "hidden",
    display: "grid",
    placeItems: "center",
  };

  if (!url || broken) {
    return (
      <div style={boxStyle} aria-hidden="true" title="🎰">
        <span style={{ fontSize: 16, opacity: 0.9 }}>🎰</span>
      </div>
    );
  }

  return (
    <div style={boxStyle} aria-hidden="true">
      <img
        src={url}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
        }}
      />
    </div>
  );
}
