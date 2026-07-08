#!/usr/bin/env tsx

// Script de simulation du scheduler Instagram
// Simule le fonctionnement sans avoir besoin de la base de données

console.log("🚀 Simulation du scheduler Instagram...");
console.log("🔧 Mode: SIMULATION (pas de connexion DB requise)");

// Simulation des données
const mockTrackingData = [
  {
    id: 1,
    streamer_slug: "test_streamer",
    media_id: "test_media_123",
    track_until: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h dans le futur
  }
];

const mockStreamerConfig = {
  trigger_word: "luna",
  offer_label: "Offre spéciale",
  process_info: "Voici le processus pour obtenir l'offre",
  discord_url: "https://discord.gg/test",
  extra_url: "https://example.com/offer"
};

const mockComments = [
  {
    id: "comment_1",
    text: "Je veux la luna !",
    username: "user1",
    from: { id: "user1_id", username: "user1" }
  },
  {
    id: "comment_2", 
    text: "Super contenu",
    username: "user2",
    from: { id: "user2_id", username: "user2" }
  },
  {
    id: "comment_3",
    text: "Luna svp",
    username: "user3", 
    from: { id: "user3_id", username: "user3" }
  }
];

// Fonctions utilitaires (copiées du scheduler)
const SENT = ["C'est envoyé", "Check tes DM", "Bien reçu", "Ça part", "Hop, c'est parti", "Dans ta boîte"];
const FOLLOW = [
  "hésite pas à follow pour ne rien rater",
  "un p'tit follow ça fait plaisir", 
  "pense à follow pour les prochains clips",
  "le follow c'est gratuit et ça aide",
  "follow pour rester dans la boucle",
  "abonne-toi pour ne pas louper la suite",
];
const EMOJIS = ["👀", "🎰", "🔥", "💬", "✅", "👇", "🙌"];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildCommentReply(): string {
  return `${pick(SENT)}, ${pick(FOLLOW)} ${pick(EMOJIS)}`;
}

function buildDm(opts: {
  username: string;
  streamerSlug: string;
  offerLabel: string | null;
  processInfo: string | null;
  discordUrl: string | null;
  extraUrl: string | null;
}): string {
  const { username, streamerSlug, offerLabel, processInfo, discordUrl, extraUrl } = opts;

  const header = `Salut @${username} !`;
  const offerLine = offerLabel ? ` (${offerLabel})` : "";
  const processLine = processInfo
    ? processInfo
    : "Tu pourras retrouver l'éventuel processus sur son discord :\n👇";

  return [
    header,
    "",
    `Comme promis, voilà le DM pour profiter de l'offre ${streamerSlug}${offerLine} :`,
    processLine,
    extraUrl ?? "",
    "",
    "Tu auras peut-être besoin d'ouvrir un ticket sur son Discord pour qu'il s'occupe de toi :",
    discordUrl ?? "",
    "",
    "Retrouve-le en live ici :",
    `https://lunalive.win/s/${streamerSlug}`,
    "",
    `Rejoins aussi le Discord LunaLive pour être au courant de tout :`,
    "https://discord.gg/VSbCZQ4gyT",
    "",
    "Merci pour ton soutien 🙌",
  ]
    .join("\n")
    .trim();
}

// Simulation du traitement
function simulateProcessTrackedPost() {
  console.log("\n📝 [SIMULATION] Traitement du post @test_streamer (media: test_media_123)");
  console.log(`🎯 [SIMULATION] Trigger word: "${mockStreamerConfig.trigger_word}" (${mockComments.length} commentaires à analyser)`);
  
  let processedCount = 0;
  let skippedCount = 0;

  for (const comment of mockComments) {
    const commentText = String(comment.text ?? "");
    const commentId = String(comment.id ?? "");
    const username = String(comment.username ?? "");

    // Simulation du filtre trigger_word
    if (!commentText.toLowerCase().includes(mockStreamerConfig.trigger_word.toLowerCase())) {
      console.log(`⏭️ [SIMULATION] Commentaire ${commentId} ne contient pas le trigger`);
      skippedCount++;
      continue;
    }

    processedCount++;
    console.log(`🎯 [SIMULATION] COMMENT MATCH — id=${commentId} user=${username} text="${commentText.slice(0, 60)}"`);

    // Simulation de la réponse publique
    const replyText = buildCommentReply();
    console.log(`💬 [SIMULATION] Envoi de la réponse publique: "${replyText}"`);

    // Simulation du DM
    const fromId = comment.from?.id;
    if (fromId) {
      const dmText = buildDm({
        username,
        streamerSlug: "test_streamer",
        offerLabel: mockStreamerConfig.offer_label,
        processInfo: mockStreamerConfig.process_info,
        discordUrl: mockStreamerConfig.discord_url,
        extraUrl: mockStreamerConfig.extra_url,
      });

      console.log(`📩 [SIMULATION] Envoi du DM à ${username}...`);
      console.log(`📄 [SIMULATION] Contenu du DM:\n${dmText}\n---`);
      console.log(`✅ [SIMULATION] DM envoyé — user=${username} (${fromId})`);
    }
  }

  console.log(`📊 [SIMULATION] Bilan: ${processedCount} traité(s), ${skippedCount} ignoré(s)`);
}

// Simulation des vérifications de permissions
function simulatePermissionCheck() {
  console.log("\n🔍 [SIMULATION] Vérification des permissions Instagram...");
  console.log("✅ [SIMULATION] Connectivité OK — user: @test_user (business)");
  console.log("✅ [SIMULATION] Permissions de base OK");
  console.log("⚠️ [SIMULATION] Permission DM manquante — les envois de DM échoueront");
}

// Simulation de l'état de la base de données
function simulateDatabaseState() {
  console.log("\n📊 [SIMULATION] État de la base de données...");
  console.log("📊 Tracking: 1/1 posts actifs");
  console.log("📊 Configs: 1/1 streamers actifs");
  console.log("📝 Streamers configurés:");
  console.log("    - @test_streamer: trigger=\"luna\"");
  console.log("📊 Réponses envoyées: 0");
}

// Lancement de la simulation
async function runSimulation() {
  try {
    // Vérifications initiales
    simulatePermissionCheck();
    simulateDatabaseState();
    
    // Simulation du tick
    console.log("\n⏰ [SIMULATION] Tick — 1 post(s) to check");
    
    // Traitement des posts
    for (const tracking of mockTrackingData) {
      simulateProcessTrackedPost();
    }
    
    console.log("\n✅ [SIMULATION] Terminé avec succès !");
    
  } catch (error: any) {
    console.error("❌ [SIMULATION] Erreur:", error?.message || error);
  }
}

// Démarrage de la simulation
console.log("⏳ Démarrage de la simulation...");
runSimulation().then(() => {
  console.log("\n🛑 Fin de la simulation");
  process.exit(0);
});
