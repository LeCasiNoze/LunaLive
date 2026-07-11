// Page de TRAITEMENT des cosmétiques (workflow Lucas) : UN skin à la fois —
// rendu réel + rareté + obtention, boutons ✅ Valider / 🔧 À refaire (avec
// encadré motif/idée), puis passage au suivant. Cadrans d'abord, puis effets
// pseudo. Décisions persistées en localStorage + récap copiable à me coller.
// Route utilitaire /skins-review — non listée dans la navigation ni le sitemap.
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ChatMessageBubble } from "../components/chat/ChatMessageBubble";
import { TitlePill } from "../components/chat/TitlePill";
import type { ChatTitleEntry } from "../lib/cosmetics";
import { DEFAULT_APPEARANCE } from "../lib/appearance";
import AnimatedUsername from "../fx/username/AnimatedUsername";
import type { FxRarity } from "../fx/username/types";

type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic";

type ReviewItem = {
  code: string; // code catalogue (mframe_* / frame_* / uanim_* / ufx_* / title_* / badge_* / dec_*)
  name: string;
  rarity: Rarity;
  how: string; // obtention (prix shop, succès, event) — ou texte de la décision pour kind "decision"
  kind: "frame" | "username" | "fx" | "badge" | "title" | "titlefam" | "decision";
  /** kind "titlefam" : codes des titres exemples à rendre */
  fam?: string[];
};

type Decision = { status: "valide" | "a-refaire"; note?: string };

const STORAGE_KEY = "lunalive_skins_review_v1";

const RARITY_META: Record<Rarity, { label: string; color: string }> = {
  common: { label: "Commun", color: "#9ca3af" },
  uncommon: { label: "Peu commun", color: "#4ade80" },
  rare: { label: "Rare", color: "#60a5fa" },
  epic: { label: "Épique", color: "#c084fc" },
  legendary: { label: "Légendaire", color: "#fbbf24" },
  mythic: { label: "Mythique", color: "#fb7185" },
};

const f = (code: string, name: string, rarity: Rarity, how: string): ReviewItem =>
  ({ code, name, rarity, how, kind: "frame" });
const u = (code: string, name: string, rarity: Rarity, how: string): ReviewItem =>
  ({ code, name, rarity, how, kind: "username" });
const x = (code: string, name: string, rarity: Rarity, how: string): ReviewItem =>
  ({ code, name, rarity, how, kind: "fx" });
const b = (code: string, name: string, rarity: Rarity, how: string): ReviewItem =>
  ({ code, name, rarity, how, kind: "badge" });
const t = (code: string, name: string, rarity: Rarity, how: string): ReviewItem =>
  ({ code, name, rarity, how, kind: "title" });
const tf = (code: string, name: string, fam: string[], how: string): ReviewItem =>
  ({ code, name, rarity: "epic", how, kind: "titlefam", fam });
const d = (code: string, name: string, rarity: Rarity, how: string): ReviewItem =>
  ({ code, name, rarity, how, kind: "decision" });

// Libellés des titres (pour le rendu TitlePill dans la review)
const TITLE_LABELS: Record<string, string> = {
  title_sous_la_lune: "Sous la lune", title_pretre_de_la_roue: "Prêtre de la roue",
  title_archiviste: "Archiviste", title_pilier: "Pilier", title_parfait: "Parfait",
  title_polyvalent: "Polyvalent", title_collection_par_categorie: "Collection par catégorie",
  title_ultime: "Ultime", title_predateur: "Prédateur", title_trader: "Trader",
  title_max_frappe: "Max frappe", title_oracle: "Oracle", title_nessie: "Nessie",
  title_croupier_slayer: "Croupier slayer", title_baron: "Baron", title_rothschild: "Rothschild",
  title_acharne: "Acharné", title_inarretable: "Inarrêtable", title_one_piece: "One Piece",
  title_legende_du_chat: "Légende du chat", title_brother_eye: "Brother Eye",
  title_ephemeride: "Éphéméride", title_tryharder: "Tryharder", title_legende: "Légende",
  title_sans_vie: "Sans vie", title_bigmoula: "BigMoula", title_lunaking: "LunaKing",
  title_allin_man: "All-in Man", title_batman: "Batman",
  title_roulette: "Roulette", title_banquier: "Banquier", title_shark: "Shark",
  title_coffre_fort: "Coffre-fort", title_marathon: "Marathon", title_fidele: "Fidèle",
  title_toujours_la: "Toujours là", title_no_life: "No Life",
  title_grande_discussion: "Grande discussion", title_explorateur: "Explorateur",
  title_maitre_du_bot: "Maître du bot",
};

// Texte affiché dans le badge (même source que meta.text du catalogue API)
const BADGE_TEXT: Record<string, string> = {
  badge_luna: "LUNA", badge_777: "777", badge_discord: "🤖", badge_og: "OG",
  badge_rich: "$$", badge_chef: "CHEF", badge_skull: "💀", badge_heart: "❤️",
  badge_star: "⭐", badge_lightning: "⚡",
};

// Ordre de traitement : CADRANS (event puis mythique → commun), puis PSEUDOS.
const ITEMS: ReviewItem[] = [
  f("frame_wheel_roulette", "Cadran Roulette", "epic", "Event Roue · top 1-3 · permanent"),
  f("frame_chest_vault", "Cadran Coffre-Fort", "epic", "Event Coffre · top 1-3 · permanent"),
  f("frame_boss_flames", "Cadran Champ de Bataille", "legendary", "Event Boss · top 1-3 dégâts · permanent"),
  f("frame_viewer_hearts", "Cadran Roi des Viewers", "legendary", "Semaine du viewer · #1 · permanent"),

  f("mframe_gold", "Cadran Gold", "legendary", "Shop · 3000 rubis"),
  f("mframe_lotus_crown", "Cadran Lotus Crown", "mythic", "Succès"),
  f("mframe_eclipse", "Cadran Eclipse", "mythic", "Succès"),
  f("mframe_neon_rainbow", "Cadran Néon Rainbow", "mythic", "Shop · 3000 rubis"),

  f("mframe_glitch", "Cadran Glitch", "legendary", "Succès"),
  f("mframe_diamond", "Cadran Diamant", "epic", "Shop · 3000 rubis"),
  f("mframe_phoenix", "Cadran Phénix", "legendary", "Succès"),
  f("mframe_void", "Cadran Void", "mythic", "Shop · 3000 rubis"),

  f("mframe_galaxy", "Cadran Galaxy", "epic", "Shop · 3000 rubis"),
  f("mframe_blood", "Cadran Blood", "legendary", "Succès"),
  f("mframe_royal", "Cadran Royal", "epic", "Shop · 3000 rubis"),
  f("mframe_ice", "Cadran Glace", "epic", "Shop · 3000 rubis"),
  f("mframe_fest_eclair", "Cadran Éclair", "legendary", "Succès"),
  f("mframe_aurora", "Cadran Aurora", "rare", "Shop · 3000 rubis"),

  f("mframe_neon_pink", "Cadran Néon Rose", "rare", "Shop · 3000 rubis"),
  f("mframe_neon_cyan", "Cadran Néon Cyan", "rare", "Shop · 3000 rubis"),
  f("mframe_emerald", "Cadran Émeraude", "rare", "Shop · 3000 rubis"),
  f("mframe_sakura", "Cadran Sakura", "rare", "Shop · 3000 rubis"),
  f("mframe_carbon", "Cadran Carbone", "rare", "Shop · 3000 rubis"),

  f("mframe_paper", "Cadran Papier", "common", "Shop · 3000 rubis"),

  // (les anciens uanim_* non validés ont été REMPLACÉS par leurs versions
  // moteur ufx-* ci-dessous — seuls les 6 CSS validés restent)
  u("uanim_gradient_sunset", "Sunset gradient", "epic", "Shop · 2000 rubis"),
  u("uanim_ocean", "Océan", "rare", "Shop · 2000 rubis"),
  u("uanim_mint", "Menthe givrée", "rare", "Shop · 2000 rubis"),
  u("uanim_amber", "Ambre", "rare", "Shop · 2000 rubis"),
  u("uanim_steel", "Acier", "rare", "Succès"),
  u("uanim_frost", "Frost (glacé)", "rare", "Shop · 2000 rubis"),

  // ── PSEUDOS ANIMÉS MOTEUR (PixiJS+GSAP, nouveaux — obtention à définir) ──
  x("garden-of-ashes", "Jardin des Cendres", "mythic", "Proposition · obtention à définir"),
  x("eveil-lunaire", "Éveil Lunaire", "legendary", "Proposition · obtention à définir"),
  x("jackpot-divin", "Jackpot Divin", "mythic", "Proposition · obtention à définir"),
  x("leviathan-abyssal", "Léviathan Abyssal", "mythic", "Proposition · obtention à définir"),
  x("forge-celeste", "Forge Céleste", "mythic", "Proposition · obtention à définir"),
  x("nuee-obsidienne", "Nuée d'Obsidienne", "mythic", "Proposition · obtention à définir"),
  x("sablier-eternite", "Sablier d'Éternité", "mythic", "Proposition · obtention à définir"),
  x("coeur-du-reacteur", "Cœur du Réacteur", "mythic", "Proposition · obtention à définir"),
  x("orage-interieur", "Orage Intérieur", "legendary", "Proposition · obtention à définir"),
  x("spectre", "Spectre", "legendary", "Proposition · obtention à définir"),
  x("cristallisation", "Cristallisation", "legendary", "Proposition · obtention à définir"),

  // ── PORTAGE MOTEUR des effets classiques (remplaceraient les uanim_*) ──
  x("ufx-chroma", "Chroma (moteur)", "legendary", "Remplace uanim_chroma_toggle · Succès"),
  x("ufx-glitch", "Glitch (moteur)", "legendary", "Remplace uanim_glitch · Succès"),
  x("ufx-galaxy", "Galaxy (moteur)", "legendary", "Remplace uanim_galaxy · Succès"),
  x("ufx-fire", "Feu (moteur)", "epic", "Remplace uanim_fire · Succès"),
  x("ufx-ice", "Glace (moteur)", "legendary", "Remplace uanim_ice · Shop 2000"),
  x("ufx-gold", "Gold (moteur)", "epic", "Remplace uanim_gold_toggle · Shop 2000"),
  x("ufx-pulse-red", "Pulse Rouge (moteur)", "epic", "Remplace uanim_pulse_red · Shop 2000"),
  x("ufx-pulse-blue", "Pulse Bleu (moteur)", "epic", "Remplace uanim_pulse_blue · Shop 2000"),
  x("ufx-rainbow", "Arc-en-ciel (moteur)", "epic", "Remplace uanim_rainbow_scroll · Succès"),
  x("ufx-silver", "Argenté (moteur)", "rare", "Remplace uanim_silver_toggle · Shop 2000"),
  x("ufx-purple", "Pourpre royal (moteur)", "rare", "Remplace uanim_purple_toggle · Shop 2000"),
  x("ufx-crimson", "Crimson (moteur)", "rare", "Remplace uanim_crimson · Shop 2000"),
  x("ufx-neon", "Néon (moteur)", "rare", "Remplace uanim_neon_underline · Système"),

  // ══ ROUND BADGES (11 juil) — effets par badge, intensité selon rareté ══
  b("badge_luna", "Badge LUNA — respiration lunaire", "uncommon", "Shop · 200 rubis"),
  b("badge_heart", "Badge Cœur — battement", "uncommon", "Shop · 200 rubis"),
  b("badge_star", "Badge Étoile — scintillement", "uncommon", "Shop · 200 rubis"),
  b("badge_chef", "Badge Chef — brillance dorée", "rare", "Shop · 300 rubis"),
  b("badge_lightning", "Badge Éclair — flicker électrique", "rare", "Shop · 300 rubis"),
  b("badge_discord", "Badge Discord — robot + pastille en ligne", "rare", "Succès : lier son compte Discord à LunaLive"),
  b("badge_skull", "Badge Skull — braise infernale", "epic", "Shop · 500 rubis"),
  b("badge_rich", "Badge $$ — richesse + reflet", "epic", "Succès « Crésus » — à valider"),
  b("badge_777", "Badge 777 — border beam + jackpot", "legendary", "Shop · 750 rubis"),
  b("badge_og", "Badge OG — holographique", "legendary", "Succès « OG » — à valider"),

  // ══ ROUND TITRES (11 juil) — effets lettre par lettre ══
  // Mythiques (DA complète)
  t("title_lunaking", "LunaKing — aurore lunaire + marée argent-or", "mythic", "Succès (à définir ensemble)"),
  t("title_allin_man", "All-in Man — shove + jackpot", "mythic", "Succès (à définir ensemble)"),
  // Légendaires (un effet unique chacun)
  t("title_sous_la_lune", "Sous la lune — marée d'argent", "legendary", "Succès « Sous la lune »"),
  t("title_pretre_de_la_roue", "Prêtre de la roue — lettres roulette", "legendary", "Succès « Prêtre de la roue »"),
  t("title_archiviste", "Archiviste — machine à écrire", "legendary", "Succès « Archiviste »"),
  t("title_pilier", "Pilier — lettres qui s'abattent", "legendary", "Succès « Pilier »"),
  t("title_parfait", "Parfait — scintillement séquentiel", "legendary", "Succès « Parfait »"),
  t("title_polyvalent", "Polyvalent — spectre par lettre", "legendary", "Succès « Polyvalent »"),
  t("title_collection_par_categorie", "Collection par catégorie — puzzle", "legendary", "Succès « Collection »"),
  t("title_ultime", "Ultime — or massif + vague", "legendary", "Succès « Ultime » (20 succès)"),
  t("title_predateur", "Prédateur — rôde + glint rouge", "legendary", "Succès « Prédateur » (300 calls)"),
  t("title_trader", "Trader — ticker vert/rouge", "legendary", "Succès « Trader » (100 payouts)"),
  t("title_max_frappe", "Max frappe — onde de choc", "legendary", "Succès « Max frappe » (x1000)"),
  t("title_oracle", "Oracle — lévitation mystique", "legendary", "Succès « Oracle » (40 prédictions)"),
  t("title_nessie", "Nessie — houle aquatique", "legendary", "Succès « Nessie » (150 mains BJ)"),
  t("title_croupier_slayer", "Croupier slayer — cartes distribuées", "legendary", "Succès « Croupier slayer »"),
  t("title_baron", "Baron — reflet métallique or", "legendary", "Succès « Baron » (10 000 rubis)"),
  t("title_rothschild", "Rothschild — la courbe monte", "legendary", "Succès « Rothschild » (75K gagnés)"),
  t("title_acharne", "Acharné — tremblement de rage", "legendary", "Succès « Acharné » (40 hebdos)"),
  t("title_inarretable", "Inarrêtable — marche en avant", "legendary", "Succès « Inarrêtable » (10 mensuelles)"),
  t("title_one_piece", "One Piece — drapeau trésor", "legendary", "Succès « One Piece »"),
  t("title_legende_du_chat", "Légende du chat — pop messages", "legendary", "Succès « Légende du chat »"),
  t("title_brother_eye", "Brother Eye — scan cyan", "legendary", "Succès « Brother Eye »"),
  t("title_ephemeride", "Éphéméride — flip calendrier", "legendary", "Succès « Éphéméride »"),
  t("title_tryharder", "Tryharder — surchauffe montante", "legendary", "Succès « Tryharder »"),
  t("title_legende", "Légende — révélation dorée", "legendary", "Succès « Légende »"),
  t("title_sans_vie", "Sans vie — dérive fantomatique", "legendary", "Succès « Sans vie »"),
  t("title_bigmoula", "BigMoula — billets verts + reflet $", "legendary", "Succès « BigMoula »"),
  // Épiques : 4 familles (anim très légère, conforme grille)
  tf("titlefam_gold", "Famille épique OR (casino/économie) — reflet doré", ["title_roulette", "title_banquier", "title_shark", "title_coffre_fort"], "19 titres épiques casino/économie"),
  tf("titlefam_pulse", "Famille épique PULSE (fidélité/watch) — respiration", ["title_marathon", "title_fidele", "title_toujours_la", "title_no_life"], "13 titres épiques fidélité/watch"),
  tf("titlefam_pop", "Famille épique POP (chat/social) — micro-rebond", ["title_grande_discussion", "title_explorateur", "title_maitre_du_bot"], "4 titres épiques chat/social"),
  t("title_batman", "Batman — bat-signal (épique unique)", "epic", "Succès « Noctambule »"),

  // ══ DÉCISIONS D'OBTENTION à valider (succès reworkés selon tes retours) ══
  d("dec_frame_glitch", "Cadran Glitch ← succès « Anomalie » (v2 : thème changé)", "legendary", "Succès « Anomalie » (blackjack) : enchaîner 8 victoires consécutives au blackjack — battre le système, c'est le glitch. Palier master au-dessus du succès « 203 » (4 victoires consécutives). Le thème roue est abandonné comme demandé."),
  d("dec_frame_eclipse", "Cadran Eclipse ← succès « Jour et nuit » (renommé)", "mythic", "Succès « Jour et nuit » : se connecter matin ET soir sur une même journée, 60 journées différentes. (Renommage acté — remplace « Sous la lune » ; le titre légendaire « Sous la lune » reste attaché au succès de watch nocturne.)"),
  d("dec_frame_eclair", "Cadran Éclair ← succès EVENT (nouvelle proposition)", "legendary", "Succès event « Éclair » : réaliser 100 tours de roue pendant une seule édition de l'event Roue. (Tu as refusé la version hors-event ; celle-ci est liée à l'event Roue.)"),
  d("dec_garden", "Jardin des Cendres ← succès beaucoup plus dur", "mythic", "Succès event « Maître des Cendres » : terminer sur le podium (top 3) des 4 types d'event — Roue, Coffre, Boss, Semaine du viewer. Multi-events, très long terme, digne du mythique le plus travaillé."),
  d("dec_jackpot", "Jackpot Divin ← rework acté", "mythic", "TA DÉCISION (pour trace) : décrocher 3 fois le gain maximal de la roue quotidienne."),
  d("dec_leviathan", "Léviathan Abyssal ← nouveau succès", "mythic", "Succès event « Abysses » : 50 000 rubis contribués cumulés aux Coffres communs (toutes éditions). L'abysse engloutit tout ce qu'on y jette."),
  d("dec_forge", "Forge Céleste ← nouveau succès (boutique refusée)", "mythic", "Succès event « Forge Céleste » : 50 000 dégâts cumulés sur les boss (toutes éditions) — le marteau frappe l'enclume édition après édition. Palier au-dessus de « DPS » (10 000)."),
  d("dec_nuee", "Nuée d'Obsidienne ← succès complexifié", "mythic", "Succès « Noctambule ultime » : 60 nuits distinctes avec au moins 30 min de watch entre minuit et 4 h du matin."),
  d("dec_cristallisation", "Cristallisation ← succès hivernal", "legendary", "Succès « Hibernation » : 40 h de watch en période hivernale (décembre → février). X = 40 h — dis-moi si tu veux plus/moins."),
  d("dec_spectre", "Spectre ← heures montées", "legendary", "100 h de présence live cumulée sans écrire un seul message (au lieu de 12 h). Dis-moi si tu veux un autre palier."),
  d("dec_orage", "Orage Intérieur ← succès event top 10 (v2)", "legendary", "Succès event « Orage Intérieur » : terminer dans le top 10 de chaque type d'event À CLASSEMENT — Roue, Coffre, Boss, Semaine du viewer (les clips, sans classement, ne comptent pas). Petit frère de « Maître des Cendres » (podium partout, mythique)."),
  d("dec_eveil", "Éveil Lunaire ← succès connexion", "legendary", "100 jours de connexion cumulés (palier légendaire sous le Sablier 365 j)."),
  d("dec_fire", "Feu (pseudo moteur) ← succès série", "epic", "Série de connexion de 14 jours consécutifs."),
  d("dec_steel", "Acier (pseudo CSS) ← succès « Inoxydable »", "rare", "50 jours de connexion cumulés."),
  d("dec_badge_og", "Badge OG ← succès « OG »", "legendary", "Compte créé avant le lancement officiel de la plateforme."),
  d("dec_badge_rich", "Badge $$ ← succès « Crésus »", "epic", "100 000 rubis gagnés cumulés (lifetime, palier au-dessus de Rothschild 75K)."),
  d("dec_badge_streamer", "Badge Discord 🤖 ← succès lien Discord (v2)", "rare", "Renommé « Badge Discord » avec tête de robot 🤖 (fond blurple + pastille en ligne). Récompense du succès existant « Connecté » : lier son compte Discord à LunaLive."),
  d("dec_hat_pirate", "Bandeau Pirate ← succès « Flibustier »", "epic", "Ouvrir 30 coffres quotidiens."),
  d("dec_hat_viking", "Casque Viking ← succès event « Berserker »", "legendary", "5 000 dégâts au boss sur une seule édition."),
  d("dec_prix", "Grille de prix boutique (appliquée, à confirmer)", "epic", "Pseudos/cadrans : mythique 5000 · légendaire 3000 · épique 1500 · rare 1000 · commun 500. Hats : 2500/1500/800/500/300. Badges : 750/500/300/200. uanim CSS actifs alignés (épique 1500, rare 1000)."),
];

function loadDecisions(): Record<string, Decision> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    /* stockage indisponible */
    return {};
  }
}

function mockMsg(item: ReviewItem) {
  return {
    id: item.code,
    userId: 4,
    username: item.kind === "username" ? item.name.split("—")[0].replace(/[\s()]+/g, "") : "LunaTesteur",
    body:
      item.kind === "frame"
        ? `Aperçu du ${item.name} en conditions réelles.`
        : item.kind === "badge"
        ? "Aperçu du badge en conditions réelles (colonne gauche)."
        : "Aperçu de l'effet pseudo en conditions réelles.",
    createdAt: new Date(0).toISOString(),
    cosmetics: {
      frame: item.kind === "frame" ? { frameId: item.code } : null,
      badges: item.kind === "badge" ? [{ id: item.code, label: BADGE_TEXT[item.code] || "?", tier: "silver" }] : [],
      username: item.kind === "username" ? { effect: item.code } : {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    role: "viewer",
  };
}

function titleEntry(code: string, rarity: Rarity): ChatTitleEntry {
  return {
    source: "achievement",
    code,
    label: TITLE_LABELS[code] || code,
    rarity,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function buildRecap(decisions: Record<string, Decision>) {
  const lines: string[] = [];
  for (const it of ITEMS) {
    const d = decisions[it.code];
    if (!d) continue;
    if (d.status === "valide") lines.push(`✅ ${it.code} — ${it.name}`);
    else lines.push(`🔧 ${it.code} — ${it.name} : ${d.note || "(sans motif)"}`);
  }
  const done = Object.keys(decisions).length;
  return `RÉCAP SKINS REVIEW (${done}/${ITEMS.length} traités)\n${lines.join("\n")}`;
}

const btnStyle: CSSProperties = {
  border: "none",
  borderRadius: 12,
  padding: "12px 22px",
  fontSize: 15,
  fontWeight: 800,
  cursor: "pointer",
};

export default function SkinsReviewPage() {
  const [decisions, setDecisions] = useState<Record<string, Decision>>(loadDecisions);
  // index courant = premier non traité (mais navigable manuellement)
  const firstPending = useMemo(() => {
    const i = ITEMS.findIndex((it) => !decisions[it.code]);
    return i === -1 ? ITEMS.length - 1 : i;
  }, [decisions]);
  const [index, setIndex] = useState(firstPending);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(decisions));
    } catch {
      /* stockage indisponible */
    }
  }, [decisions]);

  const item = ITEMS[index];
  const rar = RARITY_META[item.rarity];
  const current = decisions[item.code];
  const doneCount = Object.keys(decisions).length;
  const validCount = Object.values(decisions).filter((d) => d.status === "valide").length;
  const redoCount = doneCount - validCount;
  const allDone = doneCount >= ITEMS.length;

  const goNext = () => {
    setNoteOpen(false);
    setNote("");
    // saute au prochain non traité après l'index courant, sinon avance de 1
    for (let i = index + 1; i < ITEMS.length; i++) {
      if (!decisions[ITEMS[i].code]) {
        setIndex(i);
        return;
      }
    }
    setIndex(Math.min(index + 1, ITEMS.length - 1));
  };

  const validate = () => {
    setDecisions((d) => ({ ...d, [item.code]: { status: "valide" } }));
    goNext();
  };

  const saveRedo = () => {
    setDecisions((d) => ({ ...d, [item.code]: { status: "a-refaire", note: note.trim() } }));
    goNext();
  };

  const copyRecap = async () => {
    try {
      await navigator.clipboard.writeText(buildRecap(decisions));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard indisponible */
    }
  };

  // après un retravail global : efface les « à refaire », garde les validés
  const resetRedos = () => {
    if (!window.confirm("Effacer toutes les décisions « à refaire » (les validés sont conservés) ?")) return;
    setDecisions((d) => {
      const kept: Record<string, Decision> = {};
      for (const [code, dec] of Object.entries(d)) if (dec.status === "valide") kept[code] = dec;
      return kept;
    });
    setNoteOpen(false);
    const i = ITEMS.findIndex((it) => decisions[it.code]?.status !== "valide");
    setIndex(i === -1 ? 0 : i);
  };

  return (
    <main className="container" style={{ maxWidth: 720, display: "grid", gap: 14, paddingBottom: 60 }}>
      <div>
        <h1 style={{ margin: "18px 0 4px", fontSize: 26 }}>🛠 Traitement des skins</h1>
        <p style={{ margin: 0, opacity: 0.7, fontSize: 13 }}>
          Un skin à la fois : ✅ Valider ou 🔧 À refaire (avec ton motif / idée). Cadrans, effets
          pseudo CSS, 🚀 pseudos MOTEUR, puis nouveau round : 🎖 badges à effets, 🏷 titres animés
          lettre par lettre, et ⚖️ décisions d'obtention (succès reworkés). Tout est sauvegardé
          dans ce navigateur.
        </p>
      </div>

      {/* Progression */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 13, fontWeight: 700, flexWrap: "wrap" }}>
        <span>
          Skin {index + 1}/{ITEMS.length}
        </span>
        <span style={{ color: "#4ade80" }}>✅ {validCount}</span>
        <span style={{ color: "#f87171" }}>🔧 {redoCount}</span>
        <div style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)", minWidth: 120 }}>
          <div
            style={{
              width: `${(doneCount / ITEMS.length) * 100}%`,
              height: "100%",
              borderRadius: 3,
              background: "linear-gradient(90deg, #a78bfa, #4ade80)",
              transition: "width 0.3s",
            }}
          />
        </div>
        <button
          onClick={copyRecap}
          style={{ ...btnStyle, padding: "6px 12px", fontSize: 12, background: "rgba(255,255,255,0.08)", color: "#e5e7eb" }}
        >
          {copied ? "Copié ✔" : "📋 Copier le récap"}
        </button>
        <button
          onClick={() => {
            if (!window.confirm('Effacer TOUTES les décisions pour tout revoir depuis le début ?')) return;
            setDecisions({});
            setNoteOpen(false);
            setIndex(0);
          }}
          style={{ ...btnStyle, padding: '6px 12px', fontSize: 12, background: 'rgba(255,255,255,0.05)', color: '#9ca3af' }}
        >
          🔄 Tout revoir
        </button>
        <button
          onClick={resetRedos}
          title="Efface les « à refaire » (garde les validés) — à utiliser après un retravail global"
          style={{ ...btnStyle, padding: "6px 12px", fontSize: 12, background: "rgba(255,255,255,0.05)", color: "#9ca3af" }}
        >
          ♻️ Réinitialiser
        </button>
      </div>

      {/* Carte du skin courant */}
      <div
        style={{
          border: `1px solid ${rar.color}44`,
          borderRadius: 18,
          padding: 20,
          background: "rgba(255,255,255,0.03)",
          display: "grid",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
          <strong style={{ fontSize: 19 }}>
            {item.kind === "frame" ? "🖼" : item.kind === "fx" ? "🚀"
              : item.kind === "badge" ? "🎖" : item.kind === "title" || item.kind === "titlefam" ? "🏷"
              : item.kind === "decision" ? "⚖️" : "✍️"} {item.name}
          </strong>
          <span style={{ fontSize: 12, fontWeight: 800, display: "flex", gap: 10, alignItems: "baseline" }}>
            <span style={{ color: rar.color }}>{rar.label}</span>
            {/* decision : le texte long est dans l'encadré, pas dans le header */}
            {item.kind !== "decision" ? <span style={{ opacity: 0.7 }}>{item.how}</span> : null}
          </span>
        </div>

        {item.kind === "fx" ? (
          <div
            style={{
              background: "#0b0b12",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 12,
              padding: "22px 14px",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <AnimatedUsername
              username="LeCasiNoze"
              effectId={item.code}
              rarity={item.rarity as FxRarity}
              context="shop"
              intensity={1}
              size={26}
            />
          </div>
        ) : item.kind === "title" || item.kind === "titlefam" ? (
          <div
            style={{
              background: "#0b0b12",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 12,
              padding: "26px 14px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
            }}
          >
            {(item.kind === "titlefam" ? item.fam! : [item.code]).map((code) => (
              // fontSize élevé : le pill est en em, on grossit pour juger l'effet
              <span key={code} style={{ fontSize: 26 }}>
                <TitlePill entry={titleEntry(code, item.rarity)} size="md" />
              </span>
            ))}
            <span style={{ fontSize: 12, opacity: 0.55 }}>
              taille réelle chat :{" "}
              <span style={{ fontSize: 13 }}>
                <TitlePill entry={titleEntry(item.kind === "titlefam" ? item.fam![0] : item.code, item.rarity)} />
              </span>
            </span>
          </div>
        ) : item.kind === "decision" ? (
          <div
            style={{
              background: "rgba(103,232,249,0.05)",
              border: "1px solid rgba(103,232,249,0.25)",
              borderRadius: 12,
              padding: "18px 16px",
              fontSize: 14,
              lineHeight: 1.55,
            }}
          >
            {item.how}
          </div>
        ) : (
          <div style={{ position: "relative" }}>
            {/* ChatMessageBubble rend lui-même FrameFxOverlay + moteur pseudo */}
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <ChatMessageBubble msg={mockMsg(item) as any} streamerAppearance={DEFAULT_APPEARANCE} />
          </div>
        )}

        {current && (
          <div style={{ fontSize: 13, fontWeight: 700, color: current.status === "valide" ? "#4ade80" : "#f87171" }}>
            {current.status === "valide" ? "Déjà validé ✔" : `Déjà marqué à refaire${current.note ? ` : « ${current.note} »` : ""}`}
            {" — tu peux changer la décision ci-dessous."}
          </div>
        )}

        {/* Décision */}
        {!noteOpen ? (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button onClick={validate} style={{ ...btnStyle, background: "rgba(74,222,128,0.18)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.45)" }}>
              ✅ Valider
            </button>
            <button
              onClick={() => {
                setNote(current?.note || "");
                setNoteOpen(true);
              }}
              style={{ ...btnStyle, background: "rgba(248,113,113,0.14)", color: "#f87171", border: "1px solid rgba(248,113,113,0.4)" }}
            >
              🔧 À refaire
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            <textarea
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Motif du refus / ton idée (optionnel mais conseillé)…"
              rows={3}
              style={{
                width: "100%",
                boxSizing: "border-box",
                borderRadius: 12,
                border: "1px solid rgba(248,113,113,0.4)",
                background: "rgba(0,0,0,0.35)",
                color: "#e5e7eb",
                padding: "10px 12px",
                fontSize: 14,
                fontFamily: "inherit",
                resize: "vertical",
              }}
            />
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={saveRedo} style={{ ...btnStyle, background: "rgba(248,113,113,0.18)", color: "#f87171", border: "1px solid rgba(248,113,113,0.45)" }}>
                Enregistrer → suivant
              </button>
              <button
                onClick={() => setNoteOpen(false)}
                style={{ ...btnStyle, background: "rgba(255,255,255,0.06)", color: "#9ca3af", border: "1px solid rgba(255,255,255,0.12)" }}
              >
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Navigation manuelle */}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
        <button
          onClick={() => {
            setNoteOpen(false);
            setIndex(Math.max(0, index - 1));
          }}
          disabled={index === 0}
          style={{ ...btnStyle, padding: "8px 14px", fontSize: 13, background: "rgba(255,255,255,0.06)", color: index === 0 ? "#4b5563" : "#e5e7eb" }}
        >
          ← Précédent
        </button>
        <button
          onClick={() => {
            setNoteOpen(false);
            setIndex(Math.min(ITEMS.length - 1, index + 1));
          }}
          disabled={index === ITEMS.length - 1}
          style={{ ...btnStyle, padding: "8px 14px", fontSize: 13, background: "rgba(255,255,255,0.06)", color: index === ITEMS.length - 1 ? "#4b5563" : "#e5e7eb" }}
        >
          Passer →
        </button>
      </div>

      {/* Fin de liste : récap complet */}
      {allDone && (
        <div style={{ border: "1px solid rgba(74,222,128,0.4)", borderRadius: 16, padding: 16, display: "grid", gap: 10 }}>
          <strong style={{ color: "#4ade80" }}>🎉 Tout est traité !</strong>
          <p style={{ margin: 0, fontSize: 13, opacity: 0.75 }}>
            Copie le récap ci-dessous et colle-le à Claude pour lancer la reprise des refusés.
          </p>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, background: "rgba(0,0,0,0.35)", borderRadius: 10, padding: 12, margin: 0 }}>
            {buildRecap(decisions)}
          </pre>
        </div>
      )}
    </main>
  );
}
