// Immediate SEO metadata update for static hosting compatibility
(function() {
  'use strict';
  
  const SITE_URL = 'https://lunalive.win';
  const currentPath = window.location.pathname;
  
  // Route metadata mapping
  const routeMetadata = {
    '/': {
      title: 'LunaLive — Plateforme de streaming casino',
      description: 'LunaLive est une plateforme française de streaming casino avec lives en direct, streamers, pages casinos et événements.',
      canonical: `${SITE_URL}/`,
      h1: 'LunaLive — Plateforme de streaming casino',
      paragraph: 'LunaLive est une plateforme française de streaming casino avec lives en direct, streamers, pages casinos et événements.'
    },
    '/casinos': {
      title: 'Casinos — LunaLive',
      description: 'Découvrez les meilleurs casinos en ligne testés par la communauté LunaLive. Avis, bonus et recommandations.',
      canonical: `${SITE_URL}/casinos`,
      h1: 'Casinos disponibles sur LunaLive',
      paragraph: 'Découvrez les meilleurs casinos en ligne testés par la communauté LunaLive. Avis détaillés, bonus exclusifs et recommandations des streamers.'
    },
    '/browse': {
      title: 'Browse — Streamers Casino — LunaLive',
      description: 'Parcourez tous les streamers casino de la communauté LunaLive. Lives, clips et profils détaillés.',
      canonical: `${SITE_URL}/browse`,
      h1: 'Streamers Casino — LunaLive',
      paragraph: 'Parcourez tous les streamers casino de la communauté LunaLive. Lives en direct, clips VOD, et profils détaillés de vos créateurs préférés.'
    },
    '/hunt': {
      title: 'Hunt — Challenges Casino — LunaLive',
      description: 'Participez aux challenges et hunt casino sur LunaLive. Gagnez des récompenses et progressez.',
      canonical: `${SITE_URL}/hunt`,
      h1: 'Challenges Casino — Hunt LunaLive',
      paragraph: 'Participez aux challenges et hunt casino sur LunaLive. Gagnez des récompenses, progressez dans les classements et défiez la communauté.'
    },
    '/shop': {
      title: 'Shop — Boutique LunaLive',
      description: 'Boutique officielle LunaLive. Découvrez nos produits dérivés et offres exclusives.',
      canonical: `${SITE_URL}/shop`,
      h1: 'Boutique Officielle LunaLive',
      paragraph: 'Boutique officielle LunaLive. Découvrez nos produits dérivés, offres exclusives et soutenez vos streamers préférés.'
    },
    '/event': {
      title: 'Événements — LunaLive',
      description: 'Ne manquez aucun événement LunaLive. Tournois, streams spéciaux et animations.',
      canonical: `${SITE_URL}/event`,
      h1: 'Événements LunaLive',
      paragraph: 'Ne manquez aucun événement LunaLive. Tournois, streams spéciaux, animations et rencontres avec la communauté casino.'
    }
  };
  
  // Dynamic route handling
  function getDynamicMetadata(path) {
    // Casino routes
    if (path.startsWith('/casinos/') && path.length > 9) {
      const slug = path.replace('/casinos/', '');
      return {
        title: `${slug.charAt(0).toUpperCase() + slug.slice(1)} — Casino | LunaLive`,
        description: `Découvrez ${slug} sur LunaLive : avis, notes, bonus et informations détaillées sur ce casino en ligne.`,
        canonical: `${SITE_URL}/casinos/${slug}`,
        h1: `${slug.charAt(0).toUpperCase() + slug.slice(1)} — Casino`,
        paragraph: `Découvrez ${slug} sur LunaLive : avis de la communauté, notes détaillées, bonus exclusifs et informations complètes sur ce casino en ligne.`
      };
    }
    
    // Streamer routes
    if (path.startsWith('/s/') && path.length > 3) {
      const slug = path.replace('/s/', '');
      return {
        title: `${slug.charAt(0).toUpperCase() + slug.slice(1)} — Streamer | LunaLive`,
        description: `Regardez ${slug} en direct sur LunaLive : streams casino, lives et clips de la communauté.`,
        canonical: `${SITE_URL}/s/${slug}`,
        h1: `${slug.charAt(0).toUpperCase() + slug.slice(1)} — Streamer Casino`,
        paragraph: `Regardez ${slug} en direct sur LunaLive : streams casino, lives en direct, clips VOD et profils détaillés de ce streamer.`
      };
    }
    
    return null;
  }
  
  // Get metadata for current route
  let metadata = routeMetadata[currentPath];
  if (!metadata) {
    metadata = getDynamicMetadata(currentPath);
  }
  
  // If we have metadata, update the page immediately
  if (metadata) {
    // Update title
    document.title = metadata.title;
    
    // Update meta description
    let descMeta = document.querySelector('meta[name="description"]');
    if (descMeta) {
      descMeta.setAttribute('content', metadata.description);
    }
    
    // Update canonical
    let canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) {
      canonical.setAttribute('href', metadata.canonical);
    }
    
    // Update OpenGraph tags
    let ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) {
      ogTitle.setAttribute('content', metadata.title);
    }
    
    let ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) {
      ogDesc.setAttribute('content', metadata.description);
    }
    
    let ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) {
      ogUrl.setAttribute('content', metadata.canonical);
    }
    
    // Update Twitter tags
    let twitterTitle = document.querySelector('meta[name="twitter:title"]');
    if (twitterTitle) {
      twitterTitle.setAttribute('content', metadata.title);
    }
    
    let twitterDesc = document.querySelector('meta[name="twitter:description"]');
    if (twitterDesc) {
      twitterDesc.setAttribute('content', metadata.description);
    }
    
    // Update noscript content if present
    const noscript = document.querySelector('noscript');
    if (noscript) {
      const h1 = noscript.querySelector('h1');
      if (h1) {
        h1.textContent = metadata.h1;
      }
      
      const p = noscript.querySelector('p');
      if (p) {
        p.textContent = metadata.paragraph;
      }
    }
    
    // Update structured data for route-specific schemas
    updateStructuredData(currentPath, metadata);
  }
})();

// Update structured data based on route
function updateStructuredData(path, metadata) {
  const structuredDataScript = document.getElementById('structured-data');
  if (!structuredDataScript) return;
  
  let structuredData;
  
  // Homepage - WebSite + Organization (array preserving SearchAction)
  if (path === '/') {
    structuredData = [
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": "LunaLive",
        "url": "https://lunalive.win",
        "inLanguage": "fr",
        "potentialAction": {
          "@type": "SearchAction",
          "target": {
            "@type": "EntryPoint",
            "urlTemplate": "https://lunalive.win/browse?q={search_term_string}"
          },
          "query-input": "required name=search_term_string"
        }
      },
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "LunaLive",
        "url": "https://lunalive.win",
        "description": "Plateforme française de streaming casino avec lives en direct, pages casinos, clips et événements",
        "inLanguage": "fr",
        "logo": {
          "@type": "ImageObject",
          "url": "https://lunalive.win/logo.png",
          "width": 714,
          "height": 648
        },
        "sameAs": [
          "https://discord.gg/93BFrsBWWB",
          "https://www.youtube.com/@LunaLivePro",
          "https://www.tiktok.com/@lunalive.tv"
        ]
      }
    ];
  }
  
  // Casinos and Browse pages — keep static CollectionPage schema, no JS override
  else if (path === '/casinos' || path === '/browse') {
    return;
  }

  // Dynamic casino pages - ItemPage (review page) + BreadcrumbList
  else if (path.startsWith('/casinos/') && path.length > 9) {
    const slug = path.replace('/casinos/', '');
    const name = slug.charAt(0).toUpperCase() + slug.slice(1);
    structuredData = [
      {
        "@context": "https://schema.org",
        "@type": "ItemPage",
        "name": `${name} — Avis Casino | LunaLive`,
        "url": `https://lunalive.win/casinos/${slug}`,
        "description": `Découvrez ${name} sur LunaLive : avis de la communauté, bonus et informations détaillées sur ce casino en ligne.`,
        "inLanguage": "fr",
        "isPartOf": {
          "@type": "WebSite",
          "name": "LunaLive",
          "url": "https://lunalive.win"
        }
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Accueil", "item": "https://lunalive.win/" },
          { "@type": "ListItem", "position": 2, "name": "Casinos", "item": "https://lunalive.win/casinos" },
          { "@type": "ListItem", "position": 3, "name": name, "item": `https://lunalive.win/casinos/${slug}` }
        ]
      }
    ];
  }

  // Dynamic streamer pages - Person + BreadcrumbList
  else if (path.startsWith('/s/') && path.length > 3) {
    const slug = path.replace('/s/', '');
    const name = slug.charAt(0).toUpperCase() + slug.slice(1);
    structuredData = [
      {
        "@context": "https://schema.org",
        "@type": "Person",
        "name": name,
        "url": `https://lunalive.win/s/${slug}`,
        "description": `Regardez ${slug} en direct sur LunaLive : streams casino, lives et clips de la communauté.`,
        "knowsAbout": "Casino streaming",
        "mainEntityOfPage": {
          "@type": "WebPage",
          "name": `${name} — Streamer Casino`,
          "url": `https://lunalive.win/s/${slug}`
        }
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Accueil", "item": "https://lunalive.win/" },
          { "@type": "ListItem", "position": 2, "name": "Streamers", "item": "https://lunalive.win/browse" },
          { "@type": "ListItem", "position": 3, "name": name, "item": `https://lunalive.win/s/${slug}` }
        ]
      }
    ];
  }

  // Page-specific types for static pages
  else if (metadata) {
    const pageTypeMap = {
      '/a-propos': 'AboutPage',
      '/contact': 'ContactPage',
      '/mentions-legales': 'WebPage',
      '/politique-de-confidentialite': 'WebPage',
      '/cgu': 'WebPage',
      '/hunt': 'WebPage',
      '/shop': 'WebPage',
      '/event': 'WebPage',
    };
    structuredData = {
      "@context": "https://schema.org",
      "@type": pageTypeMap[path] || "WebPage",
      "name": metadata.title,
      "url": metadata.canonical,
      "description": metadata.description,
      "inLanguage": "fr",
      "isPartOf": {
        "@type": "WebSite",
        "name": "LunaLive",
        "url": "https://lunalive.win"
      }
    };
  }
  
  // Update the structured data script if we have new data
  if (structuredData) {
    structuredDataScript.textContent = JSON.stringify(structuredData, null, 2);
  }
}
