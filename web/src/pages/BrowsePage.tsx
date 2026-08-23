import * as React from "react";
import { ArrowRight, Radio, RefreshCw, Search, SlidersHorizontal, Users, X } from "lucide-react";
import { Link } from "react-router-dom";

import { getStreamers } from "../lib/api";
import { setSeo } from "../lib/seo";
import { svgThumb } from "../lib/thumb";
import "./BrowsePage.css";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

type Filter = "all" | "live" | "offline";
type Sort = "liveFirst" | "alpha";

type UiStreamer = {
  id: string;
  slug: string;
  displayName: string;
  title?: string | null;
  isLive: boolean;
  avatarUrl?: string | null;
  previewUrl?: string | null;
  viewers?: number;
  followsCount?: number;
};

type StreamerApiRecord = {
  id?: string | number;
  slug?: string;
  displayName?: string;
  title?: string | null;
  isLive?: boolean;
  thumbUrl?: string | null;
  thumb_url?: string | null;
  previewUrl?: string | null;
  preview_url?: string | null;
  avatarUrl?: string | null;
  avatar_url?: string | null;
  viewers?: number;
  followsCount?: number;
  follows_count?: number;
  followersCount?: number;
};

function norm(value: unknown) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function absolutize(url: string | null | undefined) {
  if (!url) return null;
  const value = String(url);
  if (/^https?:\/\//i.test(value)) return value;
  return value.startsWith("/") ? `${API_BASE}${value}` : value;
}

function withMinuteBust(url: string, nowMs: number) {
  const t = Math.floor(nowMs / 60_000);
  return url.includes("?") ? `${url}&t=${t}` : `${url}?t=${t}`;
}

function formatCount(value: number | null | undefined) {
  const count = Math.max(0, Number(value) || 0);
  return new Intl.NumberFormat("fr-FR", { notation: count >= 1_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(count);
}

function initialsOf(name: string) {
  const words = String(name || "?").trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? `${words[0][0]}${words[1][0]}` : words[0]?.slice(0, 2) || "?").toUpperCase();
}

function StreamerAvatar({ streamer }: { streamer: UiStreamer }) {
  const source = absolutize(streamer.avatarUrl) || svgThumb(streamer.displayName || "Streamer");
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => setFailed(false), [source]);

  return (
    <span className="bp-avatar" aria-hidden>
      {!failed ? <img src={source} alt="" loading="lazy" onError={() => setFailed(true)} /> : <b>{initialsOf(streamer.displayName)}</b>}
      {streamer.isLive ? <span className="bp-avatar-live" /> : null}
    </span>
  );
}

export default function BrowsePage() {
  const [items, setItems] = React.useState<UiStreamer[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("all");
  const [sort, setSort] = React.useState<Sort>("liveFirst");
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setSeo({
      title: "Browse - Tous les streamers | LunaLive",
      description: "Parcours tous les streamers LunaLive : lives en cours, profils hors ligne et recherche de streamers casino.",
      path: "/browse",
    });
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const nowMs = Date.now();
      const data = await getStreamers();
      setItems((data || []).map((streamer: StreamerApiRecord) => {
        const preview = absolutize(streamer.thumbUrl || streamer.thumb_url || streamer.previewUrl || streamer.preview_url);
        return {
          id: String(streamer.id),
          slug: String(streamer.slug),
          displayName: String(streamer.displayName || streamer.slug || "Streamer"),
          title: streamer.title || null,
          isLive: Boolean(streamer.isLive),
          avatarUrl: streamer.avatarUrl ?? streamer.avatar_url ?? null,
          previewUrl: preview ? withMinuteBust(preview, nowMs) : null,
          viewers: Number(streamer.viewers || 0),
          followsCount: Number(streamer.followsCount ?? streamer.follows_count ?? streamer.followersCount ?? 0),
        };
      }));
    } catch (error: unknown) {
      setErr(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const stats = React.useMemo(() => {
    const live = items.filter((item) => item.isLive).length;
    return { live, offline: items.length - live, total: items.length };
  }, [items]);

  const filtered = React.useMemo(() => {
    const needle = norm(q);
    let result = items;
    if (filter === "live") result = result.filter((item) => item.isLive);
    if (filter === "offline") result = result.filter((item) => !item.isLive);
    if (needle) result = result.filter((item) => [item.displayName, item.slug, item.title].some((value) => norm(value).includes(needle)));
    return [...result].sort((a, b) => {
      if (sort === "liveFirst" && a.isLive !== b.isLive) return a.isLive ? -1 : 1;
      if (sort === "liveFirst" && a.isLive && b.isLive && a.viewers !== b.viewers) return Number(b.viewers) - Number(a.viewers);
      return norm(a.displayName).localeCompare(norm(b.displayName), "fr");
    });
  }, [filter, items, q, sort]);

  return (
    <main className="container bp-page">
      <div className="bp-shell">
        <header className="bp-hero">
          <div className="bp-hero-copy">
            <span className="bp-eyebrow"><Radio size={14} /> Communauté LunaLive</span>
            <h1>Explore les chaînes</h1>
            <p>Trouve un direct, découvre une nouvelle personnalité ou retrouve ton streamer favori.</p>
          </div>
          <div className="bp-stats" aria-label="Statistiques des chaînes">
            <div className="bp-stat is-live"><span className="bp-stat-icon"><Radio size={17} /></span><span><b>{stats.live}</b> en direct</span></div>
            <div className="bp-stat"><span className="bp-stat-icon"><Users size={17} /></span><span><b>{stats.total}</b> chaînes</span></div>
          </div>
        </header>

        <section className="bp-controls" aria-label="Rechercher et filtrer les streamers">
          <div className="bp-search">
            <Search size={18} aria-hidden />
            <input ref={inputRef} value={q} onChange={(event) => setQ(event.target.value)} placeholder="Rechercher une chaîne, un live..." aria-label="Rechercher un streamer" />
            {q ? <button type="button" onClick={() => { setQ(""); inputRef.current?.focus(); }} aria-label="Effacer la recherche"><X size={16} /></button> : null}
          </div>

          <div className="bp-filter-group" role="group" aria-label="État des streamers">
            {(["all", "live", "offline"] as const).map((value) => (
              <button key={value} type="button" className={filter === value ? "is-active" : ""} onClick={() => setFilter(value)}>
                {value === "all" ? "Toutes" : value === "live" ? "En direct" : "Hors ligne"}
                <span>{value === "all" ? stats.total : value === "live" ? stats.live : stats.offline}</span>
              </button>
            ))}
          </div>

          <label className="bp-sort">
            <SlidersHorizontal size={16} aria-hidden />
            <span className="sr-only">Trier les chaînes</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
              <option value="liveFirst">Lives populaires</option>
              <option value="alpha">Ordre alphabétique</option>
            </select>
          </label>

          <button className="bp-refresh" type="button" onClick={() => void load()} disabled={loading} aria-label="Actualiser">
            <RefreshCw size={17} className={loading ? "is-spinning" : ""} />
          </button>
        </section>

        <div className="bp-results-head">
          <div>
            <h2>{filter === "live" ? "En direct maintenant" : filter === "offline" ? "Chaînes hors ligne" : "Toutes les chaînes"}</h2>
            <p>{loading ? "Mise à jour des chaînes..." : `${filtered.length} résultat${filtered.length > 1 ? "s" : ""}${q ? ` pour « ${q} »` : ""}`}</p>
          </div>
        </div>

        {err ? (
          <div className="bp-error" role="alert">
            <div><b>Impossible de charger les chaînes.</b><span>{err}</span></div>
            <button type="button" onClick={() => void load()}>Réessayer</button>
          </div>
        ) : null}

        <section className="bp-grid" aria-label="Liste des streamers" aria-busy={loading}>
          {loading ? Array.from({ length: 8 }, (_, index) => <div key={index} className="bp-skeleton" style={{ animationDelay: `${index * 55}ms` }} />) : null}

          {!loading && !err ? filtered.map((streamer, index) => {
            const title = String(streamer.title || (streamer.isLive ? "Live en cours" : "Retrouve bientôt cette chaîne en direct."));
            return (
              <Link key={streamer.id} to={`/s/${streamer.slug}`} className={`bp-card${streamer.isLive ? " is-live" : ""}`} style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}>
                <div className="bp-card-media">
                  {streamer.isLive && streamer.previewUrl ? (
                    <img src={streamer.previewUrl} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} />
                  ) : (
                    <div className="bp-card-placeholder" aria-hidden><Radio size={25} /></div>
                  )}
                  <div className="bp-card-shade" />
                  <div className="bp-card-status">
                    {streamer.isLive ? <span className="bp-live-label"><i /> En direct</span> : <span className="bp-offline-label">Hors ligne</span>}
                    {streamer.isLive && Number(streamer.viewers) > 0 ? <span className="bp-viewers"><Users size={13} /> {formatCount(streamer.viewers)}</span> : null}
                  </div>
                </div>

                <div className="bp-card-body">
                  <StreamerAvatar streamer={streamer} />
                  <div className="bp-card-copy">
                    <div className="bp-card-name">{streamer.displayName}</div>
                    <div className="bp-card-handle">@{streamer.slug}</div>
                    <div className="bp-card-title">{title}</div>
                  </div>
                  <span className="bp-card-arrow" aria-hidden><ArrowRight size={17} /></span>
                </div>
              </Link>
            );
          }) : null}

          {!loading && !err && filtered.length === 0 ? (
            <div className="bp-empty">
              <span><Search size={22} /></span>
              <h3>Aucune chaîne trouvée</h3>
              <p>Essaie un autre nom ou affiche toutes les chaînes.</p>
              <button type="button" onClick={() => { setQ(""); setFilter("all"); }}>Réinitialiser les filtres</button>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
