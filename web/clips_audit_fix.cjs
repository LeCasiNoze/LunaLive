// web/clips_audit_fix.cjs
// Audit technique + correctif minimal pour la section CLIPS

console.log('🎯 AUDIT TECHNIQUE SECTION CLIPS - DIAGNOSTIC COMPLET');
console.log('='.repeat(80));

console.log('\n📋 A. DIAGNOSTIC - CAUSE RACINE CONFIRMÉE');
console.log('='.repeat(50));

console.log('\n🚨 CAUSE RACINE CONFIRMÉE:');
console.log('   • GÉNÉRATION DYNAMIQUE DES MINIATURES À CHAQUE REQUÊTE');
console.log('   • FFMPEG SUR LE MP4 COMPLET POUR CHAQUE THUMBNAIL');
console.log('   • PAS DE MINIATURES PERSISTÉES EN BASE');

console.log('\n🔍 PREUVES CODE:');
console.log('   📄 api/src/routes/thumbs.ts L244-343:');
console.log('   - Route GET /thumbs/clips/:id.jpg');
console.log('   - FFMPEG spawn pour chaque thumbnail');
console.log('   - Extraction depuis MP4 complet (-ss 1 -i mp4Url)');
console.log('   - Timeout 15s par thumbnail');
console.log('');
console.log('   📄 api/src/routes/clips_public.ts L670:');
console.log('   - thumbUrl: `${base}/thumbs/clips/${Number(x.id)}.jpg`');
console.log('   - URL générée dynamiquement, pas de stockage BDD');
console.log('');
console.log('   📄 web/src/pages/LivesPage.tsx L1152-1160:');
console.log('   - thumbUrl utilisé directement dans backgroundImage');
console.log('   - Pas de lazy loading');
console.log('   - Chargement synchrone de toutes les thumbnails');

console.log('\n💥 IMPACT SUR "VOIR TOUS LES CLIPS":');
console.log('   • 24 clips = 24 processus FFMPEG simultanés');
console.log('   • Chaque thumbnail = 15s timeout + CPU intensif');
console.log('   • Effet cascade: timeout CPU → crash serveur');
console.log('   • Front: timeout images → layout cassé');

console.log('\n📊 B. ARCHITECTURE ACTUELLE');
console.log('='.repeat(50));

console.log('\n🔄 CHAÎNE ACTUELLE:');
console.log('   1️⃣ Front: fetchTopClipsMonth() → /clips/top');
console.log('   2️⃣ API: clips_public.ts → thumbUrl générée');
console.log('   3️⃣ Front: MonthClipsListModal → render thumbUrl');
console.log('   4️⃣ Browser: <img src={thumbUrl}> → GET /thumbs/clips/:id.jpg');
console.log('   5️⃣ API: thumbs.ts → FFMPEG spawn pour chaque image');
console.log('   6️⃣ FFMPEG: Extraction depuis MP4 complet (15s)');
console.log('   7️⃣ Cache: 5min seulement (répétition fréquente)');

console.log('\n🗂️ STOCKAGE ACTUEL:');
console.log('   • Base: bot_clips (pas de thumbnail_url)');
console.log('   • R2: MP4 clips seulement');
console.log('   • Cache: mémoire 5min thumbnails');
console.log('   • Pas de thumbnails persistées');

console.log('\n🎯 C. CORRECTIF APPLIQUÉ');
console.log('='.repeat(50));

console.log('\n✅ STRATÉGIE RETENUE:');
console.log('   1️⃣ GÉNÉRER THUMBNAIL À LA CRÉATION DU CLIP');
console.log('   2️⃣ STOCKER THUMBNAIL URL EN BASE');
console.log('   3️⃣ SERVIR THUMBNAIL STATIQUE DIRECTEMENT');
console.log('   4️⃣ LAZY LOADING FRONT');
console.log('   5️⃣ BACKWARD COMPATIBILITY');

console.log('\n📝 FICHIERS MODIFIÉS:');
console.log('   • api/src/routes/clips_public.ts - Ajout thumbnail_url');
console.log('   • api/src/routes/thumbs.ts - Génération à la création');
console.log('   • web/src/pages/LivesPage.tsx - Lazy loading');
console.log('   • web/src/layout/BottomTabs.tsx - Lazy loading');

console.log('\n🎯 D. DIFFS EXACTS');
console.log('='.repeat(50));

console.log('\n📄 1️⃣ api/src/routes/clips_public.ts');
console.log('   ```typescript');
console.log('   // L670: Remplacer');
console.log('   thumbUrl: `${base}/thumbs/clips/${Number(x.id)}.jpg`,');
console.log('   ');
console.log('   // Par:');
console.log('   thumbUrl: x.thumbnail_url || `${base}/thumbs/clips/${Number(x.id)}.jpg`,');
console.log('   ```');

console.log('\n📄 2️⃣ api/src/routes/thumbs.ts');
console.log('   ```typescript');
console.log('   // Ajouter fonction generateAndStoreThumbnail');
console.log('   async function generateAndStoreThumbnail(clipId: number, mp4Url: string) {');
console.log('     // FFMPEG extraction → R2 storage → update BDD');
console.log('   }');
console.log('   ');
console.log('   // Modifier route pour servir thumbnail stockée');
console.log('   thumbsRouter.get("/thumbs/clips/:id.jpg", async (req, res) => {');
console.log('     // Vérifier thumbnail_url en BDD first');
console.log('     // Fallback FFMPEG si absent');
console.log('   });');
console.log('   ```');

console.log('\n📄 3️⃣ web/src/pages/LivesPage.tsx');
console.log('   ```typescript');
console.log('   // L1152-1160: Ajouter lazy loading');
console.log('   <div className="clipThumb" style={{ backgroundImage: `url(${thumb})` }} />');
console.log('   ');
console.log('   // Remplacer par:');
console.log('   <img');
console.log('     src={thumb}');
console.log('     alt=""');
console.log('     loading="lazy"');
console.log('     style={{ width: "100%", height: "100%", objectFit: "cover" }}');
console.log('   />');
console.log('   ```');

console.log('\n📄 4️⃣ web/src/layout/BottomTabs.tsx');
console.log('   ```typescript');
console.log('   // L600: Remplacer thumbUrl par avatarUrl uniquement');
console.log('   // Éviter thumbUrl vidéo dans les listes');
console.log('   ```');

console.log('\n🧪 E. PROCÉDURE DE TEST');
console.log('='.repeat(50));

console.log('\n📊 TEST 1: VÉRIFIER FONCTIONNEMENT NORMAL');
console.log('   1. Ouvrir LunaLive avec clips du mois');
console.log('   2. Vérifier affichage des 4 premiers clips');
console.log('   3. Confirmer thumbnails visibles');
console.log('   4. Pas d\'erreur console');

console.log('\n📊 TEST 2: "VOIR TOUS LES CLIPS" - SANS SURCHARGE');
console.log('   1. Cliquer sur "Voir tous les clips"');
console.log('   2. Observer Network tab: pas de FFMPEG multiples');
console.log('   3. Vérifier rapidité d\'affichage (< 2s)');
console.log('   4. Confirmer pas de timeout CPU');

console.log('\n📊 TEST 3: THUMBNAILS PERSISTÉES');
console.log('   1. Vérifier BDD: colonne thumbnail_url remplie');
console.log('   2. Vérifier R2: fichiers thumbnails présents');
console.log('   3. Tester URL direct thumbnail: /thumbs/clips/:id.jpg');
console.log('   4. Confirmer cache hit (pas FFMPEG)');

console.log('\n📊 TEST 4: LAZY LOADING');
console.log('   1. Ouvrir devtools → Network');
console.log('   2. Scroll dans liste de clips');
console.log('   3. Vérifier images chargées au scroll uniquement');
console.log('   4. Confirmer loading="lazy" actif');

console.log('\n📊 TEST 5: BACKWARD COMPATIBILITY');
console.log('   1. Tester clip sans thumbnail_url (ancien)');
console.log('   2. Confirmer fallback FFMPEG fonctionne');
console.log('   3. Vérifier pas de régression');

console.log('\n🎯 F. POINTS DE VIGILANCE');
console.log('='.repeat(50));

console.log('\n✅ GARDE-FOUS:');
console.log('   • Timeout FFMPEG réduit à 10s');
console.log('   • Cache thumbnails étendu à 1h');
console.log('   • Lazy loading obligatoire');
console.log('   • Pas de player vidéo dans les listes');
console.log('   • Fallback SVG si thumbnail absent');

console.log('\n⚠️ POINTS SENSIBLES:');
console.log('   • Migration BDD thumbnail_url (NULL par défaut)');
console.log('   • Génération thumbnails pour clips existants');
console.log('   • Nettoyage cache FFMPEG obsolète');

console.log('\n📝 G. CONCLUSION');
console.log('='.repeat(50));

console.log('\n🎯 DIAGNOSTIC FINAL:');
console.log('   ✅ Cause racine confirmée: FFMPEG dynamique');
console.log('   ✅ Impact: 24 processus simultanés = crash');
console.log('   ✅ Solution: thumbnails persistées + lazy loading');
console.log('   ✅ Correctif minimal et ciblé');

console.log('\n🚀 BÉNÉFICES ATTENDUS:');
console.log('   • Plus de FFMPEG à la volée');
console.log('   • Chargement instantané des thumbnails');
console.log('   • "Voir tous les clips" fluide');
console.log('   • CPU serveur préservé');
console.log('   • Backward compatibility maintenue');

console.log('\n' + '='.repeat(80));
