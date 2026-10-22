/* Shared pure rules, also used by the fixture tests. */
globalThis.LunaSlotRules = (() => {
  function casino(url) {
    try {
      const u = new URL(url);
      if (u.protocol !== "https:") return null;
      const h = u.hostname;
      if (h === "shuffle.com" || h.endsWith(".shuffle.com")) return "Shuffle";
      if (["celsiuscasino.com","celsiuscasino.co"].some(d => h === d || h.endsWith("." + d))) return "Celsius";
    } catch {}
    return null;
  }
  function luna(url) {
    try { const u=new URL(url);return u.protocol==="https:" && ["lunalive.win","www.lunalive.win","lunalive.onrender.com"].includes(u.hostname)
      || u.protocol==="http:" && ["localhost","127.0.0.1"].includes(u.hostname); } catch { return false; }
  }
  function normalize(s) {return String(s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();}
  function chooseTab(tabs, boundId) {
    const allowed=tabs.filter(t=>casino(t.url));
    const bound=allowed.find(t=>t.id===boundId);
    if(bound)return bound;
    if(allowed.length===1)return allowed[0];
    throw Error(allowed.length ? "Plusieurs casinos ouverts : choisis l’onglet dans l’extension." : "Ouvre Shuffle ou Celsius dans ce navigateur.");
  }
  function validSlot(s) {return !!s && typeof s.name==="string" && s.name.trim().length>0 && s.name.length<=180 && typeof s.callId==="string" && s.callId.trim().length>0 && s.callId.length<=100;}
  return {casino,luna,normalize,chooseTab,validSlot};
})();