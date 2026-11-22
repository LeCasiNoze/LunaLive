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
