// web/src/pages/NotFoundPage.tsx
import * as React from "react";
import { Link } from "react-router-dom";
import { setSeo } from "../lib/seo";

export default function NotFoundPage() {
  React.useEffect(() => {
    setSeo({
      title: "Page introuvable — LunaLive",
      description: "Cette page n'existe pas sur LunaLive.",
      path: "/404",
      robots: "noindex,nofollow",
    });
  }, []);

  return (
    <div style={{
      maxWidth: 560,
      margin: "80px auto",
      padding: "40px 20px",
      textAlign: "center",
      fontFamily: "system-ui, sans-serif",
      color: "#e0daf7",
    }}>
      <div style={{ fontSize: 64, lineHeight: 1, marginBottom: 16 }}>404</div>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 12, color: "#c4b5fd" }}>Page introuvable</h1>
      <p style={{ color: "rgba(200,195,240,.60)", marginBottom: 32, lineHeight: 1.6 }}>
        Cette page n'existe pas ou a été déplacée.
      </p>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
        <Link to="/" style={{
          display: "inline-block",
          padding: "10px 20px",
          background: "rgba(124,92,252,.18)",
          border: "1px solid rgba(124,92,252,.32)",
          borderRadius: 12,
          color: "#c4b5fd",
          textDecoration: "none",
          fontWeight: 700,
          fontSize: 14,
        }}>
          📡 Lives
        </Link>
        <Link to="/casinos" style={{
          display: "inline-block",
          padding: "10px 20px",
          background: "rgba(124,92,252,.10)",
          border: "1px solid rgba(124,92,252,.22)",
          borderRadius: 12,
          color: "#a78bfa",
          textDecoration: "none",
          fontWeight: 700,
          fontSize: 14,
        }}>
          🎰 Casinos
        </Link>
        <Link to="/browse" style={{
          display: "inline-block",
          padding: "10px 20px",
          background: "rgba(124,92,252,.10)",
          border: "1px solid rgba(124,92,252,.22)",
          borderRadius: 12,
          color: "#a78bfa",
          textDecoration: "none",
          fontWeight: 700,
          fontSize: 14,
        }}>
          🧭 Browse
        </Link>
      </div>
    </div>
  );
}
