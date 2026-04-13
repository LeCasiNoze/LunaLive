export const FSB_ALLOWED_USER_IDS = new Set([4, 15, 71]);
export function canAccessFsb(user) {
    return FSB_ALLOWED_USER_IDS.has(Number(user?.id || 0));
}
export function requireFsbAccess(req, res, next) {
    if (!canAccessFsb(req.user)) {
        return res.status(403).json({ ok: false, error: "forbidden" });
    }
    return next();
}
