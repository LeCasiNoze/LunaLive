// Immediate SEO metadata update for static hosting compatibility
(function() {
  'use strict';
  
  const SITE_URL = 'https://lunalive.onrender.com';
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
        "url": "https://lunalive.onrender.com",
        "inLanguage": "fr",
        "potentialAction": {
          "@type": "SearchAction",
          "target": {
            "@type": "EntryPoint",
            "urlTemplate": "https://lunalive.onrender.com/browse?q={search_term_string}"
          },
          "query-input": "required name=search_term_string"
        }
      },
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "LunaLive",
        "url": "https://lunalive.onrender.com",
        "description": "Plateforme française de streaming casino avec lives en direct, pages casinos, clips et événements",
        "inLanguage": "fr",
        "logo": {
          "@type": "ImageObject",
          "url": "https://lunalive.onrender.com/logo_onglet.png"
        },
        "sameAs": [
          "https://discord.gg/93BFrsBWWB",
          "https://www.youtube.com/@LunaLivePro",
          "https://www.tiktok.com/@lunalive.tv"
        ]
      }
    ];
  }
  
  // Casinos page - ItemList schema
  else if (path === '/casinos') {
    const casinoItems = [
      { name: "Brutalcasino", slug: "brutalcasino" },
      { name: "Hypebet",      slug: "hypebet" },
      { name: "Razed",        slug: "razed" },
      { name: "Trickz",       slug: "trickz" }
    ];
    structuredData = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      "name": "Casinos disponibles sur LunaLive",
      "description": "Liste des meilleurs casinos en ligne testés par la communauté LunaLive",
      "url": "https://lunalive.onrender.com/casinos",
      "itemListElement": casinoItems.map((c, i) => ({
        "@type": "ListItem",
        "position": i + 1,
        "item": {
          "@type": "Organization",
          "name": c.name,
          "url": `https://lunalive.onrender.com/casinos/${c.slug}`
        }
      }))
    };
  }
  
  // Browse page - ItemList schema for streamers (correct ListItem wrappers)
  else if (path === '/browse') {
    structuredData = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      "name": "Streamers Casino sur LunaLive",
      "description": "Liste des streamers casino de la communauté LunaLive",
      "url": "https://lunalive.onrender.com/browse",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "item": {
            "@type": "Person",
            "name": "Lunalive",
            "url": "https://lunalive.onrender.com/s/lunalive"
          }
        },
        {
          "@type": "ListItem",
          "position": 2,
          "item": {
            "@type": "Person",
            "name": "Bigbagutee",
            "url": "https://lunalive.onrender.com/s/bigbagutee"
          }
        },
        {
          "@type": "ListItem",
          "position": 3,
          "item": {
            "@type": "Person",
            "name": "Fabiozsis",
            "url": "https://lunalive.onrender.com/s/fabiozsis"
          }
        }
      ]
    };
  }
  
  // Dynamic casino pages - Organization + BreadcrumbList (top-level array)
  else if (path.startsWith('/casinos/') && path.length > 9) {
    const slug = path.replace('/casinos/', '');
    const name = slug.charAt(0).toUpperCase() + slug.slice(1);
    structuredData = [
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": name,
        "url": `https://lunalive.onrender.com/casinos/${slug}`,
        "description": `Découvrez ${name} sur LunaLive : avis de la communauté, bonus et informations détaillées sur ce casino en ligne.`,
        "inLanguage": "fr"
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Accueil", "item": "https://lunalive.onrender.com/" },
          { "@type": "ListItem", "position": 2, "name": "Casinos", "item": "https://lunalive.onrender.com/casinos" },
          { "@type": "ListItem", "position": 3, "name": name, "item": `https://lunalive.onrender.com/casinos/${slug}` }
        ]
      }
    ];
  }
  
  // Dynamic streamer pages - Person schema
  else if (path.startsWith('/s/') && path.length > 3) {
    const slug = path.replace('/s/', '');
    structuredData = {
      "@context": "https://schema.org",
      "@type": "Person",
      "name": slug.charAt(0).toUpperCase() + slug.slice(1),
      "url": `https://lunalive.onrender.com/s/${slug}`,
      "description": `Regardez ${slug} en direct sur LunaLive : streams casino, lives et clips de la communauté.`,
      "mainEntityOfPage": {
        "@type": "WebPage",
        "name": `${slug} — Streamer Casino`,
        "url": `https://lunalive.onrender.com/s/${slug}`
      },
      "knowsAbout": "Casino streaming",
      "performsIn": {
        "@type": "Event",
        "name": "Live Casino Stream",
        "description": "Stream casino en direct"
      }
    };
  }
  
  // Other static pages - WebPage schema
  else if (metadata) {
    structuredData = {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": metadata.title,
      "url": metadata.canonical,
      "description": metadata.description,
      "isPartOf": {
        "@type": "WebSite",
        "name": "LunaLive",
        "url": "https://lunalive.onrender.com"
      }
    };
  }
  
  // Update the structured data script if we have new data
  if (structuredData) {
    structuredDataScript.textContent = JSON.stringify(structuredData, null, 2);
  }
}
