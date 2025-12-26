// web/src/pages/CasinosPage.tsx
import * as React from "react";
import { Link } from "react-router-dom";
import { getCasinos, type CasinoListItem } from "../lib/api_casinos";

function Stars({ value }: { value: number }) {
  const v = Math.max(0, Math.min(5, value));
  const full = Math.round(v * 10) / 10;
  return (
    <span className="stars" title={`${full.toFixed(1)}/5`}>
      {"★★★★★".split("").map((s, i) => (
        <span key={i} className={i < Math.round(full) ? "star on" : "star"}>
          {s}
        </span>
      ))}
    </span>
  );
}

function CasinoCard({ c }: { c: CasinoListItem }) {
  return (
    <Link to={`/casinos/${c.slug}`} className="casinoCard">
      <div className="casinoCardTop">
        <div className="casinoLogo">{c.logoUrl ? <img src={c.logoUrl} alt="" /> : <div className="casinoLogoPh" />}</div>
        <div className="casinoCardMeta">
          <div className="casinoNameRow">
            <div className="casinoName">{c.name}</div>
            {c.featuredRank != null && <span className="badge">Mis en avant</span>}
            {c.watchLevel === "avoid" && <span className="badge danger">À éviter</span>}
            {c.watchLevel === "watch" && <span className="badge warn">Surveillance</span>}
          </div>
          <div className="casinoRatingRow">
            <Stars value={c.avgRating} />
            <span className="casinoRatingTxt">
              {c.avgRating.toFixed(1)}/5 • {c.ratingsCount.toLocaleString("fr-FR")} avis
            </span>
          </div>
          {c.bonusHeadline && <div className="casinoBonus">{c.bonusHeadline}</div>}
        </div>
      </div>
      <div className="casinoCardCta">Voir avis →</div>
    </Link>
  );
}

export default function CasinosPage() {
  const [search, setSearch] = React.useState("");
  const [sort, setSort] = React.useState<"top" | "rating" | "reviews" | "new" | "featured">("top");
  const [loading, setLoading] = React.useState(true);
  const [data, setData] = React.useState<null | { podium: CasinoListItem[]; casinos: CasinoListItem[]; watchlist: CasinoListItem[] }>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await getCasinos({ search: search.trim() || undefined, sort });
      setData({ podium: r.podium, casinos: r.casinos, watchlist: r.watchlist });
    } catch (e: any) {
      setError(e?.message || "error");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort]);

  return (
    <div className="container">
      <div className="pageTitle">
        <h1>Avis Casinos</h1>
        <p className="muted">
          Notes de la communauté LunaLive + avis LunaLive. <span className="mutedSmall">+18 • Jouez responsable • Certains liens sont affiliés</span>
        </p>
      </div>

      <div className="casinoToolbar">
        <input
          className="input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un casino…"
        />
        <select className="select" value={sort} onChange={(e) => setSort(e.target.value as any)}>
          <option value="top">Top du moment</option>
          <option value="rating">Meilleure note</option>
          <option value="reviews">Plus d’avis</option>
          <option value="new">Nouveaux</option>
          <option value="featured">Mise en avant</option>
        </select>
        <button className="btnSecondary" onClick={load} disabled={loading}>
          Rechercher
        </button>
      </div>

      {error && <div className="alert">{error}</div>}

      {loading && <div className="muted">Chargement…</div>}

      {!loading && data && (
        <>
          {data.podium.length > 0 && (
            <section className="casinoSection">
              <div className="sectionHead">
                <h2>Top du moment</h2>
                <div className="mutedSmall">Classement basé sur la note et le nombre d’avis.</div>
              </div>
              <div className="podiumGrid">
                {data.podium.map((c, idx) => (
                  <Link key={c.id} to={`/casinos/${c.slug}`} className={`podiumCard p${idx + 1}`}>
                    <div className="podiumRank">#{idx + 1}</div>
                    <div className="podiumMain">
                      <div className="podiumName">{c.name}</div>
                      <div className="podiumSub">
                        <span>{c.avgRating.toFixed(1)}/5</span> • <span>{c.ratingsCount.toLocaleString("fr-FR")} avis</span>
                      </div>
                      {c.bonusHeadline && <div className="podiumBonus">{c.bonusHeadline}</div>}
                    </div>
                    <div className="podiumCta">Voir avis →</div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className="casinoSection">
            <div className="sectionHead">
              <h2>Casinos</h2>
            </div>
            <div className="casinoGrid">
              {data.casinos.map((c) => (
                <CasinoCard key={c.id} c={c} />
              ))}
            </div>
          </section>

          {data.watchlist.length > 0 && (
            <section className="casinoSection">
              <div className="sectionHead">
                <h2>Sous surveillance</h2>
                <div className="mutedSmall">Signalements / pratiques discutables — à vérifier avant de jouer.</div>
              </div>
              <div className="watchGrid">
                {data.watchlist.map((c) => (
                  <Link key={c.id} to={`/casinos/${c.slug}`} className="watchItem">
                    <div className="watchNameRow">
                      <div className="watchName">{c.name}</div>
                      <span className={`badge ${c.watchLevel === "avoid" ? "danger" : "warn"}`}>
                        {c.watchLevel === "avoid" ? "À éviter" : "Surveillance"}
                      </span>
                    </div>
                    <div className="mutedSmall">{c.watchReason || "Raison non précisée."}</div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
