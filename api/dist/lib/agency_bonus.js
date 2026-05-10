/**
 * Logique de bonus agency v2.
 *
 * Le snapshot stocke des valeurs CUMULÉES (comme un relevé compteur).
 * Le bonus est signé : positif = l'agence prend davantage, négatif = l'agence donne.
 * Les stats affichées au streamer sont les deltas inter-snapshots ajustés par le bonus.
 */
function roundMoney(v) {
    return Math.round(v * 100) / 100;
}
// ── Helpers internes ─────────────────────────────────────────────────────────
function cpaStreamerUnit(deal) {
    const cpa = Number(deal.cpaAmount ?? 0);
    const cut = Number(deal.cpaAgencyCut ?? 0);
    return Math.max(cpa - cut, 0);
}
function rsStreamerPct(deal) {
    const agencyPct = Number(deal.ersAgencyPercent ?? 0);
    return Math.max(0, Math.min(100, 100 - agencyPct));
}
function rsAgencyPct(deal) {
    return Number(deal.ersAgencyPercent ?? 0);
}
function computeSnapshotDelta(snap, prev) {
    return {
        signups: Math.max(0, Number(snap.signups ?? 0) - Number(prev?.signups ?? 0)),
        ftd: Math.max(0, Number(snap.ftdCount ?? 0) - Number(prev?.ftdCount ?? 0)),
        sumDep: Math.max(0, Number(snap.ftdSumDep ?? 0) - Number(prev?.ftdSumDep ?? 0)),
        totalDeposits: Math.max(0, Number(snap.totalDeposits ?? 0) - Number(prev?.totalDeposits ?? 0)),
        rsAmount: Math.max(0, Number(snap.rsAmount ?? 0) - Number(prev?.rsAmount ?? 0)),
    };
}
// ── Exports principaux ───────────────────────────────────────────────────────
/**
 * Calcule le split CPA/RS du bonus et le nombre de FTDs à retirer de la vue streamer.
 *
 * Si B > 0 : l'agence prend davantage → on déduit des stats streamer.
 * Si B < 0 : l'agence donne → on ajoute aux stats streamer.
 * Si B = 0 : pas de bonus.
 */
export function computeBonusSplit(params) {
    const B = roundMoney(params.bonusAmount);
    if (B === 0) {
        return { bonusCpaSplit: 0, bonusRsSplit: 0, ftdRemoved: 0 };
    }
    const cpuUnit = params.cpaStreamerUnit;
    const rsPct = params.rsStreamerPct;
    // Validation splits manuels
    if (params.manualCpaSplit != null && params.manualRsSplit != null) {
        const sumManual = roundMoney(params.manualCpaSplit + params.manualRsSplit);
        if (Math.abs(sumManual - B) > 0.02) {
            return {
                bonusCpaSplit: 0,
                bonusRsSplit: 0,
                ftdRemoved: 0,
                error: "manual_splits_must_sum_to_bonus",
            };
        }
        const cpaSplit = roundMoney(params.manualCpaSplit);
        const rsSplit = roundMoney(B - cpaSplit);
        const ftdRemoved = cpuUnit > 0
            ? Math.min(Math.round(Math.abs(cpaSplit) / cpuUnit), Math.abs(params.deltaFtd))
            : 0;
        return {
            bonusCpaSplit: cpaSplit,
            bonusRsSplit: rsSplit,
            ftdRemoved: B > 0 ? ftdRemoved : -ftdRemoved,
        };
    }
    // Split proportionnel automatique
    const cpaPeriod = cpuUnit > 0 ? roundMoney(params.deltaFtd * cpuUnit) : 0;
    const rsPeriodStreamer = rsPct > 0 ? roundMoney(params.deltaRsAmount * (rsPct / 100)) : 0;
    const totalPeriod = cpaPeriod + rsPeriodStreamer;
    let cpaSplit;
    let rsSplit;
    if (totalPeriod <= 0) {
        // Fallback : tout sur le côté non-nul, ou 50/50
        if (cpuUnit > 0 && rsPct <= 0) {
            cpaSplit = B;
            rsSplit = 0;
        }
        else if (rsPct > 0 && cpuUnit <= 0) {
            cpaSplit = 0;
            rsSplit = B;
        }
        else {
            cpaSplit = roundMoney(B / 2);
            rsSplit = roundMoney(B - cpaSplit);
        }
    }
    else {
        cpaSplit = roundMoney(B * (cpaPeriod / totalPeriod));
        rsSplit = roundMoney(B - cpaSplit);
    }
    // FTDs retirés = abs(cpaSplit) / cpaStreamerUnit, plafonné à deltaFtd
    const ftdRemovedAbs = cpuUnit > 0
        ? Math.min(Math.round(Math.abs(cpaSplit) / cpuUnit), Math.abs(params.deltaFtd))
        : 0;
    return {
        bonusCpaSplit: cpaSplit,
        bonusRsSplit: rsSplit,
        ftdRemoved: B > 0 ? ftdRemovedAbs : -ftdRemovedAbs,
    };
}
/**
 * Applique le bonus calculé sur un delta brut pour obtenir le delta vu par le streamer.
 *
 * ftdRemoved positif = on enlève des FTDs (agence prend), négatif = on en ajoute.
 */
export function applyBonusToDelta(rawDelta, bonusComputed) {
    const ftdRemoved = bonusComputed.ftdRemoved; // signé
    const newFtd = Math.max(0, rawDelta.ftd - ftdRemoved);
    // Proportion de FTDs restants → ajuste sumDep et totalDeposits proportionnellement
    const ftdRatio = rawDelta.ftd > 0 ? newFtd / rawDelta.ftd : 1;
    const newSumDep = roundMoney(rawDelta.sumDep * ftdRatio);
    const newTotalDeposits = roundMoney(rawDelta.totalDeposits * ftdRatio);
    // RS : on enlève la part bonus_rs_split des revenus streamer
    // bonusRsSplit positif = agence prend davantage = streamer voit moins de RS
    const newRsAmount = Math.max(0, roundMoney(rawDelta.rsAmount - bonusComputed.bonusRsSplit));
    return {
        signups: rawDelta.signups,
        ftd: newFtd,
        sumDep: newSumDep,
        totalDeposits: newTotalDeposits,
        rsAmount: newRsAmount,
    };
}
function buildPeriodTotals(deltas, cpuUnit, rsPct, bonusTotal = 0) {
    const signups = deltas.reduce((s, d) => s + d.signups, 0);
    const ftd = deltas.reduce((s, d) => s + d.ftd, 0);
    const sumDep = roundMoney(deltas.reduce((s, d) => s + d.sumDep, 0));
    const totalDeposits = roundMoney(deltas.reduce((s, d) => s + d.totalDeposits, 0));
    const rsAmount = roundMoney(deltas.reduce((s, d) => s + d.rsAmount, 0));
    const cpaEarnings = roundMoney(ftd * cpuUnit);
    const rsEarnings = roundMoney(rsAmount * (rsPct / 100));
    const totalEarnings = roundMoney(cpaEarnings + rsEarnings);
    const agencyEarnings = 0; // calculé séparément dans agencyTotals
    return { signups, ftd, sumDep, totalDeposits, rsAmount, cpaEarnings, rsEarnings, totalEarnings, agencyEarnings, bonusTotal };
}
/**
 * Agrège une liste de snapshots sur une période.
 *
 * @param snapshots     Snapshots dans la période [start, end], triés par captured_at ASC.
 * @param baseline      Dernier snapshot AVANT la période (ou null si aucun).
 * @param deal          Paramètres du deal pour calculer les gains.
 */
export function aggregateSnapshotsForPeriod(snapshots, baseline, deal) {
    const cpuUnit = cpaStreamerUnit(deal);
    const rsPct = rsStreamerPct(deal);
    const agPct = rsAgencyPct(deal);
    const cpaAgencyCut = Number(deal.cpaAgencyCut ?? 0);
    const perSnapshot = [];
    const rawDeltas = [];
    const adjustedDeltas = [];
    let totalBonusAmount = 0;
    let agencyBaseCpa = 0;
    let agencyBaseRs = 0;
    for (let i = 0; i < snapshots.length; i++) {
        const snap = snapshots[i];
        // Le précédent dans la période est snapshots[i-1], ou le baseline pour le premier
        const prev = i === 0 ? baseline : snapshots[i - 1];
        const rawDelta = computeSnapshotDelta(snap, prev);
        const bonusComputed = {
            bonusCpaSplit: Number(snap.bonusCpaSplit),
            bonusRsSplit: Number(snap.bonusRsSplit),
            ftdRemoved: Number(snap.bonusFtdRemoved),
        };
        const adjustedDelta = applyBonusToDelta(rawDelta, bonusComputed);
        rawDeltas.push(rawDelta);
        adjustedDeltas.push(adjustedDelta);
        totalBonusAmount = roundMoney(totalBonusAmount + Number(snap.bonusAmount));
        // Gain de base agence sur ce snapshot (avant bonus)
        agencyBaseCpa = roundMoney(agencyBaseCpa + rawDelta.ftd * cpaAgencyCut);
        agencyBaseRs = roundMoney(agencyBaseRs + rawDelta.rsAmount * (agPct / 100));
        perSnapshot.push({
            snapshotId: snap.id,
            capturedAt: snap.capturedAt,
            rawDelta,
            bonusAmount: Number(snap.bonusAmount),
            bonusCpaSplit: Number(snap.bonusCpaSplit),
            bonusRsSplit: Number(snap.bonusRsSplit),
            ftdRemoved: Number(snap.bonusFtdRemoved),
            adjustedDelta,
        });
    }
    const rawTotalsPre = buildPeriodTotals(rawDeltas, cpuUnit, rsPct);
    const rawTotals = { ...rawTotalsPre, bonusTotal: totalBonusAmount };
    const adjustedTotalsPre = buildPeriodTotals(adjustedDeltas, cpuUnit, rsPct);
    const adjustedTotals = { ...adjustedTotalsPre, bonusTotal: totalBonusAmount };
    const agencyTotal = roundMoney(agencyBaseCpa + agencyBaseRs + totalBonusAmount);
    return {
        rawTotals,
        adjustedTotals,
        agencyTotals: {
            agencyBaseCpa,
            agencyBaseRs,
            bonusTotal: totalBonusAmount,
            total: agencyTotal,
        },
        perSnapshot,
    };
}
