import sharp from "sharp";
import type { LunaLiveBlackjack, LunaLiveBlackjackCard } from "./lunalive-api.js";

const WIDTH = 1200;
const HEIGHT = 720;
const CARD_WIDTH = 126;
const CARD_HEIGHT = 178;

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
      <path d="M0 134 L92 0 H126 V42 L34 178 H0Z" fill="#8c2bff" opacity=".9"/>
      <rect x="8" y="8" width="${CARD_WIDTH - 16}" height="${CARD_HEIGHT - 16}" rx="7" fill="none" stroke="#d1b4ff" stroke-width="2" opacity=".7"/>
      <path d="M43 74 H83 V104 H43Z M52 84 H74 M63 74 V104" fill="none" stroke="#220052" stroke-width="7" stroke-linecap="round"/>
    </g>`;
  }
  const red = card.s === "♥" || card.s === "♦";
  const color = red ? "#bf1725" : "#090a0d";
  return `<g transform="translate(${x} ${y})">
    <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="10" fill="#fff" stroke="#e2e4e9" stroke-width="2" filter="url(#cardShadow)"/>
    <text x="63" y="77" text-anchor="middle" fill="${color}" font-size="49" font-weight="800">${xml(card.r)}</text>
    <text x="63" y="137" text-anchor="middle" fill="${color}" font-size="57">${xml(card.s)}</text>
    <text x="13" y="26" fill="${color}" font-size="18" font-weight="800">${xml(card.r)}</text>
    <text x="14" y="45" fill="${color}" font-size="19">${xml(card.s)}</text>
    </g>`;
}

function cardsRow(cards: Array<LunaLiveBlackjackCard | null>, centerX: number, y: number, maxWidth = 760): string {
  const gap = cards.length <= 4 ? 14 : Math.max(-45, Math.floor((maxWidth - cards.length * CARD_WIDTH) / Math.max(1, cards.length - 1)));
  const rowWidth = cards.length * CARD_WIDTH + Math.max(0, cards.length - 1) * gap;
  const startX = centerX - rowWidth / 2;
  return cards.map((card, index) => cardSvg(card, Math.round(startX + index * (CARD_WIDTH + gap)), y, card === null)).join("");
}

function signed(value: number): string {
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toLocaleString("fr-FR")}`;
}

export function buildBlackjackSvg(game: LunaLiveBlackjack, username: string): string {
  const finished = game.status === "finished";
  const result = game.result;
  const accent = !finished ? "#9d7cff" : (result?.totalNet || 0) > 0 ? "#45e0a8" : (result?.totalNet || 0) < 0 ? "#ff5470" : "#e4c866";
  const dealerScore = finished ? String(game.dealer.total ?? "--") : "?";

  const hands = game.hands.map((hand, index) => {
    const centerX = game.hands.length === 1 ? 600 : (index === 0 ? 330 : 870);
    const scoreColor = hand.total > 21 ? "#ff334d" : hand.active ? "#8851ff" : "#343844";
    const label = game.hands.length === 1 ? `TA MAIN · MISE ${hand.bet}` : `MAIN ${index + 1} · MISE ${hand.bet}`;
    return `<g>
      <text x="${centerX}" y="424" text-anchor="middle" fill="#858a96" font-size="16" font-weight="700" letter-spacing="1.2">${label}${hand.doubled ? " · DOUBLEE" : ""}</text>
      ${cardsRow(hand.cards, centerX, 444, game.hands.length === 1 ? 800 : 500)}
      <rect x="${centerX - 35}" y="635" width="70" height="40" rx="20" fill="${scoreColor}"/>
      <text x="${centerX}" y="662" text-anchor="middle" fill="#fff" font-size="21" font-weight="900">${hand.total}</text>
    </g>`;
  }).join("");

  const statusText = finished && result
    ? `${result.isNaturalBlackjack && result.perHand[0]?.kind === "win" ? "BLACKJACK · " : ""}${signed(result.totalNet)} RUBIS`
    : game.mode === "plus" ? "BLACKJACK+ · 25 RUBIS" : "CLASSIQUE · 20 RUBIS";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" font-family="DejaVu Sans, sans-serif">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#111318"/><stop offset="1" stop-color="#0c0e12"/></linearGradient>
      <filter id="cardShadow"><feDropShadow dx="0" dy="7" stdDeviation="7" flood-color="#000" flood-opacity=".55"/></filter>
    </defs>
    <rect width="1200" height="720" rx="22" fill="url(#bg)"/>
    <path d="M0 365 H1200" stroke="#272a32" stroke-width="2"/>
    <rect x="24" y="22" width="355" height="58" rx="12" fill="#1b1e25"/>
    <text x="46" y="48" fill="#fff" font-size="18" font-weight="800">${xml(username)}</text>
    <text x="46" y="70" fill="#9297a3" font-size="15">SOLDE · ${game.balance.toLocaleString("fr-FR")} RUBIS</text>
    <rect x="821" y="22" width="355" height="58" rx="12" fill="#1b1e25" stroke="${accent}" stroke-width="2"/>
    <text x="998" y="47" text-anchor="middle" fill="#9297a3" font-size="13" font-weight="700">${finished ? "RESULTAT" : "TABLE LUNALIVE"}</text>
    <text x="998" y="69" text-anchor="middle" fill="${accent}" font-size="18" font-weight="900">${xml(statusText)}</text>
    <text x="600" y="108" text-anchor="middle" fill="#858a96" font-size="15" font-weight="700" letter-spacing="1.4">CROUPIER</text>
    <rect x="565" y="119" width="70" height="40" rx="20" fill="#343844"/>
    <text x="600" y="146" text-anchor="middle" fill="#fff" font-size="21" font-weight="900">${dealerScore}</text>
    ${cardsRow(game.dealer.cards, 600, 176)}
    <g transform="translate(1032 92)">${cardSvg(null, 0, 0, true)}${cardSvg(null, 7, -7, true)}${cardSvg(null, 14, -14, true)}</g>
    <path d="M493 345 H707 L693 365 L707 385 H493 L507 365Z" fill="#20232a"/>
    <text x="600" y="370" text-anchor="middle" fill="#9196a2" font-size="13" font-weight="800">BLACKJACK PAIE 3 POUR 2</text>
    ${hands}
    <text x="25" y="700" fill="#606570" font-size="13">LECASINOZE × LUNALIVE</text>
    <text x="1175" y="700" text-anchor="end" fill="#606570" font-size="13">PARTIE SYNCHRONISEE</text>
  </svg>`;
}

export async function renderBlackjackTable(game: LunaLiveBlackjack, username: string): Promise<Buffer> {
  return sharp(Buffer.from(buildBlackjackSvg(game, username))).png().toBuffer();
}
