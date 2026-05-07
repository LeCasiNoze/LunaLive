// ─────────────────────────────────────────────────────────────────────────────
// M5V1Preview — preview iframe live de la M5 V1 pour le wizard V3.
//
// Charge model5.html une seule fois (cache module-scope), puis applique le
// config V3 via applyM5V1Config sur chaque changement. Rendu via iframe srcDoc
// pour isoler le CSS de la page V1 du reste de l'éditeur.
// ─────────────────────────────────────────────────────────────────────────────

import * as React from "react";
import { applyM5V1Config, type M5V1Variant, type M5V1QuickConfig } from "../lib/m5_v1_apply";

// Cache module-scope : on fetch model5.html une seule fois pour toute la session.
let _templateCache: Promise<string> | null = null;
function loadTemplate(): Promise<string> {
  if (!_templateCache) {
    _templateCache = fetch("/affi_templates/model5.html")
      .then((r) => {
        if (!r.ok) throw new Error(`Template fetch failed: ${r.status}`);
        return r.text();
      })
      .then((html) => {
        // Injecte un <base> pour que les chemins relatifs (CSS, images) résolvent
        // depuis le même origin que la page actuelle.
        return html.replace(
          /<head>/,
          `<head>\n  <base href="${window.location.origin}/">`
        );
      })
      .catch((e) => {
        _templateCache = null; // permettre retry sur erreur
        throw e;
      });
  }
  return _templateCache;
}

export type M5V1PreviewProps = {
  cfg: M5V1QuickConfig;
  variant: M5V1Variant;
  isMobile?: boolean;
};

export function M5V1Preview({ cfg, variant, isMobile = false }: M5V1PreviewProps) {
  const [template, setTemplate] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    loadTemplate()
      .then((t) => { if (alive) setTemplate(t); })
      .catch((e) => { if (alive) setError(String(e?.message || e)); });
    return () => { alive = false; };
  }, []);

  const srcDoc = React.useMemo(() => {
    if (!template) return null;
    return applyM5V1Config(template, cfg, variant);
  }, [template, cfg, variant]);

  if (error) {
    return (
      <div style={{ padding: 20, color: "#ef4d4d", textAlign: "center", fontFamily: "system-ui" }}>
        Impossible de charger le template M5 : {error}
      </div>
    );
  }
  if (!srcDoc) {
    return (
      <div style={{ padding: 20, color: "#8b90a8", textAlign: "center", fontFamily: "system-ui" }}>
        Chargement du template M5…
      </div>
    );
  }

  return (
    <iframe
      title="m5-v1-preview"
      srcDoc={srcDoc}
      style={{
        width: "100%",
        height: "100%",
        border: "none",
        display: "block",
        // forcer un user-agent mobile-like via viewport meta du srcDoc lui-même
      }}
      // Le srcDoc contient un script qui dynamise les data-bind-offer-value.
      // sandbox="" bloquerait JS — on autorise via "allow-scripts" + "allow-same-origin".
      sandbox="allow-scripts allow-same-origin"
      data-mobile={isMobile ? "1" : "0"}
    />
  );
}
