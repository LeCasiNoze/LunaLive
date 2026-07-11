// Runtime singleton : UN renderer Pixi (multiView) pour TOUTES les instances
// de pseudos animés — jamais un contexte WebGL par pseudo (limite navigateur
// ~8-16 contextes). Chaque instance possède un petit <canvas> cible sans
// contexte propre ; le ticker global rend chaque instance active dedans.
import { autoDetectRenderer, Container, Graphics, Ticker } from "pixi.js";
import type { Renderer, Texture } from "pixi.js";
import { detectQuality, QUALITY_CAPS, QUALITY_FPS } from "./quality";
import type { FxQuality } from "./types";

export type FxInstance = {
  id: number;
  canvas: HTMLCanvasElement;
  stage: Container;
  width: number;
  height: number;
  dpr: number;
  /** rendu uniquement si playing ET visible (IntersectionObserver côté React) */
  playing: boolean;
  visible: boolean;
  /** budget particules de l'instance */
  particleCap: number;
  destroy(): void;
};

let singleton: UsernameFxRuntime | null = null;
let singletonPromise: Promise<UsernameFxRuntime> | null = null;

export class UsernameFxRuntime {
  renderer!: Renderer;
  ticker!: Ticker;
  private instances = new Set<FxInstance>();
  private nextId = 1;
  private textures = new Map<string, Texture>();
  /** compteurs exposés au labo (détection de fuites basique) */
  get instanceCount() {
    return this.instances.size;
  }
  liveParticles = 0;

  static get(): Promise<UsernameFxRuntime> {
    if (singletonPromise) return singletonPromise;
    singletonPromise = (async () => {
      const rt = new UsernameFxRuntime();
      rt.renderer = await autoDetectRenderer({
        width: 64,
        height: 64,
        backgroundAlpha: 0,
        antialias: true,
        multiView: true,
        resolution: 1,
      });
      rt.ticker = new Ticker();
      // 30 fps sur machine modeste : le rendu (blit multiView) est le vrai
      // coût — GSAP continue de tweener à sa cadence, on rend moins souvent
      rt.ticker.maxFPS = QUALITY_FPS[detectQuality()];
      rt.ticker.add(() => rt.renderAll());
      rt.ticker.start();
      singleton = rt;
      return rt;
    })();
    return singletonPromise;
  }

  /** FPS mesuré du ticker global (labo). */
  get fps() {
    return this.ticker ? Math.round(this.ticker.FPS) : 0;
  }

  createInstance(canvas: HTMLCanvasElement, width: number, height: number, quality: FxQuality): FxInstance {
    const dpr = Math.min(window.devicePixelRatio || 1, QUALITY_CAPS[quality].dpr);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const stage = new Container();
    // le stage travaille en coordonnées logiques ; le scale dpr est porté ici
    stage.scale.set(dpr);

    const inst: FxInstance = {
      id: this.nextId++,
      canvas,
      stage,
      width,
      height,
      dpr,
      playing: true,
      visible: true,
      particleCap: QUALITY_CAPS[quality].particles,
      destroy: () => {
        this.instances.delete(inst);
        stage.destroy({ children: true, texture: false });
      },
    };
    this.instances.add(inst);
    return inst;
  }

  private renderAll() {
    if (!this.renderer) return;
    for (const inst of this.instances) {
      if (!inst.playing || !inst.visible) continue;
      const pw = inst.canvas.width;
      const ph = inst.canvas.height;
      if (pw === 0 || ph === 0) continue;
      if (this.renderer.width !== pw || this.renderer.height !== ph) {
        this.renderer.resize(pw, ph);
      }
      // multiView blitte SANS effacer le canvas cible (backgroundAlpha 0 →
      // composite par-dessus l'ancien contenu = traînées fantômes). Clear
      // manuel du target avant chaque rendu.
      const c2d = inst.canvas.getContext("2d");
      if (c2d) c2d.clearRect(0, 0, pw, ph);
      this.renderer.render({ container: inst.stage, target: inst.canvas, clear: true });
    }
  }

  /** Textures procédurales partagées (cachées pour toute la session). */
  getTexture(key: string, draw: (g: Graphics) => void): Texture {
    let tex = this.textures.get(key);
    if (!tex) {
      const g = new Graphics();
      draw(g);
      tex = this.renderer.generateTexture({ target: g, resolution: 2 });
      g.destroy();
      this.textures.set(key, tex);
    }
    return tex;
  }

  /** disque doux (dégradé simulé par cercles concentriques) — braises/fumée/glow */
  softCircleTexture(): Texture {
    return this.getTexture("softCircle", (g) => {
      for (let i = 8; i >= 1; i--) {
        const r = (i / 8) * 16;
        g.circle(16, 16, r).fill({ color: 0xffffff, alpha: 0.16 });
      }
    });
  }

  /** point net — cendres/étincelles */
  dotTexture(): Texture {
    return this.getTexture("dot", (g) => {
      g.circle(4, 4, 3.2).fill({ color: 0xffffff, alpha: 1 });
    });
  }

  /** feuille (ellipse pointue) */
  leafTexture(): Texture {
    return this.getTexture("leaf", (g) => {
      g.moveTo(0, 8)
        .bezierCurveTo(2, 1, 10, 0, 14, 4)
        .bezierCurveTo(10, 10, 3, 11, 0, 8)
        .fill({ color: 0xffffff, alpha: 1 });
    });
  }

  /** pétale rond */
  petalTexture(): Texture {
    return this.getTexture("petal", (g) => {
      g.ellipse(5, 6, 4.4, 5.6).fill({ color: 0xffffff, alpha: 1 });
    });
  }

  /** éclat anguleux (cristaux, débris) */
  shardTexture(): Texture {
    return this.getTexture("shard", (g) => {
      g.moveTo(5, 0).lineTo(10, 7).lineTo(6, 12).lineTo(0, 6).closePath().fill({ color: 0xffffff, alpha: 1 });
    });
  }

  /** anneau fin (trou noir, ondes) */
  ringTexture(): Texture {
    return this.getTexture("ring", (g) => {
      g.circle(10, 10, 8.4).stroke({ width: 1.6, color: 0xffffff, alpha: 1 });
    });
  }

  /** cœur plein */
  heartTexture(): Texture {
    return this.getTexture("heart", (g) => {
      g.circle(6.5, 6, 4.6).fill({ color: 0xffffff, alpha: 1 });
      g.circle(13.5, 6, 4.6).fill({ color: 0xffffff, alpha: 1 });
      g.poly([2.4, 8.4, 17.6, 8.4, 10, 17.5]).fill({ color: 0xffffff, alpha: 1 });
    });
  }

  /** pièce d'or (tranche + face + trait pour lire la rotation) */
  coinTexture(): Texture {
    return this.getTexture("coin", (g) => {
      g.circle(11, 11, 10).fill({ color: 0xb8860b, alpha: 1 });
      g.circle(11, 11, 8.6).fill({ color: 0xffd85e, alpha: 1 });
      g.circle(11, 11, 5.6).stroke({ width: 1.2, color: 0xc9940f, alpha: 1 });
      g.moveTo(11, 3.5).lineTo(11, 8).stroke({ width: 1.6, color: 0xfff3c4, alpha: 0.95 });
    });
  }
}

/** accès synchrone (après init) — labo/compteurs */
export function getRuntimeSync(): UsernameFxRuntime | null {
  return singleton;
}
