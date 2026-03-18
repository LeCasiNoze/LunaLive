const ORIGIN =
  typeof window !== "undefined"
    ? window.location.origin
    : "https://lunalive.onrender.com";

const DEFAULT_OG_IMAGE = `${ORIGIN}/logo_onglet.png`;

function upsertMeta(name: string, content: string) {
  if (!content) return;

  let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }

  el.setAttribute("content", content);
}

function upsertLink(rel: string, href: string) {
  if (!href) return;

  let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }

  el.setAttribute("href", href);
}

function upsertOg(prop: string, content: string) {
  if (!content) return;

  let el = document.querySelector(`meta[property="${prop}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", prop);
    document.head.appendChild(el);
  }

  el.setAttribute("content", content);
}

export function setSeo(opts: {
  title: string;
  description: string;
  path?: string;
  image?: string;
  robots?: string;
}) {
  const url = new URL(opts.path ?? "/", ORIGIN).toString();
  const image = opts.image ? new URL(opts.image, ORIGIN).toString() : DEFAULT_OG_IMAGE;
  const robots = opts.robots ?? "index,follow";

  document.title = opts.title;

  upsertMeta("description", opts.description);
  upsertMeta("robots", robots);

  upsertMeta("twitter:card", "summary_large_image");
  upsertMeta("twitter:title", opts.title);
  upsertMeta("twitter:description", opts.description);
  upsertMeta("twitter:image", image);

  upsertLink("canonical", url);

  upsertOg("og:type", "website");
  upsertOg("og:site_name", "LunaLive");
  upsertOg("og:title", opts.title);
  upsertOg("og:description", opts.description);
  upsertOg("og:url", url);
  upsertOg("og:image", image);
}

// New function for dynamic route fallback SEO
export function setDynamicRouteSeo(route: string, data?: any) {
  // Dynamic casino pages
  if (route.startsWith('/casinos/') && route.length > 9) {
    const slug = route.replace('/casinos/', '');
    if (data?.casino?.name) {
      setSeo({
        title: `${data.casino.name} — Avis et note casino | LunaLive`,
        description: `Découvre ${data.casino.name} sur LunaLive : note LunaLive, avis de la communauté, bonus et informations détaillées.`,
        path: `/casinos/${slug}`,
      });
    } else {
      setSeo({
        title: `${slug.charAt(0).toUpperCase() + slug.slice(1)} — Casino | LunaLive`,
        description: `Découvre ${slug} sur LunaLive : avis, notes, bonus et informations détaillées sur ce casino en ligne.`,
        path: `/casinos/${slug}`,
      });
    }
    return;
  }

  // Dynamic streamer pages
  if (route.startsWith('/s/') && route.length > 3) {
    const slug = route.replace('/s/', '');
    if (data?.displayName) {
      setSeo({
        title: `${data.displayName} — Streamer Casino | LunaLive`,
        description: `Regarde ${data.displayName} en direct sur LunaLive : lives casino, clips VOD, et profils détaillés.`,
        path: `/s/${slug}`,
      });
    } else {
      setSeo({
        title: `${slug.charAt(0).toUpperCase() + slug.slice(1)} — Streamer | LunaLive`,
        description: `Regarde ${slug} en direct sur LunaLive : streams casino, lives et clips de la communauté.`,
        path: `/s/${slug}`,
      });
    }
    return;
  }

  // Fallback for other dynamic routes
  setSeo({
    title: "LunaLive — Plateforme de streaming casino",
    description: "LunaLive est une plateforme française de streaming casino avec lives en direct, streamers, pages casinos et événements.",
    path: route,
  });
}