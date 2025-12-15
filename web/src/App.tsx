import React from "react";
import { NavLink, Route, Routes } from "react-router-dom";

type LiveCard = {
  id: string;
  streamer: string;
  title: string;
  viewers: number;
  thumb: string;
};

function svgThumb(label: string) {
  const safe = encodeURIComponent(label);
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#1D1125"/>
        <stop offset="0.55" stop-color="#7E4CB3"/>
        <stop offset="1" stop-color="#3F56CB"/>
      </linearGradient>
      <filter id="n" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>
        <feColorMatrix type="matrix" values="
          1 0 0 0 0
          0 1 0 0 0
          0 0 1 0 0
          0 0 0 0.18 0"/>
      </filter>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <rect width="100%" height="100%" filter="url(#n)"/>
    <g opacity="0.9">
      <circle cx="980" cy="240" r="160" fill="#FFFFFF" opacity="0.07"/>
      <circle cx="1040" cy="210" r="120" fill="#FFFFFF" opacity="0.06"/>
      <circle cx="910" cy="290" r="90" fill="#FFFFFF" opacity="0.05"/>
    </g>
    <text x="60" y="640" fill="#FFFFFF" font-size="64" font-family="system-ui, -apple-system, Segoe UI, Roboto" opacity="0.9">${safe}</text>
    <text x="60" y="690" fill="#FFFFFF" font-size="28" font-family="system-ui, -apple-system, Segoe UI, Roboto" opacity="0.55">Preview (placeholder)</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const MOCK_LIVES: LiveCard[] = [
  { id: "1", streamer: "Wayzebi", title: "Slots session — bonus hunt", viewers: 842, thumb: svgThumb("Wayzebi") },
  { id: "2", streamer: "Sinisterzs", title: "Morning grind — chill", viewers: 510, thumb: svgThumb("Sinisterzs") },
  { id: "3", streamer: "NicoCarasso", title: "Big balance / risky spins", viewers: 321, thumb: svgThumb("NicoCarasso") },
  { id: "4", streamer: "Teoman", title: "Community picks — let’s go", viewers: 205, thumb: svgThumb("Teoman") },
  { id: "5", streamer: "BryanCars", title: "Late session — last shots", viewers: 96, thumb: svgThumb("BryanCars") },
];

function formatViewers(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

function Topbar() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `navItem ${isActive ? "active" : ""}`;

  return (
    <header className="topbar">
      <div className="brand">
        <div className="brandMark" aria-hidden />
        <div className="brandName">LunaLive</div>
      </div>

      <nav className="nav">
        <NavLink to="/" end className={linkClass}>Lives</NavLink>
        <NavLink to="/streamers" className={linkClass}>Streamers</NavLink>
        <NavLink to="/profile" className={linkClass}>Profile</NavLink>
      </nav>

      <div className="right">
        <div className="pill" title="Rubis (placeholder)">💎 <span>1,250</span></div>
        <button className="btn">Se connecter</button>
      </div>
    </header>
  );
}

function LivesPage() {
  const lives = React.useMemo(
    () => [...MOCK_LIVES].sort((a, b) => b.viewers - a.viewers),
    []
  );

  return (
    <main className="container">
      <div className="pageTitle">
        <h1>Lives</h1>
        <p className="muted">Triés par viewers (mock). Les previews seront remplacées par les vraies thumbnails.</p>
      </div>

      <section className="grid">
        {lives.map((live) => (
          <article key={live.id} className="card">
            <div className="thumb" style={{ backgroundImage: `url("${live.thumb}")` }}>
              <div className="liveBadge">LIVE</div>
              <div className="viewerBadge">{formatViewers(live.viewers)} viewers</div>
              <div className="overlay">
                <div className="streamer">{live.streamer}</div>
                <div className="title">{live.title}</div>
              </div>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

function StreamersPage() {
  return (
    <main className="container">
      <div className="pageTitle">
        <h1>Streamers</h1>
        <p className="muted">Placeholder — demain on mettra une grille + recherche.</p>
      </div>
    </main>
  );
}

function ProfilePage() {
  return (
    <main className="container">
      <div className="pageTitle">
        <h1>Profile</h1>
        <p className="muted">Placeholder — ici on mettra login, rubis, settings.</p>
      </div>
    </main>
  );
}

export default function App() {
  return (
    <div className="app">
      <Topbar />
      <Routes>
        <Route path="/" element={<LivesPage />} />
        <Route path="/streamers" element={<StreamersPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Routes>
    </div>
  );
}
