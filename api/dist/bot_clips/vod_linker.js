// api/src/bot_clips/vod_linker.ts
// ✅ v2 : utilise live_start_ts stocké au moment du clip pour un matching VOD fiable.
// Fix bug : après coupure de stream DLive (2 VODs), la bonne VOD est sélectionnée
// en cherchant celle dont le createdAt est le plus proche du live_start_ts du clip.
import { ensureBotClips, getDliveChannelSlugForStreamer, listPendingClipsForStreamer, listStreamersWithPendingVodClips, setClipVodInfo, } from "./store.js";
const ENDPOINT = process.env.DLIVE_GRAPHQL_ENDPOINT || "https://graphigo.prd.dlive.tv/";
async function gql(query, variables) {
    const r = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            accept: "application/json",
            origin: "https://dlive.tv",
            referer: "https://dlive.tv/",
        },
        body: JSON.stringify(variables ? { query, variables } : { query }),
    });
    if (!r.ok)
        throw new Error(`dlive_gql_http_${r.status}`);
    return (await r.json());
}
// On récupère plus de VODs (20 au lieu de 12) pour avoir plus de chances de trouver
// la bonne même si le streamer fait plusieurs sessions dans la journée
async function fetchRecentVods(displayName, first = 20) {
    const query = 'query PastBroadcastsLite($name:String!, $first:Int!){ userByDisplayName(displayname:$name){ username pastBroadcastsV2(first:$first){ list { permlink title createdAt length playbackUrl resolution { resolution url } } } } }';
    const j = await gql(query, { name: displayName, first });
    const list = j?.data?.userByDisplayName?.pastBroadcastsV2?.list || [];
    return (list || []).map((x) => ({
        permlink: String(x?.permlink || ""),
        title: String(x?.title || ""),
        createdAtMs: Number(x?.createdAt || 0),
        lengthSec: Number(x?.length || 0),
        playbackUrl: String(x?.playbackUrl || "").trim() || null,
        resolution: Array.isArray(x?.resolution)
            ? x.resolution.map((r) => ({
                resolution: String(r?.resolution || ""),
                url: String(r?.url || ""),
            }))
            : undefined,
    }));
}
function pickVodUrl(v) {
    const res = Array.isArray(v.resolution) ? v.resolution : [];
    const src = res.find(r => String(r?.resolution || "").toLowerCase() === "src")?.url?.trim();
    if (src)
        return src;
    const p720 = res.find(r => String(r?.resolution || "").toLowerCase() === "720p")?.url?.trim();
    if (p720)
        return p720;
    return (v.playbackUrl || "").trim() || null;
}
/**
 * ✅ matchVod v2 — algorithme de matching en 3 passes :
 *
 * Passe 1 — live_start_ts disponible (nouveau champ) :
 *   Cherche la VOD dont le createdAt est le plus proche de live_start_ts.
 *   C'est l'ancre exacte : on sait quel live était en cours quand le clip a été déclenché.
 *   Tolérance : ±10 min (DLive publie parfois la VOD avec un léger décalage).
 *
 * Passe 2 — fallback created_ts :
 *   Cherche la VOD dont la plage [createdAt, createdAt+length] contient created_ts du clip.
 *   Si plusieurs VODs contiennent le moment, prend la plus récente (coupure → 2ème session).
 *
 * Passe 3 — fallback distance :
 *   Estime liveStartEstSec = clipCreatedSec - atSec.
 *   Tolère jusqu'à 2h (au lieu de 30 min) pour les sessions longues.
 *   Utilisé uniquement si les passes 1 et 2 échouent.
 */
function matchVod(clip, vods) {
    if (!vods.length)
        return null;
    const clipCreatedMs = Number(clip.created_ts || 0);
    const clipCreatedSec = Math.floor(clipCreatedMs / 1000);
    const atSec = Math.max(0, Number(clip.at_sec || 0));
    const liveStartTs = clip.live_start_ts ? Number(clip.live_start_ts) : null;
    const livePermlink = clip.live_permlink ? String(clip.live_permlink).trim() : null;
    const sourceDisplayname = clip.source_displayname ? String(clip.source_displayname).trim() : null;
    console.log(`[VOD_LINKER] Processing clip ${clip.id || 'unknown'} with live_permlink: ${livePermlink || 'NULL'}, source_displayname: ${sourceDisplayname || 'NULL'}`);
    // ── Passe 0 : matching exact permlink (NOUVEAU) ────────────────────────
    if (livePermlink) {
        console.log(`[VOD_LINKER] Trying permlink match: ${livePermlink}`);
        const exactMatch = vods.find(v => v.permlink === livePermlink);
        if (exactMatch) {
            console.log(`[VOD_LINKER] EXACT permlink match found: ${exactMatch.permlink}`);
            return exactMatch;
        }
        console.log(`[VOD_LINKER] permlink not found, clip will remain pending`);
        // Pour LunaLive: si pas de VOD avec ce permlink, on laisse pending (pas de fallback)
        if (sourceDisplayname) {
            console.log(`[VOD_LINKER] LunaLive clip with snapshot - leaving pending (no fallback)`);
            return null;
        }
        console.log(`[VOD_LINKER] Normal clip - continuing with temporal fallbacks`);
    }
    // ── Passe 1 : live_start_ts direct (EXISTANT) ───────────────────────────
    if (liveStartTs && liveStartTs > 0) {
        console.log(`[VOD_LINKER] Trying live_start_ts match: ${liveStartTs}`);
        const liveStartSec = Math.floor(liveStartTs / 1000);
        // Tolérance ±10 min : DLive peut légèrement décaler le createdAt de la VOD
        const TOLERANCE_SEC = 10 * 60;
        let best = null;
        let bestDelta = Number.POSITIVE_INFINITY;
        for (const v of vods) {
            const vStartSec = Math.floor(v.createdAtMs / 1000);
            const delta = Math.abs(vStartSec - liveStartSec);
            if (delta < bestDelta) {
                bestDelta = delta;
                best = v;
            }
        }
        if (best && bestDelta <= TOLERANCE_SEC) {
            console.log(`[VOD_LINKER] live_start_ts match: delta=${bestDelta}s`);
            return best;
        }
        // Si on dépasse la tolérance stricte, on essaie quand même de trouver une VOD
        // dont la plage contient le moment du clip (passe 1b)
        if (best) {
            const vStartSec = Math.floor(best.createdAtMs / 1000);
            const vEndSec = vStartSec + Math.max(0, best.lengthSec);
            if (clipCreatedSec >= vStartSec - 60 && clipCreatedSec <= vEndSec + 600) {
                console.log(`[VOD_LINKER] live_start_ts fallback match (range)`);
                return best;
            }
        }
        console.log(`[VOD_LINKER] live_start_ts match failed, continuing fallbacks`);
        // live_start_ts présent mais aucune VOD ne match → on continue avec les passes 2/3
        // (peut arriver si la VOD n'est pas encore publiée)
    }
    // ── Passe 2 : created_ts contenu dans la plage de la VOD ────────────────
    // Si plusieurs VODs contiennent le moment (ex: coupure + reprise), on prend
    // la VOD qui démarre le PLUS TARD (= la 2ème session, la plus récente)
    const containingVods = vods.filter(v => {
        const vStartSec = Math.floor(v.createdAtMs / 1000);
        const vEndSec = vStartSec + Math.max(0, v.lengthSec);
        // +600s de marge de fin : la VOD peut continuer d'être encodée après le stream
        return clipCreatedSec >= vStartSec - 60 && clipCreatedSec <= vEndSec + 600;
    });
    if (containingVods.length > 0) {
        // Trier par createdAtMs DESC → prend la VOD la plus récente qui contient le moment
        // Fix bug coupure : si le clip est fait après reprise du stream, on prend la 2ème VOD
        containingVods.sort((a, b) => b.createdAtMs - a.createdAtMs);
        return containingVods[0];
    }
    // ── Passe 3 : estimation par distance (fallback large) ──────────────────
    // Tolérance étendue à 2h pour les streams longs et les clips tardifs
    const FALLBACK_TOLERANCE_SEC = 2 * 3600;
    const liveStartEstSec = clipCreatedSec - atSec;
    let best3 = null;
    let bestScore3 = Number.POSITIVE_INFINITY;
    for (const v of vods) {
        const vStartSec = Math.floor(v.createdAtMs / 1000);
        const delta = Math.abs(vStartSec - liveStartEstSec);
        if (delta < bestScore3) {
            bestScore3 = delta;
            best3 = v;
        }
    }
    if (best3 && bestScore3 <= FALLBACK_TOLERANCE_SEC) {
        return best3;
    }
    // Vraiment aucune VOD trouvable — on réessaiera au prochain tick
    return null;
}
let running = false;
export function startClipsVodLinker() {
    const TICK_MS = 60_000;
    const run = async () => {
        if (running)
            return;
        running = true;
        try {
            await ensureBotClips();
            const streamers = await listStreamersWithPendingVodClips();
            if (!streamers.length)
                return;
            for (const streamerId of streamers) {
                try {
                    const clips = await listPendingClipsForStreamer(streamerId, 500);
                    if (!clips.length)
                        continue;
                    // ✅ Pour LunaLive radio, on utilise les snapshots individuels par clip
                    // On groupe les clips par source_displayname pour optimiser les requêtes VOD
                    const clipsBySource = new Map();
                    for (const clip of clips) {
                        const source = clip.source_displayname || null;
                        if (!clipsBySource.has(source)) {
                            clipsBySource.set(source, []);
                        }
                        clipsBySource.get(source).push(clip);
                    }
                    // Pour chaque source, on fetch les VODs et on traite les clips
                    for (const [sourceDisplayname, sourceClips] of clipsBySource) {
                        let vods = [];
                        if (sourceDisplayname) {
                            // ✅ NOUVEAU: clips LunaLive avec snapshot - on utilise la source snapshotée
                            console.log(`[VOD_LINKER] Processing ${sourceClips.length} LunaLive clips for source: ${sourceDisplayname}`);
                            vods = await fetchRecentVods(sourceDisplayname, 20).catch(() => []);
                        }
                        else {
                            // ✅ ANCIEN: clips normaux - fallback comportement existant
                            console.log(`[VOD_LINKER] Processing ${sourceClips.length} normal clips (fallback)`);
                            const display = await getDliveChannelSlugForStreamer(streamerId);
                            if (!display)
                                continue;
                            vods = await fetchRecentVods(display, 20).catch(() => []);
                        }
                        if (!vods.length)
                            continue;
                        for (const c of sourceClips) {
                            try {
                                const v = matchVod(c, vods);
                                const url = v ? pickVodUrl(v) : null;
                                if (!v || !url)
                                    continue;
                                console.log(`[VOD_LINKER] ✅ Clip ${c.id} matched to VOD: ${v.permlink} (source: ${sourceDisplayname || 'dynamic'})`);
                                await setClipVodInfo(streamerId, c.id, {
                                    vod_url: url,
                                    vod_permlink: v.permlink,
                                    vod_created_ts: Number(v.createdAtMs || 0),
                                });
                            }
                            catch (e) {
                                console.log(`[VOD_LINKER] ❌ Error processing clip ${c.id}:`, e);
                            }
                        }
                    }
                }
                catch (e) {
                    console.log(`[VOD_LINKER] ❌ Error processing streamer ${streamerId}:`, e);
                }
            }
        }
        finally {
            running = false;
        }
    };
    setTimeout(() => void run(), 5_000);
    const id = setInterval(() => void run(), TICK_MS);
    id.unref?.();
}
