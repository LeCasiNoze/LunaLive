// api/src/utils/mailer.ts
import * as nodemailer from "nodemailer";

type SmtpConf = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
};

function readEnv(): SmtpConf {
  const host = String(process.env.SMTP_HOST || "").trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE ?? "0") === "1"; // 465=>true, 587=>false (STARTTLS)
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim();
  const from = String(process.env.EMAIL_FROM || user).trim();
  return { host, port, secure, user, pass, from };
}

export function isSmtpReady(): boolean {
  const { host, user, pass, from } = readEnv();
  return !!(host && user && pass && from);
}

let cachedKey = "";
let transporter: nodemailer.Transporter | null = null;

function makeKey(c: SmtpConf) {
  return `${c.host}|${c.port}|${c.secure ? 1 : 0}|${c.user}|${c.from}`;
}

export function getTransport(): nodemailer.Transporter {
  const conf = readEnv();
  const key = makeKey(conf);

  if (!isSmtpReady()) {
    const dbg = { ...conf, pass: conf.pass ? "***" : "" };
    console.warn("[mailer] SMTP not ready:", dbg);
    throw new Error("SMTP_NOT_CONFIGURED");
  }

  if (transporter && key === cachedKey) return transporter;

  transporter = nodemailer.createTransport({
    host: conf.host,
    port: conf.port,
    secure: conf.secure,
    auth: { user: conf.user, pass: conf.pass },

    // ✅ évite que la requête /auth/register reste bloquée
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  cachedKey = key;
  return transporter;
}

export async function verifyTransport(): Promise<void> {
  const t = getTransport();
  const conf = readEnv();
  console.log("[mailer] verify():", {
    host: conf.host,
    port: conf.port,
    secure: conf.secure,
    user: conf.user ? "set" : "missing",
    from: conf.from,
  });
  await t.verify();
}

export async function sendVerifyCode(to: string, code: string, minutes = 15) {
  const t = getTransport();
  const { from } = readEnv();

  const info = await t.sendMail({
    from,
    to,
    subject: "Votre code de vérification LunaLive",
    text: `Code : ${code} (valable ${minutes} minutes)`,
    html: `
      <div style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial">
        <h2>Vérification LunaLive</h2>
        <p>Voici votre code (valable ${minutes} minutes) :</p>
        <p style="font-size:28px;font-weight:800;letter-spacing:6px;margin:16px 0">${code}</p>
        <p>Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p>
      </div>
    `,
  });

  return info;
}
