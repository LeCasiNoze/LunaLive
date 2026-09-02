import sharp from "sharp";
import type { LunaLiveBlackjack, LunaLiveBlackjackCard } from "./lunalive-api.js";

const WIDTH = 900;
const HEIGHT = 700;
const CARD_WIDTH = 170;
const CARD_HEIGHT = 238;

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
      <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="10" fill="#7217e8" stroke="#b785ff" stroke-width="3" filter="url(#cardShadow)"/>
      <path d="M0 180 L124 0 H170 V56 L46 238 H0Z" fill="#8c2bff" opacity=".9"/>
      <rect x="8" y="8" width="${CARD_WIDTH - 16}" height="${CARD_HEIGHT - 16}" rx="7" fill="none" stroke="#d1b4ff" stroke-width="2" opacity=".7"/>
      <path d="M58 99 H112 V139 H58Z M70 112 H100 M85 99 V139" fill="none" stroke="#220052" stroke-width="9" stroke-linecap="round"/>
    </g>`;
  }
  const red = card.s === "♥" || card.s === "♦";
  const color = red ? "#bf1725" : "#090a0d";
  return `<g transform="translate(${x} ${y})">
    <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="10" fill="#fff" stroke="#e2e4e9" stroke-width="2" filter="url(#cardShadow)"/>
    <text x="85" y="105" text-anchor="middle" fill="${color}" font-size="74" font-weight="800">${xml(card.r)}</text>
    <text x="85" y="198" text-anchor="middle" fill="${color}" font-size="88">${xml(card.s)}</text>
    </g>`;
}

function cardsRow(cards: Array<LunaLiveBlackjackCard | null>, centerX: number, y: number, maxWidth = 840): string {
  const gap = cards.length <= 4 ? 14 : Math.max(-70, Math.floor((maxWidth - cards.length * CARD_WIDTH) / Math.max(1, cards.length - 1)));
  const rowWidth = cards.length * CARD_WIDTH + Math.max(0, cards.length - 1) * gap;
  const startX = centerX - rowWidth / 2;
  return cards.map((card, index) => cardSvg(card, Math.round(startX + index * (CARD_WIDTH + gap)), y, card === null)).join("");
}

export function buildBlackjackSvg(game: LunaLiveBlackjack, _username: string): string {
  const finished = game.status === "finished";
  const dealerScore = finished ? String(game.dealer.total ?? "--") : "?";

  const hands = game.hands.map((hand, index) => {
    const centerX = game.hands.length === 1 ? 450 : (index === 0 ? 230 : 670);
    const scoreColor = hand.total > 21 ? "#ff334d" : hand.active ? "#8851ff" : "#343844";
    const label = game.hands.length === 1 ? `TA MAIN · MISE ${hand.bet}` : `MAIN ${index + 1} · MISE ${hand.bet}`;
    return `<g>
      <text x="${centerX}" y="390" text-anchor="middle" fill="#858a96" font-size="16" font-weight="700" letter-spacing="1.2">${label}${hand.doubled ? " · DOUBLEE" : ""}</text>
      ${cardsRow(hand.cards, centerX, 402, game.hands.length === 1 ? 840 : 410)}
      <rect x="${centerX - 36}" y="648" width="72" height="42" rx="21" fill="${scoreColor}"/>
      <text x="${centerX}" y="677" text-anchor="middle" fill="#fff" font-size="23" font-weight="900">${hand.total}</text>
    </g>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" font-family="DejaVu Sans, sans-serif">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#111318"/><stop offset="1" stop-color="#0c0e12"/></linearGradient>
      <filter id="cardShadow"><feDropShadow dx="0" dy="7" stdDeviation="7" flood-color="#000" flood-opacity=".55"/></filter>
    </defs>
    <rect width="900" height="700" rx="22" fill="url(#bg)"/>
    <text x="450" y="28" text-anchor="middle" fill="#858a96" font-size="15" font-weight="700" letter-spacing="1.4">CROUPIER</text>
    <rect x="414" y="38" width="72" height="42" rx="21" fill="#343844"/>
    <text x="450" y="67" text-anchor="middle" fill="#fff" font-size="23" font-weight="900">${dealerScore}</text>
    ${cardsRow(game.dealer.cards, 450, 90)}
    <path d="M0 344 H900" stroke="#272a32" stroke-width="2"/>
    <path d="M338 326 H562 L548 345 L562 364 H338 L352 345Z" fill="#20232a"/>
    <text x="450" y="350" text-anchor="middle" fill="#9196a2" font-size="13" font-weight="800">BLACKJACK PAIE 3 POUR 2</text>
    ${hands}
  </svg>`;
}

export async function renderBlackjackTable(game: LunaLiveBlackjack, username: string): Promise<Buffer> {
  return sharp(Buffer.from(buildBlackjackSvg(game, username))).png().toBuffer();
}
