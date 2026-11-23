import type {Lang} from '../i18n';
import type {CasinoId} from './casinos';

// Pages qui répondent à une recherche précise sur un casino (retrait, bonus sans dépôt, code promo).
// Règle : chaque chiffre vient d'une page officielle du casino, citée avec sa clause et la date du relevé.
// Ce que la source ne dit pas est écrit comme tel, jamais estimé.
export interface Intent {
  casino: CasinoId; lang: Lang; slug: string; place: string;
  // Adresse propre (ex. « rainbet-vs-stake/ ») au lieu de casinos/<casino>/<slug>/.
  path?: string;
  // Comparatifs : tableau à critères explicites (1re colonne = critère) à la place de la liste de faits.
  table?: {cols: string[]; rows: string[][]};
  faq?: {q: string; a: string}[];
  steps?: string[];
  title: string; desc: string; h1: string; lede: string;
  facts: [string, string][];
  sections: {h: string; p: string[]}[];
  sources: {label: string; url: string; checked: string}[];
}

export const INTENTS: Intent[] = [
  {
    casino: 'rainbet', lang: 'en', slug: 'vs-stake', path: 'rainbet-vs-stake/', place: 'vs-stake',
    title: 'Rainbet vs Stake ({month}): Rewards, VIP Thresholds, Operators',
    desc: 'Rainbet vs Stake from their official pages: rakeback every 15 min and 3 daily reloads at Rainbet; Stake’s VIP ranks from $10,000 to $25M wagered, reloads from $250,000. Operators and licences.',
    h1: 'Rainbet vs Stake',
    lede: 'We give no verdict: these are the differences each casino publishes, side by side. Rainbet does not publish the wager thresholds of its ranks. Stake publishes its thresholds, so the comparison is on what each one gives and from what level of play.',
    facts: [
      ['Rainbet operator', 'Rain Group Ltd, Anjouan (company no. 16077)'],
      ['Rainbet rewards', 'rakeback claimable every 15 min, daily, weekly and monthly bonuses, a pre-monthly bonus on the 16th, 3 daily reloads'],
      ['Rainbet VIP host', 'from $2,500,000 wagered (lifetime)'],
      ['Rainbet withdrawals', 'processed in 5 to 15 minutes, per Rainbet'],
      ['Code NIVORANET', '+20% rakeback for 72 hours'],
      ['Stake operator', 'Medium Rare N.V., Curaçao (no. 145353)'],
      ['Stake ranks', 'Bronze $10,000 · Silver $50,000 · Gold $100,000 · Platinum I–III $250,000–$2.5M · Platinum IV–VI $2.5M–$25M · Diamond $25M wagered'],
      ['Stake rewards', 'weekly and monthly bonuses, rakeback and level-up bonuses from Bronze; daily bonuses and reloads from Platinum I'],
      ['Stake VIP host', 'from Platinum IV ($2.5M wagered)'],
    ],
    table: {cols: ['Criterion', 'Rainbet', 'Stake'], rows: [
      ['Operator', 'Rain Group Ltd, Anjouan (no. 16077)', 'Medium Rare N.V., Curaçao (no. 145353)'],
      ['Rakeback', 'claimable every 15 minutes', 'from Bronze ($10,000 wagered)'],
      ['Reloads', '3 a day, every 8 hours', 'from Platinum I ($250,000 wagered)'],
      ['Weekly and monthly bonuses', 'yes, plus a pre-monthly bonus on the 16th', 'from Bronze'],
      ['VIP host', 'from $2,500,000 wagered (lifetime)', 'from Platinum IV ($2.5M wagered)'],
      ['Rank thresholds', 'not published', '$10,000 (Bronze) to $25M (Diamond) wagered'],
      ['Sign-up code', 'NIVORANET: +20% rakeback for 72 hours', '–'],
    ]},
    faq: [
      {q: 'When does Stake give reloads?', a: 'From Platinum I, at $250,000 wagered, per Stake’s VIP Club page (read 23/11/2026).'},
      {q: 'How often can Rainbet rakeback be claimed?', a: 'Every 15 minutes, per Rainbet’s help center (read 23/11/2026).'},
      {q: 'When do you get a VIP host?', a: 'At $2.5M wagered on both: lifetime at Rainbet, Platinum IV at Stake (official pages, read 23/11/2026).'},
      {q: 'What does the code NIVORANET give on Rainbet?', a: '+20% rakeback for 72 hours, the “Affiliate Code Redemption” boost in Rainbet’s help center (read 22/11/2026).'},
    ],
    sections: [
      {h: 'Reloads and bonuses', p: [
        'Rainbet’s help center lists three daily reloads (every 8 hours), a daily bonus, weekly and monthly bonuses and a pre-monthly bonus on the 16th, plus rakeback you can claim every 15 minutes. A reward not claimed before the next one unlocks expires.',
        'Stake’s VIP page ties rewards to wagered amounts: weekly and monthly bonuses, rakeback and level-up bonuses from Bronze ($10,000 wagered), and daily bonuses and reloads from Platinum I ($250,000 wagered).',
      ]},
      {h: 'VIP host', p: [
        'Both put the dedicated VIP host at the same level of play: $2,500,000 wagered over the account’s life at Rainbet, Platinum IV ($2.5M wagered) at Stake.',
      ]},
      {h: 'Our code', p: [
        'Signing up at Rainbet with the code NIVORANET gives +20% rakeback for 72 hours (the largest boost on Rainbet’s list; boosts don’t stack) and entry to our $200 monthly race, paid from $1,000 wagered in the month.',
      ]},
    ],
    sources: [
      {label: 'Rainbet help center, “Rewards Overview”', url: 'https://help.rainbet.com/en/articles/9171035-rewards-overview', checked: '2026-11-23'},
      {label: 'Rainbet help center, “VIP Program”', url: 'https://help.rainbet.com/en/articles/15265421-vip-program', checked: '2026-11-23'},
      {label: 'Rainbet help center, withdrawal times', url: 'https://help.rainbet.com/en/articles/8403745-how-much-time-does-it-take-for-a-withdrawal', checked: '2026-11-22'},
      {label: 'Rainbet terms of service (operator), read by our Affiliation team', url: 'https://rainbet.com/terms', checked: '2026-11-21'},
      {label: 'Stake VIP Club page', url: 'https://stake.com/vip-club', checked: '2026-11-23'},
    ],
  },
  {
    casino: 'rainbet', lang: 'en', slug: 'vs-roobet', path: 'rainbet-vs-roobet/', place: 'vs-roobet',
    title: 'Rainbet vs Roobet ({month}): Rewards, VIP Access, Operators',
    desc: 'Rainbet vs Roobet from their official pages: Rainbet’s rakeback every 15 min, daily reloads and VIP host at $2.5M wagered; Roobet’s invitation-only VIP. Operators and licences.',
    h1: 'Rainbet vs Roobet',
    lede: 'We give no verdict: these are the differences each casino publishes, side by side. Rainbet does not publish the wager thresholds of its ranks. Roobet publishes no thresholds at all: its VIP club is by invitation.',
    facts: [
      ['Rainbet operator', 'Rain Group Ltd, Anjouan (company no. 16077)'],
      ['Rainbet rewards', 'rakeback claimable every 15 min, daily, weekly and monthly bonuses, a pre-monthly bonus on the 16th, 3 daily reloads'],
      ['Rainbet VIP host', 'from $2,500,000 wagered (lifetime)'],
      ['Rainbet withdrawals', 'processed in 5 to 15 minutes, per Rainbet'],
      ['Code NIVORANET', '+20% rakeback for 72 hours'],
      ['Roobet operator', 'Raw Entertainment B.V., Curaçao (no. 157205), licence OGL/2024/687/0427'],
      ['Roobet VIP', 'invitation only; no published thresholds'],
      ['Roobet VIP rewards', 'weekly slot rewards, activity-based cashback, monthly VIP promotions, dedicated support'],
    ],
    table: {cols: ['Criterion', 'Rainbet', 'Roobet'], rows: [
      ['Operator', 'Rain Group Ltd, Anjouan (no. 16077)', 'Raw Entertainment B.V., Curaçao (no. 157205)'],
      ['Licence number published', 'not found', 'OGL/2024/687/0427'],
      ['Rakeback', 'claimable every 15 minutes', 'activity-based cashback for eligible VIPs'],
      ['Reloads', '3 a day, every 8 hours', 'not listed'],
      ['VIP access', 'host from $2,500,000 wagered', 'invitation only, no published threshold'],
      ['Sign-up code', 'NIVORANET: +20% rakeback for 72 hours', '–'],
    ]},
    faq: [
      {q: 'How do you join Roobet VIP?', a: 'By invitation only, with no application and no published threshold, per Roobet’s VIP page (read 23/11/2026).'},
      {q: 'How often can Rainbet rakeback be claimed?', a: 'Every 15 minutes, per Rainbet’s help center (read 23/11/2026).'},
      {q: 'What licence does Roobet show?', a: 'Curaçao licence OGL/2024/687/0427, held by Raw Entertainment B.V., per Roobet’s footer (read 23/11/2026).'},
      {q: 'What does the code NIVORANET give on Rainbet?', a: '+20% rakeback for 72 hours, per Rainbet’s help center (read 22/11/2026).'},
    ],
    sections: [
      {h: 'How you get rewards', p: [
        'Rainbet lists its rewards for every player in its help center: rakeback every 15 minutes, three daily reloads, daily, weekly, monthly and pre-monthly bonuses. A dedicated VIP host comes at $2,500,000 wagered.',
        'Roobet’s VIP page says membership is by invitation only, based on loyalty, stakes and variety of play, with no application. Its VIP perks are weekly slot rewards, activity-based cashback for eligible VIPs, monthly VIP promotions and dedicated support.',
      ]},
      {h: 'Our code', p: [
        'Signing up at Rainbet with the code NIVORANET gives +20% rakeback for 72 hours and entry to our $200 monthly race, paid from $1,000 wagered in the month.',
      ]},
    ],
    sources: [
      {label: 'Rainbet help center, “Rewards Overview”', url: 'https://help.rainbet.com/en/articles/9171035-rewards-overview', checked: '2026-11-23'},
      {label: 'Rainbet help center, “VIP Program”', url: 'https://help.rainbet.com/en/articles/15265421-vip-program', checked: '2026-11-23'},
      {label: 'Rainbet help center, withdrawal times', url: 'https://help.rainbet.com/en/articles/8403745-how-much-time-does-it-take-for-a-withdrawal', checked: '2026-11-22'},
      {label: 'Rainbet terms of service (operator), read by our Affiliation team', url: 'https://rainbet.com/terms', checked: '2026-11-21'},
      {label: 'Roobet VIP page and footer', url: 'https://roobet.com/vip', checked: '2026-11-23'},
    ],
  },
  {
    casino: 'rainbet', lang: 'en', slug: 'vs-shuffle', path: 'rainbet-vs-shuffle/', place: 'vs-shuffle',
    title: 'Rainbet vs Shuffle ({month}): Rewards, VIP Ranks, Operators',
    desc: 'Rainbet vs Shuffle from their official pages: Rainbet’s rakeback every 15 min, daily reloads and VIP host at $2.5M wagered; Shuffle’s 8 VIP ranks with instant rakeback from Bronze. Operators and licences.',
    h1: 'Rainbet vs Shuffle',
    lede: 'We give no verdict: these are the differences each casino publishes, side by side. Rainbet does not publish the wager thresholds of its ranks. Shuffle lists its ranks and their perks but not their thresholds either.',
    facts: [
      ['Rainbet operator', 'Rain Group Ltd, Anjouan (company no. 16077)'],
      ['Rainbet rewards', 'rakeback claimable every 15 min, daily, weekly and monthly bonuses, a pre-monthly bonus on the 16th, 3 daily reloads'],
      ['Rainbet VIP host', 'from $2,500,000 wagered (lifetime)'],
      ['Rainbet withdrawals', 'processed in 5 to 15 minutes, per Rainbet'],
      ['Code NIVORANET', '+20% rakeback for 72 hours'],
      ['Shuffle operator', 'Natural Nine B.V., Curaçao (no. 160998), licence OGL/2024/1337/0628'],
      ['Shuffle ranks', 'Bronze, Silver, Gold, Platinum, Jade, Sapphire, Ruby, Diamond; thresholds not published'],
      ['Shuffle rewards', 'instant rakeback, weekly, level and rank-up bonuses from Bronze; monthly bonus from Silver'],
      ['Shuffle VIP host', 'for higher ranks'],
    ],
    table: {cols: ['Criterion', 'Rainbet', 'Shuffle'], rows: [
      ['Operator', 'Rain Group Ltd, Anjouan (no. 16077)', 'Natural Nine B.V., Curaçao (no. 160998)'],
      ['Licence number published', 'not found', 'OGL/2024/1337/0628'],
      ['Rakeback', 'claimable every 15 minutes', 'instant, from Bronze'],
      ['Reloads', '3 a day, every 8 hours', 'listed among VIP perks, no schedule given'],
      ['Monthly bonus', 'yes, plus a pre-monthly bonus on the 16th', 'from Silver'],
      ['VIP host', 'from $2,500,000 wagered (lifetime)', 'for higher ranks, amount not published'],
      ['Rank thresholds', 'not published', 'not published (8 ranks, Bronze to Diamond)'],
      ['Sign-up code', 'NIVORANET: +20% rakeback for 72 hours', '–'],
    ]},
    faq: [
      {q: 'How many VIP ranks does Shuffle have?', a: 'Eight, from Bronze to Diamond, per Shuffle’s VIP program page (read 23/11/2026).'},
      {q: 'How often can Rainbet rakeback be claimed?', a: 'Every 15 minutes, per Rainbet’s help center (read 23/11/2026).'},
      {q: 'When do you get a VIP host on Rainbet?', a: 'At $2,500,000 wagered over the account’s life, per Rainbet’s help center (read 23/11/2026).'},
      {q: 'What does the code NIVORANET give on Rainbet?', a: '+20% rakeback for 72 hours, per Rainbet’s help center (read 22/11/2026).'},
    ],
    sections: [
      {h: 'Rakeback and bonuses', p: [
        'Rainbet’s help center lists rakeback claimable every 15 minutes, three daily reloads, and daily, weekly, monthly and pre-monthly bonuses. Shuffle’s VIP table lists instant rakeback, a weekly bonus, level bonuses and rank-up bonuses from its first rank, Bronze, and a monthly bonus from Silver.',
      ]},
      {h: 'VIP host', p: [
        'Rainbet gives a dedicated host from $2,500,000 wagered over the account’s life. Shuffle reserves its VIP hosts for higher ranks without giving the amount.',
      ]},
      {h: 'Our code', p: [
        'Signing up at Rainbet with the code NIVORANET gives +20% rakeback for 72 hours and entry to our $200 monthly race, paid from $1,000 wagered in the month.',
      ]},
    ],
    sources: [
      {label: 'Rainbet help center, “Rewards Overview”', url: 'https://help.rainbet.com/en/articles/9171035-rewards-overview', checked: '2026-11-23'},
      {label: 'Rainbet help center, “VIP Program”', url: 'https://help.rainbet.com/en/articles/15265421-vip-program', checked: '2026-11-23'},
      {label: 'Rainbet help center, withdrawal times', url: 'https://help.rainbet.com/en/articles/8403745-how-much-time-does-it-take-for-a-withdrawal', checked: '2026-11-22'},
      {label: 'Rainbet terms of service (operator), read by our Affiliation team', url: 'https://rainbet.com/terms', checked: '2026-11-21'},
      {label: 'Shuffle VIP program page and footer', url: 'https://shuffle.com/vip-program', checked: '2026-11-23'},
    ],
  },
  {
    casino: 'rainbet', lang: 'en', slug: 'like-stake', path: 'casinos-like-stake/', place: 'like-stake',
    title: 'Casinos Like Stake ({month}): Rainbet and Celsius on the Facts',
    desc: 'Looking for a casino like Stake? Two crypto casinos we stream on: Rainbet (rakeback every 15 min, 3 daily reloads, code NIVORANET) and Celsius (up to €2,000 + 250 free spins). Official figures only.',
    h1: 'Casinos like Stake: two alternatives we play on',
    lede: 'Stake is a crypto casino with a wager-based VIP ladder. Here are the two crypto casinos our streamers use, with what each one publishes. No ranking, no verdict: the facts and their sources.',
    facts: [
      ['Stake, for reference', 'Medium Rare N.V. (Curaçao); VIP ranks from $10,000 wagered, reloads from $250,000, VIP host from $2.5M'],
      ['Rainbet', 'rakeback every 15 min, 3 daily reloads, daily to monthly bonuses; VIP host from $2.5M wagered'],
      ['Rainbet with NIVORANET', '+20% rakeback for 72 hours, plus our $200 monthly race'],
      ['Celsius', 'welcome offer up to €2,000 + 250 free spins over 4 deposits, wagering x40 (x45 on the 3rd)'],
      ['Celsius operator', 'Celsius Holdings N.V., Curaçao (no. 157856)'],
    ],
    table: {cols: ['Criterion', 'Stake (reference)', 'Rainbet', 'Celsius'], rows: [
      ['Model', 'wager-based VIP ladder', 'rakeback and daily reloads', 'deposit bonus'],
      ['Rakeback', 'from Bronze ($10,000 wagered)', 'claimable every 15 minutes', 'listed as a possible special bonus (bonus terms, 1.21)'],
      ['Reloads', 'from Platinum I ($250,000 wagered)', '3 a day, every 8 hours', '–'],
      ['Welcome offer', '–', 'code NIVORANET: +20% rakeback for 72 hours', 'up to €2,000 + 250 free spins over 4 deposits'],
      ['Wagering on the welcome offer', '–', '–', 'x40 (x45 on the 3rd deposit)'],
      ['Operator', 'Medium Rare N.V., Curaçao', 'Rain Group Ltd, Anjouan', 'Celsius Holdings N.V., Curaçao'],
    ]},
    faq: [
      {q: 'Which casino is closest to Stake’s rewards model?', a: 'Rainbet, which pays rakeback every 15 minutes and three daily reloads rather than a deposit match, per its help center (read 23/11/2026).'},
      {q: 'Which alternative has a deposit bonus?', a: 'Celsius, with up to €2,000 + 250 free spins over four deposits, per its welcome bonus page (read 22/11/2026).'},
      {q: 'When does Stake start reloads?', a: 'At Platinum I, $250,000 wagered, per Stake’s VIP Club page (read 23/11/2026).'},
      {q: 'Is there a code for Rainbet?', a: 'Yes, NIVORANET gives +20% rakeback for 72 hours, per Rainbet’s help center (read 22/11/2026).'},
    ],
    sections: [
      {h: 'Rainbet: closest to Stake’s rewards model', p: [
        'Like Stake, Rainbet pays you back on volume rather than with a big deposit match: rakeback claimable every 15 minutes, three daily reloads, and daily, weekly, monthly and pre-monthly bonuses, per its help center. Stake starts its reloads at Platinum I ($250,000 wagered); Rainbet’s help center lists the daily reloads without a published threshold.',
        'With our code NIVORANET you get +20% rakeback for 72 hours, and you enter our $200 monthly race (paid from $1,000 wagered in the month).',
      ]},
      {h: 'Celsius: a deposit bonus instead', p: [
        'Celsius goes the other way, with a welcome package over four deposits: 100% up to €500 + 150 free spins, 100% up to €300 + 50 free spins, 200% up to €200 + 50 free spins, then 150% up to €1,000. Wagering is x40 on the first two, x45 on the third, with a €5 maximum bet while a bonus is active.',
      ]},
    ],
    sources: [
      {label: 'Stake VIP Club page', url: 'https://stake.com/vip-club', checked: '2026-11-23'},
      {label: 'Rainbet help center, “Rewards Overview”', url: 'https://help.rainbet.com/en/articles/9171035-rewards-overview', checked: '2026-11-23'},
      {label: 'Rainbet help center, “VIP Program”', url: 'https://help.rainbet.com/en/articles/15265421-vip-program', checked: '2026-11-23'},
      {label: 'Rainbet help center, withdrawal times', url: 'https://help.rainbet.com/en/articles/8403745-how-much-time-does-it-take-for-a-withdrawal', checked: '2026-11-22'},
      {label: 'Rainbet terms of service (operator), read by our Affiliation team', url: 'https://rainbet.com/terms', checked: '2026-11-21'},
      {label: 'Celsius Casino welcome bonus page', url: 'https://celsiuscasino.com/welcome-bonus', checked: '2026-11-22'},
      {label: 'Celsius Casino bonus terms, article 1.21', url: 'https://celsiuscasino.com/bonuses-terms', checked: '2026-11-22'},
    ],
  },
  {
    casino: 'rainbet', lang: 'en', slug: 'canada', path: 'rainbet-canada/', place: 'rainbet-canada',
    title: 'Rainbet Canada ({month}): Interac from C$15, CAD Withdrawals, Code NIVORANET',
    desc: 'Rainbet for Canadian players, from Rainbet’s help center: Interac deposits from C$15, Interac withdrawals from C$50 (C$2.85 fee), crypto withdrawals processed in 5–15 min, code NIVORANET for +20% rakeback.',
    h1: 'Rainbet in Canada: Interac, crypto and the code',
    lede: 'Rainbet takes Interac, the Canadian bank transfer, both ways, alongside crypto. Here are the minimums, fees and checks Rainbet’s help center publishes for each method, and what our code adds.',
    facts: [
      ['Interac deposit', 'from C$15'],
      ['Interac withdrawal', 'from C$50, flat fee of C$2.85 per transaction'],
      ['Crypto withdrawal', 'processed in 5 to 15 minutes; no Rainbet fee, only the network fee'],
      ['Code NIVORANET', '+20% rakeback for 72 hours, plus our $200 monthly race'],
    ],
    table: {cols: ['Method', 'Minimum', 'Fee', 'Verification', 'Timing'], rows: [
      ['Interac deposit', 'C$15', 'none stated', 'email + KYC (Level 1 per the deposit guide, Level 2 per the KYC article)', 'refund in 1–3 business days if rejected'],
      ['Interac withdrawal', 'C$50', 'C$2.85 per transaction', 'email + KYC Level 2', 'moments with autodeposit, else 2 emails to claim'],
      ['Crypto deposit', 'set per coin, shown in the cashier', 'network fee', 'no KYC', 'credited once confirmed on the blockchain'],
      ['Crypto withdrawal', 'not published', 'no Rainbet fee, network fee only', 'no KYC', 'processed in 5–15 min, 5–45 min to confirm on chain'],
      ['AstroPay withdrawal', '$50', '0.5%', 'active AstroPay account', 'instant once processed'],
      ['Gift card (Kinguin)', 'card value', 'per Kinguin', 'no KYC', 'credited on redemption'],
    ]},
    faq: [
      {q: 'Does Rainbet take Interac?', a: 'Yes, for deposits from C$15 and withdrawals from C$50, per Rainbet’s help center (read 23/11/2026).'},
      {q: 'What does an Interac withdrawal cost on Rainbet?', a: 'A flat fee of C$2.85 per transaction, per Rainbet’s fiat withdrawal guide (read 23/11/2026).'},
      {q: 'Do I need KYC to play with crypto on Rainbet?', a: 'No, crypto and gift card transactions need no KYC; Interac needs it, per Rainbet’s KYC article (read 23/11/2026).'},
      {q: 'What does the code NIVORANET give?', a: '+20% rakeback for 72 hours, per Rainbet’s help center (read 22/11/2026).'},
    ],
    sections: [
      {h: 'Interac: the details that block a deposit', p: [
        'Rainbet’s Interac guide asks for email verification and KYC first, then a deposit from the Wallet’s Banking tab with your phone number. The bank account must match your KYC name and email exactly, the amount must match the request, and an e-Transfer needs the reference code in the memo. A transfer from someone else’s account is rejected and refunded within 1 to 3 business days.',
        'Rainbet’s own pages differ on the KYC level: the deposit guide says Level 1, the KYC article says Level 2 for Interac. Expect to be asked for Level 2.',
      ]},
      {h: 'Before you withdraw', p: [
        'Every deposit has to be wagered once (1x) before it can be withdrawn, under Rainbet’s anti-money-laundering rule. The optional first-deposit bonus is different: it doubles the deposit but requires 40x the deposit plus bonus, so $8,000 of bets for a $100 deposit, and disables games above 97.4% RTP while it runs.',
        'Interac withdrawals arrive within moments with autodeposit on; otherwise you get two emails, one with the payment link and one with the password.',
      ]},
      {h: 'Our code', p: [
        'Signing up with the code NIVORANET gives +20% rakeback for 72 hours on top of Rainbet’s rakeback every 15 minutes and three daily reloads, and entry to our $200 monthly race, paid from $1,000 wagered in the month.',
      ]},
    ],
    sources: [
      {label: 'Rainbet help center, “How to Make an Interac Deposit”', url: 'https://help.rainbet.com/en/articles/15255801-how-to-make-an-interac-deposit', checked: '2026-11-23'},
      {label: 'Rainbet help center, “Minimum Deposit Guidelines”', url: 'https://help.rainbet.com/en/articles/17322229-minimum-deposit-guidelines', checked: '2026-11-23'},
      {label: 'Rainbet help center, “How to Make a Fiat Withdraw”', url: 'https://help.rainbet.com/en/articles/15254950-how-to-make-a-fiat-withdraw', checked: '2026-11-23'},
      {label: 'Rainbet help center, withdrawal times', url: 'https://help.rainbet.com/en/articles/8403745-how-much-time-does-it-take-for-a-withdrawal', checked: '2026-11-23'},
      {label: 'Rainbet help center, “KYC”', url: 'https://help.rainbet.com/en/articles/15264824-kyc', checked: '2026-11-23'},
      {label: 'Rainbet help center, “Wager Requirement for Deposits”', url: 'https://help.rainbet.com/en/articles/16312455-wager-requirement-for-deposits', checked: '2026-11-23'},
      {label: 'Rainbet help center, “First Deposit Promotion”', url: 'https://help.rainbet.com/en/articles/15268657-first-deposit-promotion', checked: '2026-11-23'},
      {label: 'Rainbet help center, “Rewards Overview”', url: 'https://help.rainbet.com/en/articles/9171035-rewards-overview', checked: '2026-11-23'},
    ],
  },
  {
    casino: 'rainbet', lang: 'en', slug: 'australia', path: 'rainbet-australia/', place: 'rainbet-australia',
    title: 'Rainbet Australia ({month}): Crypto Deposits, 5–15 Min Withdrawals, Code NIVORANET',
    desc: 'Rainbet for Australian players, from Rainbet’s help center: crypto deposits with no KYC, withdrawals processed in 5–15 min with no Rainbet fee, AstroPay and gift cards, code NIVORANET for +20% rakeback.',
    h1: 'Rainbet in Australia: crypto, withdrawals and the code',
    lede: 'Rainbet’s help center lists no AUD bank method: you deposit in crypto or with a gift card, and withdraw in crypto or to AstroPay. Here are the minimums, fees and checks it publishes, and what our code adds.',
    facts: [
      ['Crypto deposit', 'minimum set per coin, shown in the cashier; no KYC'],
      ['Crypto withdrawal', 'processed in 5 to 15 minutes; no Rainbet fee, only the network fee'],
      ['AstroPay withdrawal', 'from $50, fee 0.5%'],
      ['Code NIVORANET', '+20% rakeback for 72 hours, plus our $200 monthly race'],
    ],
    table: {cols: ['Method', 'Minimum', 'Fee', 'Verification', 'Timing'], rows: [
      ['Crypto deposit', 'set per coin, shown in the cashier', 'network fee', 'no KYC', 'credited once confirmed on the blockchain'],
      ['Crypto withdrawal', 'not published', 'no Rainbet fee, network fee only', 'no KYC', 'processed in 5–15 min, 5–45 min to confirm on chain'],
      ['Gift card (Kinguin)', 'card value', 'per Kinguin', 'no KYC', 'credited on redemption'],
      ['AstroPay withdrawal', '$50', '0.5%', 'active AstroPay account', 'instant once processed'],
    ]},
    faq: [
      {q: 'How do you deposit on Rainbet without a bank transfer?', a: 'In crypto, or with a Kinguin gift card redeemed in the Wallet, per Rainbet’s help center (read 23/11/2026).'},
      {q: 'How fast are Rainbet crypto withdrawals?', a: 'Processed in 5 to 15 minutes, then 5 to 45 minutes to confirm on chain depending on the coin, per Rainbet (read 23/11/2026).'},
      {q: 'Do I need KYC for crypto on Rainbet?', a: 'No, crypto and gift card transactions need no KYC unless Rainbet asks, per its KYC article (read 23/11/2026).'},
      {q: 'What does the code NIVORANET give?', a: '+20% rakeback for 72 hours, per Rainbet’s help center (read 22/11/2026).'},
    ],
    sections: [
      {h: 'Depositing in crypto', p: [
        'In the Wallet, pick Crypto, then the coin (Rainbet’s examples: Bitcoin, USDT, Ethereum) and the network that matches your wallet (TRC20, ERC20, BEP20). Rainbet generates a deposit address for your account; send at least the minimum shown in the cashier, since a deposit below it is not credited until you top it up with the same coin and network.',
        'Gift cards are sold by Kinguin, which takes cards, crypto and regional methods; the code it gives you is redeemed in the Wallet’s Redeem section.',
      ]},
      {h: 'Before you withdraw', p: [
        'Every deposit has to be wagered once (1x) before it can be withdrawn. The optional first-deposit bonus doubles the deposit but requires 40x the deposit plus bonus, so $8,000 of bets for a $100 deposit, and disables games above 97.4% RTP while it runs.',
        'Rainbet charges no withdrawal fee on crypto; you pay the network fee, which depends on the coin and the traffic.',
      ]},
      {h: 'Our code', p: [
        'Signing up with the code NIVORANET gives +20% rakeback for 72 hours on top of Rainbet’s rakeback every 15 minutes and three daily reloads, and entry to our $200 monthly race, paid from $1,000 wagered in the month.',
      ]},
    ],
    sources: [
      {label: 'Rainbet help center, “How to Deposit Using Cryptocurrency”', url: 'https://help.rainbet.com/en/articles/11399610-how-to-deposit-using-cryptocurrency-on-rainbet', checked: '2026-11-23'},
      {label: 'Rainbet help center, “Minimum Deposit Guidelines”', url: 'https://help.rainbet.com/en/articles/17322229-minimum-deposit-guidelines', checked: '2026-11-23'},
      {label: 'Rainbet help center, “Gift Cards”', url: 'https://help.rainbet.com/en/articles/15255676-gift-cards', checked: '2026-11-23'},
      {label: 'Rainbet help center, “How to Make a Crypto Withdraw”', url: 'https://help.rainbet.com/en/articles/15254412-how-to-make-a-crypto-withdraw', checked: '2026-11-23'},
      {label: 'Rainbet help center, “How to Make a Fiat Withdraw”', url: 'https://help.rainbet.com/en/articles/15254950-how-to-make-a-fiat-withdraw', checked: '2026-11-23'},
      {label: 'Rainbet help center, withdrawal times', url: 'https://help.rainbet.com/en/articles/8403745-how-much-time-does-it-take-for-a-withdrawal', checked: '2026-11-23'},
      {label: 'Rainbet help center, “KYC”', url: 'https://help.rainbet.com/en/articles/15264824-kyc', checked: '2026-11-23'},
      {label: 'Rainbet help center, “Wager Requirement for Deposits”', url: 'https://help.rainbet.com/en/articles/16312455-wager-requirement-for-deposits', checked: '2026-11-23'},
      {label: 'Rainbet help center, “First Deposit Promotion”', url: 'https://help.rainbet.com/en/articles/15268657-first-deposit-promotion', checked: '2026-11-23'},
    ],
  },
  {
    casino: 'rainbet', lang: 'en', slug: 'crypto-canada', path: 'best-crypto-casino-canada/', place: 'crypto-canada',
    title: 'Best Crypto Casino in Canada ({month}): Rainbet vs Celsius on Interac, Fees, Withdrawals',
    desc: 'Crypto casinos for Canadian players, side by side from their official pages: Rainbet (Interac from C$15, crypto withdrawals in 5–15 min, no KYC for crypto) and Celsius (9 coins, up to €2,000 + 250 free spins).',
    h1: 'Best crypto casino in Canada: the two we play on, compared',
    lede: 'No ranking and no verdict: these are the two crypto casinos our streamers use, with what each one publishes on payments, withdrawals and rewards. The difference for Canada is Interac, which only Rainbet lists.',
    facts: [
      ['Rainbet', 'Interac from C$15 and crypto; crypto withdrawals processed in 5–15 min; code NIVORANET: +20% rakeback for 72 hours'],
      ['Celsius', '9 cryptocurrencies, euro as fiat currency; crypto withdrawals in 5–15 min; up to €2,000 + 250 free spins over 4 deposits'],
    ],
    table: {cols: ['Criterion', 'Rainbet', 'Celsius'], rows: [
      ['Interac', 'deposit from C$15, withdrawal from C$50 (C$2.85 fee)', 'not listed'],
      ['Currencies', 'CAD through Interac, crypto', 'EUR and crypto'],
      ['Cryptocurrencies named', 'Bitcoin, USDT, Ethereum (examples), on TRC20, ERC20, BEP20', 'BTC, ETH, BNB, LTC, TRX, USDT, XRP, DOGE, BCH'],
      ['Crypto withdrawal processing', '5–15 minutes', '“most transactions” in 5–15 minutes'],
      ['Withdrawal fee', 'none from Rainbet, network fee only', 'none, per Celsius'],
      ['Minimum withdrawal', 'C$50 Interac; crypto not published', '€10 per transaction (terms 9.1)'],
      ['KYC for crypto', 'not required unless requested', 'may be requested before a withdrawal (terms 9.3)'],
      ['Before a withdrawal', 'deposit wagered 1x', 'deposit wagered 3x (terms 9.2)'],
      ['Rewards', 'rakeback every 15 min, 3 daily reloads', 'VIP club, 5% to 22% instant rakeback by tier'],
      ['Welcome offer', 'code NIVORANET: +20% rakeback for 72 hours', 'up to €2,000 + 250 free spins over 4 deposits'],
      ['Operator', 'Rain Group Ltd, Anjouan (no. 16077)', 'Celsius Holdings N.V., Curaçao (no. 157856)'],
    ]},
    faq: [
      {q: 'Which of the two takes Interac?', a: 'Rainbet, with deposits from C$15 and withdrawals from C$50, per its help center (read 23/11/2026); Celsius lists no Interac.'},
      {q: 'Which one pays crypto withdrawals faster?', a: 'Both publish 5 to 15 minutes of processing for crypto withdrawals (official pages, read 23/11/2026).'},
      {q: 'How much must a deposit be wagered before a withdrawal?', a: 'Once at Rainbet and three times at Celsius, per their help center and terms (read 23/11/2026).'},
      {q: 'Which one has a deposit bonus?', a: 'Celsius, with up to €2,000 + 250 free spins over four deposits, per its welcome bonus page (read 22/11/2026).'},
    ],
    sections: [
      {h: 'Rainbet: Interac and crypto', p: [
        'Rainbet lists Interac both ways: deposits from C$15 and withdrawals from C$50 with a flat C$2.85 fee, both after email verification and KYC. Crypto needs no KYC; withdrawals are processed in 5 to 15 minutes and Rainbet charges no fee beyond the network’s.',
        'Its rewards are volume-based: rakeback claimable every 15 minutes and three daily reloads. Our code NIVORANET adds +20% rakeback for 72 hours and entry to our $200 monthly race, paid from $1,000 wagered in the month.',
      ]},
      {h: 'Celsius: nine coins and a deposit bonus', p: [
        'Celsius’s home page names nine cryptocurrencies and the euro as fiat currency, says most transactions are processed in 5 to 15 minutes and that it charges no withdrawal fee. Its terms set a €10 minimum withdrawal, require the deposit to be wagered three times first, and let Celsius ask for identity documents.',
        'Its welcome offer runs over four deposits: up to €2,000 and 250 free spins, wagering x40 (x45 on the third). Its VIP club lists instant rakeback from 5% (Rookie) to 22% (Whale).',
      ]},
    ],
    sources: [
      {label: 'Rainbet help center, “Minimum Deposit Guidelines”', url: 'https://help.rainbet.com/en/articles/17322229-minimum-deposit-guidelines', checked: '2026-11-23'},
      {label: 'Rainbet help center, “How to Make a Fiat Withdraw”', url: 'https://help.rainbet.com/en/articles/15254950-how-to-make-a-fiat-withdraw', checked: '2026-11-23'},
      {label: 'Rainbet help center, “How to Make a Crypto Withdraw”', url: 'https://help.rainbet.com/en/articles/15254412-how-to-make-a-crypto-withdraw', checked: '2026-11-23'},
      {label: 'Rainbet help center, “How to Deposit Using Cryptocurrency”', url: 'https://help.rainbet.com/en/articles/11399610-how-to-deposit-using-cryptocurrency-on-rainbet', checked: '2026-11-23'},
      {label: 'Rainbet help center, “KYC”', url: 'https://help.rainbet.com/en/articles/15264824-kyc', checked: '2026-11-23'},
      {label: 'Rainbet help center, “Wager Requirement for Deposits”', url: 'https://help.rainbet.com/en/articles/16312455-wager-requirement-for-deposits', checked: '2026-11-23'},
      {label: 'Rainbet help center, “Rewards Overview”', url: 'https://help.rainbet.com/en/articles/9171035-rewards-overview', checked: '2026-11-23'},
      {label: 'Rainbet terms of service (operator), read by our Affiliation team', url: 'https://rainbet.com/terms', checked: '2026-11-21'},
      {label: 'Celsius Casino home page, payments and VIP sections (coins, processing time, fees, VIP rakeback)', url: 'https://celsiuscasino.com/', checked: '2026-11-23'},
      {label: 'Celsius Casino terms, articles 9.1 to 9.3 (operator)', url: 'https://celsiuscasino.com/terms', checked: '2026-11-23'},
      {label: 'Celsius Casino welcome bonus page', url: 'https://celsiuscasino.com/welcome-bonus', checked: '2026-11-22'},
    ],
  },
  {
    casino: 'rainbet', lang: 'en', slug: 'crypto-australia', path: 'best-crypto-casino-australia/', place: 'crypto-australia',
    title: 'Best Crypto Casino in Australia ({month}): Rainbet vs Celsius on Coins, Fees, Withdrawals',
    desc: 'Crypto casinos for Australian players, side by side from their official pages: Rainbet (no KYC for crypto, withdrawals in 5–15 min, code NIVORANET) and Celsius (9 coins, up to €2,000 + 250 free spins).',
    h1: 'Best crypto casino in Australia: the two we play on, compared',
    lede: 'No ranking and no verdict: these are the two crypto casinos our streamers use, with what each one publishes on coins, withdrawals and rewards. Neither lists an AUD bank method, so the comparison is on crypto.',
    facts: [
      ['Rainbet', 'crypto and gift cards, no KYC for crypto; withdrawals processed in 5–15 min; code NIVORANET: +20% rakeback for 72 hours'],
      ['Celsius', '9 cryptocurrencies; crypto withdrawals in 5–15 min; up to €2,000 + 250 free spins over 4 deposits'],
    ],
    table: {cols: ['Criterion', 'Rainbet', 'Celsius'], rows: [
      ['Cryptocurrencies named', 'Bitcoin, USDT, Ethereum (examples), on TRC20, ERC20, BEP20', 'BTC, ETH, BNB, LTC, TRX, USDT, XRP, DOGE, BCH'],
      ['Other methods', 'Kinguin gift cards; AstroPay withdrawals from $50 (0.5%)', 'Visa, Paysafecard, PayPal, Skrill, Alipay, WeChat Pay, per its home page'],
      ['Crypto withdrawal processing', '5–15 minutes', '“most transactions” in 5–15 minutes'],
      ['Withdrawal fee', 'none from Rainbet, network fee only', 'none, per Celsius'],
      ['Minimum withdrawal', 'crypto not published', '€10 per transaction (terms 9.1)'],
      ['KYC for crypto', 'not required unless requested', 'may be requested before a withdrawal (terms 9.3)'],
      ['Before a withdrawal', 'deposit wagered 1x', 'deposit wagered 3x (terms 9.2)'],
      ['Rewards', 'rakeback every 15 min, 3 daily reloads', 'VIP club, 5% to 22% instant rakeback by tier'],
      ['Welcome offer', 'code NIVORANET: +20% rakeback for 72 hours', 'up to €2,000 + 250 free spins over 4 deposits'],
      ['Operator', 'Rain Group Ltd, Anjouan (no. 16077)', 'Celsius Holdings N.V., Curaçao (no. 157856)'],
    ]},
    faq: [
      {q: 'Which one accepts more coins?', a: 'Celsius names nine (BTC, ETH, BNB, LTC, TRX, USDT, XRP, DOGE, BCH); Rainbet gives Bitcoin, USDT and Ethereum as examples (official pages, read 23/11/2026).'},
      {q: 'Which one pays crypto withdrawals faster?', a: 'Both publish 5 to 15 minutes of processing for crypto withdrawals (official pages, read 23/11/2026).'},
      {q: 'Which one needs no KYC for crypto?', a: 'Rainbet, unless it asks, per its KYC article; Celsius’s terms let it request documents (read 23/11/2026).'},
      {q: 'Which one has a deposit bonus?', a: 'Celsius, with up to €2,000 + 250 free spins over four deposits, per its welcome bonus page (read 22/11/2026).'},
    ],
    sections: [
      {h: 'Rainbet: crypto without KYC', p: [
        'Rainbet’s help center says crypto and gift card transactions need no KYC unless its team asks. Crypto withdrawals are processed in 5 to 15 minutes, with no fee beyond the network’s; every deposit has to be wagered once before it can be withdrawn.',
        'Its rewards are volume-based: rakeback claimable every 15 minutes and three daily reloads. Our code NIVORANET adds +20% rakeback for 72 hours and entry to our $200 monthly race, paid from $1,000 wagered in the month.',
      ]},
      {h: 'Celsius: nine coins and a deposit bonus', p: [
        'Celsius’s home page names nine cryptocurrencies, says most transactions are processed in 5 to 15 minutes and that it charges no withdrawal fee. Its terms set a €10 minimum withdrawal, require the deposit to be wagered three times first, and let Celsius ask for identity documents.',
        'Its welcome offer runs over four deposits: up to €2,000 and 250 free spins, wagering x40 (x45 on the third). Its VIP club lists instant rakeback from 5% (Rookie) to 22% (Whale).',
      ]},
    ],
    sources: [
      {label: 'Rainbet help center, “How to Deposit Using Cryptocurrency”', url: 'https://help.rainbet.com/en/articles/11399610-how-to-deposit-using-cryptocurrency-on-rainbet', checked: '2026-11-23'},
      {label: 'Rainbet help center, “How to Make a Crypto Withdraw”', url: 'https://help.rainbet.com/en/articles/15254412-how-to-make-a-crypto-withdraw', checked: '2026-11-23'},
      {label: 'Rainbet help center, “How to Make a Fiat Withdraw”', url: 'https://help.rainbet.com/en/articles/15254950-how-to-make-a-fiat-withdraw', checked: '2026-11-23'},
      {label: 'Rainbet help center, “Gift Cards”', url: 'https://help.rainbet.com/en/articles/15255676-gift-cards', checked: '2026-11-23'},
      {label: 'Rainbet help center, “KYC”', url: 'https://help.rainbet.com/en/articles/15264824-kyc', checked: '2026-11-23'},
      {label: 'Rainbet help center, “Wager Requirement for Deposits”', url: 'https://help.rainbet.com/en/articles/16312455-wager-requirement-for-deposits', checked: '2026-11-23'},
      {label: 'Rainbet help center, “Rewards Overview”', url: 'https://help.rainbet.com/en/articles/9171035-rewards-overview', checked: '2026-11-23'},
      {label: 'Rainbet terms of service (operator), read by our Affiliation team', url: 'https://rainbet.com/terms', checked: '2026-11-21'},
      {label: 'Celsius Casino home page, payments and VIP sections (coins, processing time, fees, VIP rakeback)', url: 'https://celsiuscasino.com/', checked: '2026-11-23'},
      {label: 'Celsius Casino terms, articles 9.1 to 9.3 (operator)', url: 'https://celsiuscasino.com/terms', checked: '2026-11-23'},
      {label: 'Celsius Casino welcome bonus page', url: 'https://celsiuscasino.com/welcome-bonus', checked: '2026-11-22'},
    ],
  },
  {
    casino: 'celsius', lang: 'fr', slug: 'fiable', place: 'intent-fiable',
    title: 'Celsius Casino est-il fiable ? Licence, exploitant et règles de retrait',
    desc: 'Celsius Casino fiable ? Exploitant Celsius Holdings N.V. (n° 157856), licence citée dans les conditions, vérification d’identité, plafonds de retrait. Les faits tirés des pages officielles, avec leurs écarts.',
    h1: 'Celsius Casino est-il fiable ?',
    lede: 'Nous ne donnons pas de note : voici les faits vérifiables sur l’exploitant, la licence et les règles de retrait, tirés des pages officielles de Celsius, y compris un écart entre deux de ces pages.',
    facts: [
      ['Exploitant', 'Celsius Holdings N.V., société n° 157856, Willemstad (Curaçao)'],
      ['Licence citée dans les conditions', 'Curaçao, licence 365/JAZ (Gaming Services Provider N.V.)'],
      ['Licence citée sur l’accueil', 'Anjouan'],
      ['Ouverture', '2020, d’après le site de Celsius'],
      ['Vérification d’identité', 'pièce d’identité, justificatif de domicile, parfois selfie ou appel (clause 9.3)'],
      ['Plafond de retrait', '10 000 € par mois ; 5 000 € si le solde dépasse 10 fois les dépôts (clause 9.6)'],
      ['Âge minimum', '18 ans, ou plus si la loi locale l’exige'],
    ],
    sections: [
      {h: 'Qui exploite Celsius', p: [
        'Les conditions générales désignent Celsius Holdings N.V., immatriculée sous le n° 157856 à Willemstad, Curaçao, et citent la licence 365/JAZ délivrée via Gaming Services Provider N.V.',
        'La page d’accueil de Celsius, elle, présente le casino comme titulaire d’une licence d’Anjouan. Les deux pages officielles ne disent donc pas la même chose ; nous reprenons les conditions générales, qui sont le document contractuel, et signalons l’écart.',
      ]},
      {h: 'Ce que les règles de retrait disent', p: [
        'Avant un retrait, le dépôt doit avoir été misé au moins trois fois (clause 9.2), et Celsius peut demander une vérification d’identité complète (clause 9.3). Le retrait va vers le moyen de paiement du dépôt (clause 9.4).',
        'Les gros gains se retirent par tranches : 10 000 € par mois au plus, et 5 000 € quand le solde dépasse 10 fois la somme des dépôts (clause 9.6). Les conditions ne donnent aucun délai de traitement ; le détail est sur notre page retrait.',
      ]},
      {h: 'Comment juger par soi-même', p: [
        'Lire les conditions générales et celles des bonus avant de déposer, faire vérifier son identité avant de gagner gros, et commencer par un petit retrait pour voir le délai réel. Une réclamation doit être faite dans les 3 jours suivant le pari concerné (clause 22.4).',
      ]},
    ],
    sources: [
      {label: 'Conditions générales de Celsius Casino (exploitant, licence, articles 9 et 22)', url: 'https://celsiuscasino.com/fr/terms', checked: '2026-11-22'},
      {label: 'Page d’accueil de Celsius Casino (licence d’Anjouan, ouverture en 2020)', url: 'https://celsiuscasino.com/fr', checked: '2026-11-22'},
    ],
  },
  {
    casino: 'celsius', lang: 'en', slug: 'promo-code', place: 'intent-promo-code',
    title: 'Celsius Casino Promo Code 2026: No Code Needed – Up to €2,000 + 250 Free Spins',
    desc: 'Do you need a Celsius Casino promo code? Not with our link. The welcome offer is up to €2,000 + 250 free spins over 4 deposits, wagering x40 (x45 on the 3rd). The official tiers and rules.',
    h1: 'Celsius Casino promo code: do you need one?',
    lede: 'No. Our link carries our partner ID, so there is no code to type. Here is what the Celsius welcome offer gives, tier by tier, according to Celsius’s official pages.',
    facts: [
      ['Promo code', 'none to enter with our link'],
      ['Welcome offer', 'up to €2,000 + 250 free spins over the first 4 deposits'],
      ['1st deposit', '100% up to €500 + 150 free spins (50 a day for 3 days)'],
      ['2nd deposit', '100% up to €300 + 50 free spins'],
      ['3rd deposit', '200% up to €200 + 50 free spins'],
      ['4th deposit', '150% up to €1,000'],
      ['Wagering', 'x40 on the 1st and 2nd deposits, x45 on the 3rd'],
      ['Max bet with a bonus', '€5 per spin'],
    ],
    sections: [
      {h: 'How the offer works', p: [
        'Each of your first four deposits unlocks one tier. Free spins from the 2nd and 3rd deposits are credited at once; the 150 from the 1st arrive as 50 a day for three days. They can only be played on the eligible slots.',
        'Bonus funds can’t be withdrawn until the wagering is done. Asking for a withdrawal before that forfeits the bonus and any winnings from it (bonus terms, article 1.15), and a bonus expires 20 days after it is claimed if the wagering isn’t complete (article 1.22).',
      ]},
      {h: 'What about a no-deposit code?', p: [
        'The public offer has none: every tier needs a deposit. Celsius’s bonus terms do cover no-deposit free spins when they are handed out, and cap what you can withdraw from them at €100 (article 3.3).',
      ]},
    ],
    sources: [
      {label: 'Celsius Casino welcome bonus page', url: 'https://celsiuscasino.com/welcome-bonus', checked: '2026-11-22'},
      {label: 'Celsius Casino bonus terms, articles 1.15, 1.22 and 3.3', url: 'https://celsiuscasino.com/bonuses-terms', checked: '2026-11-22'},
    ],
  },
  {
    casino: 'betportal', lang: 'en', slug: 'bonus-code', place: 'intent-bonus-code',
    title: 'Betportal Bonus Code 2026: No Code Needed – Up to €1,000 + 250 Free Spins',
    desc: 'Do you need a Betportal bonus code? Not with our link. The welcome package is up to €1,000 + 250 free spins over 3 deposits. The tiers, from Betportal’s official pages.',
    h1: 'Betportal bonus code: do you need one?',
    lede: 'No. Our link asks for no code: it ties your sign-up to our partner account. Here is what the welcome package gives, tier by tier, according to Betportal’s official pages.',
    facts: [
      ['Bonus code', 'none to enter with our link'],
      ['Welcome package', 'up to €1,000 + 250 free spins over 3 deposits'],
      ['1st deposit', '150% up to €500 + 200 free spins'],
      ['2nd deposit', '100% up to €300 + 50 free spins'],
      ['3rd deposit', '50% up to €200'],
    ],
    sections: [
      {h: 'What the package is worth', p: [
        'Up to €1,000 in bonus money and 250 free spins in total, spread over your first three deposits: 150% up to €500 and 200 free spins on the first, 100% up to €300 and 50 free spins on the second, 50% up to €200 on the third.',
        'Wagering, maximum bet and validity are set out on Betportal’s official page for each tier, linked below. Read them before you deposit.',
      ]},
    ],
    sources: [
      {label: 'Betportal, 1st deposit offer (read by our Affiliation team)', url: 'https://betportal.com/en/promotions/38', checked: '2026-11-21'},
      {label: 'Betportal, 2nd deposit offer', url: 'https://betportal.com/en/promotions/37', checked: '2026-11-21'},
      {label: 'Betportal, 3rd deposit offer', url: 'https://betportal.com/en/promotions/36', checked: '2026-11-21'},
    ],
  },
  {
    casino: 'rainbet', lang: 'fr', slug: 'code-promo', place: 'intent-code-promo',
    title: 'Rainbet code promo et code parrainage : NIVORANET (+20 % de rakeback)',
    desc: 'Code promo Rainbet = code de parrainage : NIVORANET. Il donne +20 % de rakeback pendant 72 h et l’accès à notre course mensuelle de 200 $. Où le saisir, délai de 24 h, règles officielles.',
    h1: 'Code promo Rainbet (code parrainage) : NIVORANET',
    lede: 'Sur Rainbet, le « code promo » et le « code de parrainage » sont la même chose : le code d’affilié qu’on saisit à l’inscription. Le nôtre est NIVORANET. Voici ce qu’il donne, d’après le centre d’aide officiel de Rainbet.',
    facts: [
      ['Code', 'NIVORANET'],
      ['Ce qu’il donne', '+20 % de rakeback pendant 72 heures (« Affiliate Code Redemption »)'],
      ['En plus', 'notre course mensuelle de 200 $ (100 $, 60 $, 40 $), à partir de 1 000 $ misés dans le mois'],
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
        'Les joueurs inscrits avec NIVORANET sont classés chaque mois sur leurs mises : 200 $ pour le top 3 (100 $, 60 $ et 40 $). Pour être payé, il faut avoir misé au moins 1 000 $ dans le mois ; les mises sont pondérées par Rainbet selon le RTP des jeux. Cette course est la nôtre, pas une promotion de Rainbet.',
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
    lede: 'Rainbet est un casino en ligne en crypto, centré sur les machines à sous, qui reverse une part de chaque mise (le rakeback) plutôt que de miser sur un gros bonus de dépôt.',
    facts: [
      ['Exploitant', 'Rain Group Ltd, Anjouan (société n° 16077)'],
      ['Paiements', 'crypto (BTC, ETH, USDT, USDC, LTC, SOL…)'],
      ['Catalogue', 'plus de 7 000 machines à sous (notre relevé du 22/11/2026)'],
      ['Récompenses', 'rakeback toutes les 15 min, bonus quotidien, hebdomadaire et mensuel, 3 reloads par jour'],
      ['Notre code', 'NIVORANET : +20 % de rakeback pendant 72 h, et notre course mensuelle de 200 $ (1 000 $ misés minimum)'],
    ],
    sections: [
      {h: 'Comment Rainbet récompense ses joueurs', p: [
        'Le rakeback, calculé sur le total misé, se réclame toutes les 15 minutes. S’y ajoutent un bonus quotidien (cumulable jusqu’à 72 heures), un bonus hebdomadaire, un bonus mensuel, un bonus « pré-mensuel » le 16 de chaque mois et trois reloads par jour. Une récompense non réclamée avant la suivante expire.',
        'Des rangs VIP donnent un bonus à chaque montée de rang. Des « RakeBoosts » augmentent temporairement le rakeback ; ils ne se cumulent pas.',
      ]},
      {h: 'Les jeux', p: [
        'Notre relevé du catalogue du 22/11/2026 compte plus de 7 000 machines à sous, de Pragmatic Play, Hacksaw, Nolimit City, NetEnt, Red Tiger, BGaming et d’autres. Les jeux de notre catalogue vérifiés chez Rainbet sont listés sur notre page avis.',
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
      ['On top', 'our $200 monthly race ($100, $60, $40), from $1,000 wagered in the month'],
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
        'Players registered with NIVORANET are ranked every month on their wagers: $200 for the top 3 ($100, $60 and $40). To be paid, you need at least $1,000 wagered in the month; Rainbet weights wagers by the games’ RTP. This race is ours, not a Rainbet promotion.',
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
    steps: [
      'Faire vérifier son compte : pièce d’identité et justificatif de domicile, parfois selfie ou appel (clause 9.3).',
      'Avoir misé au moins 3 fois son dépôt (clause 9.2), et fini le wager d’un éventuel bonus (conditions des bonus, 1.15).',
      'Demander le retrait vers le moyen de paiement du dépôt (clause 9.4), à partir de 10 € (clause 9.1).',
      'Rester sous le plafond de 10 000 € par mois, ou 5 000 € si le solde dépasse 10 fois les dépôts (clause 9.6).',
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
    lede: 'Non. Notre lien ne demande aucun code : il rattache l’inscription à notre compte partenaire. Voici ce que l’offre donne, palier par palier, d’après les pages officielles de Betportal.',
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

export const intentPath = (x: Intent) => x.path ?? `casinos/${x.casino}/${x.slug}/`;
export const intentsOf = (casino: CasinoId, lang: Lang) => INTENTS.filter(x => x.casino === casino && x.lang === lang);
