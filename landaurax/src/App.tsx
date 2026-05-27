import { BrowserRouter, Routes, Route } from "react-router-dom";
import ReferralLandingPage from "./pages/ReferralLandingPage";
import DirectoireePage from "./pages/DirectoireePage";

function Home() {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100dvh", background: "#0b0911", color: "#f6efe0", fontFamily: "'Space Grotesk', sans-serif" }}>
      <div>
        <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.02em" }}>Landaurax</div>
        <div style={{ marginTop: 8, opacity: 0.7 }}>Plateforme de publication de landings</div>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100dvh", background: "#0b0911", color: "#f6efe0", fontFamily: "'Space Grotesk', sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, fontWeight: 800 }}>404</div>
        <div style={{ marginTop: 8, opacity: 0.7 }}>Page introuvable</div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/__directoire" element={<DirectoireePage />} />
        <Route path=":slug" element={<ReferralLandingPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
