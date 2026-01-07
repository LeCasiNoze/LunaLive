import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
export async function hashPassword(password) {
    return bcrypt.hash(password, 10);
}
export async function verifyPassword(password, hash) {
    return bcrypt.compare(password, hash);
}
export function signToken(u) {
    const secret = process.env.JWT_SECRET;
    if (!secret)
        throw new Error("JWT_SECRET missing");
    return jwt.sign(u, secret, { expiresIn: "30d" });
}
export function requireAuth(req, res, next) {
    const h = String(req.headers.authorization || "");
    const m = h.match(/^Bearer\s+(.+)$/i);
    if (!m)
        return res.status(401).json({ ok: false, error: "unauthorized" });
    try {
        const secret = process.env.JWT_SECRET;
        if (!secret)
            throw new Error("JWT_SECRET missing");
        req.user = jwt.verify(m[1], secret);
        return next();
    }
    catch {
        return res.status(401).json({ ok: false, error: "unauthorized" });
    }
}
export function requireAdminKey(req, res, next) {
    const key = String(req.headers["x-admin-key"] || "");
    if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
        return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    return next();
}
export function tryGetAuthUser(req) {
    const h = String(req.headers.authorization || "");
    const m = h.match(/^Bearer\s+(.+)$/i);
    if (!m)
        return null;
    try {
        const secret = process.env.JWT_SECRET;
        if (!secret)
            return null;
        return jwt.verify(m[1], secret);
    }
    catch {
        return null;
    }
}
