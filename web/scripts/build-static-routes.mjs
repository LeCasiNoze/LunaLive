import fs from 'node:fs';
import path from 'node:path';

const SITE_URL = 'https://lunalive.onrender.com';
const API = 'https://lunalive-api.onrender.com';

// Route metadata for static pages
const staticRouteMetadata = {
  '/': {
    title: 'LunaLive — Plateforme de streaming casino',
    description: 'LunaLive est une plateforme française de streaming casino avec lives en direct, streamers, pages casinos et événements.',
    canonical: `${SITE_URL}/`,
    content: {
      h1: 'LunaLive — Plateforme de streaming casino',
      paragraph: 'LunaLive est une plateforme française de streaming casino avec lives en direct, streamers, pages casinos et événements.',
      links: [
        { href: '/casinos', text: '🎰 Voir les casinos' },
        { href: '/browse', text: '🧭 Parcourir les streamers' },
        { href: '/hunt', text: '🧿 Challenges Hunt' },
        { href: '/shop', text: '🛒 Boutique' },
        { href: '/event', text: '📅 Événements' }
      ]
    }
  },
  '/casinos': {
    title: 'Casinos — LunaLive',
    description: 'Découvrez les meilleurs casinos en ligne testés par la communauté LunaLive. Avis, bonus et recommandations.',
    canonical: `${SITE_URL}/casinos`,
    content: {
      h1: 'Casinos disponibles sur LunaLive',
      paragraph: 'Découvrez les meilleurs casinos en ligne testés par la communauté LunaLive. Avis détaillés, bonus exclusifs et recommandations des streamers.',
      links: [
        { href: '/browse', text: '🧭 Voir les streamers' },
        { href: '/hunt', text: '🧿 Challenges Hunt' },
        { href: '/event', text: '📅 Événements' }
      ]
    }
  },
  '/browse': {
    title: 'Browse — Streamers Casino — LunaLive',
    description: 'Parcourez tous les streamers casino de la communauté LunaLive. Lives, clips et profils détaillés.',
    canonical: `${SITE_URL}/browse`,
    content: {
      h1: 'Streamers Casino — LunaLive',
      paragraph: 'Parcourez tous les streamers casino de la communauté LunaLive. Lives en direct, clips VOD, et profils détaillés de vos créateurs préférés.',
      links: [
        { href: '/casinos', text: '🎰 Voir les casinos' },
        { href: '/hunt', text: '🧿 Challenges Hunt' },
        { href: '/shop', text: '🛒 Boutique' }
      ]
    }
  },
  '/hunt': {
    title: 'Hunt — Challenges Casino — LunaLive',
    description: 'Participez aux challenges et hunt casino sur LunaLive. Gagnez des récompenses et progressez.',
    canonical: `${SITE_URL}/hunt`,
    content: {
      h1: 'Challenges Casino — Hunt LunaLive',
      paragraph: 'Participez aux challenges et hunt casino sur LunaLive. Gagnez des récompenses, progressez dans les classements et défiez la communauté.',
      links: [
        { href: '/browse', text: '🧭 Voir les streamers' },
        { href: '/casinos', text: '🎰 Voir les casinos' },
        { href: '/shop', text: '🛒 Boutique' }
      ]
    }
  },
  '/shop': {
    title: 'Shop — Boutique LunaLive',
    description: 'Boutique officielle LunaLive. Découvrez nos produits dérivés et offres exclusives.',
    canonical: `${SITE_URL}/shop`,
    content: {
      h1: 'Boutique Officielle LunaLive',
      paragraph: 'Boutique officielle LunaLive. Découvrez nos produits dérivés, offres exclusives et soutenez vos streamers préférés.',
      links: [
        { href: '/browse', text: '🧭 Voir les streamers' },
        { href: '/casinos', text: '🎰 Voir les casinos' },
        { href: '/event', text: '📅 Événements' }
      ]
    }
  },
  '/event': {
    title: 'Événements — LunaLive',
    description: 'Ne manquez aucun événement LunaLive. Tournois, streams spéciaux et animations.',
    canonical: `${SITE_URL}/event`,
    content: {
      h1: 'Événements LunaLive',
      paragraph: 'Ne manquez aucun événement LunaLive. Tournois, streams spéciaux, animations et rencontres avec la communauté casino.',
      links: [
        { href: '/browse', text: '🧭 Voir les streamers' },
        { href: '/casinos', text: '🎰 Voir les casinos' },
        { href: '/hunt', text: '🧿 Challenges Hunt' }
      ]
    }
  }
};

function generateNoScriptContent(content) {
  return `
    <noscript>
      <div style="font-family: system-ui, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto;">
        <h1 style="color: #7c4dff; margin-bottom: 16px;">${content.h1}</h1>
        <p style="font-size: 16px; line-height: 1.6; margin-bottom: 24px; color: #333;">${content.paragraph}</p>
        <nav>
          <ul style="list-style: none; padding: 0;">
            ${content.links.map(link => `<li style="margin: 10px 0;"><a href="${link.href}" style="color: #7c4dff; text-decoration: none; font-weight: 500;">${link.text}</a></li>`).join('\n            ')}
          </ul>
        </nav>
        <p style="margin-top: 30px; font-size: 14px; color: #666;">
          Pour une expérience complète, veuillez activer JavaScript.
        </p>
      </div>
    </noscript>`;
}

function generateRouteHTML(route, metadata, baseTemplate) {
  let html = baseTemplate;
  
  // Replace metadata
  html = html.replace(/<title>.*?<\/title>/, `<title>${metadata.title}</title>`);
  html = html.replace(/<meta name="description" content=".*?" \/>/, `<meta name="description" content="${metadata.description}" />`);
  html = html.replace(/<link rel="canonical" href=".*?" \/>/, `<link rel="canonical" href="${metadata.canonical}" />`);
  html = html.replace(/<meta property="og:title" content=".*?" \/>/, `<meta property="og:title" content="${metadata.title}" />`);
  html = html.replace(/<meta property="og:description" content=".*?" \/>/, `<meta property="og:description" content="${metadata.description}" />`);
  html = html.replace(/<meta property="og:url" content=".*?" \/>/, `<meta property="og:url" content="${metadata.canonical}" />`);
  html = html.replace(/<meta name="twitter:title" content=".*?" \/>/, `<meta name="twitter:title" content="${metadata.title}" />`);
  html = html.replace(/<meta name="twitter:description" content=".*?" \/>/, `<meta name="twitter:description" content="${metadata.description}" />`);
  
  // Replace noscript content
  const noscriptRegex = /<noscript>[\s\S]*?<\/noscript>/;
  html = html.replace(noscriptRegex, generateNoScriptContent(metadata.content));
  
  return html;
}

async function fetchPublicData() {
  try {
    // Fetch casinos
    const casinosResponse = await fetch(`${API}/casinos?sort=top`, {
      headers: { 'user-agent': 'lunalive-build/1.0' }
    });
    const casinosData = await casinosResponse.json();
    const casinos = casinosData?.casinos || [];
    
    // Fetch streamers
    const streamersResponse = await fetch(`${API}/streamers`, {
      headers: { 'user-agent': 'lunalive-build/1.0' }
    });
    const streamersData = await streamersResponse.json();
    const streamers = Array.isArray(streamersData) ? streamersData : (streamersData?.streamers || streamersData?.items || []);
    
    return { casinos, streamers };
  } catch (error) {
    console.warn('Could not fetch public data:', error?.message || error);
    return { casinos: [], streamers: [] };
  }
}

function generateDynamicRouteHTML(slug, type, baseTemplate) {
  let html = baseTemplate;
  
  if (type === 'casino') {
    const title = `${slug.charAt(0).toUpperCase() + slug.slice(1)} — Casino | LunaLive`;
    const description = `Découvre ${slug} sur LunaLive : avis, notes, bonus et informations détaillées sur ce casino en ligne.`;
    const canonical = `${SITE_URL}/casinos/${slug}`;
    const h1 = `${slug.charAt(0).toUpperCase() + slug.slice(1)} — Casino`;
    const paragraph = `Découvrez ${slug} sur LunaLive : avis de la communauté, notes détaillées, bonus exclusifs et informations complètes sur ce casino en ligne.`;
    
    html = html.replace(/<title>.*?<\/title>/, `<title>${title}</title>`);
    html = html.replace(/<meta name="description" content=".*?" \/>/, `<meta name="description" content="${description}" />`);
    html = html.replace(/<link rel="canonical" href=".*?" \/>/, `<link rel="canonical" href="${canonical}" />`);
    html = html.replace(/<meta property="og:title" content=".*?" \/>/, `<meta property="og:title" content="${title}" />`);
    html = html.replace(/<meta property="og:description" content=".*?" \/>/, `<meta property="og:description" content="${description}" />`);
    html = html.replace(/<meta property="og:url" content=".*?" \/>/, `<meta property="og:url" content="${canonical}" />`);
    html = html.replace(/<meta name="twitter:title" content=".*?" \/>/, `<meta name="twitter:title" content="${title}" />`);
    html = html.replace(/<meta name="twitter:description" content=".*?" \/>/, `<meta name="twitter:description" content="${description}" />`);
    
    const content = {
      h1,
      paragraph,
      links: [
        { href: '/browse', text: '🧭 Voir les streamers' },
        { href: '/casinos', text: '🎰 Tous les casinos' },
        { href: '/hunt', text: '🧿 Challenges Hunt' }
      ]
    };
    
    const noscriptRegex = /<noscript>[\s\S]*?<\/noscript>/;
    html = html.replace(noscriptRegex, generateNoScriptContent(content));
    
  } else if (type === 'streamer') {
    const title = `${slug.charAt(0).toUpperCase() + slug.slice(1)} — Streamer | LunaLive`;
    const description = `Regarde ${slug} en direct sur LunaLive : streams casino, lives et clips de la communauté.`;
    const canonical = `${SITE_URL}/s/${slug}`;
    const h1 = `${slug.charAt(0).toUpperCase() + slug.slice(1)} — Streamer Casino`;
    const paragraph = `Regarde ${slug} en direct sur LunaLive : streams casino, lives en direct, clips VOD et profils détaillés de ce streamer.`;
    
    html = html.replace(/<title>.*?<\/title>/, `<title>${title}</title>`);
    html = html.replace(/<meta name="description" content=".*?" \/>/, `<meta name="description" content="${description}" />`);
    html = html.replace(/<link rel="canonical" href=".*?" \/>/, `<link rel="canonical" href="${canonical}" />`);
    html = html.replace(/<meta property="og:title" content=".*?" \/>/, `<meta property="og:title" content="${title}" />`);
    html = html.replace(/<meta property="og:description" content=".*?" \/>/, `<meta property="og:description" content="${description}" />`);
    html = html.replace(/<meta property="og:url" content=".*?" \/>/, `<meta property="og:url" content="${canonical}" />`);
    html = html.replace(/<meta name="twitter:title" content=".*?" \/>/, `<meta name="twitter:title" content="${title}" />`);
    html = html.replace(/<meta name="twitter:description" content=".*?" \/>/, `<meta name="twitter:description" content="${description}" />`);
    
    const content = {
      h1,
      paragraph,
      links: [
        { href: '/browse', text: '🧭 Tous les streamers' },
        { href: '/casinos', text: '🎰 Voir les casinos' },
        { href: '/event', text: '📅 Événements' }
      ]
    };
    
    const noscriptRegex = /<noscript>[\s\S]*?<\/noscript>/;
    html = html.replace(noscriptRegex, generateNoScriptContent(content));
  }
  
  return html;
}

async function buildStaticRoutes() {
  const distDir = path.join(process.cwd(), 'dist');
  const indexPath = path.join(distDir, 'index.html');
  
  if (!fs.existsSync(indexPath)) {
    console.error('index.html not found. Run build first.');
    process.exit(1);
  }
  
  // Read base template
  const baseTemplate = fs.readFileSync(indexPath, 'utf8');
  
  // Fix encoding
  let html = baseTemplate;
  html = html.replace(/â€"/g, '—');
  html = html.replace(/franÃ§ais/g, 'français');
  html = html.replace(/Ã©vÃ©nements/g, 'événements');
  
  // Write back fixed index.html
  fs.writeFileSync(indexPath, html, 'utf8');
  console.log('Fixed encoding in index.html');
  
  // Generate static route HTML files
  for (const [route, metadata] of Object.entries(staticRouteMetadata)) {
    const routeHTML = generateRouteHTML(route, metadata, html);
    
    if (route === '/') {
      // Homepage is already index.html
      continue;
    }
    
    const filename = `${route.replace(/^\//, '')}.html`;
    const routePath = path.join(distDir, filename);
    fs.writeFileSync(routePath, routeHTML, 'utf8');
    console.log(`Generated ${filename} with route-specific metadata and content`);
  }
  
  // Fetch public data and generate dynamic routes
  const { casinos, streamers } = await fetchPublicData();
  
  // Generate casino pages
  for (const casino of casinos) {
    const slug = String(casino?.slug || '').trim();
    if (!slug) continue;
    
    const casinoHTML = generateDynamicRouteHTML(slug, 'casino', html);
    const filename = `casinos-${slug}.html`;
    const routePath = path.join(distDir, filename);
    fs.writeFileSync(routePath, casinoHTML, 'utf8');
    console.log(`Generated ${filename} for casino ${slug}`);
  }
  
  // Generate streamer pages
  for (const streamer of streamers) {
    const slug = String(streamer?.slug || '').trim();
    if (!slug || slug === 'test' || /^test\d*$/.test(slug) || slug.length < 3) continue;
    
    const streamerHTML = generateDynamicRouteHTML(slug, 'streamer', html);
    const filename = `s-${slug}.html`;
    const routePath = path.join(distDir, filename);
    fs.writeFileSync(routePath, streamerHTML, 'utf8');
    console.log(`Generated ${filename} for streamer ${slug}`);
  }
  
  console.log('Static routes generation completed successfully');
}

buildStaticRoutes().catch(error => {
  console.error('Error building static routes:', error);
  process.exit(1);
});
