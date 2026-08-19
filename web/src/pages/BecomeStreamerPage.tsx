import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Bot, Check, ChevronDown, Clapperboard, Instagram, MessageCircle, Radio, Rocket, ShieldCheck } from "lucide-react";
import { applyStreamer } from "../lib/api";
import { useAuth } from "../auth/AuthProvider";
import { LoginModal } from "../components/LoginModal";
import "./become-streamer.css";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");
const INSTAGRAM_URL = "https://www.instagram.com/lunalive_tv/";
const DISCORD_URL = "https://discord.gg/93BFrsBWWB";

// Vrais streamers de la plateforme (avatars servis par /avatars/u/:userId).
const FEATURED = [
  { name: "LeCasiNoze", id: 4 }, { name: "FamilyBears", id: 67 }, { name: "LaMise", id: 76 },
  { name: "SpyKatra", id: 5 }, { name: "RedakB", id: 13 }, { name: "le-Joker", id: 22 }, { name: "jojocasino", id: 38 },
];

const BOT_TOOLS: [string, string][] = [
  ["🎰", "Calls de slots"], ["🎯", "Bonus Hunt"], ["⌨️", "Commandes"], ["📣", "Autopost"],
  ["🖥️", "Widgets OBS"], ["📊", "Logs & modération"],
];

const FAQ: [string, string][] = [
  ["Ça me coûte quoi ?", "Rien. Le bot et tous les outils sont 100% gratuits. On se rémunère uniquement sur une petite part des abonnements — on ne gagne que si tu gagnes."],
  ["Je dois quitter Rumble ?", "Non. Tu continues à streamer sur Rumble exactement comme aujourd'hui. LunaLive s'ajoute comme ta maison communautaire et ta seconde vitrine."],
  ["Combien de temps pour être prêt ?", "Dix minutes. Et souvent ta chaîne existe déjà sur LunaLive : il suffit de nous le dire et tu la récupères."],
  ["Comment marchent les abonnements ?", "Un viewer met 5€ (500 rubis), s'abonne à ta chaîne, et tu récupères 450 rubis retirables — soit 4,50€ directement dans ta poche."],
  ["Et les clips ?", "Notre système reconnaît tes gros moments en live (gros wins, surtout Hacksaw & Pragmatic), les clippe, les monte et les publie tout seul. Ta pub tourne pendant que tu joues."],
];

function Reveal({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} initial={reduce ? false : { opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-70px" }} transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}>
      {children}
    </motion.div>
  );
}

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function BecomeStreamerPage() {
  const { token, user } = useAuth();
  const [loginOpen, setLoginOpen] = React.useState(false);
  const [channel, setChannel] = React.useState("");
  const [contact, setContact] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    document.title = "Devenir streamer sur LunaLive — La maison de ta communauté";
    const description = "Garde ton stream Rumble et ajoute LunaLive : bot gratuit, clips automatiques, events communautaires et jusqu'à 90% des abonnements pour toi.";
    let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (!meta) { meta = document.createElement("meta"); meta.name = "description"; document.head.appendChild(meta); }
    meta.content = description;
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (!channel.trim() || !contact.trim()) { setError("Indique ta chaîne et un moyen de te contacter."); return; }
    if (!token) { setLoginOpen(true); return; }
    setBusy(true);
    try {
      const raw = channel.trim();
      const channelUrl = /^https?:\/\//i.test(raw) ? raw : `https://rumble.com/user/${raw.replace(/^@/, "")}`;
      await applyStreamer(token, { channelUrl, hasChannel: true, discord: contact.trim(), notes: message.trim() || null, rulesAccepted: true });
      setDone(true);
    } catch (err: any) { setError(err?.message || "La candidature n'a pas pu partir. Réessaie dans un instant."); }
    finally { setBusy(false); }
  }

  return (
    <main className="bs-page">
      <div className="bs-bg" aria-hidden>
        <span className="bs-orb v" /><span className="bs-orb c" /><span className="bs-orb p" />
      </div>
      <div className="bs-scan" aria-hidden />

      {/* HERO */}
      <section className="bs-hero">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
          <div className="bs-eyebrow"><span className="bs-live-dot" /> La maison des streamers casino FR</div>
          <h1 style={{ marginTop: 18 }}>Ton live mérite<span className="line2">une <span className="neon-v">vraie commu.</span></span></h1>
          <p className="bs-lead">Continue de streamer sur Rumble. LunaLive ajoute tout ce qui lui manque : une scène communautaire, un bot complet et une machine à transformer tes lives en croissance.</p>
          <div className="bs-actions">
            <button className="bs-btn bs-primary" onClick={() => scrollTo("candidature")}>Rejoindre LunaLive <Rocket size={18} /></button>
            <button className="bs-btn bs-secondary" onClick={() => scrollTo("deal")}>Le deal <ChevronDown size={17} /></button>
          </div>
          <div className="bs-trust">
            <span><Check size={15} /> 100% gratuit</span>
            <span><Check size={15} /> Tu gardes Rumble</span>
            <span><Check size={15} /> Prêt en 10 min</span>
          </div>
        </motion.div>
        <motion.div className="bs-mock" initial={{ opacity: 0, scale: 0.94, x: 22 }} animate={{ opacity: 1, scale: 1, x: 0 }} transition={{ duration: 0.8, delay: 0.12 }}>
          <div className="halo" />
          <div className="bs-panel">
            <div className="top">
              <div className="av" />
              <div><div className="nm">LeCasiNoze</div><div className="st">chat en direct</div></div>
              <span className="live">● LIVE</span>
            </div>
            <div className="bs-feed">
              <div className="bs-ev raid"><div className="r"><div className="ic">⚔️</div><div><div className="t">Raid en cours</div><div className="s">TeufeurS débarque</div></div><div className="chip">+1,4k</div></div></div>
              <div className="bs-ev sub"><div className="r"><div className="ic">⭐</div><div><div className="t">Nouvel abonné</div><div className="s">LeParieur99 s'abonne</div></div><div className="chip">3 mois</div></div></div>
              <div className="bs-ev rain"><div className="r"><div className="ic">💎</div><div><div className="t">Rain de rubis</div><div className="s">1200 rubis à partager</div></div><div className="chip">00:42</div></div></div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* DEAL */}
      <section id="deal">
        <Reveal className="bs-head"><span className="bs-eyebrow">Le deal</span><h2>Tu apportes le live.<br />On amplifie <span className="neon-c">tout le reste.</span></h2></Reveal>
        <div className="bs-deal">
          <Reveal><div className="bs-dc v" onClick={() => scrollTo("tout")}><div className="ic"><Bot size={24} /></div><div className="tag">100% GRATUIT</div><h3>Le bot complet</h3><p>Calls, hunt, roue, rain, prédictions, coffre, widgets OBS, commandes. Tout, sans un centime.</p><span className="more">Voir le détail →</span></div></Reveal>
          <Reveal><div className="bs-dc c" onClick={() => scrollTo("tout")}><div className="ic"><Clapperboard size={24} /></div><div className="tag">PUB AUTOMATIQUE</div><h3>La machine à clips</h3><p>Tes gros wins clippés, montés et publiés tout seuls, prêts pour TikTok & Shorts. Ta pub tourne toute seule.</p><span className="more">Voir le détail →</span></div></Reveal>
          <Reveal><div className="bs-dc g" onClick={() => scrollTo("eco")}><div className="huge">90%<small>des abonnements pour toi</small></div><p>500 rubis = un sub à 5€ → tu récupères 450 rubis retirables, soit <b>4,50€</b>.</p><span className="more">Voir le détail →</span></div></Reveal>
          <Reveal><div className="bs-dc p" onClick={() => scrollTo("tout")}><div className="ic"><Radio size={24} /></div><div className="tag">ZÉRO RUPTURE</div><h3>Double visibilité</h3><p>Rumble reste ton flux. LunaLive devient ton hub. Ta chaîne est souvent déjà prête à récupérer.</p><span className="more">Voir le détail →</span></div></Reveal>
        </div>
      </section>

      {/* MEGA SHOWCASE */}
      <section id="tout">
        <Reveal className="bs-head"><span className="bs-eyebrow">Tout ce que t'as</span><h2>Une couche de jeu <span className="neon-v">que personne d'autre</span> n'offre à ce public.</h2><p>Le vrai différenciateur : de quoi faire revenir ta commu et la pousser à l'activité, chaque live.</p></Reveal>
        <div className="bs-mega">
          <Reveal className="bs-tile big roue"><span className="e">🎡</span><h4>La roue, en 2 clics</h4><p>Ailleurs : site externe, noms ajoutés à la main. Ici : tu lances depuis le chat, les viewers cliquent « Rejoindre », leur nom est direct dedans. Conditions follow/sub possibles, et le tirage est global — tout le monde y assiste en live sur ton écran.</p></Reveal>
          <Reveal className="bs-tile big clips"><span className="e">✂️</span><h4>Clips en pilote auto</h4><p>Ailleurs : tu DL ta VOD et tu coupes à la main. Ici : <b>!clip</b> en live pour tes réseaux — et notre programme reconnaît tes gros wins (surtout Hacksaw & Pragmatic), clippe, monte et publie tout seul.</p></Reveal>
          <Reveal className="bs-tile coffre"><span className="e">📦</span><h4>Coffre</h4><p>Régale ta commu : l'activité et les events remplissent un coffre. Avec ces rubis, tes viewers se sub, s'offrent des cosmétiques ou améliorent leur compte.</p></Reveal>
          <Reveal className="bs-tile rain"><span className="e">💎</span><h4>Rain de rubis</h4><p>Distribue régulièrement des points. Entretient la rétention et pousse même les plus discrets à participer.</p></Reveal>
          <Reveal className="bs-tile pred"><span className="e">🔮</span><h4>Prédictions</h4><p>Disparues depuis Twitch & Kick — le grand retour. Tes viewers parient leurs rubis sur l'issue. De l'enjeu, de l'activité.</p></Reveal>
          <Reveal className="bs-tile perso big"><span className="e">🏆</span><h4>Perso & succès — du jamais-vu</h4><p>Un niveau de personnalisation inédit : pseudos animés, cadrans, badges, titres. Tes viewers passent du temps à débloquer le skin le plus rare en complétant des succès — pour se la péter. Rétention et activité au max.</p></Reveal>
          <Reveal className="bs-tile discord"><span className="e">🤖</span><h4>Bot Discord</h4><p>Bienvenue, notifs, gestion des doubles comptes, tickets — et plus à venir.</p></Reveal>
        </div>
        <Reveal><div className="bs-pills">
          <span className="bs-tile-free" />
          {BOT_TOOLS.map(([e, l]) => <span key={l} className="bs-pill">{e} {l}</span>)}
          <span className="bs-pill" style={{ color: "var(--green)", borderColor: "rgba(52,211,153,.4)" }}>✓ Tout est gratuit</span>
        </div></Reveal>
      </section>

      {/* ECONOMY */}
      <section id="eco">
        <Reveal className="bs-head"><span className="bs-eyebrow">Tes revenus</span><h2>90% des abos, <span className="neon-g">dans ta poche.</span></h2></Reveal>
        <Reveal><div className="bs-eco">
          <div className="node"><div className="big">5€</div><small>500 rubis achetés</small></div>
          <div className="arrow">→</div>
          <div className="node"><div className="big">SUB</div><small>à ta chaîne</small></div>
          <div className="arrow">→</div>
          <div className="node win"><div className="big">4,50€</div><small>450 rubis retirables — pour toi</small></div>
        </div></Reveal>
      </section>

      {/* PROOF */}
      <section>
        <Reveal><div className="bs-proof">
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div className="bs-avs">
              {FEATURED.map((s) => (
                <div className="a" key={s.id} title={s.name}>
                  <span>{s.name.replace(/[^A-Za-z]/g, "").slice(0, 1).toUpperCase()}</span>
                  <img src={`${API_BASE}/avatars/u/${s.id}`} alt={s.name} loading="lazy" onError={(e) => e.currentTarget.remove()} />
                </div>
              ))}
            </div>
            <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: "var(--muted)" }}>Ils streament déjà sur <b style={{ color: "#fff" }}>LunaLive</b></div>
          </div>
          <div className="bs-stats">
            <div className="bs-stat"><div className="n neon-v">30+</div><div className="l">Streamers</div></div>
            <div className="bs-stat"><div className="n neon-c">90+</div><div className="l">Clips générés</div></div>
          </div>
          <a className="bs-ig" href={INSTAGRAM_URL} target="_blank" rel="noreferrer"><Instagram size={18} /> @lunalive_tv</a>
        </div></Reveal>
      </section>

      {/* FAQ */}
      <section>
        <Reveal className="bs-head"><span className="bs-eyebrow">FAQ</span><h2>Les réponses <span className="neon-c">avant même</span> que tu demandes.</h2></Reveal>
        <div className="bs-faq">
          {FAQ.map(([q, a]) => (
            <Reveal key={q}><details><summary>{q}<ChevronDown size={20} /></summary><p>{a}</p></details></Reveal>
          ))}
        </div>
      </section>

      {/* APPLY */}
      <section className="bs-apply" id="candidature">
        <Reveal>
          <span className="bs-eyebrow">Ta place</span>
          <h2 style={{ marginTop: 14 }}>Prends ta place<br /><span className="neon-p">du bon côté.</span></h2>
          <p className="a-lead">Donne-nous juste de quoi retrouver ta chaîne. On te recontacte vite et on installe tout avec toi.</p>
          <ul>
            <li><Check size={16} /> Inscription en 30 secondes</li>
            <li><Check size={16} /> Aucun engagement</li>
            <li><Check size={16} /> Accompagnement humain</li>
          </ul>
          <div className="bs-discord-help">
            <p>Une question avant de te lancer ? Viens directement en parler avec nous.</p>
            <a className="bs-btn bs-discord-btn" href={DISCORD_URL} target="_blank" rel="noreferrer">
              <MessageCircle size={18} /> Poser une question sur Discord
            </a>
          </div>
        </Reveal>
        <div className="bs-formcard">
          {done ? (
            <div className="bs-success"><div className="ok">✓</div><h3>Candidature envoyée</h3><p>On revient vers toi très vite. Bienvenue dans la prochaine étape 🌙</p></div>
          ) : (
            <form onSubmit={submit}>
              <div className="bs-formhead"><span>Ta candidature</span><small>{user ? `Connecté : ${user.username}` : "Connexion requise à l'envoi"}</small></div>
              <label>Pseudo ou chaîne Rumble<input value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="Ex. @tonpseudo" autoComplete="username" /></label>
              <label>Discord, Instagram ou email<input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Là où l'on peut te joindre" /></label>
              <label>Un mot sur ton live <span>(optionnel)</span><textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Ta communauté, tes horaires, ce que tu veux construire…" rows={3} /></label>
              {error && <p className="bs-err">{error}</p>}
              <button className="bs-btn bs-primary bs-submit" disabled={busy}>{busy ? "Envoi…" : token ? "Envoyer ma candidature" : "Se connecter et candidater"} <Rocket size={18} /></button>
              <div className="bs-privacy"><ShieldCheck size={13} /> Tes infos servent uniquement à te recontacter.</div>
            </form>
          )}
        </div>
      </section>

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </main>
  );
}
