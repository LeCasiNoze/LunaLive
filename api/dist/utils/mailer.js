// api/src/utils/mailer.ts
import * as nodemailer from "nodemailer";
function parseFrom(raw) {
    const s = String(raw || "").trim();
    const m = s.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
    if (m)
        return { name: m[1]?.trim() || "LunaLive", email: m[2].trim() };
    return { name: "LunaLive", email: s };
}
function readBrevo() {
    const apiKey = String(process.env.BREVO_API_KEY || "").trim();
    return apiKey ? { apiKey } : null;
}
function readSmtp() {
    const host = String(process.env.SMTP_HOST || "").trim();
    const port = Number(process.env.SMTP_PORT || 587);
    const secure = String(process.env.SMTP_SECURE ?? "0") === "1";
    const user = String(process.env.SMTP_USER || "").trim();
    const pass = String(process.env.SMTP_PASS || "").trim();
    if (!host || !user || !pass)
        return null;
    return { host, port, secure, user, pass };
}
export function isMailReady() {
    const brevo = readBrevo();
    if (brevo)
        return true;
    const smtp = readSmtp();
    return !!smtp;
}
async function sendViaBrevo(to, subject, text, html, opts = {}) {
    const brevo = readBrevo();
    if (!brevo)
        throw new Error("BREVO_NOT_CONFIGURED");
    const fromRaw = String(process.env.EMAIL_FROM || "").trim();
    const from = parseFrom(fromRaw);
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 12_000);
    try {
        const payload = {
            sender: { name: from.name, email: from.email },
            to: [{ email: to }],
            subject,
            textContent: text,
            htmlContent: html,
        };
        if (opts.replyTo) {
            payload.replyTo = { email: opts.replyTo };
        }
        const r = await fetch("https://api.brevo.com/v3/smtp/email", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "api-key": brevo.apiKey,
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });
        if (!r.ok) {
            const body = await r.text().catch(() => "");
            throw new Error(`BREVO_${r.status}: ${body.slice(0, 300)}`);
        }
    }
    finally {
        clearTimeout(t);
    }
}
let smtpTransporter = null;
function getSmtpTransport() {
    const smtp = readSmtp();
    if (!smtp)
        throw new Error("SMTP_NOT_CONFIGURED");
    if (smtpTransporter)
        return smtpTransporter;
    smtpTransporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: { user: smtp.user, pass: smtp.pass },
    });
    return smtpTransporter;
}
async function sendViaSmtp(to, subject, text, html, opts = {}) {
    const t = getSmtpTransport();
    const from = String(process.env.EMAIL_FROM || process.env.SMTP_USER || "").trim();
    const mailOptions = { from, to, subject, text, html };
    if (opts.replyTo)
        mailOptions.replyTo = opts.replyTo;
    await t.sendMail(mailOptions);
}
export async function sendMail(to, subject, text, html, opts = {}) {
    if (readBrevo())
        return sendViaBrevo(to, subject, text, html, opts);
    return sendViaSmtp(to, subject, text, html, opts);
}
export async function sendVerifyCode(to, code, minutes = 15) {
    const subject = "Votre code de vérification LunaLive";
    const text = `Code : ${code} (valable ${minutes} minutes)`;
    const html = `
    <div style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial">
      <h2>Vérification LunaLive</h2>
      <p>Voici votre code (valable ${minutes} minutes) :</p>
      <p style="font-size:28px;font-weight:800;letter-spacing:6px;margin:16px 0">${code}</p>
      <p>Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p>
    </div>
  `;
    // ✅ Priorité Brevo API (évite les timeouts SMTP sur Render)
    if (readBrevo()) {
        return sendViaBrevo(to, subject, text, html);
    }
    // fallback SMTP (local)
    return sendViaSmtp(to, subject, text, html);
}
