// Pool de particules réutilisables — jamais de création incontrôlée de
// sprites : cap par instance (budget qualité), release systématique.
import { Container, Sprite, Texture } from "pixi.js";
import type { UsernameFxRuntime } from "./runtime";

export class ParticlePool {
  private free: Sprite[] = [];
  private live = new Set<Sprite>();
  private runtime: UsernameFxRuntime;
  private layer: Container;
  private cap: number;

  constructor(runtime: UsernameFxRuntime, layer: Container, cap: number) {
    this.runtime = runtime;
    this.layer = layer;
    this.cap = cap;
  }

  get liveCount() {
    return this.live.size;
  }

  setCap(cap: number) {
    this.cap = cap;
  }

  /** null si le budget est atteint — l'effet doit dégrader gracieusement. */
  spawn(texture: Texture): Sprite | null {
    if (this.live.size >= this.cap) return null;
    let s = this.free.pop();
    if (!s) {
      s = new Sprite(texture);
      s.anchor.set(0.5);
    } else {
      s.texture = texture;
    }
    s.visible = true;
    s.alpha = 1;
    s.rotation = 0;
    s.scale.set(1);
    s.tint = 0xffffff;
    s.blendMode = "normal";
    this.layer.addChild(s);
    this.live.add(s);
    this.runtime.liveParticles++;
    return s;
  }

  release(s: Sprite) {
    if (!this.live.has(s)) return;
    this.live.delete(s);
    this.runtime.liveParticles--;
    s.visible = false;
    this.layer.removeChild(s);
    this.free.push(s);
  }

  releaseAll() {
    for (const s of Array.from(this.live)) this.release(s);
  }

  destroy() {
    this.releaseAll();
    for (const s of this.free) s.destroy();
    this.free.length = 0;
  }
}
