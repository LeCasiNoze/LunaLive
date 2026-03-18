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
  },
  '/a-propos': {
    title: 'À propos de LunaLive — Plateforme streaming casino FR',
    description: 'Découvrez LunaLive : plateforme française de streaming casino en direct, évaluations honnêtes de casinos, challenges Hunt et communauté de streamers.',
    canonical: `${SITE_URL}/a-propos`,
    content: {
      h1: 'À propos de LunaLive',
      richContent: `<p style="font-size:16px;line-height:1.7;margin-bottom:14px;color:#333;">LunaLive est une plateforme française de streaming casino en direct, créée par et pour la communauté. Notre mission : offrir un espace de confiance où les passionnés de casino peuvent regarder leurs streamers préférés jouer en live, découvrir des casinos vérifiés et participer à des événements exclusifs.</p>
      <p style="font-size:15px;line-height:1.7;margin-bottom:14px;color:#444;">Contrairement aux sites d'affiliation classiques, LunaLive publie des évaluations transparentes : chaque casino partenaire est évalué par notre équipe ET par la communauté. Les casinos qui ne respectent pas les joueurs sont signalés avec les raisons précises.</p>
      <p style="font-size:15px;line-height:1.7;margin-bottom:14px;color:#444;">LunaLive propose : des lives casino en direct gratuits, CheckTaSlot pour analyser les sessions de jeu, des Challenges Hunt avec récompenses, une boutique officielle, des événements communautaires et des clips VOD des meilleures sessions.</p>
      <p style="font-size:14px;line-height:1.6;margin-bottom:20px;color:#555;">Tous les contenus sont accessibles librement. Certaines fonctionnalités premium sont disponibles par abonnement. LunaLive est strictement réservé aux personnes majeures (18 ans et plus).</p>`,
      links: [
        { href: '/', text: 'Lives en direct' },
        { href: '/casinos', text: 'Casinos évalués' },
        { href: '/browse', text: 'Streamers casino' },
        { href: '/mentions-legales', text: 'Mentions légales' },
        { href: '/contact', text: 'Contact' }
      ],
      footer: '18+ — Jouez responsable. Joueurs Info Service : 09 74 75 13 13 (appel non surtaxé, 7j/7).'
    }
  },
  '/mentions-legales': {
    title: 'Mentions légales — LunaLive',
    description: 'Mentions légales de LunaLive — plateforme française de streaming casino. Informations sur l\'éditeur, l\'hébergement et les conditions d\'utilisation.',
    canonical: `${SITE_URL}/mentions-legales`,
    content: {
      h1: 'Mentions légales',
      richContent: `<p style="font-size:16px;line-height:1.7;margin-bottom:14px;color:#333;">Conformément aux dispositions de l'article 6 de la loi n°2004-575 du 21 juin 2004 pour la confiance dans l'économie numérique (LCEN), le présent site est édité et exploité par LunaLive.</p>
      <h2 style="font-size:18px;color:#7c4dff;margin:20px 0 10px;">Hébergement</h2>
      <p style="font-size:15px;line-height:1.7;margin-bottom:14px;color:#444;">Le site LunaLive (lunalive.onrender.com) est hébergé par Render Services, Inc. — 525 Brannan St, Suite 300, San Francisco, CA 94107, États-Unis. Site : render.com.</p>
      <h2 style="font-size:18px;color:#7c4dff;margin:20px 0 10px;">Propriété intellectuelle</h2>
      <p style="font-size:15px;line-height:1.7;margin-bottom:14px;color:#444;">L'ensemble des contenus publiés sur LunaLive (textes, images, données communautaires, logos) est protégé par le droit de la propriété intellectuelle. Toute reproduction, représentation ou diffusion sans autorisation expresse est interdite.</p>
      <h2 style="font-size:18px;color:#7c4dff;margin:20px 0 10px;">Données personnelles</h2>
      <p style="font-size:15px;line-height:1.7;margin-bottom:14px;color:#444;">Le traitement des données personnelles est régi par notre Politique de confidentialité, conforme au RGPD (Règlement UE 2016/679) et à la loi française Informatique et Libertés.</p>
      <h2 style="font-size:18px;color:#7c4dff;margin:20px 0 10px;">Jeu responsable</h2>
      <p style="font-size:15px;line-height:1.7;margin-bottom:8px;color:#444;">LunaLive est strictement réservé aux personnes majeures (18 ans et plus). Pour toute aide : Joueurs Info Service au 09 74 75 13 13.</p>`,
      links: [
        { href: '/politique-de-confidentialite', text: 'Politique de confidentialité' },
        { href: '/cgu', text: 'CGU' },
        { href: '/contact', text: 'Contact' },
        { href: '/a-propos', text: 'À propos' }
      ],
      footer: '18+ — Jouez responsable. Joueurs Info Service : 09 74 75 13 13.'
    }
  },
  '/politique-de-confidentialite': {
    title: 'Politique de confidentialité — LunaLive',
    description: 'Politique de confidentialité de LunaLive. Données collectées, droits RGPD, cookies et conservation des données personnelles.',
    canonical: `${SITE_URL}/politique-de-confidentialite`,
    content: {
      h1: 'Politique de confidentialité',
      richContent: `<p style="font-size:16px;line-height:1.7;margin-bottom:14px;color:#333;">LunaLive s'engage à protéger la vie privée de ses utilisateurs conformément au Règlement Général sur la Protection des Données (RGPD — Règlement UE 2016/679) et à la loi française Informatique et Libertés.</p>
      <h2 style="font-size:18px;color:#7c4dff;margin:20px 0 10px;">Données collectées</h2>
      <p style="font-size:15px;line-height:1.7;margin-bottom:14px;color:#444;">LunaLive collecte : adresse e-mail (lors de l'inscription), données de navigation (logs serveur), préférences de contenu. Aucun cookie publicitaire tiers n'est déposé sans consentement explicite.</p>
      <h2 style="font-size:18px;color:#7c4dff;margin:20px 0 10px;">Vos droits</h2>
      <p style="font-size:15px;line-height:1.7;margin-bottom:14px;color:#444;">Conformément au RGPD, vous disposez d'un droit d'accès, de rectification, de suppression (droit à l'oubli), de portabilité et d'opposition concernant vos données personnelles. Pour exercer ces droits, utilisez la page Contact. Vous pouvez également introduire une réclamation auprès de la CNIL (cnil.fr).</p>
      <h2 style="font-size:18px;color:#7c4dff;margin:20px 0 10px;">Conservation des données</h2>
      <p style="font-size:15px;line-height:1.7;margin-bottom:8px;color:#444;">Données de compte : conservées jusqu'à suppression du compte. Logs serveur : 12 mois maximum. Après ce délai, les données sont supprimées ou anonymisées.</p>`,
      links: [
        { href: '/mentions-legales', text: 'Mentions légales' },
        { href: '/cgu', text: 'CGU' },
        { href: '/contact', text: 'Contact' }
      ],
      footer: '18+ — Jouez responsable. CNIL : cnil.fr'
    }
  },
  '/cgu': {
    title: 'Conditions Générales d\'Utilisation — LunaLive',
    description: 'Conditions Générales d\'Utilisation de LunaLive. Accès, comportement utilisateurs, contenu streamers et règles de la plateforme.',
    canonical: `${SITE_URL}/cgu`,
    content: {
      h1: 'Conditions Générales d\'Utilisation',
      richContent: `<p style="font-size:16px;line-height:1.7;margin-bottom:14px;color:#333;">Les présentes Conditions Générales d'Utilisation (CGU) régissent l'accès et l'utilisation de la plateforme LunaLive (lunalive.onrender.com). En accédant à LunaLive, vous acceptez sans réserve les présentes CGU.</p>
      <h2 style="font-size:18px;color:#7c4dff;margin:20px 0 10px;">Conditions d'accès</h2>
      <p style="font-size:15px;line-height:1.7;margin-bottom:14px;color:#444;">L'utilisation de LunaLive est strictement réservée aux personnes majeures (18 ans et plus). En vous inscrivant, vous certifiez avoir l'âge légal requis dans votre pays de résidence pour accéder à des contenus liés aux jeux de casino.</p>
      <h2 style="font-size:18px;color:#7c4dff;margin:20px 0 10px;">Comportement utilisateur</h2>
      <p style="font-size:15px;line-height:1.7;margin-bottom:14px;color:#444;">Il est interdit de publier des contenus illicites, haineux, trompeurs ou portant atteinte aux droits de tiers. LunaLive se réserve le droit de suspendre ou supprimer tout compte ne respectant pas ces règles.</p>
      <h2 style="font-size:18px;color:#7c4dff;margin:20px 0 10px;">Fonctionnalités premium</h2>
      <p style="font-size:15px;line-height:1.7;margin-bottom:8px;color:#444;">Certaines fonctionnalités nécessitent un abonnement payant. Conformément au droit de la consommation français, vous disposez d'un délai de rétractation de 14 jours à compter de la souscription.</p>`,
      links: [
        { href: '/mentions-legales', text: 'Mentions légales' },
        { href: '/politique-de-confidentialite', text: 'Politique de confidentialité' },
        { href: '/contact', text: 'Contact' }
      ],
      footer: '18+ — Jouez responsable. Joueurs Info Service : 09 74 75 13 13.'
    }
  },
  '/contact': {
    title: 'Contact — LunaLive',
    description: 'Contactez LunaLive pour signaler un contenu, exercer vos droits RGPD ou obtenir de l\'aide. Aide au jeu responsable : 09 74 75 13 13.',
    canonical: `${SITE_URL}/contact`,
    content: {
      h1: 'Contact — LunaLive',
      richContent: `<p style="font-size:16px;line-height:1.7;margin-bottom:14px;color:#333;">Pour nous contacter, signaler un contenu illicite ou inapproprié, ou exercer vos droits relatifs à vos données personnelles (accès, rectification, suppression), utilisez le formulaire de signalement disponible sur la plateforme LunaLive.</p>
      <h2 style="font-size:18px;color:#7c4dff;margin:20px 0 10px;">Données personnelles (RGPD)</h2>
      <p style="font-size:15px;line-height:1.7;margin-bottom:14px;color:#444;">Pour exercer vos droits au titre du RGPD (accès, rectification, suppression, portabilité, opposition), contactez-nous via la plateforme. Vous pouvez également adresser une réclamation à la Commission Nationale de l'Informatique et des Libertés (CNIL) : cnil.fr.</p>
      <h2 style="font-size:18px;color:#7c4dff;margin:20px 0 10px;">Aide au jeu responsable</h2>
      <p style="font-size:15px;line-height:1.7;margin-bottom:8px;color:#444;">Si vous ou un proche souffrez d'addiction au jeu, contactez le <strong>Joueurs Info Service au 09 74 75 13 13</strong> (numéro non surtaxé, disponible 7j/7) ou consultez addictaide.fr. L'accès à LunaLive est réservé aux personnes majeures (18 ans et plus).</p>`,
      links: [
        { href: '/mentions-legales', text: 'Mentions légales' },
        { href: '/politique-de-confidentialite', text: 'Politique de confidentialité' },
        { href: '/cgu', text: 'CGU' },
        { href: '/a-propos', text: 'À propos' }
      ],
      footer: '18+ — Joueurs Info Service : 09 74 75 13 13 — addictaide.fr'
    }
  }
};

function generateNoScriptContent(content) {
  const body = content.richContent
    ? content.richContent
    : `<p style="font-size: 16px; line-height: 1.6; margin-bottom: 24px; color: #333;">${content.paragraph}</p>`;
  const footerLine = content.footer
    ? `<p style="margin-top: 20px; font-size: 13px; color: #888;">${content.footer}</p>`
    : `<p style="margin-top: 30px; font-size: 14px; color: #666;">Pour une expérience complète, veuillez activer JavaScript.</p>`;
  return `
    <noscript>
      <div style="font-family: system-ui, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto;">
        <h1 style="color: #7c4dff; margin-bottom: 16px;">${content.h1}</h1>
        ${body}
        <nav>
          <ul style="list-style: none; padding: 0;">
            ${content.links.map(link => `<li style="margin: 10px 0;"><a href="${link.href}" style="color: #7c4dff; text-decoration: none; font-weight: 500;">${link.text}</a></li>`).join('\n            ')}
          </ul>
        </nav>
        ${footerLine}
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
