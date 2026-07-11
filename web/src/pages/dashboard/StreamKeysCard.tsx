import * as React from "react";
import { Check, Copy, Eye, EyeOff, KeyRound, Server, ShieldCheck } from "lucide-react";
import type { ApiStreamConnection } from "../../lib/api";

async function copyText(value: string) { try { await navigator.clipboard.writeText(value); return true; } catch { return false; } }

function SecretRow({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  const [visible, setVisible] = React.useState(false); const [copied, setCopied] = React.useState(false);
  async function copy() { if (await copyText(value)) { setCopied(true); window.setTimeout(() => setCopied(false), 1600); } }
  return <div className="streamSecretRow">
    <div className="streamSecretLabel">{icon}<span>{label}<small>{label === "Adresse du serveur" ? "À coller dans le champ Serveur" : "Ne la partage avec personne"}</small></span></div>
    <code className={visible ? "" : "isMasked"}>{visible ? value : "••••••••••••••••••••••••"}</code>
    <div className="streamSecretActions"><button onClick={() => setVisible(v => !v)}>{visible ? <EyeOff size={16}/> : <Eye size={16}/>} {visible ? "Masquer" : "Afficher"}</button><button onClick={copy}>{copied ? <Check size={16}/> : <Copy size={16}/>} {copied ? "Copié" : "Copier"}</button></div>
  </div>;
}

export function StreamKeysCard({ connection }: { connection: ApiStreamConnection | null }) {
  return <section className="streamSetupCard">
    <div className="streamCardHead"><div className="streamCardIcon"><ShieldCheck size={20}/></div><div><span>ÉTAPE 2</span><h3>Connecte ton logiciel de stream</h3><p>Dans OBS ou Streamlabs, ouvre Paramètres → Stream puis choisis « Personnalisé ».</p></div></div>
    {!connection ? <div className="streamConnectionEmpty"><KeyRound size={25}/><div><strong>Accès de diffusion indisponibles</strong><p>Relie d’abord ta chaîne Rumble depuis la vue d’ensemble pour récupérer tes informations.</p></div></div> : <>
      <div className="streamSecurityNotice"><ShieldCheck size={17}/><span>Ces informations sont sensibles. Elles restent masquées jusqu’à ce que tu choisisses de les afficher.</span></div>
      <div className="streamSecrets"><SecretRow label="Adresse du serveur" value={connection.rtmpUrl} icon={<Server size={18}/>} /><SecretRow label="Clé de stream" value={connection.streamKey} icon={<KeyRound size={18}/>} /></div>
      <ol className="streamSteps"><li><b>1</b><span>Ouvre les paramètres de ton logiciel</span></li><li><b>2</b><span>Choisis un service personnalisé</span></li><li><b>3</b><span>Copie le serveur et la clé ci-dessus</span></li><li><b>4</b><span>Lance ton direct</span></li></ol>
    </>}
  </section>;
}
