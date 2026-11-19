import type {Lang} from '../i18n';
// Lignes d'aide réelles par langue + une ressource internationale gratuite.
export type Help = {name: string; detail: string; url: string};
const INTL: Help = {name: 'Gambling Therapy', detail: 'Free international online support · gamblingtherapy.org', url: 'https://www.gamblingtherapy.org'};
export const HELP: Record<Lang, Help[]> = {
  en: [
    {name: 'National Gambling Helpline (UK)', detail: '0808 8020 133 · 24/7, free', url: 'https://www.gamcare.org.uk'},
    {name: '1-800-GAMBLER (US)', detail: 'National Council on Problem Gambling', url: 'https://www.ncpgambling.org'},
    {name: 'Gamblers Anonymous', detail: 'Meetings worldwide', url: 'https://www.gamblersanonymous.org'},
    INTL,
  ],
  fr: [
    {name: 'Joueurs Info Service', detail: '09 74 75 13 13 · appel non surtaxé, 7j/7', url: 'https://www.joueurs-info-service.fr'},
    {name: 'Gamblers Anonymous', detail: 'Groupes de parole', url: 'https://www.gamblersanonymous.org'},
    INTL,
  ],
  de: [
    {name: 'BZgA – Check dein Spiel', detail: '0800 1 37 27 00 · kostenlos & anonym', url: 'https://www.check-dein-spiel.de'},
    {name: 'Gamblers Anonymous', detail: 'Selbsthilfegruppen', url: 'https://www.gamblersanonymous.org'},
    INTL,
  ],
  es: [
    {name: 'Jugar Bien', detail: 'Ministerio de Consumo · España', url: 'https://www.jugarbien.es'},
    {name: 'FEJAR', detail: 'Federación Española de Jugadores de Azar Rehabilitados', url: 'https://www.fejar.org'},
    INTL,
  ],
  pt: [
    {name: 'Jogadores Anônimos', detail: 'Grupos de apoio no Brasil', url: 'https://www.jogadoresanonimos.com.br'},
    {name: 'CVV', detail: '188 · apoio emocional gratuito, 24h', url: 'https://www.cvv.org.br'},
    INTL,
  ],
  it: [
    {name: 'Telefono Verde Nazionale', detail: '800 558 822 · gratuito e anonimo (ISS)', url: 'https://www.iss.it'},
    {name: 'Giocatori Anonimi', detail: 'Gruppi di auto-aiuto', url: 'https://www.giocatorianonimi.org'},
    INTL,
  ],
};
