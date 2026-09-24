import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronRight,
  History,
  Layers3,
  Plus,
  Search,
  ShieldCheck,
  Target,
  Trash2,
  Wallet,
  WifiOff,
  X,
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { huntSuggest } from "../lib/hunt_api";
import type {
  HuntItem,
  HuntState,
  SavedHunt,
  SuggestItem,
} from "../lib/hunt_types";
import { huntStats, parseHuntAmount } from "../lib/hunt_workspace";
import { useHuntWorkspace } from "./hunt/useHuntWorkspace";
import "./hunt/hunt-workspace.css";

const money = (value: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
    value,
  );
const multi = (value: number | null) =>
  value == null
    ? "—"
    : `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(value)}×`;

function Thumb({
  item,
  large = false,
}: {
  item: Pick<HuntItem, "image_url" | "name">;
  large?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [item.image_url]);
  return (
    <div className={`hw-thumb ${large ? "hw-thumb-large" : ""}`}>
      {item.image_url && !broken ? (
        <img
          src={item.image_url}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
        />
      ) : (
        <Layers3 aria-hidden="true" />
      )}
    </div>
  );
}

function MoneyField({
  value,
  label,
  disabled,
  positive,
  onSave,
  onDirty,
  autoSave = false,
  action = "Enregistrer",
}: {
  value: number | null | undefined;
  label: string;
  disabled: boolean;
  positive?: boolean;
  autoSave?: boolean;
  action?: string;
  onSave: (value: number, expected: number | null) => Promise<boolean>;
  onDirty: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const base = useRef<number | null>(null);
  const saving = useRef(false);
  const dirty = draft !== null;
  const remoteChanged = dirty && (value ?? null) !== base.current;
  // A refresh never replaces a draft. The server checks its original value.
  async function save() {
    if (draft === null || saving.current || disabled) return;
    const parsed = parseHuntAmount(draft);
    if (parsed == null || (positive && parsed <= 0)) {
      setInvalid(true);
      return;
    }
    if (parsed === value && !remoteChanged) {
      setDraft(null);
      onDirty(false);
      return;
    }
    saving.current = true;
    try {
      if (await onSave(parsed, base.current)) {
        setDraft(null);
        onDirty(false);
        setInvalid(false);
      }
    } finally {
      saving.current = false;
    }
  }
  return (
    <form
      className="hw-money"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label>
        <span>{label}</span>
        <div className="hw-amount-input">
          <input
            aria-label={label}
            inputMode="decimal"
            autoComplete="off"
            value={draft ?? (value == null ? "" : String(value))}
            placeholder="0,00"
            disabled={disabled}
            aria-invalid={invalid || remoteChanged}
            onChange={(e) => {
              if (!dirty) base.current = value ?? null;
              setDraft(e.target.value);
              setInvalid(false);
              onDirty(true);
            }}
            onBlur={() => {
              if (autoSave) void save();
            }}
          />
          <span aria-hidden="true">€</span>
        </div>
      </label>
      {!autoSave && (
        <button
          className="hw-btn hw-primary"
          type="submit"
          disabled={disabled || !dirty}
        >
          <Check size={16} />
          {action}
        </button>
      )}
      {dirty && (
        <button
          className="hw-btn hw-icon"
          type="button"
          aria-label={`Annuler la saisie : ${label}`}
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setDraft(null);
            setInvalid(false);
            onDirty(false);
          }}
        >
          <X size={15} />
        </button>
      )}
      {(invalid || remoteChanged) && (
        <small className="hw-field-error">
          {remoteChanged
            ? `Modifié ailleurs : ${money(Number(value) || 0)}. Annule ta saisie pour reprendre cette valeur.`
            : "Saisis un montant valide, avec deux décimales maximum."}
        </small>
      )}
    </form>
  );
}

function HuntDialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return createPortal(
    <dialog
      className="hw-dialog"
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-label={title}
    >
      <header>
        <h2>{title}</h2>
        <button
          className="hw-btn hw-icon"
          onClick={onClose}
          aria-label="Fermer"
        >
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>,
    document.body,
  );
}

function Results({ state }: { state: HuntState }) {
  return (
    <div className="hw-results">
      {state.items.map((item, index) => (
        <div className="hw-result" key={item.id}>
          <span className="hw-order">{String(index + 1).padStart(2, "0")}</span>
          <Thumb item={item} />
          <div className="hw-slot-name">
            <strong>{item.name}</strong>
            <small>{item.provider || "Machine"}</small>
          </div>
          <span>
            {money(Number(item.bet) || 0)}
            <small>Mise</small>
          </span>
          <strong>
            {item.pay == null ? "À ouvrir" : money(Number(item.pay))}
            <small>
              {item.pay == null
                ? ""
                : multi(
                    Number(item.bet) > 0
                      ? Number(item.pay) / Number(item.bet)
                      : null,
                  )}
            </small>
          </strong>
        </div>
      ))}
    </div>
  );
}

export default function HuntPage() {
  const { user, token } = useAuth();
  const account = user as any;
  const slug =
    String(
      account?.streamer?.slug ||
        account?.streamerSlug ||
        account?.streamer_slug ||
        account?.slug ||
        "",
    ) || null;
  // Preserve the existing backend selection: no migration of the active hunt.
  const workspace = useHuntWorkspace(user ? token : null, slug);
  const { state: serverState, loading, busy, online, error } = workspace;
  const [tab, setTab] = useState<"session" | "history">("session");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SuggestItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [draftSnapshot, setDraftSnapshot] = useState<HuntState | null>(null);
  const [confirmation, setConfirmation] = useState<
    "new" | "close" | HuntItem | null
  >(null);
  const [archive, setArchive] = useState<SavedHunt | null>(null);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const hasDraft = Object.values(dirty).some(Boolean);
  const changedDuringDraft =
    hasDraft &&
    draftSnapshot !== null &&
    (serverState.phase !== draftSnapshot.phase ||
      Object.entries(dirty).some(
        ([key, active]) =>
          active &&
          key !== "start" &&
          !serverState.items.some((item) => item.id === key.slice(4)),
      ));
  const state = changedDuringDraft ? draftSnapshot! : serverState;
  const stats = huntStats(state);
  // Keep an edited form mounted if another screen changes mode or removes it.
  const act = (action: Parameters<typeof workspace.act>[0]) =>
    changedDuringDraft ? Promise.resolve(false) : workspace.act(action);
  const locked = busy || loading || !online;
  const phase = state.phase;
  const current =
    state.items.find((it) => it.id === selectedId) ??
    state.items.find((it) => it.pay == null) ??
    state.items[0];
  const currentIndex = state.items.findIndex((it) => it.id === current?.id);
  const canOpen =
    stats.start > 0 &&
    state.items.length > 0 &&
    state.items.every((it) => Number(it.bet) > 0);
  const missingBets = state.items.filter((it) => !(Number(it.bet) > 0)).length;
  const setFieldDirty = (id: string) => (value: boolean) => {
    if (value && !hasDraft) setDraftSnapshot(state);
    if (value && id.startsWith("pay-")) setSelectedId(id.slice(4));
    setDirty((previous) => ({ ...previous, [id]: value }));
  };

  useEffect(() => {
    setDirty({});
    setSelectedId(null);
    setQuery("");
    setArchive(null);
    setConfirmation(null);
    setDraftSnapshot(null);
  }, [token, slug]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    let active = true;
    setSearchError(false);
    if (query.trim().length < 2) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const result = await huntSuggest(query.trim(), 8);
        if (active) setSuggestions(result.items || []);
      } catch {
        if (active) {
          setSearchError(true);
          setSuggestions([]);
        }
      } finally {
        if (active) setSearching(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);
  useEffect(() => {
    if (!hasDraft) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasDraft]);

  async function add(name: string) {
    if (locked || !name.trim() || stats.start <= 0) return;
    if (await act((api) => api.add(name.trim()))) {
      setQuery("");
      setNotice("Machine ajoutée au hunt.");
    }
  }
  async function confirmAction() {
    const action = confirmation;
    if (!action) return;
    const ok = await act(async (api) => {
      if (action === "new") {
        if (state.items.length) await api.save("Avant nouveau hunt");
        await api.reset();
      } else if (action === "close") await api.close();
      else await api.remove(action.id);
    });
    if (ok) {
      setConfirmation(null);
      setDirty({});
      setSelectedId(null);
      setNotice(
        action === "new"
          ? "Nouveau hunt prêt. Le précédent est dans l'historique."
          : "Modification enregistrée.",
      );
    }
  }
  async function showHistory() {
    if (hasDraft) return;
    setTab("history");
    setArchiveLoading(true);
    try {
      await workspace.loadArchives();
    } finally {
      setArchiveLoading(false);
    }
  }
  if (!user)
    return (
      <main className="hw-page">
        <div className="hw-empty hw-panel">
          <Target size={36} />
          <h1>Ton espace Hunt</h1>
          <p>Connecte-toi pour retrouver ton hunt et le gérer à plusieurs.</p>
        </div>
      </main>
    );

  return (
    <main className="hw-page">
      <header className="hw-header">
        <div className="hw-heading">
          <span className="hw-emblem">
            <Target size={25} />
          </span>
          <div>
            <span className="hw-eyebrow">BONUS HUNT</span>
            <h1>Ton espace Hunt</h1>
          </div>
        </div>
        <div className="hw-header-actions">
          <span
            className={`hw-sync ${online ? "" : "is-offline"}`}
            role="status"
            title={
              workspace.savedAt
                ? `Dernière lecture à ${workspace.savedAt.toLocaleTimeString("fr-FR")}. Actualisation toutes les 3 secondes.`
                : "Connexion au serveur"
            }
          >
            {online ? <CheckCheck size={16} /> : <WifiOff size={16} />}
            {busy
              ? "Enregistrement…"
              : loading
                ? "Connexion…"
                : online
                  ? "Synchronisé"
                  : "Connexion interrompue"}
          </span>
          <button
            className="hw-btn"
            disabled={locked || hasDraft}
            onClick={() => setConfirmation("new")}
          >
            <Plus size={16} />
            Nouveau hunt
          </button>
        </div>
      </header>
      <nav className="hw-nav" aria-label="Navigation du hunt">
        <button
          className={tab === "session" ? "is-active" : ""}
          aria-current={tab === "session" ? "page" : undefined}
          onClick={() => setTab("session")}
        >
          <Layers3 size={17} />
          Hunt en cours
        </button>
        <button
          className={tab === "history" ? "is-active" : ""}
          aria-current={tab === "history" ? "page" : undefined}
          disabled={hasDraft}
          onClick={() => void showHistory()}
        >
          <History size={17} />
          Historique
        </button>
        <span className="hw-account">{user.username}</span>
      </nav>
      {changedDuringDraft && (
        <div className="hw-alert" role="alert">
          Le hunt a changé sur un autre écran. Ta saisie reste affichée mais ne
          peut plus être envoyée. Annule-la pour retrouver la version à jour.
        </div>
      )}
      {error && (
        <div className="hw-alert" role="alert">
          {error}
        </div>
      )}
      {!online && !loading && (
        <div className="hw-alert" role="status">
          Les dernières données restent affichées. Les modifications reprendront
          au retour de la connexion.
          <button className="hw-btn" onClick={() => void workspace.refresh()}>
            Réessayer
          </button>
        </div>
      )}
      {notice && (
        <div className="hw-notice" role="status">
          <Check size={15} />
          {notice}
          <button
            aria-label="Masquer le message"
            onClick={() => setNotice(null)}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {loading ? (
        <div className="hw-panel hw-empty" aria-busy="true">
          <div className="hw-loader" />
          <h2>On retrouve ton hunt…</h2>
          <p>Aucune donnée n'est remplacée au chargement.</p>
        </div>
      ) : tab === "history" ? (
        <section className="hw-panel">
          <div className="hw-section-head">
            <div>
              <span className="hw-eyebrow">TES SESSIONS</span>
              <h2>Historique des hunts</h2>
            </div>
            <span className="hw-muted">
              Consultation sans modifier le hunt en cours
            </span>
          </div>
          {archiveLoading ? (
            <div className="hw-empty">Chargement des sauvegardes…</div>
          ) : !workspace.archives.length ? (
            <div className="hw-empty">
              <History size={32} />
              <h3>Les prochains bilans t'attendent ici.</h3>
              <p>Termine ton hunt ou enregistre une copie pour le retrouver.</p>
            </div>
          ) : (
            <div className="hw-archives">
              {workspace.archives.map((h) => (
                <button
                  key={h.id}
                  onClick={() => setArchive(h)}
                  className="hw-archive"
                >
                  <span className="hw-archive-icon">
                    <History size={20} />
                  </span>
                  <span>
                    <strong>{h.title || `Hunt #${h.id}`}</strong>
                    <small>
                      {h.created_at
                        ? new Date(h.created_at).toLocaleDateString("fr-FR", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })
                        : "Sauvegarde"}{" "}
                      · {h.items_count ?? h.snapshot?.items.length ?? 0}{" "}
                      machines
                    </small>
                  </span>
                  <span>
                    <strong
                      className={
                        Number(h.total_pay) >= Number(h.start)
                          ? "hw-positive"
                          : ""
                      }
                    >
                      {money(Number(h.total_pay) || 0)}
                    </strong>
                    <small>Start {money(Number(h.start) || 0)}</small>
                  </span>
                  <ChevronRight size={18} />
                </button>
              ))}
            </div>
          )}
        </section>
      ) : (
        <>
          <div className="hw-stats">
            <div>
              <span>
                <Wallet size={16} />
                Budget de départ
              </span>
              <strong>{money(stats.start)}</strong>
              <small>Le montant à récupérer</small>
            </div>
            <div>
              <span>
                <Layers3 size={16} />
                {phase === "edit" ? "Bonus récoltés" : "Bonus ouverts"}
              </span>
              <strong>
                {phase === "edit" ? (
                  state.items.length
                ) : (
                  <>
                    {stats.paid}
                    <em> / {state.items.length}</em>
                  </>
                )}
              </strong>
              <small>
                {phase === "edit"
                  ? `${money(stats.totalBet)} de mises cumulées`
                  : `${stats.unpaid} encore à ouvrir`}
              </small>
            </div>
            <div>
              <span>
                <Target size={16} />
                {phase === "edit" ? "Seuil de rentabilité" : "Total récupéré"}
              </span>
              <strong>
                {phase === "edit"
                  ? multi(stats.breakEven)
                  : money(stats.totalPay)}
              </strong>
              <small>
                {phase === "edit"
                  ? "Multiplicateur moyen nécessaire"
                  : `${Math.round(stats.recovered)} % du budget de départ`}
              </small>
            </div>
            <div className="hw-stat-accent">
              <span>
                <ShieldCheck size={16} />
                {phase === "edit"
                  ? "Prêt pour l'ouverture"
                  : phase === "closed"
                    ? "Résultat final"
                    : "Reste à réaliser"}
              </span>
              <strong
                className={
                  phase === "closed" && stats.profit >= 0 ? "hw-positive" : ""
                }
              >
                {phase === "edit"
                  ? missingBets
                    ? `${missingBets} mise${missingBets > 1 ? "s" : ""}`
                    : state.items.length
                      ? "Tout est prêt"
                      : "À préparer"
                  : phase === "closed"
                    ? money(stats.profit)
                    : multi(stats.remainingMulti)}
              </strong>
              <small>
                {phase === "edit"
                  ? missingBets
                    ? "À renseigner dans la liste"
                    : "Ajoute tes bonus, puis lance l'ouverture"
                  : phase === "closed"
                    ? "Gains moins budget de départ"
                    : "Moyenne nécessaire sur les bonus restants"}
              </small>
            </div>
          </div>
          <div className="hw-modebar">
            <div className="hw-mode-tabs" aria-label="Mode du hunt">
              <button
                aria-pressed={phase === "edit"}
                disabled={locked || hasDraft || phase === "edit"}
                onClick={() => void act((api) => api.revert())}
              >
                <span>01</span>Farm
              </button>
              <button
                aria-pressed={phase === "open"}
                disabled={locked || hasDraft || phase === "open" || !canOpen}
                onClick={() => void act((api) => api.open())}
              >
                <span>02</span>Ouverture
              </button>
              {phase === "closed" && (
                <span className="hw-closed-tag">
                  <CheckCheck size={16} />
                  Terminé
                </span>
              )}
            </div>
            <span className="hw-muted">
              <ShieldCheck size={14} />
              {hasDraft
                ? "Saisie en cours"
                : "Modifications enregistrées sur le compte"}
            </span>
          </div>
          {phase === "edit" && (
            <div className="hw-farm-layout">
              <section className="hw-panel hw-machines">
                <div className="hw-section-head">
                  <div>
                    <span className="hw-eyebrow">LA RÉCOLTE</span>
                    <h2>
                      Tes machines{" "}
                      <span className="hw-count">{state.items.length}</span>
                    </h2>
                  </div>
                  <span className="hw-muted">Derniers ajouts en haut</span>
                </div>
                {!state.items.length ? (
                  <div className="hw-empty">
                    <Layers3 size={40} />
                    <h3>Le premier bonus ouvre le bal.</h3>
                    <p>
                      Définis ton budget et ajoute une machine pour commencer.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="hw-table-head">
                      <span>Machine</span>
                      <span>Mise du bonus</span>
                      <span />
                    </div>
                    <div className="hw-machine-list">
                      {[...state.items].reverse().map((item, index) => (
                        <div key={item.id} className="hw-machine-row">
                          <div className="hw-machine-identity">
                            <span className="hw-order">
                              {String(state.items.length - index).padStart(
                                2,
                                "0",
                              )}
                            </span>
                            <Thumb item={item} />
                            <div className="hw-slot-name">
                              <strong>{item.name}</strong>
                              <small>
                                {item.provider || "Machine personnalisée"}
                                {item.caller ? ` · ${item.caller}` : ""}
                              </small>
                            </div>
                          </div>
                          <MoneyField
                            label={`Mise de ${item.name}`}
                            value={item.bet}
                            disabled={locked}
                            positive
                            autoSave
                            onDirty={setFieldDirty(`bet-${item.id}`)}
                            onSave={(value, expected) =>
                              act((api) => api.bet(item.id, value, expected))
                            }
                          />
                          <button
                            className="hw-btn hw-icon hw-delete"
                            aria-label={`Retirer ${item.name}`}
                            title="Retirer la machine"
                            disabled={locked || hasDraft}
                            onClick={() => setConfirmation(item)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                <footer className="hw-list-footer">
                  <span>
                    {state.items.length} bonus ·{" "}
                    <strong>{money(stats.totalBet)}</strong> de mises
                  </span>
                  <button
                    className="hw-btn hw-primary"
                    disabled={locked || hasDraft || !canOpen}
                    onClick={() => {
                      setSelectedId(null);
                      void act((api) => api.open());
                    }}
                  >
                    Passer à l'ouverture
                    <ArrowRight size={16} />
                  </button>
                </footer>
              </section>
              <aside className="hw-setup">
                <section className="hw-panel hw-budget">
                  <span className="hw-eyebrow">POINT DE DÉPART</span>
                  <h2>Le budget du hunt</h2>
                  <MoneyField
                    label="Budget de départ"
                    value={state.start}
                    positive
                    disabled={locked}
                    onDirty={setFieldDirty("start")}
                    onSave={(value, expected) =>
                      act((api) => api.start(value, expected))
                    }
                  />
                  <p className="hw-muted">
                    Le start sert de référence à ton bilan.
                  </p>
                </section>
                <section className="hw-panel hw-add">
                  <span className="hw-eyebrow">PROCHAIN BONUS</span>
                  <h2>Ajouter une machine</h2>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void add(query);
                    }}
                  >
                    <label className="hw-search">
                      <Search size={17} />
                      <input
                        aria-label="Rechercher une machine"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Nom de la machine…"
                        disabled={locked}
                      />
                    </label>
                    {searching ? (
                      <p className="hw-muted" role="status">
                        Recherche…
                      </p>
                    ) : (
                      query.trim().length >= 2 && (
                        <div className="hw-suggestions">
                          {suggestions.map((item) => {
                            const exists = state.items.some(
                              (it) =>
                                it.name.toLowerCase() ===
                                item.name.toLowerCase(),
                            );
                            return (
                              <button
                                key={item.name}
                                type="button"
                                disabled={locked || stats.start <= 0 || exists}
                                onClick={() => void add(item.name)}
                              >
                                <Thumb item={item} />
                                <span>
                                  <strong>{item.name}</strong>
                                  <small>{item.provider || "Machine"}</small>
                                </span>
                                {exists ? (
                                  <Check size={16} />
                                ) : (
                                  <Plus size={16} />
                                )}
                              </button>
                            );
                          })}
                          {!suggestions.length && (
                            <p className="hw-muted">
                              {searchError
                                ? "Catalogue indisponible. L'ajout par nom reste possible."
                                : "Aucun résultat. Tu peux ajouter ce nom manuellement."}
                            </p>
                          )}
                        </div>
                      )
                    )}
                    <button
                      type="submit"
                      className="hw-btn hw-primary hw-wide"
                      disabled={locked || stats.start <= 0 || !query.trim()}
                    >
                      <Plus size={17} />
                      Ajouter au hunt
                    </button>
                  </form>
                  {stats.start <= 0 && (
                    <p className="hw-hint">
                      Renseigne d'abord ton budget de départ.
                    </p>
                  )}
                </section>
              </aside>
            </div>
          )}
          {phase === "open" && (
            <div className="hw-opening-layout">
              <section className="hw-panel hw-opening">
                <div className="hw-section-head">
                  <div>
                    <span className="hw-eyebrow">LE MOMENT DES RÉSULTATS</span>
                    <h2>Ouverture des bonus</h2>
                  </div>
                  <span className="hw-count">
                    {stats.paid} / {state.items.length}
                  </span>
                </div>
                {current ? (
                  <>
                    <div className="hw-bonus-stage">
                      <Thumb item={current} large />
                      <div className="hw-bonus-copy">
                        <span className="hw-eyebrow">
                          BONUS {String(currentIndex + 1).padStart(2, "0")}
                        </span>
                        <h3>{current.name}</h3>
                        <p>{current.provider || "Machine personnalisée"}</p>
                        <div className="hw-bonus-numbers">
                          <span>
                            Mise
                            <strong>{money(Number(current.bet) || 0)}</strong>
                          </span>
                          <span>
                            Multiplicateur
                            <strong>
                              {multi(
                                current.pay == null || !Number(current.bet)
                                  ? null
                                  : Number(current.pay) / Number(current.bet),
                              )}
                            </strong>
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="hw-pay-entry">
                      <MoneyField
                        key={current.id}
                        label={`Gain de ${current.name}`}
                        value={current.pay}
                        disabled={locked}
                        action={
                          current.pay == null
                            ? "Valider le gain"
                            : "Corriger le gain"
                        }
                        onDirty={setFieldDirty(`pay-${current.id}`)}
                        onSave={async (value, expected) => {
                          const ok = await act((api) =>
                            api.pay(current.id, value, expected),
                          );
                          if (ok) {
                            const next = state.items.find(
                              (it, i) => i > currentIndex && it.pay == null,
                            );
                            setSelectedId(next?.id ?? current.id);
                          }
                          return ok;
                        }}
                      />
                      <p className="hw-muted">
                        Un bonus sans gain ? Saisis 0, puis valide. Entrée
                        fonctionne aussi.
                      </p>
                    </div>
                    <div className="hw-opening-nav">
                      <button
                        className="hw-btn"
                        aria-label="Bonus précédent"
                        disabled={locked || hasDraft || currentIndex <= 0}
                        onClick={() =>
                          setSelectedId(state.items[currentIndex - 1].id)
                        }
                      >
                        <ArrowLeft size={16} />
                        Précédent
                      </button>
                      <span>
                        {currentIndex + 1} sur {state.items.length}
                      </span>
                      <button
                        className="hw-btn"
                        aria-label="Bonus suivant"
                        disabled={
                          locked ||
                          hasDraft ||
                          currentIndex >= state.items.length - 1
                        }
                        onClick={() =>
                          setSelectedId(state.items[currentIndex + 1].id)
                        }
                      >
                        Suivant
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="hw-empty">Aucun bonus à ouvrir.</div>
                )}
              </section>
              <aside className="hw-panel hw-opening-queue">
                <div className="hw-section-head">
                  <h2>Fil de l'ouverture</h2>
                  <span className="hw-count">{state.items.length}</span>
                </div>
                <div className="hw-queue-list">
                  {state.items.map((item, index) => (
                    <button
                      key={item.id}
                      className={item.id === current?.id ? "is-current" : ""}
                      aria-pressed={item.id === current?.id}
                      disabled={hasDraft || busy}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <span className="hw-order">
                        {item.pay == null ? (
                          String(index + 1).padStart(2, "0")
                        ) : (
                          <Check size={15} />
                        )}
                      </span>
                      <Thumb item={item} />
                      <span className="hw-slot-name">
                        <strong>{item.name}</strong>
                        <small>{money(Number(item.bet) || 0)} de mise</small>
                      </span>
                      <b>
                        {item.pay == null
                          ? "À ouvrir"
                          : money(Number(item.pay))}
                      </b>
                    </button>
                  ))}
                </div>
                <div className="hw-recovery">
                  <div>
                    <span>Budget récupéré</span>
                    <strong>{Math.round(stats.recovered)} %</strong>
                  </div>
                  <progress
                    max="100"
                    value={stats.recovered}
                    aria-label="Budget récupéré"
                  />
                  <small>
                    {money(stats.totalPay)} sur {money(stats.start)}
                  </small>
                </div>
                <button
                  className="hw-btn hw-wide"
                  disabled={locked || hasDraft}
                  onClick={() => setConfirmation("close")}
                >
                  <CheckCheck size={17} />
                  Terminer et sauvegarder
                </button>
              </aside>
            </div>
          )}
          {phase === "closed" && (
            <section className="hw-panel hw-finish">
              <div className="hw-section-head">
                <div>
                  <span className="hw-eyebrow">SESSION TERMINÉE</span>
                  <h2>Le bilan de ton hunt</h2>
                </div>
                <span className="hw-sync">
                  <ShieldCheck size={16} />
                  Hunt sauvegardé
                </span>
              </div>
              <Results state={state} />
              <footer className="hw-list-footer">
                <span>Tu peux consulter le détail dans l'historique.</span>
                <button
                  className="hw-btn hw-primary"
                  disabled={locked || hasDraft}
                  onClick={() => setConfirmation("new")}
                >
                  <Plus size={16} />
                  Préparer le prochain hunt
                </button>
              </footer>
            </section>
          )}
          <footer className="hw-footnote">
            <span>
              <CheckCheck size={15} />
              Même compte, même hunt. Les autres écrans se mettent à jour
              automatiquement.
            </span>
            <button
              disabled={locked || hasDraft || !state.items.length}
              onClick={async () => {
                if (await act((api) => api.save()))
                  setNotice("Copie enregistrée dans l'historique.");
              }}
            >
              Enregistrer une copie
            </button>
          </footer>
        </>
      )}
      {confirmation && (
        <HuntDialog
          title={
            confirmation === "new"
              ? "Commencer un nouveau hunt ?"
              : confirmation === "close"
                ? "Terminer ce hunt ?"
                : "Retirer cette machine ?"
          }
          onClose={() => {
            if (!busy) setConfirmation(null);
          }}
        >
          <p>
            {confirmation === "new"
              ? "Une copie du hunt actuel sera sauvegardée dans l'historique avant de repartir de zéro. Cette action concerne aussi les autres écrans connectés au compte."
              : confirmation === "close"
                ? `${stats.unpaid ? `${stats.unpaid} bonus n'ont pas encore de gain renseigné. ` : "Tous les gains sont renseignés. "}Le bilan sera sauvegardé dans l'historique.`
                : `${confirmation.name} sera retirée du hunt sur tous les écrans.`}
          </p>
          <footer>
            <button
              className="hw-btn"
              disabled={busy}
              onClick={() => setConfirmation(null)}
            >
              Annuler
            </button>
            <button
              className={`hw-btn ${typeof confirmation === "object" ? "hw-danger" : "hw-primary"}`}
              disabled={locked}
              onClick={() => void confirmAction()}
            >
              {busy ? "Enregistrement…" : "Confirmer"}
            </button>
          </footer>
        </HuntDialog>
      )}
      {archive && (
        <HuntDialog
          title={archive.title || `Hunt #${archive.id}`}
          onClose={() => setArchive(null)}
        >
          <div className="hw-archive-summary">
            <span>
              Budget<strong>{money(Number(archive.start) || 0)}</strong>
            </span>
            <span>
              Total récupéré
              <strong>{money(Number(archive.total_pay) || 0)}</strong>
            </span>
            <span>
              Résultat
              <strong>
                {money(
                  (Number(archive.total_pay) || 0) -
                    (Number(archive.start) || 0),
                )}
              </strong>
            </span>
          </div>
          {archive.snapshot ? (
            <Results state={archive.snapshot} />
          ) : (
            <p>Le détail de cette ancienne sauvegarde n'est pas disponible.</p>
          )}
          <p className="hw-muted">
            Lecture seule : ton hunt en cours reste intact.
          </p>
        </HuntDialog>
      )}
    </main>
  );
}
