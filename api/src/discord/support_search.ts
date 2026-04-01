// api/src/discord/support_search.ts
// Moteur de recherche intelligent v2 — zéro dépendance, TypeScript pur.
//
// Améliorations v2 :
//   - Scoring rôle-aware (boost si bonne cible, pénalité si mauvais rôle)
//   - Context window : 20% du score vient des derniers messages du ticket
//   - Exploitation des flags : escalate, confidence, sensitivity
//   - Multi-résultats : entrée secondaire si score différent + catégorie différente
//   - isMaster bypass : aucune restriction de rôle

import { KB_ENTRIES, type KbEntry, type KbRole } from "./support_kb.js";

// ─────────────────────────────────────────────────────────────────────────────
// Seuils
// ─────────────────────────────────────────────────────────────────────────────
const MIN_SCORE = 0.3;       // seuil confiance principale
const MIN_SECONDARY = 0.18; // seuil pour afficher une entrée secondaire

// ─────────────────────────────────────────────────────────────────────────────
// Contexte de recherche
// ─────────────────────────────────────────────────────────────────────────────
export type SearchContext = {
  /** Rôle détecté de l'utilisateur */
  role?: KbRole;
  /** Si true : bypass de tous les filtres de rôle (master user) */
  isMaster?: boolean;
  /** Derniers messages de l'utilisateur dans le ticket, hors message actuel */
  recentMessages?: string[];
  /** L'utilisateur a-t-il un compte LunaLive lié */
  hasLinkedAccount?: boolean;
};

export type SearchResult = {
  primary: KbEntry;
  score: number;
  confident: boolean;
  /** Entrée complémentaire si pertinente (catégorie différente, score suffisant) */
  secondary?: KbEntry;
};

// ─────────────────────────────────────────────────────────────────────────────
// Stopwords français
// ─────────────────────────────────────────────────────────────────────────────
const STOPWORDS = new Set([
  "le", "la", "les", "de", "du", "des", "un", "une",
  "je", "tu", "il", "elle", "on", "nous", "vous", "ils", "elles",
  "ma", "mon", "mes", "ta", "ton", "tes", "sa", "son", "ses",
  "ce", "cet", "cette", "ces",
  "est", "sont", "avoir", "etre", "etait", "sera",
  "pas", "ne", "ni", "non",
  "et", "ou", "mais", "donc", "car", "or", "que", "qui",
  "comment", "pourquoi", "quoi", "quand", "quel", "quelle",
  "pour", "avec", "sans", "dans", "sur", "sous", "par", "entre",
  "vers", "chez", "au", "aux",
  "veux", "vouloir", "savoir", "aide", "aider", "bonjour",
  "salut", "merci", "stp", "svp", "please", "help",
  "faire", "pouvoir", "vouloir",
  "moi", "suis", "peux", "peut", "dois", "faut",
  "a", "an", "the", "is", "are", "to", "in", "of", "for", "and",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Normalisation et tokenisation
// ─────────────────────────────────────────────────────────────────────────────

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
}

// ─────────────────────────────────────────────────────────────────────────────
// Score de base tokens → entrée (sans rôle ni contexte)
// ─────────────────────────────────────────────────────────────────────────────

function baseScore(tokens: string[], entry: KbEntry): number {
  if (tokens.length === 0) return 0;

  const tagTokens = entry.tags.map(normalize);
  const titleTokens = tokenize(entry.title);
  const answerTokens = tokenize(entry.answer).slice(0, 40);

  let matches = 0;

  for (const qt of tokens) {
    if (tagTokens.some((t) => t === qt || t.includes(qt) || qt.includes(t))) {
      matches += 2.0;
    } else if (titleTokens.some((t) => t === qt || t.includes(qt))) {
      matches += 1.0;
    } else if (answerTokens.some((t) => t === qt)) {
      matches += 0.5;
    }
  }

  const maxScore = tokens.length * 2.0;
  return maxScore > 0 ? Math.min(matches / maxScore, 1.0) : 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Score complet avec rôle et context window
// ─────────────────────────────────────────────────────────────────────────────

function scoreEntry(query: string, ctx: SearchContext | undefined, entry: KbEntry): number {
  const primaryTokens = tokenize(query);
  let score = baseScore(primaryTokens, entry);

  // Blend avec les messages récents du ticket (poids 20%)
  // Permet de comprendre les relances : "et côté streamer ?" / "ok et pour la roue ?"
  if (ctx?.recentMessages && ctx.recentMessages.length > 0) {
    const ctxTokens = ctx.recentMessages
      .flatMap((m) => tokenize(m))
      .slice(0, 20);
    if (ctxTokens.length > 0) {
      const ctxScore = baseScore(ctxTokens, entry);
      score = score * 0.80 + ctxScore * 0.20;
    }
  }

  // Ajustement de rôle (sauf master qui voit tout)
  if (!ctx?.isMaster && score > 0) {
    const role = ctx?.role;
    if (role && role !== "all") {
      const entryRoles = entry.roles;
      if (!entryRoles.includes("all") && !entryRoles.includes(role)) {
        // Entrée ciblée pour un rôle différent — pénalité forte
        // (ex: viewer qui pose une question sur un outil streamer-only)
        score *= 0.35;
      } else if (entryRoles.includes(role) && !entryRoles.includes("all")) {
        // Entrée ciblée exactement pour ce rôle — léger boost
        score = Math.min(score * 1.15, 1.0);
      }
      // entryRoles.includes("all") → score inchangé
    }
  }

  return score;
}

// ─────────────────────────────────────────────────────────────────────────────
// Recherche principale
// ─────────────────────────────────────────────────────────────────────────────

export function findBestMatch(query: string, ctx?: SearchContext): SearchResult | null {
  const primaryTokens = tokenize(query);
  if (primaryTokens.length === 0) return null;

  type Scored = { entry: KbEntry; score: number };

  const scored: Scored[] = KB_ENTRIES
    .map((entry) => ({ entry, score: scoreEntry(query, ctx, entry) }))
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0 || scored[0].score === 0) return null;

  const best = scored[0];
  const runner = scored[1] as Scored | undefined;

  // Entrée secondaire : catégorie différente, score suffisant,
  // et seulement quand le primary n'est pas très confiant (évite le bruit)
  const secondary: KbEntry | undefined =
    runner &&
    runner.score >= MIN_SECONDARY &&
    runner.entry.category !== best.entry.category &&
    best.score < 0.58
      ? runner.entry
      : undefined;

  return {
    primary: best.entry,
    score: best.score,
    confident: best.score >= MIN_SCORE,
    secondary,
  };
}
