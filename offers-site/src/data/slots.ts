import type {Lang} from '../i18n';
// Catalogue des machines à sous (section Site, N3). Règle : chaque chiffre vient de la fiche officielle de l'éditeur
// (source + date du relevé) ; un prix de bonus acheté non publié reste null, jamais estimé.
// volatility : échelle de l'éditeur (« 4/5 ») ou high / very-high / medium / low, traduits sur la page.
// buys[].cost = prix en multiples de la mise de base ; le relevé à l'image de nos clips pourra le remplir plus tard.
export type Buy = {name: string; cost: number | null};
export type Slot = {
  id: string; name: string; provider: string; source: string; checked: string;
  rtp: number[]; volatility: string; maxWin: number; grid: string; buys: Buy[];
  // Chiffres absents de la fiche officielle : au moins deux sources indépendantes et concordantes, citées sur la page.
  cited?: Partial<Record<'maxWin' | 'volatility' | 'buys' | 'grid', string[]>>;
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
  {
    id: 'gates-of-olympus', name: 'Gates of Olympus', provider: 'Pragmatic Play',
    source: 'https://www.pragmaticplay.com/en/games/gates-of-olympus/', checked: '2026-11-22',
    rtp: [96.5], volatility: 'high', maxWin: 5000, grid: '6 reels · pays anywhere · tumble', buys: [{name: 'Free Spins', cost: 100}],
    cited: {
      maxWin: ['https://www.olbg.com/slots/games/gates-olympus', 'https://www.gambling.com/uk/online-casinos/slots/games/gates-of-olympus', 'https://www.pokerlistings.com/online-slots/free/gates-of-olympus'],
      volatility: ['https://www.gambling.com/uk/online-casinos/slots/games/gates-of-olympus', 'https://www.pokerlistings.com/online-slots/free/gates-of-olympus'],
      buys: ['https://www.olbg.com/slots/games/gates-olympus', 'https://www.pokerlistings.com/online-slots/free/gates-of-olympus'],
    },
    text: {
      en: [
        'Gates of Olympus is Pragmatic Play’s Zeus slot: six tumbling reels where 8 or more matching symbols pay anywhere on the screen, with a published RTP of 96.50%.',
        'Its signature is the multiplier symbol. Multipliers worth up to 500x can land in the base game and in free spins, and they apply to the win of the tumble sequence they land in.',
        'Four or more Zeus scatters start 15 free spins. During the feature every winning multiplier is added to a running total that keeps growing, which is where the 5,000x top win comes from. In some markets the free spins can be bought directly for 100 times the bet.',
      ],
      fr: [
        'Gates of Olympus est la machine à sous de Zeus chez Pragmatic Play : six rouleaux en cascade où 8 symboles identiques ou plus paient n’importe où sur l’écran, avec un RTP publié de 96,50 %.',
        'Sa signature, c’est le symbole multiplicateur. Des multiplicateurs jusqu’à 500x peuvent tomber dans le jeu de base comme dans les tours gratuits, et s’appliquent au gain de la cascade où ils tombent.',
        'Quatre scatters Zeus ou plus lancent 15 tours gratuits. Pendant le bonus, chaque multiplicateur gagnant s’ajoute à un total qui ne fait que grimper : c’est de là que vient le gain maximal de 5 000x. Sur certains marchés, les tours gratuits s’achètent directement pour 100 fois la mise.',
      ],
      de: [
        'Gates of Olympus ist der Zeus-Slot von Pragmatic Play: sechs Walzen mit Tumble-Funktion, auf denen 8 oder mehr gleiche Symbole überall auf dem Bildschirm zahlen, bei einem veröffentlichten RTP von 96,50 %.',
        'Sein Markenzeichen ist das Multiplikator-Symbol. Multiplikatoren bis 500x können im Basisspiel und in den Freispielen landen und gelten für den Gewinn der Tumble-Folge, in der sie erscheinen.',
        'Vier oder mehr Zeus-Scatter starten 15 Freispiele. Im Feature wird jeder gewinnende Multiplikator zu einer laufenden Summe addiert, die immer weiter wächst – daher kommt der Höchstgewinn von 5.000x. In manchen Märkten lassen sich die Freispiele direkt für das 100-Fache des Einsatzes kaufen.',
      ],
      es: [
        'Gates of Olympus es la tragaperras de Zeus de Pragmatic Play: seis carretes en cascada donde 8 o más símbolos iguales pagan en cualquier lugar de la pantalla, con un RTP publicado del 96,50 %.',
        'Su sello es el símbolo multiplicador. Pueden caer multiplicadores de hasta 500x en el juego base y en los giros gratis, y se aplican al premio de la cascada en la que caen.',
        'Cuatro o más scatters de Zeus activan 15 giros gratis. Durante el bono, cada multiplicador ganador se suma a un total que no deja de crecer: de ahí sale el premio máximo de 5.000x. En algunos mercados los giros gratis se compran directamente por 100 veces la apuesta.',
      ],
      pt: [
        'Gates of Olympus é o slot de Zeus da Pragmatic Play: seis rolos em cascata onde 8 ou mais símbolos iguais pagam em qualquer lugar da tela, com RTP publicado de 96,50%.',
        'Sua marca registrada é o símbolo multiplicador. Multiplicadores de até 500x podem cair no jogo base e nas rodadas grátis, e valem para o ganho da cascata em que caem.',
        'Quatro ou mais scatters de Zeus ativam 15 rodadas grátis. Durante o bônus, cada multiplicador vencedor é somado a um total que só cresce – é daí que vem o ganho máximo de 5.000x. Em alguns mercados as rodadas grátis podem ser compradas diretamente por 100 vezes a aposta.',
      ],
      it: [
        'Gates of Olympus è la slot di Zeus di Pragmatic Play: sei rulli a cascata dove 8 o più simboli uguali pagano ovunque sullo schermo, con un RTP pubblicato del 96,50%.',
        'Il suo marchio è il simbolo moltiplicatore. Moltiplicatori fino a 500x possono cadere nel gioco base e nei giri gratis, e valgono per la vincita della cascata in cui cadono.',
        'Quattro o più scatter di Zeus attivano 15 giri gratis. Durante il bonus ogni moltiplicatore vincente si somma a un totale che continua a crescere: da qui arriva la vincita massima di 5.000x. In alcuni mercati i giri gratis si comprano direttamente a 100 volte la puntata.',
      ],
    },
  },
  {
    id: 'fortune-of-olympus', name: 'Fortune of Olympus', provider: 'Pragmatic Play',
    source: 'https://www.pragmaticplay.com/en/games/fortune-of-olympus/', checked: '2026-11-22',
    rtp: [96.55], volatility: 'high', maxWin: 10000, grid: '7×7 · cluster pays · tumble', buys: [{name: 'Free Spins', cost: null}],
    cited: {
      maxWin: ['https://www.olbg.com/slots/games/fortune-of-olympus', 'https://www.casinos.com/slots/fortune-of-olympus', 'https://www.vegasslotsonline.com/pragmatic-play/fortune-of-olympus/'],
      volatility: ['https://www.casinos.com/slots/fortune-of-olympus', 'https://www.vegasslotsonline.com/pragmatic-play/fortune-of-olympus/'],
      grid: ['https://www.olbg.com/slots/games/fortune-of-olympus', 'https://www.vegasslotsonline.com/pragmatic-play/fortune-of-olympus/'],
    },
    text: {
      en: [
        'Fortune of Olympus brings Zeus back to Pragmatic Play, this time in a gold-filled throne room: a tumbling cluster slot with a published RTP of 96.55%.',
        'Multipliers worth up to 500x can hit at random in the base game and in the bonus. When several land during one tumble sequence, their values are added together and paid once the sequence ends.',
        'Four to seven scatters start up to 30 free spins, and during the round every multiplier that hits joins a running total applied to every win until the end. Up to four optional special bets change the base game: multipliers on every spin, a higher minimum multiplier of up to 50x, or a better chance to reach the free spins.',
      ],
      fr: [
        'Fortune of Olympus ramène Zeus chez Pragmatic Play, cette fois dans une salle du trône remplie d’or : une machine à sous à grappes et cascades, avec un RTP publié de 96,55 %.',
        'Des multiplicateurs jusqu’à 500x peuvent tomber au hasard dans le jeu de base comme dans le bonus. Quand plusieurs arrivent pendant une même cascade, leurs valeurs s’additionnent et sont payées à la fin de la séquence.',
        'De quatre à sept scatters lancent jusqu’à 30 tours gratuits ; pendant le bonus, chaque multiplicateur qui tombe rejoint un total appliqué à tous les gains jusqu’à la fin. Jusqu’à quatre mises spéciales facultatives modifient le jeu de base : multiplicateurs à chaque tour, multiplicateur minimum relevé jusqu’à 50x, ou meilleures chances d’atteindre les tours gratuits.',
      ],
      de: [
        'Fortune of Olympus holt Zeus zurück zu Pragmatic Play, diesmal in einen goldgefüllten Thronsaal: ein Cluster-Slot mit Tumble-Funktion und einem veröffentlichten RTP von 96,55 %.',
        'Multiplikatoren bis 500x können im Basisspiel und im Bonus zufällig landen. Erscheinen mehrere in derselben Tumble-Folge, werden ihre Werte addiert und am Ende der Folge ausgezahlt.',
        'Vier bis sieben Scatter starten bis zu 30 Freispiele; in der Runde fließt jeder Multiplikator in eine laufende Summe, die bis zum Ende für jeden Gewinn gilt. Bis zu vier optionale Sonderwetten verändern das Basisspiel: Multiplikatoren in jeder Drehung, ein höherer Mindestmultiplikator bis 50x oder bessere Chancen auf die Freispiele.',
      ],
      es: [
        'Fortune of Olympus trae de vuelta a Zeus en Pragmatic Play, esta vez en una sala del trono llena de oro: una tragaperras de grupos en cascada con un RTP publicado del 96,55 %.',
        'Pueden caer al azar multiplicadores de hasta 500x en el juego base y en el bono. Si caen varios durante una misma cascada, sus valores se suman y se pagan al terminar la secuencia.',
        'De cuatro a siete scatters activan hasta 30 giros gratis; durante la ronda, cada multiplicador que cae se suma a un total que se aplica a todos los premios hasta el final. Hasta cuatro apuestas especiales opcionales cambian el juego base: multiplicadores en cada giro, un multiplicador mínimo de hasta 50x o más opciones de llegar a los giros gratis.',
      ],
      pt: [
        'Fortune of Olympus traz Zeus de volta à Pragmatic Play, desta vez numa sala do trono cheia de ouro: um slot de clusters em cascata com RTP publicado de 96,55%.',
        'Multiplicadores de até 500x podem cair aleatoriamente no jogo base e no bônus. Quando vários caem durante a mesma cascata, os valores são somados e pagos no fim da sequência.',
        'De quatro a sete scatters ativam até 30 rodadas grátis; durante a rodada, cada multiplicador que cai entra num total aplicado a todos os ganhos até o fim. Até quatro apostas especiais opcionais mudam o jogo base: multiplicadores em todo giro, multiplicador mínimo de até 50x ou mais chances de chegar às rodadas grátis.',
      ],
      it: [
        'Fortune of Olympus riporta Zeus da Pragmatic Play, questa volta in una sala del trono piena d’oro: una slot a cluster con cascate e un RTP pubblicato del 96,55%.',
        'Moltiplicatori fino a 500x possono cadere a caso nel gioco base e nel bonus. Se ne cadono diversi nella stessa cascata, i valori si sommano e vengono pagati alla fine della sequenza.',
        'Da quattro a sette scatter attivano fino a 30 giri gratis; durante il round ogni moltiplicatore che cade entra in un totale applicato a tutte le vincite fino alla fine. Fino a quattro puntate speciali facoltative cambiano il gioco base: moltiplicatori a ogni giro, un moltiplicatore minimo fino a 50x o più possibilità di arrivare ai giri gratis.',
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
  bonus: string; buyPrice: string; buyUnknown: string; rtpNote: string; source: string; about: string; ourWins: string; noWins: string; playAt: string; cols: string[];
  vol: Record<string, string>; rtpNote1: string; cited: string; indexT: string; indexH: string; indexD: string; indexP: string; watch: string};
export const SL: Record<Lang, L> = {
  en: {crumb: 'Slots', title: '{name} Slot – Max Win {max}x, RTP & Bonus Buys', h1: '{name}: max win, RTP and bonus games',
    desc: '{name} by {provider}: max win {max}x, RTP up to {rtp}%, volatility {vol}, {n} bonus games. Official figures checked {date}, plus our verified live wins. 18+.',
    provider: 'Provider', maxWin: 'Max win', rtp: 'RTP', volatility: 'Volatility', grid: 'Grid', bonus: 'Bonus games', buyPrice: 'Bonus buy price',
    buyUnknown: 'Shown in the game’s buy menu; {provider} does not publish it, so we don’t print a guess.', rtpNote: '{provider} publishes these RTP versions; the casino picks one, and the game’s info screen shows which.',
    source: 'Source: official {provider} game page, checked {date}.', about: 'About the game', ourWins: 'Our verified wins on {name}', noWins: 'No verified win on this game in our rankings yet.',
    playAt: '{provider} games are available at {casino}', cols: ['Date', 'Streamer', 'Multiplier', 'Bet'], vol: {"high": "High", "very-high": "Very high", "medium": "Medium", "low": "Low"}, rtpNote1: "The value {provider} publishes; some casinos run a lower version, shown in the game’s info screen.", cited: "Not on the provider’s page; the same value at {links}, checked {date}.", indexT: "Slot Games – Max Win, RTP & Bonus Buys by Provider", indexH: "Slot games: max win, RTP and bonus buys", indexD: "Max win, RTP, volatility and bonus buy prices of popular slots, from official provider data and checked sources, with our verified live wins. 18+.", indexP: "Every figure comes from the provider’s official game page or from at least two sources that agree, with the date we checked it. Where a figure isn’t published, we leave it blank.", watch: "Video"},
  fr: {crumb: 'Machines à sous', title: '{name} – gain max {max}x, RTP et bonus achetés', h1: '{name} : gain maximal, RTP et bonus',
    desc: '{name} de {provider} : gain max {max}x, RTP jusqu’à {rtp} %, volatilité {vol}, {n} bonus. Chiffres officiels relevés le {date}, et nos gains vérifiés en live. 18+.',
    provider: 'Éditeur', maxWin: 'Gain maximal', rtp: 'RTP', volatility: 'Volatilité', grid: 'Grille', bonus: 'Bonus', buyPrice: 'Prix du bonus acheté',
    buyUnknown: 'Affiché dans le menu d’achat du jeu ; {provider} ne le publie pas, donc nous n’affichons pas d’estimation.', rtpNote: '{provider} publie ces versions de RTP ; le casino en choisit une, visible dans l’écran d’infos du jeu.',
    source: 'Source : fiche officielle de {provider}, relevée le {date}.', about: 'Le jeu', ourWins: 'Nos gains vérifiés sur {name}', noWins: 'Pas encore de gain vérifié sur ce jeu dans nos classements.',
    playAt: 'Les jeux {provider} sont disponibles sur {casino}', cols: ['Date', 'Streamer', 'Multiplicateur', 'Mise'], vol: {"high": "Élevée", "very-high": "Très élevée", "medium": "Moyenne", "low": "Faible"}, rtpNote1: "La valeur publiée par {provider} ; certains casinos utilisent une version plus basse, indiquée dans l’écran d’infos du jeu.", cited: "Absent de la fiche de l’éditeur ; même valeur sur {links}, relevé le {date}.", indexT: "Machines à sous – gain max, RTP et bonus par éditeur", indexH: "Machines à sous : gain maximal, RTP et bonus achetés", indexD: "Gain maximal, RTP, volatilité et prix des bonus achetés des machines à sous connues, d’après les fiches officielles et des sources vérifiées, avec nos gains vérifiés en live. 18+.", indexP: "Chaque chiffre vient de la fiche officielle de l’éditeur ou d’au moins deux sources concordantes, avec la date du relevé. Quand un chiffre n’est pas publié, la case reste vide.", watch: "Vidéo"},
  de: {crumb: 'Slots', title: '{name} – Max Win {max}x, RTP & Bonuskauf', h1: '{name}: Maximalgewinn, RTP und Bonusspiele',
    desc: '{name} von {provider}: Max Win {max}x, RTP bis {rtp} %, Volatilität {vol}, {n} Bonusspiele. Offizielle Werte vom {date} und unsere verifizierten Live-Gewinne. 18+.',
    provider: 'Anbieter', maxWin: 'Maximalgewinn', rtp: 'RTP', volatility: 'Volatilität', grid: 'Raster', bonus: 'Bonusspiele', buyPrice: 'Preis des Bonuskaufs',
    buyUnknown: 'Steht im Kaufmenü des Spiels; {provider} veröffentlicht ihn nicht, daher keine Schätzung.', rtpNote: '{provider} veröffentlicht diese RTP-Versionen; das Casino wählt eine, der Info-Bildschirm des Spiels zeigt welche.',
    source: 'Quelle: offizielle Spielseite von {provider}, geprüft am {date}.', about: 'Das Spiel', ourWins: 'Unsere verifizierten Gewinne auf {name}', noWins: 'Noch kein verifizierter Gewinn auf diesem Spiel in unseren Rankings.',
    playAt: '{provider}-Spiele gibt es bei {casino}', cols: ['Datum', 'Streamer', 'Multiplikator', 'Einsatz'], vol: {"high": "Hoch", "very-high": "Sehr hoch", "medium": "Mittel", "low": "Niedrig"}, rtpNote1: "Der von {provider} veröffentlichte Wert; manche Casinos nutzen eine niedrigere Version, die der Info-Bildschirm des Spiels zeigt.", cited: "Nicht auf der Seite des Anbieters; derselbe Wert bei {links}, geprüft am {date}.", indexT: "Slots – Max Win, RTP & Bonuskauf nach Anbieter", indexH: "Slots: Maximalgewinn, RTP und Bonuskauf", indexD: "Maximalgewinn, RTP, Volatilität und Bonuskaufpreise bekannter Slots, aus offiziellen Anbieterdaten und geprüften Quellen, mit unseren verifizierten Live-Gewinnen. 18+.", indexP: "Jede Zahl stammt von der offiziellen Spielseite des Anbieters oder aus mindestens zwei übereinstimmenden Quellen, mit Prüfdatum. Wird ein Wert nicht veröffentlicht, bleibt das Feld leer.", watch: "Video"},
  es: {crumb: 'Tragaperras', title: '{name} – premio máx. {max}x, RTP y compra de bono', h1: '{name}: premio máximo, RTP y bonos',
    desc: '{name} de {provider}: premio máx. {max}x, RTP hasta {rtp} %, volatilidad {vol}, {n} bonos. Cifras oficiales revisadas el {date} y nuestras ganancias verificadas en directo. 18+.',
    provider: 'Proveedor', maxWin: 'Premio máximo', rtp: 'RTP', volatility: 'Volatilidad', grid: 'Cuadrícula', bonus: 'Bonos', buyPrice: 'Precio de la compra de bono',
    buyUnknown: 'Aparece en el menú de compra del juego; {provider} no lo publica, así que no mostramos una estimación.', rtpNote: '{provider} publica estas versiones de RTP; el casino elige una y la pantalla de información del juego la muestra.',
    source: 'Fuente: ficha oficial de {provider}, revisada el {date}.', about: 'El juego', ourWins: 'Nuestras ganancias verificadas en {name}', noWins: 'Todavía no hay ganancias verificadas en este juego en nuestros rankings.',
    playAt: 'Los juegos de {provider} están en {casino}', cols: ['Fecha', 'Streamer', 'Multiplicador', 'Apuesta'], vol: {"high": "Alta", "very-high": "Muy alta", "medium": "Media", "low": "Baja"}, rtpNote1: "El valor que publica {provider}; algunos casinos usan una versión más baja, que aparece en la pantalla de información del juego.", cited: "No figura en la página del proveedor; el mismo valor en {links}, revisado el {date}.", indexT: "Tragaperras – premio máx., RTP y compra de bono por proveedor", indexH: "Tragaperras: premio máximo, RTP y compra de bono", indexD: "Premio máximo, RTP, volatilidad y precio de la compra de bono de tragaperras conocidas, con datos oficiales y fuentes verificadas, y nuestras ganancias verificadas en directo. 18+.", indexP: "Cada cifra viene de la página oficial del proveedor o de al menos dos fuentes que coinciden, con la fecha de revisión. Si una cifra no se publica, la casilla queda vacía.", watch: "Vídeo"},
  pt: {crumb: 'Slots', title: '{name} – ganho máx. {max}x, RTP e compra de bônus', h1: '{name}: ganho máximo, RTP e bônus',
    desc: '{name} da {provider}: ganho máx. {max}x, RTP até {rtp}%, volatilidade {vol}, {n} bônus. Números oficiais conferidos em {date} e nossos ganhos verificados ao vivo. 18+.',
    provider: 'Provedor', maxWin: 'Ganho máximo', rtp: 'RTP', volatility: 'Volatilidade', grid: 'Grade', bonus: 'Bônus', buyPrice: 'Preço da compra de bônus',
    buyUnknown: 'Aparece no menu de compra do jogo; a {provider} não o publica, então não mostramos estimativa.', rtpNote: 'A {provider} publica estas versões de RTP; o cassino escolhe uma, e a tela de informações do jogo mostra qual.',
    source: 'Fonte: página oficial da {provider}, conferida em {date}.', about: 'O jogo', ourWins: 'Nossos ganhos verificados em {name}', noWins: 'Ainda não há ganho verificado neste jogo nos nossos rankings.',
    playAt: 'Os jogos da {provider} estão na {casino}', cols: ['Data', 'Streamer', 'Multiplicador', 'Aposta'], vol: {"high": "Alta", "very-high": "Muito alta", "medium": "Média", "low": "Baixa"}, rtpNote1: "O valor que a {provider} publica; alguns cassinos usam uma versão mais baixa, mostrada na tela de informações do jogo.", cited: "Não consta na página do provedor; o mesmo valor em {links}, conferido em {date}.", indexT: "Slots – ganho máx., RTP e compra de bônus por provedor", indexH: "Slots: ganho máximo, RTP e compra de bônus", indexD: "Ganho máximo, RTP, volatilidade e preço da compra de bônus de slots conhecidos, com dados oficiais e fontes conferidas, e nossos ganhos verificados ao vivo. 18+.", indexP: "Cada número vem da página oficial do provedor ou de pelo menos duas fontes que concordam, com a data da conferência. Quando um número não é publicado, o campo fica vazio.", watch: "Vídeo"},
  it: {crumb: 'Slot', title: '{name} – vincita max {max}x, RTP e bonus buy', h1: '{name}: vincita massima, RTP e bonus',
    desc: '{name} di {provider}: vincita max {max}x, RTP fino al {rtp}%, volatilità {vol}, {n} bonus. Dati ufficiali verificati il {date} e le nostre vincite verificate in live. 18+.',
    provider: 'Fornitore', maxWin: 'Vincita massima', rtp: 'RTP', volatility: 'Volatilità', grid: 'Griglia', bonus: 'Bonus', buyPrice: 'Prezzo del bonus buy',
    buyUnknown: 'È indicato nel menu di acquisto del gioco; {provider} non lo pubblica, quindi non mostriamo stime.', rtpNote: '{provider} pubblica queste versioni di RTP; il casinò ne sceglie una, indicata nella schermata info del gioco.',
    source: 'Fonte: pagina ufficiale di {provider}, verificata il {date}.', about: 'Il gioco', ourWins: 'Le nostre vincite verificate su {name}', noWins: 'Ancora nessuna vincita verificata su questo gioco nelle nostre classifiche.',
    playAt: 'I giochi {provider} sono disponibili su {casino}', cols: ['Data', 'Streamer', 'Moltiplicatore', 'Puntata'], vol: {"high": "Alta", "very-high": "Molto alta", "medium": "Media", "low": "Bassa"}, rtpNote1: "Il valore pubblicato da {provider}; alcuni casinò usano una versione più bassa, indicata nella schermata info del gioco.", cited: "Non presente nella pagina del fornitore; stesso valore su {links}, verificato il {date}.", indexT: "Slot – vincita max, RTP e bonus buy per fornitore", indexH: "Slot: vincita massima, RTP e bonus buy", indexD: "Vincita massima, RTP, volatilità e prezzi dei bonus buy delle slot più note, da dati ufficiali e fonti verificate, con le nostre vincite verificate in live. 18+.", indexP: "Ogni cifra viene dalla pagina ufficiale del fornitore o da almeno due fonti concordanti, con la data della verifica. Se una cifra non è pubblicata, il campo resta vuoto.", watch: "Video"},
};
