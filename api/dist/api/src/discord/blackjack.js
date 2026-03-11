import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, } from "discord.js";
import { startGame, handTotal, canSplit, doHit, doStand, doSplit, doDouble, nextHandOrEnd, playDealerToEnd, settle, } from "./games_blackjack.js";
export const BJ_MAIN_BET = 20;
export const BJ_PLUS_TOTAL = 25; // 20 + 3 + 2
export const BJ_PAIRS_BET = 3;
export const BJ_21P3_BET = 2;
export const BJ_COOLDOWN_MS = 12 * 3600_000;
const VIEW_TIMEOUT_MS = 60_000;
async function bjCheckAndTouchCooldownTx(client, discordUserId, cooldownMs = BJ_COOLDOWN_MS) {
    try {
        const r = await client.query(`SELECT last_play_at FROM discord_bj_cooldowns WHERE discord_user_id=$1 FOR UPDATE`, [discordUserId]);
        const now = Date.now();
        const row = r.rows?.[0] ?? null;
        if (row?.last_play_at) {
            const last = new Date(row.last_play_at).getTime();
            const next = last + cooldownMs;
            if (now < next)
                return { ok: false, error: "cooldown", remainingMs: next - now };
        }
        if (!row) {
            await client.query(`INSERT INTO discord_bj_cooldowns (discord_user_id, last_play_at, updated_at)
         VALUES ($1, NOW(), NOW())`, [discordUserId]);
        }
        else {
            await client.query(`UPDATE discord_bj_cooldowns
         SET last_play_at=NOW(), updated_at=NOW()
         WHERE discord_user_id=$1`, [discordUserId]);
        }
        return { ok: true };
    }
    catch {
        return { ok: false, error: "db" };
    }
}
function fmt2(n) { return String(n).padStart(2, "0"); }
function fmtRemaining(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    if (hh > 0)
        return `${hh}h ${fmt2(mm)}m`;
    if (mm > 0)
        return `${mm}m ${fmt2(ss)}s`;
    return `${ss}s`;
}
function fmt(n) { return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " "); }
function fmtSigned(n) {
    const a = Math.abs(Math.trunc(n));
    const s = fmt(a);
    return n >= 0 ? `+${s}` : `-${s}`;
}
/**
 * === WALLET HOOKS ===
 * Branche ici ton wallet_engine rubis (ledger).
 * Je te laisse les signatures Tx pour que tout soit atomique.
 */
async function walletSpendTx(_client, _lunaUserId, _amount, _purpose) {
    // TODO: brancher ton moteur rubis (spend)
    // Exemple: await walletSpend(_client, { userId: _lunaUserId, amount: _amount, purpose: _purpose, kind:"SINK" ... })
}
async function walletCreditTx(_client, _lunaUserId, _amount, _purpose) {
    // TODO: brancher ton moteur rubis (credit)
}
const games = new Map();
function buildKey(discordUserId) {
    return `bj:${discordUserId}:${Math.random().toString(16).slice(2)}`;
}
function components(state) {
    const g = state.game;
    const h = g.hands[g.active];
    const locked = state.ended || g.finished;
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder()
        .setCustomId(`${state.key}:hit`)
        .setLabel("Piocher")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(locked), new ButtonBuilder()
        .setCustomId(`${state.key}:stand`)
        .setLabel("Rester")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(locked), new ButtonBuilder()
        .setCustomId(`${state.key}:double`)
        .setLabel("Doubler")
        .setStyle(ButtonStyle.Success)
        .setDisabled(locked || h.doubled || h.cards.length !== 2), new ButtonBuilder()
        .setCustomId(`${state.key}:split`)
        .setLabel("Splitter")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(locked || !canSplit(g)));
    return [row];
}
function embedFor(state, status) {
    const g = state.game;
    const active = g.active;
    const dealerUp = g.dealer[0];
    const dealerHoleHidden = !g.finished;
    const dealerShown = dealerHoleHidden ? [dealerUp] : g.dealer;
    const dealerTotal = handTotal(dealerShown);
    const e = new EmbedBuilder()
        .setTitle(state.plusMode ? "Blackjack+ (side bets)" : "Blackjack")
        .setColor(0x0b1220);
    const sideTxt = state.plusMode
        ? `Main: **${BJ_MAIN_BET}** • Pairs: **${BJ_PAIRS_BET}** • 21+3: **${BJ_21P3_BET}** (Total **${BJ_PLUS_TOTAL}**)`
        : `Main: **${BJ_MAIN_BET}** (Total **${BJ_MAIN_BET}**)`;
    e.setDescription(sideTxt);
    e.addFields({
        name: `Croupier — ${dealerHoleHidden ? "??" : dealerTotal}`,
        value: dealerHoleHidden
            ? `🂠  ${dealerUp.r}${dealerUp.s}  · total partiel **${dealerTotal}**`
            : `Cartes: ${dealerShown.map(c => `${c.r}${c.s}`).join(" ")} · total **${dealerTotal}**`,
        inline: false,
    });
    if (g.hands.length === 1) {
        const h = g.hands[0];
        e.addFields({
            name: `Votre main — total ${handTotal(h.cards)}${h.doubled ? " (doublé)" : ""}`,
            value: `${h.cards.map(c => `${c.r}${c.s}`).join(" ")} · mise **${h.bet}**`,
            inline: false,
        });
    }
    else {
        for (let i = 0; i < g.hands.length; i++) {
            const h = g.hands[i];
            const mark = (!g.finished && i === active) ? "◉" : "•";
            e.addFields({
                name: `${mark} Main ${i + 1} — total ${handTotal(h.cards)}${h.doubled ? " (doublé)" : ""}`,
                value: `${h.cards.map(c => `${c.r}${c.s}`).join(" ")} · mise **${h.bet}**`,
                inline: false,
            });
        }
    }
    if (state.plusMode && g.sidebetLines?.length) {
        e.addFields({ name: "Side bets", value: g.sidebetLines.join("\n"), inline: false });
    }
    if (status)
        e.addFields({ name: "—", value: status, inline: false });
    e.setFooter({ text: "Piocher • Rester • Splitter • Doubler — Cooldown 12h" });
    return e;
}
async function finishGameTx(pool, state, it, reason) {
    const g = state.game;
    if (state.ended)
        return;
    state.ended = true;
    // dealer plays + settle
    g.finished = true;
    playDealerToEnd(g);
    const res = settle(g);
    // credit payout in one tx
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        // --- main payout credits (bets already debited)
        // win => credit 2*bet (stake+gain) ; push => credit bet ; lose => 0
        for (const ph of res.perHand) {
            if (res.isNaturalBlackjack && ph.i === 1) {
                // natural blackjack: credit 2.5*mainBet
                await walletCreditTx(client, state.lunaUserId, Math.floor(BJ_MAIN_BET * 2.5), "discord_blackjack_natural");
                continue;
            }
            if (ph.kind === "win") {
                await walletCreditTx(client, state.lunaUserId, ph.bet * 2, "discord_blackjack_win");
            }
            else if (ph.kind === "push") {
                await walletCreditTx(client, state.lunaUserId, ph.bet, "discord_blackjack_push");
            }
        }
        // --- side bet payout credits (if plusMode)
        // if won: credit (ratio+1)*bet, but the engine only computed net.
        // easiest: re-evaluate by reading initial cards & dealer up:
        if (state.plusMode) {
            const p = g.hands[0].cards;
            const up = g.dealer[0];
            // We purposely redo to know ratios reliably (no dependency on embed lines)
            const { evalPerfectPairs, eval21Plus3 } = await import("./games_blackjack.js");
            if (BJ_PAIRS_BET > 0) {
                const r = evalPerfectPairs(p[0], p[1]);
                if (r)
                    await walletCreditTx(client, state.lunaUserId, BJ_PAIRS_BET * (r.ratio + 1), "discord_blackjack_pairs");
            }
            if (BJ_21P3_BET > 0) {
                const r = eval21Plus3(p[0], p[1], up);
                if (r)
                    await walletCreditTx(client, state.lunaUserId, BJ_21P3_BET * (r.ratio + 1), "discord_blackjack_21p3");
            }
        }
        await client.query("COMMIT");
    }
    catch (e) {
        await client.query("ROLLBACK");
        // on garde l’UI finie quand même, mais log côté serveur
        // eslint-disable-next-line no-console
        console.error("[blackjack] finish tx error:", e);
    }
    finally {
        client.release();
    }
    // final UI
    const totalNet = res.totalNet;
    const color = totalNet > 0 ? 0x22c55e : totalNet < 0 ? 0xef4444 : 0x64748b;
    const lines = res.perHand.map(ph => {
        const tag = ph.doubled ? " (doublée)" : "";
        const label = ph.kind === "bust" ? "BUST" :
            ph.kind === "win" ? "Victoire" :
                ph.kind === "lose" ? "Défaite" : "Égalité";
        return `• Main ${ph.i}${tag} — **${label}** · ${fmtSigned(ph.net)}`;
    });
    const result = new EmbedBuilder()
        .setTitle("Résultat — Blackjack")
        .setColor(color)
        .setDescription(`**Croupier : ${res.dealerTotal}**\n` +
        `**Net total : ${fmtSigned(totalNet)} rubis**` +
        (reason ? `\n_${reason}_` : ""))
        .addFields({ name: "Mains", value: lines.join("\n") || "—", inline: false });
    if (state.plusMode) {
        result.addFields({
            name: "Side bets",
            value: `${g.sidebetLines.join("\n")}\n**Net side bets : ${fmtSigned(res.sideNet)}**`,
            inline: false,
        });
    }
    const finalEmb = embedFor(state, "✅ Partie terminée.");
    finalEmb.data.color = 0x0b1220;
    if (it) {
        await it.editReply({ embeds: [finalEmb, result], components: components(state) });
    }
    // cleanup
    if (state.timeoutHandle)
        clearTimeout(state.timeoutHandle);
    games.delete(state.key);
}
export async function handleBlackjackCommand(pool, it, plusMode, lunaUser) {
    const discordUserId = it.user.id;
    const key = buildKey(discordUserId);
    // cooldown + debit upfront (TX)
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const cd = await bjCheckAndTouchCooldownTx(client, discordUserId, BJ_COOLDOWN_MS);
        if (!cd.ok) {
            await client.query("ROLLBACK");
            const msg = cd.error === "cooldown"
                ? `⏳ Cooldown. Reviens dans **${fmtRemaining(cd.remainingMs)}**.`
                : `❌ Erreur DB.`;
            await it.followUp({ content: msg, ephemeral: true });
            await it.editReply({ content: "❌ Action impossible." });
            return;
        }
        const total = plusMode ? BJ_PLUS_TOTAL : BJ_MAIN_BET;
        await walletSpendTx(client, lunaUser.userId, total, plusMode ? "discord_blackjack_plus_start" : "discord_blackjack_start");
        await client.query("COMMIT");
    }
    catch (e) {
        await client.query("ROLLBACK");
        // eslint-disable-next-line no-console
        console.error("[blackjack] start tx error:", e);
        await it.editReply({ content: "❌ Impossible de démarrer la partie (TX)." });
        return;
    }
    finally {
        client.release();
    }
    // start game
    const game = startGame({
        mainBet: BJ_MAIN_BET,
        pairsBet: plusMode ? BJ_PAIRS_BET : 0,
        plus3Bet: plusMode ? BJ_21P3_BET : 0,
    });
    const state = {
        key,
        discordUserId,
        lunaUserId: lunaUser.userId,
        lunaUsername: lunaUser.username,
        startedAt: Date.now(),
        plusMode,
        game,
        ended: false,
    };
    games.set(key, state);
    // timeout => auto-stand
    state.timeoutHandle = setTimeout(async () => {
        try {
            doStand(game);
            const step = nextHandOrEnd(game);
            if (step === "next_hand") {
                // stand first hand, move to next
                // redraw only
            }
            else {
                await finishGameTx(pool, state, undefined, "⏱️ Timeout — auto-rester.");
                return;
            }
        }
        catch { }
    }, VIEW_TIMEOUT_MS);
    // initial reply
    await it.editReply({
        embeds: [embedFor(state)],
        components: components(state),
    });
    // Natural blackjack => instant finish
    if (game.hands.length === 1 && handTotal(game.hands[0].cards) === 21 && game.hands[0].cards.length === 2) {
        await finishGameTx(pool, state, it, "🂡 Blackjack naturel (3:2).");
    }
}
export async function handleBlackjackButton(pool, it) {
    const parts = it.customId.split(":");
    const action = parts.pop(); // dernier token
    const key = parts.join(":"); // tout le reste = game key
    const state = games.get(key);
    if (!state) {
        await it.reply({ content: "❌ Partie introuvable (expirée).", ephemeral: true });
        return;
    }
    if (it.user.id !== state.discordUserId) {
        await it.reply({ content: "❌ Seul le joueur peut cliquer.", ephemeral: true });
        return;
    }
    if (state.ended || state.game.finished) {
        await it.reply({ content: "✅ Partie déjà terminée.", ephemeral: true });
        return;
    }
    const g = state.game;
    const h = g.hands[g.active];
    // actions requiring extra debit: split + double
    if (action === "split") {
        if (!canSplit(g)) {
            await it.reply({ content: "Split indisponible.", ephemeral: true });
            return;
        }
        // debit extra main bet (20)
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            await walletSpendTx(client, state.lunaUserId, BJ_MAIN_BET, "discord_blackjack_split");
            await client.query("COMMIT");
        }
        catch (e) {
            await client.query("ROLLBACK");
            client.release();
            await it.reply({ content: "❌ Fonds insuffisants / erreur TX pour split.", ephemeral: true });
            return;
        }
        finally {
            try {
                client.release();
            }
            catch { }
        }
        doSplit(g);
        await it.update({ embeds: [embedFor(state, "✂️ Split !")], components: components(state) });
        return;
    }
    if (action === "double") {
        if (h.doubled || h.cards.length !== 2) {
            await it.reply({ content: "Double uniquement sur 2 cartes, une fois.", ephemeral: true });
            return;
        }
        // debit extra bet = current bet (20)
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            await walletSpendTx(client, state.lunaUserId, h.bet, "discord_blackjack_double");
            await client.query("COMMIT");
        }
        catch (e) {
            await client.query("ROLLBACK");
            client.release();
            await it.reply({ content: "❌ Fonds insuffisants / erreur TX pour doubler.", ephemeral: true });
            return;
        }
        finally {
            try {
                client.release();
            }
            catch { }
        }
        doDouble(g);
        const step = nextHandOrEnd(g);
        if (step === "next_hand") {
            await it.update({ embeds: [embedFor(state, "✅ Doublé. Main suivante.")], components: components(state) });
        }
        else {
            await it.deferUpdate();
            await finishGameTx(pool, state, it, "✅ Doublé.");
        }
        return;
    }
    if (action === "hit") {
        doHit(g);
        const tot = handTotal(currentHand(g).cards);
        if (tot > 21) {
            const step = nextHandOrEnd(g);
            if (step === "next_hand") {
                await it.update({ embeds: [embedFor(state, "💥 BUST… main suivante.")], components: components(state) });
            }
            else {
                await it.deferUpdate();
                await finishGameTx(pool, state, it, "💥 BUST.");
            }
            return;
        }
        await it.update({ embeds: [embedFor(state)], components: components(state) });
        return;
    }
    if (action === "stand") {
        doStand(g);
        const step = nextHandOrEnd(g);
        if (step === "next_hand") {
            await it.update({ embeds: [embedFor(state, "➡️ Main suivante.")], components: components(state) });
            return;
        }
        await it.deferUpdate();
        await finishGameTx(pool, state, it, "🛑 Rester.");
        return;
    }
    await it.reply({ content: "Action inconnue.", ephemeral: true });
}
// helper local
function currentHand(g) {
    return g.hands[g.active];
}
