import fs from 'node:fs';
import path from 'node:path';

const SITE_URL = 'https://lunalive.win';

// Route-specific metadata
const routeMetadata = {
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

function fixEncodingAndCreateRoutePages() {
  const distDir = path.join(process.cwd(), 'dist');
  const indexPath = path.join(distDir, 'index.html');
  
  // Read and fix encoding of main index.html
  if (fs.existsSync(indexPath)) {
    let html = fs.readFileSync(indexPath, 'utf8');
    
    // Fix any encoding issues by ensuring proper UTF-8
    html = html.replace(/â€"/g, '—');
    html = html.replace(/franÃ§ais/g, 'français');
    html = html.replace(/Ã©vÃ©nements/g, 'événements');
    
    // Write back with proper UTF-8 encoding
    fs.writeFileSync(indexPath, html, 'utf8');
    console.log('Fixed encoding in index.html');
    
    // Create route-specific HTML files
    for (const [route, metadata] of Object.entries(routeMetadata)) {
      let routeHtml = html;
      
      // Replace metadata for this route
      routeHtml = routeHtml.replace(
        /<title>.*?<\/title>/,
        `<title>${metadata.title}</title>`
      );
      
      routeHtml = routeHtml.replace(
        /<meta name="description" content=".*?" \/>/,
        `<meta name="description" content="${metadata.description}" />`
      );
      
      routeHtml = routeHtml.replace(
        /<link rel="canonical" href=".*?" \/>/,
        `<link rel="canonical" href="${metadata.canonical}" />`
      );
      
      routeHtml = routeHtml.replace(
        /<meta property="og:title" content=".*?" \/>/,
        `<meta property="og:title" content="${metadata.title}" />`
      );
      
      routeHtml = routeHtml.replace(
        /<meta property="og:description" content=".*?" \/>/,
        `<meta property="og:description" content="${metadata.description}" />`
      );
      
      routeHtml = routeHtml.replace(
        /<meta property="og:url" content=".*?" \/>/,
        `<meta property="og:url" content="${metadata.canonical}" />`
      );
      
      routeHtml = routeHtml.replace(
        /<meta name="twitter:title" content=".*?" \/>/,
        `<meta name="twitter:title" content="${metadata.title}" />`
      );
      
      routeHtml = routeHtml.replace(
        /<meta name="twitter:description" content=".*?" \/>/,
        `<meta name="twitter:description" content="${metadata.description}" />`
      );
      
      // Replace the noscript content with route-specific content
      const noscriptRegex = /<noscript>[\s\S]*?<\/noscript>/;
      routeHtml = routeHtml.replace(noscriptRegex, generateNoScriptContent(metadata.content));
      
      // Write route-specific file
      const filename = `${route.replace(/^\//, '')}.html`;
      const routePath = path.join(distDir, filename);
      fs.writeFileSync(routePath, routeHtml, 'utf8');
      console.log(`Created ${filename} with route-specific metadata and content`);
    }
  }
  
  console.log('SEO improvements completed successfully');
}

fixEncodingAndCreateRoutePages();
