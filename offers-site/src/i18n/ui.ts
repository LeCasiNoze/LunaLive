import type {Lang} from './index';

// Textes de l'interface « app » (menu, bandeau, cartes, contrôle d'âge). Le contenu éditorial reste dans <lang>.ts.
const en = {
  channelTag: 'The biggest slot wins from live streams',
  subscribe: 'Subscribe',
  heroKicker: 'Bonus hub',
  heroA: 'The bonuses', heroB: 'behind the big wins',
  heroSub: 'The casinos and codes we actually use. Every rule in plain words – no fake ratings, no fine print.',
  heroCta: 'Get the #1 bonus',
  offersTitle: 'Casino offers', offersCount: '{n} offers',
  play: 'Play now', noCode: 'No code needed', code: 'Code', details: 'Details', review: 'Review', top: 'Top pick',
  stat: {rakeback: 'Rakeback', claim: 'Claim every', race: 'Monthly race', fs: 'Free spins', maxbet: 'Max bet', days: 'Days to wager', deposits: 'Deposits', total: 'Total bonus'},
  badge: {code: 'Code NIVORANET', deposits3: 'Over 3 deposits', deposits2: 'Over 2 deposits'},
  ticker: 'Monthly wager race $200',
  winsTitle: 'Watch the biggest wins of the day', winsSub: 'Daily Top 5 · Weekly Top 10 · Monthly Top 30', winsCta: 'Open the channel',
  nav: {home: 'Home', offers: 'Casino bonuses', guide: 'Bonus guide', rg: 'Play responsibly', about: 'About us', more: 'Learn', page: 'Pages'},
  age: {title: 'Are you 18 or older?', text: 'This site shows casino bonus offers and is for adults only. Gambling can be addictive – play responsibly.', yes: 'Yes, I am 18+', no: 'No'},
};
type UI = typeof en;

const fr: UI = {
  channelTag: 'Les plus gros gains de slots en live',
  subscribe: 'S’abonner',
  heroKicker: 'Bonus hub',
  heroA: 'Les bonus', heroB: 'derrière les big wins',
  heroSub: 'Les casinos et les codes qu’on utilise vraiment. Chaque règle expliquée simplement – sans fausses notes ni petites lignes.',
  heroCta: 'Prendre le bonus n°1',
  offersTitle: 'Offres casino', offersCount: '{n} offres',
  play: 'Jouer maintenant', noCode: 'Aucun code requis', code: 'Code', details: 'Détails', review: 'Avis', top: 'Notre n°1',
  stat: {rakeback: 'Rakeback', claim: 'Réclamable toutes les', race: 'Race du mois', fs: 'Free spins', maxbet: 'Mise max', days: 'Jours pour le wager', deposits: 'Dépôts', total: 'Bonus total'},
  badge: {code: 'Code NIVORANET', deposits3: 'Sur 3 dépôts', deposits2: 'Sur 2 dépôts'},
  ticker: 'Wager race du mois 200 $',
  winsTitle: 'Les plus gros gains du jour en vidéo', winsSub: 'Top 5 du jour · Top 10 de la semaine · Top 30 du mois', winsCta: 'Voir la chaîne',
  nav: {home: 'Accueil', offers: 'Bonus casino', guide: 'Guide des bonus', rg: 'Jeu responsable', about: 'Qui sommes-nous', more: 'Comprendre', page: 'Pages'},
  age: {title: 'As-tu 18 ans ou plus ?', text: 'Ce site présente des offres de bonus casino et s’adresse uniquement aux adultes. Le jeu peut créer une dépendance – joue de façon responsable.', yes: 'Oui, j’ai 18 ans ou plus', no: 'Non'},
};

const de: UI = {
  channelTag: 'Die größten Slot-Gewinne aus Livestreams',
  subscribe: 'Abonnieren',
  heroKicker: 'Bonus-Hub',
  heroA: 'Die Boni', heroB: 'hinter den Big Wins',
  heroSub: 'Die Casinos und Codes, die wir wirklich nutzen. Jede Regel klar erklärt – keine Fake-Bewertungen, kein Kleingedrucktes.',
  heroCta: 'Bonus Nr. 1 sichern',
  offersTitle: 'Casino-Angebote', offersCount: '{n} Angebote',
  play: 'Jetzt spielen', noCode: 'Kein Code nötig', code: 'Code', details: 'Details', review: 'Testbericht', top: 'Unsere Nr. 1',
  stat: {rakeback: 'Rakeback', claim: 'Abholen alle', race: 'Monatsrennen', fs: 'Freispiele', maxbet: 'Max. Einsatz', days: 'Tage Umsatz', deposits: 'Einzahlungen', total: 'Bonus gesamt'},
  badge: {code: 'Code NIVORANET', deposits3: 'Auf 3 Einzahlungen', deposits2: 'Auf 2 Einzahlungen'},
  ticker: 'Monatliches Wager-Rennen 200 $',
  winsTitle: 'Die größten Gewinne des Tages im Video', winsSub: 'Tages-Top 5 · Wochen-Top 10 · Monats-Top 30', winsCta: 'Zum Kanal',
  nav: {home: 'Startseite', offers: 'Casino-Boni', guide: 'Bonus-Guide', rg: 'Verantwortungsvoll spielen', about: 'Über uns', more: 'Wissen', page: 'Seiten'},
  age: {title: 'Bist du mindestens 18 Jahre alt?', text: 'Diese Seite zeigt Casino-Bonusangebote und richtet sich nur an Erwachsene. Glücksspiel kann süchtig machen – spiele verantwortungsvoll.', yes: 'Ja, ich bin über 18', no: 'Nein'},
};

const es: UI = {
  channelTag: 'Las mayores ganancias en slots de los directos',
  subscribe: 'Suscribirse',
  heroKicker: 'Bonus hub',
  heroA: 'Los bonos', heroB: 'detrás de los big wins',
  heroSub: 'Los casinos y códigos que usamos de verdad. Cada regla explicada con claridad – sin notas falsas ni letra pequeña.',
  heroCta: 'Conseguir el bono n.º 1',
  offersTitle: 'Ofertas de casino', offersCount: '{n} ofertas',
  play: 'Jugar ahora', noCode: 'Sin código', code: 'Código', details: 'Detalles', review: 'Reseña', top: 'Nuestro n.º 1',
  stat: {rakeback: 'Rakeback', claim: 'Reclamable cada', race: 'Carrera mensual', fs: 'Giros gratis', maxbet: 'Apuesta máx.', days: 'Días de rollover', deposits: 'Depósitos', total: 'Bono total'},
  badge: {code: 'Código NIVORANET', deposits3: 'En 3 depósitos', deposits2: 'En 2 depósitos'},
  ticker: 'Carrera mensual de apuestas 200 $',
  winsTitle: 'Las mayores ganancias del día en vídeo', winsSub: 'Top 5 diario · Top 10 semanal · Top 30 mensual', winsCta: 'Ver el canal',
  nav: {home: 'Inicio', offers: 'Bonos de casino', guide: 'Guía de bonos', rg: 'Juego responsable', about: 'Quiénes somos', more: 'Aprende', page: 'Páginas'},
  age: {title: '¿Tienes 18 años o más?', text: 'Este sitio muestra ofertas de bonos de casino y es solo para adultos. El juego puede crear adicción: juega con responsabilidad.', yes: 'Sí, tengo 18 o más', no: 'No'},
};

const pt: UI = {
  channelTag: 'Os maiores ganhos em slots das lives',
  subscribe: 'Inscrever-se',
  heroKicker: 'Bonus hub',
  heroA: 'Os bônus', heroB: 'por trás dos big wins',
  heroSub: 'Os cassinos e códigos que usamos de verdade. Cada regra explicada de forma simples – sem notas falsas, sem letras miúdas.',
  heroCta: 'Pegar o bônus nº 1',
  offersTitle: 'Ofertas de cassino', offersCount: '{n} ofertas',
  play: 'Jogar agora', noCode: 'Sem código', code: 'Código', details: 'Detalhes', review: 'Análise', top: 'Nosso nº 1',
  stat: {rakeback: 'Rakeback', claim: 'Resgate a cada', race: 'Corrida mensal', fs: 'Rodadas grátis', maxbet: 'Aposta máx.', days: 'Dias de rollover', deposits: 'Depósitos', total: 'Bônus total'},
  badge: {code: 'Código NIVORANET', deposits3: 'Em 3 depósitos', deposits2: 'Em 2 depósitos'},
  ticker: 'Corrida mensal de apostas US$ 200',
  winsTitle: 'Os maiores ganhos do dia em vídeo', winsSub: 'Top 5 diário · Top 10 semanal · Top 30 mensal', winsCta: 'Abrir o canal',
  nav: {home: 'Início', offers: 'Bônus de cassino', guide: 'Guia de bônus', rg: 'Jogo responsável', about: 'Quem somos', more: 'Aprenda', page: 'Páginas'},
  age: {title: 'Você tem 18 anos ou mais?', text: 'Este site mostra ofertas de bônus de cassino e é apenas para adultos. O jogo pode viciar – jogue com responsabilidade.', yes: 'Sim, tenho 18+', no: 'Não'},
};

const it: UI = {
  channelTag: 'Le vincite più grandi alle slot dalle live',
  subscribe: 'Iscriviti',
  heroKicker: 'Bonus hub',
  heroA: 'I bonus', heroB: 'dietro i big win',
  heroSub: 'I casinò e i codici che usiamo davvero. Ogni regola spiegata in modo semplice – niente voti falsi, niente clausole nascoste.',
  heroCta: 'Prendi il bonus n. 1',
  offersTitle: 'Offerte casinò', offersCount: '{n} offerte',
  play: 'Gioca ora', noCode: 'Nessun codice', code: 'Codice', details: 'Dettagli', review: 'Recensione', top: 'Il nostro n. 1',
  stat: {rakeback: 'Rakeback', claim: 'Riscatto ogni', race: 'Gara mensile', fs: 'Giri gratis', maxbet: 'Puntata max', days: 'Giorni di puntata', deposits: 'Depositi', total: 'Bonus totale'},
  badge: {code: 'Codice NIVORANET', deposits3: 'Su 3 depositi', deposits2: 'Su 2 depositi'},
  ticker: 'Gara mensile di puntate 200 $',
  winsTitle: 'Le vincite più grandi del giorno in video', winsSub: 'Top 5 del giorno · Top 10 della settimana · Top 30 del mese', winsCta: 'Apri il canale',
  nav: {home: 'Home', offers: 'Bonus casinò', guide: 'Guida ai bonus', rg: 'Gioco responsabile', about: 'Chi siamo', more: 'Scopri', page: 'Pagine'},
  age: {title: 'Hai almeno 18 anni?', text: 'Questo sito mostra offerte bonus dei casinò ed è riservato agli adulti. Il gioco può creare dipendenza: gioca responsabilmente.', yes: 'Sì, ho 18+ anni', no: 'No'},
};

const UIS: Record<Lang, UI> = {en, fr, de, es, pt, it};
export const ui = (lang: Lang) => UIS[lang];
