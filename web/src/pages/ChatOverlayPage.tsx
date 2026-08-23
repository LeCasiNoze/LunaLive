import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { NativeOverlayChat } from "./OverlayPage";

const LUNA_API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)
  ?? "https://lunalive-api.onrender.com";

export default function ChatOverlayPage() {
  const [searchParams] = useSearchParams();

  const slug = searchParams.get("slug") || "";
  const api = searchParams.get("api") || LUNA_API_BASE;
  const fontSize = Number(searchParams.get("font")) || 14;
  const maxMessages = Number(searchParams.get("max")) || 8;
  const scale = Number(searchParams.get("scale")) || 1;
  const maxWidth = Number(searchParams.get("mw")) || 420;
  const isPreview = searchParams.get("preview") === "1";
  const align = (searchParams.get("align") as "left" | "center" | "right") || "center";
  const msgBgOpacity = Number(searchParams.get("msgbg")) || 0.92;

  React.useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    document.body.style.overflow = "hidden";
  }, []);

  if (!slug) {
    return (
      <div style={{ color: "#fff", padding: 20, fontFamily: "sans-serif", fontSize: 13, opacity: 0.7 }}>
        Veuillez spécifier un slug dans l'URL: ?slug=votre_pseudo
      </div>
    );
  }

  return (
    <div style={{ width: "100vw", height: "100vh", background: "transparent", overflow: "hidden" }}>
      <NativeOverlayChat
        slug={slug}
        socketBase={api}
        fontSize={fontSize}
        maxMessages={maxMessages}
        scale={scale}
        maxWidth={maxWidth}
        previewMessage={isPreview ? "Bienvenue sur le chat LunaLive !" : undefined}
        align={align}
        msgBgOpacity={msgBgOpacity}
      />
    </div>
  );
}
