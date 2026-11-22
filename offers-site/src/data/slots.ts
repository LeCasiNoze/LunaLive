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
  cited?: Partial<Record<'maxWin' | 'volatility' | 'buys' | 'grid' | 'rtp', string[]>>;
  // Chiffres officiels en plus quand l'éditeur les publie (fréquence de gain, chances de tours gratuits et du gain maximal).
  hit?: number; fsOdds?: string; maxOdds?: string;
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
  {
    id: 'gates-of-olympus-1000', name: 'Gates of Olympus 1000', provider: 'Pragmatic Play',
    source: 'https://www.pragmaticplay.com/en/games/gates-of-olympus-1000/', checked: '2026-11-22',
    rtp: [96.5], volatility: 'high', maxWin: 15000, grid: '6×5 · pays anywhere · tumble', buys: [{name: 'Free Spins', cost: 100}],
    cited: {
      maxWin: ['https://www.olbg.com/slots/games/gates-olympus-1000', 'https://www.vegasslotsonline.com/pragmatic-play/gates-of-olympus-1000/', 'https://www.pokerlistings.com/online-slots/free/gates-of-olympus-1000'],
      volatility: ['https://www.vegasslotsonline.com/pragmatic-play/gates-of-olympus-1000/', 'https://www.pokerlistings.com/online-slots/free/gates-of-olympus-1000'],
    },
    text: {
      en: [
        'Gates of Olympus 1000 is Pragmatic Play’s bigger take on its Zeus slot: the same 6×5 grid where 8 or more matching symbols pay anywhere, with a published RTP of 96.50% and multipliers that now reach 1,000x.',
        'Multiplier symbols can land on any reel during spins and tumbles with a random value from 2x to 1,000x. Their values are added together at the end of the tumble sequence and applied to the win.',
        'Four or more scatters start 15 free spins. In the round each multiplier joins a total that applies to every new win, and three more scatters add five spins. Pragmatic lists a bonus buy at 100 times the bet.',
      ],
      fr: [
        'Gates of Olympus 1000 est la version musclée de la machine à sous de Zeus chez Pragmatic Play : la même grille 6×5 où 8 symboles identiques ou plus paient n’importe où, un RTP publié de 96,50 % et des multiplicateurs qui montent désormais à 1 000x.',
        'Les symboles multiplicateurs peuvent tomber sur tous les rouleaux, pendant les tours comme pendant les cascades, avec une valeur aléatoire de 2x à 1 000x. Leurs valeurs s’additionnent à la fin de la cascade et s’appliquent au gain.',
        'Quatre scatters ou plus lancent 15 tours gratuits. Pendant le bonus, chaque multiplicateur rejoint un total qui s’applique à chaque nouveau gain, et trois scatters de plus ajoutent cinq tours. Pragmatic indique un achat du bonus à 100 fois la mise.',
      ],
      de: [
        'Gates of Olympus 1000 ist die stärkere Version des Zeus-Slots von Pragmatic Play: dasselbe 6×5-Raster, auf dem 8 oder mehr gleiche Symbole überall zahlen, ein veröffentlichter RTP von 96,50 % und Multiplikatoren, die jetzt bis 1.000x reichen.',
        'Multiplikator-Symbole können in Drehungen und Tumbles auf jeder Walze landen, mit einem zufälligen Wert von 2x bis 1.000x. Am Ende der Tumble-Folge werden ihre Werte addiert und auf den Gewinn angewendet.',
        'Vier oder mehr Scatter starten 15 Freispiele. In der Runde fließt jeder Multiplikator in eine Summe, die für jeden neuen Gewinn gilt, und drei weitere Scatter bringen fünf Drehungen dazu. Pragmatic nennt einen Bonuskauf für das 100-Fache des Einsatzes.',
      ],
      es: [
        'Gates of Olympus 1000 es la versión reforzada de la tragaperras de Zeus de Pragmatic Play: la misma cuadrícula de 6×5 donde 8 o más símbolos iguales pagan en cualquier lugar, un RTP publicado del 96,50 % y multiplicadores que ahora llegan a 1.000x.',
        'Los símbolos multiplicadores pueden caer en cualquier carrete durante los giros y las cascadas, con un valor aleatorio de 2x a 1.000x. Sus valores se suman al final de la cascada y se aplican al premio.',
        'Cuatro o más scatters activan 15 giros gratis. En la ronda, cada multiplicador se suma a un total que se aplica a cada nuevo premio, y tres scatters más añaden cinco giros. Pragmatic indica una compra del bono a 100 veces la apuesta.',
      ],
      pt: [
        'Gates of Olympus 1000 é a versão turbinada do slot de Zeus da Pragmatic Play: a mesma grade 6×5 em que 8 ou mais símbolos iguais pagam em qualquer lugar, RTP publicado de 96,50% e multiplicadores que agora chegam a 1.000x.',
        'Símbolos multiplicadores podem cair em qualquer rolo durante giros e cascatas, com valor aleatório de 2x a 1.000x. Os valores são somados no fim da cascata e aplicados ao ganho.',
        'Quatro ou mais scatters ativam 15 rodadas grátis. Na rodada, cada multiplicador entra num total aplicado a cada novo ganho, e mais três scatters dão cinco rodadas extras. A Pragmatic indica uma compra do bônus por 100 vezes a aposta.',
      ],
      it: [
        'Gates of Olympus 1000 è la versione potenziata della slot di Zeus di Pragmatic Play: la stessa griglia 6×5 dove 8 o più simboli uguali pagano ovunque, un RTP pubblicato del 96,50% e moltiplicatori che ora arrivano a 1.000x.',
        'I simboli moltiplicatore possono cadere su qualsiasi rullo durante giri e cascate, con un valore casuale da 2x a 1.000x. I valori si sommano alla fine della cascata e si applicano alla vincita.',
        'Quattro o più scatter attivano 15 giri gratis. Nel round ogni moltiplicatore entra in un totale applicato a ogni nuova vincita, e altri tre scatter aggiungono cinque giri. Pragmatic indica un acquisto del bonus a 100 volte la puntata.',
      ],
    },
  },
  {
    id: 'gates-of-olympus-super-scatter', name: 'Gates of Olympus Super Scatter', provider: 'Pragmatic Play',
    source: 'https://www.pragmaticplay.com/en/games/gates-of-olympus-super-scatter/', checked: '2026-11-22',
    rtp: [96.5], volatility: 'high', maxWin: 50000, grid: 'pays anywhere · tumble', buys: [{name: 'Free Spins', cost: null}],
    cited: {
      rtp: ['https://www.olbg.com/slots/games/gates-of-olympus-super-scatter', 'https://www.pokerlistings.com/online-slots/free/gates-of-olympus-super-scatter'],
      volatility: ['https://www.olbg.com/slots/games/gates-of-olympus-super-scatter', 'https://www.pokerlistings.com/online-slots/free/gates-of-olympus-super-scatter'],
    },
    text: {
      en: [
        'Gates of Olympus Super Scatter is a special edition of Pragmatic Play’s Zeus slot. Matching 8 to 30 symbols anywhere on the grid wins, and Pragmatic sets the maximum win at 50,000 times the bet.',
        'Multiplier symbols worth up to 500x can land on any spin or tumble; when several land, their values are added together and applied to the total win. Four or more scatters start 15 free spins, where each new multiplier joins a running total.',
        'The new part is the Super Scatter. Landing Super Scatters while triggering the free spins pays instantly: 100x the bet for one, 500x for two, 5,000x for three, and the 50,000x maximum win for four.',
      ],
      fr: [
        'Gates of Olympus Super Scatter est une édition spéciale de la machine à sous de Zeus chez Pragmatic Play. On gagne en alignant 8 à 30 symboles identiques n’importe où sur la grille, et Pragmatic fixe le gain maximal à 50 000 fois la mise.',
        'Des symboles multiplicateurs jusqu’à 500x peuvent tomber à chaque tour ou cascade ; quand plusieurs tombent, leurs valeurs s’additionnent et s’appliquent au gain total. Quatre scatters ou plus lancent 15 tours gratuits, où chaque nouveau multiplicateur rejoint un total cumulé.',
        'La nouveauté, c’est le Super Scatter. Des Super Scatters présents au déclenchement des tours gratuits paient tout de suite : 100 fois la mise pour un, 500x pour deux, 5 000x pour trois, et le gain maximal de 50 000x pour quatre.',
      ],
      de: [
        'Gates of Olympus Super Scatter ist eine Sonderedition des Zeus-Slots von Pragmatic Play. Es gewinnen 8 bis 30 gleiche Symbole überall auf dem Raster, und Pragmatic setzt den Höchstgewinn auf das 50.000-Fache des Einsatzes.',
        'Multiplikator-Symbole bis 500x können bei jeder Drehung und jedem Tumble landen; landen mehrere, werden ihre Werte addiert und auf den Gesamtgewinn angewendet. Vier oder mehr Scatter starten 15 Freispiele, in denen jeder neue Multiplikator in eine laufende Summe fließt.',
        'Neu ist der Super Scatter. Super Scatter beim Auslösen der Freispiele zahlen sofort: das 100-Fache des Einsatzes für einen, 500x für zwei, 5.000x für drei und den Höchstgewinn von 50.000x für vier.',
      ],
      es: [
        'Gates of Olympus Super Scatter es una edición especial de la tragaperras de Zeus de Pragmatic Play. Se gana con 8 a 30 símbolos iguales en cualquier lugar de la cuadrícula, y Pragmatic fija el premio máximo en 50.000 veces la apuesta.',
        'Pueden caer símbolos multiplicadores de hasta 500x en cualquier giro o cascada; si caen varios, sus valores se suman y se aplican al premio total. Cuatro o más scatters activan 15 giros gratis, donde cada nuevo multiplicador se suma a un total acumulado.',
        'La novedad es el Super Scatter. Los Super Scatters que aparecen al activar los giros gratis pagan al instante: 100 veces la apuesta por uno, 500x por dos, 5.000x por tres y el premio máximo de 50.000x por cuatro.',
      ],
      pt: [
        'Gates of Olympus Super Scatter é uma edição especial do slot de Zeus da Pragmatic Play. Ganha-se com 8 a 30 símbolos iguais em qualquer lugar da grade, e a Pragmatic fixa o ganho máximo em 50.000 vezes a aposta.',
        'Símbolos multiplicadores de até 500x podem cair em qualquer giro ou cascata; quando caem vários, os valores são somados e aplicados ao ganho total. Quatro ou mais scatters ativam 15 rodadas grátis, em que cada novo multiplicador entra num total acumulado.',
        'A novidade é o Super Scatter. Super Scatters presentes ao ativar as rodadas grátis pagam na hora: 100 vezes a aposta por um, 500x por dois, 5.000x por três e o ganho máximo de 50.000x por quatro.',
      ],
      it: [
        'Gates of Olympus Super Scatter è un’edizione speciale della slot di Zeus di Pragmatic Play. Si vince con 8–30 simboli uguali ovunque sulla griglia, e Pragmatic fissa la vincita massima a 50.000 volte la puntata.',
        'Simboli moltiplicatore fino a 500x possono cadere a ogni giro o cascata; se ne cadono diversi, i valori si sommano e si applicano alla vincita totale. Quattro o più scatter attivano 15 giri gratis, dove ogni nuovo moltiplicatore entra in un totale cumulativo.',
        'La novità è il Super Scatter. I Super Scatter presenti all’attivazione dei giri gratis pagano subito: 100 volte la puntata per uno, 500x per due, 5.000x per tre e la vincita massima di 50.000x per quattro.',
      ],
    },
  },
  {
    id: 'sweet-bonanza-1000', name: 'Sweet Bonanza 1000', provider: 'Pragmatic Play',
    source: 'https://www.pragmaticplay.com/en/games/sweet-bonanza-1000/', checked: '2026-11-22',
    rtp: [96.53], volatility: 'high', maxWin: 25000, grid: '6×5 · pays anywhere · tumble', buys: [{name: 'Free Spins', cost: null}],
    cited: {
      volatility: ['https://www.vegasslotsonline.com/pragmatic-play/sweet-bonanza-1000/', 'https://www.pokerlistings.com/online-slots/free/sweet-bonanza-1000'],
    },
    text: {
      en: [
        'Sweet Bonanza 1000 is Pragmatic Play’s supercharged sequel to its candy slot: a 6×5 grid where 8 or more identical fruits or sweets pay and set off tumbles, with a published RTP of 96.53% and wins of up to 25,000 times the bet.',
        'Four or more lollipop scatters unlock 10 free spins. In the bonus, candy bomb multipliers land with random values up to 1,000x and stay on screen through the tumbles.',
        'At the end of the sequence the bombs are added together and applied to the total win, and three or more lollipops during the bonus add five more free spins.',
      ],
      fr: [
        'Sweet Bonanza 1000 est la suite survitaminée de la machine à sous à bonbons de Pragmatic Play : une grille 6×5 où 8 fruits ou bonbons identiques ou plus paient et déclenchent des cascades, avec un RTP publié de 96,53 % et des gains jusqu’à 25 000 fois la mise.',
        'Quatre sucettes scatter ou plus débloquent 10 tours gratuits. Pendant le bonus, des bombes multiplicatrices tombent avec des valeurs aléatoires jusqu’à 1 000x et restent à l’écran pendant les cascades.',
        'À la fin de la séquence, les bombes s’additionnent et s’appliquent au gain total ; trois sucettes ou plus pendant le bonus ajoutent cinq tours gratuits.',
      ],
      de: [
        'Sweet Bonanza 1000 ist die aufgeladene Fortsetzung des Candy-Slots von Pragmatic Play: ein 6×5-Raster, auf dem 8 oder mehr gleiche Früchte oder Süßigkeiten zahlen und Tumbles auslösen, mit einem veröffentlichten RTP von 96,53 % und Gewinnen bis zum 25.000-Fachen des Einsatzes.',
        'Vier oder mehr Lutscher-Scatter schalten 10 Freispiele frei. Im Bonus landen Bonbonbomben-Multiplikatoren mit Zufallswerten bis 1.000x und bleiben während der Tumbles stehen.',
        'Am Ende der Folge werden die Bomben addiert und auf den Gesamtgewinn angewendet; drei oder mehr Lutscher im Bonus bringen fünf weitere Freispiele.',
      ],
      es: [
        'Sweet Bonanza 1000 es la secuela reforzada de la tragaperras de caramelos de Pragmatic Play: una cuadrícula de 6×5 donde 8 o más frutas o dulces iguales pagan y provocan cascadas, con un RTP publicado del 96,53 % y premios de hasta 25.000 veces la apuesta.',
        'Cuatro o más piruletas scatter desbloquean 10 giros gratis. En el bono caen bombas multiplicadoras con valores aleatorios de hasta 1.000x que se quedan en pantalla durante las cascadas.',
        'Al final de la secuencia las bombas se suman y se aplican al premio total, y tres o más piruletas durante el bono añaden cinco giros gratis.',
      ],
      pt: [
        'Sweet Bonanza 1000 é a sequência turbinada do slot de doces da Pragmatic Play: uma grade 6×5 em que 8 ou mais frutas ou doces iguais pagam e disparam cascatas, com RTP publicado de 96,53% e ganhos de até 25.000 vezes a aposta.',
        'Quatro ou mais pirulitos scatter liberam 10 rodadas grátis. No bônus caem bombas multiplicadoras com valores aleatórios de até 1.000x, que ficam na tela durante as cascatas.',
        'No fim da sequência as bombas são somadas e aplicadas ao ganho total, e três ou mais pirulitos durante o bônus dão mais cinco rodadas grátis.',
      ],
      it: [
        'Sweet Bonanza 1000 è il seguito potenziato della slot di caramelle di Pragmatic Play: una griglia 6×5 dove 8 o più frutti o dolci uguali pagano e avviano cascate, con un RTP pubblicato del 96,53% e vincite fino a 25.000 volte la puntata.',
        'Quattro o più lecca-lecca scatter sbloccano 10 giri gratis. Nel bonus cadono bombe moltiplicatrici con valori casuali fino a 1.000x, che restano sullo schermo durante le cascate.',
        'Alla fine della sequenza le bombe si sommano e si applicano alla vincita totale, e tre o più lecca-lecca durante il bonus aggiungono cinque giri gratis.',
      ],
    },
  },
  {
    id: 'sugar-rush-1000', name: 'Sugar Rush 1000', provider: 'Pragmatic Play',
    source: 'https://www.pragmaticplay.com/en/games/sugar-rush-1000/', checked: '2026-11-22',
    rtp: [96], volatility: 'high', maxWin: 25000, grid: '7×7 · cluster pays · tumble', buys: [{name: 'Free Spins', cost: null}],
    cited: {
      maxWin: ['https://www.vegasslotsonline.com/pragmatic-play/sugar-rush-1000/', 'https://www.pokerlistings.com/online-slots/free/sugar-rush-1000'],
      volatility: ['https://www.vegasslotsonline.com/pragmatic-play/sugar-rush-1000/', 'https://www.pokerlistings.com/online-slots/free/sugar-rush-1000'],
    },
    text: {
      en: [
        'Sugar Rush 1000 takes Pragmatic Play’s candy cluster slot further: a 7×7 grid where groups of five or more adjacent symbols win and tumble away, with a published RTP of 96.00%.',
        'Every time a winning symbol explodes, its spot is marked. A second explosion on the same spot adds a multiplier that starts at x2 and doubles each time, up to x1,024, applied to every win formed on top of it.',
        'Three or more scatters start at least ten free spins. During the round the marked spots and their multipliers stay in place and keep growing with each tumble, and three more scatters add extra spins.',
      ],
      fr: [
        'Sugar Rush 1000 pousse plus loin la machine à sous à grappes de bonbons de Pragmatic Play : une grille 7×7 où les groupes de cinq symboles adjacents ou plus gagnent et disparaissent en cascade, avec un RTP publié de 96,00 %.',
        'À chaque explosion d’un symbole gagnant, sa case est marquée. Une deuxième explosion sur la même case ajoute un multiplicateur qui part de x2 et double à chaque fois, jusqu’à x1 024, appliqué à tout gain formé par-dessus.',
        'Trois scatters ou plus lancent au moins dix tours gratuits. Pendant le bonus, les cases marquées et leurs multiplicateurs restent en place et continuent de grandir à chaque cascade ; trois scatters de plus ajoutent des tours.',
      ],
      de: [
        'Sugar Rush 1000 führt den Candy-Cluster-Slot von Pragmatic Play weiter: ein 7×7-Raster, auf dem Gruppen aus fünf oder mehr benachbarten Symbolen gewinnen und wegfallen, mit einem veröffentlichten RTP von 96,00 %.',
        'Jedes Mal, wenn ein Gewinnsymbol explodiert, wird sein Feld markiert. Eine zweite Explosion auf demselben Feld fügt einen Multiplikator hinzu, der bei x2 beginnt und sich jedes Mal verdoppelt, bis x1.024, und für jeden Gewinn darauf gilt.',
        'Drei oder mehr Scatter starten mindestens zehn Freispiele. In der Runde bleiben die markierten Felder und ihre Multiplikatoren stehen und wachsen mit jedem Tumble weiter; drei weitere Scatter bringen zusätzliche Drehungen.',
      ],
      es: [
        'Sugar Rush 1000 lleva más lejos la tragaperras de grupos de caramelos de Pragmatic Play: una cuadrícula de 7×7 donde los grupos de cinco o más símbolos adyacentes ganan y caen en cascada, con un RTP publicado del 96,00 %.',
        'Cada vez que explota un símbolo ganador, su casilla queda marcada. Una segunda explosión en la misma casilla añade un multiplicador que empieza en x2 y se duplica cada vez, hasta x1.024, aplicado a cada premio que se forme encima.',
        'Tres o más scatters activan al menos diez giros gratis. Durante la ronda, las casillas marcadas y sus multiplicadores se quedan y siguen creciendo con cada cascada, y tres scatters más añaden giros.',
      ],
      pt: [
        'Sugar Rush 1000 leva mais longe o slot de clusters de doces da Pragmatic Play: uma grade 7×7 em que grupos de cinco ou mais símbolos adjacentes ganham e caem em cascata, com RTP publicado de 96,00%.',
        'Cada vez que um símbolo vencedor explode, sua casa fica marcada. Uma segunda explosão na mesma casa adiciona um multiplicador que começa em x2 e dobra a cada vez, até x1.024, aplicado a todo ganho formado em cima dela.',
        'Três ou mais scatters ativam pelo menos dez rodadas grátis. Durante a rodada, as casas marcadas e seus multiplicadores ficam no lugar e continuam crescendo a cada cascata, e mais três scatters dão rodadas extras.',
      ],
      it: [
        'Sugar Rush 1000 porta oltre la slot a cluster di caramelle di Pragmatic Play: una griglia 7×7 dove gruppi di cinque o più simboli adiacenti vincono e cadono a cascata, con un RTP pubblicato del 96,00%.',
        'Ogni volta che un simbolo vincente esplode, la sua casella viene segnata. Una seconda esplosione sulla stessa casella aggiunge un moltiplicatore che parte da x2 e raddoppia ogni volta, fino a x1.024, applicato a ogni vincita formata sopra.',
        'Tre o più scatter attivano almeno dieci giri gratis. Durante il round le caselle segnate e i loro moltiplicatori restano al loro posto e crescono a ogni cascata, e altri tre scatter aggiungono giri.',
      ],
    },
  },
  {
    id: 'big-bass-splash', name: 'Big Bass Splash', provider: 'Pragmatic Play',
    source: 'https://www.pragmaticplay.com/en/games/big-bass-splash/', checked: '2026-11-22',
    rtp: [96.71], volatility: 'high', maxWin: 5000, grid: '5×3 · 10 paylines', buys: [{name: 'Free Spins', cost: null}],
    cited: {
      maxWin: ['https://www.olbg.com/slots/games/big-bass-splash', 'https://www.vegasslotsonline.com/pragmatic-play/big-bass-splash/', 'https://www.pokerlistings.com/online-slots/free/big-bass-splash'],
      volatility: ['https://www.olbg.com/slots/games/big-bass-splash', 'https://www.vegasslotsonline.com/pragmatic-play/big-bass-splash/', 'https://www.pokerlistings.com/online-slots/free/big-bass-splash'],
      grid: ['https://www.olbg.com/slots/games/big-bass-splash', 'https://www.vegasslotsonline.com/pragmatic-play/big-bass-splash/'],
    },
    text: {
      en: [
        'Big Bass Splash is a fishing slot from Pragmatic Play’s Big Bass series, on five reels with ten paylines and a published RTP of 96.71%.',
        'Three, four or five scatters start 10, 15 or 20 free spins. During the feature, fish money symbols worth up to 5,000x are collected whenever a fisherman wild lands alongside them.',
        'Every fourth wild retriggers the round with 10 more spins and raises the multiplier on collected values: 2x, then 3x, then 10x. Before the free spins begin, up to five random modifiers can add more money symbols, wilds or spins.',
      ],
      fr: [
        'Big Bass Splash est une machine à sous de pêche de la série Big Bass de Pragmatic Play, sur cinq rouleaux et dix lignes, avec un RTP publié de 96,71 %.',
        'Trois, quatre ou cinq scatters lancent 10, 15 ou 20 tours gratuits. Pendant le bonus, les poissons à valeur jusqu’à 5 000x sont récoltés chaque fois qu’un pêcheur wild tombe en même temps.',
        'Chaque quatrième wild relance le bonus avec 10 tours de plus et augmente le multiplicateur des valeurs récoltées : 2x, puis 3x, puis 10x. Avant les tours gratuits, jusqu’à cinq modificateurs aléatoires peuvent ajouter des poissons, des wilds ou des tours.',
      ],
      de: [
        'Big Bass Splash ist ein Angel-Slot aus der Big-Bass-Reihe von Pragmatic Play, auf fünf Walzen mit zehn Gewinnlinien und einem veröffentlichten RTP von 96,71 %.',
        'Drei, vier oder fünf Scatter starten 10, 15 oder 20 Freispiele. Im Feature werden Fisch-Geldsymbole bis 5.000x eingesammelt, wenn gleichzeitig ein Fischer-Wild landet.',
        'Jedes vierte Wild löst die Runde mit 10 weiteren Drehungen neu aus und erhöht den Multiplikator der gesammelten Werte: 2x, dann 3x, dann 10x. Vor den Freispielen können bis zu fünf zufällige Modifikatoren mehr Geldsymbole, Wilds oder Drehungen bringen.',
      ],
      es: [
        'Big Bass Splash es una tragaperras de pesca de la serie Big Bass de Pragmatic Play, con cinco carretes, diez líneas y un RTP publicado del 96,71 %.',
        'Tres, cuatro o cinco scatters activan 10, 15 o 20 giros gratis. Durante el bono, los peces con valor de hasta 5.000x se recogen cada vez que cae a la vez un pescador wild.',
        'Cada cuarto wild reactiva la ronda con 10 giros más y sube el multiplicador de los valores recogidos: 2x, luego 3x y luego 10x. Antes de los giros gratis, hasta cinco modificadores aleatorios pueden añadir peces, wilds o giros.',
      ],
      pt: [
        'Big Bass Splash é um slot de pesca da série Big Bass da Pragmatic Play, com cinco rolos, dez linhas e RTP publicado de 96,71%.',
        'Três, quatro ou cinco scatters ativam 10, 15 ou 20 rodadas grátis. Durante o bônus, peixes com valor de até 5.000x são coletados sempre que um pescador wild cai junto.',
        'Cada quarto wild reativa a rodada com mais 10 giros e aumenta o multiplicador dos valores coletados: 2x, depois 3x, depois 10x. Antes das rodadas grátis, até cinco modificadores aleatórios podem acrescentar peixes, wilds ou giros.',
      ],
      it: [
        'Big Bass Splash è una slot di pesca della serie Big Bass di Pragmatic Play, con cinque rulli, dieci linee e un RTP pubblicato del 96,71%.',
        'Tre, quattro o cinque scatter attivano 10, 15 o 20 giri gratis. Durante il bonus i pesci con valori fino a 5.000x vengono raccolti ogni volta che cade insieme un pescatore wild.',
        'Ogni quarto wild riattiva il round con 10 giri in più e alza il moltiplicatore dei valori raccolti: 2x, poi 3x, poi 10x. Prima dei giri gratis, fino a cinque modificatori casuali possono aggiungere pesci, wild o giri.',
      ],
    },
  },
  {
    id: 'the-dog-house-megaways', name: 'The Dog House Megaways', provider: 'Pragmatic Play',
    source: 'https://www.pragmaticplay.com/en/games/the-dog-house-megaways/', checked: '2026-11-22',
    rtp: [96.55], volatility: '', maxWin: 12305, grid: '6 reels · up to 117,649 ways', buys: [{name: 'Free Spins', cost: null}],
    cited: {
      maxWin: ['https://www.olbg.com/slots/games/the-dog-house-megaways', 'https://www.pokerlistings.com/online-slots/free/the-dog-house-megaways'],
    },
    text: {
      en: [
        'The Dog House Megaways is Pragmatic Play’s Megaways version of its dog-themed slot, with up to 117,649 ways to win and a published RTP of 96.55%.',
        'Wilds on reels 2 to 5 carry a 2x or 3x win multiplier. Three to six scatters let you choose one of two bonus games.',
        'Sticky Wilds gives 7 to 20 free spins with wilds that stay in place and resize as the Megaways reels change. Raining Wilds gives 15 to 30 free spins where up to six wilds drop on random positions each spin.',
      ],
      fr: [
        'The Dog House Megaways est la version Megaways de la machine à sous canine de Pragmatic Play, avec jusqu’à 117 649 façons de gagner et un RTP publié de 96,55 %.',
        'Les wilds des rouleaux 2 à 5 portent un multiplicateur de gain de 2x ou 3x. Trois à six scatters permettent de choisir l’un des deux bonus.',
        'Sticky Wilds donne 7 à 20 tours gratuits avec des wilds qui restent en place et changent de taille avec les rouleaux Megaways. Raining Wilds donne 15 à 30 tours gratuits où jusqu’à six wilds tombent sur des positions au hasard à chaque tour.',
      ],
      de: [
        'The Dog House Megaways ist die Megaways-Version des Hunde-Slots von Pragmatic Play, mit bis zu 117.649 Gewinnwegen und einem veröffentlichten RTP von 96,55 %.',
        'Wilds auf den Walzen 2 bis 5 tragen einen Gewinnmultiplikator von 2x oder 3x. Drei bis sechs Scatter lassen dich eines von zwei Bonusspielen wählen.',
        'Sticky Wilds bringt 7 bis 20 Freispiele mit Wilds, die liegen bleiben und sich mit den Megaways-Walzen in der Größe ändern. Raining Wilds bringt 15 bis 30 Freispiele, in denen bis zu sechs Wilds pro Drehung auf zufällige Positionen fallen.',
      ],
      es: [
        'The Dog House Megaways es la versión Megaways de la tragaperras perruna de Pragmatic Play, con hasta 117.649 formas de ganar y un RTP publicado del 96,55 %.',
        'Los wilds de los carretes 2 a 5 llevan un multiplicador de premio de 2x o 3x. De tres a seis scatters permiten elegir uno de los dos bonos.',
        'Sticky Wilds da de 7 a 20 giros gratis con wilds que se quedan fijos y cambian de tamaño con los carretes Megaways. Raining Wilds da de 15 a 30 giros gratis en los que hasta seis wilds caen en posiciones al azar en cada giro.',
      ],
      pt: [
        'The Dog House Megaways é a versão Megaways do slot de cachorros da Pragmatic Play, com até 117.649 formas de ganhar e RTP publicado de 96,55%.',
        'Os wilds dos rolos 2 a 5 têm multiplicador de ganho de 2x ou 3x. De três a seis scatters permitem escolher um de dois bônus.',
        'Sticky Wilds dá de 7 a 20 rodadas grátis com wilds que ficam fixos e mudam de tamanho com os rolos Megaways. Raining Wilds dá de 15 a 30 rodadas grátis em que até seis wilds caem em posições aleatórias a cada giro.',
      ],
      it: [
        'The Dog House Megaways è la versione Megaways della slot a tema cani di Pragmatic Play, con fino a 117.649 modi di vincere e un RTP pubblicato del 96,55%.',
        'I wild sui rulli da 2 a 5 hanno un moltiplicatore di vincita di 2x o 3x. Da tre a sei scatter fanno scegliere uno dei due bonus.',
        'Sticky Wilds dà da 7 a 20 giri gratis con wild che restano fermi e cambiano dimensione con i rulli Megaways. Raining Wilds dà da 15 a 30 giri gratis in cui fino a sei wild cadono in posizioni casuali a ogni giro.',
      ],
    },
  },
  {
    id: 'madame-destiny-megaways', name: 'Madame Destiny Megaways', provider: 'Pragmatic Play',
    source: 'https://www.pragmaticplay.com/en/games/madame-destiny-megaways/', checked: '2026-11-22',
    rtp: [96.56], volatility: '', maxWin: 5000, grid: '6 reels · Megaways', buys: [{name: 'Free Spins', cost: null}],
    cited: {
      maxWin: ['https://www.olbg.com/slots/games/madame-destiny-megaways', 'https://www.pokerlistings.com/online-slots/free/madame-destiny-megaways'],
    },
    text: {
      en: [
        'Madame Destiny Megaways is Pragmatic Play’s fortune-teller slot on an expanded Megaways grid, with black cats, candles and tarot cards and a published RTP of 96.56%.',
        'Madame Destiny is the wild: she doubles any winning line she is part of. Three to six crystal-ball scatters trigger the free spins and also pay 5x to 100x the stake.',
        'The feature opens with a wheel of fortune that sets up to 12 free spins and a win multiplier of up to 25x for the round.',
      ],
      fr: [
        'Madame Destiny Megaways est la machine à sous de voyante de Pragmatic Play sur une grille Megaways agrandie, avec chats noirs, bougies et cartes de tarot, et un RTP publié de 96,56 %.',
        'Madame Destiny est le wild : elle double toute ligne gagnante dont elle fait partie. Trois à six scatters boule de cristal lancent les tours gratuits et paient aussi 5x à 100x la mise.',
        'Le bonus s’ouvre sur une roue de la fortune qui fixe jusqu’à 12 tours gratuits et un multiplicateur de gain jusqu’à 25x pour la séquence.',
      ],
      de: [
        'Madame Destiny Megaways ist der Wahrsager-Slot von Pragmatic Play auf einem erweiterten Megaways-Raster, mit schwarzen Katzen, Kerzen und Tarotkarten und einem veröffentlichten RTP von 96,56 %.',
        'Madame Destiny ist das Wild: Sie verdoppelt jede Gewinnlinie, an der sie beteiligt ist. Drei bis sechs Kristallkugel-Scatter lösen die Freispiele aus und zahlen zusätzlich das 5- bis 100-Fache des Einsatzes.',
        'Das Feature beginnt mit einem Glücksrad, das bis zu 12 Freispiele und einen Gewinnmultiplikator bis 25x für die Runde festlegt.',
      ],
      es: [
        'Madame Destiny Megaways es la tragaperras de la adivina de Pragmatic Play en una cuadrícula Megaways ampliada, con gatos negros, velas y cartas de tarot, y un RTP publicado del 96,56 %.',
        'Madame Destiny es el wild: duplica cualquier línea ganadora en la que participa. De tres a seis scatters de bola de cristal activan los giros gratis y además pagan de 5x a 100x la apuesta.',
        'El bono empieza con una rueda de la fortuna que fija hasta 12 giros gratis y un multiplicador de premio de hasta 25x para la ronda.',
      ],
      pt: [
        'Madame Destiny Megaways é o slot da cartomante da Pragmatic Play numa grade Megaways ampliada, com gatos pretos, velas e cartas de tarô e RTP publicado de 96,56%.',
        'Madame Destiny é o wild: ela dobra qualquer linha vencedora de que faz parte. De três a seis scatters de bola de cristal ativam as rodadas grátis e ainda pagam de 5x a 100x a aposta.',
        'O bônus começa com uma roda da fortuna que define até 12 rodadas grátis e um multiplicador de ganho de até 25x para a rodada.',
      ],
      it: [
        'Madame Destiny Megaways è la slot della chiromante di Pragmatic Play su una griglia Megaways ampliata, con gatti neri, candele e tarocchi e un RTP pubblicato del 96,56%.',
        'Madame Destiny è il wild: raddoppia ogni linea vincente di cui fa parte. Da tre a sei scatter sfera di cristallo attivano i giri gratis e pagano anche da 5x a 100x la puntata.',
        'Il bonus si apre con una ruota della fortuna che fissa fino a 12 giri gratis e un moltiplicatore di vincita fino a 25x per il round.',
      ],
    },
  },
  {
    id: 'sweet-rush-bonanza', name: 'Sweet Rush Bonanza', provider: 'Pragmatic Play',
    source: 'https://www.pragmaticplay.com/en/games/sweet-rush-bonanza/', checked: '2026-11-22',
    rtp: [96.5], volatility: '', maxWin: 5000, grid: '6×5 · pays anywhere · tumble', buys: [{name: 'Free Spins', cost: null}, {name: 'Free Spins with 2x multipliers', cost: null}],
    cited: {
      maxWin: ['https://www.olbg.com/slots/games/sweet-rush-bonanza', 'https://www.pokerlistings.com/online-slots/free/sweet-rush-bonanza'],
      grid: ['https://www.olbg.com/slots/games/sweet-rush-bonanza'],
    },
    text: {
      en: [
        'Sweet Rush Bonanza is a Pragmatic Play candy slot where 8 to 12 or more matching symbols win anywhere on the grid, up to 50x in the base game, with a published RTP of 96.50%.',
        'Winning symbols mark their spot. Each new hit on a marked spot in the same spin grows a multiplier that starts at 2x and doubles up to 128x; when several multipliers touch one win, they are added together.',
        'Four or more scatters start 10 free spins where marked spots and multipliers stay between spins. Pragmatic lists three ante bets and two bonus buys, one of which adds 2x multipliers on every position.',
      ],
      fr: [
        'Sweet Rush Bonanza est une machine à sous de bonbons de Pragmatic Play où 8 à 12 symboles identiques ou plus gagnent n’importe où sur la grille, jusqu’à 50x dans le jeu de base, avec un RTP publié de 96,50 %.',
        'Les symboles gagnants marquent leur case. Chaque nouveau gain sur une case marquée pendant le même tour fait grandir un multiplicateur qui part de 2x et double jusqu’à 128x ; quand plusieurs multiplicateurs touchent un même gain, ils s’additionnent.',
        'Quatre scatters ou plus lancent 10 tours gratuits où les cases marquées et les multiplicateurs restent d’un tour à l’autre. Pragmatic indique trois mises ante et deux achats de bonus, dont l’un ajoute des multiplicateurs 2x sur toutes les positions.',
      ],
      de: [
        'Sweet Rush Bonanza ist ein Candy-Slot von Pragmatic Play, in dem 8 bis 12 oder mehr gleiche Symbole überall auf dem Raster gewinnen, bis 50x im Basisspiel, mit einem veröffentlichten RTP von 96,50 %.',
        'Gewinnsymbole markieren ihr Feld. Jeder weitere Treffer auf einem markierten Feld in derselben Drehung lässt einen Multiplikator wachsen, der bei 2x beginnt und sich bis 128x verdoppelt; berühren mehrere Multiplikatoren einen Gewinn, werden sie addiert.',
        'Vier oder mehr Scatter starten 10 Freispiele, in denen markierte Felder und Multiplikatoren zwischen den Drehungen bleiben. Pragmatic nennt drei Ante-Wetten und zwei Bonuskäufe, von denen einer 2x-Multiplikatoren auf allen Positionen hinzufügt.',
      ],
      es: [
        'Sweet Rush Bonanza es una tragaperras de caramelos de Pragmatic Play donde de 8 a 12 o más símbolos iguales ganan en cualquier lugar de la cuadrícula, hasta 50x en el juego base, con un RTP publicado del 96,50 %.',
        'Los símbolos ganadores marcan su casilla. Cada nuevo acierto en una casilla marcada durante el mismo giro hace crecer un multiplicador que empieza en 2x y se duplica hasta 128x; si varios multiplicadores tocan un mismo premio, se suman.',
        'Cuatro o más scatters activan 10 giros gratis en los que las casillas marcadas y los multiplicadores se mantienen entre giros. Pragmatic indica tres apuestas ante y dos compras de bono, una de las cuales añade multiplicadores 2x en todas las posiciones.',
      ],
      pt: [
        'Sweet Rush Bonanza é um slot de doces da Pragmatic Play em que de 8 a 12 ou mais símbolos iguais ganham em qualquer lugar da grade, até 50x no jogo base, com RTP publicado de 96,50%.',
        'Os símbolos vencedores marcam sua casa. Cada novo acerto numa casa marcada no mesmo giro faz crescer um multiplicador que começa em 2x e dobra até 128x; quando vários multiplicadores tocam o mesmo ganho, eles são somados.',
        'Quatro ou mais scatters ativam 10 rodadas grátis em que as casas marcadas e os multiplicadores ficam de um giro para o outro. A Pragmatic indica três apostas ante e duas compras de bônus, uma delas acrescentando multiplicadores 2x em todas as posições.',
      ],
      it: [
        'Sweet Rush Bonanza è una slot di caramelle di Pragmatic Play dove da 8 a 12 o più simboli uguali vincono ovunque sulla griglia, fino a 50x nel gioco base, con un RTP pubblicato del 96,50%.',
        'I simboli vincenti segnano la loro casella. Ogni nuova vincita su una casella segnata nello stesso giro fa crescere un moltiplicatore che parte da 2x e raddoppia fino a 128x; se più moltiplicatori toccano la stessa vincita, si sommano.',
        'Quattro o più scatter attivano 10 giri gratis in cui caselle segnate e moltiplicatori restano tra un giro e l’altro. Pragmatic indica tre puntate ante e due acquisti del bonus, uno dei quali aggiunge moltiplicatori 2x su tutte le posizioni.',
      ],
    },
  },
  {
    id: 'sugar-rush', name: 'Sugar Rush', provider: 'Pragmatic Play',
    source: 'https://www.pragmaticplay.com/en/games/sugar-rush/', checked: '2026-11-22',
    rtp: [96.5], volatility: 'high', maxWin: 5000, grid: '7×7 · cluster pays · tumble', buys: [{name: 'Free Spins', cost: null}],
    cited: {
      maxWin: ['https://www.olbg.com/slots/games/sugar-rush', 'https://www.pokerlistings.com/online-slots/free/sugar-rush'],
      volatility: ['https://www.olbg.com/slots/games/sugar-rush', 'https://www.pokerlistings.com/online-slots/free/sugar-rush'],
      grid: ['https://www.olbg.com/slots/games/sugar-rush'],
    },
    text: {
      en: [
        'Sugar Rush is the original of Pragmatic Play’s candy cluster slots: gummy bears and jellybeans on tumbling reels, where clusters of 5 to 15 or more matching symbols pay up to 150x, with a published RTP of 96.50%.',
        'A winning cluster marks the spots its symbols occupied. Each further win on a marked spot in the same spin adds a multiplier that starts at 2x and doubles up to 128x.',
        'Three to seven scatters give 10, 12, 15, 20 or 30 free spins, and during the feature the marked spots and their multipliers stay for the whole round.',
      ],
      fr: [
        'Sugar Rush est l’original des machines à sous à grappes de bonbons de Pragmatic Play : oursons et dragées sur des rouleaux en cascade, où les grappes de 5 à 15 symboles identiques ou plus paient jusqu’à 150x, avec un RTP publié de 96,50 %.',
        'Une grappe gagnante marque les cases occupées par ses symboles. Chaque nouveau gain sur une case marquée pendant le même tour ajoute un multiplicateur qui part de 2x et double jusqu’à 128x.',
        'Trois à sept scatters donnent 10, 12, 15, 20 ou 30 tours gratuits, et pendant le bonus les cases marquées et leurs multiplicateurs restent toute la séquence.',
      ],
      de: [
        'Sugar Rush ist das Original der Candy-Cluster-Slots von Pragmatic Play: Gummibärchen und Jellybeans auf Tumble-Walzen, auf denen Cluster aus 5 bis 15 oder mehr gleichen Symbolen bis 150x zahlen, mit einem veröffentlichten RTP von 96,50 %.',
        'Ein Gewinn-Cluster markiert die Felder seiner Symbole. Jeder weitere Gewinn auf einem markierten Feld in derselben Drehung fügt einen Multiplikator hinzu, der bei 2x beginnt und sich bis 128x verdoppelt.',
        'Drei bis sieben Scatter bringen 10, 12, 15, 20 oder 30 Freispiele, und im Feature bleiben die markierten Felder und ihre Multiplikatoren die ganze Runde stehen.',
      ],
      es: [
        'Sugar Rush es el original de las tragaperras de grupos de caramelos de Pragmatic Play: ositos de goma y gominolas en carretes en cascada, donde grupos de 5 a 15 o más símbolos iguales pagan hasta 150x, con un RTP publicado del 96,50 %.',
        'Un grupo ganador marca las casillas que ocupaban sus símbolos. Cada nuevo premio en una casilla marcada durante el mismo giro añade un multiplicador que empieza en 2x y se duplica hasta 128x.',
        'De tres a siete scatters dan 10, 12, 15, 20 o 30 giros gratis, y durante el bono las casillas marcadas y sus multiplicadores se mantienen toda la ronda.',
      ],
      pt: [
        'Sugar Rush é o original dos slots de clusters de doces da Pragmatic Play: ursinhos de goma e jujubas em rolos em cascata, onde clusters de 5 a 15 ou mais símbolos iguais pagam até 150x, com RTP publicado de 96,50%.',
        'Um cluster vencedor marca as casas ocupadas por seus símbolos. Cada novo ganho numa casa marcada no mesmo giro adiciona um multiplicador que começa em 2x e dobra até 128x.',
        'De três a sete scatters dão 10, 12, 15, 20 ou 30 rodadas grátis, e durante o bônus as casas marcadas e seus multiplicadores ficam a rodada inteira.',
      ],
      it: [
        'Sugar Rush è l’originale delle slot a cluster di caramelle di Pragmatic Play: orsetti gommosi e gelatine su rulli a cascata, dove cluster di 5–15 o più simboli uguali pagano fino a 150x, con un RTP pubblicato del 96,50%.',
        'Un cluster vincente segna le caselle occupate dai suoi simboli. Ogni nuova vincita su una casella segnata nello stesso giro aggiunge un moltiplicatore che parte da 2x e raddoppia fino a 128x.',
        'Da tre a sette scatter danno 10, 12, 15, 20 o 30 giri gratis, e durante il bonus le caselle segnate e i loro moltiplicatori restano per tutto il round.',
      ],
    },
  },
  {
    id: 'mental', name: 'Mental', provider: 'Nolimit City',
    source: 'https://nolimitcity.com/games/mental', checked: '2026-11-22',
    rtp: [96.08], volatility: 'extreme', maxWin: 66666, grid: '3–5 rows · xWays', buys: [{name: 'Feature buy', cost: null}], hit: 34.19, fsOdds: "1 in 216", maxOdds: "1 in 18,000,000",
    cited: {

    },
    text: {
      en: [
        'Mental is Nolimit City’s asylum slot, a dark sepia-toned game released in August 2021 with a published RTP of 96.08% and an Extreme volatility rating from the studio itself.',
        'Its grid shifts and grows as you spin. Fire Frames can ignite on random positions and split symbols, while Nolimit’s xWays and xNudge mechanics and the Dead Patients feature keep changing the board.',
        'Nolimit caps the game at 66,666 times the bet and puts the odds of reaching it at about 1 in 18 million. It lists a hit frequency of 34.19%, free spins about once in 216 spins, and a feature buy.',
      ],
      fr: [
        'Mental est la machine à sous de l’asile chez Nolimit City, un jeu sombre aux tons sépia sorti en août 2021, avec un RTP publié de 96,08 % et une volatilité classée Extrême par le studio lui-même.',
        'Sa grille bouge et grandit au fil des tours. Des Fire Frames peuvent s’allumer sur des positions au hasard et dédoubler des symboles, tandis que les mécaniques xWays et xNudge de Nolimit et la fonction Dead Patients modifient sans cesse le plateau.',
        'Nolimit plafonne le jeu à 66 666 fois la mise et estime la probabilité de l’atteindre à environ 1 sur 18 millions. Il indique une fréquence de gain de 34,19 %, des tours gratuits environ une fois tous les 216 tours, et un achat de bonus.',
      ],
      de: [
        'Mental ist der Psychiatrie-Slot von Nolimit City, ein düsteres Spiel in Sepiatönen, erschienen im August 2021, mit einem veröffentlichten RTP von 96,08 % und einer vom Studio selbst vergebenen Volatilität „Extreme“.',
        'Das Raster verändert und vergrößert sich mit jeder Drehung. Fire Frames können auf zufälligen Positionen aufflammen und Symbole teilen, während Nolimits xWays- und xNudge-Mechaniken und das Feature Dead Patients das Feld ständig umbauen.',
        'Nolimit begrenzt das Spiel auf das 66.666-Fache des Einsatzes und beziffert die Chance darauf mit etwa 1 zu 18 Millionen. Angegeben sind eine Trefferquote von 34,19 %, Freispiele etwa alle 216 Drehungen und ein Feature-Kauf.',
      ],
      es: [
        'Mental es la tragaperras del manicomio de Nolimit City, un juego oscuro en tonos sepia lanzado en agosto de 2021, con un RTP publicado del 96,08 % y una volatilidad calificada de Extrema por el propio estudio.',
        'Su cuadrícula cambia y crece con cada giro. Los Fire Frames pueden encenderse en posiciones al azar y dividir símbolos, mientras las mecánicas xWays y xNudge de Nolimit y la función Dead Patients transforman el tablero sin parar.',
        'Nolimit limita el juego a 66.666 veces la apuesta y sitúa la probabilidad de alcanzarlo en cerca de 1 entre 18 millones. Indica una frecuencia de premio del 34,19 %, giros gratis aproximadamente una vez cada 216 giros y una compra de función.',
      ],
      pt: [
        'Mental é o slot do hospício da Nolimit City, um jogo sombrio em tons sépia lançado em agosto de 2021, com RTP publicado de 96,08% e volatilidade classificada como Extrema pelo próprio estúdio.',
        'A grade muda e cresce a cada giro. Fire Frames podem acender em posições aleatórias e dividir símbolos, enquanto as mecânicas xWays e xNudge da Nolimit e o recurso Dead Patients transformam o tabuleiro o tempo todo.',
        'A Nolimit limita o jogo a 66.666 vezes a aposta e estima a chance de chegar lá em cerca de 1 em 18 milhões. Indica frequência de acerto de 34,19%, rodadas grátis mais ou menos uma vez a cada 216 giros e compra de bônus.',
      ],
      it: [
        'Mental è la slot del manicomio di Nolimit City, un gioco cupo in toni seppia uscito ad agosto 2021, con un RTP pubblicato del 96,08% e una volatilità classificata Estrema dallo studio stesso.',
        'La griglia cambia e cresce a ogni giro. I Fire Frames possono accendersi su posizioni casuali e dividere i simboli, mentre le meccaniche xWays e xNudge di Nolimit e la funzione Dead Patients trasformano di continuo il tabellone.',
        'Nolimit limita il gioco a 66.666 volte la puntata e stima la probabilità di arrivarci in circa 1 su 18 milioni. Indica una frequenza di vincita del 34,19%, giri gratis circa una volta ogni 216 giri e un acquisto della funzione.',
      ],
    },
  },
  {
    id: 'san-quentin', name: 'San Quentin xWays', provider: 'Nolimit City',
    source: 'https://nolimitcity.com/games/san-quentin', checked: '2026-11-22',
    rtp: [96.03], volatility: 'extreme', maxWin: 150000, grid: '5×3 · xWays', buys: [{name: 'Feature buy', cost: null}], hit: 34.25, fsOdds: "1 in 230",
    cited: {

    },
    text: {
      en: [
        'San Quentin xWays is Nolimit City’s maximum-security prison slot, released in January 2021, with a published RTP of 96.03% and an Extreme volatility rating from the studio.',
        'The action starts on a 5×3 reel layout that can expand quickly as special symbols land, with the convicts Crazy Joe Labrador and Beefy Dick among the characters.',
        'Its top prize, the Psycho Manhunt, pays 150,000 times the base bet and ends the round. Nolimit lists a hit frequency of 34.25%, free spins about once in 230 spins, and a feature buy.',
      ],
      fr: [
        'San Quentin xWays est la machine à sous de prison de haute sécurité de Nolimit City, sortie en janvier 2021, avec un RTP publié de 96,03 % et une volatilité classée Extrême par le studio.',
        'L’action démarre sur une grille 5×3 qui peut s’agrandir vite quand des symboles spéciaux tombent, avec les détenus Crazy Joe Labrador et Beefy Dick parmi les personnages.',
        'Son gain maximal, le Psycho Manhunt, paie 150 000 fois la mise de base et met fin à la partie. Nolimit indique une fréquence de gain de 34,25 %, des tours gratuits environ une fois tous les 230 tours, et un achat de bonus.',
      ],
      de: [
        'San Quentin xWays ist der Hochsicherheitsgefängnis-Slot von Nolimit City, erschienen im Januar 2021, mit einem veröffentlichten RTP von 96,03 % und einer vom Studio vergebenen Volatilität „Extreme“.',
        'Gespielt wird auf einem 5×3-Raster, das sich schnell vergrößern kann, wenn Spezialsymbole landen; zu den Figuren gehören die Häftlinge Crazy Joe Labrador und Beefy Dick.',
        'Der Höchstgewinn, die Psycho Manhunt, zahlt das 150.000-Fache des Grundeinsatzes und beendet die Runde. Nolimit nennt eine Trefferquote von 34,25 %, Freispiele etwa alle 230 Drehungen und einen Feature-Kauf.',
      ],
      es: [
        'San Quentin xWays es la tragaperras de la prisión de máxima seguridad de Nolimit City, lanzada en enero de 2021, con un RTP publicado del 96,03 % y una volatilidad calificada de Extrema por el estudio.',
        'La acción empieza en una cuadrícula de 5×3 que puede crecer rápido cuando caen símbolos especiales, con los presos Crazy Joe Labrador y Beefy Dick entre los personajes.',
        'Su premio máximo, la Psycho Manhunt, paga 150.000 veces la apuesta base y termina la ronda. Nolimit indica una frecuencia de premio del 34,25 %, giros gratis aproximadamente una vez cada 230 giros y una compra de función.',
      ],
      pt: [
        'San Quentin xWays é o slot da prisão de segurança máxima da Nolimit City, lançado em janeiro de 2021, com RTP publicado de 96,03% e volatilidade classificada como Extrema pelo estúdio.',
        'A ação começa numa grade 5×3 que pode crescer rápido quando caem símbolos especiais, com os presos Crazy Joe Labrador e Beefy Dick entre os personagens.',
        'O prêmio máximo, a Psycho Manhunt, paga 150.000 vezes a aposta base e encerra a rodada. A Nolimit indica frequência de acerto de 34,25%, rodadas grátis mais ou menos uma vez a cada 230 giros e compra de bônus.',
      ],
      it: [
        'San Quentin xWays è la slot del carcere di massima sicurezza di Nolimit City, uscita a gennaio 2021, con un RTP pubblicato del 96,03% e una volatilità classificata Estrema dallo studio.',
        'L’azione parte da una griglia 5×3 che può allargarsi in fretta quando cadono simboli speciali, con i detenuti Crazy Joe Labrador e Beefy Dick tra i personaggi.',
        'La vincita massima, la Psycho Manhunt, paga 150.000 volte la puntata base e chiude il round. Nolimit indica una frequenza di vincita del 34,25%, giri gratis circa una volta ogni 230 giri e un acquisto della funzione.',
      ],
    },
  },
  {
    id: 'fire-in-the-hole', name: 'Fire in the Hole xBomb', provider: 'Nolimit City',
    source: 'https://nolimitcity.com/games/fire-in-the-hole', checked: '2026-11-22',
    rtp: [96.06], volatility: 'extreme', maxWin: 60000, grid: '6×3 to 6×6 · 64 to 46,656 ways', buys: [{name: 'Feature buy', cost: null}], hit: 25.98, fsOdds: "1 in 200", maxOdds: "1 in 2,400,000",
    cited: {

    },
    text: {
      en: [
        'Fire in the Hole xBomb is Nolimit City’s mining slot, released in March 2021, with a published RTP of 96.06% and an Extreme volatility rating from the studio.',
        'The grid starts at 6×3 with 64 ways to win and can expand to 6×6 with up to 46,656 ways. Its Collapsing Mine feature triggers consecutive cascades on every winning spin or explosion, with exploding wilds clearing the way.',
        'Nolimit caps the game at 60,000 times the bet and puts the odds of reaching it at about 1 in 2.4 million. It lists a hit frequency of 25.98%, free spins about once in 200 spins, and a feature buy.',
      ],
      fr: [
        'Fire in the Hole xBomb est la machine à sous minière de Nolimit City, sortie en mars 2021, avec un RTP publié de 96,06 % et une volatilité classée Extrême par le studio.',
        'La grille démarre en 6×3 avec 64 façons de gagner et peut s’étendre à 6×6 avec jusqu’à 46 656 façons. La fonction Collapsing Mine déclenche des cascades successives à chaque gain ou explosion, avec des wilds explosifs qui ouvrent le passage.',
        'Nolimit plafonne le jeu à 60 000 fois la mise et estime la probabilité de l’atteindre à environ 1 sur 2,4 millions. Il indique une fréquence de gain de 25,98 %, des tours gratuits environ une fois tous les 200 tours, et un achat de bonus.',
      ],
      de: [
        'Fire in the Hole xBomb ist der Bergbau-Slot von Nolimit City, erschienen im März 2021, mit einem veröffentlichten RTP von 96,06 % und einer vom Studio vergebenen Volatilität „Extreme“.',
        'Das Raster beginnt bei 6×3 mit 64 Gewinnwegen und kann auf 6×6 mit bis zu 46.656 Wegen wachsen. Das Feature Collapsing Mine löst bei jedem Gewinn oder jeder Explosion aufeinanderfolgende Kaskaden aus, explodierende Wilds räumen den Weg frei.',
        'Nolimit begrenzt das Spiel auf das 60.000-Fache des Einsatzes und beziffert die Chance darauf mit etwa 1 zu 2,4 Millionen. Angegeben sind eine Trefferquote von 25,98 %, Freispiele etwa alle 200 Drehungen und ein Feature-Kauf.',
      ],
      es: [
        'Fire in the Hole xBomb es la tragaperras minera de Nolimit City, lanzada en marzo de 2021, con un RTP publicado del 96,06 % y una volatilidad calificada de Extrema por el estudio.',
        'La cuadrícula empieza en 6×3 con 64 formas de ganar y puede ampliarse a 6×6 con hasta 46.656 formas. La función Collapsing Mine provoca cascadas sucesivas en cada premio o explosión, con wilds explosivos que abren camino.',
        'Nolimit limita el juego a 60.000 veces la apuesta y sitúa la probabilidad de alcanzarlo en cerca de 1 entre 2,4 millones. Indica una frecuencia de premio del 25,98 %, giros gratis aproximadamente una vez cada 200 giros y una compra de función.',
      ],
      pt: [
        'Fire in the Hole xBomb é o slot de mineração da Nolimit City, lançado em março de 2021, com RTP publicado de 96,06% e volatilidade classificada como Extrema pelo estúdio.',
        'A grade começa em 6×3 com 64 formas de ganhar e pode crescer até 6×6 com até 46.656 formas. O recurso Collapsing Mine dispara cascatas seguidas a cada ganho ou explosão, com wilds explosivos abrindo caminho.',
        'A Nolimit limita o jogo a 60.000 vezes a aposta e estima a chance de chegar lá em cerca de 1 em 2,4 milhões. Indica frequência de acerto de 25,98%, rodadas grátis mais ou menos uma vez a cada 200 giros e compra de bônus.',
      ],
      it: [
        'Fire in the Hole xBomb è la slot mineraria di Nolimit City, uscita a marzo 2021, con un RTP pubblicato del 96,06% e una volatilità classificata Estrema dallo studio.',
        'La griglia parte da 6×3 con 64 modi di vincere e può allargarsi a 6×6 con fino a 46.656 modi. La funzione Collapsing Mine attiva cascate consecutive a ogni vincita o esplosione, con wild esplosivi che aprono la strada.',
        'Nolimit limita il gioco a 60.000 volte la puntata e stima la probabilità di arrivarci in circa 1 su 2,4 milioni. Indica una frequenza di vincita del 25,98%, giri gratis circa una volta ogni 200 giri e un acquisto della funzione.',
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
  vol: Record<string, string>; volNa: string; hitL: string; fsL: string; maxOddsL: string; rtpNote1: string; cited: string; indexT: string; indexH: string; indexD: string; indexP: string; watch: string};
export const SL: Record<Lang, L> = {
  en: {crumb: 'Slots', title: '{name} Slot – Max Win {max}x, RTP & Bonus Buys', h1: '{name}: max win, RTP and bonus games',
    desc: '{name} by {provider}: max win {max}x, RTP up to {rtp}%, volatility {vol}, {n} bonus games. Official figures checked {date}, plus our verified live wins. 18+.',
    provider: 'Provider', maxWin: 'Max win', rtp: 'RTP', volatility: 'Volatility', grid: 'Grid', bonus: 'Bonus games', buyPrice: 'Bonus buy price',
    buyUnknown: 'Shown in the game’s buy menu; {provider} does not publish it, so we don’t print a guess.', rtpNote: '{provider} publishes these RTP versions; the casino picks one, and the game’s info screen shows which.',
    source: 'Source: official {provider} game page, checked {date}.', about: 'About the game', ourWins: 'Our verified wins on {name}', noWins: 'No verified win on this game in our rankings yet.',
    playAt: '{provider} games are available at {casino}', cols: ['Date', 'Streamer', 'Multiplier', 'Bet'], vol: {"high": "High", "very-high": "Very high", "medium": "Medium", "low": "Low", "extreme": "Extreme"}, volNa: "Not published consistently: sources disagree, so we leave it blank.", hitL: "Hit frequency", fsL: "Free spins", maxOddsL: "Max win odds", rtpNote1: "The value {provider} publishes; some casinos run a lower version, shown in the game’s info screen.", cited: "Not on the provider’s page; the same value at {links}, checked {date}.", indexT: "Slot Games – Max Win, RTP & Bonus Buys by Provider", indexH: "Slot games: max win, RTP and bonus buys", indexD: "Max win, RTP, volatility and bonus buy prices of popular slots, from official provider data and checked sources, with our verified live wins. 18+.", indexP: "Every figure comes from the provider’s official game page or from at least two sources that agree, with the date we checked it. Where a figure isn’t published, we leave it blank.", watch: "Video"},
  fr: {crumb: 'Machines à sous', title: '{name} – gain max {max}x, RTP et bonus achetés', h1: '{name} : gain maximal, RTP et bonus',
    desc: '{name} de {provider} : gain max {max}x, RTP jusqu’à {rtp} %, volatilité {vol}, {n} bonus. Chiffres officiels relevés le {date}, et nos gains vérifiés en live. 18+.',
    provider: 'Éditeur', maxWin: 'Gain maximal', rtp: 'RTP', volatility: 'Volatilité', grid: 'Grille', bonus: 'Bonus', buyPrice: 'Prix du bonus acheté',
    buyUnknown: 'Affiché dans le menu d’achat du jeu ; {provider} ne le publie pas, donc nous n’affichons pas d’estimation.', rtpNote: '{provider} publie ces versions de RTP ; le casino en choisit une, visible dans l’écran d’infos du jeu.',
    source: 'Source : fiche officielle de {provider}, relevée le {date}.', about: 'Le jeu', ourWins: 'Nos gains vérifiés sur {name}', noWins: 'Pas encore de gain vérifié sur ce jeu dans nos classements.',
    playAt: 'Les jeux {provider} sont disponibles sur {casino}', cols: ['Date', 'Streamer', 'Multiplicateur', 'Mise'], vol: {"high": "Élevée", "very-high": "Très élevée", "medium": "Moyenne", "low": "Faible", "extreme": "Extrême"}, volNa: "Pas de valeur concordante : les sources divergent, donc nous laissons la case vide.", hitL: "Fréquence de gain", fsL: "Tours gratuits", maxOddsL: "Chance du gain max", rtpNote1: "La valeur publiée par {provider} ; certains casinos utilisent une version plus basse, indiquée dans l’écran d’infos du jeu.", cited: "Absent de la fiche de l’éditeur ; même valeur sur {links}, relevé le {date}.", indexT: "Machines à sous – gain max, RTP et bonus par éditeur", indexH: "Machines à sous : gain maximal, RTP et bonus achetés", indexD: "Gain maximal, RTP, volatilité et prix des bonus achetés des machines à sous connues, d’après les fiches officielles et des sources vérifiées, avec nos gains vérifiés en live. 18+.", indexP: "Chaque chiffre vient de la fiche officielle de l’éditeur ou d’au moins deux sources concordantes, avec la date du relevé. Quand un chiffre n’est pas publié, la case reste vide.", watch: "Vidéo"},
  de: {crumb: 'Slots', title: '{name} – Max Win {max}x, RTP & Bonuskauf', h1: '{name}: Maximalgewinn, RTP und Bonusspiele',
    desc: '{name} von {provider}: Max Win {max}x, RTP bis {rtp} %, Volatilität {vol}, {n} Bonusspiele. Offizielle Werte vom {date} und unsere verifizierten Live-Gewinne. 18+.',
    provider: 'Anbieter', maxWin: 'Maximalgewinn', rtp: 'RTP', volatility: 'Volatilität', grid: 'Raster', bonus: 'Bonusspiele', buyPrice: 'Preis des Bonuskaufs',
    buyUnknown: 'Steht im Kaufmenü des Spiels; {provider} veröffentlicht ihn nicht, daher keine Schätzung.', rtpNote: '{provider} veröffentlicht diese RTP-Versionen; das Casino wählt eine, der Info-Bildschirm des Spiels zeigt welche.',
    source: 'Quelle: offizielle Spielseite von {provider}, geprüft am {date}.', about: 'Das Spiel', ourWins: 'Unsere verifizierten Gewinne auf {name}', noWins: 'Noch kein verifizierter Gewinn auf diesem Spiel in unseren Rankings.',
    playAt: '{provider}-Spiele gibt es bei {casino}', cols: ['Datum', 'Streamer', 'Multiplikator', 'Einsatz'], vol: {"high": "Hoch", "very-high": "Sehr hoch", "medium": "Mittel", "low": "Niedrig", "extreme": "Extrem"}, volNa: "Kein übereinstimmender Wert: Die Quellen weichen ab, daher bleibt das Feld leer.", hitL: "Trefferquote", fsL: "Freispiele", maxOddsL: "Chance auf Max Win", rtpNote1: "Der von {provider} veröffentlichte Wert; manche Casinos nutzen eine niedrigere Version, die der Info-Bildschirm des Spiels zeigt.", cited: "Nicht auf der Seite des Anbieters; derselbe Wert bei {links}, geprüft am {date}.", indexT: "Slots – Max Win, RTP & Bonuskauf nach Anbieter", indexH: "Slots: Maximalgewinn, RTP und Bonuskauf", indexD: "Maximalgewinn, RTP, Volatilität und Bonuskaufpreise bekannter Slots, aus offiziellen Anbieterdaten und geprüften Quellen, mit unseren verifizierten Live-Gewinnen. 18+.", indexP: "Jede Zahl stammt von der offiziellen Spielseite des Anbieters oder aus mindestens zwei übereinstimmenden Quellen, mit Prüfdatum. Wird ein Wert nicht veröffentlicht, bleibt das Feld leer.", watch: "Video"},
  es: {crumb: 'Tragaperras', title: '{name} – premio máx. {max}x, RTP y compra de bono', h1: '{name}: premio máximo, RTP y bonos',
    desc: '{name} de {provider}: premio máx. {max}x, RTP hasta {rtp} %, volatilidad {vol}, {n} bonos. Cifras oficiales revisadas el {date} y nuestras ganancias verificadas en directo. 18+.',
    provider: 'Proveedor', maxWin: 'Premio máximo', rtp: 'RTP', volatility: 'Volatilidad', grid: 'Cuadrícula', bonus: 'Bonos', buyPrice: 'Precio de la compra de bono',
    buyUnknown: 'Aparece en el menú de compra del juego; {provider} no lo publica, así que no mostramos una estimación.', rtpNote: '{provider} publica estas versiones de RTP; el casino elige una y la pantalla de información del juego la muestra.',
    source: 'Fuente: ficha oficial de {provider}, revisada el {date}.', about: 'El juego', ourWins: 'Nuestras ganancias verificadas en {name}', noWins: 'Todavía no hay ganancias verificadas en este juego en nuestros rankings.',
    playAt: 'Los juegos de {provider} están en {casino}', cols: ['Fecha', 'Streamer', 'Multiplicador', 'Apuesta'], vol: {"high": "Alta", "very-high": "Muy alta", "medium": "Media", "low": "Baja", "extreme": "Extrema"}, volNa: "No hay un valor coincidente: las fuentes difieren, así que la casilla queda vacía.", hitL: "Frecuencia de premio", fsL: "Giros gratis", maxOddsL: "Probabilidad del premio máximo", rtpNote1: "El valor que publica {provider}; algunos casinos usan una versión más baja, que aparece en la pantalla de información del juego.", cited: "No figura en la página del proveedor; el mismo valor en {links}, revisado el {date}.", indexT: "Tragaperras – premio máx., RTP y compra de bono por proveedor", indexH: "Tragaperras: premio máximo, RTP y compra de bono", indexD: "Premio máximo, RTP, volatilidad y precio de la compra de bono de tragaperras conocidas, con datos oficiales y fuentes verificadas, y nuestras ganancias verificadas en directo. 18+.", indexP: "Cada cifra viene de la página oficial del proveedor o de al menos dos fuentes que coinciden, con la fecha de revisión. Si una cifra no se publica, la casilla queda vacía.", watch: "Vídeo"},
  pt: {crumb: 'Slots', title: '{name} – ganho máx. {max}x, RTP e compra de bônus', h1: '{name}: ganho máximo, RTP e bônus',
    desc: '{name} da {provider}: ganho máx. {max}x, RTP até {rtp}%, volatilidade {vol}, {n} bônus. Números oficiais conferidos em {date} e nossos ganhos verificados ao vivo. 18+.',
    provider: 'Provedor', maxWin: 'Ganho máximo', rtp: 'RTP', volatility: 'Volatilidade', grid: 'Grade', bonus: 'Bônus', buyPrice: 'Preço da compra de bônus',
    buyUnknown: 'Aparece no menu de compra do jogo; a {provider} não o publica, então não mostramos estimativa.', rtpNote: 'A {provider} publica estas versões de RTP; o cassino escolhe uma, e a tela de informações do jogo mostra qual.',
    source: 'Fonte: página oficial da {provider}, conferida em {date}.', about: 'O jogo', ourWins: 'Nossos ganhos verificados em {name}', noWins: 'Ainda não há ganho verificado neste jogo nos nossos rankings.',
    playAt: 'Os jogos da {provider} estão na {casino}', cols: ['Data', 'Streamer', 'Multiplicador', 'Aposta'], vol: {"high": "Alta", "very-high": "Muito alta", "medium": "Média", "low": "Baixa", "extreme": "Extrema"}, volNa: "Sem valor concordante: as fontes divergem, então o campo fica vazio.", hitL: "Frequência de acerto", fsL: "Rodadas grátis", maxOddsL: "Chance do ganho máximo", rtpNote1: "O valor que a {provider} publica; alguns cassinos usam uma versão mais baixa, mostrada na tela de informações do jogo.", cited: "Não consta na página do provedor; o mesmo valor em {links}, conferido em {date}.", indexT: "Slots – ganho máx., RTP e compra de bônus por provedor", indexH: "Slots: ganho máximo, RTP e compra de bônus", indexD: "Ganho máximo, RTP, volatilidade e preço da compra de bônus de slots conhecidos, com dados oficiais e fontes conferidas, e nossos ganhos verificados ao vivo. 18+.", indexP: "Cada número vem da página oficial do provedor ou de pelo menos duas fontes que concordam, com a data da conferência. Quando um número não é publicado, o campo fica vazio.", watch: "Vídeo"},
  it: {crumb: 'Slot', title: '{name} – vincita max {max}x, RTP e bonus buy', h1: '{name}: vincita massima, RTP e bonus',
    desc: '{name} di {provider}: vincita max {max}x, RTP fino al {rtp}%, volatilità {vol}, {n} bonus. Dati ufficiali verificati il {date} e le nostre vincite verificate in live. 18+.',
    provider: 'Fornitore', maxWin: 'Vincita massima', rtp: 'RTP', volatility: 'Volatilità', grid: 'Griglia', bonus: 'Bonus', buyPrice: 'Prezzo del bonus buy',
    buyUnknown: 'È indicato nel menu di acquisto del gioco; {provider} non lo pubblica, quindi non mostriamo stime.', rtpNote: '{provider} pubblica queste versioni di RTP; il casinò ne sceglie una, indicata nella schermata info del gioco.',
    source: 'Fonte: pagina ufficiale di {provider}, verificata il {date}.', about: 'Il gioco', ourWins: 'Le nostre vincite verificate su {name}', noWins: 'Ancora nessuna vincita verificata su questo gioco nelle nostre classifiche.',
    playAt: 'I giochi {provider} sono disponibili su {casino}', cols: ['Data', 'Streamer', 'Moltiplicatore', 'Puntata'], vol: {"high": "Alta", "very-high": "Molto alta", "medium": "Media", "low": "Bassa", "extreme": "Estrema"}, volNa: "Nessun valore concorde: le fonti non coincidono, quindi il campo resta vuoto.", hitL: "Frequenza di vincita", fsL: "Giri gratis", maxOddsL: "Probabilità della vincita max", rtpNote1: "Il valore pubblicato da {provider}; alcuni casinò usano una versione più bassa, indicata nella schermata info del gioco.", cited: "Non presente nella pagina del fornitore; stesso valore su {links}, verificato il {date}.", indexT: "Slot – vincita max, RTP e bonus buy per fornitore", indexH: "Slot: vincita massima, RTP e bonus buy", indexD: "Vincita massima, RTP, volatilità e prezzi dei bonus buy delle slot più note, da dati ufficiali e fonti verificate, con le nostre vincite verificate in live. 18+.", indexP: "Ogni cifra viene dalla pagina ufficiale del fornitore o da almeno due fonti concordanti, con la data della verifica. Se una cifra non è pubblicata, il campo resta vuoto.", watch: "Video"},
};
