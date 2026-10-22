(() => {
  const rules=LunaSlotRules;
  let operation=null;
  const visible=e=>e instanceof HTMLElement && e.getClientRects().length>0 && getComputedStyle(e).visibility!=="hidden" && !e.disabled;
  function stop(){operation?.abort();operation=null;}
  const label=e=>[e.getAttribute("aria-label"),e.getAttribute("title"),e.textContent].filter(Boolean).join(" ").trim();
  const exactLabel=(e,pattern)=>[e.getAttribute("aria-label"),e.getAttribute("title"),e.textContent].some(value=>pattern.test(String(value||"").trim()));
  async function prepareShuffle(message,signal){
    const expected=new URL(message.expectedUrl);
    if(rules.casino(expected.href)!=="Shuffle" || message.playMode!=="real")throw Error("Préparation Shuffle invalide.");
    function check(){
      if(signal.aborted)throw Error("Préparation annulée.");
      if(location.origin!==expected.origin || location.pathname.replace(/\/$/,"")!==expected.pathname.replace(/\/$/,""))throw Error("La machine a changé pendant la préparation.");
    }
    const wait=()=>new Promise(resolve=>setTimeout(resolve,100));
    const buttons=()=>[...document.querySelectorAll("button,[role='button']")].filter(visible);
    let select=null,footerClicked=false;
    for(let i=0;i<100;i++){
      check();select=[...document.querySelectorAll("select[name='currency'],select[name='fiatCurrency']")].find(visible);
      if(select)break;
      if(!footerClicked){
        const specific=buttons().filter(e=>e.getAttribute("aria-label")==="currency");
        const candidates=specific.length?specific:buttons().filter(e=>exactLabel(e,/^(?:EUR|ARS|USD|USDT|USDC|BRL|CAD|CNY|DKK|MXN|NOK|SEK|CHF)$/i));
        if(candidates.length===1){check();candidates[0].click();footerClicked=true;}
      }
      await wait();
    }
    if(!select)throw Error("Sélecteur de devise Shuffle introuvable.");
    if(![...select.options].some(o=>o.value==="ARS" && !o.disabled))throw Error("ARS indisponible pour cette machine.");
    const initialScope=select.closest("[role='dialog'],dialog[open]") || document;
    if([...initialScope.querySelectorAll("button,[role='button']")].filter(e=>e.getClientRects().length>0 && getComputedStyle(e).visibility!=="hidden" && exactLabel(e,/^(?:Jeu réel|Real play|Réel|Real)$/i)).length!==1)throw Error("Validation « Jeu réel » introuvable ou ambiguë.");
    check();
    if(select.value!=="ARS"){
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set.call(select,"ARS");
      select.dispatchEvent(new Event("input",{bubbles:true}));select.dispatchEvent(new Event("change",{bubbles:true}));
    }
    await wait();check();
    select=[...document.querySelectorAll("select[name='currency'],select[name='fiatCurrency']")].find(visible);
    if(!select || select.value!=="ARS")throw Error("Devise ARS non confirmée.");
    const scope=select.closest("[role='dialog'],dialog[open]") || document;
    const confirm=[...scope.querySelectorAll("button,[role='button']")].filter(visible).filter(e=>exactLabel(e,/^(?:Jeu réel|Real play|Réel|Real)$/i));
    if(confirm.length!==1)throw Error("Validation « Jeu réel » introuvable ou ambiguë.");
    const previousFrames=new Map([...document.querySelectorAll("iframe[src]")].map(e=>[e,{src:e.src,visible:visible(e)}]));
    check();confirm[0].click();
    let frame=null;
    for(let i=0;i<100;i++){
      check();
      const frames=[...document.querySelectorAll("iframe[src]")].filter(visible).filter(e=>{const previous=previousFrames.get(e);return !previous?.visible || previous.src!==e.src;}).filter(e=>{try{return /^https?:$/.test(new URL(e.src).protocol);}catch{return false;}});
      const currencyFrames=frames.filter(e=>{try{return new URL(e.src).searchParams.has("currency");}catch{return false;}});
      if(currencyFrames.some(e=>new URL(e.src).searchParams.get("currency")!=="ARS"))throw Error("Le fournisseur n’a pas confirmé l’ARS.");
      // Never read the cross-origin provider DOM or expose its launch URL.
      const candidates=currencyFrames.length?currencyFrames:frames.filter(e=>/pragmaticplay|hacksaw|nolimit/i.test(e.src));
      if(candidates.length===1){frame=candidates[0];break;}
      await wait();
    }
    if(!frame)throw Error("Chargement du jeu en ARS non confirmé.");
    const expanded=()=>{
      const rect=frame.getBoundingClientRect();
      const full=document.fullscreenElement;
      return !!(full && (full===frame || full.contains(frame))) || (rect.width>=innerWidth*.85 && rect.height>=innerHeight*.75);
    };
    if(expanded())return;
    const fullControls=buttons().filter(e=>/fullscreen|full screen|plein écran|agrandir|réduire/i.test(label(e)));
    if(fullControls.length===1 && (fullControls[0].getAttribute("aria-pressed")==="true" || /exit|quitter|sortir|réduire|minimize/i.test(label(fullControls[0]))))return;
    const controls=fullControls.filter(e=>!/exit|quitter|sortir|réduire|minimize/i.test(label(e)));
    if(controls.length!==1)throw Error("Bouton d’agrandissement Shuffle introuvable ou ambigu.");
    check();controls[0].click();
    for(let i=0;i<30;i++){
      check();if(expanded() || controls[0].getAttribute("aria-pressed")==="true" || /exit|quitter|réduire|minimize/i.test(label(controls[0])))return;
      await wait();
    }
    throw Error("ARS confirmé, mais agrandissement du jeu non confirmé.");
  }
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
          if(rules.casino(location.href)==="Shuffle"){
            const ack=await chrome.runtime.sendMessage({type:"game-selected",callId:slot.callId,url:card.href});
            if(!ack?.ok)throw Error(ack?.error || "Sélection Shuffle non autorisée.");
          }
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
    if(m?.type==="prepare-shuffle"){
      if(rules.casino(location.href)!=="Shuffle" || !rules.validSlot(m.slot)){reply({ok:false,error:"Page Shuffle invalide."});return;}
      if(operation){reply({ok:false,retry:true});return;}
      const controller=new AbortController();operation=controller;
      prepareShuffle(m,controller.signal).then(()=>reply({ok:true})).catch(e=>reply({ok:false,error:e.message})).finally(()=>{if(operation===controller)operation=null;});
      return true;
    }
    if(m?.type!=="open" || !rules.validSlot(m.slot) || !rules.casino(location.href))return;
    if(operation){reply({ok:false,error:"Recherche déjà en cours."});return;}
    const controller=new AbortController();operation=controller;
    open(m.slot,controller.signal).then(()=>reply({ok:true})).catch(e=>reply({ok:false,error:e.message})).finally(()=>{if(operation===controller)operation=null;});
    return true;
  });
})();
