import * as React from "react";

function money(n: number) {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}

export type PartnerCheckoutUrls = {
  listed: { monthly: string; quarterly: string; annual: string };
  premium: { monthly: string; quarterly: string; annual: string };
};

const DEFAULT_URLS: PartnerCheckoutUrls = {
  listed: {
    monthly: "/partner/checkout?plan=listed&term=monthly",
    quarterly: "/partner/checkout?plan=listed&term=quarterly",
    annual: "/partner/checkout?plan=listed&term=annual",
  },
  premium: {
    monthly: "/partner/checkout?plan=premium&term=monthly",
    quarterly: "/partner/checkout?plan=premium&term=quarterly",
    annual: "/partner/checkout?plan=premium&term=annual",
  },
};

export function PartnerPlansModal({
  open,
  onClose,
  checkoutUrls = DEFAULT_URLS,
  listedMonthly = 500,
  premiumMonthly = 1500,
}: {
  open: boolean;
  onClose: () => void;
  checkoutUrls?: PartnerCheckoutUrls;
  listedMonthly?: number;
  premiumMonthly?: number;
}) {
  const panelRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => panelRef.current?.focus(), 0);
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const listed = listedMonthly;
  const premium = premiumMonthly;

  const listedQuarter = listed * 3;
  const premiumQuarter = premium * 3;

  const listedYear = Math.round(listed * 12 * 0.8);
  const premiumYear = Math.round(premium * 12 * 0.8);

  function go(url: string) {
    // redirection simple (tu pourras remplacer par navigate() si tu préfères)
    window.location.href = url;
  }

  return (
    <div
      className="ppOverlay"
      role="dialog"
      aria-modal="true"
      aria-label="Partner plans"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <style>{`
        .ppOverlay{
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: rgba(0,0,0,0.72);
          backdrop-filter: blur(14px);
          display: grid;
          place-items: center;
          padding: 14px;
        }

        .ppModal{
          width: min(1080px, 100%);
          max-height: min(88vh, 920px);
          overflow: auto;
          border-radius: 24px;
          outline: none;
        }

        .ppChrome{
          position: relative;
          border-radius: 24px;
          border: 1px solid rgba(255,255,255,0.14);
          background:
            radial-gradient(1100px 380px at 18% 0%, rgba(255,90,180,0.16), rgba(0,0,0,0) 60%),
            radial-gradient(1100px 380px at 82% 12%, rgba(80,160,255,0.16), rgba(0,0,0,0) 62%),
            radial-gradient(1100px 420px at 50% 110%, rgba(140,90,255,0.16), rgba(0,0,0,0) 64%),
            linear-gradient(180deg, rgba(255,255,255,0.05), rgba(0,0,0,0.24));
          box-shadow: 0 30px 120px rgba(0,0,0,0.55);
          padding: 16px;
        }

        .ppClose{
          position: sticky;
          top: 12px;
          float: right;
          width: 40px;
          height: 40px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.16);
          background: rgba(10,10,14,0.72);
          color: inherit;
          cursor: pointer;
          font-weight: 1300;
          display: grid;
          place-items: center;
          margin-left: auto;
          z-index: 5;
        }

        .ppTop{
          display:flex;
          justify-content: space-between;
          gap: 14px;
          flex-wrap: wrap;
          align-items: flex-start;
          padding: 2px 2px 12px;
          clear: both;
        }

        .ppKicker{
          font-size: 12px;
          font-weight: 1200;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          opacity: 0.75;
        }
        .ppTitle{
          font-size: 26px;
          font-weight: 1500;
          letter-spacing: -0.6px;
          background: linear-gradient(90deg, rgba(255,210,110,1), rgba(180,140,255,1), rgba(80,160,255,1));
          -webkit-background-clip:text;
          background-clip:text;
          color: transparent;
          filter: drop-shadow(0 10px 24px rgba(0,0,0,0.35));
          line-height: 1.05;
          margin-top: 4px;
        }
        .ppSub{
          opacity: 0.90;
          font-weight: 950;
          line-height: 1.35;
          max-width: 720px;
        }

        .ppRight{
          display:grid;
          gap: 8px;
          align-items: start;
          justify-items: end;
        }

        .ppHybrid{
          display:grid;
          gap: 2px;
          padding: 10px 12px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(10,10,14,0.70);
          min-width: 260px;
        }
        .ppHybridLabel{ font-size: 12px; font-weight: 1100; opacity: 0.75; }
        .ppHybridValue{ font-size: 14px; font-weight: 1400; letter-spacing: -0.2px; }

        .ppNote{
          font-size: 12px;
          opacity: 0.85;
          font-weight: 950;
          text-align: right;
          max-width: 320px;
        }

        .ppGrid{
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
          align-items: start;
        }

        .plan{
          border-radius: 22px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(10,10,14,0.58);
          overflow: hidden;
        }
        .plan--listed{
          background:
            radial-gradient(900px 280px at 20% 0%, rgba(140,90,255,0.12), rgba(0,0,0,0) 60%),
            rgba(10,10,14,0.62);
        }
        .plan--premium{
          border: 1px solid rgba(255,210,110,0.22);
          background:
            radial-gradient(900px 280px at 20% 0%, rgba(255,210,110,0.14), rgba(0,0,0,0) 60%),
            rgba(10,10,14,0.62);
        }

        .planHead{
          padding: 14px;
          display:flex;
          align-items:flex-start;
          justify-content: space-between;
          gap: 10px;
        }
        .planName{
          font-size: 16px;
          font-weight: 1500;
          letter-spacing: -0.35px;
        }
        .planTag{
          display:inline-flex;
          align-items:center;
          gap: 8px;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(10,10,14,0.72);
          font-size: 12px;
          font-weight: 1100;
          opacity: 0.92;
          width: fit-content;
          margin-top: 6px;
        }
        .planTag--gold{
          border-color: rgba(255,210,110,0.24);
          background: rgba(255,210,110,0.10);
        }

        .planPrice{
          text-align: right;
          display:grid;
          gap: 0px;
        }
        .planPriceValue{
          font-size: 22px;
          font-weight: 1600;
          letter-spacing: -0.6px;
          line-height: 1;
        }
        .planPriceUnit{
          font-size: 12px;
          opacity: 0.8;
          font-weight: 1000;
          margin-top: 2px;
        }

        .planBody{
          padding: 0 14px 14px;
          display:grid;
          gap: 12px;
        }

        /* ✅ LISTES PLUS LISIBLES (moins “transparent”, plus contrasté) */
        .bullets{
          list-style: none;
          margin: 0;
          padding: 0;
          display:grid;
          gap: 9px;
        }
        .bullets li{
          display:flex;
          gap: 10px;
          align-items:flex-start;
          padding: 11px 12px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(12,12,16,0.92);
          font-weight: 1050;
          line-height: 1.28;
        }
        .bIcon{
          width: 22px;
          height: 22px;
          border-radius: 8px;
          display:grid;
          place-items:center;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.06);
          font-size: 12px;
          font-weight: 1400;
          flex: 0 0 auto;
          margin-top: 1px;
        }

        .divider{
          height: 1px;
          background: rgba(255,255,255,0.10);
          border-radius: 999px;
        }

        .optionsTitle{
          font-size: 12px;
          font-weight: 1300;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          opacity: 0.72;
        }

        /* ✅ CHOOSE BILLING : cartes opaques, pas de “milieu coloré” */
        .options{
          display:grid;
          gap: 10px;
        }
        .optBtn{
          width: 100%;
          text-align: left;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(12,12,16,0.94);
          color: inherit;
          cursor: pointer;
          padding: 12px 12px;
          display:grid;
          gap: 6px;
          transition: transform 140ms ease, border-color 140ms ease, background 140ms ease;
        }
        .optBtn:hover{
          transform: translateY(-1px);
          border-color: rgba(255,255,255,0.22);
          background: rgba(14,14,18,0.96);
        }
        .optTop{
          display:flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 10px;
          font-weight: 1300;
          letter-spacing: -0.2px;
        }
        .optPrice{
          font-weight: 1600;
        }
        .optSub{
          font-size: 12px;
          opacity: 0.82;
          font-weight: 950;
        }

        .badgeRow{
          display:flex;
          gap: 8px;
          align-items:center;
        }
        .badge{
          display:inline-flex;
          align-items:center;
          padding: 4px 8px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.06);
          font-size: 11px;
          font-weight: 1200;
          opacity: 0.9;
        }
        .badge--best{
          border-color: rgba(255,210,110,0.26);
          background: rgba(255,210,110,0.10);
        }

        .ppFooter{
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid rgba(255,255,255,0.10);
          display:flex;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          align-items: center;
        }
        .ppFootLeft{
          display:grid;
          gap: 6px;
        }
        .ppFootLine{
          font-size: 12px;
          opacity: 0.85;
          font-weight: 950;
          display:flex;
          align-items:center;
          gap: 8px;
        }
        .dot{ width: 8px; height: 8px; border-radius: 999px; display:inline-block; }
        .dot--pink{ background: rgba(255,90,180,0.85); }
        .dot--blue{ background: rgba(80,160,255,0.85); }
      `}</style>

      <div
        className="ppModal"
        ref={panelRef}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="ppChrome">
          <button className="ppClose" onClick={onClose} aria-label="Close">
            ✕
          </button>

          <div className="ppTop">
            <div style={{ display: "grid", gap: 6, minWidth: 260 }}>
              <div className="ppKicker">CHECKTASLOT</div>
              <div className="ppTitle">Partner Plans</div>
              <div className="ppSub">Visibility + creators highlight + hybrid performance.</div>
            </div>

            <div className="ppRight">
              <div className="ppHybrid">
                <div className="ppHybridLabel">Hybrid</div>
                <div className="ppHybridValue">€150 CPA + 30% RS</div>
              </div>
              <div className="ppNote">Setup fee is waived with a 3-month upfront commitment.</div>
            </div>
          </div>

          <div className="ppGrid">
            {/* LISTED */}
            <div className="plan plan--listed">
              <div className="planHead">
                <div style={{ minWidth: 0 }}>
                  <div className="planName">Listed</div>
                  <div className="planTag">Fixed + visibility</div>
                </div>
                <div className="planPrice">
                  <div>
                    <span className="planPriceValue">€{money(listed)}</span>
                  </div>
                  <div className="planPriceUnit">/month</div>
                </div>
              </div>

              <div className="planBody">
                <ul className="bullets">
                  <li>
                    <span className="bIcon">✓</span>
                    <span>Casino listing on CHECKTASLOT (list + dedicated page)</span>
                  </li>
                  <li>
                    <span className="bIcon">✓</span>
                    <span>“Affiliated streamers” block (your creators highlighted)</span>
                  </li>
                  <li>
                    <span className="bIcon">✓</span>
                    <span>One main tracked CTA (performance tracking)</span>
                  </li>
                  <li>
                    <span className="bIcon">✓</span>
                    <span>Basic page setup + content formatting</span>
                  </li>
                  <li>
                    <span className="bIcon">✓</span>
                    <span>Promo visuals created by us</span>
                  </li>
                </ul>

                <div className="divider" />
                <div className="optionsTitle">CHOOSE BILLING</div>

                <div className="options">
                  <button className="optBtn" onClick={() => go(checkoutUrls.listed.monthly)}>
                    <div className="optTop">
                      <span>Monthly</span>
                      <span className="optPrice">€{money(listed)}</span>
                    </div>
                    <div className="optSub">Setup fee applies on monthly start</div>
                  </button>

                  <button className="optBtn" onClick={() => go(checkoutUrls.listed.quarterly)}>
                    <div className="optTop">
                      <span className="badgeRow">
                        Quarterly <span className="badge badge--best">Best value</span>
                      </span>
                      <span className="optPrice">€{money(listedQuarter)}</span>
                    </div>
                    <div className="optSub">3 months upfront • setup fee waived</div>
                  </button>

                  <button className="optBtn" onClick={() => go(checkoutUrls.listed.annual)}>
                    <div className="optTop">
                      <span>Annual</span>
                      <span className="optPrice">€{money(listedYear)}</span>
                    </div>
                    <div className="optSub">12 months upfront • -20%</div>
                  </button>
                </div>
              </div>
            </div>

            {/* PREMIUM */}
            <div className="plan plan--premium">
              <div className="planHead">
                <div style={{ minWidth: 0 }}>
                  <div className="planName">Premium</div>
                  <div className="planTag planTag--gold">Visibility + manager tools</div>
                </div>
                <div className="planPrice">
                  <div>
                    <span className="planPriceValue">€{money(premium)}</span>
                  </div>
                  <div className="planPriceUnit">/month</div>
                </div>
              </div>

              <div className="planBody">
                <ul className="bullets">
                  <li>
                    <span className="bIcon">★</span>
                    <span>Everything in Listed</span>
                  </li>
                  <li>
                    <span className="bIcon">★</span>
                    <span>Manager Dashboard access (stats + talent discovery)</span>
                  </li>
                  <li>
                    <span className="bIcon">★</span>
                    <span>“Discover” carousel rotation: featured 1 week per month</span>
                  </li>
                  <li>
                    <span className="bIcon">★</span>
                    <span>Partner status (subtle branding)</span>
                  </li>
                  <li>
                    <span className="bIcon">★</span>
                    <span>
                      Optional: access to a “deal board” where new streamers can apply to your offers and get connected with your team.
                    </span>
                  </li>
                </ul>

                <div className="divider" />
                <div className="optionsTitle">CHOOSE BILLING</div>

                <div className="options">
                  <button className="optBtn" onClick={() => go(checkoutUrls.premium.monthly)}>
                    <div className="optTop">
                      <span>Monthly</span>
                      <span className="optPrice">€{money(premium)}</span>
                    </div>
                    <div className="optSub">Setup fee applies on monthly start</div>
                  </button>

                  <button className="optBtn" onClick={() => go(checkoutUrls.premium.quarterly)}>
                    <div className="optTop">
                      <span className="badgeRow">
                        Quarterly <span className="badge badge--best">Best value</span>
                      </span>
                      <span className="optPrice">€{money(premiumQuarter)}</span>
                    </div>
                    <div className="optSub">3 months upfront • setup fee waived</div>
                  </button>

                  <button className="optBtn" onClick={() => go(checkoutUrls.premium.annual)}>
                    <div className="optTop">
                      <span>Annual</span>
                      <span className="optPrice">€{money(premiumYear)}</span>
                    </div>
                    <div className="optSub">12 months upfront • -20%</div>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="ppFooter">
            <div className="ppFootLeft">
              <div className="ppFootLine">
                <span className="dot dot--pink" /> Transparent display • no spammy “pay-to-win” layout
              </div>
              <div className="ppFootLine">
                <span className="dot dot--blue" /> 18+ • Play responsibly
              </div>
            </div>
            <button className="btnGhost" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
