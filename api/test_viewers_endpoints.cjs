// api/test_viewers_endpoints.cjs
// Test de validation que les deux endpoints retournent les mêmes données

const API_BASE = "https://lunalive-api.onrender.com"; // ou votre API locale

async function testViewersEndpoints(streamerSlug, token) {
  console.log('🔍 COMPARAISON DES ENDPOINTS VIEWERS');
  console.log('='.repeat(80));
  console.log(`Streamer: ${streamerSlug}`);
  console.log(`Token: ${token ? 'PRÉSENT' : 'ABSENT'}`);
  console.log('');

  // Test 1: Endpoint public principal (utilisé par Lives en priorité)
  console.log('📡 Test 1: /api/viewers (public - Lives principal)');
  try {
    const url = `${API_BASE}/api/viewers?slug=${encodeURIComponent(streamerSlug)}&_=${Date.now()}`;
    console.log(`   URL: ${url}`);
    
    const r1 = await fetch(url, { cache: "no-store" });
    const j1 = await r1.json().catch(() => null);
    
    console.log(`   Status: ${r1.status} ${r1.statusText}`);
    console.log(`   Response:`, JSON.stringify(j1, null, 2));
    
    if (r1.ok && j1) {
      const raw = j1?.viewers ?? j1?.counts ?? j1?.data ?? null;
      let viewers1;
      if (raw && typeof raw === "object") {
        viewers1 = raw[streamerSlug.toLowerCase()];
      } else {
        viewers1 = j1?.viewers != null ? j1.viewers : j1.count;
      }
      console.log(`   ✅ Viewers (public): ${viewers1}`);
      
      // Test 2: Endpoint overlay (fallback - utilisé par OBS avant correction)
      console.log('\n📡 Test 2: /overlay/api/viewers (auth - OBS avant correction)');
      if (token) {
        try {
          const url2 = `${API_BASE}/overlay/api/viewers?slug=${encodeURIComponent(streamerSlug)}&token=${encodeURIComponent(token)}&_=${Date.now()}`;
          console.log(`   URL: ${url2}`);
          
          const r2 = await fetch(url2, { cache: "no-store" });
          const j2 = await r2.json().catch(() => null);
          
          console.log(`   Status: ${r2.status} ${r2.statusText}`);
          console.log(`   Response:`, JSON.stringify(j2, null, 2));
          
          if (r2.ok && j2) {
            const viewers2 = j2?.viewers != null ? j2.viewers : j2.count;
            console.log(`   ✅ Viewers (overlay): ${viewers2}`);
            
            // Comparaison
            console.log('\n🎯 COMPARAISON FINALE:');
            console.log(`   Public endpoint:  ${viewers1}`);
            console.log(`   Overlay endpoint: ${viewers2}`);
            
            if (viewers1 === viewers2) {
              console.log(`   ✅ LES DEUX ENDPOINTS RETOURNENT LA MÊME VALEUR`);
            } else {
              console.log(`   ⚠️  DIFFÉRENCE DÉTECTÉE: ${Math.abs(viewers1 - viewers2)} viewers`);
              console.log(`   📝 Le widget OBS va maintenant utiliser l'endpoint public en priorité`);
            }
          } else {
            console.log(`   ❌ Overlay endpoint failed: ${r2.status}`);
          }
        } catch (error) {
          console.log(`   💥 Overlay endpoint error: ${error.message}`);
        }
      } else {
        console.log(`   ⏭️  Skip: pas de token pour tester l'endpoint overlay`);
      }
      
    } else {
      console.log(`   ❌ Public endpoint failed: ${r1.status}`);
    }
    
  } catch (error) {
    console.log(`   💥 Public endpoint error: ${error.message}`);
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('🎯 CONCLUSION:');
  console.log('   • La page Lives utilise /api/viewers en priorité (public)');
  console.log('   • Le widget OBS utilisait /overlay/api/viewers (auth) uniquement');
  console.log('   • Le widget OBS maintenant corrigé utilise /api/viewers en priorité');
  console.log('   • Si /api/viewers échoue, les deux utilisent /overlay/api/viewers en fallback');
  console.log('   • Les viewers devraient maintenant être identiques entre Lives et OBS');
}

// Test avec un streamer réel (remplacez par vos valeurs)
const testSlug = "lucas"; // ou un autre streamer slug
const testToken = null; // ou mettez un token réel si vous en avez

testViewersEndpoints(testSlug, testToken).catch(console.error);
