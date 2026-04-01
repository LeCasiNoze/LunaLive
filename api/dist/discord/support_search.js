// api/src/discord/support_search.ts
// Moteur de recherche léger — zéro dépendance, TypeScript pur.
// Algo : tokenisation + score basé sur les tags/titres.
import { KB_ENTRIES } from "./support_kb.js";
// Score minimum pour considérer qu'une réponse est utile.
// En dessous → escalade humain.
const MIN_SCORE = 0.3;
// Stopwords français courants à ignorer lors de la tokenisation.
const STOPWORDS = new Set([
    "le", "la", "les", "de", "du", "des", "un", "une",
    "je", "tu", "il", "elle", "on", "nous", "vous", "ils", "elles",
    "ma", "mon", "mes", "ta", "ton", "tes", "sa", "son", "ses",
    "ce", "cet", "cette", "ces",
    "est", "sont", "avoir", "etre", "etait", "sera",
    "pas", "ne", "ni", "non",
    "et", "ou", "mais", "donc", "car", "or", "ni", "que", "qui",
    "comment", "pourquoi", "quoi", "quand", "ou", "quel", "quelle",
    "pour", "avec", "sans", "dans", "sur", "sous", "par", "entre",
    "vers", "chez", "au", "aux",
    "je", "veux", "vouloir", "savoir", "aide", "aider", "bonjour",
    "salut", "merci", "stp", "svp", "please", "help",
    "avoir", "faire", "pouvoir", "vouloir",
    "moi", "suis", "peux", "peut", "dois", "faut",
    "a", "an", "the", "is", "are", "to", "in", "of", "for", "and",
]);
/**
 * Normalise un texte pour la comparaison :
 * minuscules, suppression des accents, suppression de la ponctuation.
 */
function normalize(text) {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // supprime les diacritiques
        .replace(/[^a-z0-9\s-]/g, " ") // garde lettres, chiffres, espaces, tirets
        .replace(/\s+/g, " ")
        .trim();
}
/**
 * Tokenise un texte normalisé en mots utiles (sans stopwords, longueur >= 2).
 */
function tokenize(text) {
    return normalize(text)
        .split(" ")
        .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
}
/**
 * Calcule un score de pertinence entre les tokens de la query et une entrée KB.
 * Score entre 0 et 1. Plus c'est élevé, plus c'est pertinent.
 */
function scoreEntry(queryTokens, entry) {
    if (queryTokens.length === 0)
        return 0;
    const tagTokens = entry.tags.map(normalize);
    const titleTokens = tokenize(entry.title);
    const answerTokens = tokenize(entry.answer).slice(0, 40); // on ne lit que le début
    let matches = 0;
    for (const qt of queryTokens) {
        // Match exact dans les tags → fort boost
        if (tagTokens.some((t) => t === qt || t.includes(qt) || qt.includes(t))) {
            matches += 2.0;
            continue;
        }
        // Match dans le titre → boost moyen
        if (titleTokens.some((t) => t === qt || t.includes(qt))) {
            matches += 1.0;
            continue;
        }
        // Match dans le début de la réponse → faible
        if (answerTokens.some((t) => t === qt)) {
            matches += 0.5;
        }
    }
    // Normaliser par le nombre de tokens de la query (pondéré par le max possible)
    const maxScore = queryTokens.length * 2.0;
    return maxScore > 0 ? Math.min(matches / maxScore, 1.0) : 0;
}
/**
 * Recherche dans la base de connaissance et retourne le meilleur résultat.
 * Si le score est trop bas, `confident` sera false → escalade humain.
 */
export function findBestMatch(query) {
    const tokens = tokenize(query);
    if (tokens.length === 0)
        return null;
    let best = null;
    for (const entry of KB_ENTRIES) {
        const s = scoreEntry(tokens, entry);
        if (!best || s > best.score) {
            best = { entry, score: s };
        }
    }
    if (!best || best.score === 0)
        return null;
    return {
        entry: best.entry,
        score: best.score,
        confident: best.score >= MIN_SCORE,
    };
}
