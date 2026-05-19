// api/src/utils/vipNotify.ts
// Notifications declenchees a chaque nouveau lead VIP :
//   1) Email de bienvenue HTML au lead (via Brevo, sender aurixvip@gmail.com)
//   2) Notif Discord webhook dans le salon "gestion" d'Aurix
//
// Async, non-bloquant : si une etape echoue, on log et on continue (l'INSERT
// DB ne doit JAMAIS etre bloque par un fail email/Discord).
//
// Config requise (env vars LunaLive-API sur Render) :
//   - BREVO_API_KEY    : cle API Brevo (deja set)
//   - VIP_EMAIL_FROM   : sender validé Brevo (defaut "Aurix VIP <aurixvip@gmail.com>")
//   - VIP_DISCORD_WEBHOOK_URL : URL webhook Discord (salon gestion). Optionnel.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUBJECT = "👑 Bienvenue au Club VIP Celsius Casino";
const TEXT_FALLBACK = `Bienvenue au Club VIP - Celsius Casino

Votre demande a ete recue. Vous faites desormais partie d'un cercle privilegie.

Vos avantages exclusifs :
- Bonus exclusifs (offres dediees invisibles du public)
- Boost sur depot (% bonus recharge sur chaque depot)
- Bonus wager x1 (sommes retirables avec 1 seule mise)
- Cashback augmente (% remboursement booste sur pertes)
- Retraits prioritaires (traitement express sous 24h)
- Host dedie 24/7 (ligne directe sur Telegram)

EXCLUSIVITE CELSIUS - VIP Transfert
Vous jouez deja sur un autre casino ? Nous transferons votre progression
complete (niveau VIP, statut, historique) directement sur Celsius Casino.

Etape finale : Contactez votre VIP Host Manager sur Telegram
https://t.me/Aurix_VipManager
Ou cherchez : @Aurix_VipManager

Reponse 24h - Confidentiel - Sans engagement
---
Reserve aux 18+. Les jeux d'argent comportent des risques.
Aide : 09 74 75 13 13 - joueurs-info-service.fr
`;
// Lecture du template HTML (au boot du module, mise en cache).
// Le fichier est expose par api/Dockerfile / build process (cf. note plus bas).
let cachedHtml = null;
function getHtmlTemplate() {
    if (cachedHtml)
        return cachedHtml;
    const candidates = [
        path.resolve(__dirname, "../../../email-templates/vip-welcome.html"), // dev (api/src/utils → repo root)
        path.resolve(__dirname, "../../email-templates/vip-welcome.html"), // build (dist/utils → api/)
        path.resolve(process.cwd(), "email-templates/vip-welcome.html"), // cwd
        path.resolve(process.cwd(), "../email-templates/vip-welcome.html"),
    ];
    for (const p of candidates) {
        try {
            const content = fs.readFileSync(p, "utf8");
            cachedHtml = content;
            return content;
        }
        catch { /* try next */ }
    }
    // Fallback texte si template introuvable (build sans copy)
    console.warn("[vipNotify] HTML template introuvable, fallback texte");
    return `<pre style="font-family:system-ui;padding:24px;">${TEXT_FALLBACK}</pre>`;
}
function parseFrom(raw) {
    const s = String(raw || "").trim();
    const m = s.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
    if (m)
        return { name: m[1]?.trim() || "Aurix VIP", email: m[2].trim() };
    return { name: "Aurix VIP", email: s };
}
/** Envoie le mail VIP welcome via Brevo HTTP API. */
async function sendVipEmail(to) {
    const apiKey = String(process.env.BREVO_API_KEY || "").trim();
    if (!apiKey)
        return { ok: false, error: "BREVO_API_KEY missing" };
    const fromRaw = String(process.env.VIP_EMAIL_FROM || "Aurix VIP <aurixvip@gmail.com>");
    const from = parseFrom(fromRaw);
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10_000);
    try {
        const r = await fetch("https://api.brevo.com/v3/smtp/email", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "api-key": apiKey,
                "accept": "application/json",
            },
            body: JSON.stringify({
                sender: { name: from.name, email: from.email },
                to: [{ email: to }],
                subject: SUBJECT,
                textContent: TEXT_FALLBACK,
                htmlContent: getHtmlTemplate(),
            }),
            signal: controller.signal,
        });
        if (!r.ok) {
            const body = await r.text().catch(() => "");
            return { ok: false, error: `Brevo ${r.status}: ${body.slice(0, 200)}` };
        }
        return { ok: true };
    }
    catch (err) {
        return { ok: false, error: String(err?.message || err) };
    }
    finally {
        clearTimeout(t);
    }
}
/** Notif Discord webhook (salon gestion Aurix). Optionnel — si pas d'URL set, no-op. */
async function notifyDiscord(payload) {
    const url = String(process.env.VIP_DISCORD_WEBHOOK_URL || "").trim();
    if (!url)
        return { ok: true }; // webhook pas configure → on skip silencieusement
    const embed = {
        title: "👑 Nouveau lead VIP",
        description: `Un visiteur s'est inscrit comme **gros joueur** via une page affi.`,
        color: 0xFFB930, // or doré
        fields: [
            { name: "📧 Email", value: payload.email, inline: false },
            { name: "🔗 Slug / Page", value: `\`${payload.slug}\`${payload.pageId ? ` (page #${payload.pageId})` : ""}`, inline: true },
            { name: "🌐 Referrer", value: payload.referrer ? `\`${String(payload.referrer).slice(0, 100)}\`` : "_direct_", inline: true },
        ],
        footer: { text: "Aurix · Club VIP Celsius Casino" },
        timestamp: new Date().toISOString(),
    };
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 6_000);
    try {
        const r = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: "Aurix VIP",
                avatar_url: "https://cdn-icons-png.flaticon.com/512/2278/2278992.png", // couronne dorée publique
                embeds: [embed],
            }),
            signal: controller.signal,
        });
        if (!r.ok) {
            const body = await r.text().catch(() => "");
            return { ok: false, error: `Discord ${r.status}: ${body.slice(0, 200)}` };
        }
        return { ok: true };
    }
    catch (err) {
        return { ok: false, error: String(err?.message || err) };
    }
    finally {
        clearTimeout(t);
    }
}
/** Pipeline complete : email + Discord. Async, non-bloquant, log les fails. */
export function notifyVipLeadAsync(payload) {
    // Fire-and-forget : on N'ATTEND PAS le retour (l'endpoint REST a deja repondu OK).
    (async () => {
        const [emailRes, discordRes] = await Promise.all([
            sendVipEmail(payload.email),
            notifyDiscord(payload),
        ]);
        if (!emailRes.ok) {
            console.warn(`[vipNotify] email failed for ${payload.email} : ${emailRes.error}`);
        }
        else {
            console.log(`[vipNotify] email sent to ${payload.email}`);
        }
        if (!discordRes.ok) {
            console.warn(`[vipNotify] discord failed for ${payload.email} : ${discordRes.error}`);
        }
        else if (process.env.VIP_DISCORD_WEBHOOK_URL) {
            console.log(`[vipNotify] discord notified for ${payload.email}`);
        }
    })().catch((err) => {
        console.error("[vipNotify] unexpected error:", err);
    });
}
