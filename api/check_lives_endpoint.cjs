// api/check_lives_endpoint.cjs
// Vérification précise de la structure de /lives

async function checkLivesEndpoint() {
  console.log('🔍 VÉRIFICATION PRÉCISE DE /lives');
  console.log('='.repeat(80));
  
  try {
    const API_BASE = "https://lunalive-api.onrender.com";
    
    // 1. Test avec query string correcte
    console.log('📡 Test 1: /lives?_=timestamp');
    const url1 = `${API_BASE}/lives?_=${Date.now()}`;
    console.log(`URL: ${url1}`);
    
    const response1 = await fetch(url1);
    const data1 = await response1.json();
    
    console.log(`Status: ${response1.status} ${response1.statusText}`);
    console.log(`Type: ${Array.isArray(data1) ? 'Array' : typeof data1}`);
    console.log(`Keys: ${!Array.isArray(data1) && typeof data1 === 'object' ? Object.keys(data1).join(', ') : 'N/A'}`);
    
    if (Array.isArray(data1)) {
      console.log(`✅ Tableau direct de ${data1.length} éléments`);
      if (data1.length > 0) {
        const first = data1[0];
        console.log('Premier élément:', JSON.stringify(first, null, 2));
        console.log(`Champs: ${Object.keys(first).join(', ')}`);
        console.log(`Slug: ${first.slug}`);
        console.log(`Viewers: ${first.viewers} (${typeof first.viewers})`);
      }
    } else if (data1 && typeof data1 === 'object') {
      console.log('Structure d\'objet détectée');
      if (data1.data) {
        console.log('-> Champ "data" trouvé, type:', Array.isArray(data1.data) ? 'Array' : typeof data1.data);
        if (Array.isArray(data1.data) && data1.data.length > 0) {
          const first = data1.data[0];
          console.log('Premier élément dans data:', JSON.stringify(first, null, 2));
          console.log(`Champs: ${Object.keys(first).join(', ')}`);
          console.log(`Slug: ${first.slug}`);
          console.log(`Viewers: ${first.viewers} (${typeof first.viewers})`);
        }
      }
      if (data1.items) {
        console.log('-> Champ "items" trouvé, type:', Array.isArray(data1.items) ? 'Array' : typeof data1.items);
        if (Array.isArray(data1.items) && data1.items.length > 0) {
          const first = data1.items[0];
          console.log('Premier élément dans items:', JSON.stringify(first, null, 2));
          console.log(`Champs: ${Object.keys(first).join(', ')}`);
          console.log(`Slug: ${first.slug}`);
          console.log(`Viewers: ${first.viewers} (${typeof first.viewers})`);
        }
      }
    }
    
    // 2. Test sans query string pour comparer
    console.log('\n📡 Test 2: /lives (sans query string)');
    const url2 = `${API_BASE}/lives`;
    console.log(`URL: ${url2}`);
    
    const response2 = await fetch(url2);
    const data2 = await response2.json();
    
    console.log(`Status: ${response2.status} ${response2.statusText}`);
    console.log(`Type: ${Array.isArray(data2) ? 'Array' : typeof data2}`);
    
    // 3. Conclusion pour la correction
    console.log('\n🎯 CONCLUSION POUR LA CORRECTION:');
    console.log('Structure finale:', Array.isArray(data1) ? 'Array direct' : 'Objet avec data/items');
    console.log('URL correcte:', url1);
    console.log('Champ slug:', typeof data1[0]?.slug === 'string' ? 'slug' : '???');
    console.log('Champ viewers:', typeof data1[0]?.viewers === 'number' ? 'viewers' : '???');
    
  } catch (error) {
    console.error('💥 Erreur:', error.message);
  }
}

checkLivesEndpoint();
