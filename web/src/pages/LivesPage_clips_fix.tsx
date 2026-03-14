// web/src/pages/LivesPage_clips_fix.tsx
// Fix minimal pour clips du mois - lazy loading + optimisation thumbnails

// ✅ FIX 1: Remplacer clipThumb par img avec lazy loading
// Ancien code (L1152-1160):
/*
<div className="clipThumb" style={{ backgroundImage: `url(${thumb})` }} />
*/

// Nouveau code avec lazy loading:
const ClipThumbFixed = ({ thumb, alt = "" }: { thumb: string; alt?: string }) => (
  <img
    src={thumb}
    alt={alt}
    loading="lazy"
    style={{
      width: "100%",
      height: "100%",
      objectFit: "cover",
      backgroundColor: "#1a1a1a",
    }}
    onError={(e) => {
      // Fallback si thumbnail échoue
      const target = e.currentTarget;
      target.style.display = "none";
      const parent = target.parentElement;
      if (parent) {
        parent.style.background = `linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%)`;
        parent.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:white;font-size:24px;">🎬</div>';
      }
    }}
    onLoad={(e) => {
      // Cacher loader si présent
      const target = e.currentTarget;
      target.style.opacity = "1";
    }}
  />
);

// ✅ FIX 2: Optimiser MonthClipsListModal pour éviter les thumbUrl vidéo
// Ancien comportement: utilisait thumbUrl qui pouvait déclencher FFMPEG
// Nouveau comportement: utilise avatarUrl uniquement dans les listes

const MonthClipsListItemFixed = ({ clip, onClick }: { clip: ClipVM; onClick: () => void }) => {
  const name = clip.streamerName || clip.streamerSlug || "Streamer";
  
  return (
    <button
      key={clip.id}
      type="button"
      className="cpm-list-item"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "12px 16px",
        border: "none",
        background: "transparent",
        width: "100%",
        textAlign: "left",
        cursor: "pointer",
        borderRadius: "8px",
        transition: "background-color 200ms",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "rgba(124, 92, 252, 0.1)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      {/* Avatar uniquement - pas de thumbnail vidéo */}
      <div
        className="cpm-list-avatar"
        aria-hidden
        style={{
          width: "40px",
          height: "40px",
          borderRadius: "50%",
          overflow: "hidden",
          flexShrink: 0,
          background: clip.avatarUrl
            ? `url(${clip.avatarUrl}) center/cover`
            : `linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontSize: "16px",
        }}
      >
        {!clip.avatarUrl && "👤"}
      </div>

      <div className="cpm-list-info" style={{ flex: 1, minWidth: 0 }}>
        <div
          className="cpm-list-title"
          style={{
            fontSize: "14px",
            fontWeight: "600",
            color: "#fff",
            marginBottom: "4px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {clip.title || "(sans titre)"}
        </div>
        <div
          className="cpm-list-sub"
          style={{
            fontSize: "12px",
            color: "#9ca3af",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {name} · {timeAgo(clip.createdAtMs)} · {fmtDuration(clip.durationSec)}
        </div>
      </div>

      <div
        className="cpm-list-right"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: "4px",
          flexShrink: 0,
        }}
      >
        <div
          className="cpm-list-likes"
          title="Likes"
          style={{
            fontSize: "12px",
            color: "#ef4444",
            fontWeight: "600",
          }}
        >
          ❤️ {Number(clip.likesCount || 0)}
        </div>
        <div
          className="cpm-list-open"
          style={{
            fontSize: "11px",
            color: "#7c3aed",
            fontWeight: "500",
          }}
        >
          ▶ Ouvrir
        </div>
      </div>
    </button>
  );
};

// ✅ FIX 3: Clips du mois avec lazy loading
const ClipsGridFixed = ({ clips, hasMoreThan4, onClickMonthClip }: {
  clips: ClipVM[];
  hasMoreThan4: boolean;
  onClickMonthClip: (clip: ClipVM) => void;
}) => {
  return (
    <div className="clipsGrid">
      {clips.map((c, idx) => {
        const raw = c.thumbUrl ? absolutize(c.thumbUrl) || c.thumbUrl : null;
        const thumb = raw || svgThumb(c.streamerName || c.streamerSlug || "Clip");
        const corner = (["tl", "tr", "bl", "br"] as const)[idx] ?? "tl";

        return (
          <button
            key={c.id}
            type="button"
            className="clipTile hoverGlow"
            onClick={() => onClickMonthClip(c)}
            style={{
              textDecoration: "none",
              color: "inherit",
              display: "block",
              padding: 0,
              cursor: "pointer",
              position: "relative",
              aspectRatio: "16/9",
              borderRadius: "12px",
              overflow: "hidden",
              background: "#1a1a1a",
            }}
            title={hasMoreThan4 ? "Ouvrir la liste des clips du mois" : c.title ? `${c.title} — ${c.likesCount} likes` : `${c.likesCount} likes`}
          >
            {/* ✅ FIX: Utiliser ClipThumbFixed avec lazy loading */}
            <ClipThumbFixed thumb={thumb} alt={c.title || `Clip ${c.id}`} />
            
            <div
              className="clipPlay"
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                background: "rgba(0,0,0,0.7)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontSize: "14px",
                opacity: 0,
                transition: "opacity 200ms",
              }}
            >
              <span>▶</span>
            </div>
            
            <ClipLikesBadge likes={c.likesCount} corner={corner} />
            
            {c.avatarUrl ? (
              <div
                className="clipAvatar"
                style={{
                  position: "absolute",
                  bottom: "8px",
                  left: "8px",
                  width: "24px",
                  height: "24px",
                  borderRadius: "50%",
                  overflow: "hidden",
                  border: "2px solid rgba(0,0,0,0.5)",
                }}
              >
                <img
                  src={absolutize(c.avatarUrl) || c.avatarUrl}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            ) : null}
          </button>
        );
      })}
    </div>
  );
};

// Export des composants fixes
export {
  ClipThumbFixed,
  MonthClipsListItemFixed,
  ClipsGridFixed,
};

// Helper functions (à importer depuis le fichier original)
function timeAgo(ms: number): string {
  // Implémentation existante...
  return "";
}

function fmtDuration(sec: number): string {
  // Implémentation existante...
  return "";
}

function svgThumb(name: string): string {
  // Implémentation existante...
  return "";
}

function absolutize(url: string): string {
  // Implémentation existante...
  return url;
}
