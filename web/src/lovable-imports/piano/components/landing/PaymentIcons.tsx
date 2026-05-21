// Premium inline SVG payment marks. Kept self-contained, no external deps.

const tile = "flex h-7 w-12 items-center justify-center rounded-md bg-white shadow-[0_1px_2px_rgba(0,0,0,0.25),inset_0_0_0_1px_rgba(0,0,0,0.04)]";
const tileDark = "flex h-7 w-12 items-center justify-center rounded-md bg-black shadow-[0_1px_2px_rgba(0,0,0,0.35),inset_0_0_0_1px_rgba(255,255,255,0.06)]";
const tileCrypto = "flex h-7 w-7 items-center justify-center rounded-md bg-white shadow-[0_1px_2px_rgba(0,0,0,0.25),inset_0_0_0_1px_rgba(0,0,0,0.04)]";

export function VisaIcon() {
  return (
    <div className={tile} aria-label="Visa">
      <span
        className="text-[13px] font-black italic leading-none"
        style={{
          fontFamily: '"Helvetica Neue", Arial, sans-serif',
          color: "#1A1F71",
          letterSpacing: "-0.01em",
        }}
      >
        VISA
      </span>
    </div>
  );
}

export function MastercardIcon() {
  return (
    <div className={tile} aria-label="Mastercard">
      <svg viewBox="0 0 38 24" className="h-5 w-auto">
        <circle cx="14" cy="12" r="9" fill="#EB001B" />
        <circle cx="24" cy="12" r="9" fill="#F79E1B" />
        <path d="M19 5.2a9 9 0 010 13.6 9 9 0 010-13.6z" fill="#FF5F00" />
      </svg>
    </div>
  );
}

export function ApplePayIcon() {
  return (
    <div className={tileDark} aria-label="Apple Pay">
      <svg viewBox="0 0 50 20" className="h-4 w-auto" fill="#fff">
        <path d="M9.6 3.4c.5-.7.9-1.6.8-2.5-.8 0-1.7.5-2.3 1.1-.5.6-1 1.5-.8 2.4.9.1 1.8-.4 2.3-1zm.7 1.1c-1.3-.1-2.4.7-3 .7-.6 0-1.6-.7-2.6-.7-1.3 0-2.6.8-3.3 2-1.4 2.4-.4 6 1 8 .7.9 1.5 2 2.5 1.9 1 0 1.4-.7 2.7-.7 1.2 0 1.6.7 2.7.6 1.1 0 1.8-1 2.5-1.9.5-.6.7-1.2 1-1.9-2.3-.9-2.7-4.1-.5-5.3-.8-1.2-2-1.6-3-1.7z"/>
        <path d="M19.5 3.9h3.2c2.5 0 4.2 1.7 4.2 4.2s-1.7 4.2-4.3 4.2h-1.7v4.5h-1.4V3.9zm1.4 1.2v5.9h1.5c1.7 0 2.7-.9 2.7-2.9 0-2-1-3-2.7-3h-1.5zm6.6 8.4c0-1.5 1.2-2.4 3.3-2.6l2.4-.1V10c0-1-.7-1.6-1.8-1.6-1 0-1.7.5-1.8 1.3h-1.3c.1-1.5 1.4-2.6 3.2-2.6 1.9 0 3.1 1 3.1 2.6v5.4h-1.3v-1.3h-.1c-.4.9-1.4 1.4-2.6 1.4-1.7 0-2.9-1-2.9-2.7zm5.7-.7v-.7l-2.1.1c-1.2.1-1.8.6-1.8 1.3 0 .8.7 1.3 1.7 1.3 1.3 0 2.2-.9 2.2-2zm3 5v-1.1c.1 0 .4.1.6.1.7 0 1.1-.3 1.4-1.1l.2-.5L36 7.3h1.5l2.1 6.7h.1l2.1-6.7H43.2l-3.1 8.7c-.7 2-1.5 2.6-3.2 2.6-.1 0-.6 0-.7-.1z"/>
      </svg>
    </div>
  );
}

export function GooglePayIcon() {
  return (
    <div className={tile} aria-label="Google Pay">
      <svg viewBox="0 0 50 20" className="h-4 w-auto">
        <path fill="#5F6368" d="M23.9 9.7v3.6h-1.1V4.5h3c.7 0 1.4.3 1.9.8s.8 1.1.8 1.9c0 .7-.3 1.4-.8 1.9s-1.2.8-1.9.8h-1.9zm0-4.1v3h1.9c.4 0 .8-.2 1.1-.5.3-.3.5-.6.5-1s-.2-.7-.5-1c-.3-.3-.7-.5-1.1-.5h-1.9zm7.2 1.4c.9 0 1.6.2 2.1.7s.8 1.1.8 1.9v3.7h-1v-.8h-.1c-.5.7-1.1 1-1.9 1-.7 0-1.2-.2-1.7-.6-.4-.4-.6-.9-.6-1.5 0-.6.2-1.1.7-1.5.5-.4 1.1-.6 1.9-.6.7 0 1.2.1 1.7.4v-.2c0-.4-.2-.7-.5-1-.3-.3-.7-.4-1.2-.4-.7 0-1.2.3-1.6.9l-.9-.6c.6-.9 1.4-1.4 2.5-1.4zm-1.5 4.3c0 .3.1.5.4.7.2.2.5.3.9.3.5 0 .9-.2 1.3-.6.4-.4.6-.8.6-1.3-.4-.3-.9-.5-1.5-.5-.5 0-.9.1-1.2.4-.3.2-.5.5-.5 1z"/>
        <path fill="#5F6368" d="M40 7.2l-3.8 8.8h-1.1l1.4-3.1-2.5-5.7h1.2l1.8 4.4 1.8-4.4H40z"/>
        <path fill="#4285F4" d="M16.9 9c0-.3 0-.7-.1-1H12.3V9.9h2.6c-.1.6-.5 1.2-1 1.5v1.3h1.7c1-.9 1.3-2.3 1.3-3.7z"/>
        <path fill="#34A853" d="M12.3 13.8c1.4 0 2.6-.5 3.4-1.3l-1.7-1.3c-.5.3-1.1.5-1.8.5-1.4 0-2.5-.9-3-2.2H7.6v1.3c.8 1.7 2.6 2.9 4.7 2.9z"/>
        <path fill="#FBBC04" d="M9.4 9.6c-.1-.3-.2-.7-.2-1.1s.1-.7.2-1.1V6.1H7.6c-.4.8-.7 1.6-.7 2.5s.2 1.7.7 2.5l1.8-1.4z"/>
        <path fill="#EA4335" d="M12.3 5.2c.8 0 1.5.3 2 .8l1.5-1.5c-1-.9-2.2-1.4-3.6-1.4-2.1 0-3.9 1.2-4.7 2.9l1.8 1.3c.5-1.2 1.6-2.1 3-2.1z"/>
      </svg>
    </div>
  );
}

export function BtcIcon() {
  return (
    <div className={tileCrypto} aria-label="Bitcoin">
      <svg viewBox="0 0 32 32" className="h-5 w-5">
        <circle cx="16" cy="16" r="16" fill="#F7931A" />
        <path fill="#fff" d="M21.6 14.3c.3-1.9-1.2-2.9-3.2-3.6l.6-2.6-1.6-.4-.6 2.5-1.3-.3.6-2.5-1.6-.4-.6 2.6-1-.2-2.2-.5-.4 1.7s1.2.3 1.2.3c.6.2.8.6.7 1l-.7 3 .2.1-.2-.1-1 4.1c-.1.2-.3.5-.7.4 0 0-1.2-.3-1.2-.3l-.8 1.8 2.1.5c.4.1.8.2 1.1.3l-.6 2.6 1.6.4.6-2.6 1.3.3-.6 2.6 1.6.4.6-2.6c2.7.5 4.7.3 5.6-2.2.7-2-.1-3.1-1.5-3.8 1-.3 1.7-.9 1.9-2.2zm-3.4 5c-.5 2-3.8.9-4.9.7l.9-3.5c1.1.3 4.4.8 4 2.8zm.5-5c-.4 1.8-3.2.9-4.1.7l.8-3.2c.9.2 3.7.6 3.3 2.5z"/>
      </svg>
    </div>
  );
}

export function EthIcon() {
  return (
    <div className={tileCrypto} aria-label="Ethereum">
      <svg viewBox="0 0 32 32" className="h-5 w-5">
        <circle cx="16" cy="16" r="16" fill="#627EEA" />
        <g fill="#fff">
          <path fillOpacity=".6" d="M16.5 4v8.87l7.5 3.35z"/>
          <path d="M16.5 4 9 16.22l7.5-3.35z"/>
          <path fillOpacity=".6" d="M16.5 21.97V28L24 17.62z"/>
          <path d="M16.5 28v-6.03L9 17.62z"/>
          <path fillOpacity=".2" d="m16.5 20.57 7.5-4.35-7.5-3.35z"/>
          <path fillOpacity=".6" d="m9 16.22 7.5 4.35v-7.7z"/>
        </g>
      </svg>
    </div>
  );
}

export function LtcIcon() {
  return (
    <div className={tileCrypto} aria-label="Litecoin">
      <svg viewBox="0 0 32 32" className="h-5 w-5">
        <circle cx="16" cy="16" r="16" fill="#345D9D" />
        <path fill="#fff" d="m13.5 18.4 1.1-4.3 2.8-1 .7-2.5-2.8 1L17 4h-4.5l-1.9 7.6-2.2.8-.7 2.5 2.2-.8-1.4 5.7c-.2.8.3 1.5 1.1 1.7.1 0 .2 0 .4.1H22l.8-3.1H13.5z"/>
      </svg>
    </div>
  );
}

export function XrpIcon() {
  return (
    <div className={tileCrypto} aria-label="XRP">
      <svg viewBox="0 0 32 32" className="h-5 w-5">
        <circle cx="16" cy="16" r="16" fill="#0A0A0A" />
        <path fill="#fff" d="M22.6 8.6h2.4l-5 4.9c-2.2 2.2-5.8 2.2-8 0l-5-4.9h2.4l3.8 3.7c1.5 1.5 4 1.5 5.6 0l3.8-3.7zM9.4 23.5H7l5-4.9c2.2-2.2 5.8-2.2 8 0l5 4.9h-2.4l-3.8-3.7c-1.5-1.5-4-1.5-5.6 0l-3.8 3.7z"/>
      </svg>
    </div>
  );
}
