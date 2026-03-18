// web/src/layout/Footer.tsx
import { Link } from "react-router-dom";

export function Footer() {
  return (
    <footer style={{
      width: "100%",
      borderTop: "1px solid rgba(124,92,252,.12)",
      background: "rgba(8,7,18,.72)",
      padding: "20px 16px 24px",
      marginTop: "auto",
    }}>
      <div style={{
        maxWidth: 960,
        margin: "0 auto",
        display: "flex",
        flexWrap: "wrap",
        gap: "8px 20px",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        color: "rgba(180,185,230,.45)",
        fontFamily: "system-ui, sans-serif",
      }}>
        <span style={{ fontWeight: 700, color: "rgba(196,181,253,.55)" }}>LunaLive</span>
        <span aria-hidden>·</span>
        <Link to="/a-propos" style={{ color: "rgba(167,139,250,.55)", textDecoration: "none" }}>À propos</Link>
        <span aria-hidden>·</span>
        <Link to="/mentions-legales" style={{ color: "rgba(167,139,250,.55)", textDecoration: "none" }}>Mentions légales</Link>
        <span aria-hidden>·</span>
        <Link to="/politique-de-confidentialite" style={{ color: "rgba(167,139,250,.55)", textDecoration: "none" }}>Confidentialité</Link>
        <span aria-hidden>·</span>
        <Link to="/cgu" style={{ color: "rgba(167,139,250,.55)", textDecoration: "none" }}>CGU</Link>
        <span aria-hidden>·</span>
        <Link to="/contact" style={{ color: "rgba(167,139,250,.55)", textDecoration: "none" }}>Contact</Link>
        <span aria-hidden>·</span>
        <span style={{ color: "rgba(239,68,68,.55)", fontWeight: 600 }}>18+</span>
        <span>Jouez responsable</span>
        <span aria-hidden>·</span>
        <span>Joueurs Info Service : 09 74 75 13 13</span>
      </div>
    </footer>
  );
}
