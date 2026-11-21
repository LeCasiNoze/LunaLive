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
  badge: {code: 'Code NIVORANET', deposits3: 'Over 3 deposits', deposits4: 'Over 4 deposits'},
  ticker: 'Monthly wager race $200',
  winsTitle: 'Watch the biggest wins of the day', winsSub: 'Daily Top 5 · Weekly Top 10 · Monthly Top 30', winsCta: 'Open the channel',
  tg: {join: "Every big win first: join on Telegram", short: "Join on Telegram", nav: "Telegram channel", title: "Every big win first", sub: "Live alerts of the biggest verified slot wins from casino livestreams (max 3 a day), and the Top 5 of the day every evening. 18+ only.", metaTitle: "Every big win first – Big Win Daily on Telegram", metaDesc: "Live alerts of the biggest verified slot wins from casino livestreams (max 3 a day), and the Top 5 of the day every evening. 18+ only.", h1: "Every big win first", intro: "Live alerts of the biggest verified slot wins from casino livestreams (max 3 a day), and the Top 5 of the day every evening. 18+ only.", items: [{h: "Live alerts, max 3 a day", p: "When one of the biggest wins of the day is detected and verified on a casino livestream, the clip lands in the channel within minutes – never more than 3 alerts a day."}, {h: "The Top 5 every evening", p: "Every evening, the Top 5 of the day’s biggest slot wins on video, plus the weekly Top 10 and the monthly Top 30."}, {h: "Play responsibly", p: "Big wins are rare moments, not the norm. The channel is for adults (18+) only. If gambling stops being fun, see our responsible gambling page."}], cta: "Open the channel on Telegram"},
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
  badge: {code: 'Code NIVORANET', deposits3: 'Sur 3 dépôts', deposits4: 'Sur 4 dépôts'},
  ticker: 'Wager race du mois 200 $',
  winsTitle: 'Les plus gros gains du jour en vidéo', winsSub: 'Top 5 du jour · Top 10 de la semaine · Top 30 du mois', winsCta: 'Voir la chaîne',
  tg: {join: "Every big win first : rejoins-nous sur Telegram", short: "Rejoindre Telegram", nav: "Canal Telegram", title: "Every big win first", sub: "Des alertes en direct des plus gros gains de slots vérifiés sur les lives casino (3 par jour au maximum), et le Top 5 du jour chaque soir. Réservé aux 18+.", metaTitle: "Every big win first – Big Win Daily sur Telegram", metaDesc: "Des alertes en direct des plus gros gains de slots vérifiés sur les lives casino (3 par jour au maximum), et le Top 5 du jour chaque soir. Réservé aux 18+.", h1: "Every big win first", intro: "Des alertes en direct des plus gros gains de slots vérifiés sur les lives casino (3 par jour au maximum), et le Top 5 du jour chaque soir. Réservé aux 18+.", items: [{h: "Des alertes en direct, 3 par jour au maximum", p: "Quand un des plus gros gains du jour est détecté et vérifié sur un live casino, le clip arrive dans le canal en quelques minutes – jamais plus de 3 alertes par jour."}, {h: "Le Top 5 chaque soir", p: "Chaque soir, le Top 5 des plus gros gains de slots du jour en vidéo, plus le Top 10 de la semaine et le Top 30 du mois."}, {h: "Joue de façon responsable", p: "Les gros gains sont des moments rares, pas la norme. Le canal est réservé aux adultes (18+). Si le jeu n’est plus un plaisir, consulte notre page jeu responsable."}], cta: "Ouvrir le canal sur Telegram"},
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
  badge: {code: 'Code NIVORANET', deposits3: 'Auf 3 Einzahlungen', deposits4: 'Auf 4 Einzahlungen'},
  ticker: 'Monatliches Wager-Rennen 200 $',
  winsTitle: 'Die größten Gewinne des Tages im Video', winsSub: 'Tages-Top 5 · Wochen-Top 10 · Monats-Top 30', winsCta: 'Zum Kanal',
  tg: {join: "Every big win first: tritt Telegram bei", short: "Telegram beitreten", nav: "Telegram-Kanal", title: "Every big win first", sub: "Live-Alerts zu den größten verifizierten Slot-Gewinnen aus Casino-Livestreams (höchstens 3 pro Tag) und jeden Abend die Top 5 des Tages. Nur ab 18.", metaTitle: "Every big win first – Big Win Daily auf Telegram", metaDesc: "Live-Alerts zu den größten verifizierten Slot-Gewinnen aus Casino-Livestreams (höchstens 3 pro Tag) und jeden Abend die Top 5 des Tages. Nur ab 18.", h1: "Every big win first", intro: "Live-Alerts zu den größten verifizierten Slot-Gewinnen aus Casino-Livestreams (höchstens 3 pro Tag) und jeden Abend die Top 5 des Tages. Nur ab 18.", items: [{h: "Live-Alerts, höchstens 3 pro Tag", p: "Wird einer der größten Gewinne des Tages in einem Casino-Livestream erkannt und verifiziert, landet der Clip binnen Minuten im Kanal – nie mehr als 3 Alerts pro Tag."}, {h: "Die Top 5 jeden Abend", p: "Jeden Abend die Top 5 der größten Slot-Gewinne des Tages als Video, dazu die Wochen-Top 10 und die Monats-Top 30."}, {h: "Verantwortungsvoll spielen", p: "Große Gewinne sind seltene Momente, nicht die Regel. Der Kanal ist nur für Erwachsene (18+). Wenn Spielen keinen Spaß mehr macht, lies unsere Seite zum verantwortungsvollen Spielen."}], cta: "Kanal auf Telegram öffnen"},
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
  badge: {code: 'Código NIVORANET', deposits3: 'En 3 depósitos', deposits4: 'En 4 depósitos'},
  ticker: 'Carrera mensual de apuestas 200 $',
  winsTitle: 'Las mayores ganancias del día en vídeo', winsSub: 'Top 5 diario · Top 10 semanal · Top 30 mensual', winsCta: 'Ver el canal',
  tg: {join: "Every big win first: únete en Telegram", short: "Unirse a Telegram", nav: "Canal de Telegram", title: "Every big win first", sub: "Alertas en directo de las mayores ganancias verificadas en slots de los directos de casino (máximo 3 al día), y el Top 5 del día cada noche. Solo +18.", metaTitle: "Every big win first – Big Win Daily en Telegram", metaDesc: "Alertas en directo de las mayores ganancias verificadas en slots de los directos de casino (máximo 3 al día), y el Top 5 del día cada noche. Solo +18.", h1: "Every big win first", intro: "Alertas en directo de las mayores ganancias verificadas en slots de los directos de casino (máximo 3 al día), y el Top 5 del día cada noche. Solo +18.", items: [{h: "Alertas en directo, máximo 3 al día", p: "Cuando se detecta y verifica una de las mayores ganancias del día en un directo de casino, el clip llega al canal en minutos – nunca más de 3 alertas al día."}, {h: "El Top 5 cada noche", p: "Cada noche, el Top 5 de las mayores ganancias en slots del día en vídeo, más el Top 10 semanal y el Top 30 mensual."}, {h: "Juega con responsabilidad", p: "Las grandes ganancias son momentos raros, no la norma. El canal es solo para adultos (18+). Si el juego deja de ser divertido, consulta nuestra página de juego responsable."}], cta: "Abrir el canal en Telegram"},
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
  badge: {code: 'Código NIVORANET', deposits3: 'Em 3 depósitos', deposits4: 'Em 4 depósitos'},
  ticker: 'Corrida mensal de apostas US$ 200',
  winsTitle: 'Os maiores ganhos do dia em vídeo', winsSub: 'Top 5 diário · Top 10 semanal · Top 30 mensal', winsCta: 'Abrir o canal',
  tg: {join: "Every big win first: entre no Telegram", short: "Entrar no Telegram", nav: "Canal no Telegram", title: "Every big win first", sub: "Alertas ao vivo dos maiores ganhos verificados em slots das lives de cassino (no máximo 3 por dia), e o Top 5 do dia toda noite. Só para maiores de 18.", metaTitle: "Every big win first – Big Win Daily no Telegram", metaDesc: "Alertas ao vivo dos maiores ganhos verificados em slots das lives de cassino (no máximo 3 por dia), e o Top 5 do dia toda noite. Só para maiores de 18.", h1: "Every big win first", intro: "Alertas ao vivo dos maiores ganhos verificados em slots das lives de cassino (no máximo 3 por dia), e o Top 5 do dia toda noite. Só para maiores de 18.", items: [{h: "Alertas ao vivo, no máximo 3 por dia", p: "Quando um dos maiores ganhos do dia é detectado e verificado numa live de cassino, o clipe chega ao canal em minutos – nunca mais de 3 alertas por dia."}, {h: "O Top 5 toda noite", p: "Toda noite, o Top 5 dos maiores ganhos em slots do dia em vídeo, mais o Top 10 semanal e o Top 30 mensal."}, {h: "Jogue com responsabilidade", p: "Grandes ganhos são momentos raros, não a regra. O canal é só para adultos (18+). Se o jogo deixar de ser diversão, veja nossa página de jogo responsável."}], cta: "Abrir o canal no Telegram"},
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
  badge: {code: 'Codice NIVORANET', deposits3: 'Su 3 depositi', deposits4: 'Su 4 depositi'},
  ticker: 'Gara mensile di puntate 200 $',
  winsTitle: 'Le vincite più grandi del giorno in video', winsSub: 'Top 5 del giorno · Top 10 della settimana · Top 30 del mese', winsCta: 'Apri il canale',
  tg: {join: "Every big win first: unisciti su Telegram", short: "Unisciti su Telegram", nav: "Canale Telegram", title: "Every big win first", sub: "Avvisi in diretta delle vincite verificate più grandi alle slot dalle live di casinò (massimo 3 al giorno), e il Top 5 del giorno ogni sera. Solo 18+.", metaTitle: "Every big win first – Big Win Daily su Telegram", metaDesc: "Avvisi in diretta delle vincite verificate più grandi alle slot dalle live di casinò (massimo 3 al giorno), e il Top 5 del giorno ogni sera. Solo 18+.", h1: "Every big win first", intro: "Avvisi in diretta delle vincite verificate più grandi alle slot dalle live di casinò (massimo 3 al giorno), e il Top 5 del giorno ogni sera. Solo 18+.", items: [{h: "Avvisi in diretta, massimo 3 al giorno", p: "Quando una delle vincite più grandi del giorno viene rilevata e verificata in una live di casinò, la clip arriva nel canale in pochi minuti – mai più di 3 avvisi al giorno."}, {h: "Il Top 5 ogni sera", p: "Ogni sera, il Top 5 delle vincite più grandi alle slot del giorno in video, più il Top 10 della settimana e il Top 30 del mese."}, {h: "Gioca responsabilmente", p: "Le grandi vincite sono momenti rari, non la regola. Il canale è solo per adulti (18+). Se il gioco smette di essere un piacere, consulta la nostra pagina sul gioco responsabile."}], cta: "Apri il canale su Telegram"},
  nav: {home: 'Home', offers: 'Bonus casinò', guide: 'Guida ai bonus', rg: 'Gioco responsabile', about: 'Chi siamo', more: 'Scopri', page: 'Pagine'},
  age: {title: 'Hai almeno 18 anni?', text: 'Questo sito mostra offerte bonus dei casinò ed è riservato agli adulti. Il gioco può creare dipendenza: gioca responsabilmente.', yes: 'Sì, ho 18+ anni', no: 'No'},
};

const UIS: Record<Lang, UI> = {en, fr, de, es, pt, it};
export const ui = (lang: Lang) => UIS[lang];
