import * as React from "react";
import { Clock3, Eye } from "lucide-react";
import type { ApiStreamerPage } from "../../lib/api";
import "./PopupLiveStats.css";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");
const numberFormat = new Intl.NumberFormat("fr-FR");

export function PopupLiveStats({ slug }: { slug: string }) {
  const [stream, setStream] = React.useState<ApiStreamerPage | null>(null);
  const [external, setExternal] = React.useState<Record<string,{live:boolean|null;viewers:number|null;stale:boolean;observedAt:string|null}> | null>(null);
  const [externalError,setExternalError] = React.useState(false);
  const [stale, setStale] = React.useState(false);
  const [now, setNow] = React.useState(Date.now);

  React.useEffect(() => {
    let disposed = false;
    let request: AbortController | null = null;
    setStream(null);
    setExternal(null);setExternalError(false);
    setStale(false);
    const refresh = async () => {
      if (disposed || request) return;
      const controller = new AbortController();
      request = controller;
      const timeout = window.setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(`${API_BASE}/streamers/${encodeURIComponent(slug)}`, {
          signal: controller.signal, cache: "no-store",
        });
        if (!response.ok) throw new Error("stats_unavailable");
        const data = await response.json();
        if (!disposed) { setStream(data); setStale(false); }
      } catch {
        if (!disposed) setStale(true);
      } finally {
        window.clearTimeout(timeout);
        request = null;
      }
    };
    const refreshExternal=async()=>{
      if(slug.toLowerCase()!=='lecasinoze')return;
      try{
        const response=await fetch(`${API_BASE}/streamers/lecasinoze/external-audience`,{cache:'no-store',signal:AbortSignal.timeout(10000)});
        if(!response.ok)throw Error('audience_unavailable');
        const data=await response.json();if(!disposed){setExternal(data.platforms);setExternalError(false);}
      }catch{if(!disposed){setExternal(null);setExternalError(true);}}
    };
    const onVisible = () => { if (document.visibilityState === "visible") {void refresh();void refreshExternal();} };
    void refresh();void refreshExternal();
    const poll = window.setInterval(onVisible, 15000);
    window.addEventListener("online", onVisible);
    window.addEventListener("pageshow", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      request?.abort();
      window.clearInterval(poll);
      window.removeEventListener("online", onVisible);
      window.removeEventListener("pageshow", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [slug]);

  React.useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [stream?.isLive]);

  const luna = stream?.lunaLiveViewers;
  const rumble = stream?.rumbleViewers;
  const hasCounts = luna != null && rumble !== undefined;
  const platformCounts=['kick','twitch'].map(p=>{
    const item=external?.[p];return item&&!externalError&&!item.stale&&item.observedAt&&now-Date.parse(item.observedAt)<90000?item.viewers:null;
  });
  const includeExternal=slug.toLowerCase()==='lecasinoze';
  const incomplete=rumble===null||(includeExternal&&platformCounts.some(n=>n===null));
  const total = hasCounts ? Math.max(0, luna) + Math.max(0, rumble ?? 0)+(includeExternal?platformCounts.reduce<number>((a,b)=>a+(b??0),0):0) : null;
  const started = stream?.liveStartedAt ? Date.parse(stream.liveStartedAt) : NaN;
  const elapsed = Math.max(0, Math.floor((now - started) / 1000));
  const duration = stream?.isLive && Number.isFinite(elapsed)
    ? [Math.floor(elapsed / 3600), Math.floor(elapsed / 60) % 60, elapsed % 60].map(part => String(part).padStart(2, "0")).join(":")
    : "—";
  const status = stale ? (stream ? "Actualisation…" : "Indisponible") : stream ? (stream.isLive ? "En direct" : "Hors ligne") : "Connexion…";
  const breakdown = hasCounts
    ? `LunaLive : ${numberFormat.format(luna)} · Rumble : ${rumble == null ? "indisponible" : numberFormat.format(rumble)}${includeExternal?` · Kick : ${platformCounts[0]??"indisponible"} · Twitch : ${platformCounts[1]??"indisponible"}`:""}`
    : "Nombre de viewers en cours de chargement";

  return (
    <div className={`popup-live-stats${stale ? " popup-live-stats--stale" : ""}`} aria-label="Statistiques du live">
      <span className={`popup-live-stats__status${stream?.isLive && !stale ? " popup-live-stats__status--live" : ""}`}>
        <i aria-hidden="true" />{status}
      </span>
      <span className="popup-live-stats__metric" title={`${breakdown}${stale ? " · Dernière valeur connue, actualisation en attente" : ""}`} aria-label={breakdown}>
        <Eye size={14} aria-hidden="true" />
        <strong>{total == null ? "—" : numberFormat.format(total)}{incomplete ? "+" : ""}</strong>
        <span>viewers</span>
      </span>
      {includeExternal&&(['kick','twitch'] as const).map((platform,index)=>{
        const item=external?.[platform],value=platformCounts[index];
        const label=platform==='kick'?'Kick':'Twitch';
        const status=value===null?'indisponible':item?.live?'en direct':'hors ligne';
        return <span key={platform} className="popup-live-stats__metric" title={`${label} : ${status} · compteur officiel actualisé toutes les 30 s`} aria-label={`${label} : ${value===null?'indisponible':value+' viewers, '+status}`}>
          <span style={{color:platform==='kick'?'#81ed32':'#c8a5ff'}}>{label}</span><strong>{value===null?'—':numberFormat.format(value)}</strong>{value!==null&&!item?.live&&<span>hors ligne</span>}
        </span>;
      })}
      <span className="popup-live-stats__metric" title="Durée du live depuis son démarrage" aria-label={`Durée du live : ${duration}`}>
        <Clock3 size={14} aria-hidden="true" /><strong>{duration}</strong>
      </span>
    </div>
  );
}
