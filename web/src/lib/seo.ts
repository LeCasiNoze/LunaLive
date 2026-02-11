const ORIGIN = "https://lunalive.onrender.com";

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

export function setSeo(opts: {
  title: string;
  description: string;
  path?: string; // "/casinos"
}) {
  const url = ORIGIN + (opts.path ?? "/");
  document.title = opts.title;
  upsertMeta("description", opts.description);
  upsertLink("canonical", url);

  // (optionnel) OpenGraph minimal (pas obligatoire pour indexation)
  let ogTitle = document.querySelector(`meta[property="og:title"]`) as HTMLMetaElement | null;
  if (!ogTitle) {
    ogTitle = document.createElement("meta");
    ogTitle.setAttribute("property", "og:title");
    document.head.appendChild(ogTitle);
  }
  ogTitle.setAttribute("content", opts.title);

  let ogDesc = document.querySelector(`meta[property="og:description"]`) as HTMLMetaElement | null;
  if (!ogDesc) {
    ogDesc = document.createElement("meta");
    ogDesc.setAttribute("property", "og:description");
    document.head.appendChild(ogDesc);
  }
  ogDesc.setAttribute("content", opts.description);

  let ogUrl = document.querySelector(`meta[property="og:url"]`) as HTMLMetaElement | null;
  if (!ogUrl) {
    ogUrl = document.createElement("meta");
    ogUrl.setAttribute("property", "og:url");
    document.head.appendChild(ogUrl);
  }
  ogUrl.setAttribute("content", url);
}
