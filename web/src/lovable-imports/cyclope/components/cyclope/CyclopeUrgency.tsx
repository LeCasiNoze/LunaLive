import { useEffect, useState } from "react";

const pad = (n: number) => n.toString().padStart(2, "0");

const CyclopeUrgency = () => {
  const [target] = useState(() => Date.now() + 1000 * 60 * 60 * 23 + 1000 * 60 * 47);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const diff = Math.max(0, target - now);
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);

  return (
    <section className="w-full px-5 pb-2">
      <div
        className="max-w-sm mx-auto flex items-center justify-center gap-3 px-4 py-3 rounded-2xl"
        style={{
          background:
            "linear-gradient(135deg, rgba(255,75,110,0.18), rgba(255,185,48,0.12))",
          border: "1px solid rgba(255,75,110,0.5)",
          boxShadow: "0 0 24px rgba(255,75,110,0.25)",
        }}
      >
        <span
          className="text-[0.7rem] font-extrabold"
          style={{
            color: "#FFE9D6",
            fontFamily: "'Space Grotesk', sans-serif",
            letterSpacing: "0.1em",
          }}
        >
          ⏱ OFFRE LIMITÉE
        </span>
        <div className="flex items-center gap-1.5">
          {[
            { v: pad(h), l: "H" },
            { v: pad(m), l: "M" },
            { v: pad(s), l: "S" },
          ].map((b, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div
                className="px-2 py-1 rounded-lg min-w-[34px] text-center"
                style={{
                  background: "rgba(0,0,0,0.4)",
                  border: "1px solid rgba(255,185,48,0.35)",
                  fontFamily: "'Bagel Fat One', cursive",
                  fontSize: "0.95rem",
                  color: "#FFFFFF",
                  textShadow: "0 0 10px rgba(255,185,48,0.5)",
                }}
              >
                {b.v}
              </div>
              {i < 2 && (
                <span style={{ color: "#FFB930", fontWeight: 900 }}>:</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default CyclopeUrgency;