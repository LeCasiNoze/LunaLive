const CyclopeTrust = () => {
  return (
    <section className="w-full px-5 pb-4 pt-1">
      <div className="max-w-sm mx-auto">
        <div className="flex flex-col items-center gap-2">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,185,48,0.25)",
              backdropFilter: "blur(10px)",
            }}
          >
            <div className="flex -space-x-1.5">
              {["#FF4B6E", "#FFB930", "#FF8A4B"].map((c, i) => (
                <div
                  key={i}
                  className="w-5 h-5 rounded-full border-2"
                  style={{ background: c, borderColor: "#0B1530" }}
                />
              ))}
            </div>
            <p
              className="text-[0.72rem] font-semibold whitespace-nowrap"
              style={{ color: "#FFE9D6", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              <span style={{ color: "#FFFFFF", fontWeight: 800 }}>+10 247 joueurs</span>
              {" · "}
              <span style={{ color: "#FFB930", fontWeight: 800 }}>★ 4.8/5</span>
            </p>
          </div>
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(125,255,184,0.22)",
              backdropFilter: "blur(10px)",
            }}
          >
            <p
              className="text-[0.68rem] font-semibold whitespace-nowrap"
              style={{ color: "#FFE9D6", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              <span style={{ color: "#7DFFB8", fontWeight: 800 }}>🔒 Paiement sécurisé</span>
              {" · "}
              <span style={{ color: "#FFFFFF", fontWeight: 700 }}>VISA · MC · Apple Pay</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CyclopeTrust;
