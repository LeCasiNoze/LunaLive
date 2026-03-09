export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
export const SUITS = ["♠", "♥", "♦", "♣"];
const RED = new Set(["♥", "♦"]);
const BLACK = new Set(["♠", "♣"]);
export function cardVal(r) {
    if (r === "A")
        return 11;
    if (r === "J" || r === "Q" || r === "K")
        return 10;
    return Number(r);
}
export function handTotal(cards) {
    let tot = 0;
    let aces = 0;
    for (const c of cards) {
        tot += cardVal(c.r);
        if (c.r === "A")
            aces++;
    }
    while (tot > 21 && aces > 0) {
        tot -= 10;
        aces--;
    }
    return tot;
}
export function isBlackjack(cards) {
    return cards.length === 2 && handTotal(cards) === 21;
}
export function evalPerfectPairs(c1, c2) {
    if (c1.r !== c2.r)
        return null;
    if (c1.s === c2.s)
        return { kind: "Perfect Pair", ratio: 25 };
    const sameColor = (RED.has(c1.s) && RED.has(c2.s)) || (BLACK.has(c1.s) && BLACK.has(c2.s));
    if (sameColor)
        return { kind: "Colored Pair", ratio: 12 };
    return { kind: "Mixed Pair", ratio: 6 };
}
const RANK_INDEX = Object.fromEntries(RANKS.map((r, i) => [r, i]));
function isStraight3(ranks) {
    const idxs = [...ranks].map(r => RANK_INDEX[r]).sort((a, b) => a - b);
    // A-2-3
    if (idxs[0] === 0 && idxs[1] === 1 && idxs[2] === 2)
        return true;
    // Q-K-A
    if (idxs[0] === 0 && idxs[1] === 11 && idxs[2] === 12)
        return true;
    return (idxs[1] - idxs[0] === 1) && (idxs[2] - idxs[1] === 1);
}
export function eval21Plus3(p1, p2, dealerUp) {
    const ranks = [p1.r, p2.r, dealerUp.r];
    const suits = [p1.s, p2.s, dealerUp.s];
    const trips = (ranks[0] === ranks[1] && ranks[1] === ranks[2]);
    const flush = (suits[0] === suits[1] && suits[1] === suits[2]);
    const straight = isStraight3(ranks);
    if (trips && flush)
        return { kind: "Suited Trips", ratio: 100 };
    if (trips)
        return { kind: "Trips", ratio: 30 };
    if (straight && flush)
        return { kind: "Straight Flush", ratio: 40 };
    if (straight)
        return { kind: "Straight", ratio: 10 };
    if (flush)
        return { kind: "Flush", ratio: 5 };
    return null;
}
export function buildDeck(rng = Math.random) {
    const deck = [];
    for (const r of RANKS)
        for (const s of SUITS)
            deck.push({ r, s });
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}
export function startGame(cfg, rng = Math.random) {
    const g = {
        cfg,
        deck: buildDeck(rng),
        dealer: [],
        hands: [],
        active: 0,
        finished: false,
        sidebetLines: [],
        sidebetNet: 0,
        mainNet: 0,
    };
    const h = { bet: cfg.mainBet, cards: [deal(g), deal(g)], doubled: false, stood: false, finished: false };
    g.hands = [h];
    g.dealer = [deal(g), deal(g)]; // up + hole (hole caché UI)
    g.active = 0;
    resolveSideBets(g);
    return g;
}
export function deal(g) {
    if (!g.deck.length)
        g.deck = buildDeck();
    return g.deck.pop();
}
export function currentHand(g) {
    return g.hands[g.active];
}
export function canSplit(g) {
    if (g.hands.length !== 1)
        return false;
    const h = g.hands[0];
    if (h.cards.length !== 2)
        return false;
    return h.cards[0].r === h.cards[1].r;
}
export function doHit(g) {
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
export function doStand(g) {
    const h = currentHand(g);
    h.stood = true;
    h.finished = true;
}
export function doSplit(g) {
    // precondition: canSplit true
    const h0 = g.hands[0];
    const [a, b] = h0.cards;
    const h1 = { bet: g.cfg.mainBet, cards: [a, deal(g)], doubled: false, stood: false, finished: false };
    const h2 = { bet: g.cfg.mainBet, cards: [b, deal(g)], doubled: false, stood: false, finished: false };
    g.hands = [h1, h2];
    g.active = 0;
}
export function doDouble(g) {
    const h = currentHand(g);
    h.bet *= 2;
    h.doubled = true;
    h.cards.push(deal(g));
    h.stood = true;
    h.finished = true;
    return { bust: handTotal(h.cards) > 21 };
}
function fmt(n) {
    return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
function fmtSigned(n) {
    const a = Math.abs(Math.trunc(n));
    const s = fmt(a);
    return n >= 0 ? `+${s}` : `-${s}`;
}
/**
 * Side bets: calc lignes + sidebetNet (profit net).
 * Le crédit effectif (ratio+1)*bet est géré côté handler (wallet).
 */
export function resolveSideBets(g) {
    const lines = [];
    let net = 0;
    const p = g.hands[0].cards;
    const up = g.dealer[0];
    if (g.cfg.pairsBet > 0) {
        const res = evalPerfectPairs(p[0], p[1]);
        if (res) {
            const profit = g.cfg.pairsBet * res.ratio;
            net += profit;
            lines.push(`**Perfect Pairs** — ${res.kind} · ${res.ratio}:1 (profit ${fmtSigned(profit)})`);
        }
        else {
            net -= g.cfg.pairsBet;
            lines.push(`**Perfect Pairs** — aucun gain (${fmtSigned(-g.cfg.pairsBet)})`);
        }
    }
    if (g.cfg.plus3Bet > 0) {
        const res = eval21Plus3(p[0], p[1], up);
        if (res) {
            const profit = g.cfg.plus3Bet * res.ratio;
            net += profit;
            lines.push(`**21+3** — ${res.kind} · ${res.ratio}:1 (profit ${fmtSigned(profit)})`);
        }
        else {
            net -= g.cfg.plus3Bet;
            lines.push(`**21+3** — aucun gain (${fmtSigned(-g.cfg.plus3Bet)})`);
        }
    }
    g.sidebetLines = lines;
    g.sidebetNet = net;
}
export function nextHandOrEnd(g) {
    if (g.hands.length === 2 && g.active === 0) {
        g.active = 1;
        return "next_hand";
    }
    return "finish";
}
export function playDealerToEnd(g) {
    // dealer already has up + hole in g.dealer
    while (handTotal(g.dealer) < 17)
        g.dealer.push(deal(g));
}
/**
 * settleMain returns NET profit (assuming bets already debited):
 * - win => net +bet
 * - lose => net -bet
 * - push => net 0
 * - blackjack naturel (main hand only, no split) => net +1.5*bet (3:2)
 *
 * Handler will credit amounts accordingly.
 */
export function settle(g) {
    const dealerTot = handTotal(g.dealer);
    let mainNet = 0;
    const perHand = [];
    const isNatBJ = (g.hands.length === 1 && isBlackjack(g.hands[0].cards));
    for (let idx = 0; idx < g.hands.length; idx++) {
        const h = g.hands[idx];
        const pt = handTotal(h.cards);
        if (pt > 21) {
            mainNet -= h.bet;
            perHand.push({ i: idx + 1, bet: h.bet, total: pt, doubled: h.doubled, kind: "bust", net: -h.bet });
            continue;
        }
        // blackjack naturel (uniquement main unique)
        if (isNatBJ && idx === 0) {
            const profit = Math.floor(g.cfg.mainBet * 1.5);
            mainNet += profit;
            perHand.push({ i: 1, bet: g.cfg.mainBet, total: pt, doubled: false, kind: "win", net: profit });
            continue;
        }
        if (dealerTot > 21) {
            mainNet += h.bet;
            perHand.push({ i: idx + 1, bet: h.bet, total: pt, doubled: h.doubled, kind: "win", net: h.bet });
        }
        else if (pt > dealerTot) {
            mainNet += h.bet;
            perHand.push({ i: idx + 1, bet: h.bet, total: pt, doubled: h.doubled, kind: "win", net: h.bet });
        }
        else if (pt < dealerTot) {
            mainNet -= h.bet;
            perHand.push({ i: idx + 1, bet: h.bet, total: pt, doubled: h.doubled, kind: "lose", net: -h.bet });
        }
        else {
            perHand.push({ i: idx + 1, bet: h.bet, total: pt, doubled: h.doubled, kind: "push", net: 0 });
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
