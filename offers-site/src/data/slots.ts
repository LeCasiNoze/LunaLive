import type {Lang} from '../i18n';
// Catalogue des machines à sous (section Site, N3). Règle : chaque chiffre vient de la fiche officielle de l'éditeur
// (source + date du relevé) ; un prix de bonus acheté non publié reste null, jamais estimé.
// buys[].cost = prix en multiples de la mise de base ; le relevé à l'image de nos clips pourra le remplir plus tard.
export type Buy = {name: string; cost: number | null};
export type Slot = {
  id: string; name: string; provider: string; source: string; checked: string;
  rtp: number[]; volatility: string; maxWin: number; grid: string; buys: Buy[];
  text: Record<Lang, string[]>;
};

export const SLOTS: Slot[] = [
  {
    id: 'wanted-dead-or-a-wild', name: 'Wanted Dead or a Wild', provider: 'Hacksaw Gaming',
    source: 'https://www.hacksawgaming.com/games/wanted-dead-or-a-wild', checked: '2026-11-22',
    rtp: [96.38, 94.55, 92.33, 88.42], volatility: '4/5', maxWin: 12500, grid: '5×5 · 15 paylines',
    buys: [{name: 'The Great Train Robbery', cost: null}, {name: 'Duel at Dawn', cost: null}, {name: 'Dead Man’s Hand', cost: null}],
    text: {
      en: [
        'Wanted Dead or a Wild is a Western-themed slot from Hacksaw Gaming on a 5×5 grid with 15 paylines. Hacksaw rates its volatility 4 out of 5 and caps a single win at 12,500 times the bet.',
        'It was the first game with Hacksaw’s DuelReels: VS symbols expand into wild reels when they are part of a win, and the winning outlaw’s multiplier applies to the whole reel. When several wild reels share the same win, their multipliers are added together.',
        'Three bonus games can be triggered or bought. In The Great Train Robbery every wild that lands stays sticky. Duel at Dawn gives a much higher chance of several VS reels at once – Hacksaw calls it the best shot at the max win. Dead Man’s Hand first collects wilds and multipliers, then drops the wilds on every spin of its Showdown phase and applies the collected multiplier.',
      ],
      fr: [
        'Wanted Dead or a Wild est une machine à sous western de Hacksaw Gaming, sur une grille de 5×5 avec 15 lignes. Hacksaw note sa volatilité 4 sur 5 et plafonne un gain à 12 500 fois la mise.',
        'C’est le premier jeu avec les DuelReels de Hacksaw : les symboles VS s’étendent en rouleaux wild quand ils font partie d’un gain, et le multiplicateur du hors-la-loi vainqueur s’applique à tout le rouleau. Quand plusieurs rouleaux wild participent au même gain, leurs multiplicateurs s’additionnent.',
        'Trois bonus peuvent être déclenchés ou achetés. Dans The Great Train Robbery, chaque wild qui tombe reste collant. Duel at Dawn donne bien plus de chances d’avoir plusieurs rouleaux VS à la fois ; Hacksaw le présente comme la meilleure chance d’atteindre le gain maximal. Dead Man’s Hand collecte d’abord wilds et multiplicateurs, puis les place à chaque tour de sa phase Showdown en appliquant le multiplicateur accumulé.',
      ],
      de: [
        'Wanted Dead or a Wild ist ein Western-Slot von Hacksaw Gaming auf einem 5×5-Raster mit 15 Gewinnlinien. Hacksaw bewertet die Volatilität mit 4 von 5 und begrenzt einen Gewinn auf das 12.500-Fache des Einsatzes.',
        'Es war das erste Spiel mit Hacksaws DuelReels: VS-Symbole werden zu Wild-Walzen, wenn sie Teil eines Gewinns sind, und der Multiplikator des siegreichen Revolverhelden gilt für die ganze Walze. Teilen sich mehrere Wild-Walzen denselben Gewinn, werden ihre Multiplikatoren addiert.',
        'Drei Bonusspiele können ausgelöst oder gekauft werden. In The Great Train Robbery bleibt jedes Wild klebrig liegen. Duel at Dawn bringt deutlich häufiger mehrere VS-Walzen gleichzeitig – laut Hacksaw die beste Chance auf den Maximalgewinn. Dead Man’s Hand sammelt zuerst Wilds und Multiplikatoren und verteilt sie dann in jeder Drehung der Showdown-Phase, bevor der gesammelte Multiplikator angewendet wird.',
      ],
      es: [
        'Wanted Dead or a Wild es una tragaperras del Oeste de Hacksaw Gaming, en una cuadrícula de 5×5 con 15 líneas. Hacksaw califica su volatilidad con un 4 sobre 5 y limita un premio a 12.500 veces la apuesta.',
        'Fue el primer juego con los DuelReels de Hacksaw: los símbolos VS se expanden en carretes wild cuando forman parte de un premio, y el multiplicador del forajido ganador se aplica a todo el carrete. Si varios carretes wild comparten el mismo premio, sus multiplicadores se suman.',
        'Hay tres juegos de bonificación que se activan o se compran. En The Great Train Robbery cada wild que cae queda fijo. Duel at Dawn da muchas más opciones de varios carretes VS a la vez; Hacksaw lo presenta como la mejor ocasión de llegar al premio máximo. Dead Man’s Hand reúne primero wilds y multiplicadores y luego los coloca en cada giro de su fase Showdown, aplicando el multiplicador acumulado.',
      ],
      pt: [
        'Wanted Dead or a Wild é um slot de faroeste da Hacksaw Gaming, numa grade de 5×5 com 15 linhas. A Hacksaw classifica a volatilidade como 4 de 5 e limita um ganho a 12.500 vezes a aposta.',
        'Foi o primeiro jogo com os DuelReels da Hacksaw: símbolos VS se expandem em rolos wild quando fazem parte de um ganho, e o multiplicador do pistoleiro vencedor vale para o rolo inteiro. Quando vários rolos wild participam do mesmo ganho, os multiplicadores são somados.',
        'Três rodadas de bônus podem ser ativadas ou compradas. Em The Great Train Robbery, cada wild que cai fica fixo. Duel at Dawn dá muito mais chances de vários rolos VS ao mesmo tempo; a Hacksaw o apresenta como a melhor chance de chegar ao ganho máximo. Dead Man’s Hand primeiro junta wilds e multiplicadores e depois os coloca em cada giro da fase Showdown, aplicando o multiplicador acumulado.',
      ],
      it: [
        'Wanted Dead or a Wild è una slot western di Hacksaw Gaming, su una griglia 5×5 con 15 linee. Hacksaw valuta la volatilità 4 su 5 e limita una vincita a 12.500 volte la puntata.',
        'È stato il primo gioco con i DuelReels di Hacksaw: i simboli VS si espandono in rulli wild quando fanno parte di una vincita, e il moltiplicatore del fuorilegge vincitore vale per tutto il rullo. Se più rulli wild partecipano alla stessa vincita, i moltiplicatori si sommano.',
        'Tre giochi bonus si attivano o si acquistano. In The Great Train Robbery ogni wild che cade resta fisso. Duel at Dawn offre molte più possibilità di avere diversi rulli VS insieme; Hacksaw lo indica come la migliore occasione per la vincita massima. Dead Man’s Hand raccoglie prima wild e moltiplicatori, poi li distribuisce a ogni giro della fase Showdown applicando il moltiplicatore accumulato.',
      ],
    },
  },
];

export const bySlotName = (name: string) => {
  const k = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return SLOTS.find(s => s.name.toLowerCase().replace(/[^a-z0-9]/g, '') === k);
};
// Prix du bonus acheté le plus cher, connu ou non (lu par le vérificateur des clips via /slots/buys.json).
export const maxBuy = (s: Slot) => {
  const known = s.buys.map(b => b.cost).filter((c): c is number => c != null);
  return known.length === s.buys.length && known.length ? Math.max(...known) : null;
};

type L = {crumb: string; title: string; h1: string; desc: string; provider: string; maxWin: string; rtp: string; volatility: string; grid: string;
  bonus: string; buyPrice: string; buyUnknown: string; rtpNote: string; source: string; about: string; ourWins: string; noWins: string; playAt: string; cols: string[]};
export const SL: Record<Lang, L> = {
  en: {crumb: 'Slots', title: '{name} Slot – Max Win {max}x, RTP & Bonus Buys', h1: '{name}: max win, RTP and bonus games',
    desc: '{name} by {provider}: max win {max}x, RTP up to {rtp}%, volatility {vol}, {n} bonus games. Official figures checked {date}, plus our verified live wins. 18+.',
    provider: 'Provider', maxWin: 'Max win', rtp: 'RTP', volatility: 'Volatility', grid: 'Grid', bonus: 'Bonus games', buyPrice: 'Bonus buy price',
    buyUnknown: 'Shown in the game’s buy menu; {provider} does not publish it, so we don’t print a guess.', rtpNote: '{provider} publishes these RTP versions; the casino picks one, and the game’s info screen shows which.',
    source: 'Source: official {provider} game page, checked {date}.', about: 'About the game', ourWins: 'Our verified wins on {name}', noWins: 'No verified win on this game in our rankings yet.',
    playAt: '{provider} games are available at {casino}', cols: ['Date', 'Streamer', 'Multiplier', 'Bet']},
  fr: {crumb: 'Machines à sous', title: '{name} – gain max {max}x, RTP et bonus achetés', h1: '{name} : gain maximal, RTP et bonus',
    desc: '{name} de {provider} : gain max {max}x, RTP jusqu’à {rtp} %, volatilité {vol}, {n} bonus. Chiffres officiels relevés le {date}, et nos gains vérifiés en live. 18+.',
    provider: 'Éditeur', maxWin: 'Gain maximal', rtp: 'RTP', volatility: 'Volatilité', grid: 'Grille', bonus: 'Bonus', buyPrice: 'Prix du bonus acheté',
    buyUnknown: 'Affiché dans le menu d’achat du jeu ; {provider} ne le publie pas, donc nous n’affichons pas d’estimation.', rtpNote: '{provider} publie ces versions de RTP ; le casino en choisit une, visible dans l’écran d’infos du jeu.',
    source: 'Source : fiche officielle de {provider}, relevée le {date}.', about: 'Le jeu', ourWins: 'Nos gains vérifiés sur {name}', noWins: 'Pas encore de gain vérifié sur ce jeu dans nos classements.',
    playAt: 'Les jeux {provider} sont disponibles sur {casino}', cols: ['Date', 'Streamer', 'Multiplicateur', 'Mise']},
  de: {crumb: 'Slots', title: '{name} – Max Win {max}x, RTP & Bonuskauf', h1: '{name}: Maximalgewinn, RTP und Bonusspiele',
    desc: '{name} von {provider}: Max Win {max}x, RTP bis {rtp} %, Volatilität {vol}, {n} Bonusspiele. Offizielle Werte vom {date} und unsere verifizierten Live-Gewinne. 18+.',
    provider: 'Anbieter', maxWin: 'Maximalgewinn', rtp: 'RTP', volatility: 'Volatilität', grid: 'Raster', bonus: 'Bonusspiele', buyPrice: 'Preis des Bonuskaufs',
    buyUnknown: 'Steht im Kaufmenü des Spiels; {provider} veröffentlicht ihn nicht, daher keine Schätzung.', rtpNote: '{provider} veröffentlicht diese RTP-Versionen; das Casino wählt eine, der Info-Bildschirm des Spiels zeigt welche.',
    source: 'Quelle: offizielle Spielseite von {provider}, geprüft am {date}.', about: 'Das Spiel', ourWins: 'Unsere verifizierten Gewinne auf {name}', noWins: 'Noch kein verifizierter Gewinn auf diesem Spiel in unseren Rankings.',
    playAt: '{provider}-Spiele gibt es bei {casino}', cols: ['Datum', 'Streamer', 'Multiplikator', 'Einsatz']},
  es: {crumb: 'Tragaperras', title: '{name} – premio máx. {max}x, RTP y compra de bono', h1: '{name}: premio máximo, RTP y bonos',
    desc: '{name} de {provider}: premio máx. {max}x, RTP hasta {rtp} %, volatilidad {vol}, {n} bonos. Cifras oficiales revisadas el {date} y nuestras ganancias verificadas en directo. 18+.',
    provider: 'Proveedor', maxWin: 'Premio máximo', rtp: 'RTP', volatility: 'Volatilidad', grid: 'Cuadrícula', bonus: 'Bonos', buyPrice: 'Precio de la compra de bono',
    buyUnknown: 'Aparece en el menú de compra del juego; {provider} no lo publica, así que no mostramos una estimación.', rtpNote: '{provider} publica estas versiones de RTP; el casino elige una y la pantalla de información del juego la muestra.',
    source: 'Fuente: ficha oficial de {provider}, revisada el {date}.', about: 'El juego', ourWins: 'Nuestras ganancias verificadas en {name}', noWins: 'Todavía no hay ganancias verificadas en este juego en nuestros rankings.',
    playAt: 'Los juegos de {provider} están en {casino}', cols: ['Fecha', 'Streamer', 'Multiplicador', 'Apuesta']},
  pt: {crumb: 'Slots', title: '{name} – ganho máx. {max}x, RTP e compra de bônus', h1: '{name}: ganho máximo, RTP e bônus',
    desc: '{name} da {provider}: ganho máx. {max}x, RTP até {rtp}%, volatilidade {vol}, {n} bônus. Números oficiais conferidos em {date} e nossos ganhos verificados ao vivo. 18+.',
    provider: 'Provedor', maxWin: 'Ganho máximo', rtp: 'RTP', volatility: 'Volatilidade', grid: 'Grade', bonus: 'Bônus', buyPrice: 'Preço da compra de bônus',
    buyUnknown: 'Aparece no menu de compra do jogo; a {provider} não o publica, então não mostramos estimativa.', rtpNote: 'A {provider} publica estas versões de RTP; o cassino escolhe uma, e a tela de informações do jogo mostra qual.',
    source: 'Fonte: página oficial da {provider}, conferida em {date}.', about: 'O jogo', ourWins: 'Nossos ganhos verificados em {name}', noWins: 'Ainda não há ganho verificado neste jogo nos nossos rankings.',
    playAt: 'Os jogos da {provider} estão na {casino}', cols: ['Data', 'Streamer', 'Multiplicador', 'Aposta']},
  it: {crumb: 'Slot', title: '{name} – vincita max {max}x, RTP e bonus buy', h1: '{name}: vincita massima, RTP e bonus',
    desc: '{name} di {provider}: vincita max {max}x, RTP fino al {rtp}%, volatilità {vol}, {n} bonus. Dati ufficiali verificati il {date} e le nostre vincite verificate in live. 18+.',
    provider: 'Fornitore', maxWin: 'Vincita massima', rtp: 'RTP', volatility: 'Volatilità', grid: 'Griglia', bonus: 'Bonus', buyPrice: 'Prezzo del bonus buy',
    buyUnknown: 'È indicato nel menu di acquisto del gioco; {provider} non lo pubblica, quindi non mostriamo stime.', rtpNote: '{provider} pubblica queste versioni di RTP; il casinò ne sceglie una, indicata nella schermata info del gioco.',
    source: 'Fonte: pagina ufficiale di {provider}, verificata il {date}.', about: 'Il gioco', ourWins: 'Le nostre vincite verificate su {name}', noWins: 'Ancora nessuna vincita verificata su questo gioco nelle nostre classifiche.',
    playAt: 'I giochi {provider} sono disponibili su {casino}', cols: ['Data', 'Streamer', 'Moltiplicatore', 'Puntata']},
};
