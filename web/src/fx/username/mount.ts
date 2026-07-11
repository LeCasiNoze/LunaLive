// Point d'entrée dynamique du moteur (seul module importé via import() par
// AnimatedUsername) : initialise le runtime partagé, construit les
// graphèmes, monte l'effet demandé. Les effets s'enregistrent ici.
import { Container } from "pixi.js";
import { UsernameFxRuntime } from "./runtime";
import { buildGraphemeLayer } from "./graphemes";
import { getEffect, listEffects } from "./registry";
import type { FxContext, FxEffectContext, FxQuality, FxRarity } from "./types";

// ── enregistrement des effets (side-effects) ──
import "./effects/debugWave";
import "./effects/gardenOfAshes";
import "./effects/eveilLunaire";
import "./effects/jackpotDivin";
import "./effects/orageInterieur";
import "./effects/leviathanAbyssal";
import "./effects/forgeCeleste";
import "./effects/nueeObsidienne";
import "./effects/sablierEternite";
import "./effects/spectre";
import "./effects/cristallisation";
import "./effects/coeurDuReacteur";
import "./effects/ufxGlitch";
import "./effects/ufxGalaxy";
import "./effects/ufxClassiques"; // (ufx-ember désenregistré : doublon, verdict Lucas)

export { listEffects };

// ── cadrans-canvas (particules par-dessus les cadrans CSS) ──
import { createFrameFx } from "./effects/frameFx";

export type MountedFrameFx = {
  play(): void;
  pause(): void;
  setVisible(v: boolean): void;
  destroy(): void;
};

export async function mountFrameFx(opts: {
  canvas: HTMLCanvasElement;
  effectId: string;
  width: number;
  height: number;
  quality: FxQuality;
}): Promise<MountedFrameFx | null> {
  const runtime = await UsernameFxRuntime.get();
  const inst = runtime.createInstance(opts.canvas, opts.width, opts.height, opts.quality);
  const handle = createFrameFx(opts.effectId, runtime, inst.stage, opts.width, opts.height);
  if (!handle) {
    inst.destroy();
    return null;
  }
  let destroyed = false;
  return {
    play() {
      inst.playing = true;
      handle.play();
    },
    pause() {
      inst.playing = false;
      handle.pause();
    },
    setVisible(v: boolean) {
      inst.visible = v;
      if (v) handle.play();
      else handle.pause();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      handle.destroy();
      inst.destroy();
    },
  };
}

export type MountedFx = {
  width: number;
  height: number;
  /** padding autour du texte (particules) — pour marges négatives inline */
  padX: number;
  padY: number;
  play(): void;
  pause(): void;
  restart(): void;
  setVisible(v: boolean): void;
  destroy(): void;
};

export async function mountUsernameFx(opts: {
  canvas: HTMLCanvasElement;
  username: string;
  effectId: string;
  fontSize: number;
  quality: FxQuality;
  intensity: number;
  rarity: FxRarity;
  context: FxContext;
}): Promise<MountedFx | null> {
  const factory = getEffect(opts.effectId);
  if (!factory) return null;

  const runtime = await UsernameFxRuntime.get();
  await factory.preload?.(runtime);

  const fontSize = opts.fontSize;
  // place pour les particules : au-dessus/dessous et sur les côtés
  const padX = Math.round(fontSize * (factory.pad?.x ?? 1.4));
  const padY = Math.round(fontSize * (factory.pad?.y ?? 1.2));

  // mesure d'abord avec une zone provisoire, puis dimensionne la vraie zone
  const probe = buildGraphemeLayer(opts.username, fontSize, 0, 0);
  const width = Math.ceil(probe.textWidth) + padX * 2;
  const height = Math.ceil(Math.max(probe.textHeight, fontSize * 1.3)) + padY * 2;
  probe.layer.destroy({ children: true });

  const inst = runtime.createInstance(opts.canvas, width, height, opts.quality);

  const { layer, graphemes } = buildGraphemeLayer(opts.username, fontSize, width, height);
  const behind = new Container(); // couche sous le texte (fumée, racines…)
  const front = new Container(); // couche au-dessus (braises, éclats…)
  inst.stage.addChild(behind, layer, front);

  const ctx: FxEffectContext = {
    runtime,
    stage: inst.stage,
    textLayer: layer,
    behind,
    front,
    graphemes,
    username: opts.username,
    width,
    height,
    fontSize,
    quality: opts.quality,
    intensity: opts.intensity,
    rarity: opts.rarity,
    context: opts.context,
  };
  const handle = factory.create(ctx);

  let destroyed = false;
  return {
    width,
    height,
    padX,
    padY,
    play() {
      inst.playing = true;
      handle.play();
    },
    pause() {
      inst.playing = false;
      handle.pause();
    },
    restart() {
      handle.restart();
    },
    setVisible(v: boolean) {
      inst.visible = v;
      if (v) handle.play();
      else handle.pause();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      handle.destroy();
      inst.destroy();
    },
  };
}

/** compteurs labo */
export async function getFxStats() {
  const rt = await UsernameFxRuntime.get();
  return {
    fps: rt.fps,
    instances: rt.instanceCount,
    particles: rt.liveParticles,
  };
}
