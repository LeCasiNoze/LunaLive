import profile from "@/cyclope/assets/cyclope-profile.jpg";

const CyclopeHeader = () => {
  return (
    <header className="relative w-full px-5 pt-5 pb-3 flex items-center justify-center gap-3">
      <img
        src={profile}
        alt="Cyclope l'Héritier"
        className="w-[56px] h-[56px] rounded-full object-cover shrink-0"
        style={{
          border: "2.5px solid #ffffff",
          boxShadow: "0 0 0 2px #FF4B6E, 0 6px 18px rgba(255,75,110,0.45)",
        }}
      />
      <div className="flex flex-col items-start leading-none">
        <h1
          style={{
            fontFamily: "'Bagel Fat One', cursive",
            fontSize: "1.5rem",
            letterSpacing: "0.02em",
            background:
              "linear-gradient(180deg, #ffffff 0%, #FFE9D6 30%, #FFB930 70%, #FF4B6E 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            filter: "drop-shadow(0 1px 0 rgba(255,75,110,0.5))",
          }}
        >
          CYCLOPE L'HÉRITIER
        </h1>
        <span
          className="mt-1 text-[0.65rem] font-bold tracking-[0.18em]"
          style={{ fontFamily: "'Space Grotesk', sans-serif", color: "rgba(255,233,214,0.75)" }}
        >
          @cyclope_heritier · 250K
        </span>
      </div>
    </header>
  );
};

export default CyclopeHeader;