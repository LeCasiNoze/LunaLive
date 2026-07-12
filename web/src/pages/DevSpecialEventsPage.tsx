// web/src/pages/DevSpecialEventsPage.tsx
// ─────────────────────────────────────────────────────────────────────────
// BANC DE TEST des messages contextuels (raid/follow/combo/sub/don/coffre/
// rain/roue/prédiction/boss/level + recap). Route non listée : /dev/special-events
//
// Objectif : reproduire À L'IDENTIQUE le rendu et la logique du chat réel
// (ChatPanel) — mêmes composants (ChatMessageBubble, SpecialEventCard,
// ActiveEventsBar), mêmes handlers, même découpage celebration/actionable/
// recap — avec de VRAIS comptes et leurs skins réels, pour tester chaque
// message contextuel et corriger ce qui ne marche pas.
//
// ⚠️ Ce banc câble les 5 callbacks de SpecialEventCard. Le vrai ChatPanel
// n'en câble que 2 (onGg, onCombo) → onFollowChannel / onSubscribe /
// onBossPage y sont undefined (build cassé + boutons Suivre/S'abonner/Voir
// l'event qui plantent). C'est le 1er bug à corriger côté ChatPanel.
// ─────────────────────────────────────────────────────────────────────────
import * as React from "react";
import { ChatMessageBubble } from "../components/chat/ChatMessageBubble";
import SpecialEventCard, { type SpecialEventType } from "../components/chat/SpecialEventCard";
import ActiveEventsBar, { type ActiveEvent } from "../components/chat/ActiveEventsBar";
import {
  useActionableEngine, ActionablePinnedBar, ActionableChatCard, WheelOverlay, ParticipantListModal,
} from "../components/chat/ActionableEvents";
import { DEFAULT_APPEARANCE } from "../lib/appearance";

/* ── Constantes miroir de ChatPanel ────────────────────────────────────── */
const CELEBRATION_TYPES = new Set<string>(["raid", "follow", "combo", "sub", "don", "boss", "level"]);
const ACTIONABLE_TYPES = new Set<string>(["rain", "wheel", "predict", "chest"]);
const CHAT_ENTER_ANIM = "slide";

/* ── Pool de VRAIS comptes + skins réels (assemblés par la vraie fonction
   serveur getChatCosmeticsForUsers, capturés depuis la prod) ───────────── */
// cosmetics : typées `any` — ce sont les valeurs RÉELLES assemblées par le
// serveur (ex. effect "garden-of-ashes", frameId "void"), plus larges que
// les unions strictes du front. On les rend telles quelles.
type PoolUser = { userId: number; username: string; role: string; cosmetics: any };
const POOL: PoolUser[] = [
  { userId: 4, username: "LeCasiNoze", role: "streamer", cosmetics: { username: { effect: "garden-of-ashes", color: null }, frame: { frameId: "void" }, avatar: { url: "https://lunalive-api.onrender.com/avatars/u/4?v=1768415552606" }, badges: [{ id: "badge_og", label: "OG", tier: "silver" }], title: "level_auto", titles: { achievement: { source: "achievement", code: "title_parfait", label: "Parfait", rarity: "legendary" }, level: { source: "level", code: "level_auto", label: "Légende LunaLive", rarity: "mythic" } } } },
  { userId: 7, username: "CNZ_nico-carasso", role: "viewer", cosmetics: { username: { effect: "rainbow_scroll", color: null }, avatar: { url: "https://lunalive.win/Avatar/avatar_mage.png" }, badges: [], title: "title_ratus" } },
  { userId: 5, username: "SpyKatra", role: "streamer", cosmetics: { avatar: { hatId: "luna_cap", hatEmoji: "🧢", url: "https://lunalive-api.onrender.com/avatars/u/5?v=1768060509575" } } },
  { userId: 13, username: "RedakB", role: "streamer", cosmetics: { avatar: { url: "https://lunalive-api.onrender.com/avatars/u/13?v=1767992864793" }, badges: [] } },
  { userId: 10, username: "SSZ_TV", role: "viewer", cosmetics: { avatar: { url: "https://lunalive.win/Avatar/avatar_panda.png" }, badges: [] } },
  { userId: 6, username: "Test", role: "viewer", cosmetics: { avatar: { url: "https://lunalive.win/Avatar/avatar_ghost.png" }, badges: [] } },
  { userId: 8, username: "LunaLive", role: "viewer", cosmetics: { avatar: { url: "https://lunalive-api.onrender.com/avatars/u/8?v=1770200575229" }, badges: [] } },
  { userId: 12, username: "LunaBot", role: "viewer", cosmetics: { avatar: { hatId: "luna_cap", hatEmoji: "🧢", url: "https://lunalive-api.onrender.com/avatars/u/12?v=1769544819655" } } },
];

/* ── Types locaux (miroir ChatPanel.ChatMsg) ───────────────────────────── */
type ChatMsg = {
  id: number;
  userId: number;
  username: string;
  body: string;
  createdAt: string;
  cosmetics?: any;
  role?: string | null;
  type?: SpecialEventType | "recap" | "sys" | "act";
  data?: any;
};

let SEQ = 1;
const nextId = () => -(Date.now() * 100000 + (SEQ = (SEQ + 1) % 100000));
const pick = () => POOL[Math.floor(Math.random() * POOL.length)];
function pickN(n: number): PoolUser[] {
  const shuffled = [...POOL].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, POOL.length));
}

/* Corps de réaction crédibles par type d'event (participation simulée). */
const REACTIONS: Record<string, string[]> = {
  raid: ["Bienvenue les raiders ! 🔥", "GG le raid 💜", "Ça débarque en force", "Hello la commu 👋", "Raid de fou 🚀"],
  follow: ["GG le follow !", "Bienvenue 💙", "+1 dans la famille 🎉", "Welcome !"],
  combo: ["COMBO 🔥", "Ça enchaîne !", "On lâche rien 💪", "GG le combo"],
  sub: ["GG le sub ⭐", "Merci pour le soutien 💜", "Welcome to the club", "Big up le sub 🙌"],
  don: ["Quel don ! 💚", "Généreux 👏", "Merci 🙏", "Respect 💚"],
  boss: ["ON L'A EU 🔥", "GG boss 💀", "Trop forte la commu", "VICTOIRE ⚔️"],
  level: ["GG le level up ⭐", "Bravo 🎉", "Ça monte 💪", "Well played"],
  rain: ["Je participe ! 💎", "Rain time 🌧️", "Let's go", "Merci pour la rain"],
  wheel: ["Je tente ma chance 🎡", "Allez la roue !", "On croise les doigts"],
  predict: ["Je vote OUI", "Team NON 😤", "Facile 🔮", "Risky mais go"],
  chest: ["J'ouvre 🗝️", "Coffre time 📦", "Loot 🎁", "Go go go"],
};

export default function DevSpecialEventsPage(): React.JSX.Element {
  const [messages, setMessages] = React.useState<ChatMsg[]>([]);
  const [activeEvents, setActiveEvents] = React.useState<ActiveEvent[]>([]);
  const [log, setLog] = React.useState<Array<{ id: number; t: string; label: string; detail?: string }>>([]);
  const [meIdx, setMeIdx] = React.useState(0); // quel compte du pool "je" suis
  const [viewerFollows, setViewerFollows] = React.useState(false);
  const [viewerSubbed, setViewerSubbed] = React.useState(false);
  const [autoReact, setAutoReact] = React.useState(true);
  const [asStreamer, setAsStreamer] = React.useState(true);

  const animatedIds = React.useRef<Set<number>>(new Set());
  const listRef = React.useRef<HTMLDivElement | null>(null);

  const me = POOL[meIdx];

  /* ── log console ─────────────────────────────────────────────────────── */
  const logEvent = React.useCallback((label: string, detail?: string) => {
    setLog((prev) => [{ id: Date.now() + Math.random(), t: new Date().toLocaleTimeString("fr-FR"), label, detail }, ...prev].slice(0, 60));
  }, []);

  /* ── scroll bottom multi-pass (miroir ChatPanel) ─────────────────────── */
  const scrollBottom = React.useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const go = () => { el.scrollTop = el.scrollHeight; };
    go();
    requestAnimationFrame(go);
    [50, 150, 300].forEach((d) => setTimeout(go, d));
  }, []);

  /* ── push message dans le flux (cap 50, anim d'entrée) ───────────────── */
  const pushMessage = React.useCallback((m: ChatMsg) => {
    animatedIds.current.add(m.id);
    setMessages((prev) => {
      const next = [...prev, m];
      if (next.length > 50) next.splice(0, next.length - 50);
      return next;
    });
    scrollBottom();
  }, [scrollBottom]);

  /* ── injection miroir socket.on("chat:message") de ChatPanel ─────────── */
  const injectSpecial = React.useCallback((type: SpecialEventType, data: any) => {
    if (ACTIONABLE_TYPES.has(type)) {
      const id = `ev_${Math.abs(nextId())}_${SEQ}`;
      setActiveEvents((prev) => [...prev, { id, type: type as ActiveEvent["type"], data: data || {} }].slice(-4));
      logEvent(`inject ${type}`, "→ barre épinglée (ActiveEventsBar)");
      return;
    }
    pushMessage({ id: nextId(), userId: 0, username: "LunaLive", body: "", createdAt: new Date().toISOString(), type, data });
    logEvent(`inject ${type}`, "→ flux (SpecialEventCard)");
  }, [pushMessage, logEvent]);

  /* ── réactions simulées de vrais comptes ─────────────────────────────── */
  const spawnReactions = React.useCallback((kind: string, n = 3) => {
    if (!autoReact) return;
    const bodies = REACTIONS[kind] || ["GG !", "🔥", "Let's go"];
    pickN(n).forEach((u, i) => {
      setTimeout(() => {
        pushMessage({
          id: nextId(), userId: u.userId, username: u.username, role: u.role,
          body: bodies[Math.floor(Math.random() * bodies.length)],
          createdAt: new Date().toISOString(), cosmetics: u.cosmetics,
        });
      }, 350 + i * 550 + Math.random() * 300);
    });
  }, [autoReact, pushMessage]);

  /* ── handlers SpecialEventCard (miroir EXACT de ChatPanel) ────────────── */
  // GG cohérent avec le contexte de la carte (miroir ChatPanel.GG_MESSAGES).
  const GG_MESSAGES: Record<string, string[]> = {
    boss: ["On l'a eu ! 🔥", "GG la team 💪", "Boss down 💀", "Quelle bataille ⚔️"],
    sub: ["Merci pour le soutien 💜", "GG le sub ⭐", "Welcome to the club 🙌"],
    follow: ["GG le follow 💙", "Bienvenue ! 👋", "+1 dans la famille 🎉"],
    combo: ["Ça enchaîne 🔥", "Combo de fou !", "On lâche rien 💪"],
    don: ["Merci pour le don 💚", "Généreux 🙏", "Respect 👏"],
    level: ["GG le level up ⭐", "Bravo 🎉", "Ça monte 💪"],
    raid: ["Bienvenue sur la chaîne ! 🔥", "Merci pour le raid 💜", "GG le raid 🙌", "Hello la commu 👋"],
  };
  const handleGg = React.useCallback((who: string | null, kind: SpecialEventType) => {
    const pool = GG_MESSAGES[kind] || GG_MESSAGES.follow;
    const base = pool[Math.floor(Math.random() * pool.length)];
    const nameable = kind === "follow" || kind === "sub" || kind === "don" || kind === "level";
    const txt = who && nameable && Math.random() > 0.5 ? `${base} @${who}` : base;
    pushMessage({ id: nextId(), userId: me.userId, username: me.username, role: me.role, body: txt, createdAt: new Date().toISOString(), cosmetics: me.cosmetics });
    logEvent("onGg", `[${kind}] « ${txt} » (en tant que ${me.username})`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, pushMessage, logEvent]);

  // Deux chaînes distinctes (follow / sub) via un chip id par kind.
  const handleCombo = React.useCallback((nextMult: number, kind: "follow" | "sub") => {
    pushMessage({ id: nextId(), userId: 0, username: "LunaLive", body: "", createdAt: new Date().toISOString(), type: "combo", data: { mult: nextMult, who: me.username, kind } });
    const chipId = kind === "sub" ? "combo:sub" : "combo:follow";
    setActiveEvents((prev) => {
      const others = prev.filter((e) => e.id !== chipId);
      const comboChip: ActiveEvent = { id: chipId, type: "combo", data: { mult: nextMult, kind } };
      return [...others, comboChip].slice(-4);
    });
    logEvent("onCombo", `combo ${kind} x${nextMult} (carte + chip)`);
  }, [me, pushMessage, logEvent]);

  const pushRecap = React.useCallback((html: string) => {
    pushMessage({ id: nextId(), userId: 0, username: "LunaLive", body: "", createdAt: new Date().toISOString(), type: "recap", data: { html } });
    logEvent("recap", html.replace(/<[^>]+>/g, ""));
  }, [pushMessage, logEvent]);

  // Message SYSTÈME dans le flux (distinct du recap : "XXX a récupéré…", etc.)
  const pushSystem = React.useCallback((html: string) => {
    pushMessage({ id: nextId(), userId: 0, username: "LunaLive", body: "", createdAt: new Date().toISOString(), type: "sys", data: { html } });
    logEvent("système", html.replace(/<[^>]+>/g, ""));
  }, [pushMessage, logEvent]);

  /* ── moteur d'events actionnables (état partagé chat ↔ épinglé) ────────── */
  const engine = useActionableEngine({
    me: me.username,
    poolNames: POOL.map((u) => u.username),
    emitSystem: pushSystem,
    emitRecap: pushRecap,
    addChatCard: (actId: string) => pushMessage({ id: nextId(), userId: 0, username: "LunaLive", body: "", createdAt: new Date().toISOString(), type: "act", data: { actId } }),
    simulate: true,
  });

  // Follow réel + (si raidée) carte follow contexte pour le viewer.
  const onFollowChannel = React.useCallback((slug: string, asFollowEvent?: boolean) => {
    logEvent("onFollowChannel", `follow « ${slug || "?"} »${asFollowEvent ? " (raidée → carte follow contexte)" : ""}`);
    if (asFollowEvent) {
      pushMessage({ id: nextId(), userId: 0, username: "LunaLive", body: "", createdAt: new Date().toISOString(), type: "follow", data: { who: me.username } });
    }
  }, [me, pushMessage, logEvent]);
  const onSubscribe = React.useCallback(() => {
    logEvent("onSubscribe", "ouvre la SubModal (event ui:open_sub sur la page streamer)");
  }, [logEvent]);
  const onBossPage = React.useCallback(() => {
    logEvent("onBossPage", "→ navigue vers /event (réel dans ChatPanel)");
  }, [logEvent]);

  const removeActiveEvent = React.useCallback((id: string) => setActiveEvents((prev) => prev.filter((e) => e.id !== id)), []);

  // mult courant d'une chaîne combo active (pour l'auto-advance sur follow/sub réel).
  const activeComboMult = React.useCallback((kind: "follow" | "sub") => {
    const chip = activeEvents.find((e) => e.id === (kind === "sub" ? "combo:sub" : "combo:follow"));
    return chip ? Number(chip.data?.mult ?? 1) : null;
  }, [activeEvents]);

  /* ── triggers boutons ────────────────────────────────────────────────── */
  const trig = {
    // Raid = TOUJOURS deux chaînes (raideur + raidée) avec leurs avatars réels.
    raid: () => {
      const raider = pick(); let raided = pick(); if (raided.userId === raider.userId) raided = POOL[(POOL.indexOf(raider) + 1) % POOL.length];
      injectSpecial("raid", {
        from: raider.username, viewers: 20 + Math.floor(Math.random() * 200),
        raiderSlug: raider.username.toLowerCase(), raiderName: raider.username, raiderAvatar: raider.cosmetics?.avatar?.url ?? null,
        raidedSlug: raided.username.toLowerCase(), raidedName: raided.username, raidedAvatar: raided.cosmetics?.avatar?.url ?? null,
      });
      spawnReactions("raid", 4);
    },
    // Un follow réel pendant un combo follow actif → avance le combo (sinon carte follow).
    follow: () => { const m = activeComboMult("follow"); if (m != null) { handleCombo(m + 1, "follow"); logEvent("auto-combo", `follow pendant combo → x${m + 1}`); } else injectSpecial("follow", { who: pick().username }); spawnReactions("follow", 2); },
    combo: () => { injectSpecial("combo", { who: pick().username, mult: 2 + Math.floor(Math.random() * 4), kind: "follow" }); spawnReactions("combo", 2); },
    // Un sub réel pendant un combo sub actif → avance le combo sub (sinon carte sub).
    sub: () => { const m = activeComboMult("sub"); if (m != null) { handleCombo(m + 1, "sub"); logEvent("auto-combo", `sub pendant combo → x${m + 1}`); } else injectSpecial("sub", { who: pick().username, months: 1 + Math.floor(Math.random() * 12) }); spawnReactions("sub", 3); },
    don: () => { injectSpecial("don", { who: pick().username, amount: 5 + Math.random() * 95, message: "« Continue comme ça, énorme ! »" }); spawnReactions("don", 3); },
    boss: () => { injectSpecial("boss", { by: pick().username }); spawnReactions("boss", 4); },
    level: () => { injectSpecial("level", { who: pick().username, level: 2 + Math.floor(Math.random() * 40), title: "Vrai Viewer" }); spawnReactions("level", 2); },
    rain: () => { engine.open("rain", { pot: 500 + Math.floor(Math.random() * 4500) }); spawnReactions("rain", 3); },
    wheel: () => { engine.open("wheel", {}); spawnReactions("wheel", 2); },
    predict: () => { engine.open("predict", { question: "LeCasiNoze finit en positif ?", option1: "OUI", option2: "NON" }); spawnReactions("predict", 3); },
    chest: () => { engine.open("chest", { loot: 200 + Math.floor(Math.random() * 800) }); spawnReactions("chest", 3); },
    normal: () => { const u = pick(); pushMessage({ id: nextId(), userId: u.userId, username: u.username, role: u.role, body: ["Salut tout le monde 👋", "gg la win", "il est chaud ce bonus", "@LeCasiNoze t'es un monstre", "Purple velvet 💜", "on lâche rien"][Math.floor(Math.random() * 6)], createdAt: new Date().toISOString(), cosmetics: u.cosmetics }); },
  };

  const clearAll = () => { setMessages([]); setActiveEvents([]); animatedIds.current.clear(); };
  const seedChat = React.useCallback(() => {
    POOL.forEach((u, i) => setTimeout(() => pushMessage({
      id: nextId(), userId: u.userId, username: u.username, role: u.role,
      body: ["Yo 👋", "gg", "présent !", "il commence quand le live ?", "💜", "on est là"][i % 6],
      createdAt: new Date().toISOString(), cosmetics: u.cosmetics,
    }), i * 120));
  }, [pushMessage]);

  React.useEffect(() => { seedChat(); }, [seedChat]);

  /* ── rendu ───────────────────────────────────────────────────────────── */
  return (
    <div style={S.page}>
      <div style={S.head}>
        <div>
          <h1 style={S.h1}>🧪 Banc de test — messages contextuels</h1>
          <p style={S.hsub}>Chat réel (mêmes composants + logique que ChatPanel) · pool de {POOL.length} vrais comptes avec leurs skins · déclenche & observe le comportement exact.</p>
        </div>
      </div>

      <div style={S.warn}>
        ✅ <b>Actionnables v2</b> (rain / roue / prédiction / coffre) : carte dans le chat <b>+</b> chip épinglé <b>synchronisés</b>
        (participer d'un côté désactive l'autre), compteur de participants, message système « XXX a récupéré… », % de prédiction
        en <b>temps réel</b>, verrouillage à la fin du temps. En streamer : <b>Liste</b> (ajout/retrait participants) et <b>Ouvrir</b>
        → <b>roue partagée plein écran</b> qui tire un gagnant, ou choix du vainqueur de la prédiction. (Simulation locale — le
        backend temps réel synchronisera le même résultat chez tous les viewers.)
      </div>

      <div style={S.split}>
        {/* ── CHAT RÉPLIQUE ── */}
        <div style={S.chatCol}>
          <div style={S.chatShell}>
            <div style={S.chatTop}>#lecasinoze · aperçu chat</div>
            <ActiveEventsBar
              events={activeEvents}
              onExpire={removeActiveEvent}
              onJoinRain={(id) => logEvent("onJoinRain", `rain ${id}`)}
              onSpin={(id) => logEvent("onSpin", `roue ${id}`)}
              onVote={(id, opt) => logEvent("onVote", `${opt} · ${id}`)}
              onChestOpen={(id) => logEvent("onChestOpen", `coffre ${id}`)}
              onComboAdvance={handleCombo}
              recap={pushRecap}
            />
            <ActionablePinnedBar engine={engine} isStreamer={asStreamer} />
            <div ref={listRef} className="chatScroll" style={S.scroll}>
              {messages.length === 0 ? <div style={{ opacity: .5, fontSize: 13 }}>Aucun message</div> : null}
              {messages.map((m) => {
                if (m.type === "recap") {
                  return (
                    <div key={m.id}
                      className={animatedIds.current.has(m.id) ? `chat-enter ${CHAT_ENTER_ANIM}` : undefined}
                      onAnimationEnd={() => animatedIds.current.delete(m.id)}
                      style={S.recap}
                      dangerouslySetInnerHTML={{ __html: String(m.data?.html || "") }} />
                  );
                }
                if (m.type === "sys") {
                  return (
                    <div key={m.id}
                      className={animatedIds.current.has(m.id) ? `chat-enter ${CHAT_ENTER_ANIM}` : undefined}
                      onAnimationEnd={() => animatedIds.current.delete(m.id)}
                      style={S.sys}
                      dangerouslySetInnerHTML={{ __html: `<span style="opacity:.6">🔔</span> ${String(m.data?.html || "")}` }} />
                  );
                }
                if (m.type === "act") {
                  const ev = engine.events.find((x) => x.id === m.data?.actId) || null;
                  return (
                    <div key={m.id}
                      className={animatedIds.current.has(m.id) ? `chat-enter ${CHAT_ENTER_ANIM}` : undefined}
                      onAnimationEnd={() => animatedIds.current.delete(m.id)}
                      style={{ width: "100%" }}>
                      <ActionableChatCard event={ev} engine={engine} isStreamer={asStreamer} />
                    </div>
                  );
                }
                if (m.type && CELEBRATION_TYPES.has(m.type)) {
                  return (
                    <div key={m.id}
                      className={animatedIds.current.has(m.id) ? `chat-enter ${CHAT_ENTER_ANIM}` : undefined}
                      onAnimationEnd={() => animatedIds.current.delete(m.id)}
                      style={{ width: "100%" }}>
                      <SpecialEventCard
                        type={m.type as SpecialEventType}
                        data={m.data || {}}
                        currentUsername={me.username}
                        viewerFollows={viewerFollows}
                        viewerSubbed={viewerSubbed}
                        onGg={handleGg}
                        onCombo={handleCombo}
                        onFollowChannel={onFollowChannel}
                        onSubscribe={onSubscribe}
                        onBossPage={onBossPage}
                      />
                    </div>
                  );
                }
                return (
                  <div key={m.id}
                    className={animatedIds.current.has(m.id) ? `chat-enter ${CHAT_ENTER_ANIM}` : undefined}
                    onAnimationEnd={() => animatedIds.current.delete(m.id)}
                    style={{ width: "100%" }}>
                    <ChatMessageBubble
                      streamerAppearance={DEFAULT_APPEARANCE}
                      currentUsername={me.username}
                      msg={m as any}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── CONTRÔLES ── */}
        <div style={S.ctrlCol}>
          <div style={S.card}>
            <div style={S.cardT}>Contexte de test</div>
            <label style={S.row}>
              <span style={S.lbl}>Je suis :</span>
              <select value={meIdx} onChange={(e) => setMeIdx(Number(e.target.value))} style={S.select}>
                {POOL.map((u, i) => <option key={u.userId} value={i}>{u.username} ({u.role})</option>)}
              </select>
            </label>
            <label style={S.check}><input type="checkbox" checked={viewerFollows} onChange={(e) => setViewerFollows(e.target.checked)} /> je follow déjà (cache « tu follow aussi »)</label>
            <label style={S.check}><input type="checkbox" checked={viewerSubbed} onChange={(e) => setViewerSubbed(e.target.checked)} /> je suis déjà sub (cache « S'abonner aussi »)</label>
            <label style={S.check}><input type="checkbox" checked={autoReact} onChange={(e) => setAutoReact(e.target.checked)} /> réactions auto des comptes</label>
            <label style={S.check}><input type="checkbox" checked={asStreamer} onChange={(e) => setAsStreamer(e.target.checked)} /> je suis le streamer (voir contrôles Liste/Ouvrir)</label>
          </div>

          <div style={S.card}>
            <div style={S.cardT}>Célébrations <small style={S.hint}>(flux · SpecialEventCard)</small></div>
            <div style={S.grid}>
              <button style={S.b} onClick={trig.raid}>⚔️ Raid (2 chaînes)</button>
              <button style={S.b} onClick={trig.follow}>💙 Follow</button>
              <button style={S.b} onClick={trig.combo}>🔥 Combo</button>
              <button style={S.b} onClick={trig.sub}>⭐ Sub</button>
              <button style={S.b} onClick={trig.don}>💚 Don</button>
              <button style={S.b} onClick={trig.boss}>💀 Boss vaincu</button>
              <button style={S.b} onClick={trig.level}>⭐ Level up</button>
            </div>
          </div>

          <div style={S.card}>
            <div style={S.cardT}>Actionnables <small style={S.hint}>(chat + épinglé synchronisés)</small></div>
            <div style={S.grid}>
              <button style={S.b} onClick={trig.rain}>💎 Rain</button>
              <button style={S.b} onClick={trig.wheel}>🎡 Roue</button>
              <button style={S.b} onClick={trig.predict}>🔮 Prédiction</button>
              <button style={S.b} onClick={trig.chest}>📦 Coffre</button>
            </div>
            <p style={{ fontSize: 11, opacity: .55, margin: "8px 0 0", lineHeight: 1.5 }}>
              Participer depuis la carte du chat OU le chip épinglé (synchronisés). En streamer : « Liste » gère les
              participants, « Ouvrir » lance la roue partagée / choisit le vainqueur de la prédiction.
            </p>
          </div>

          <div style={S.card}>
            <div style={S.cardT}>Utilitaires</div>
            <div style={S.grid}>
              <button style={S.b} onClick={trig.normal}>💬 Message normal</button>
              <button style={S.b} onClick={seedChat}>🌱 Re-seed chat</button>
              <button style={{ ...S.b, borderColor: "rgba(240,78,78,.4)" }} onClick={clearAll}>🗑️ Vider</button>
            </div>
          </div>

          <div style={S.card}>
            <div style={S.cardT}>Console callbacks</div>
            <div style={S.console}>
              {log.length === 0 ? <div style={{ opacity: .4, fontSize: 12 }}>Les callbacks des boutons s'afficheront ici…</div> : null}
              {log.map((l) => (
                <div key={l.id} style={S.logLine}>
                  <span style={S.logT}>{l.t}</span>
                  <b style={S.logLabel}>{l.label}</b>
                  {l.detail ? <span style={S.logDetail}> — {l.detail}</span> : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Roue partagée plein écran + modale liste participants (streamer) */}
      <WheelOverlay overlay={engine.overlay} onClose={() => { /* auto-fermeture gérée par le moteur */ }} />
      <ParticipantListModal engine={engine} />
    </div>
  );
}

/* ── styles ────────────────────────────────────────────────────────────── */
const S: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#0a0713", color: "rgba(235,232,255,.92)", padding: "20px 24px 60px", fontFamily: "system-ui, sans-serif" },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  h1: { fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: "-.3px" },
  hsub: { fontSize: 13, opacity: .65, margin: "4px 0 0" },
  warn: { fontSize: 12.5, lineHeight: 1.6, padding: "10px 14px", borderRadius: 12, border: "1px solid rgba(245,158,11,.32)", background: "rgba(245,158,11,.10)", color: "rgba(253,230,138,.92)", marginBottom: 16 },
  split: { display: "grid", gridTemplateColumns: "minmax(340px, 1fr) minmax(360px, 1fr)", gap: 20, alignItems: "start" },
  chatCol: { position: "sticky", top: 12 },
  chatShell: { display: "flex", flexDirection: "column", height: "78vh", borderRadius: 18, overflow: "hidden", border: "1px solid rgba(124,92,252,.20)", background: "rgba(15,10,24,.97)", boxShadow: "0 30px 80px rgba(0,0,0,.5)" },
  chatTop: { padding: "10px 14px", fontSize: 12, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "rgba(167,155,220,.6)", borderBottom: "1px solid rgba(255,255,255,.06)" },
  scroll: { flex: 1, minHeight: 0, overflow: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 },
  recap: { alignSelf: "center", fontSize: 11.5, fontWeight: 700, color: "rgba(255,255,255,.55)", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", padding: "5px 12px", borderRadius: 999 },
  sys: { alignSelf: "stretch", fontSize: 11.5, fontWeight: 600, color: "rgba(180,170,220,.8)", background: "rgba(124,92,252,.07)", border: "1px solid rgba(124,92,252,.14)", padding: "5px 12px", borderRadius: 9 },
  ctrlCol: { display: "flex", flexDirection: "column", gap: 14 },
  card: { borderRadius: 14, border: "1px solid rgba(124,92,252,.16)", background: "rgba(20,15,32,.7)", padding: 14 },
  cardT: { fontSize: 13, fontWeight: 800, marginBottom: 10, letterSpacing: "-.2px" },
  hint: { fontWeight: 500, opacity: .5, fontSize: 11 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 },
  b: { height: 40, borderRadius: 10, border: "1px solid rgba(124,92,252,.22)", background: "rgba(124,92,252,.10)", color: "rgba(235,232,255,.92)", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  row: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 },
  lbl: { fontSize: 12.5, opacity: .7, minWidth: 60 },
  select: { flex: 1, height: 34, borderRadius: 8, background: "rgba(0,0,0,.3)", color: "inherit", border: "1px solid rgba(124,92,252,.2)", padding: "0 8px" },
  check: { display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, opacity: .85, marginTop: 6, cursor: "pointer" },
  console: { maxHeight: 240, overflow: "auto", display: "flex", flexDirection: "column", gap: 4, fontFamily: "ui-monospace, monospace" },
  logLine: { fontSize: 11.5, lineHeight: 1.5, borderBottom: "1px solid rgba(255,255,255,.04)", paddingBottom: 3 },
  logT: { opacity: .4, marginRight: 6 },
  logLabel: { color: "#c4b5fd" },
  logDetail: { opacity: .75 },
};
