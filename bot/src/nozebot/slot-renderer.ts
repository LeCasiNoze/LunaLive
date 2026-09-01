import sharp from "sharp";
import type { LunaLiveSlot } from "./lunalive-api.js";

const LOSERS = ["BAR", "LUNA", "GEM", "NOZE", "★"];

function cellsFor(slot: LunaLiveSlot): string[] {
  if (slot.code === "max") return ["MAX", "MAX", "MAX", "WIN", "WIN", "WIN"];
  if (slot.code === "777") return ["7", "7", "7", "7", "7", "7"];
  if (slot.code === "fucked") return ["F", "U", "C", "K", "E", "D"];
  const compact = slot.art.replaceAll(" ", "").slice(0, 6).padEnd(6, "X");
  let loser = 0;
  return [...compact].map((value) => value === "O" ? "7" : LOSERS[loser++ % LOSERS.length]);
}

function signed(value: number): string {
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toLocaleString("fr-FR")} RUBIS`;
}

export function buildSlotSvg(slot: LunaLiveSlot, username: string): string {
  const cells = cellsFor(slot);
  const accent = slot.net > 0 ? "#45e0a8" : slot.net < 0 ? "#ff5470" : "#e4c866";
  const reels = cells.map((label, index) => {
    const x = 278 + (index % 3) * 220;
    const y = 146 + Math.floor(index / 3) * 142;
    const special = label === "7" || label === "MAX" || label === "WIN";
    return `<g transform="translate(${x} ${y})">
      <rect width="190" height="118" rx="18" fill="#f7f5fb" stroke="${special ? "#b794ff" : "#d7d1e2"}" stroke-width="${special ? 5 : 2}" filter="url(#shadow)"/>
      <text x="95" y="75" text-anchor="middle" fill="${special ? "#6e42c1" : "#211a31"}" font-size="${label.length > 3 ? 31 : 54}" font-weight="900">${label}</text>
    </g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="520" viewBox="0 0 1200 520" font-family="Arial, Helvetica, sans-serif">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0b0911"/><stop offset=".55" stop-color="#191126"/><stop offset="1" stop-color="#0a0810"/></linearGradient>
      <linearGradient id="machine" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#32224e"/><stop offset="1" stop-color="#171121"/></linearGradient>
      <filter id="shadow"><feDropShadow dx="0" dy="7" stdDeviation="7" flood-opacity=".48"/></filter>
      <filter id="glow"><feGaussianBlur stdDeviation="18"/></filter>
    </defs>
    <rect width="1200" height="520" rx="30" fill="url(#bg)"/>
    <circle cx="1040" cy="90" r="120" fill="${accent}" opacity=".12" filter="url(#glow)"/>
    <text x="52" y="64" fill="#fff" font-size="29" font-weight="900" letter-spacing="2">NOZEBOT SLOT</text>
    <text x="52" y="95" fill="#a99dbb" font-size="18">${username} · Mise ${slot.bet} rubis · Solde ${slot.balance.toLocaleString("fr-FR")}</text>
    <rect x="245" y="119" width="710" height="315" rx="34" fill="url(#machine)" stroke="#9d7cff" stroke-width="4"/>
    <circle cx="245" cy="276" r="13" fill="#ff5470"/><circle cx="955" cy="276" r="13" fill="#45e0a8"/>
    ${reels}
    <rect x="392" y="449" width="416" height="48" rx="16" fill="#20172f" stroke="${accent}" stroke-width="2"/>
    <text x="600" y="481" text-anchor="middle" fill="${accent}" font-size="23" font-weight="900">${signed(slot.net)}</text>
    <text x="1148" y="487" text-anchor="end" fill="#766d82" font-size="14">LECASINOZE × LUNALIVE</text>
  </svg>`;
}

export async function renderSlotMachine(slot: LunaLiveSlot, username: string): Promise<Buffer> {
  return sharp(Buffer.from(buildSlotSvg(slot, username))).png().toBuffer();
}
