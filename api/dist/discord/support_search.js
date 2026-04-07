// api/src/discord/support_search.ts
// Moteur de recherche intelligent v3 — index unifié KbBlock + KbEntry, intent detection.
//
// Améliorations v3 (par rapport v2) :
//   - Index unifié : KbBlocks prioritaires, KbEntries en fallback (même id → block gagne)
//   - detectIntent() : heuristique basée sur mots-clés français
//   - scoreBlock() : exploite summary/steps/troubleshooting/common_failures
//   - Boost d'intent : +10% si l'intent détecté correspond aux intents déclarés du bloc
//   - SearchResult inclut intent + isBlock pour le builder de réponse
import { KB_ENTRIES, KB_BLOCKS, } from "./support_kb.js";
// ─────────────────────────────────────────────────────────────────────────────
// Seuils
// ─────────────────────────────────────────────────────────────────────────────
const MIN_SCORE = 0.3; // seuil confiance principale
const MIN_SECONDARY = 0.18; // seuil pour afficher une entrée secondaire
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
function normalize(text) {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
function tokenize(text) {
    return normalize(text)
        .split(" ")
        .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
}
// ─────────────────────────────────────────────────────────────────────────────
// Détection d'intention
// ─────────────────────────────────────────────────────────────────────────────
// Ordre de priorité : du plus spécifique au plus générique.
// "procedure" est volontairement en fin — "comment faire" est courant mais
// d'autres intents plus spécifiques doivent prendre le dessus.
const INTENT_SIGNALS = [
    ["problem", ["marche pas", "ne marche", "bug", "erreur", "probleme", "impossible",
            "echec", "bloque", "bloqué", "bloque", "disparu", "perdu", "manquant",
            "ne fonctionne", "fonctionne pas", "pas de", "pas recu",
            "j'ai pas", "jai pas", "rien recu", "je vois pas"]],
    ["configure", ["activer", "configurer", "lier", "connecter", "installer", "brancher",
            "parametrer", "setup", "lié", "synchroniser", "synchronis"]],
    ["obtain", ["obtenir", "gagner", "avoir", "recevoir", "acheter", "comment avoir",
            "comment gagner", "ou acheter", "ou avoir"]],
    ["manage", ["gerer", "voir", "supprimer", "annuler", "changer", "modifier",
            "lister", "consulter", "désactiver", "desactiver", "retirer"]],
    ["location", ["ou est", "ou trouver", "ou se trouve", "trouver", "acceder",
            "aller", "comment acceder", "quel lien", "quelle page"]],
    ["procedure", ["comment", "etapes", "proceder", "utiliser", "faire", "demarrer"]],
    ["definition", ["cest quoi", "c est quoi", "qu est ce", "quest ce", "definition",
            "explication", "signifie", "kesako", "qu'est-ce", "c'est quoi",
            "c quoi"]],
];
export function detectIntent(query) {
    const n = normalize(query);
    for (const [intent, signals] of INTENT_SIGNALS) {
        if (signals.some((s) => n.includes(s)))
            return intent;
    }
    return "definition";
}
// ─────────────────────────────────────────────────────────────────────────────
// Texte de recherche pour un KbBlock
// ─────────────────────────────────────────────────────────────────────────────
function blockSearchText(block) {
    const parts = [block.summary];
    if (block.what_it_is)
        parts.push(block.what_it_is);
    if (block.how_to_do_it) {
        for (const s of block.how_to_do_it) {
            parts.push(s.text);
            if (s.note)
                parts.push(s.note);
        }
    }
    if (block.troubleshooting)
        parts.push(...block.troubleshooting);
    if (block.common_failures) {
        for (const f of block.common_failures) {
            parts.push(f.symptom, f.cause);
        }
    }
    return parts.join(" ");
}
// ─────────────────────────────────────────────────────────────────────────────
// Score de base tokens → KbEntry (sans rôle ni contexte)
// ─────────────────────────────────────────────────────────────────────────────
function baseScoreEntry(tokens, entry) {
    if (tokens.length === 0)
        return 0;
    const tagTokens = entry.tags.map(normalize);
    const titleTokens = tokenize(entry.title);
    const answerTokens = tokenize(entry.answer).slice(0, 40);
    let matches = 0;
    for (const qt of tokens) {
        if (tagTokens.some((t) => t === qt || t.includes(qt) || qt.includes(t))) {
            matches += 2.0;
        }
        else if (titleTokens.some((t) => t === qt || t.includes(qt))) {
            matches += 1.0;
        }
        else if (answerTokens.some((t) => t === qt)) {
            matches += 0.5;
        }
    }
    const maxScore = tokens.length * 2.0;
    return maxScore > 0 ? Math.min(matches / maxScore, 1.0) : 0;
}
// ─────────────────────────────────────────────────────────────────────────────
// Score de base tokens → KbBlock (sans rôle ni contexte)
// ─────────────────────────────────────────────────────────────────────────────
function baseScoreBlock(tokens, block, bodyTokens) {
    if (tokens.length === 0)
        return 0;
    const tagTokens = block.tags.map(normalize);
    const titleTokens = tokenize(block.title);
    let matches = 0;
    for (const qt of tokens) {
        if (tagTokens.some((t) => t === qt || t.includes(qt) || qt.includes(t))) {
            matches += 2.0;
        }
        else if (titleTokens.some((t) => t === qt || t.includes(qt))) {
            matches += 1.0;
        }
        else if (bodyTokens.some((t) => t === qt)) {
            matches += 0.5;
        }
    }
    const maxScore = tokens.length * 2.0;
    return maxScore > 0 ? Math.min(matches / maxScore, 1.0) : 0;
}
// ─────────────────────────────────────────────────────────────────────────────
// Score complet — KbEntry
// ─────────────────────────────────────────────────────────────────────────────
function scoreEntry(query, ctx, entry) {
    const primaryTokens = tokenize(query);
    let score = baseScoreEntry(primaryTokens, entry);
    if (ctx?.recentMessages && ctx.recentMessages.length > 0) {
        const ctxTokens = ctx.recentMessages.flatMap((m) => tokenize(m)).slice(0, 20);
        if (ctxTokens.length > 0) {
            score = score * 0.80 + baseScoreEntry(ctxTokens, entry) * 0.20;
        }
    }
    if (!ctx?.isMaster && score > 0) {
        const role = ctx?.role;
        if (role && role !== "all") {
            if (!entry.roles.includes("all") && !entry.roles.includes(role)) {
                score *= 0.35;
            }
            else if (entry.roles.includes(role) && !entry.roles.includes("all")) {
                score = Math.min(score * 1.15, 1.0);
            }
        }
    }
    return score;
}
// ─────────────────────────────────────────────────────────────────────────────
// Score complet — KbBlock
// ─────────────────────────────────────────────────────────────────────────────
function scoreBlock(query, intent, ctx, block, bodyTokens) {
    const primaryTokens = tokenize(query);
    let score = baseScoreBlock(primaryTokens, block, bodyTokens);
    // Context blend avant le boost — pour que le boost s'applique sur le score final
    if (ctx?.recentMessages && ctx.recentMessages.length > 0) {
        const ctxTokens = ctx.recentMessages.flatMap((m) => tokenize(m)).slice(0, 20);
        if (ctxTokens.length > 0) {
            score = score * 0.80 + baseScoreBlock(ctxTokens, block, bodyTokens) * 0.20;
        }
    }
    // Boost intent appliqué sur le score blendé
    if (block.intents.includes(intent)) {
        score = Math.min(score * 1.1, 1.0);
    }
    if (!ctx?.isMaster && score > 0) {
        const role = ctx?.role;
        if (role && role !== "all") {
            if (!block.audience.includes("all") && !block.audience.includes(role)) {
                score *= 0.35;
            }
            else if (block.audience.includes(role) && !block.audience.includes("all")) {
                score = Math.min(score * 1.15, 1.0);
            }
        }
    }
    return score;
}
function buildIndex() {
    const blockIds = new Set(KB_BLOCKS.map((b) => b.id));
    const blockItems = KB_BLOCKS.map((block) => ({
        kind: "block",
        item: block,
        bodyTokens: tokenize(blockSearchText(block)).slice(0, 80),
    }));
    // Entrées legacy uniquement si aucun bloc ne couvre le même id
    const entryItems = KB_ENTRIES
        .filter((e) => !blockIds.has(e.id))
        .map((entry) => ({ kind: "entry", item: entry }));
    return [...blockItems, ...entryItems];
}
const INDEX = buildIndex();
// ─────────────────────────────────────────────────────────────────────────────
// Recherche principale
// ─────────────────────────────────────────────────────────────────────────────
export function findBestMatch(query, ctx) {
    const primaryTokens = tokenize(query);
    if (primaryTokens.length === 0)
        return null;
    const intent = detectIntent(query);
    const scored = INDEX.map((idx) => {
        if (idx.kind === "block") {
            return {
                idx,
                score: scoreBlock(query, intent, ctx, idx.item, idx.bodyTokens),
                isBlock: true,
                subject: idx.item.subject,
            };
        }
        else {
            return {
                idx,
                score: scoreEntry(query, ctx, idx.item),
                isBlock: false,
                subject: idx.item.category,
            };
        }
    }).sort((a, b) => b.score - a.score);
    if (scored.length === 0 || scored[0].score === 0)
        return null;
    const best = scored[0];
    const runner = scored[1];
    // Entrée secondaire : sujet/catégorie différent, score suffisant,
    // uniquement quand le primary n'est pas très confiant
    let secondary;
    let secondaryIsBlock;
    if (runner &&
        runner.score >= MIN_SECONDARY &&
        runner.subject !== best.subject &&
        best.score < 0.58) {
        secondary = runner.idx.item;
        secondaryIsBlock = runner.isBlock;
    }
    const primaryItem = best.idx.item;
    return {
        primary: primaryItem,
        score: best.score,
        confident: best.score >= MIN_SCORE,
        intent,
        isBlock: best.isBlock,
        secondary,
        secondaryIsBlock,
    };
}
