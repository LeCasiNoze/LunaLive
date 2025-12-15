export function svgThumb(label: string) {
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
