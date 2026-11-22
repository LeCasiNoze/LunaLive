import type {Lang} from '../i18n';
import type {CasinoId} from './casinos';

// Pages qui répondent à une recherche précise sur un casino (retrait, bonus sans dépôt, code promo).
// Règle : chaque chiffre vient d'une page officielle du casino, citée avec sa clause et la date du relevé.
// Ce que la source ne dit pas est écrit comme tel, jamais estimé.
export interface Intent {
  casino: CasinoId; lang: Lang; slug: string; place: string;
  title: string; desc: string; h1: string; lede: string;
  facts: [string, string][];
  sections: {h: string; p: string[]}[];
  sources: {label: string; url: string; checked: string}[];
}

export const INTENTS: Intent[] = [
  {
    casino: 'rainbet', lang: 'fr', slug: 'code-promo', place: 'intent-code-promo',
    title: 'Rainbet code promo et code parrainage : NIVORANET (+20 % de rakeback)',
    desc: 'Code promo Rainbet = code de parrainage : NIVORANET. Il donne +20 % de rakeback pendant 72 h et l’accès à notre course mensuelle de 200 $. Où le saisir, délai de 24 h, règles officielles.',
    h1: 'Code promo Rainbet (code parrainage) : NIVORANET',
    lede: 'Sur Rainbet, le « code promo » et le « code de parrainage » sont la même chose : le code d’affilié qu’on saisit à l’inscription. Le nôtre est NIVORANET. Voici ce qu’il donne, d’après le centre d’aide officiel de Rainbet.',
    facts: [
      ['Code', 'NIVORANET'],
      ['Ce qu’il donne', '+20 % de rakeback pendant 72 heures (« Affiliate Code Redemption »)'],
      ['En plus', 'notre course mensuelle de 200 $ (100 $, 60 $, 40 $) entre les joueurs du code'],
      ['Où le saisir', 'champ « code d’affilié » de l’inscription'],
      ['Oublié à l’inscription', 'ajout possible pendant 24 h, tant qu’aucun dépôt n’a été fait'],
      ['Changer de code', 'impossible une fois le code enregistré'],
    ],
    sections: [
      {h: 'Ce que le code NIVORANET donne vraiment', p: [
        'Le centre d’aide de Rainbet liste un « RakeBoost » de +20 % pendant 72 heures à l’activation d’un code d’affilié. Le rakeback est la part de chaque mise que Rainbet vous rend, gagnante ou perdante ; il se réclame toutes les 15 minutes.',
        'Les boosts ne se cumulent pas : seul le plus élevé s’applique à un instant donné. Le +20 % du code est le plus fort de la liste officielle (le bonus d’inscription donne +15 % pendant 24 h).',
      ]},
      {h: 'La course mensuelle', p: [
        'Les joueurs inscrits avec NIVORANET sont classés chaque mois sur leurs mises : 200 $ pour le top 3 (100 $, 60 $ et 40 $). Cette course est la nôtre, pas une promotion de Rainbet ; le compteur de la page d’accueil indique sa fin.',
      ]},
      {h: 'Où et quand saisir le code', p: [
        'À l’inscription, Rainbet affiche un champ pour le code d’affilié : notre lien le pré-remplit, vérifiez qu’il indique NIVORANET. Si vous l’avez oublié, le centre d’aide laisse 24 heures pour l’ajouter depuis le portefeuille, à condition de ne pas avoir encore déposé.',
        'Une fois enregistré, le code ne peut plus être changé. Le chat d’assistance indique sous quel code un compte est inscrit (option « What’s My Affiliate Code? »).',
      ]},
    ],
    sources: [
      {label: 'Centre d’aide Rainbet, « Rewards Overview »', url: 'https://help.rainbet.com/en/articles/9171035-rewards-overview', checked: '2026-11-22'},
      {label: 'Centre d’aide Rainbet, « Referrals »', url: 'https://help.rainbet.com/en/articles/17313607-referrals', checked: '2026-11-22'},
    ],
  },
  {
    casino: 'rainbet', lang: 'fr', slug: 'retrait', place: 'intent-retrait',
    title: 'Retrait Rainbet : délai annoncé de 5 à 15 minutes, règles officielles',
    desc: 'Retirer sur Rainbet : traitement annoncé en 5 à 15 minutes, dépôt à miser une fois, pas de frais Rainbet (frais réseau seulement), cryptos acceptées. Les règles du centre d’aide officiel.',
    h1: 'Retrait sur Rainbet : délais et règles officielles',
    lede: 'Ce que le centre d’aide de Rainbet dit des retraits. Les délais ci-dessous sont ceux que Rainbet annonce ; nous n’avons pas encore mesuré de retrait nous-mêmes.',
    facts: [
      ['Délai annoncé', '5 à 15 minutes de traitement par l’équipe Rainbet'],
      ['Confirmation crypto', 'immédiate à 45 minutes selon le réseau'],
      ['Avant de retirer', 'avoir misé une fois le montant déposé (rollover x1)'],
      ['Frais Rainbet', 'aucun ; seuls les frais du réseau crypto s’appliquent'],
      ['Cryptos', 'BTC, ETH, USDT, USDC, LTC, SOL, TRX, DAI, DOGE, BNB, XRP'],
    ],
    sections: [
      {h: 'Avant la demande', p: [
        'Chaque dépôt doit être misé au moins une fois avant de pouvoir être retiré, pour des raisons de lutte contre le blanchiment : un dépôt de 10 $ demande 10 $ de mises, sur n’importe quel jeu. Un pari sportif ne compte qu’une fois réglé. Le site n’affiche pas la progression : le support la donne sur demande.',
      ]},
      {h: 'Le délai', p: [
        'Rainbet annonce un traitement en 5 à 15 minutes en général, avec parfois un contrôle de sécurité qui ajoute quelques minutes. Ensuite, la confirmation sur la blockchain dépend de la crypto et des frais choisis : immédiate pour certaines, jusqu’à 45 minutes pour d’autres.',
        'Ces durées sont celles de Rainbet. Nous ajouterons un délai mesuré, daté, quand nous aurons fait un retrait.',
      ]},
      {h: 'Comment retirer', p: [
        'Ouvrir le portefeuille, choisir la crypto et le réseau, indiquer le montant et l’adresse, confirmer. Rainbet ne prend pas de frais ; les frais du réseau varient selon la crypto et le trafic.',
      ]},
    ],
    sources: [
      {label: 'Centre d’aide Rainbet, « How much time does it take for a withdrawal? »', url: 'https://help.rainbet.com/en/articles/8403745-how-much-time-does-it-take-for-a-withdrawal', checked: '2026-11-22'},
      {label: 'Centre d’aide Rainbet, « How to Make a Crypto Withdraw »', url: 'https://help.rainbet.com/en/articles/15254412-how-to-make-a-crypto-withdraw', checked: '2026-11-22'},
      {label: 'Centre d’aide Rainbet, « Wager Requirement for Deposits »', url: 'https://help.rainbet.com/en/articles/16312455-wager-requirement-for-deposits', checked: '2026-11-22'},
    ],
  },
  {
    casino: 'rainbet', lang: 'fr', slug: 'c-est-quoi', place: 'intent-c-est-quoi',
    title: 'Rainbet c’est quoi ? Casino crypto, rakeback et code NIVORANET',
    desc: 'Rainbet, c’est quoi : un casino crypto (Rain Group Ltd, Anjouan) avec rakeback toutes les 15 minutes, bonus quotidiens à mensuels et plus de 7 000 slots. L’essentiel, sources à l’appui.',
    h1: 'Rainbet, c’est quoi ?',
    lede: 'Rainbet est un casino en ligne en crypto, centré sur les machines à sous, qui reverse une part de chaque mise (le rakeback) plutôt que de miser sur un gros bonus de dépôt. C’est le casino sur lequel nos streamers jouent le plus.',
    facts: [
      ['Exploitant', 'Rain Group Ltd, Anjouan (société n° 16077)'],
      ['Paiements', 'crypto (BTC, ETH, USDT, USDC, LTC, SOL…)'],
      ['Catalogue', 'plus de 7 000 machines à sous (notre relevé du 19/11/2026)'],
      ['Récompenses', 'rakeback toutes les 15 min, bonus quotidien, hebdomadaire et mensuel, 3 reloads par jour'],
      ['Notre code', 'NIVORANET : +20 % de rakeback pendant 72 h'],
    ],
    sections: [
      {h: 'Comment Rainbet récompense ses joueurs', p: [
        'Le rakeback, calculé sur le total misé, se réclame toutes les 15 minutes. S’y ajoutent un bonus quotidien (cumulable jusqu’à 72 heures), un bonus hebdomadaire, un bonus mensuel, un bonus « pré-mensuel » le 16 de chaque mois et trois reloads par jour. Une récompense non réclamée avant la suivante expire.',
        'Des rangs VIP donnent un bonus à chaque montée de rang. Des « RakeBoosts » augmentent temporairement le rakeback ; ils ne se cumulent pas.',
      ]},
      {h: 'Les jeux', p: [
        'Notre relevé du catalogue du 19/11/2026 compte plus de 7 000 machines à sous, de Pragmatic Play, Hacksaw, Nolimit City, NetEnt, Red Tiger, BGaming et d’autres. Les jeux de notre catalogue vérifiés chez Rainbet sont listés sur notre page avis.',
      ]},
      {h: 'Dépôts et retraits', p: [
        'Tout se fait en crypto depuis le portefeuille du compte. Chaque dépôt doit être misé une fois avant retrait ; Rainbet annonce un traitement en 5 à 15 minutes et ne prend pas de frais en plus de ceux du réseau.',
      ]},
    ],
    sources: [
      {label: 'Centre d’aide Rainbet, « Rewards Overview »', url: 'https://help.rainbet.com/en/articles/9171035-rewards-overview', checked: '2026-11-22'},
      {label: 'Centre d’aide Rainbet, « How to Make a Crypto Withdraw »', url: 'https://help.rainbet.com/en/articles/15254412-how-to-make-a-crypto-withdraw', checked: '2026-11-22'},
      {label: 'Conditions générales de Rainbet (relevé de la section Affiliation)', url: 'https://rainbet.com/terms', checked: '2026-11-21'},
    ],
  },
  {
    casino: 'rainbet', lang: 'en', slug: 'promo-code', place: 'intent-promo-code',
    title: 'Rainbet Promo Code 2026: NIVORANET (+20% Rakeback for 72h)',
    desc: 'The Rainbet promo code (affiliate code) is NIVORANET: +20% rakeback for 72 hours plus our $200 monthly race. Where to enter it, the 24-hour rule and the official terms.',
    h1: 'Rainbet promo code: NIVORANET',
    lede: 'On Rainbet, the “promo code” is the affiliate code you enter at sign-up. Ours is NIVORANET. Here is what it gives, according to Rainbet’s official help center.',
    facts: [
      ['Code', 'NIVORANET'],
      ['What it gives', '+20% rakeback for 72 hours (“Affiliate Code Redemption”)'],
      ['On top', 'our $200 monthly race ($100, $60, $40) between players on the code'],
      ['Where to enter it', 'the affiliate code field at sign-up'],
      ['Forgot it?', 'you can add it within 24 hours, as long as you haven’t deposited'],
      ['Changing code', 'not possible once set'],
    ],
    sections: [
      {h: 'What NIVORANET actually gives', p: [
        'Rainbet’s help center lists a +20% “RakeBoost” for 72 hours when you redeem an affiliate code. Rakeback is the share of every bet Rainbet pays back, win or lose, and it can be claimed every 15 minutes.',
        'Boosts don’t stack: only the highest one applies at any time. The +20% code boost is the largest on the official list (the sign-up bonus gives +15% for 24 hours).',
      ]},
      {h: 'The monthly race', p: [
        'Players registered with NIVORANET are ranked every month on their wagers: $200 for the top 3 ($100, $60 and $40). This race is ours, not a Rainbet promotion; the countdown on our home page shows when it ends.',
      ]},
      {h: 'Where and when to enter the code', p: [
        'At sign-up, Rainbet shows an affiliate code field; our link fills it in, so check that it reads NIVORANET. If you missed it, the help center gives you 24 hours to add it from your wallet, as long as you haven’t made a deposit.',
        'Once set, the code can’t be changed. Live chat tells you which code your account is under (“What’s My Affiliate Code?”).',
      ]},
    ],
    sources: [
      {label: 'Rainbet help center, “Rewards Overview”', url: 'https://help.rainbet.com/en/articles/9171035-rewards-overview', checked: '2026-11-22'},
      {label: 'Rainbet help center, “Referrals”', url: 'https://help.rainbet.com/en/articles/17313607-referrals', checked: '2026-11-22'},
    ],
  },
  {
    casino: 'celsius', lang: 'fr', slug: 'retrait', place: 'intent-retrait',
    title: 'Retrait Celsius Casino : minimum 10 €, plafond 10 000 € par mois',
    desc: 'Retirer ses gains sur Celsius Casino : minimum 10 €, dépôt à miser 3 fois, vérification d’identité, même moyen de paiement, plafond mensuel. Les règles tirées des conditions officielles.',
    h1: 'Retrait sur Celsius Casino : les règles officielles',
    lede: 'Ce que les conditions générales de Celsius Casino imposent avant et pendant un retrait, clause par clause. Nous n’avons pas encore fait de retrait nous-mêmes : aucun délai « constaté » n’est donné ici.',
    facts: [
      ['Retrait minimum', '10 € par transaction (clause 9.1)'],
      ['Avant de retirer', 'avoir misé au moins 3 fois son dépôt (clause 9.2)'],
      ['Plafond mensuel', '10 000 € ; 5 000 € si le solde dépasse 10 fois le total des dépôts (clause 9.6)'],
      ['Moyen de paiement', 'celui du dépôt, sauf accord du casino (clause 9.4)'],
      ['Vérification', 'pièce d’identité, justificatif de domicile, parfois selfie ou appel (clause 9.3)'],
      ['Délai de traitement', 'non indiqué dans les conditions'],
    ],
    sections: [
      {h: 'Avant la première demande', p: [
        'Le dépôt doit avoir été misé au moins trois fois avant tout retrait (clause 9.2). Un dépôt de 50 € suppose donc 150 € de mises.',
        'Si un bonus est actif, ses conditions de mise passent avant : un retrait demandé avant de les avoir remplies fait perdre le bonus et les gains qui en viennent (conditions des bonus, article 1.15). Le bonus de bienvenue demande x40 aux 1er et 2e dépôts, x45 au 3e.',
      ]},
      {h: 'La vérification d’identité', p: [
        'Celsius peut demander une pièce d’identité, une preuve d’adresse, un selfie ou un appel de vérification avant d’accorder un retrait, et à tout moment ensuite (clause 9.3). Préparer ces documents avant de gagner évite d’attendre au moment de retirer.',
      ]},
      {h: 'Montants et plafonds', p: [
        'Le minimum est de 10 € par retrait, sauf à la fermeture du compte où tout le solde peut être retiré (clause 9.1).',
        'Le maximum est de 10 000 € par mois. Il tombe à 5 000 € par mois quand le solde atteint au moins 10 fois la somme de tous les dépôts (clause 9.6) : un très gros gain se retire donc en plusieurs mois.',
      ]},
      {h: 'Frais et moyens de paiement', p: [
        'Le retrait se fait vers le moyen de paiement utilisé pour déposer (carte, compte bancaire ou autre) ; un autre moyen reste possible au cas par cas, avec des contrôles en plus (clause 9.4).',
        'Les conditions précisent que des frais peuvent s’appliquer et qu’ils sont affichés sur le site (clause 8.2) ; la page d’accueil de Celsius écrit de son côté que le casino « ne prélève pas de frais de retrait ». Les frais de votre banque ou du réseau crypto restent à votre charge.',
      ]},
      {h: 'Et le délai ?', p: [
        'Les conditions générales ne donnent aucun délai de traitement. Les durées qui circulent sur d’autres sites ne sont pas reprises ici, faute de source officielle. Nous ajouterons un délai mesuré quand nous aurons fait un retrait, avec sa date.',
      ]},
    ],
    sources: [
      {label: 'Conditions générales de Celsius Casino, articles 8 et 9', url: 'https://celsiuscasino.com/fr/terms', checked: '2026-11-22'},
      {label: 'Conditions des bonus de Celsius Casino, article 1.15', url: 'https://celsiuscasino.com/fr/bonuses-terms', checked: '2026-11-22'},
      {label: 'Bonus de bienvenue de Celsius Casino', url: 'https://celsiuscasino.com/fr/welcome-bonus', checked: '2026-11-22'},
    ],
  },
  {
    casino: 'celsius', lang: 'fr', slug: 'bonus-sans-depot', place: 'intent-sans-depot',
    title: 'Celsius Casino bonus sans dépôt : ce que disent les conditions',
    desc: 'Y a-t-il un bonus sans dépôt sur Celsius Casino ? L’offre publique demande un dépôt ; les gains sans dépôt sont plafonnés à 100 €. Les règles officielles et le vrai bonus de bienvenue.',
    h1: 'Celsius Casino : y a-t-il un bonus sans dépôt ?',
    lede: 'Non, pas dans l’offre publique : le bonus de bienvenue de Celsius se débloque sur les quatre premiers dépôts. Les conditions prévoient en revanche des free spins sans dépôt, accordés ponctuellement, avec un plafond de retrait de 100 €.',
    facts: [
      ['Bonus sans dépôt public', 'aucun sur la page bonus de bienvenue, relevée le 22/11/2026'],
      ['Gains sans dépôt', 'retrait plafonné à 100 € (conditions des bonus, article 3.3)'],
      ['Free spins', 'seulement sur les machines indiquées dans l’offre (article 3.1)'],
      ['Bonus de bienvenue', 'jusqu’à 2 000 € + 250 free spins sur 4 dépôts'],
      ['Mise du bonus de bienvenue', 'x40 (1er et 2e dépôts), x45 (3e)'],
      ['Mise maximale avec bonus', '5 € par spin'],
    ],
    sections: [
      {h: 'Ce que l’offre publique propose vraiment', p: [
        'La page officielle du bonus de bienvenue répartit l’offre sur quatre dépôts : 100 % jusqu’à 500 € + 150 free spins, puis 100 % jusqu’à 300 € + 50 free spins, puis 200 % jusqu’à 200 € + 50 free spins, puis 150 % jusqu’à 1 000 €. Aucun de ces paliers ne fonctionne sans dépôt.',
        'Les 150 free spins du premier dépôt arrivent par tranches de 50 par jour pendant 3 jours ; ceux des 2e et 3e dépôts sont crédités tout de suite.',
      ]},
      {h: 'Les free spins sans dépôt, quand il y en a', p: [
        'Les conditions des bonus ont une partie « Bonus sans dépôt / Tours gratuits ». Les free spins ne s’y jouent que sur les machines citées dans l’offre (article 3.1), et les gains obtenus sans aucun dépôt ne se retirent qu’à hauteur de 100 € (article 3.3).',
        'Au 22/11/2026, le bandeau du site annonçait un concours sur le canal Telegram de Celsius, avec 300 free spins à gagner : c’est un tirage, pas un bonus garanti.',
      ]},
      {h: 'Les règles qui s’appliquent à tous les bonus', p: [
        'Un bonus expire 20 jours après avoir été réclamé si ses conditions de mise ne sont pas remplies (article 1.22). Un retrait demandé avant la fin du wager fait perdre le bonus et ses gains (article 1.15). Les jeux à jackpot ne se jouent pas avec un bonus (article 2.8).',
      ]},
    ],
    sources: [
      {label: 'Bonus de bienvenue de Celsius Casino', url: 'https://celsiuscasino.com/fr/welcome-bonus', checked: '2026-11-22'},
      {label: 'Conditions des bonus de Celsius Casino, articles 1, 2 et 3', url: 'https://celsiuscasino.com/fr/bonuses-terms', checked: '2026-11-22'},
    ],
  },
  {
    casino: 'betportal', lang: 'fr', slug: 'code-promo', place: 'intent-code-promo',
    title: 'Betportal code promo 2026 : pas de code, le bonus passe par le lien',
    desc: 'Faut-il un code promo sur Betportal ? Non : le bonus de bienvenue (jusqu’à 1 000 € + 250 free spins sur 3 dépôts) s’active à l’inscription par le lien. Les paliers officiels.',
    h1: 'Code promo Betportal : faut-il un code ?',
    lede: 'Non. Avec notre lien, l’inscription est rattachée à notre compte partenaire et le bonus de bienvenue se réclame sans saisir de code. Voici ce que l’offre donne, palier par palier, d’après les pages officielles de Betportal.',
    facts: [
      ['Code promo', 'aucun à saisir'],
      ['Offre de bienvenue', 'jusqu’à 1 000 € + 250 free spins sur 3 dépôts'],
      ['1er dépôt', '150 % jusqu’à 500 € + 200 free spins'],
      ['2e dépôt', '100 % jusqu’à 300 € + 50 free spins'],
      ['3e dépôt', '50 % jusqu’à 200 €'],
    ],
    sections: [
      {h: 'Comment le bonus s’active sans code', p: [
        'Le lien de cette page porte notre identifiant partenaire : Betportal sait d’où vient l’inscription, il n’y a rien à recopier.',
      ]},
      {h: 'Ce que vaut l’offre', p: [
        'Au total, 1 000 € de bonus maximum et 250 free spins, répartis sur trois dépôts : 150 % jusqu’à 500 € et 200 free spins au premier, 100 % jusqu’à 300 € et 50 free spins au deuxième, 50 % jusqu’à 200 € au troisième.',
        'Les conditions de mise, la mise maximale et la durée de validité figurent sur les pages officielles de chaque palier, liées plus bas. Lisez-les avant de déposer.',
      ]},
    ],
    sources: [
      {label: 'Betportal, page d’accueil et promotions (relevé de la section Affiliation)', url: 'https://betportal.com/en/promotions/38', checked: '2026-11-21'},
    ],
  },
];

export const intentPath = (x: Intent) => `casinos/${x.casino}/${x.slug}/`;
export const intentsOf = (casino: CasinoId, lang: Lang) => INTENTS.filter(x => x.casino === casino && x.lang === lang);
