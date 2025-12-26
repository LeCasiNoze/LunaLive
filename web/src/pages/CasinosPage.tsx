// web/src/pages/CasinosPage.tsx
import * as React from "react";
import { Link } from "react-router-dom";
import { listCasinos, type CasinoListItem, type CasinoListResp } from "../lib/api_casinos";

function Stars({ value }: { value: number }) {
  const v = Math.max(0, Math.min(5, value));
  const full = Math.round(v);
  return (
    <div className="stars" aria-label={`Note ${v.toFixed(1)} sur 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={`star ${i < full ? "on" : ""}`}>★</span>
      ))}
    </div>
  );
}

function RatingLine({ avg, count }: { avg: number; count: number }) {
  if (!count) return <div className="mutedSmall">Aucun avis pour le moment</div>;
  return (
    <div className="ratingLine">
      <Stars value={avg} />
      <div className="ratingText">
        <b>{avg.toFixed(1)}</b>/5 <span className="mutedSmall">• {count.toLocaleString("fr-FR")} avis</span>
      </div>
    </div>
  );
}

function Badge({ kind, children }: { kind: "featured" | "watch" | "avoid"; children: React.ReactNode }) {
  return <span className={`badgeChip ${kind}`}>{children}</span>;
}

function CasinoCard({ c }: { c: CasinoListItem }) {
  const isFeatured = c.featuredRank != null;
  const isWatch = c.watchLevel === "watch";
  const isAvoid = c.watchLevel === "avoid";

  return (
    <Link to={`/casinos/${encodeURIComponent(c.slug)}`} className="casinoCard">
      <div className="casinoCardTop">
        <div className="casinoLogo">
          {c.logoUrl ? <img src={c.logoUrl} alt="" /> : <div className="casinoLogoPh" />}
        </div>

        <div className="casinoMeta">
          <div className="casinoNameRow">
            <div className="casinoName">{c.name}</div>
            <div className="casinoBadges">
              {isFeatured && <Badge kind="featured">Mis en avant</Badge>}
              {isAvoid && <Badge kind="avoid">À éviter</Badge>}
              {!isAvoid && isWatch && <Badge kind="watch">Sous surveillance</Badge>}
            </div>
          </div>

          <RatingLine avg={c.avgRating} count={c.ratingsCount} />

          {c.bonusHeadline && <div className="casinoBonus">{c.bonusHeadline}</div>}
        </div>
      </div>

      <div className="casinoCardBottom">
        <span className="seeMore">Voir avis →</span>
      </div>
    </Link>
  );
}

function PodiumCard({ rank, c }: { rank: 1 | 2 | 3; c: CasinoListItem }) {
  return (
    <Link to={`/casinos/${encodeURIComponent(c.slug)}`} className={`podiumCard r${rank}`}>
      <div className="podiumRank">#{rank}</div>
      <div className="podiumLogo">
        {c.logoUrl ? <img src={c.logoUrl} alt="" /> : <div className="casinoLogoPh" />}
      </div>
      <div className="podiumName">{c.name}</div>
      <div className="podiumRating">
        <RatingLine avg={c.avgRating} count={c.ratingsCount} />
      </div>
      {c.bonusHeadline && <div className="podiumBonus">{c.bonusHeadline}</div>}
    </Link>
  );
}

export default function CasinosPage() {
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [data, setData] = React.useState<CasinoListResp | null>(null);

  const [q, setQ] = React.useState("");
  const [sort, setSort] = React.useState<"top" | "newest">("top");

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await listCasinos({ q: q.trim() || null, sort });
      setData(r);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="container">
      <div className="pageTitle">
        <h1>Avis Casinos</h1>
        <p className="muted">
          Notes de la communauté LunaLive + avis LunaLive • 18+ • Jouez responsable • Certains liens sont affiliés
        </p>
      </div>

      <div className="casinoToolbar panel">
        <div className="toolbarRow">
          <div className="searchWrap">
            <span className="searchIcon">🔎</span>
            <input
              className="searchInput"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher un casino…"
              onKeyDown={(e) => {
                if (e.key === "Enter") load();
              }}
            />
          </div>

          <select className="select" value={sort} onChange={(e) => setSort(e.target.value as any)}>
            <option value="top">Top du moment</option>
            <option value="newest">Nouveaux</option>
          </select>

          <button className="btnPrimary" onClick={load} disabled={loading}>
            Rechercher
          </button>
        </div>
      </div>

      {loading && <div className="muted">Chargement…</div>}
      {err && <div className="alert">{err}</div>}

      {!loading && data && (
        <>
          {/* PODIUM */}
          {data.podium?.length > 0 && (
            <section className="casinoSection">
              <div className="sectionHead">
                <h2>Top LunaLive</h2>
                <div className="mutedSmall">Podium (placements manuels).</div>
              </div>

              <div className="podiumGrid">
                {data.podium.slice(0, 3).map((c, i) => (
                  <PodiumCard key={c.id} rank={((i + 1) as 1 | 2 | 3)} c={c} />
                ))}
              </div>
            </section>
          )}

          {/* WATCHLIST */}
          {data.watchlist?.length > 0 && (
            <section className="casinoSection">
              <div className="sectionHead">
                <h2>À éviter / Sous surveillance</h2>
                <div className="mutedSmall">Liste rouge (visible publiquement).</div>
              </div>
              <div className="watchGrid">
                {data.watchlist.map((c) => (
                  <div key={c.id} className={`watchCard ${c.watchLevel}`}>
                    <div className="watchTitle">
                      <b>{c.name}</b>{" "}
                      <span className={`watchPill ${c.watchLevel}`}>{c.watchLevel === "avoid" ? "À éviter" : "Surveillance"}</span>
                    </div>
                    <div className="mutedSmall">{c.watchReason || "Raison non précisée."}</div>
                    <div style={{ marginTop: 10 }}>
                      <Link className="btnSecondary" to={`/casinos/${encodeURIComponent(c.slug)}`}>
                        Voir avis
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* LISTE */}
          <section className="casinoSection">
            <div className="sectionHead">
              <h2>Casinos</h2>
              <div className="mutedSmall">
                Tri : {sort === "top" ? "note + volume d’avis" : "date d’ajout"} • {data.casinos.length} résultat(s)
              </div>
            </div>

            {data.casinos.length === 0 ? (
              <div className="panel">
                <div className="mutedSmall">Aucun casino ne correspond à ta recherche.</div>
              </div>
            ) : (
              <div className="casinoGrid">
                {data.casinos.map((c) => (
                  <CasinoCard key={c.id} c={c} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
