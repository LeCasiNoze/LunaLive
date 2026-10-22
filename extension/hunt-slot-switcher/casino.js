(() => {
  const rules=LunaSlotRules;
  let operation=null;
  const visible=e=>e instanceof HTMLElement && e.getClientRects().length>0 && getComputedStyle(e).visibility!=="hidden" && !e.disabled;
  function stop(){operation?.abort();operation=null;}
  async function open(slot,signal){
    const check=()=>{if(signal.aborted)throw Error("Recherche annulée.");};
    const wait=ms=>new Promise((resolve,reject)=>{
      check();const timer=setTimeout(done,ms);
      function done(){signal.removeEventListener("abort",abort);resolve();}
      function abort(){clearTimeout(timer);reject(Error("Recherche annulée."));}
      signal.addEventListener("abort",abort,{once:true});
    });
    const findInput=()=>[...document.querySelectorAll("input[type='search'],input[placeholder],input[aria-label],[role='searchbox']")].find(e=>
      e instanceof HTMLInputElement && visible(e) && (e.type==="search" || e.role==="searchbox" || /search|recherch|chercher/i.test((e.placeholder||"")+" "+(e.getAttribute("aria-label")||""))));
    check();
    let input=findInput();
    if(!input){
      const buttons=[...document.querySelectorAll("button,[role='button'],.sidebarMenu__searchForm")].filter(visible);
      const trigger=buttons.find(e=>/search|recherch|chercher/i.test((e.getAttribute("aria-label")||"")+" "+(e.getAttribute("title")||"")+" "+e.textContent))
        || buttons.find(e=>e.matches(".sidebarMenu__searchForm") || e.closest(".sidebarMenu__searchForm"));
      if(!trigger)throw Error("Recherche du casino introuvable. Option désactivable dans le hunt.");
      check();trigger.click();
      for(let i=0;i<25 && !input;i++){await wait(120);input=findInput();}
    }
    if(!input)throw Error("Champ de recherche introuvable.");
    check();
    // Native setter + bubbling events work with React-controlled inputs.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(input,slot.name);
    input.dispatchEvent(new Event("input",{bubbles:true}));
    input.dispatchEvent(new Event("change",{bubbles:true}));
    await wait(650);
    const wanted=rules.normalize(slot.name);
    const choose=()=>{
      const dialog=[...document.querySelectorAll("[role='dialog'],dialog[open]")].find(visible);
      const scope=dialog || document;
      const cards=[...scope.querySelectorAll("a[href],button,[role='button'],[data-game-name]")].filter(visible).filter(e=>{
        const labels=[e.getAttribute("data-game-name"),e.getAttribute("data-testid"),e.getAttribute("aria-label"),e.textContent,...[...e.querySelectorAll("img[alt]")].map(i=>i.alt)];
        if(!labels.some(s=>rules.normalize(s)===wanted))return false;
        // Only actual game cards. Never click a play/buy/spin or account CTA.
        if(e instanceof HTMLAnchorElement){
          const url=new URL(e.href,location.href);
          return url.origin===location.origin && /\/(games?|casino|slots?)\//i.test(url.pathname);
        }
        return e.hasAttribute("data-game-name");
      });
      const unique=new Map();
      for(const e of cards)unique.set(e.href || e,e);
      return [...unique.values()];
    };
    let previous=null;
    for(let i=0;i<40;i++){
      check();const cards=choose();
      if(cards.length>1)throw Error("Plusieurs résultats exacts : sélection manuelle nécessaire.");
      if(cards.length===1){
        const card=cards[0], key=card.href || card;
        if(previous===key){
          if(/indisponible|not available|non disponible/i.test(card.textContent))throw Error("Machine indisponible.");
          check();card.click();return;
        }
        previous=key;
      }else previous=null;
      await wait(200);
    }
    throw Error("Aucun résultat exact pour « "+slot.name+" ».");
  }
  chrome.runtime.onMessage.addListener((m,_sender,reply)=>{
    if(m?.type==="probe"){reply({ok:!!rules.casino(location.href)});return;}
    if(m?.type==="cancel"){stop();reply({ok:true});return;}
    if(m?.type!=="open" || !rules.validSlot(m.slot) || !rules.casino(location.href))return;
    if(operation){reply({ok:false,error:"Recherche déjà en cours."});return;}
    const controller=new AbortController();operation=controller;
    open(m.slot,controller.signal).then(()=>reply({ok:true})).catch(e=>reply({ok:false,error:e.message})).finally(()=>{if(operation===controller)operation=null;});
    return true;
  });
})();