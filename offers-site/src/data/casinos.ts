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
  // Faits lus sur les conditions officielles du casino (operator, licence), avec la page et la date du relevé.
  facts?: {operator: string; licence: string; source: string; checked: string};
  slots?: number;
  // Pastilles de la carte : clé traduite dans ui.ts, valeur neutre (chiffres validés uniquement).
  stats: {k: StatKey; v: string}[];
  badge: BadgeKey;
};
export type StatKey = 'rakeback' | 'claim' | 'race' | 'fs' | 'maxbet' | 'days' | 'deposits' | 'total';
export type BadgeKey = 'code' | 'deposits3' | 'deposits4';

export const CASINOS: Casino[] = [
  {
    id: 'rainbet', name: 'Rainbet', rank: 1, color: '#3d8bff', colorSoft: 'rgba(61,139,255,.16)', logo: '/img/logo-rainbet.png',
    affiliate: 'https://rainbet.com/?r=nivoranet', code: 'NIVORANET',
    terms: [{label: 'Terms', url: 'https://rainbet.com/terms'}, {label: 'VIP', url: 'https://rainbet.com/vip'}],
    // Catalogue LunaLive (slots vues lors du crawl Rainbet, 19/11/2026) : 7 135 slots.
    providers: ['Pragmatic Play', 'Hacksaw', 'Nolimit City', 'NetEnt', 'Red Tiger', 'BGaming', 'Betsoft'],
    slots: 7000,
    stats: [{k: 'rakeback', v: '+20%'}, {k: 'claim', v: '15 min'}, {k: 'race', v: '$200'}],
    badge: 'code',
  },
  {
    id: 'celsius', name: 'Celsius', rank: 2, color: '#ff6a3d', colorSoft: 'rgba(255,106,61,.16)', logo: '/img/logo-celsius.png',
    affiliate: 'https://nivoranet.onrender.com/r/lecasinoze-celsius',
    terms: [],
    facts: {operator: 'Celsius Holdings N.V. (reg. 157856), Willemstad, Curaçao', licence: 'Curaçao 365/JAZ (Gaming Services Provider N.V.)', source: 'https://celsiuscasino.com/terms', checked: '2026-11-22'},
    providers: ['Pragmatic Play', 'Hacksaw Gaming', 'Nolimit City', 'Evolution'],
    stats: [{k: 'total', v: '550%'}, {k: 'deposits', v: '4'}],
    badge: 'deposits4',
  },
  {
    id: 'betportal', name: 'Betportal', rank: 3, color: '#1ff25e', colorSoft: 'rgba(31,242,94,.14)', logo: '/img/logo-betportal.png',
    // afp = paramètre libre de la plateforme affiliée (repris dans les rapports et postbacks) ; /go/betportal/ le remplace par son src.
    affiliate: 'https://affiliate.betportal.com/visit/?bta=35392&brand=betportal&afp=site',
    terms: [
      {label: '1st deposit', url: 'https://betportal.com/en/promotions/38'},
      {label: '2nd deposit', url: 'https://betportal.com/en/promotions/37'},
      {label: '3rd deposit', url: 'https://betportal.com/en/promotions/36'},
    ],
    providers: [],
    stats: [{k: 'fs', v: '250'}, {k: 'maxbet', v: '€5'}, {k: 'days', v: '14'}, {k: 'deposits', v: '3'}],
    badge: 'deposits3',
  },
];

export const byId = (id: string) => CASINOS.find(c => c.id === id)!;
// Rainbet exclut l'Allemagne et l'Autriche (CGU 4.1.3) : Celsius passe en tête sur la version allemande.
export const ranked = (lang: string): Casino[] => lang !== 'de' ? CASINOS
  : ['celsius', 'rainbet', 'betportal'].map((id, i) => ({...byId(id), rank: i + 1}));
// Paires des pages comparatives /vs/<a>-vs-<b>/.
export const PAIRS: [CasinoId, CasinoId][] = [['rainbet', 'betportal'], ['rainbet', 'celsius'], ['betportal', 'celsius']];

// Rainbet indexé depuis la décision de Lucas du 22/11/2026, qui accepte le risque de la clause 9.9 des CGU affiliés.
export const NOINDEX: CasinoId[] = [];
export const YOUTUBE = 'https://www.youtube.com/@BigWinDailyHits';
export const YT_SUB = 'https://www.youtube.com/@BigWinDailyHits?sub_confirmation=1';
export const TELEGRAM = 'https://t.me/BigWinDailyHits';
export const API = 'https://lunalive-api.onrender.com';
export const TRACK_SLUG = 'bigwindaily';
export const CHECKED = '2026-11-19';
