// api/src/calls/shuffle_images.ts
import { URL } from "url";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\.(?:jpg|jpeg|png|webp))?$/i;

function imgixBase(): string {
  const base = String(process.env.IMG_SHUFFLE_IMGIX_BASE || "https://shuffle-com.imgix.net/").trim();
  return base.endsWith("/") ? base : base + "/";
}

function imgixWidth(): string {
  const w = String(process.env.IMG_SHUFFLE_IMGIX_WIDTH || "256").trim();
  return w || "256";
}

function ensureWidthQs(u: string): string {
  try {
    const url = new URL(u);
    if (!url.searchParams.get("auto")) url.searchParams.set("auto", "format");
    url.searchParams.set("width", imgixWidth());
    return url.toString();
  } catch {
    return u;
  }
}

/**
 * Accepte:
 *  - https://cdn.shuffle.com/images/<uuid>.jpg
 *  - https://shuffle-com.imgix.net/<uuid>[?...]
 *  - <uuid>.jpg  ou  <uuid>
 * Renvoie une URL imgix valide (avec width), sinon null.
 */
export function rewriteShuffleToImgix(uOrFilename: string | null | undefined): string | null {
  const raw = String(uOrFilename || "").trim();
  if (!raw) return null;

  // Déjà une URL ?
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      const url = new URL(raw);
      const host = String(url.hostname || "").toLowerCase();

      // Déjà imgix shuffle => normalise width
      if (host.includes("imgix") && host.includes("shuffle")) {
        return ensureWidthQs(raw);
      }

      // cdn.shuffle.com/images/<uuid>.jpg => imgix/<uuid>?...
      if (host.endsWith("cdn.shuffle.com") || host.endsWith("shuffle.com")) {
        const last = url.pathname.split("/").pop() || "";
        if (UUID_RE.test(last)) {
          const uuidOnly = last.split(".", 1)[0];
          return `${imgixBase()}${uuidOnly}?auto=format&width=${encodeURIComponent(imgixWidth())}`;
        }
      }
    } catch {
      // ignore
    }
  }

  // Nom de fichier ou uuid brut
  const last = raw.split("/").pop() || "";
  if (UUID_RE.test(last)) {
    const uuidOnly = last.split(".", 1)[0];
    return `${imgixBase()}${uuidOnly}?auto=format&width=${encodeURIComponent(imgixWidth())}`;
  }

  return null;
}

export function pickShuffleImage(images: any): string | null {
  if (!images || typeof images !== "object") return null;
  for (const k of ["list", "thumbnail", "cover"]) {
    const v = (images as any)[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/**
 * Extrait et normalise une URL d'image (comme NozeBot).
 * Priorité:
 *  1) node.images.{list,thumbnail,cover}
 *  2) node.image.key (uuid) => imgix
 *  3) fallback legacy via SHUFFLE_IMAGE_FMT si défini
 */
export function shuffleImageFromNode(node: any): string | null {
  if (!node || typeof node !== "object") return null;

  // 1) images{...}
  const img = (node as any).images;
  const picked = pickShuffleImage(img);
  if (picked) {
    const rew = rewriteShuffleToImgix(picked);
    return rew || picked;
  }

  // 2) image.key (uuid)
  const img2 = (node as any).image;
  const key = img2 && typeof img2 === "object" ? (img2 as any).key : null;
  if (typeof key === "string" && key.trim()) {
    const rew = rewriteShuffleToImgix(key.trim());
    if (rew) return rew;

    // 3) fallback legacy
    const fmt = String(process.env.SHUFFLE_IMAGE_FMT || "").trim();
    if (fmt) {
      try {
        const legacy = fmt.replace("{key}", key.trim());
        const rew2 = rewriteShuffleToImgix(legacy);
        return rew2 || legacy;
      } catch {
        // ignore
      }
    }
  }

  return null;
}

export function isGqlValidationError(errMsg: string): boolean {
  const m = String(errMsg || "");
  return (
    m.includes("GRAPHQL_VALIDATION_FAILED") ||
    m.includes("Cannot query field") ||
    m.includes("Unknown argument") ||
    m.includes("Unknown type") ||
    m.includes("Field") && m.includes("must not have a selection") ||
    m.includes("Cannot return null for non-nullable field")
  );
}
