// api/src/routes/trovo_debug.ts
// Route debug isolée pour tester l'intégration Trovo
import { Router } from "express";
import { fetchTrovoRoomInfo } from "../trovo.js";
export const trovoDebugRouter = Router();
trovoDebugRouter.get("/trovo/:spaceName", async (req, res) => {
    const spaceName = req.params.spaceName;
    console.log(`[trovo-debug] Received request for spaceName: ${spaceName}`);
    try {
        const info = await fetchTrovoRoomInfo(spaceName);
        console.log(`[trovo-debug] Response for ${spaceName}:`, {
            ok: info.ok,
            isLive: info.isLive,
            qualitiesCount: info.qualities.length,
            hasPlayUrl: !!info.bestPlayUrl,
            hasTimeShiftUrl: !!info.bestTimeShiftUrl
        });
        res.json(info);
    }
    catch (error) {
        console.error(`[trovo-debug] Unexpected error for ${spaceName}:`, error);
        res.json({
            ok: false,
            spaceName,
            isLive: false,
            title: null,
            channelId: null,
            roomId: null,
            sourceWidth: null,
            sourceHeight: null,
            defaultLevelType: null,
            isAdaptiveBitrate: null,
            isLhlsStream: null,
            qualities: [],
            bestPlayUrl: null,
            bestTimeShiftUrl: null,
            rawAvailable: false,
            notes: [`Unexpected server error: ${error.message}`]
        });
    }
});
