// Faits d'offre vérifiés (cartes LeCasiNoze validées, fiches casino consultées le 21/10/2026).
// Ne jamais ajouter de montant ou de condition qui n'est pas confirmé ici.
export type CasinoId = 'rainbet' | 'betportal' | 'celsius';

export type Casino = {
  id: CasinoId;
  name: string;
  rank: number;
  color: string;
  colorSoft: string;
  logo: string;
  affiliate: string;
  code?: string;
  terms: {label: string; url: string}[];
  providers: string[];
  slots?: number;
  // Pastilles de la carte : clé traduite dans ui.ts, valeur neutre (chiffres validés uniquement).
  stats: {k: StatKey; v: string}[];
  badge: BadgeKey;
};
export type StatKey = 'rakeback' | 'claim' | 'race' | 'fs' | 'maxbet' | 'days' | 'deposits' | 'total';
export type BadgeKey = 'code' | 'deposits3' | 'deposits2';

export const CASINOS: Casino[] = [
  {
    id: 'rainbet', name: 'Rainbet', rank: 1, color: '#3d8bff', colorSoft: 'rgba(61,139,255,.16)', logo: '/img/logo-rainbet.png',
    affiliate: 'https://rainbet.com/?r=nivoranet', code: 'NIVORANET',
    terms: [{label: 'Terms', url: 'https://rainbet.com/terms'}, {label: 'VIP', url: 'https://rainbet.com/vip'}],
    // Catalogue LunaLive (slots vues lors du crawl Rainbet, 19/11/2026) : 7 135 slots.
    providers: ['Pragmatic Play', 'Hacksaw', 'NetEnt', 'Red Tiger', 'BGaming', 'Betsoft'],
    slots: 7000,
    stats: [{k: 'rakeback', v: '+20%'}, {k: 'claim', v: '15 min'}, {k: 'race', v: '$200'}],
    badge: 'code',
  },
  {
    id: 'betportal', name: 'Betportal', rank: 2, color: '#1ff25e', colorSoft: 'rgba(31,242,94,.14)', logo: '/img/logo-betportal.png',
    affiliate: 'https://affiliate.betportal.com/visit/?bta=35392&brand=betportal',
    terms: [
      {label: '1st deposit', url: 'https://betportal.com/en/promotions/38'},
      {label: '2nd deposit', url: 'https://betportal.com/en/promotions/37'},
      {label: '3rd deposit', url: 'https://betportal.com/en/promotions/36'},
    ],
    providers: [],
    stats: [{k: 'fs', v: '250'}, {k: 'maxbet', v: '€5'}, {k: 'days', v: '14'}, {k: 'deposits', v: '3'}],
    badge: 'deposits3',
  },
  {
    id: 'celsius', name: 'Celsius', rank: 3, color: '#ff6a3d', colorSoft: 'rgba(255,106,61,.16)', logo: '/img/logo-celsius.png',
    affiliate: 'https://nivoranet.onrender.com/r/lecasinoze-celsius',
    terms: [],
    providers: ['Pragmatic Play', 'Hacksaw Gaming', 'Nolimit City', 'Evolution'],
    stats: [{k: 'total', v: '300%'}, {k: 'deposits', v: '2'}],
    badge: 'deposits2',
  },
];

export const byId = (id: string) => CASINOS.find(c => c.id === id)!;
// Paires des pages comparatives /vs/<a>-vs-<b>/.
export const PAIRS: [CasinoId, CasinoId][] = [['rainbet', 'betportal'], ['rainbet', 'celsius'], ['betportal', 'celsius']];

export const YOUTUBE = 'https://www.youtube.com/@BigWinDailyHits';
export const YT_SUB = 'https://www.youtube.com/@BigWinDailyHits?sub_confirmation=1';
export const TELEGRAM = 'https://t.me/BigWinDailyHits';
export const API = 'https://lunalive-api.onrender.com';
export const TRACK_SLUG = 'bigwindaily';
export const CHECKED = '2026-11-19';
