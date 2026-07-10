// Système d'animations d'armes du boss — style "sakuga" : chaque arme est
// une mini-cinématique (anticipation → frappe → impact), inspirée des
// animations japonaises (slash dimensionnel type Black Clover, explosions
// apocalyptiques). Séparé de BossScene pour la lisibilité ; embarqué dans
// le même chunk lazy (jamais dans le bundle principal).
import * as THREE from "three";
import React from "react";
import { useFrame } from "@react-three/fiber";
import { Trail } from "@react-three/drei";
import type { BossWeaponAnim } from "./weapons";

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIn = (t: number) => t * t;

// Point d'impact sur le boss (aligné avec BossScene.TARGET).
const TARGET = new THREE.Vector3(0, 0, 0.4);

export type FxItem = { id: number; type: BossWeaponAnim; start: number; power: number };
type FxProps = { fx: FxItem; onDone: (id: number) => void; low: boolean };

// Texture radiale (glow) générée une fois par teinte demandée.
const radialTexCache = new Map<string, THREE.CanvasTexture>();
function radialTex(rgb: string): THREE.CanvasTexture {
  let tex = radialTexCache.get(rgb);
  if (tex) return tex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, `rgba(${rgb},0.95)`);
  grad.addColorStop(0.4, `rgba(${rgb},0.35)`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  tex = new THREE.CanvasTexture(c);
  radialTexCache.set(rgb, tex);
  return tex;
}

// Texture de lame (gradient longitudinal, cœur blanc → bords transparents).
let bladeTexSingleton: THREE.CanvasTexture | null = null;
function bladeTex(): THREE.CanvasTexture {
  if (bladeTexSingleton) return bladeTexSingleton;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, "rgba(200,225,255,0)");
  grad.addColorStop(0.42, "rgba(235,245,255,0.85)");
  grad.addColorStop(0.5, "rgba(255,255,255,1)");
  grad.addColorStop(0.58, "rgba(235,245,255,0.85)");
  grad.addColorStop(1, "rgba(200,225,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 64);
  bladeTexSingleton = new THREE.CanvasTexture(c);
  return bladeTexSingleton;
}

// Flash plein écran (plane face caméra, hors depth) — l'arme parent anime
// l'opacité de son matériau via la ref.
const FlashPlane = React.forwardRef<THREE.MeshBasicMaterial, { color?: string }>(function FlashPlane(
  { color = "#ffffff" },
  ref
) {
  return (
    <mesh position={[0, 0, 3.4]} renderOrder={999}>
      <planeGeometry args={[24, 14]} />
      <meshBasicMaterial ref={ref} color={color} transparent opacity={0} depthWrite={false} depthTest={false} toneMapped={false} />
    </mesh>
  );
});

// Débris balistiques réutilisables : n fragments éjectés depuis un point.
function useDebris(n: number) {
  const refs = React.useRef<THREE.Mesh[]>([]);
  const cfg = React.useMemo(
    () =>
      Array.from({ length: n }, () => ({
        dir: new THREE.Vector3(rand(-1, 1), rand(0.2, 1.2), rand(-0.4, 1)).normalize(),
        speed: rand(2.2, 5),
        spin: rand(2, 7),
        scale: rand(0.06, 0.16),
      })),
    [n]
  );
  const update = (from: THREE.Vector3, p: number, fade: number) => {
    for (let i = 0; i < cfg.length; i++) {
      const m = refs.current[i];
      if (!m) continue;
      const d = cfg[i];
      m.visible = p > 0 && fade < 1;
      if (!m.visible) continue;
      m.position.set(
        from.x + d.dir.x * d.speed * p,
        from.y + d.dir.y * d.speed * p - 3.4 * p * p, // gravité
        from.z + d.dir.z * d.speed * p
      );
      m.rotation.x += 0.1 * d.spin * 0.1;
      m.rotation.y += 0.08 * d.spin * 0.1;
      (m.material as THREE.MeshBasicMaterial).opacity = 1 - fade;
      m.scale.setScalar(d.scale * (1 - fade * 0.5));
    }
  };
  const nodes = (color: string) => (
    <>
      {cfg.map((d, i) => (
        <mesh
          key={i}
          ref={(el) => {
            if (el) refs.current[i] = el as THREE.Mesh;
          }}
          scale={d.scale}
          visible={false}
        >
          <octahedronGeometry args={[1, 0]} />
          <meshBasicMaterial color={color} transparent toneMapped={false} />
        </mesh>
      ))}
    </>
  );
  return { update, nodes };
}

// ── 🔫 Balle : muzzle flash → tracer → étincelles d'impact ────────────
const GUN_MUZZLE = new THREE.Vector3(-2.6, -1.8, 3.2);

function BulletFx({ fx, onDone, low }: FxProps) {
  const dur = 0.62;
  const ball = React.useRef<THREE.Mesh>(null!);
  const muzzle = React.useRef<THREE.Mesh>(null!);
  const flash = React.useRef<THREE.Mesh>(null!);
  const light = React.useRef<THREE.PointLight>(null!);
  const sparks = useDebris(low ? 5 : 9);
  const hitAt = 0.48; // fraction de dur — cf ATTACK_IMPACT_DELAY.bullet
  useFrame((s) => {
    const p = clamp01((s.clock.elapsedTime - fx.start) / dur);
    if (muzzle.current) {
      const mp = clamp01(p / 0.1);
      muzzle.current.position.copy(GUN_MUZZLE);
      muzzle.current.scale.setScalar(0.001 + (1 - mp) * 0.5);
      (muzzle.current.material as THREE.MeshBasicMaterial).opacity = p < 0.1 ? 1 - mp : 0;
    }
    if (ball.current) {
      const tp = clamp01(p / hitAt);
      ball.current.position.lerpVectors(GUN_MUZZLE, TARGET, easeIn(tp));
      ball.current.scale.setScalar(p < hitAt ? 0.11 : 0.001);
    }
    const ip = clamp01((p - hitAt) / (1 - hitAt));
    if (flash.current) {
      flash.current.position.copy(TARGET);
      flash.current.scale.setScalar(0.001 + easeOut(ip) * 0.8);
      (flash.current.material as THREE.MeshBasicMaterial).opacity = p > hitAt ? 1 - ip : 0;
    }
    sparks.update(TARGET, ip * 0.5, ip);
    if (light.current) light.current.intensity = p < 0.1 ? 40 : p > hitAt ? (1 - ip) * 70 : 0;
    if (p >= 1) onDone(fx.id);
  });
  return (
    <>
      <mesh ref={muzzle} visible>
        <sphereGeometry args={[1, 10, 10]} />
        <meshBasicMaterial color="#ffe9b0" transparent toneMapped={false} />
      </mesh>
      {low ? (
        <mesh ref={ball}>
          <sphereGeometry args={[1, 10, 10]} />
          <meshBasicMaterial color="#fff0c0" toneMapped={false} />
        </mesh>
      ) : (
        <Trail width={1.1} length={3} color="#ffcf8a" decay={3} attenuation={(w) => w}>
          <mesh ref={ball}>
            <sphereGeometry args={[1, 10, 10]} />
            <meshBasicMaterial color="#fff0c0" toneMapped={false} />
          </mesh>
        </Trail>
      )}
      <mesh ref={flash}>
        <sphereGeometry args={[1, 14, 14]} />
        <meshBasicMaterial color="#ffd08a" transparent toneMapped={false} />
      </mesh>
      {sparks.nodes("#ffe9b0")}
      <pointLight ref={light} position={[0, 0, 1]} intensity={0} color="#ffcf8a" distance={8} decay={2} />
    </>
  );
}

// ── 🚀 Roquette : verrouillage → missile à tête chercheuse → déflagration ──
const ROCKET_P0 = new THREE.Vector3(-3.4, -2.3, 2.4);
const ROCKET_P1 = new THREE.Vector3(-2.6, 2.8, 1.0);

function bezier(out: THREE.Vector3, p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, t: number) {
  const a = (1 - t) * (1 - t);
  const b = 2 * (1 - t) * t;
  const c = t * t;
  out.set(
    a * p0.x + b * p1.x + c * p2.x,
    a * p0.y + b * p1.y + c * p2.y,
    a * p0.z + b * p1.z + c * p2.z
  );
  return out;
}

// Trajectoire façon dragon (demande Lucas) : montée en Bézier, puis spirale
// d'orbite qui se resserre autour du boss, puis piqué final sur la cible.
const ROCKET_ORBIT_A0 = 2.4; // angle d'entrée en orbite
function rocketPath(out: THREE.Vector3, u: number, tmpB: THREE.Vector3) {
  const entry = tmpB.set(Math.cos(ROCKET_ORBIT_A0) * 2.3, 0.9, Math.sin(ROCKET_ORBIT_A0) * 1.84 + 0.3);
  if (u < 0.35) {
    // montée : Bézier P0 → détour haut → point d'entrée d'orbite
    const k = u / 0.35;
    return bezier(out, ROCKET_P0, ROCKET_P1, entry, easeIn(k));
  }
  if (u < 0.8) {
    // orbite : un tour et quart en se resserrant, léger serpentin vertical
    const k = (u - 0.35) / 0.45;
    const ang = ROCKET_ORBIT_A0 + k * Math.PI * 2 * 1.2;
    const r = 2.3 - k * 1.1;
    return out.set(Math.cos(ang) * r, 0.9 - k * 0.65 + Math.sin(k * 14) * 0.08, Math.sin(ang) * r * 0.8 + 0.3);
  }
  // piqué final sur la cible
  const k = (u - 0.8) / 0.2;
  const ang = ROCKET_ORBIT_A0 + Math.PI * 2 * 1.2;
  out.set(Math.cos(ang) * 1.2, 0.25, Math.sin(ang) * 0.96 + 0.3);
  return out.lerp(TARGET, easeIn(k));
}

function RocketFx({ fx, onDone, low }: FxProps) {
  const dur = 2.6;
  const lockAt = 0.24; // fin du verrouillage
  const hitAt = 0.62; // impact — cf ATTACK_IMPACT_DELAY.rocket
  const reticle = React.useRef<THREE.Group>(null!);
  const missile = React.useRef<THREE.Group>(null!);
  const smoke = React.useRef<THREE.Mesh[]>([]);
  const smokeCount = low ? 8 : 16;
  const core = React.useRef<THREE.Mesh>(null!);
  const shell = React.useRef<THREE.Mesh>(null!);
  const shell2 = React.useRef<THREE.Mesh>(null!);
  const ring = React.useRef<THREE.Mesh>(null!);
  const light = React.useRef<THREE.PointLight>(null!);
  const debris = useDebris(low ? 5 : 10);
  const tmp = React.useMemo(() => new THREE.Vector3(), []);
  const tmp2 = React.useMemo(() => new THREE.Vector3(), []);

  useFrame((s) => {
    const t = s.clock.elapsedTime;
    const p = clamp01((t - fx.start) / dur);

    // — verrouillage : réticule qui se resserre en clignotant, fixe au lock
    if (reticle.current) {
      const rp = clamp01(p / lockAt);
      const locked = p >= lockAt;
      reticle.current.visible = p < hitAt;
      reticle.current.position.set(TARGET.x, TARGET.y, TARGET.z + 0.5);
      reticle.current.rotation.z = locked ? 0 : t * 3;
      reticle.current.scale.setScalar(locked ? 1 : 2.1 - rp * 1.1);
      const blink = locked ? 1 : Math.sin(t * 26) > 0 ? 1 : 0.25;
      reticle.current.children.forEach((c) => {
        const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial;
        m.opacity = (locked ? 1 : 0.8) * blink * (p < hitAt ? 1 : 0);
      });
    }

    // — vol : montée → spirale d'orbite autour du boss → piqué (cf rocketPath)
    const fp = clamp01((p - lockAt) / (hitAt - lockAt));
    if (missile.current) {
      missile.current.visible = p >= lockAt && p < hitAt;
      if (missile.current.visible) {
        const bTmp = missile.current.userData.bTmp ?? (missile.current.userData.bTmp = new THREE.Vector3());
        rocketPath(tmp, fp, bTmp);
        rocketPath(tmp2, Math.min(1, fp + 0.015), bTmp);
        missile.current.position.copy(tmp);
        missile.current.lookAt(tmp2);
        // fumée : pool circulaire déposé le long du chemin
        const idx = Math.floor(fp * smokeCount * 1.6) % smokeCount;
        const sm = smoke.current[idx];
        if (sm && !sm.visible) {
          sm.visible = true;
          sm.position.copy(tmp);
          sm.userData.born = t;
        }
      }
    }
    for (const sm of smoke.current) {
      if (!sm || !sm.visible) continue;
      const age = t - (sm.userData.born ?? t);
      const life = clamp01(age / 0.9);
      sm.scale.setScalar(0.1 + life * 0.55);
      (sm.material as THREE.MeshBasicMaterial).opacity = (1 - life) * 0.42;
      if (life >= 1) sm.visible = false;
    }

    // — déflagration : noyau blanc + double coquille + onde + débris
    const ep = clamp01((p - hitAt) / (1 - hitAt));
    if (core.current) {
      core.current.position.copy(TARGET);
      core.current.scale.setScalar(0.001 + easeOut(Math.min(1, ep * 2.2)) * 1.5);
      (core.current.material as THREE.MeshBasicMaterial).opacity = ep > 0 ? Math.max(0, 1 - ep * 1.6) : 0;
    }
    if (shell.current) {
      shell.current.position.copy(TARGET);
      shell.current.scale.setScalar(0.001 + easeOut(ep) * 2.8);
      (shell.current.material as THREE.MeshBasicMaterial).opacity = ep > 0 ? (1 - ep) * 0.85 : 0;
    }
    if (shell2.current) {
      shell2.current.position.copy(TARGET);
      shell2.current.scale.setScalar(0.001 + easeOut(clamp01(ep * 1.2)) * 3.6);
      (shell2.current.material as THREE.MeshBasicMaterial).opacity = ep > 0 ? (1 - ep) * 0.4 : 0;
    }
    if (ring.current) {
      ring.current.position.copy(TARGET);
      ring.current.scale.setScalar(0.001 + easeOut(ep) * 4.6);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = ep > 0 ? (1 - ep) * 0.8 : 0;
    }
    debris.update(TARGET, ep, ep);
    if (light.current) light.current.intensity = ep > 0 ? (1 - ep) * 320 : 0;
    if (p >= 1) onDone(fx.id);
  });

  return (
    <>
      {/* réticule de verrouillage : anneau + 4 coins */}
      <group ref={reticle}>
        <mesh>
          <ringGeometry args={[0.78, 0.86, 40]} />
          <meshBasicMaterial color="#ff4d4d" transparent toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} rotation={[0, 0, (i * Math.PI) / 2]} position={[Math.cos((i * Math.PI) / 2 + Math.PI / 4) * 1.05, Math.sin((i * Math.PI) / 2 + Math.PI / 4) * 1.05, 0]}>
            <planeGeometry args={[0.3, 0.06]} />
            <meshBasicMaterial color="#ff4d4d" transparent toneMapped={false} side={THREE.DoubleSide} />
          </mesh>
        ))}
      </group>
      {/* missile : corps + nez + tuyère */}
      {low ? (
        <group ref={missile} visible={false}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.07, 0.09, 0.5, 10]} />
            <meshBasicMaterial color="#d8dee9" toneMapped={false} />
          </mesh>
          <mesh position={[0, 0, 0.34]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.09, 0.2, 10]} />
            <meshBasicMaterial color="#ff5a1f" toneMapped={false} />
          </mesh>
        </group>
      ) : (
        <Trail width={2.2} length={4} color="#ffb066" decay={2.2} attenuation={(w) => w}>
          <group ref={missile} visible={false}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.07, 0.09, 0.5, 10]} />
              <meshBasicMaterial color="#d8dee9" toneMapped={false} />
            </mesh>
            <mesh position={[0, 0, 0.34]} rotation={[Math.PI / 2, 0, 0]}>
              <coneGeometry args={[0.09, 0.2, 10]} />
              <meshBasicMaterial color="#ff5a1f" toneMapped={false} />
            </mesh>
            <mesh position={[0, 0, -0.3]} rotation={[Math.PI / 2, 0, 0]}>
              <coneGeometry args={[0.06, 0.22, 8]} />
              <meshBasicMaterial color="#ffe9b0" transparent opacity={0.9} toneMapped={false} />
            </mesh>
          </group>
        </Trail>
      )}
      {/* fumée */}
      {Array.from({ length: smokeCount }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            if (el) smoke.current[i] = el as THREE.Mesh;
          }}
          visible={false}
        >
          <sphereGeometry args={[1, 8, 8]} />
          <meshBasicMaterial color="#9aa0ab" transparent opacity={0.4} toneMapped={false} depthWrite={false} />
        </mesh>
      ))}
      {/* explosion */}
      <mesh ref={core}>
        <sphereGeometry args={[1, 20, 20]} />
        <meshBasicMaterial color="#fff6dc" transparent toneMapped={false} />
      </mesh>
      <mesh ref={shell}>
        <sphereGeometry args={[1, 20, 20]} />
        <meshBasicMaterial color="#ff7a1a" transparent toneMapped={false} />
      </mesh>
      <mesh ref={shell2}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial color="#b91c1c" transparent toneMapped={false} />
      </mesh>
      <mesh ref={ring} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1, 0.05, 8, 48]} />
        <meshBasicMaterial color="#ffd08a" transparent toneMapped={false} />
      </mesh>
      {debris.nodes("#3a2a22")}
      <pointLight ref={light} position={[0, 0.4, 1.2]} intensity={0} color="#ff7a1a" distance={16} decay={1.8} />
    </>
  );
}

// ── ⚔️ Sabre dimensionnel : dim → lame diagonale géante → entaille ─────
// Réf : slash d'énergie type anime (lame qui traverse tout l'écran en
// diagonale, flash au contact, ligne de coupe incandescente qui persiste).
const SLASH_ANGLE = -0.62; // rad, diagonale haut-droite → bas-gauche
const SLASH_NORM = new THREE.Vector3(-Math.sin(SLASH_ANGLE), Math.cos(SLASH_ANGLE), 0); // direction du balayage

function SlashFx({ fx, onDone, low }: FxProps) {
  const dur = 1.6;
  const hitAt = 0.4; // contact — cf ATTACK_IMPACT_DELAY.slash
  const dim = React.useRef<THREE.MeshBasicMaterial>(null!);
  const blades = React.useRef<THREE.Mesh[]>([]);
  const cut = React.useRef<THREE.Mesh>(null!);
  const cutGlow = React.useRef<THREE.Mesh>(null!);
  const flash = React.useRef<THREE.MeshBasicMaterial>(null!);
  const light = React.useRef<THREE.PointLight>(null!);
  const sparks = useDebris(low ? 6 : 12);
  const ghosts = low ? 1 : 3;
  const tmp = React.useMemo(() => new THREE.Vector3(), []);

  useFrame((s) => {
    const p = clamp01((s.clock.elapsedTime - fx.start) / dur);

    // anticipation : la scène s'assombrit
    if (dim.current) {
      const dp = clamp01(p / 0.22);
      const rel = clamp01((p - hitAt) / 0.2);
      dim.current.opacity = 0.5 * easeOut(dp) * (1 - rel);
    }

    // balayage : la lame traverse en diagonale (0.22 → 0.46), ghosts décalés
    for (let i = 0; i < ghosts; i++) {
      const b = blades.current[i];
      if (!b) continue;
      const bp = clamp01((p - 0.22 - i * 0.028) / 0.2);
      b.visible = bp > 0 && bp < 1;
      if (!b.visible) continue;
      const sweep = -4.6 + easeOut(bp) * 9.2; // le long de la normale
      tmp.copy(SLASH_NORM).multiplyScalar(sweep);
      b.position.set(TARGET.x + tmp.x, TARGET.y + tmp.y, TARGET.z + 0.55);
      (b.material as THREE.MeshBasicMaterial).opacity = (1 - i * 0.3) * Math.sin(bp * Math.PI);
    }

    // contact : flash écran + étincelles perpendiculaires
    const ip = clamp01((p - hitAt) / 0.16);
    if (flash.current) flash.current.opacity = p > hitAt ? (1 - ip) * 0.85 : 0;
    if (light.current) light.current.intensity = p > hitAt ? (1 - ip) * 260 : 0;
    sparks.update(TARGET, clamp01((p - hitAt) / 0.5), clamp01((p - hitAt) / 0.5));

    // entaille : ligne incandescente sur la diagonale, persiste puis s'éteint
    const cp = clamp01((p - hitAt) / (1 - hitAt));
    if (cut.current) {
      cut.current.visible = p > hitAt;
      const w = cp < 0.18 ? easeOut(cp / 0.18) : 1 - clamp01((cp - 0.18) / 0.82) * 0.85;
      cut.current.scale.set(1, Math.max(0.001, w), 1);
      (cut.current.material as THREE.MeshBasicMaterial).opacity = (1 - cp) * 1;
    }
    if (cutGlow.current) {
      cutGlow.current.visible = p > hitAt;
      (cutGlow.current.material as THREE.MeshBasicMaterial).opacity = (1 - cp) * 0.4;
    }
    if (p >= 1) onDone(fx.id);
  });

  return (
    <>
      {/* voile d'anticipation */}
      <mesh position={[0, 0, 3.2]} renderOrder={990}>
        <planeGeometry args={[24, 14]} />
        <meshBasicMaterial ref={dim} color="#05030a" transparent opacity={0} depthWrite={false} depthTest={false} />
      </mesh>
      {/* lame + images fantômes */}
      {Array.from({ length: ghosts }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            if (el) blades.current[i] = el as THREE.Mesh;
          }}
          rotation={[0, 0, SLASH_ANGLE]}
          visible={false}
          renderOrder={995}
        >
          <planeGeometry args={[8.5, 1.5]} />
          <meshBasicMaterial
            map={bladeTex()}
            color="#dceaff"
            transparent
            toneMapped={false}
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
      {/* entaille persistante + halo */}
      <mesh ref={cut} position={[TARGET.x, TARGET.y, TARGET.z + 0.6]} rotation={[0, 0, SLASH_ANGLE]} visible={false} renderOrder={996}>
        <planeGeometry args={[8.5, 0.07]} />
        <meshBasicMaterial color="#ffffff" transparent toneMapped={false} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={cutGlow} position={[TARGET.x, TARGET.y, TARGET.z + 0.58]} rotation={[0, 0, SLASH_ANGLE]} visible={false} renderOrder={994}>
        <planeGeometry args={[8.5, 0.5]} />
        <meshBasicMaterial color="#9fc8ff" transparent toneMapped={false} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <FlashPlane ref={flash} />
      {sparks.nodes("#e8f3ff")}
      <pointLight ref={light} position={[0, 0.4, 1.6]} intensity={0} color="#dceaff" distance={12} decay={1.8} />
    </>
  );
}

// ── ⛓️ Châtiment enchaîné : harpons → chaînes tendues → rupture ────────
const CHAIN_ANCHORS = [
  new THREE.Vector3(-3.2, -1.8, 1.6),
  new THREE.Vector3(3.2, -1.8, 1.6),
  new THREE.Vector3(-2.7, 2.0, 0.4),
  new THREE.Vector3(2.7, 2.0, 0.4),
];
const CHAIN_LINKS = 7;
const UP_Y = new THREE.Vector3(0, 1, 0);

function ChainsFx({ fx, onDone, low }: FxProps) {
  const dur = 2.8;
  const breakAt = 0.74; // rupture — cf ATTACK_IMPACT_DELAY.chains
  const bodies = React.useRef<THREE.Mesh[]>([]);
  const hooks = React.useRef<THREE.Mesh[]>([]);
  const links = React.useRef<THREE.Mesh[]>([]);
  const anchorFlashes = React.useRef<THREE.Mesh[]>([]);
  const wave = React.useRef<THREE.Mesh>(null!);
  const flash = React.useRef<THREE.MeshBasicMaterial>(null!);
  const light = React.useRef<THREE.PointLight>(null!);
  const debris = useDebris(low ? 8 : 16);
  const tmpDir = React.useMemo(() => new THREE.Vector3(), []);
  const tmpPerp = React.useMemo(() => new THREE.Vector3(), []);
  const tmpQ = React.useMemo(() => new THREE.Quaternion(), []);
  const tmpV = React.useMemo(() => new THREE.Vector3(), []);

  useFrame((s) => {
    const t = s.clock.elapsedTime;
    const p = clamp01((t - fx.start) / dur);
    const bp = clamp01((p - breakAt) / (1 - breakAt)); // après rupture

    for (let c = 0; c < CHAIN_ANCHORS.length; c++) {
      const anchor = CHAIN_ANCHORS[c];
      // extension échelonnée par chaîne, puis tension vibrante jusqu'à rupture
      const ext = clamp01((p - 0.1 - c * 0.05) / 0.22);
      const alive = ext > 0 && p < breakAt;
      const tension = clamp01((p - 0.4) / (breakAt - 0.4));
      tmpDir.subVectors(TARGET, anchor);
      const fullLen = tmpDir.length();
      tmpDir.normalize();
      // vibration perpendiculaire (s'intensifie avec la tension)
      tmpPerp.set(-tmpDir.y, tmpDir.x, 0).normalize();
      const vib = alive ? Math.sin(t * 42 + c * 1.7) * 0.05 * tension : 0;

      const af = anchorFlashes.current[c];
      if (af) {
        const ap = clamp01((p - 0.04 - c * 0.05) / 0.12);
        af.position.copy(anchor);
        af.scale.setScalar(0.001 + (1 - ap) * 0.45);
        (af.material as THREE.MeshBasicMaterial).opacity = ap > 0 && ap < 1 ? 1 - ap : 0;
      }

      const body = bodies.current[c];
      if (body) {
        body.visible = alive;
        if (alive) {
          const len = fullLen * easeOut(ext);
          tmpV.copy(anchor).addScaledVector(tmpDir, len * 0.5).addScaledVector(tmpPerp, vib);
          body.position.copy(tmpV);
          tmpQ.setFromUnitVectors(UP_Y, tmpDir);
          body.quaternion.copy(tmpQ);
          body.scale.set(1, len, 1);
          (body.material as THREE.MeshBasicMaterial).opacity = 0.85 + tension * 0.15;
        }
      }
      const hook = hooks.current[c];
      if (hook) {
        hook.visible = alive;
        if (alive) {
          tmpV.copy(anchor).addScaledVector(tmpDir, fullLen * easeOut(ext)).addScaledVector(tmpPerp, vib);
          hook.position.copy(tmpV);
          tmpQ.setFromUnitVectors(UP_Y, tmpDir);
          hook.quaternion.copy(tmpQ);
        }
      }
      for (let l = 0; l < CHAIN_LINKS; l++) {
        const m = links.current[c * CHAIN_LINKS + l];
        if (!m) continue;
        m.visible = alive;
        if (!alive) continue;
        const f = (l + 1) / (CHAIN_LINKS + 1);
        const len = fullLen * easeOut(ext);
        tmpV.copy(anchor)
          .addScaledVector(tmpDir, len * f)
          .addScaledVector(tmpPerp, vib * Math.sin(f * Math.PI));
        m.position.copy(tmpV);
        tmpQ.setFromUnitVectors(UP_Y, tmpDir);
        m.quaternion.copy(tmpQ);
        m.rotation.z += l % 2 ? Math.PI / 2 : 0;
        const mm = m.material as THREE.MeshBasicMaterial;
        mm.opacity = 0.9;
        mm.color.setHSL(0.07, 0.9, 0.5 + tension * 0.3 + Math.sin(t * 30 + l) * 0.05 * tension);
      }
    }

    // rupture : flash écran + onde + maillons éjectés
    if (flash.current) flash.current.opacity = bp > 0 ? Math.max(0, 1 - bp * 2.6) * 0.8 : 0;
    if (wave.current) {
      wave.current.position.copy(TARGET);
      wave.current.scale.setScalar(0.001 + easeOut(bp) * 4.8);
      (wave.current.material as THREE.MeshBasicMaterial).opacity = bp > 0 ? (1 - bp) * 0.85 : 0;
    }
    debris.update(TARGET, bp, bp);
    if (light.current)
      light.current.intensity = p > 0.4 && p < breakAt ? 40 + Math.sin(t * 30) * 18 : bp > 0 ? (1 - bp) * 340 : 0;
    if (p >= 1) onDone(fx.id);
  });

  return (
    <>
      {CHAIN_ANCHORS.map((_, c) => (
        <React.Fragment key={c}>
          <mesh
            ref={(el) => {
              if (el) anchorFlashes.current[c] = el as THREE.Mesh;
            }}
          >
            <sphereGeometry args={[1, 10, 10]} />
            <meshBasicMaterial color="#ffb066" transparent toneMapped={false} />
          </mesh>
          {/* câble */}
          <mesh
            ref={(el) => {
              if (el) bodies.current[c] = el as THREE.Mesh;
            }}
            visible={false}
          >
            <cylinderGeometry args={[0.022, 0.022, 1, 6]} />
            <meshBasicMaterial color="#8a5a2a" transparent toneMapped={false} />
          </mesh>
          {/* harpon */}
          <mesh
            ref={(el) => {
              if (el) hooks.current[c] = el as THREE.Mesh;
            }}
            visible={false}
          >
            <coneGeometry args={[0.11, 0.32, 5]} />
            <meshBasicMaterial color="#ffd08a" toneMapped={false} />
          </mesh>
          {/* maillons */}
          {Array.from({ length: CHAIN_LINKS }, (_, l) => (
            <mesh
              key={l}
              ref={(el) => {
                if (el) links.current[c * CHAIN_LINKS + l] = el as THREE.Mesh;
              }}
              visible={false}
            >
              <torusGeometry args={[0.085, 0.028, 6, 12]} />
              <meshBasicMaterial color="#ff9d4d" transparent toneMapped={false} />
            </mesh>
          ))}
        </React.Fragment>
      ))}
      <mesh ref={wave} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1, 0.05, 8, 48]} />
        <meshBasicMaterial color="#ffb066" transparent toneMapped={false} />
      </mesh>
      <FlashPlane ref={flash} color="#ffe9c8" />
      {debris.nodes("#ff9d4d")}
      <pointLight ref={light} position={[0, 0.3, 1.6]} intensity={0} color="#ff9d4d" distance={14} decay={1.8} />
    </>
  );
}

// ── 🗡️ Pluie de lames : anneaux dorés → lames spectrales → rafale ─────
// Réf : arsenal céleste type Gate of Babylon — des lames émergent d'anneaux
// lumineux dans le ciel puis mitraillent la cible en rafale échelonnée.
const BLADE_COUNT = 12;
const BLADE_SPAWNS = Array.from({ length: BLADE_COUNT }, (_, i) => {
  const a = (i / (BLADE_COUNT - 1) - 0.5) * Math.PI * 0.9; // arc au-dessus
  return {
    pos: new THREE.Vector3(Math.sin(a) * 3.1, 2.1 + Math.cos(a) * 1.1, 0.2 + (i % 3) * 0.35),
    fireAt: 0.3 + i * 0.042,
    scale: i === BLADE_COUNT - 1 ? 1.6 : rand(0.85, 1.15), // la dernière est massive
  };
});

function BladeRainFx({ fx, onDone, low }: FxProps) {
  const dur = 3.0;
  const rings = React.useRef<THREE.Mesh[]>([]);
  const blades = React.useRef<THREE.Mesh[]>([]);
  const impacts = React.useRef<THREE.Mesh[]>([]);
  const flash = React.useRef<THREE.MeshBasicMaterial>(null!);
  const light = React.useRef<THREE.PointLight>(null!);
  const debris = useDebris(low ? 6 : 12);
  const count = low ? 8 : BLADE_COUNT;
  const tmpV = React.useMemo(() => new THREE.Vector3(), []);
  const tmpQ = React.useMemo(() => new THREE.Quaternion(), []);
  const tmpDir = React.useMemo(() => new THREE.Vector3(), []);

  useFrame((s) => {
    const t = s.clock.elapsedTime;
    const p = clamp01((t - fx.start) / dur);
    let flashSum = 0;
    let raf = 0; // progression globale de la rafale (pour les débris)

    for (let i = 0; i < count; i++) {
      const cfg = BLADE_SPAWNS[i];
      const mat = clamp01((p - 0.06 - i * 0.018) / 0.18); // matérialisation
      const fp = clamp01((p - cfg.fireAt) / 0.1); // dash vers la cible
      const ip = clamp01((p - cfg.fireAt - 0.1) / 0.22); // impact
      raf = Math.max(raf, fp);

      const ring = rings.current[i];
      if (ring) {
        ring.position.copy(cfg.pos);
        ring.lookAt(TARGET);
        ring.rotation.z = t * (1.2 + i * 0.13);
        ring.scale.setScalar(Math.max(0.001, 0.5 * cfg.scale * easeOut(mat) * (1 + fp * 0.25)));
        (ring.material as THREE.MeshBasicMaterial).opacity = mat * (1 - clamp01((p - cfg.fireAt - 0.05) / 0.3));
      }
      const blade = blades.current[i];
      if (blade) {
        blade.visible = mat > 0 && ip < 1;
        if (blade.visible) {
          tmpV.lerpVectors(cfg.pos, TARGET, fp >= 1 ? 1 : easeIn(fp));
          // frémissement en attente, filée pendant le dash
          if (fp <= 0) tmpV.y += Math.sin(t * 5 + i) * 0.05;
          blade.position.copy(tmpV);
          tmpDir.subVectors(TARGET, cfg.pos).normalize();
          tmpQ.setFromUnitVectors(UP_Y, tmpDir);
          blade.quaternion.copy(tmpQ);
          const grow = easeOut(mat) * cfg.scale;
          blade.scale.set(grow, grow * (1 + fp * 1.6), grow); // s'étire en dash
          (blade.material as THREE.MeshBasicMaterial).opacity = mat * (1 - ip);
        }
      }
      const imp = impacts.current[i];
      if (imp) {
        imp.position.copy(TARGET);
        imp.scale.setScalar(0.001 + easeOut(ip) * 0.9 * cfg.scale);
        (imp.material as THREE.MeshBasicMaterial).opacity = ip > 0 && ip < 1 ? (1 - ip) * 0.95 : 0;
        if (ip > 0 && ip < 0.4) flashSum = Math.max(flashSum, (0.4 - ip) * cfg.scale);
      }
    }

    // burst final sur la dernière (grosse) lame
    const lastAt = BLADE_SPAWNS[count - 1].fireAt + 0.1;
    const fb = clamp01((p - lastAt) / 0.25);
    if (flash.current) flash.current.opacity = fb > 0 ? Math.max(0, 1 - fb * 2.2) * 0.65 : 0;
    debris.update(TARGET, clamp01(raf * 1.2) * 0.8, clamp01((p - 0.6) / 0.4));
    if (light.current) light.current.intensity = flashSum * 220 + (fb > 0 ? (1 - fb) * 260 : 0);
    if (p >= 1) onDone(fx.id);
  });

  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <React.Fragment key={i}>
          {/* anneau doré d'invocation */}
          <mesh
            ref={(el) => {
              if (el) rings.current[i] = el as THREE.Mesh;
            }}
          >
            <ringGeometry args={[0.82, 0.96, 36]} />
            <meshBasicMaterial color="#ffd98a" transparent opacity={0} toneMapped={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
          </mesh>
          {/* lame spectrale (pointe vers la cible) */}
          <mesh
            ref={(el) => {
              if (el) blades.current[i] = el as THREE.Mesh;
            }}
            visible={false}
          >
            <coneGeometry args={[0.075, 0.95, 5]} />
            <meshBasicMaterial color="#f3f6ff" transparent toneMapped={false} />
          </mesh>
          {/* flash d'impact */}
          <mesh
            ref={(el) => {
              if (el) impacts.current[i] = el as THREE.Mesh;
            }}
          >
            <sphereGeometry args={[0.5, 12, 12]} />
            <meshBasicMaterial color="#fff3d0" transparent opacity={0} toneMapped={false} />
          </mesh>
        </React.Fragment>
      ))}
      <FlashPlane ref={flash} color="#fff6e0" />
      {debris.nodes("#e8ecff")}
      <pointLight ref={light} position={[0, 0.5, 1.5]} intensity={0} color="#ffe9b8" distance={14} decay={1.8} />
    </>
  );
}

// ── ☄️ Frappe orbitale v2 : charge → faisceau colossal → cataclysme ────
function OrbitalFx({ fx, onDone, low }: FxProps) {
  const dur = 3.6;
  const beamAt = 0.32;
  const boomAt = 0.55; // cataclysme — cf ATTACK_IMPACT_DELAY.orbital
  const reticle = React.useRef<THREE.Group>(null!);
  const skyGlow = React.useRef<THREE.Sprite>(null!);
  const riseParts = React.useRef<THREE.Points>(null!);
  const beam1 = React.useRef<THREE.Mesh>(null!);
  const beam2 = React.useRef<THREE.Mesh>(null!);
  const groundFlash = React.useRef<THREE.Mesh>(null!);
  const dome = React.useRef<THREE.Mesh>(null!);
  const rings = React.useRef<THREE.Mesh[]>([]);
  const flash = React.useRef<THREE.MeshBasicMaterial>(null!);
  const light = React.useRef<THREE.PointLight>(null!);
  const debris = useDebris(low ? 6 : 12);
  const N = low ? 30 : 60;
  const parts = React.useMemo(
    () =>
      Array.from({ length: N }, () => ({
        a: rand(0, Math.PI * 2),
        r: rand(0.6, 3.4),
        y: rand(-1.8, 0.5),
        sp: rand(1.4, 3.2),
      })),
    [N]
  );
  const geo = React.useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    return g;
  }, [N]);

  useFrame((s, delta) => {
    const t = s.clock.elapsedTime;
    const p = clamp01((t - fx.start) / dur);

    // — charge : réticule + ciel qui rougeoie + particules aspirées vers le haut
    const chargeP = clamp01(p / beamAt);
    if (reticle.current) {
      reticle.current.visible = p < boomAt;
      reticle.current.rotation.z = t * 2.2;
      reticle.current.scale.setScalar(1.9 - easeOut(chargeP) * 0.9);
      reticle.current.children.forEach((c) => {
        const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial;
        m.opacity = p < boomAt ? 0.4 + chargeP * 0.6 : 0;
      });
    }
    if (skyGlow.current) {
      const glowP = p < boomAt ? chargeP : Math.max(0, 1 - (p - boomAt) * 2.4);
      (skyGlow.current.material as THREE.SpriteMaterial).opacity = glowP * 0.75;
    }
    if (riseParts.current) {
      const pos = geo.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < N; i++) {
        const pt = parts[i];
        pt.y += delta * pt.sp * (0.5 + chargeP);
        pt.r = Math.max(0.15, pt.r - delta * 0.7 * chargeP);
        if (pt.y > 3.4) {
          pt.y = rand(-1.8, -0.6);
          pt.r = rand(1.2, 3.4);
          pt.a = rand(0, Math.PI * 2);
        }
        pos.setXYZ(i, Math.cos(pt.a) * pt.r, pt.y, Math.sin(pt.a) * pt.r * 0.7 + 0.2);
      }
      pos.needsUpdate = true;
      (riseParts.current.material as THREE.PointsMaterial).opacity = p < beamAt ? chargeP * 0.85 : Math.max(0, 0.85 - (p - beamAt) * 4);
    }

    // — faisceau colossal double, contra-rotatif, qui claque d'un coup
    const beamP = clamp01((p - beamAt) / 0.06);
    const beamEnd = 1 - clamp01((p - boomAt - 0.12) / 0.14);
    if (beam1.current && beam2.current) {
      beam1.current.visible = p >= beamAt && beamEnd > 0;
      beam2.current.visible = beam1.current.visible;
      const flick = 0.9 + Math.sin(t * 55) * 0.1;
      beam1.current.scale.set(1, beamP, 1);
      beam2.current.scale.set(1, beamP, 1);
      beam1.current.rotation.y += delta * 4;
      beam2.current.rotation.y -= delta * 3;
      (beam1.current.material as THREE.MeshBasicMaterial).opacity = beamP * beamEnd * flick;
      (beam2.current.material as THREE.MeshBasicMaterial).opacity = beamP * beamEnd * 0.5 * flick;
    }
    if (groundFlash.current) {
      groundFlash.current.visible = p >= beamAt && beamEnd > 0;
      groundFlash.current.scale.setScalar(0.001 + beamP * (1.6 + Math.sin(t * 30) * 0.15));
      (groundFlash.current.material as THREE.MeshBasicMaterial).opacity = beamP * beamEnd * 0.9;
    }

    // — cataclysme : dôme + triple onde + flash écran + débris
    const bp = clamp01((p - boomAt) / (1 - boomAt));
    if (dome.current) {
      dome.current.scale.setScalar(0.001 + easeOut(Math.min(1, bp * 1.4)) * 4.4);
      (dome.current.material as THREE.MeshBasicMaterial).opacity = bp > 0 ? Math.max(0, 0.9 - bp * 1.15) : 0;
    }
    for (let i = 0; i < rings.current.length; i++) {
      const r = rings.current[i];
      if (!r) continue;
      const rp = clamp01((bp - i * 0.1) / 0.55);
      r.scale.setScalar(0.001 + easeOut(rp) * (5 + i * 2.2));
      (r.material as THREE.MeshBasicMaterial).opacity = rp > 0 && rp < 1 ? (1 - rp) * 0.85 : 0;
    }
    if (flash.current) flash.current.opacity = bp > 0 ? Math.max(0, 1 - bp * 2.4) : 0;
    debris.update(TARGET, bp, bp);
    if (light.current) light.current.intensity = p >= beamAt && p < boomAt ? 140 : bp > 0 ? Math.max(0, 1 - bp * 1.4) * 560 : 0;
    if (p >= 1) onDone(fx.id);
  });

  return (
    <>
      {/* réticule de ciblage doré */}
      <group ref={reticle} position={[0, 0, 0.8]}>
        <mesh>
          <ringGeometry args={[0.95, 1.04, 44]} />
          <meshBasicMaterial color="#ffd08a" transparent toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 4]}>
          <ringGeometry args={[1.25, 1.29, 4]} />
          <meshBasicMaterial color="#ffb066" transparent toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
        <mesh>
          <planeGeometry args={[2.9, 0.02]} />
          <meshBasicMaterial color="#ffd08a" transparent opacity={0.5} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <planeGeometry args={[2.9, 0.02]} />
          <meshBasicMaterial color="#ffd08a" transparent opacity={0.5} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      </group>
      {/* ciel qui rougeoie */}
      <sprite ref={skyGlow} position={[0, 4.6, -1]} scale={[14, 5, 1]}>
        <spriteMaterial map={radialTex("255,80,30")} transparent opacity={0} depthWrite={false} fog={false} />
      </sprite>
      {/* particules d'énergie qui montent pendant la charge */}
      <points ref={riseParts} geometry={geo}>
        <pointsMaterial size={0.06} color="#ffd8a8" transparent opacity={0} toneMapped={false} blending={THREE.AdditiveBlending} depthWrite={false} sizeAttenuation />
      </points>
      {/* double faisceau */}
      <mesh ref={beam1} position={[0, 0.2, 0.2]} visible={false}>
        <cylinderGeometry args={[0.95, 1.25, 10, 40, 1, true]} />
        <meshBasicMaterial color="#fff3d6" transparent toneMapped={false} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={beam2} position={[0, 0.2, 0.2]} visible={false}>
        <cylinderGeometry args={[1.35, 1.7, 10, 40, 1, true]} />
        <meshBasicMaterial color="#ffb066" transparent toneMapped={false} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={groundFlash} position={[0, -1.7, 0.2]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <circleGeometry args={[1.9, 40]} />
        <meshBasicMaterial color="#fff3d6" transparent toneMapped={false} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      {/* cataclysme */}
      <mesh ref={dome} position={[0, -1.2, 0.2]}>
        <sphereGeometry args={[1, 24, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshBasicMaterial color="#ff7a1a" transparent toneMapped={false} depthWrite={false} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          ref={(el) => {
            if (el) rings.current[i] = el as THREE.Mesh;
          }}
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, -1.55, 0]}
        >
          <torusGeometry args={[1, 0.05, 8, 56]} />
          <meshBasicMaterial color={i === 1 ? "#ffd08a" : "#ff9d4d"} transparent toneMapped={false} />
        </mesh>
      ))}
      <FlashPlane ref={flash} color="#fff6e0" />
      {debris.nodes("#2b1a12")}
      <pointLight ref={light} position={[0, 0.6, 1.4]} intensity={0} color="#ffdf9e" distance={20} decay={1.6} />
    </>
  );
}

// ── Préchauffage : compile les shaders des effets au chargement ────────
// (instances minuscules et invisibles — évite le freeze au premier tir)
export function PrewarmFx() {
  const tiny = 0.001;
  return (
    <group position={[0, 0, -2.5]}>
      <Trail width={tiny} length={0.2} color="#ffffff" decay={9} attenuation={(w) => w}>
        <mesh scale={tiny} frustumCulled={false}>
          <sphereGeometry args={[1, 4, 4]} />
          <meshBasicMaterial transparent opacity={0.01} toneMapped={false} />
        </mesh>
      </Trail>
      <mesh scale={tiny} frustumCulled={false}>
        <torusGeometry args={[1, 0.05, 4, 8]} />
        <meshBasicMaterial transparent opacity={0.01} toneMapped={false} />
      </mesh>
      <mesh scale={tiny} frustumCulled={false}>
        <cylinderGeometry args={[0.2, 0.3, 1, 8, 1, true]} />
        <meshBasicMaterial transparent opacity={0.01} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <mesh scale={tiny} frustumCulled={false}>
        <circleGeometry args={[1, 8]} />
        <meshBasicMaterial transparent opacity={0.01} toneMapped={false} />
      </mesh>
      <mesh scale={tiny} frustumCulled={false}>
        <ringGeometry args={[0.9, 1, 8]} />
        <meshBasicMaterial transparent opacity={0.01} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <mesh scale={tiny} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={bladeTex()} transparent opacity={0.01} toneMapped={false} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh scale={tiny} frustumCulled={false}>
        <coneGeometry args={[0.2, 0.5, 6]} />
        <meshBasicMaterial transparent opacity={0.01} toneMapped={false} />
      </mesh>
      <points frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[new Float32Array([0, 0, 0, 0.01, 0, 0, 0, 0.01, 0]), 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.001} transparent opacity={0.01} toneMapped={false} blending={THREE.AdditiveBlending} depthWrite={false} />
      </points>
    </group>
  );
}

function Effect({ fx, onDone, low }: FxProps) {
  switch (fx.type) {
    case "bullet":
      return <BulletFx fx={fx} onDone={onDone} low={low} />;
    case "rocket":
      return <RocketFx fx={fx} onDone={onDone} low={low} />;
    case "slash":
      return <SlashFx fx={fx} onDone={onDone} low={low} />;
    case "chains":
      return <ChainsFx fx={fx} onDone={onDone} low={low} />;
    case "blades":
      return <BladeRainFx fx={fx} onDone={onDone} low={low} />;
    case "orbital":
      return <OrbitalFx fx={fx} onDone={onDone} low={low} />;
    default:
      return null;
  }
}

export function Attacks({ seq, type, power, low }: { seq: number; type: BossWeaponAnim; power: number; low: boolean }) {
  const [fx, setFx] = React.useState<FxItem[]>([]);
  const nowRef = React.useRef(0);
  useFrame((s) => {
    nowRef.current = s.clock.elapsedTime;
  });
  React.useEffect(() => {
    if (seq <= 0) return;
    setFx((prev) => [...prev, { id: seq, type, power, start: nowRef.current }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq]);
  const remove = React.useCallback((id: number) => setFx((prev) => prev.filter((e) => e.id !== id)), []);
  return (
    <>
      {fx.map((e) => (
        <Effect key={e.id} fx={e} onDone={remove} low={low} />
      ))}
    </>
  );
}
