import { Link } from "react-router-dom";

const PAGE_CSS = `
.exti{
  --bg:#060d1c;--panel:#0a1628;--surface:#0e1d38;
  --bd:rgba(60,95,175,.18);--bd-s:rgba(99,140,220,.32);
  --text:#dde8ff;--muted:rgba(148,178,232,.62);
  --p:#6366f1;--green:#10b981;
  color:var(--text);font-size:14px;line-height:1.5;
}
.exti-shell{
  max-width:760px;margin:36px auto;padding:36px 28px 60px;
  background:
    radial-gradient(ellipse 80% 50% at 0% 0%,rgba(255,0,80,.10),transparent 55%),
    radial-gradient(ellipse 80% 50% at 100% 0%,rgba(0,242,234,.08),transparent 55%),
    var(--bg);
  border-radius:24px;border:1px solid var(--bd);
  box-shadow:0 32px 80px rgba(0,0,0,.55);
}
.exti-hero{text-align:center;margin-bottom:28px}
.exti-hero h1{
  margin:0 0 10px;font-size:34px;font-weight:800;letter-spacing:-.04em;
  background:linear-gradient(135deg,#ff0050,#a855f7,#00f2ea);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
}
.exti-hero p{margin:0;color:var(--muted);font-size:15px}
.exti-cta{
  display:flex;justify-content:center;margin:24px 0 30px;
}
.exti-dl{
  display:inline-flex;align-items:center;gap:12px;padding:18px 32px;
  border-radius:16px;font-weight:800;font-size:17px;color:#fff;text-decoration:none;
  background:linear-gradient(135deg,#ff0050 0%,#a855f7 100%);
  box-shadow:0 6px 28px rgba(255,0,80,.4);transition:transform .15s,box-shadow .15s;
  border:1px solid rgba(255,255,255,.1);
}
.exti-dl:hover{transform:translateY(-2px);box-shadow:0 10px 40px rgba(255,0,80,.55)}
.exti-step{
  display:flex;gap:18px;padding:18px 22px;margin-bottom:14px;
  border-radius:16px;border:1px solid var(--bd);background:var(--panel);
}
.exti-step-num{
  flex-shrink:0;width:42px;height:42px;border-radius:50%;
  background:linear-gradient(135deg,var(--p),#8b5cf6);
  display:grid;place-items:center;color:#fff;font-weight:800;font-size:18px;
}
.exti-step-body strong{display:block;font-size:15px;font-weight:800;margin-bottom:4px;color:var(--text)}
.exti-step-body{flex:1;color:var(--muted);font-size:13.5px;line-height:1.6}
.exti-step-body code{
  background:rgba(255,255,255,.06);padding:2px 8px;border-radius:6px;
  font-size:12.5px;color:#fbbf24;font-family:ui-monospace,Menlo,Consolas,monospace;
}
.exti-tip{
  margin:24px 0 0;padding:14px 18px;border-radius:14px;
  background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.25);
  color:#34d399;font-size:13px;line-height:1.6;
}
.exti-tip strong{color:#6ee7b7}
.exti-foot{
  text-align:center;margin-top:28px;color:var(--muted);font-size:12.5px;
}
.exti-foot a{color:#a5b4fc;text-decoration:none}
.exti-foot a:hover{text-decoration:underline}
`;

export default function ExtensionInstallPage() {
  return (
    <main className="exti">
      <style>{PAGE_CSS}</style>
      <div className="exti-shell">
        <div className="exti-hero">
          <h1>📥 Extension LunaLive TikTok</h1>
          <p>
            Active la récolte automatique d'influenceurs TikTok depuis ton navigateur.
            <br />
            Compatible Chrome, Edge, Brave et Opera.
          </p>
        </div>

        <div className="exti-cta">
          <a className="exti-dl" href="/lunalive-tiktok-discoverer.zip" download>
            ⬇️ Télécharger l'extension (.zip)
          </a>
        </div>

        <div className="exti-step">
          <div className="exti-step-num">1</div>
          <div className="exti-step-body">
            <strong>Décompresse le .zip</strong>
            Extrais le fichier <code>lunalive-tiktok-discoverer.zip</code> téléchargé. Tu obtiens un
            dossier <code>lunalive-tiktok-discoverer</code> — pose-le où tu veux mais ne le supprime
            pas après l'install (Chrome en a besoin pour faire tourner l'extension).
          </div>
        </div>

        <div className="exti-step">
          <div className="exti-step-num">2</div>
          <div className="exti-step-body">
            <strong>Ouvre la page extensions du navigateur</strong>
            Colle dans la barre d'adresse :
            <br />
            <code>chrome://extensions</code> &nbsp;·&nbsp;
            <code>edge://extensions</code> &nbsp;·&nbsp;
            <code>brave://extensions</code>
          </div>
        </div>

        <div className="exti-step">
          <div className="exti-step-num">3</div>
          <div className="exti-step-body">
            <strong>Active le mode développeur</strong>
            En haut à droite de la page, bascule le toggle <strong>"Mode développeur"</strong> sur ON.
            Trois boutons apparaissent en haut à gauche.
          </div>
        </div>

        <div className="exti-step">
          <div className="exti-step-num">4</div>
          <div className="exti-step-body">
            <strong>Charge l'extension</strong>
            Clique sur <strong>"Charger l'extension non empaquetée"</strong> et sélectionne le
            dossier <code>lunalive-tiktok-discoverer</code> que tu as décompressé. L'extension
            apparaît dans la liste — épingle-la dans la barre Chrome si tu veux.
          </div>
        </div>

        <div className="exti-step">
          <div className="exti-step-num">5</div>
          <div className="exti-step-body">
            <strong>Va sur le FSB Board</strong>
            Ouvre <Link to="/FSB_Board?section=tiktok" style={{ color: "#a5b4fc" }}>
              lunalive.win/FSB_Board → onglet 🎯 TikTok
            </Link>{" "}
            — tu dois voir un badge vert <strong>🟢 Extension active</strong> dans le panel "Récolte
            automatique". Sinon, recharge la page (F5).
          </div>
        </div>

        <div className="exti-tip">
          <strong>💡 Conseil</strong> : connecte-toi à TikTok dans le même navigateur avant de
          lancer une récolte. TikTok te servira plus de contenu (et moins de blocages anti-bot)
          quand tu es loggé.
        </div>

        <div className="exti-foot">
          Tu n'as pas accès au FSB Board ? Demande à l'admin LunaLive.
          <br />
          Bug ou question ? <a href="mailto:contact@lunalive.win">contact@lunalive.win</a>
        </div>
      </div>
    </main>
  );
}
