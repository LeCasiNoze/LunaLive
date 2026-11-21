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
  tg: {join: "Join Telegram", nav: "Telegram channel", title: "Every big win, straight to Telegram", sub: "New videos posted in the channel as soon as they are out · Free · Leave anytime", metaTitle: "Big Win Daily on Telegram – the biggest slot wins daily", metaDesc: "Join the free Big Win Daily Telegram channel: every daily Top 5, weekly Top 10 and monthly Top 30 of the biggest slot wins, posted as soon as it is out. 18+.", h1: "Big Win Daily on Telegram", intro: "The free channel where every new Big Win Daily video lands as soon as it is published. No account to create on our side, no spam, and you can leave with one tap.", items: [{h: "What you get", p: "The daily Top 5 of the biggest slot wins from live streams, the weekly Top 10 and the monthly Top 30, each posted in the channel the moment the video goes live."}, {h: "Why Telegram", p: "YouTube does not always show you new videos. The channel does: one notification, one link, nothing else."}, {h: "Play responsibly", p: "Big wins are rare moments, not the norm. The channel is for adults (18+) only. If gambling stops being fun, see our responsible gambling page."}], cta: "Open the channel on Telegram"},
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
  tg: {join: "Rejoindre Telegram", nav: "Canal Telegram", title: "Chaque big win, direct sur Telegram", sub: "Les nouvelles vidéos postées dans le canal dès leur sortie · Gratuit · Tu pars quand tu veux", metaTitle: "Big Win Daily sur Telegram – les plus gros gains de slots", metaDesc: "Rejoins le canal Telegram gratuit de Big Win Daily : chaque Top 5 du jour, Top 10 de la semaine et Top 30 du mois des plus gros gains de slots, posté dès sa sortie. 18+.", h1: "Big Win Daily sur Telegram", intro: "Le canal gratuit où chaque nouvelle vidéo Big Win Daily arrive dès sa publication. Aucun compte à créer chez nous, pas de spam, et tu te désabonnes en un geste.", items: [{h: "Ce que tu reçois", p: "Le Top 5 du jour des plus gros gains de slots en live, le Top 10 de la semaine et le Top 30 du mois, postés dans le canal dès que la vidéo est en ligne."}, {h: "Pourquoi Telegram", p: "YouTube ne te montre pas toujours les nouvelles vidéos. Le canal, si : une notification, un lien, rien d’autre."}, {h: "Joue de façon responsable", p: "Les gros gains sont des moments rares, pas la norme. Le canal est réservé aux adultes (18+). Si le jeu n’est plus un plaisir, consulte notre page jeu responsable."}], cta: "Ouvrir le canal sur Telegram"},
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
  tg: {join: "Telegram beitreten", nav: "Telegram-Kanal", title: "Jeder Big Win direkt auf Telegram", sub: "Neue Videos im Kanal, sobald sie erscheinen · Kostenlos · Jederzeit austreten", metaTitle: "Big Win Daily auf Telegram – die größten Slot-Gewinne", metaDesc: "Tritt dem kostenlosen Telegram-Kanal von Big Win Daily bei: jede Tages-Top 5, Wochen-Top 10 und Monats-Top 30 der größten Slot-Gewinne, sofort nach Erscheinen. 18+.", h1: "Big Win Daily auf Telegram", intro: "Der kostenlose Kanal, in dem jedes neue Big-Win-Daily-Video landet, sobald es veröffentlicht ist. Kein Konto bei uns, kein Spam, und du kannst mit einem Tippen austreten.", items: [{h: "Was du bekommst", p: "Die Tages-Top 5 der größten Slot-Gewinne aus Livestreams, die Wochen-Top 10 und die Monats-Top 30 – jeweils im Kanal, sobald das Video online ist."}, {h: "Warum Telegram", p: "YouTube zeigt dir neue Videos nicht immer an. Der Kanal schon: eine Benachrichtigung, ein Link, sonst nichts."}, {h: "Verantwortungsvoll spielen", p: "Große Gewinne sind seltene Momente, nicht die Regel. Der Kanal ist nur für Erwachsene (18+). Wenn Spielen keinen Spaß mehr macht, lies unsere Seite zum verantwortungsvollen Spielen."}], cta: "Kanal auf Telegram öffnen"},
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
  tg: {join: "Unirse a Telegram", nav: "Canal de Telegram", title: "Cada big win, directo a Telegram", sub: "Los vídeos nuevos en el canal en cuanto salen · Gratis · Sales cuando quieras", metaTitle: "Big Win Daily en Telegram – las mayores ganancias en slots", metaDesc: "Únete al canal gratuito de Telegram de Big Win Daily: cada Top 5 diario, Top 10 semanal y Top 30 mensual de las mayores ganancias en slots, publicado en cuanto sale. 18+.", h1: "Big Win Daily en Telegram", intro: "El canal gratuito donde llega cada vídeo nuevo de Big Win Daily en cuanto se publica. Sin crear cuenta con nosotros, sin spam, y puedes salir con un toque.", items: [{h: "Lo que recibes", p: "El Top 5 diario de las mayores ganancias en slots de los directos, el Top 10 semanal y el Top 30 mensual, publicados en el canal en cuanto el vídeo está en línea."}, {h: "Por qué Telegram", p: "YouTube no siempre te muestra los vídeos nuevos. El canal sí: una notificación, un enlace y nada más."}, {h: "Juega con responsabilidad", p: "Las grandes ganancias son momentos raros, no la norma. El canal es solo para adultos (18+). Si el juego deja de ser divertido, consulta nuestra página de juego responsable."}], cta: "Abrir el canal en Telegram"},
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
  tg: {join: "Entrar no Telegram", nav: "Canal no Telegram", title: "Cada big win, direto no Telegram", sub: "Os vídeos novos no canal assim que saem · Grátis · Saia quando quiser", metaTitle: "Big Win Daily no Telegram – os maiores ganhos em slots", metaDesc: "Entre no canal gratuito do Big Win Daily no Telegram: cada Top 5 diário, Top 10 semanal e Top 30 mensal dos maiores ganhos em slots, publicado assim que sai. 18+.", h1: "Big Win Daily no Telegram", intro: "O canal gratuito onde cada vídeo novo do Big Win Daily chega assim que é publicado. Sem criar conta conosco, sem spam, e você sai com um toque.", items: [{h: "O que você recebe", p: "O Top 5 diário dos maiores ganhos em slots das lives, o Top 10 semanal e o Top 30 mensal, publicados no canal assim que o vídeo vai ao ar."}, {h: "Por que Telegram", p: "O YouTube nem sempre mostra os vídeos novos. O canal mostra: uma notificação, um link e nada mais."}, {h: "Jogue com responsabilidade", p: "Grandes ganhos são momentos raros, não a regra. O canal é só para adultos (18+). Se o jogo deixar de ser diversão, veja nossa página de jogo responsável."}], cta: "Abrir o canal no Telegram"},
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
  tg: {join: "Unisciti su Telegram", nav: "Canale Telegram", title: "Ogni big win, dritto su Telegram", sub: "I nuovi video nel canale appena escono · Gratis · Esci quando vuoi", metaTitle: "Big Win Daily su Telegram – le vincite più grandi alle slot", metaDesc: "Unisciti al canale Telegram gratuito di Big Win Daily: ogni Top 5 del giorno, Top 10 della settimana e Top 30 del mese delle vincite più grandi alle slot, appena esce. 18+.", h1: "Big Win Daily su Telegram", intro: "Il canale gratuito dove arriva ogni nuovo video di Big Win Daily appena viene pubblicato. Nessun account da creare da noi, niente spam, ed esci con un tocco.", items: [{h: "Cosa ricevi", p: "Il Top 5 del giorno delle vincite più grandi alle slot dalle live, il Top 10 della settimana e il Top 30 del mese, pubblicati nel canale appena il video è online."}, {h: "Perché Telegram", p: "YouTube non sempre ti mostra i nuovi video. Il canale sì: una notifica, un link e nient’altro."}, {h: "Gioca responsabilmente", p: "Le grandi vincite sono momenti rari, non la regola. Il canale è solo per adulti (18+). Se il gioco smette di essere un piacere, consulta la nostra pagina sul gioco responsabile."}], cta: "Apri il canale su Telegram"},
  nav: {home: 'Home', offers: 'Bonus casinò', guide: 'Guida ai bonus', rg: 'Gioco responsabile', about: 'Chi siamo', more: 'Scopri', page: 'Pagine'},
  age: {title: 'Hai almeno 18 anni?', text: 'Questo sito mostra offerte bonus dei casinò ed è riservato agli adulti. Il gioco può creare dipendenza: gioca responsabilmente.', yes: 'Sì, ho 18+ anni', no: 'No'},
};

const UIS: Record<Lang, UI> = {en, fr, de, es, pt, it};
export const ui = (lang: Lang) => UIS[lang];
