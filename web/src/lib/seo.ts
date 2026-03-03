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

  upsertMeta("twitter:card", "summary");
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