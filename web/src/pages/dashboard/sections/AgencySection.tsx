import * as React from "react";
import type { ApiMyStreamer } from "../../../lib/api";
import { getMyAgencyStats } from "../../../lib/api_agency";

function eur(value: number | null | undefined) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(value || 0));
}

function num(value: number | null | undefined) {
  if (value == null) return "-";
  return Number(value).toLocaleString("fr-FR");
}

export function AgencySection({ streamer }: { streamer: ApiMyStreamer }) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [agency, setAgency] = React.useState<Awaited<ReturnType<typeof getMyAgencyStats>>["agency"] | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getMyAgencyStats();
      setAgency(response.agency);
    } catch (err: any) {
      setError(String(err?.message || "Impossible de charger les stats agence."));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="panel">
      <div className="panelTitle" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <span>Agence</span>
        <span className="mutedSmall">@{streamer.slug}</span>
      </div>

      {error ? <div className="hint" style={{ marginTop: 10 }}>! {error}</div> : null}

      {!agency && !loading ? (
        <div className="muted" style={{ marginTop: 12 }}>
          Aucune statistique agence n est reliee a ce compte pour le moment.
        </div>
      ) : null}

      {agency ? (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 10,
              marginTop: 14,
            }}
          >
            <div className="panel">
              <div className="mutedSmall">Signups</div>
              <div style={{ fontSize: 20, fontWeight: 800, marginTop: 6 }}>{num(agency.summary.signups)}</div>
            </div>
            <div className="panel">
              <div className="mutedSmall">FTD</div>
              <div style={{ fontSize: 20, fontWeight: 800, marginTop: 6 }}>{num(agency.summary.ftd)}</div>
            </div>
            <div className="panel">
              <div className="mutedSmall">Gain total</div>
              <div style={{ fontSize: 20, fontWeight: 800, marginTop: 6 }}>{eur(agency.summary.total)}</div>
            </div>
          </div>

          <div className="muted" style={{ marginTop: 12 }}>
            {agency.assignments.length} deal(s) visible(s) sur le portail agence dedie.
          </div>
        </>
      ) : null}

      <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
        <a className="btnPrimary" href="/agency">
          Ouvrir le portail agence
        </a>
      </div>
    </div>
  );
}
