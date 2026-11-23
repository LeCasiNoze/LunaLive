import games from './games.json';
import {slug} from './wins';

// Pages « {jeu} max win » : gains vérifiés par le détecteur (games.json, production) face à la fiche officielle du jeu.
// Une page n'existe que si le jeu a une fiche sourcée ci-dessous ET au moins MIN_WINS gains vérifiés.
export const MIN_WINS = 5;

export interface GameWin {streamer: string; platform: string; day: string; multi: number; paid_multi: number; win: number; bet: number; bonus_buy: boolean; casino: string | null}
export interface GameStats {game: string; provider: string; wins: number; best: {multi: number; paid_multi: number; streamer: string; day: string; bonus_buy: boolean}; wins_1000x_by_month: Record<string, number>; top10: GameWin[]}

// Fiche théorique : chiffres de la page officielle de l'éditeur ; sinon au moins 2 sources concordantes, citées (même règle que slots.ts).
export interface Sheet {
  game: string; maxWin: number; rtp: number; volatility?: string; hit?: string; maxOdds?: string; fsOdds?: string; grid: string; released?: string;
  sources: {label: string; url: string; checked: string; covers: string}[];
  about: string;
}

export const SHEETS: Sheet[] = [
  {
    game: 'Gates of Olympus 2500', maxWin: 25000, rtp: 96.51, volatility: 'High', grid: '6×5 · pays anywhere · tumble',
    sources: [
      {label: 'Pragmatic Play, official game page', url: 'https://www.pragmaticplay.com/en/games/gates-of-olympus-2500/', checked: '2026-11-22', covers: 'RTP, grid, multipliers'},
      {label: 'OLBG', url: 'https://www.olbg.com/slots/games/gates-of-olympus-2500', checked: '2026-11-22', covers: 'max win, volatility'},
      {label: 'iGamingToday', url: 'https://www.igamingtoday.com/gates-of-olympus-2500-slot-review/', checked: '2026-11-22', covers: 'max win, volatility'},
    ],
    about: 'Pragmatic Play’s take on Gates of Olympus with multiplier symbols worth up to 2,500x, landing in the base game and in free spins. Four or more scatters start 15 free spins, with a wheel deciding the free spins mode; the super modes raise the minimum multiplier to 10x. Pragmatic’s page lists the RTP but not the max win: the 25,000x figure and the high volatility come from two independent reviews that agree.',
  },
  {
    game: 'Fire in the Hole 4', maxWin: 75000, rtp: 96.01, hit: '22.18%', maxOdds: '1 in 40 million', fsOdds: '1 in 205', grid: '6×6', released: '2026-11-17',
    sources: [
      {label: 'Nolimit City, official game page', url: 'https://www.nolimitcity.com/games/fire-in-the-hole-4/', checked: '2026-11-22', covers: 'all figures'},
    ],
    about: 'The fourth Fire in the Hole from Nolimit City, released on 17 November 2026. Nolimit raises the series’ max win to 75,000 times the bet and puts the odds of reaching it at 1 in 40 million spins. Free spins land about once in 205 spins, and the game has a feature buy.',
  },
];

export const STATS = (games as {games: GameStats[]}).games;
export const generatedAt = (games as {generated_at: string}).generated_at;

export const maxWinPages = () => SHEETS.flatMap(sheet => {
  const stats = STATS.find(g => g.game.toLowerCase() === sheet.game.toLowerCase());
  return stats && stats.wins >= MIN_WINS ? [{id: slug(sheet.game), sheet, stats}] : [];
});
