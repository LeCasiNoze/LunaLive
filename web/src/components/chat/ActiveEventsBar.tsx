// web/src/components/chat/ActiveEventsBar.tsx
//
// Combos confirmés par le serveur. Les autres événements utilisent
// ActionablePinnedBar et leur état partagé avec les cartes du chat.
// Le "récap dans le flux" n'est pas rendu ici : on appelle props.recap(html)
// et c'est au parent de le poster dans le fil de messages.

import * as React from "react";
import "./specialEvents.css";

export type ActiveEvent = {
  id: string;
  type: "rain" | "wheel" | "predict" | "chest" | "combo";
  data: any;
};

const DUR = { comboIdle: 15 };

/* ─── Combo (fenêtre glissante 15s, ré-armée sur data.mult) ─ */
function ComboChip({ id, data, onExpire, onComboAdvance, recap, viewerFollows, viewerSubbed }: {
  id: string;
  data: any;
  onExpire: (id: string) => void;
  onComboAdvance: (nextMult: number, kind: "follow" | "sub") => void | boolean | Promise<boolean | void>;
  recap: (html: string) => void;
  viewerFollows?: boolean | null;
  viewerSubbed?: boolean | null;
}) {
  const mult = Number(data?.mult ?? 1);
  const kind: "follow" | "sub" = data?.kind === "sub" ? "sub" : "follow";
  const isSub = kind === "sub";
  const gated=isSub?viewerSubbed:viewerFollows;
  const busy=React.useRef(false);
  const [pending,setPending]=React.useState(false);
  async function advance() {
    if(busy.current||gated||gated===null) return;
    busy.current=true;setPending(true);
    try {await onComboAdvance(mult+1,kind);} catch {} finally {busy.current=false;setPending(false);}
  }
  const ic = isSub ? "⭐" : "🔥";
  const [remaining, setRemaining] = React.useState(DUR.comboIdle);
  const expiredRef = React.useRef(false);
  const multRef = React.useRef(mult);
  React.useEffect(() => { multRef.current = mult; }, [mult]);

  React.useEffect(() => {
    expiredRef.current = false;
    setRemaining(DUR.comboIdle);
    const iv = setInterval(() => {
      setRemaining(t => {
        const next = t - 1;
        if (next <= 0 && !expiredRef.current) {
          expiredRef.current = true;
          clearInterval(iv);
          onExpire(id);
          recap(`${ic} Combo ${isSub ? "sub" : "follow"} terminé à <b>x${multRef.current}</b>`);
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, mult]);

  return (
    <div className={`lle-chip ${isSub ? "lle-chip--combosub" : "lle-chip--combo"}`} data-id={id}>
      <div className="lle-chip__row">
        <span className="lle-chip__ic">{ic}</span>
        <div className="lle-chip__mid">
          <div className="lle-chip__t">Combo {isSub ? "sub" : "follow"}</div>
          <div className="lle-chip__meta">x{mult} en cours {ic}</div>
        </div>
        <button className="lle-chip__cta" disabled={pending||!!gated||gated===null} onClick={() => void advance()}>{gated?(isSub?"✓ Déjà abonné":"✓ Déjà suivi"):gated===null?"Vérification…":pending?"En cours…":`Combo x${mult + 1}`}</button>
      </div>
      <div className="lle-chip__prog"><i style={{ width: `${Math.max(0, remaining / DUR.comboIdle * 100)}%` }} /></div>
    </div>
  );
}

/* ─── Bar ────────────────────────────────────────────────── */
export default function ActiveEventsBar(props: {
  viewerFollows?: boolean | null;
  viewerSubbed?: boolean | null;
  events: ActiveEvent[];
  onExpire: (id: string) => void;
  onJoinRain: (id: string) => void;
  onSpin: (id: string) => void;
  onVote: (id: string, opt: "yes" | "no") => void;
  onChestOpen: (id: string) => void;
  onComboAdvance: (nextMult: number, kind: "follow" | "sub") => void | boolean | Promise<boolean | void>;
  recap: (html: string) => void;
}): React.JSX.Element | null {
  if (props.events.length === 0) return null;

  return (
    <div className="lle-pinbar">
      {props.events.map(ev => {
        switch (ev.type) {
          case "combo":
            return <ComboChip viewerFollows={props.viewerFollows} viewerSubbed={props.viewerSubbed} key={ev.id} id={ev.id} data={ev.data} onExpire={props.onExpire} onComboAdvance={props.onComboAdvance} recap={props.recap} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
