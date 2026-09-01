import sharp from "sharp";
import type { LunaLiveBlackjack, LunaLiveBlackjackCard } from "./lunalive-api.js";

const WIDTH = 1200;
const HEIGHT = 720;

function xml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function cardSvg(card: LunaLiveBlackjackCard | null, x: number, y: number, hidden = false): string {
  if (!card || hidden) {
    return `<g transform="translate(${x} ${y})">
      <rect width="108" height="150" rx="13" fill="#21163b" stroke="#b794ff" stroke-width="3"/>
      <rect x="9" y="9" width="90" height="132" rx="9" fill="none" stroke="#7650c8" stroke-width="2"/>
      <path d="M18 28 L90 122 M90 28 L18 122 M18 75 H90" stroke="#7650c8" stroke-width="5" opacity=".72"/>
      <circle cx="54" cy="75" r="23" fill="#9d7cff"/><text x="54" y="84" text-anchor="middle" fill="#fff" font-size="24" font-weight="900">N</text>
    </g>`;
  }
  const red = card.s === "♥" || card.s === "♦";
  const color = red ? "#ef4565" : "#171726";
  return `<g transform="translate(${x} ${y})">
    <rect width="108" height="150" rx="13" fill="#fff" stroke="#dedbea" stroke-width="2" filter="url(#shadow)"/>
    <text x="14" y="34" fill="${color}" font-size="25" font-weight="900">${xml(card.r)}</text>
    <text x="14" y="60" fill="${color}" font-size="25">${xml(card.s)}</text>
    <text x="54" y="100" text-anchor="middle" fill="${color}" font-size="54">${xml(card.s)}</text>
    <g transform="rotate(180 54 75)"><text x="14" y="34" fill="${color}" font-size="25" font-weight="900">${xml(card.r)}</text><text x="14" y="60" fill="${color}" font-size="25">${xml(card.s)}</text></g>
  </g>`;
}

function cardsRow(cards: Array<LunaLiveBlackjackCard | null>, startX: number, y: number): string {
  const overlap = cards.length > 6 ? 58 : 76;
  return cards.map((card, index) => cardSvg(card, startX + index * overlap, y, card === null)).join("");
}

function signed(value: number): string {
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toLocaleString("fr-FR")}`;
}

export function buildBlackjackSvg(game: LunaLiveBlackjack, username: string): string {
  const finished = game.status === "finished";
  const result = game.result;
  const accent = !finished ? "#9d7cff" : (result?.totalNet || 0) > 0 ? "#45e0a8" : (result?.totalNet || 0) < 0 ? "#ff5470" : "#e4c866";
  const dealerLabel = finished ? `CROUPIER · ${game.dealer.total ?? "—"}` : "CROUPIER · CARTE CACHÉE";
  const handWidth = game.hands.length === 1 ? 1000 : 510;
  const handStart = game.hands.length === 1 ? 100 : 72;

  const hands = game.hands.map((hand, index) => {
    const x = game.hands.length === 1 ? handStart : handStart + index * 550;
    const activeStroke = hand.active ? "#b794ff" : "#48405e";
    const title = game.hands.length === 1 ? `TA MAIN · ${hand.total}` : `MAIN ${index + 1} · ${hand.total}`;
    return `<g>
      <rect x="${x}" y="390" width="${handWidth}" height="245" rx="26" fill="#171324" stroke="${activeStroke}" stroke-width="${hand.active ? 4 : 2}"/>
      <text x="${x + 28}" y="430" fill="#fff" font-size="23" font-weight="900" letter-spacing="1.5">${title}</text>
      <text x="${x + handWidth - 28}" y="430" text-anchor="end" fill="#b9adc9" font-size="19">MISE ${hand.bet} RUBIS${hand.doubled ? " · DOUBLÉE" : ""}</text>
      ${cardsRow(hand.cards, x + 28, 458)}
    </g>`;
  }).join("");

  const statusText = finished && result
    ? `${result.isNaturalBlackjack && result.perHand[0]?.kind === "win" ? "BLACKJACK · " : ""}${signed(result.totalNet)} RUBIS`
    : game.mode === "plus" ? "BLACKJACK+ · 25 RUBIS" : "CLASSIQUE · 20 RUBIS";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" font-family="Arial, Helvetica, sans-serif">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0c0913"/><stop offset=".5" stop-color="#171026"/><stop offset="1" stop-color="#09080f"/></linearGradient>
      <radialGradient id="felt"><stop stop-color="#153f3b"/><stop offset="1" stop-color="#0a2424"/></radialGradient>
      <filter id="shadow"><feDropShadow dx="0" dy="8" stdDeviation="8" flood-opacity=".45"/></filter>
      <filter id="glow"><feGaussianBlur stdDeviation="14"/></filter>
    </defs>
    <rect width="1200" height="720" rx="30" fill="url(#bg)"/>
    <ellipse cx="600" cy="380" rx="540" ry="300" fill="url(#felt)" stroke="#332852" stroke-width="4"/>
    <ellipse cx="600" cy="380" rx="522" ry="282" fill="none" stroke="#7e5bd1" stroke-width="2" opacity=".45"/>
    <circle cx="1030" cy="90" r="90" fill="${accent}" opacity=".12" filter="url(#glow)"/>
    <text x="52" y="65" fill="#fff" font-size="28" font-weight="900" letter-spacing="2">NOZEBOT BLACKJACK</text>
    <text x="52" y="95" fill="#9d91ae" font-size="18">${xml(username)} · Solde ${game.balance.toLocaleString("fr-FR")} rubis</text>
    <rect x="838" y="45" width="310" height="62" rx="18" fill="#211a31" stroke="${accent}" stroke-width="2"/>
    <text x="993" y="72" text-anchor="middle" fill="#a99dbb" font-size="14" font-weight="700">${finished ? "RÉSULTAT" : "TABLE LUNALIVE"}</text>
    <text x="993" y="94" text-anchor="middle" fill="${accent}" font-size="20" font-weight="900">${xml(statusText)}</text>
    <text x="600" y="150" text-anchor="middle" fill="#d6cee2" font-size="20" font-weight="800" letter-spacing="1.5">${dealerLabel}</text>
    ${cardsRow(game.dealer.cards, 505, 175)}
    ${hands}
    <text x="600" y="685" text-anchor="middle" fill="#776c88" font-size="15">LECASINOZE × LUNALIVE · PARTIE SYNCHRONISÉE</text>
  </svg>`;
}

export async function renderBlackjackTable(game: LunaLiveBlackjack, username: string): Promise<Buffer> {
  return sharp(Buffer.from(buildBlackjackSvg(game, username))).png().toBuffer();
}
