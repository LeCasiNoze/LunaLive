import { pool } from "../../db.js";
import { getMyStreamer } from "./repo.js";
export async function mustGetMyStreamer(req) {
    const userId = Number(req.user?.id);
    if (!Number.isFinite(userId))
        throw Object.assign(new Error("UNAUTHORIZED"), { status: 401 });
    const s = await getMyStreamer(pool, userId);
    if (!s)
        throw Object.assign(new Error("NO_STREAMER"), { status: 403 });
    return s; // { id, slug }
}
