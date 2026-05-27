// ─────────────────────────────────────────────────────────────────────────────
// V3NeonBg — fond neon partage par tous les modeles V3.
// Mesh gradient anime (3 nappes lumineuses) + 6 particules flottantes
// (violet/cyan/rose/or). A inserer comme premier enfant du root,
// sous l'avatar/contenu. Le parent doit etre position:relative et overflow:hidden.
// ─────────────────────────────────────────────────────────────────────────────

export type V3NeonBgProps = {
  accent?: string;
  accentGlow?: string;
};

export function V3NeonBg({
  accent = "#f7c948",
  accentGlow = "rgba(247,201,72,.4)",
}: V3NeonBgProps) {
  return (
    <>
      <style>{`
        .v3bg-mesh{position:absolute;inset:-20%;background:
          radial-gradient(circle at 30% 40%,var(--v3bg-glow) 0%,transparent 40%),
          radial-gradient(circle at 70% 60%,rgba(168,85,247,.32) 0%,transparent 40%),
          radial-gradient(circle at 50% 20%,rgba(6,182,212,.22) 0%,transparent 40%);
          filter:blur(40px);animation:v3bg-mesh 18s ease-in-out infinite alternate;pointer-events:none;z-index:0}
        .v3bg-grain{position:absolute;inset:0;background-image:radial-gradient(circle at 50% 50%,rgba(255,255,255,.04) 1px,transparent 1px);background-size:24px 24px;opacity:.45;pointer-events:none;z-index:0}
        .v3bg-particle{position:absolute;width:4px;height:4px;border-radius:50%;pointer-events:none;z-index:1;opacity:.55}
        .v3bg-particle.p1{top:18%;left:12%;background:var(--v3bg-accent);box-shadow:0 0 8px var(--v3bg-accent),0 0 14px var(--v3bg-accent);animation:v3bg-float 9s ease-in-out infinite}
        .v3bg-particle.p2{top:35%;right:14%;animation:v3bg-float 11s ease-in-out infinite 1s;background:#a855f7;box-shadow:0 0 8px #a855f7,0 0 14px #a855f7}
        .v3bg-particle.p3{top:65%;left:8%;animation:v3bg-float 13s ease-in-out infinite .5s;background:#06b6d4;box-shadow:0 0 8px #06b6d4,0 0 14px #06b6d4}
        .v3bg-particle.p4{top:78%;right:18%;animation:v3bg-float 10s ease-in-out infinite 2s;background:#ec4899;box-shadow:0 0 8px #ec4899,0 0 14px #ec4899}
        .v3bg-particle.p5{top:48%;left:88%;animation:v3bg-float 14s ease-in-out infinite 1.5s;background:var(--v3bg-accent);box-shadow:0 0 8px var(--v3bg-accent),0 0 14px var(--v3bg-accent)}
        .v3bg-particle.p6{top:22%;left:50%;animation:v3bg-float 12s ease-in-out infinite .8s;background:#22d3ee;box-shadow:0 0 8px #22d3ee,0 0 14px #22d3ee}
        @keyframes v3bg-mesh{0%{transform:translate(0,0) rotate(0deg)}50%{transform:translate(-30px,20px) rotate(8deg)}100%{transform:translate(20px,-15px) rotate(-6deg)}}
        @keyframes v3bg-float{0%,100%{transform:translate(0,0)}50%{transform:translate(14px,-22px)}}
      `}</style>
      <div
        style={{
          ["--v3bg-accent" as any]: accent,
          ["--v3bg-glow" as any]: accentGlow,
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
        }}
      >
        <div className="v3bg-mesh" />
        <div className="v3bg-grain" />
        <span className="v3bg-particle p1" />
        <span className="v3bg-particle p2" />
        <span className="v3bg-particle p3" />
        <span className="v3bg-particle p4" />
        <span className="v3bg-particle p5" />
        <span className="v3bg-particle p6" />
      </div>
    </>
  );
}
