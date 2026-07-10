// Scène 3D du boss (burn_boss) — chargée UNIQUEMENT en lazy import depuis
// BossStage, pour que three.js/r3f ne tombe jamais dans le bundle principal
// ni sur les pages SEO. Rendu : cœur de lave (croûte rocheuse + noyau
// distordu) + éclats en orbite + braises, piloté par les PV (enrage), et
// cinématiques d'armes (voir ./weaponFx.tsx).
import * as THREE from "three";
import React from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Sparkles, AdaptiveDpr, MeshDistortMaterial } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { ATTACK_IMPACT_DELAY, type BossWeaponAnim } from "./weapons";
import { Attacks, PrewarmFx } from "./weaponFx";

export type BossSceneProps = {
  /** PV restants normalisés 0..1 (1 = pleine vie). */
  hpPct: number;
  killed: boolean;
  /** Temps écoulé sans kill (le boss a survécu). */
  expired: boolean;
  /** Incrémente à chaque tir pour déclencher l'animation d'arme + le flinch. */
  attackSeq: number;
  /** Animation d'arme à jouer. */
  attackType: BossWeaponAnim;
  /** Puissance du tir 0..1. */
  attackPower: number;
  /** Incrémente pour rejouer la cinématique de mort (mode entraînement). */
  deathReplaySeq?: number;
  /** "low" allège particules/bloom/dpr (mobile / GPU faible). */
  quality: "high" | "low";
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

const CORE_HEALTHY = new THREE.Color("#7c1d1d"); // sang sombre
const CORE_ENRAGED = new THREE.Color("#ff5a1f"); // orange incandescent
const CORE_WHITE = new THREE.Color("#fff2d6"); // flash blanc-chaud
const CORE_COLD = new THREE.Color("#2b2440"); // éteint (survécu)
const CORE_VESTIGE = new THREE.Color("#f2c14e"); // trophée doré (vaincu)

type Impact = { t: number; power: number };

// ── Éclats d'obsidienne en orbite ────────────────────────────────────
function Shards({
  hpPct,
  impact,
  deathRef,
}: {
  hpPct: number;
  impact: React.MutableRefObject<Impact>;
  deathRef: React.MutableRefObject<number>;
}) {
  const group = React.useRef<THREE.Group>(null!);
  const refs = React.useRef<THREE.Mesh[]>([]);
  const shards = React.useMemo(
    () =>
      Array.from({ length: 15 }, () => ({
        axis: new THREE.Vector3(rand(-1, 1), rand(-0.4, 1), rand(-1, 1)).normalize(),
        radius: rand(1.7, 2.5),
        speed: rand(0.15, 0.55) * (Math.random() < 0.5 ? 1 : -1),
        phase: rand(0, Math.PI * 2),
        bob: rand(0.1, 0.35),
        spin: new THREE.Vector3(rand(0.4, 1.6), rand(0.4, 1.6), rand(0.4, 1.6)),
        scale: rand(0.14, 0.32),
      })),
    []
  );

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const enrage = THREE.MathUtils.clamp(1 - hpPct, 0, 1);
    const hitE = impact.current.t;
    const dz = deathRef.current;
    const dBoom = easeOut(clamp01((dz - 0.5) / 0.12));
    const dFade = clamp01((dz - 0.62) / 0.38);
    for (let i = 0; i < shards.length; i++) {
      const m = refs.current[i];
      if (!m) continue;
      const s = shards[i];
      const ang = s.phase + t * s.speed * (1 + enrage * 1.4);
      const rad = s.radius * (1 + hitE * (0.25 + impact.current.power * 0.35) + dBoom * 7);
      const c = Math.cos(ang);
      const sn = Math.sin(ang);
      const base = new THREE.Vector3(c * rad, Math.sin(t * 0.8 + s.phase) * s.bob, sn * rad);
      base.applyAxisAngle(s.axis, ang * 0.35);
      m.position.copy(base);
      m.rotation.x += delta * s.spin.x * (1 + enrage);
      m.rotation.y += delta * s.spin.y * (1 + enrage);
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.4 + enrage * 1.1 + hitE * 2 + dBoom * 3;
      mat.opacity = 1 - dFade;
      const sc = s.scale * (1 + hitE * 0.3) * (1 - dFade * 0.6);
      m.scale.setScalar(Math.max(0.001, sc));
    }
    if (group.current) group.current.rotation.y = t * 0.05;
  });

  return (
    <group ref={group}>
      {shards.map((s, i) => (
        <mesh
          key={i}
          ref={(el) => {
            if (el) refs.current[i] = el;
          }}
          scale={s.scale}
        >
          <octahedronGeometry args={[1, 0]} />
          <meshStandardMaterial
            color="#14090f"
            emissive={CORE_ENRAGED}
            emissiveIntensity={0.5}
            metalness={0.6}
            roughness={0.35}
            transparent
            flatShading
          />
        </mesh>
      ))}
    </group>
  );
}

// ── Cœur de lave (croûte rocheuse + noyau distordu + yeux) ────────────
function Core({
  hpPct,
  killed,
  expired,
  impact,
  deathRef,
}: {
  hpPct: number;
  killed: boolean;
  expired: boolean;
  impact: React.MutableRefObject<Impact>;
  deathRef: React.MutableRefObject<number>;
}) {
  const group = React.useRef<THREE.Group>(null!);
  const crust = React.useRef<THREE.Mesh>(null!);
  const mat = React.useRef<any>(null!);
  const eyes = React.useRef<THREE.Group>(null!);
  const mouth = React.useRef<THREE.Group>(null!);
  const crackMat = React.useRef<THREE.MeshBasicMaterial>(null!);
  const hornMats = React.useRef<THREE.MeshStandardMaterial[]>([]);
  const haloMat = React.useRef<THREE.SpriteMaterial>(null!);
  const deathLight = React.useRef<THREE.PointLight>(null!);
  const ringsGroup = React.useRef<THREE.Group>(null!);
  const ringMats = React.useRef<THREE.MeshBasicMaterial[]>([]);
  const col = React.useMemo(() => new THREE.Color(), []);
  const baseScale = 1.15;

  // halo incandescent billboard (dégradé radial généré une fois)
  const haloTex = React.useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(255,120,40,0.9)");
    grad.addColorStop(0.35, "rgba(255,70,20,0.35)");
    grad.addColorStop(1, "rgba(255,60,20,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }, []);

  // cornes d'obsidienne réparties sur le haut de la croûte
  const horns = React.useMemo(() => {
    const dirs = [
      [0, 1, 0.2],
      [0.75, 0.75, -0.25],
      [-0.75, 0.75, -0.25],
      [0.45, 0.9, 0.5],
      [-0.45, 0.9, 0.5],
      [1, 0.2, -0.4],
      [-1, 0.2, -0.4],
    ];
    const up = new THREE.Vector3(0, 1, 0);
    return dirs.map((d) => {
      const dir = new THREE.Vector3(d[0], d[1], d[2]).normalize();
      const len = rand(0.5, 0.85);
      return {
        pos: dir.clone().multiplyScalar(1.18 + len * 0.28),
        quat: new THREE.Quaternion().setFromUnitVectors(up, dir),
        len,
        r: rand(0.15, 0.24),
      };
    });
  }, []);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const enrage = THREE.MathUtils.clamp(1 - hpPct, 0, 1);

    if (impact.current.t > 0) impact.current.t = Math.max(0, impact.current.t - delta * 3.4);
    const hitE = impact.current.t;

    // Cinématique de mort ~3s : secousses → implosion → explosion →
    // dissolution. Un visiteur arrivant boss déjà mort démarre à dz=1
    // (pas de replay, cf deathRef init).
    if (killed) deathRef.current = Math.min(1, deathRef.current + delta / 3);
    else deathRef.current = Math.max(0, deathRef.current - delta * 2);
    const dz = deathRef.current;
    const dShake = dz <= 0 ? 0 : dz < 0.35 ? dz / 0.35 : Math.max(0, 1 - (dz - 0.35) / 0.2);
    const dImpl = dz < 0.3 ? 1 + dz * 0.5 : dz < 0.5 ? 1.15 - ((dz - 0.3) / 0.2) * 0.7 : 0.45;
    const dBoom = easeOut(clamp01((dz - 0.5) / 0.12));
    const dFade = clamp01((dz - 0.62) / 0.38);
    // après la dissolution, un vestige doré réapparaît (état "trophée")
    const vestige = killed ? clamp01((dz - 0.86) / 0.14) : 0;

    if (group.current) {
      // tremblement au coup + convulsions de mort, en plus de la rotation continue
      const shake = hitE * 0.05 + dShake * 0.09;
      group.current.rotation.y += delta * (0.22 + enrage * 0.9 + hitE * 5 + dShake * 7);
      group.current.rotation.x = Math.sin(t * 0.4) * 0.12 + Math.sin(t * 47) * shake;
      group.current.rotation.z = Math.sin(t * 53) * shake;
      const breathe = 1 + Math.sin(t * (1.3 + enrage)) * 0.035;
      const punch = hitE * (0.16 + impact.current.power * 0.24);
      const deathScale = (dImpl + dBoom * 2.4) * (1 - vestige) + vestige * 0.55;
      const s = (breathe + punch) * deathScale * baseScale;
      group.current.scale.setScalar(Math.max(0.001, s));
      group.current.position.y = Math.sin(t * 0.9) * 0.06;
    }

    if (crust.current) {
      crust.current.rotation.y = -t * (0.14 + enrage * 0.35);
      crust.current.rotation.x = t * 0.05;
      const cm = crust.current.material as THREE.MeshStandardMaterial;
      cm.emissiveIntensity = 0.25 + enrage * 0.8 + hitE * 1.5 + dShake * 1.5;
      cm.opacity = (0.62 - enrage * 0.28) * (1 - clamp01(dz * 1.8));
    }

    // fissures de magma : quasi invisibles à pleine vie, incandescentes en
    // enrage, aveuglantes pendant les convulsions de mort
    if (crackMat.current) {
      crackMat.current.opacity = (0.06 + enrage * 0.42 + hitE * 0.45 + dShake * 0.6) * (1 - dFade);
    }
    for (const hm of hornMats.current) {
      if (!hm) continue;
      hm.emissiveIntensity = 0.2 + enrage * 1.1 + hitE * 1.6 + dShake * 2;
      hm.opacity = 1 - clamp01(dz * 1.6);
    }

    if (mat.current) {
      col.copy(CORE_HEALTHY).lerp(CORE_ENRAGED, enrage);
      if (hitE > 0) col.lerp(CORE_WHITE, Math.min(0.8, hitE));
      if (killed) col.lerp(CORE_WHITE, Math.min(1, dShake * 0.5 + dBoom));
      if (expired && !killed) col.lerp(CORE_COLD, 1);
      if (vestige > 0) col.lerp(CORE_VESTIGE, vestige);
      mat.current.color.copy(col);
      mat.current.emissive.copy(col);
      const aliveEmissive = 0.7 + enrage * 1.7 + hitE * 3 + dShake * 2.5 + dBoom * 5;
      mat.current.emissiveIntensity =
        expired && !killed
          ? 0.12
          : aliveEmissive * (1 - vestige) + vestige * (0.55 + Math.sin(t * 1.2) * 0.15);
      mat.current.distort = (0.26 + enrage * 0.3 + hitE * 0.55 + dShake * 0.6) * (1 - vestige * 0.7);
      mat.current.speed = (1.4 + enrage * 2.2 + hitE * 4 + dShake * 6) * (1 - vestige * 0.6);
      mat.current.opacity = Math.min(1, 1 - dFade + vestige * 0.95);
    }

    if (deathLight.current) {
      deathLight.current.intensity = dBoom * (1 - dFade) * 420;
    }

    if (eyes.current) {
      const blink = Math.sin(t * 2.1) > 0.94 ? 0.12 : 1;
      const openY = expired || killed ? 0 : blink;
      eyes.current.scale.y = THREE.MathUtils.lerp(eyes.current.scale.y, openY, 0.3);
      eyes.current.children.forEach((c) => {
        const em = (c as THREE.Mesh).material as THREE.MeshBasicMaterial;
        em.opacity = (1 - dz) * (expired ? 0.2 : 1);
      });
    }

    if (mouth.current) {
      mouth.current.children.forEach((c) => {
        const mm = (c as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mm.opacity = (1 - dz) * (expired ? 0.12 : 0.85 + hitE * 0.15);
      });
      // la mâchoire s'ouvre légèrement avec l'enrage et à l'impact
      mouth.current.position.y = -0.34 - enrage * 0.05 - hitE * 0.08;
    }

    if (haloMat.current) {
      haloMat.current.opacity =
        expired && !killed
          ? 0.1
          : (0.4 + enrage * 0.35 + hitE * 0.5 + Math.sin(t * 1.7) * 0.06 + dBoom * 0.6) * (1 - dFade * 0.8);
    }

    if (ringsGroup.current) {
      ringsGroup.current.rotation.y += delta * (0.25 + enrage * 0.55 + hitE * 1.2 + dShake * 3);
      const rs = 1 + hitE * 0.12 + dBoom * 8; // onde de choc à l'explosion
      ringsGroup.current.scale.setScalar(rs);
      for (let i = 0; i < ringMats.current.length; i++) {
        const rm = ringMats.current[i];
        if (!rm) continue;
        rm.opacity = expired && !killed ? 0.06 : (0.3 - i * 0.08 + enrage * 0.35 + hitE * 0.45) * (1 - dFade);
      }
    }
  });

  return (
    <>
      <group ref={group}>
        {/* noyau de lave distordu */}
        <mesh>
          <icosahedronGeometry args={[1, 5]} />
          <MeshDistortMaterial
            ref={mat}
            color={CORE_HEALTHY}
            emissive={CORE_HEALTHY}
            emissiveIntensity={0.9}
            roughness={0.28}
            metalness={0.15}
            distort={0.3}
            speed={1.8}
            transparent
          />
        </mesh>
        {/* croûte rocheuse low-poly semi-transparente (contra-rotative) */}
        <mesh ref={crust} scale={1.24}>
          <icosahedronGeometry args={[1, 1]} />
          <meshStandardMaterial
            color="#180806"
            emissive={CORE_ENRAGED}
            emissiveIntensity={0.35}
            roughness={0.95}
            metalness={0.05}
            flatShading
            transparent
            opacity={0.6}
          />
        </mesh>
        {/* fissures de magma (wireframe) — s'embrasent quand les PV baissent */}
        <mesh scale={1.09}>
          <icosahedronGeometry args={[1, 2]} />
          <meshBasicMaterial ref={crackMat} color="#ffb066" wireframe transparent opacity={0.08} toneMapped={false} />
        </mesh>
        {/* cornes d'obsidienne */}
        {horns.map((h, i) => (
          <mesh key={i} position={h.pos} quaternion={h.quat}>
            <coneGeometry args={[h.r, h.len, 5]} />
            <meshStandardMaterial
              ref={(el) => {
                if (el) hornMats.current[i] = el as THREE.MeshStandardMaterial;
              }}
              color="#0d0508"
              emissive={CORE_ENRAGED}
              emissiveIntensity={0.25}
              roughness={0.9}
              metalness={0.2}
              flatShading
              transparent
            />
          </mesh>
        ))}
      </group>
      {/* yeux menaçants : amandes inclinées, DEVANT la croûte (z > 1.24 × scale), hors rotation du cœur */}
      <group ref={eyes} position={[0, 0.22, 1.66]}>
        <mesh position={[-0.4, 0, 0]} rotation={[0, 0, -0.35]} scale={[1.6, 0.75, 0.7]}>
          <sphereGeometry args={[0.1, 16, 16]} />
          <meshBasicMaterial color="#ffe89a" transparent toneMapped={false} />
        </mesh>
        <mesh position={[0.4, 0, 0]} rotation={[0, 0, 0.35]} scale={[1.6, 0.75, 0.7]}>
          <sphereGeometry args={[0.1, 16, 16]} />
          <meshBasicMaterial color="#ffe89a" transparent toneMapped={false} />
        </mesh>
      </group>
      {/* rictus denté (jack-o'-lantern démoniaque), s'ouvre avec l'enrage */}
      <group ref={mouth} position={[0, -0.34, 1.62]}>
        {[-0.34, -0.17, 0, 0.17, 0.34].map((x, i) => (
          <mesh key={i} position={[x, i % 2 === 0 ? 0 : 0.08, 0]} rotation={[Math.PI, 0, 0]} scale={[1, 1, 0.5]}>
            <coneGeometry args={[0.075, 0.17, 3]} />
            <meshBasicMaterial color="#ffd27a" transparent opacity={0.85} toneMapped={false} />
          </mesh>
        ))}
      </group>
      {/* halo incandescent derrière le boss */}
      <sprite position={[0, 0, -1.9]} scale={[7.5, 7.5, 1]}>
        <spriteMaterial ref={haloMat} map={haloTex} transparent depthWrite={false} opacity={0.45} fog={false} />
      </sprite>
      {/* flash blanc de l'explosion de mort */}
      <pointLight ref={deathLight} position={[0, 0, 1.5]} intensity={0} color="#fff2d6" distance={18} decay={1.6} />
      {/* anneaux d'énergie orbitaux (précession autour du boss) */}
      <group ref={ringsGroup}>
        <mesh rotation={[1.35, 0, 0]}>
          <torusGeometry args={[1.95, 0.016, 8, 90]} />
          <meshBasicMaterial
            ref={(el) => {
              if (el) ringMats.current[0] = el as THREE.MeshBasicMaterial;
            }}
            color="#ffb066"
            transparent
            opacity={0.3}
            toneMapped={false}
          />
        </mesh>
        <mesh rotation={[1.9, 0.5, 0]}>
          <torusGeometry args={[2.35, 0.013, 8, 90]} />
          <meshBasicMaterial
            ref={(el) => {
              if (el) ringMats.current[1] = el as THREE.MeshBasicMaterial;
            }}
            color="#a78bfa"
            transparent
            opacity={0.22}
            toneMapped={false}
          />
        </mesh>
      </group>
    </>
  );
}

// ── Animations des armes : systeme sakuga, voir ./weaponFx.tsx ──────

// ── Rochers flottants autour de l'arène (profondeur + échelle) ───────
function FloatingRocks() {
  const rocks = React.useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => ({
        angle: (i / 7) * Math.PI * 2 + rand(-0.3, 0.3),
        radius: rand(3.1, 4.6),
        y: rand(-1.3, 0.9),
        scale: rand(0.18, 0.45),
        speed: rand(0.2, 0.5),
        phase: rand(0, Math.PI * 2),
        spin: rand(0.1, 0.35),
      })),
    []
  );
  const refs = React.useRef<THREE.Mesh[]>([]);
  useFrame((s, delta) => {
    const t = s.clock.elapsedTime;
    for (let i = 0; i < rocks.length; i++) {
      const m = refs.current[i];
      if (!m) continue;
      const r = rocks[i];
      m.position.set(
        Math.cos(r.angle) * r.radius,
        r.y + Math.sin(t * r.speed + r.phase) * 0.25,
        Math.sin(r.angle) * r.radius
      );
      m.rotation.y += delta * r.spin;
      m.rotation.x += delta * r.spin * 0.6;
    }
  });
  return (
    <>
      {rocks.map((r, i) => (
        <mesh
          key={i}
          ref={(el) => {
            if (el) refs.current[i] = el as THREE.Mesh;
          }}
          scale={r.scale}
        >
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color="#120b14" emissive="#7c5cf0" emissiveIntensity={0.05} roughness={1} flatShading />
        </mesh>
      ))}
    </>
  );
}

// ── Arène : sol réfléchissant + anneau de lave pulsant ───────────────
function Arena({ hpPct }: { hpPct: number }) {
  const ringMat = React.useRef<THREE.MeshBasicMaterial>(null!);
  useFrame((s) => {
    const t = s.clock.elapsedTime;
    const enrage = THREE.MathUtils.clamp(1 - hpPct, 0, 1);
    if (ringMat.current) ringMat.current.opacity = 0.3 + Math.sin(t * 2.2) * 0.12 + enrage * 0.3;
  });
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.85, 0]}>
        <circleGeometry args={[9, 48]} />
        <meshStandardMaterial color="#0b0509" roughness={0.35} metalness={0.8} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.83, 0]}>
        <ringGeometry args={[2.25, 2.4, 64]} />
        <meshBasicMaterial ref={ringMat} color="#ff6a2a" transparent opacity={0.35} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.84, 0]}>
        <ringGeometry args={[2.5, 2.52, 64]} />
        <meshBasicMaterial color="#7c5cf0" transparent opacity={0.18} toneMapped={false} />
      </mesh>
    </>
  );
}

// ── Caméra vivante : sway orbital lent + shake à l'impact et à la mort ─
function CameraRig({
  impact,
  deathRef,
}: {
  impact: React.MutableRefObject<Impact>;
  deathRef: React.MutableRefObject<number>;
}) {
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const dz = deathRef.current;
    const dShake = dz <= 0 ? 0 : dz < 0.35 ? dz / 0.35 : Math.max(0, 1 - (dz - 0.35) / 0.2);
    const shake = impact.current.t * (0.25 + impact.current.power * 0.75) + dShake * 0.9;
    const cam = state.camera;
    cam.position.x = Math.sin(t * 0.3) * 0.24 + (Math.random() - 0.5) * shake * 0.22;
    cam.position.y = 0.2 + Math.sin(t * 0.19) * 0.12 + (Math.random() - 0.5) * shake * 0.16;
    cam.position.z = 5 + Math.sin(t * 0.13) * 0.12;
    cam.lookAt(0, 0, 0.3);
  });
  return null;
}

// ── Assemblage ───────────────────────────────────────────────────────
function Scene(props: BossSceneProps) {
  const impact = React.useRef<Impact>({ t: 0, power: 0 });
  const deathRef = React.useRef<number>(props.killed ? 1 : 0);

  // replay de la mise à mort : le boss "renaît" (dz=0) puis la timeline
  // killed le refait mourir entièrement (~3s).
  React.useEffect(() => {
    if ((props.deathReplaySeq ?? 0) > 0) deathRef.current = 0;
  }, [props.deathReplaySeq]);

  // le flinch + les braises sont synchronisés au moment où l'arme touche.
  React.useEffect(() => {
    if (props.attackSeq <= 0) return;
    const delay = ATTACK_IMPACT_DELAY[props.attackType] ?? 0.3;
    const power = THREE.MathUtils.clamp(props.attackPower, 0, 1);
    const id = setTimeout(() => {
      impact.current = { t: 1, power };
    }, delay * 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.attackSeq]);

  const enrage = THREE.MathUtils.clamp(1 - props.hpPct, 0, 1);
  const low = props.quality === "low";

  return (
    <>
      <fog attach="fog" args={["#0b0710", 6.5, 15]} />
      <ambientLight intensity={0.5} color="#4a2a5a" />
      <pointLight position={[3, 4, 5]} intensity={70} color="#ff8a3d" distance={20} decay={2} />
      <pointLight position={[-5, -2, -3]} intensity={40} color="#a78bfa" distance={20} decay={2} />
      <pointLight position={[0, 0, 3]} intensity={12 + enrage * 30} color="#ff3b1f" distance={12} decay={2} />
      {/* lumière chaude sous le boss (renvoi du sol de lave) */}
      <pointLight position={[0, -1.6, 1]} intensity={18 + enrage * 22} color="#ff6a2a" distance={7} decay={2} />
      {/* rim light violette arrière : détache la silhouette du fond */}
      <directionalLight position={[0, 3, -6]} intensity={1.6} color="#7c5cf0" />

      <CameraRig impact={impact} deathRef={deathRef} />
      <Arena hpPct={props.hpPct} />
      <FloatingRocks />
      <PrewarmFx />
      <Core {...props} impact={impact} deathRef={deathRef} />
      <Shards hpPct={props.hpPct} impact={impact} deathRef={deathRef} />
      <Attacks seq={props.attackSeq} type={props.attackType} power={props.attackPower} low={low} />

      <Sparkles
        count={low ? 32 : 70}
        scale={[7, 5, 5]}
        size={4}
        speed={0.5 + enrage}
        opacity={props.expired && !props.killed ? 0.15 : 0.8}
        color={props.expired && !props.killed ? "#6b7280" : "#ff9d4d"}
        noise={2}
      />
      {/* braises qui montent du sol de lave */}
      {!low && !props.expired ? (
        <Sparkles count={26} scale={[5.5, 1.6, 4]} position={[0, -1.2, 0]} size={3} speed={1.3} opacity={0.7} color="#ff5a1f" noise={1.5} />
      ) : null}

      <EffectComposer enableNormalPass={false}>
        <Bloom
          intensity={low ? 0.7 : 1.15 + enrage * 0.9}
          luminanceThreshold={0.15}
          luminanceSmoothing={0.9}
          mipmapBlur={!low}
          radius={0.7}
        />
        <Vignette eskil={false} offset={0.25} darkness={low ? 0.7 : 0.9} />
      </EffectComposer>
      <AdaptiveDpr pixelated />
    </>
  );
}

export default function BossScene(props: BossSceneProps) {
  const low = props.quality === "low";
  return (
    <Canvas
      className="evBossCanvas"
      dpr={low ? [1, 1.2] : [1, 1.75]}
      gl={{ alpha: true, antialias: !low, powerPreference: "high-performance" }}
      camera={{ position: [0, 0.2, 5], fov: 42 }}
      style={{ width: "100%", height: "100%" }}
    >
      <Scene {...props} />
    </Canvas>
  );
}
