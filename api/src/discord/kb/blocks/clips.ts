// api/src/discord/kb/blocks/clips.ts
// Blocs enrichis — LunaClip et clips automatiques
// Confiance : confirmed (api/src/routes/clips_public.ts, clips.ts)

import type { KbBlock } from "../types.js";

export const CLIPS_BLOCKS: KbBlock[] = [
  // ── Créer un clip ──────────────────────────────────────────────────────────
  {
    id: "clips_creer",
    subject: "clips",
    audience: ["viewer", "streamer"],
    intents: ["procedure", "definition"],
    tags: ["clip", "lunaclip", "creer", "faire", "capturer", "enregistrer", "comment", "bouton"],
    title: "Créer un clip (LunaClip)",
    summary: "Clique sur le bouton Clip pendant un live pour capturer les dernières secondes.",
    what_it_is:
      "LunaClip permet de capturer et partager des moments forts d'un stream (jackpots, moments drôles, moments épiques). Le clip capture les dernières secondes du stream en cours.",
    how_to_do_it: [
      { text: "Sois sur la page d'un streamer en live sur LunaLive.fr" },
      { text: "Clique sur le bouton **Clip** (visible sur la page du stream)" },
      { text: "Le clip est créé et ajouté à la page du streamer et à ton profil" },
    ],
    entry_points: ["LunaLive.fr/s/[slug] → bouton Clip (pendant un live)"],
    prerequisites: ["Le streamer doit être en live"],
    limits: ["Les clips ne peuvent être créés que pendant un live actif"],
    sensitivity: "low",
    confidence: "confirmed",
    related_topics: ["clips_partager", "clips_supprimer"],
    code_refs: ["api/src/routes/clips.ts"],
  },

  // ── Voir et partager les clips ─────────────────────────────────────────────
  {
    id: "clips_partager",
    subject: "clips",
    audience: ["viewer", "streamer"],
    intents: ["location", "manage"],
    tags: ["clip", "partager", "voir", "lien", "url", "liste", "page", "tops", "recents"],
    title: "Voir et partager les clips",
    summary: "Les clips sont accessibles sur la page du streamer, en top clips et dans ton profil.",
    how_to_do_it: [
      { text: "Page du streamer : LunaLive.fr/s/[slug] → onglet **Clips**" },
      { text: "Top clips récents : LunaLive.fr/clips (top du jour, semaine, mois, année)" },
      { text: "Pour partager : ouvre le clip et copie l'URL — elle est publique et partageable" },
    ],
    entry_points: [
      "LunaLive.fr/s/[slug] → onglet Clips",
      "LunaLive.fr/clips (top clips)",
    ],
    sensitivity: "low",
    confidence: "confirmed",
    code_refs: ["api/src/routes/clips_public.ts"],
  },

  // ── Supprimer un clip ──────────────────────────────────────────────────────
  {
    id: "clips_supprimer",
    subject: "clips",
    audience: ["viewer", "streamer"],
    intents: ["manage"],
    tags: ["clip", "supprimer", "effacer", "retirer", "moderer", "mien"],
    title: "Supprimer un clip",
    summary: "Supprimez vos clips depuis la page du clip ou le dashboard streamer.",
    how_to_do_it: [
      {
        text: "Pour ton propre clip : ouvre le clip → utilise l'option Supprimer",
        role: "viewer",
      },
      {
        text: "Pour supprimer un clip de ton stream : Dashboard → LunaBot → section Clips, ou directement depuis la page du clip",
        role: "streamer",
      },
    ],
    ui_paths: [
      "Page du clip → Supprimer (pour le créateur)",
      "Dashboard → LunaBot → Clips (pour le streamer)",
    ],
    sensitivity: "low",
    confidence: "confirmed",
    code_refs: ["api/src/routes/clips_public.ts"],
  },

  // ── Clips automatiques ─────────────────────────────────────────────────────
  {
    id: "clips_auto",
    subject: "clips",
    audience: ["streamer"],
    intents: ["configure", "definition"],
    tags: ["clip", "automatique", "auto", "configurer", "streamer", "dashboard", "lunabot"],
    title: "Clips automatiques (streamer)",
    summary: "Les clips automatiques peuvent être configurés dans Dashboard → LunaBot → Clips.",
    what_it_is:
      "LunaLive propose une fonctionnalité de clips automatiques qui peut capturer automatiquement certains moments de ton stream selon des critères définis.",
    how_to_do_it: [
      { text: "Va sur Dashboard → LunaBot → section Clips" },
      { text: "Configure les options de clips automatiques disponibles" },
    ],
    ui_paths: ["Dashboard → LunaBot → Clips"],
    prerequisites: ["Avoir une page streamer active"],
    sensitivity: "low",
    confidence: "partial",
    staff_notes: "Les détails exacts des clips auto ne sont pas entièrement documentés dans le code accessible. Marquer comme partial.",
    code_refs: ["api/src/routes/clips.ts"],
  },
];
