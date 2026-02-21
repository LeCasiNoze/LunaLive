const ORIGIN = typeof window !== "undefined" ? window.location.origin : "https://lunalive.onrender.com";

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

export function setSeo(opts: { title: string; description: string; path?: string }) {
  const url = new URL(opts.path ?? "/", ORIGIN).toString();

  document.title = opts.title;
  upsertMeta("description", opts.description);
  upsertLink("canonical", url);

  // OG
  const upsertOg = (prop: string, content: string) => {
    if (!content) return;
    let el = document.querySelector(`meta[property="${prop}"]`) as HTMLMetaElement | null;
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute("property", prop);
      document.head.appendChild(el);
    }
    el.setAttribute("content", content);
  };

  upsertOg("og:title", opts.title);
  upsertOg("og:description", opts.description);
  upsertOg("og:url", url);
}