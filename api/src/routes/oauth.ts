// api/src/routes/oauth.ts
//
// Connexion/inscription via Google et Discord, en complément de l'auth
// pseudo+email+mot de passe existante (routes/auth.ts). Le flow est un
// authorization-code classique : /start redirige vers le provider, /callback
// échange le code puis renvoie l'utilisateur sur le front avec le JWT en
// fragment d'URL (#token=...) pour ne jamais le faire transiter par des logs.
import { randomBytes } from "crypto";
import type { Request } from "express";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";
import { a } from "../utils/async.js";
import { hashPassword, signToken } from "../auth.js";
import { getClientIp } from "../utils/client_ip.js";
import { defaultAvatarPath } from "./auth.js";

export const oauthRouter = Router();

type OAuthProvider = "google" | "discord";

function isOAuthProvider(v: string): v is OAuthProvider {
  return v === "google" || v === "discord";
}

const OAUTH_CALLBACK_BASE = String(
  process.env.OAUTH_CALLBACK_BASE || process.env.RENDER_EXTERNAL_URL || "https://lunalive-api.onrender.com"
).replace(/\/$/, "");

const PUBLIC_WEB_BASE = String(process.env.PUBLIC_WEB_BASE || "https://lunalive.win").replace(/\/$/, "");

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET missing");
  return secret;
}

type OAuthState = {
  p: OAuthProvider;
  ref: string | null;
  utm: string | null; // JSON déjà nettoyé (mêmes clés que /auth/register), ou null
  n: string;
};

function signState(state: OAuthState) {
  return jwt.sign(state, jwtSecret(), { expiresIn: "10m" });
}

function verifyState(token: string): OAuthState {
  return jwt.verify(token, jwtSecret()) as OAuthState;
}

function redirectUriFor(provider: OAuthProvider) {
  return `${OAUTH_CALLBACK_BASE}/auth/oauth/${provider}/callback`;
}

function doneUrl(hash: string) {
  return `${PUBLIC_WEB_BASE}/oauth/done#${hash}`;
}

function providerCreds(provider: OAuthProvider) {
  if (provider === "google") {
    return {
      clientId: String(process.env.GOOGLE_OAUTH_CLIENT_ID || ""),
      clientSecret: String(process.env.GOOGLE_OAUTH_CLIENT_SECRET || ""),
    };
  }
  return {
    clientId: String(process.env.DISCORD_OAUTH_CLIENT_ID || ""),
    clientSecret: String(process.env.DISCORD_OAUTH_CLIENT_SECRET || ""),
  };
}

// Même whitelist que /auth/register (routes/auth.ts) pour le signup_utm.
const UTM_ALLOWED_FIELDS = ["source", "medium", "campaign", "term", "content", "landingPath", "referrer", "capturedAt"];
function sanitizeUtm(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const cleaned: Record<string, string> = {};
  for (const k of UTM_ALLOWED_FIELDS) {
    const v = (raw as any)[k];
    if (typeof v === "string" && v.trim()) cleaned[k] = v.trim().slice(0, 500);
  }
  return Object.keys(cleaned).length ? JSON.stringify(cleaned) : null;
}

function buildGoogleAuthUrl(clientId: string, redirectUri: string, state: string) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function buildDiscordAuthUrl(clientId: string, redirectUri: string, state: string) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify email",
    state,
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

oauthRouter.get(
  "/auth/oauth/:provider/start",
  a(async (req, res) => {
    const providerParam = String(req.params.provider || "").toLowerCase();
    if (!isOAuthProvider(providerParam)) return res.status(400).json({ ok: false, error: "bad_provider" });

    const { clientId } = providerCreds(providerParam);
    if (!clientId) return res.status(503).json({ ok: false, error: "oauth_not_configured" });

    const ref = String(req.query.ref || "").trim() || null;

    let utm: string | null = null;
    try {
      const raw = req.query.utm;
      if (typeof raw === "string" && raw.trim()) utm = sanitizeUtm(JSON.parse(raw));
    } catch {}

    const state = signState({ p: providerParam, ref, utm, n: randomBytes(8).toString("hex") });
    const redirectUri = redirectUriFor(providerParam);
    const authUrl =
      providerParam === "google"
        ? buildGoogleAuthUrl(clientId, redirectUri, state)
        : buildDiscordAuthUrl(clientId, redirectUri, state);

    res.redirect(302, authUrl);
  })
);

type OAuthProfile = {
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
  usernameSeed: string;
};

async function exchangeGoogle(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<OAuthProfile | null> {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return null;
  const tokenJson: any = await tokenRes.json().catch(() => null);
  const accessToken = tokenJson?.access_token;
  if (!accessToken) return null;

  const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!userRes.ok) return null;
  const user: any = await userRes.json().catch(() => null);
  if (!user?.sub) return null;

  return {
    providerUserId: String(user.sub),
    email: user.email ? String(user.email) : null,
    emailVerified: user.email_verified === true || user.email_verified === "true",
    usernameSeed: String(user.name || user.given_name || user.email || "google_user"),
  };
}

async function exchangeDiscord(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<OAuthProfile | null> {
  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return null;
  const tokenJson: any = await tokenRes.json().catch(() => null);
  const accessToken = tokenJson?.access_token;
  if (!accessToken) return null;

  const userRes = await fetch("https://discord.com/api/users/@me", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!userRes.ok) return null;
  const user: any = await userRes.json().catch(() => null);
  if (!user?.id) return null;

  return {
    providerUserId: String(user.id),
    email: user.email ? String(user.email) : null,
    emailVerified: user.verified === true,
    usernameSeed: String(user.username || user.global_name || "discord_user"),
  };
}

function sanitizeUsernameBase(value: string): string {
  return value
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 16);
}

async function generateAvailableUsername(seed: string): Promise<string> {
  let base = sanitizeUsernameBase(seed);
  if (base.length < 3) base = (base + randomBytes(3).toString("hex")).slice(0, 16);

  for (let attempt = 0; attempt < 15; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}${Math.floor(1000 + Math.random() * 9000)}`;
    const { rows } = await pool.query(`SELECT 1 FROM users WHERE lower(username)=lower($1) LIMIT 1`, [candidate]);
    if (!rows[0]) return candidate;
  }
  return `${base}${randomBytes(4).toString("hex")}`;
}

// Email du provider déjà pris par un compte existant mais non éligible au
// lien auto (email pas encore vérifié côté LunaLive) -> heurte l'index
// unique users_email_lower_uq (mig003) à l'INSERT. On le distingue du reste
// pour renvoyer un message clair côté front plutôt qu'un "oauth_failed" vague.
class OAuthEmailConflictError extends Error {}

async function loginOrCreateUser(provider: OAuthProvider, profile: OAuthProfile, state: OAuthState, req: Request): Promise<string> {
  const existing = await pool.query(
    `SELECT u.id, u.username, u.role
     FROM user_oauth_identities oi
     JOIN users u ON u.id = oi.user_id
     WHERE oi.provider=$1 AND oi.provider_user_id=$2
     LIMIT 1`,
    [provider, profile.providerUserId]
  );
  if (existing.rows[0]) {
    const u = existing.rows[0];
    await pool.query(`UPDATE users SET last_login_at=NOW(), last_login_ip=$1 WHERE id=$2`, [getClientIp(req), u.id]);
    return signToken({ id: u.id, username: u.username, role: u.role });
  }

  // Email vérifié côté provider + compte existant avec le même email vérifié -> on lie au lieu de dupliquer.
  if (profile.email && profile.emailVerified) {
    const match = await pool.query(
      `SELECT id, username, role FROM users WHERE lower(email)=lower($1) AND email_verified=TRUE LIMIT 1`,
      [profile.email]
    );
    if (match.rows[0]) {
      const u = match.rows[0];
      try {
        await pool.query(
          `INSERT INTO user_oauth_identities (user_id, provider, provider_user_id, email) VALUES ($1,$2,$3,$4)`,
          [u.id, provider, profile.providerUserId, profile.email]
        );
      } catch {
        // identité déjà créée entre-temps (double clic / retry) — pas bloquant pour le login
      }
      await pool.query(`UPDATE users SET last_login_at=NOW(), last_login_ip=$1 WHERE id=$2`, [getClientIp(req), u.id]);
      return signToken({ id: u.id, username: u.username, role: u.role });
    }
  }

  // Sinon, création d'un nouveau compte (mot de passe aléatoire inutilisable sans reset).
  const username = await generateAvailableUsername(profile.usernameSeed);
  const passwordHash = await hashPassword(randomBytes(24).toString("hex"));
  const emailVerified = !!(profile.email && profile.emailVerified);

  let created;
  try {
    created = await pool.query(
      `INSERT INTO users (username, email, email_verified, password_hash, role, rubis, created_ip, last_login_ip, last_login_at, signup_utm)
       VALUES ($1,$2,$3,$4,'viewer',0,$5,$5,NOW(),$6::jsonb)
       RETURNING id`,
      [username, profile.email, emailVerified, passwordHash, getClientIp(req), state.utm]
    );
  } catch (e) {
    if ((e as any)?.code === "23505") throw new OAuthEmailConflictError();
    throw e;
  }
  const userId = Number(created.rows[0].id);

  // ✅ auto-lock referral si ref présent (même logique que /auth/register/verify)
  try {
    const refSlug = String(state.ref || "").trim();
    if (refSlug) {
      const st = await pool.query(`SELECT id FROM streamers WHERE lower(slug)=lower($1) LIMIT 1`, [refSlug]);
      const streamerId = st.rows?.[0]?.id ? Number(st.rows[0].id) : 0;
      if (streamerId > 0) {
        await pool.query(
          `INSERT INTO user_referrals(user_id, streamer_id, source) VALUES ($1,$2,'signup') ON CONFLICT (user_id) DO NOTHING`,
          [userId, streamerId]
        );
      }
    }
  } catch (e) {
    console.log("[oauth] referral lock failed", (e as any)?.message || e);
  }

  await pool.query(`UPDATE users SET avatar_path = COALESCE(avatar_path, $2) WHERE id=$1`, [userId, defaultAvatarPath(userId)]);

  await pool.query(
    `INSERT INTO user_oauth_identities (user_id, provider, provider_user_id, email) VALUES ($1,$2,$3,$4)`,
    [userId, provider, profile.providerUserId, profile.email]
  );

  return signToken({ id: userId, username, role: "viewer" });
}

oauthRouter.get(
  "/auth/oauth/:provider/callback",
  a(async (req, res) => {
    const providerParam = String(req.params.provider || "").toLowerCase();
    if (!isOAuthProvider(providerParam)) return res.redirect(302, doneUrl("error=oauth_failed"));

    const code = String(req.query.code || "").trim();
    const stateToken = String(req.query.state || "").trim();
    if (!code || !stateToken) return res.redirect(302, doneUrl("error=oauth_failed"));

    let state: OAuthState;
    try {
      state = verifyState(stateToken);
      if (state.p !== providerParam) throw new Error("provider_mismatch");
    } catch {
      return res.redirect(302, doneUrl("error=oauth_failed"));
    }

    const { clientId, clientSecret } = providerCreds(providerParam);
    if (!clientId || !clientSecret) return res.redirect(302, doneUrl("error=oauth_not_configured"));

    try {
      const redirectUri = redirectUriFor(providerParam);
      const profile =
        providerParam === "google"
          ? await exchangeGoogle(code, clientId, clientSecret, redirectUri)
          : await exchangeDiscord(code, clientId, clientSecret, redirectUri);

      if (!profile) return res.redirect(302, doneUrl("error=oauth_failed"));

      const token = await loginOrCreateUser(providerParam, profile, state, req);
      return res.redirect(302, doneUrl(`token=${encodeURIComponent(token)}`));
    } catch (e) {
      if (e instanceof OAuthEmailConflictError) return res.redirect(302, doneUrl("error=email_conflict"));
      console.warn(`[oauth/${providerParam}] callback failed:`, (e as any)?.message || e);
      return res.redirect(302, doneUrl("error=oauth_failed"));
    }
  })
);
