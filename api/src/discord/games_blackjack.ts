// api/src/discord/games_blackjack.ts
export type Suit = "♠" | "♥" | "♦" | "♣";
export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
export type Card = { r: Rank; s: Suit };

export const RANKS: Rank[] = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
export const SUITS: Suit[] = ["♠","♥","♦","♣"];
const RED: Set<Suit> = new Set(["♥","♦"]);
const BLACK: Set<Suit> = new Set(["♠","♣"]);

export function cardVal(r: Rank): number {
  if (r === "A") return 11;
  if (r === "J" || r === "Q" || r === "K") return 10;
  return Number(r);
}

export function handTotal(cards: Card[]): number {
  let tot = 0;
  let aces = 0;
  for (const c of cards) {
    tot += cardVal(c.r);
    if (c.r === "A") aces++;
  }
  while (tot > 21 && aces > 0) {
    tot -= 10;
    aces--;
  }
  return tot;
}

export function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && handTotal(cards) === 21;
}

export type PerfectPairsResult =
  | { kind: "Perfect Pair"; ratio: 25 }
  | { kind: "Colored Pair"; ratio: 12 }
  | { kind: "Mixed Pair"; ratio: 6 };

export function evalPerfectPairs(c1: Card, c2: Card): PerfectPairsResult | null {
  if (c1.r !== c2.r) return null;
  if (c1.s === c2.s) return { kind: "Perfect Pair", ratio: 25 };
  const sameColor = (RED.has(c1.s) && RED.has(c2.s)) || (BLACK.has(c1.s) && BLACK.has(c2.s));
  if (sameColor) return { kind: "Colored Pair", ratio: 12 };
  return { kind: "Mixed Pair", ratio: 6 };
}

const RANK_INDEX: Record<Rank, number> = Object.fromEntries(RANKS.map((r, i) => [r, i])) as any;

function isStraight3(ranks: Rank[]): boolean {
  const idxs = [...ranks].map(r => RANK_INDEX[r]).sort((a,b)=>a-b);
  // A-2-3
  if (idxs[0] === 0 && idxs[1] === 1 && idxs[2] === 2) return true;
  // Q-K-A
  if (idxs[0] === 0 && idxs[1] === 11 && idxs[2] === 12) return true;
  return (idxs[1] - idxs[0] === 1) && (idxs[2] - idxs[1] === 1);
}

export type BJ21P3Result =
  | { kind: "Suited Trips"; ratio: 100 }
  | { kind: "Trips"; ratio: 30 }
  | { kind: "Straight Flush"; ratio: 40 }
  | { kind: "Straight"; ratio: 10 }
  | { kind: "Flush"; ratio: 5 };

export function eval21Plus3(p1: Card, p2: Card, dealerUp: Card): BJ21P3Result | null {
  const ranks: Rank[] = [p1.r, p2.r, dealerUp.r];
  const suits: Suit[] = [p1.s, p2.s, dealerUp.s];

  const trips = (ranks[0] === ranks[1] && ranks[1] === ranks[2]);
  const flush = (suits[0] === suits[1] && suits[1] === suits[2]);
  const straight = isStraight3(ranks);

  if (trips && flush) return { kind: "Suited Trips", ratio: 100 };
  if (trips) return { kind: "Trips", ratio: 30 };
  if (straight && flush) return { kind: "Straight Flush", ratio: 40 };
  if (straight) return { kind: "Straight", ratio: 10 };
  if (flush) return { kind: "Flush", ratio: 5 };
  return null;
}

export type BJHand = {
  cards: Card[];
  bet: number;       // main bet for that hand
  doubled: boolean;
  stood: boolean;
  finished: boolean;
};

export type BJConfig = {
  mainBet: number;      // 20
  pairsBet: number;     // 0 or 3
  plus3Bet: number;     // 0 or 2
};

export type BJGame = {
  cfg: BJConfig;

  deck: Card[];
  dealer: Card[];     // dealer[0]=upcard, dealer[1]=hole (hidden until end), then more draws
  hands: BJHand[];
  active: number;
  finished: boolean;

  sidebetLines: string[];
  sidebetNet: number; // profit net (peut être négatif)
  sidebetPayouts: {
    pairsCredit: number;
    plus3Credit: number;
    plus3Kind: string | null;
  };
  mainNet: number;    // profit net (peut être négatif)
};

export function buildDeck(rng = Math.random): Card[] {
  const deck: Card[] = [];
  for (const r of RANKS) for (const s of SUITS) deck.push({ r, s });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function startGame(cfg: BJConfig, rng = Math.random): BJGame {
  const g: BJGame = {
    cfg,
    deck: buildDeck(rng),
    dealer: [],
    hands: [],
    active: 0,
    finished: false,
    sidebetLines: [],
    sidebetNet: 0,
    sidebetPayouts: { pairsCredit: 0, plus3Credit: 0, plus3Kind: null },
    mainNet: 0,
  };

  const h: BJHand = { bet: cfg.mainBet, cards: [deal(g), deal(g)], doubled: false, stood: false, finished: false };
  g.hands = [h];
  g.dealer = [deal(g), deal(g)]; // up + hole (hole caché UI)
  g.active = 0;

  resolveSideBets(g);
  return g;
}

export function deal(g: BJGame): Card {
  if (!g.deck.length) g.deck = buildDeck();
  return g.deck.pop()!;
}

export function currentHand(g: BJGame): BJHand {
  return g.hands[g.active]!;
}

export function canSplit(g: BJGame): boolean {
  if (g.hands.length !== 1) return false;
  const h = g.hands[0];
  if (h.cards.length !== 2) return false;
  return h.cards[0].r === h.cards[1].r;
}

export function doHit(g: BJGame): { bust: boolean } {
  const h = currentHand(g);
  h.cards.push(deal(g));
  const tot = handTotal(h.cards);
  if (tot > 21) {
    h.finished = true;
    h.stood = true;
    return { bust: true };
  }
  return { bust: false };
}

export function doStand(g: BJGame): void {
  const h = currentHand(g);
  h.stood = true;
  h.finished = true;
}

export function doSplit(g: BJGame): void {
  // precondition: canSplit true
  const h0 = g.hands[0];
  const [a,b] = h0.cards;
  const h1: BJHand = { bet: g.cfg.mainBet, cards: [a, deal(g)], doubled: false, stood: false, finished: false };
  const h2: BJHand = { bet: g.cfg.mainBet, cards: [b, deal(g)], doubled: false, stood: false, finished: false };
  g.hands = [h1, h2];
  g.active = 0;
}

export function doDouble(g: BJGame): { bust: boolean } {
  const h = currentHand(g);
  h.bet *= 2;
  h.doubled = true;
  h.cards.push(deal(g));
  h.stood = true;
  h.finished = true;
  return { bust: handTotal(h.cards) > 21 };
}

function fmt(n: number): string {
  return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
function fmtSigned(n: number): string {
  const a = Math.abs(Math.trunc(n));
  const s = fmt(a);
  return n >= 0 ? `+${s}` : `-${s}`;
}

/**
 * Side bets: calc lignes + sidebetNet (profit net).
 * Le crédit effectif (ratio+1)*bet est géré côté handler (wallet).
 */
export function resolveSideBets(g: BJGame): void {
  const lines: string[] = [];
  let net = 0;
  const payouts = { pairsCredit: 0, plus3Credit: 0, plus3Kind: null as string | null };

  const p = g.hands[0].cards;
  const up = g.dealer[0];

  if (g.cfg.pairsBet > 0) {
    const res = evalPerfectPairs(p[0], p[1]);
    if (res) {
      const profit = g.cfg.pairsBet * res.ratio;
      net += profit;
      payouts.pairsCredit = g.cfg.pairsBet * (res.ratio + 1);
      lines.push(`**Perfect Pairs** — ${res.kind} · ${res.ratio}:1 (profit ${fmtSigned(profit)})`);
    } else {
      net -= g.cfg.pairsBet;
      lines.push(`**Perfect Pairs** — aucun gain (${fmtSigned(-g.cfg.pairsBet)})`);
    }
  }

  if (g.cfg.plus3Bet > 0) {
    const res = eval21Plus3(p[0], p[1], up);
    if (res) {
      const profit = g.cfg.plus3Bet * res.ratio;
      net += profit;
      payouts.plus3Credit = g.cfg.plus3Bet * (res.ratio + 1);
      payouts.plus3Kind = res.kind;
      lines.push(`**21+3** — ${res.kind} · ${res.ratio}:1 (profit ${fmtSigned(profit)})`);
    } else {
      net -= g.cfg.plus3Bet;
      lines.push(`**21+3** — aucun gain (${fmtSigned(-g.cfg.plus3Bet)})`);
    }
  }

  g.sidebetLines = lines;
  g.sidebetNet = net;
  g.sidebetPayouts = payouts;
}

export function nextHandOrEnd(g: BJGame): "next_hand" | "finish" {
  if (g.hands.length === 2 && g.active === 0) {
    g.active = 1;
    return "next_hand";
  }
  return "finish";
}

export function playDealerToEnd(g: BJGame): void {
  // dealer already has up + hole in g.dealer
  while (handTotal(g.dealer) < 17) g.dealer.push(deal(g));
}

export type BJFinish = {
  dealerTotal: number;
  perHand: { i: number; bet: number; total: number; doubled: boolean; kind: "win"|"lose"|"push"|"bust"; net: number }[];
  mainNet: number;
  sideNet: number;
  totalNet: number;
  isNaturalBlackjack: boolean;
};

/**
 * settleMain returns NET profit (assuming bets already debited):
 * - win => net +bet
 * - lose => net -bet
 * - push => net 0
 * - blackjack naturel (main hand only, no split) => net +1.5*bet (3:2)
 *
 * Handler will credit amounts accordingly.
 */
export function settle(g: BJGame): BJFinish {
  const dealerTot = handTotal(g.dealer);

  let mainNet = 0;
  const perHand: BJFinish["perHand"] = [];

  const isNatBJ = (g.hands.length === 1 && isBlackjack(g.hands[0].cards));
  const dealerNatural = isBlackjack(g.dealer);

  for (let idx = 0; idx < g.hands.length; idx++) {
    const h = g.hands[idx];
    const pt = handTotal(h.cards);

    if (pt > 21) {
      mainNet -= h.bet;
      perHand.push({ i: idx+1, bet: h.bet, total: pt, doubled: h.doubled, kind: "bust", net: -h.bet });
      continue;
    }

    // blackjack naturel (uniquement main unique)
    if (isNatBJ && idx === 0) {
      if (dealerNatural) {
        perHand.push({ i: 1, bet: g.cfg.mainBet, total: pt, doubled: false, kind: "push", net: 0 });
        continue;
      }
      const profit = Math.floor(g.cfg.mainBet * 1.5);
      mainNet += profit;
      perHand.push({ i: 1, bet: g.cfg.mainBet, total: pt, doubled: false, kind: "win", net: profit });
      continue;
    }

    if (dealerTot > 21) {
      mainNet += h.bet;
      perHand.push({ i: idx+1, bet: h.bet, total: pt, doubled: h.doubled, kind: "win", net: h.bet });
    } else if (pt > dealerTot) {
      mainNet += h.bet;
      perHand.push({ i: idx+1, bet: h.bet, total: pt, doubled: h.doubled, kind: "win", net: h.bet });
    } else if (pt < dealerTot) {
      mainNet -= h.bet;
      perHand.push({ i: idx+1, bet: h.bet, total: pt, doubled: h.doubled, kind: "lose", net: -h.bet });
    } else {
      perHand.push({ i: idx+1, bet: h.bet, total: pt, doubled: h.doubled, kind: "push", net: 0 });
    }
  }

  g.mainNet = mainNet;
  const totalNet = mainNet + (g.sidebetNet || 0);

  return {
    dealerTotal: dealerTot,
    perHand,
    mainNet,
    sideNet: g.sidebetNet || 0,
    totalNet,
    isNaturalBlackjack: isNatBJ,
  };
}
