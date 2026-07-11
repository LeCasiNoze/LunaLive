// Découpage du pseudo par GRAPHÈME (accents, Unicode, emojis ZWJ) et
// construction d'un Pixi.Text par graphème, centré dans la zone.
import { Container, Text, TextStyle } from "pixi.js";
import type { FxGrapheme } from "./types";

/** Intl.Segmenter quand dispo, sinon Array.from (code points — couvre
    accents précomposés et emojis simples ; les ZWJ complexes seront
    éclatés, acceptable en fallback). */
export function splitGraphemes(s: string): string[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Seg = (Intl as any)?.Segmenter;
    if (Seg) {
      const seg = new Seg(undefined, { granularity: "grapheme" });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return Array.from(seg.segment(s), (x: any) => x.segment as string);
    }
  } catch {
    /* fallback */
  }
  return Array.from(s);
}

// Même stack que --ll-font-body (00_tokens.css) : le pseudo canvas doit
// matcher le pseudo DOM du chat.
const FONT_STACK = "system-ui, -apple-system, 'Segoe UI', sans-serif";

export type GraphemeLayout = {
  layer: Container;
  graphemes: FxGrapheme[];
  textWidth: number;
  textHeight: number;
};

/**
 * Crée un Text par graphème, positionne le tout sur une baseline commune
 * et centre le bloc dans (areaWidth × areaHeight).
 * anchor des Text = (0.5, 0.5) → les effets peuvent scaler/roter par lettre
 * autour de son centre sans recalcul.
 */
export function buildGraphemeLayer(
  username: string,
  fontSize: number,
  areaWidth: number,
  areaHeight: number,
  // ⚠ le stage est scalé ×dpr : sans résolution ≥ dpr le texte est
  // rasterisé à 1× puis upscalé = FLOU (bug qualité chat, 11 juil)
  resolution = 1,
): GraphemeLayout {
  const style = new TextStyle({
    fontFamily: FONT_STACK,
    fontSize,
    // même graisse que .chatUsername (950) — 800 rendait plus maigre/sale
    fontWeight: "950" as never,
    fill: 0xffffff,
  });

  const layer = new Container();
  const parts = splitGraphemes(username);
  const graphemes: FxGrapheme[] = [];

  let x = 0;
  let maxH = 0;
  const measured: { t: Text; w: number; h: number }[] = [];
  for (const part of parts) {
    const t = new Text({ text: part, style, resolution: Math.max(1, resolution) });
    t.anchor.set(0.5, 0.5);
    measured.push({ t, w: t.width, h: t.height });
    maxH = Math.max(maxH, t.height);
  }
  const midY = 0; // baseline visuelle : centres alignés (anchor 0.5)
  for (let i = 0; i < measured.length; i++) {
    const { t, w } = measured[i];
    const cx = x + w / 2;
    t.position.set(cx, midY);
    layer.addChild(t);
    graphemes.push({ text: t, homeX: cx, homeY: midY, index: i });
    x += w;
  }

  // centre le bloc dans la zone
  layer.position.set((areaWidth - x) / 2, areaHeight / 2);

  return { layer, graphemes, textWidth: x, textHeight: maxH };
}
