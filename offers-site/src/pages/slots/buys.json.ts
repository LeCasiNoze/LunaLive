import type {APIRoute} from 'astro';
import {SLOTS, maxBuy} from '../../data/slots';
// Table « jeu → bonus acheté le plus cher » (en multiples de la mise) pour le vérificateur des clips.
// cost null = prix non publié par l'éditeur ; max_buy null tant qu'un prix manque.
export const GET: APIRoute = () => new Response(JSON.stringify({
  note: 'Bonus buy prices in multiples of the base bet, from official provider data only. null = not published by the provider, never estimated.',
  games: SLOTS.map(s => ({id: s.id, name: s.name, provider: s.provider, max_win: s.maxWin, buys: s.buys, max_buy: maxBuy(s), source: s.source, checked: s.checked})),
}, null, 1), {headers: {'Content-Type': 'application/json; charset=utf-8'}});
