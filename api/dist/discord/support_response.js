// api/src/discord/support_response.ts
// Response builder — construit une réponse Discord ciblée à partir d'un KbBlock.
// Sélectionne les sections pertinentes selon l'intention détectée et le rôle.
// Aucune dépendance externe.
// ─────────────────────────────────────────────────────────────────────────────
// Helpers internes
// ─────────────────────────────────────────────────────────────────────────────
function cap(text, max = 1024) {
    return text.length > max ? text.slice(0, max - 1) + "…" : text;
}
/** Filtre les étapes selon le rôle détecté */
function filterSteps(steps, role) {
    return steps.filter((s) => !s.role || !role || s.role === role || role === "staff");
}
/** Formate les étapes en texte numéroté */
function formatSteps(steps) {
    return steps
        .map((s, i) => {
        let line = `${i + 1}. ${s.text}`;
        if (s.note)
            line += `\n   ↳ *${s.note}*`;
        return line;
    })
        .join("\n");
}
// ─────────────────────────────────────────────────────────────────────────────
// Builder principal
// ─────────────────────────────────────────────────────────────────────────────
export function buildBlockResponse(block, intent, role) {
    const parts = [];
    const fields = [];
    const steps = filterSteps(block.how_to_do_it ?? [], role);
    // ── Sélection des sections selon l'intention ─────────────────────────────
    if (intent === "problem") {
        // Priorité : dépannage → cas d'échec
        if (block.troubleshooting?.length) {
            parts.push(block.troubleshooting.join("\n"));
        }
        if (block.common_failures?.length) {
            const failures = block.common_failures
                .map((f) => `• **${f.symptom}**\n  → ${f.cause}${f.solution ? `\n  ✓ ${f.solution}` : ""}`)
                .join("\n\n");
            fields.push({ name: "⚠️ Problèmes fréquents", value: cap(failures) });
        }
    }
    else if (intent === "location") {
        // Priorité : où trouver → chemins
        if (block.entry_points?.length) {
            parts.push("📍 **Accès :** " + block.entry_points.join(" | "));
        }
        if (block.ui_paths?.length) {
            fields.push({
                name: "🗺️ Navigation",
                value: cap(block.ui_paths.map((p) => `• ${p}`).join("\n")),
            });
        }
        // Compléter avec un résumé si on n'a rien
        if (!parts.length && !fields.length) {
            parts.push(block.summary);
        }
    }
    else if (["procedure", "configure", "obtain", "manage"].includes(intent)) {
        // Priorité : étapes → entrées → commandes
        if (steps.length > 0) {
            parts.push(formatSteps(steps));
        }
        else if (block.what_it_is) {
            parts.push(block.what_it_is);
        }
        else {
            parts.push(block.summary);
        }
        if (block.entry_points?.length) {
            fields.push({
                name: "📍 Où",
                value: cap(block.entry_points.map((p) => `• ${p}`).join("\n")),
            });
        }
        if (block.commands?.length) {
            fields.push({
                name: "💬 Commandes",
                value: cap(block.commands.map((c) => `\`${c}\``).join("  ")),
            });
        }
        if (block.prerequisites?.length && ["procedure", "configure", "obtain"].includes(intent)) {
            fields.push({
                name: "📋 Prérequis",
                value: cap(block.prerequisites.map((p) => `• ${p}`).join("\n")),
            });
        }
        if (block.limits?.length) {
            fields.push({
                name: "⚠️ Limites",
                value: cap(block.limits.map((l) => `• ${l}`).join("\n")),
            });
        }
    }
    else {
        // definition (ou fallback)
        parts.push(block.what_it_is ?? block.summary);
        if (steps.length > 0) {
            fields.push({
                name: "📋 Pour le faire",
                value: "Demande-moi **comment faire** pour les étapes exactes.",
            });
        }
    }
    // ── Variantes ─────────────────────────────────────────────────────────────
    if (block.variants?.length && ["definition", "procedure"].includes(intent)) {
        const varText = block.variants
            .map((v) => `**${v.label}** — ${v.description}`)
            .join("\n");
        fields.push({ name: "ℹ️ Cas particuliers", value: cap(varText) });
    }
    // ── Liens utiles ──────────────────────────────────────────────────────────
    if (block.links?.length) {
        fields.push({
            name: "🔗 Liens utiles",
            value: cap(block.links.map((l) => `[${l.label}](${l.url})`).join(" · ")),
        });
    }
    // ── Fallback si rien ──────────────────────────────────────────────────────
    if (!parts.length && !fields.length) {
        parts.push(block.summary);
    }
    // ── Footer contextuel ─────────────────────────────────────────────────────
    let footerHint;
    if (block.escalate) {
        footerHint = "⚠️ Ce sujet peut nécessiter l'intervention du staff";
    }
    else if (block.confidence === "partial") {
        footerHint = "ℹ️ Information basée sur notre compréhension — le staff peut confirmer si besoin";
    }
    return {
        title: block.title,
        description: cap(parts.join("\n\n"), 4096),
        fields,
        shouldEscalate: block.escalate === true,
        footerHint,
    };
}
