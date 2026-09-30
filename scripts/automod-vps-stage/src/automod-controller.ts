import path from "node:path";
import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { ArtifactRecorder } from "./artifacts.js";
import { AutomodConfigStore, validateAutomodConfig, type AutomodConfig } from "./automod-config.js";
import type { AutomodRuntimeState } from "./automod-domain.js";
import { AutomodService } from "./automod-service.js";
import { AutomodStateStore } from "./automod-store.js";
import { reduceAutomod } from "./automod-domain.js";
import { BigWinStore } from "./big-win-store.js";
import { GainJournal } from "./gain-journal.js";
import { SessionStatsStore, type RankedGain } from "./session-stats-store.js";
import { SessionDataJournal } from "./session-data-journal.js";
import { BonusHuntService, asBonusHuntExecutor, type BonusHuntState } from "./bonus-hunt-service.js";
import { BonusHuntStore } from "./bonus-hunt-store.js";
import { BrowserSlotExecutor } from "./browser-slot-executor.js";
import { loadConfig } from "./config.js";
import { LunaLiveClient } from "./lunalive-client.js";
import { AutomodQueueGateway, type CallsSnapshot } from "./automod-queue.js";
import { CdpGameCapture } from "./cdp-game-capture.js";
import { gameVideoHub } from "./game-video-hub.js";

export type ControllerPhase = "idle" | "starting" | "running" | "stopping" | "error";
export type ControllerMode = "automod" | "bonus-hunt";

export interface ControllerLogEntry { at: string; level: "info" | "error"; message: string }

export interface AutomodControllerStatus {
  phase: ControllerPhase;
  mode: ControllerMode | null;
  startedAt: string | null;
  lastError: string | null;
  automod: AutomodRuntimeState | null;
  bonusHunt: BonusHuntState | null;
  config: AutomodConfig;
  logs: ControllerLogEntry[];
  huntEntries: Awaited<ReturnType<BonusHuntStore["snapshot"]>>["entries"];
  queueWritable: boolean;
  controlNonce: string;
  overlaySession: {
    bonusCount: number;
    bigWinCents: number | null;
    streamStartedAt: string | null;
    topGains?: RankedGain[];
    sessionId?: string;
    sessionStartedAt?: string;
  };
}

interface ActiveRun {
  requestStop(): void;
  requestOpen?(): void;
  requestSkip?(): void;
  requestRestart?(): void;
  completion: Promise<void>;
}

export interface AutomodControllerOptions {
  configStore: AutomodConfigStore;
  huntStore: BonusHuntStore;
  queue: AutomodQueueGateway;
  stateStore?: AutomodStateStore;
  sessionStatsStore?: SessionStatsStore;
  createRun?: (mode: ControllerMode, config: AutomodConfig, hooks: {
    log(message: string): Promise<void>;
    automodState(state: AutomodRuntimeState): void;
    huntState(state: BonusHuntState): void;
    sessionStats(stats: { bonusCount: number; bigWinCents: number | null }): void;
  }, openOnly: boolean) => Promise<ActiveRun>;
  nonce?: string;
  lunaLiveTokenFile?: string;
  lunaLiveServiceCredentialFile?: string;
}

export class AutomodController {
  private phase: ControllerPhase = "idle";
  private mode: ControllerMode | null = null;
  private startedAt: string | null = null;
  private lastError: string | null = null;
  private automodState: AutomodRuntimeState | null = null;
  private huntState: BonusHuntState | null = null;
  private config: AutomodConfig | null = null;
  private logs: ControllerLogEntry[] = [];
  private activeRun: ActiveRun | null = null;
  private automaticRestartCount = 0;
  private manualStopRequested = false;
  private overlaySession = { bonusCount: 0, bigWinCents: null as number | null, streamStartedAt: null as string | null };
  private statsSyncTimer: NodeJS.Timeout | null = null;
  public readonly controlNonce: string;

  public constructor(private readonly options: AutomodControllerOptions) {
    this.controlNonce = options.nonce ?? randomBytes(18).toString("base64url");
  }

  public async initialize(): Promise<void> {
    this.config = await this.options.configStore.load();
    await this.syncSessionStats();
    this.statsSyncTimer = setInterval(() => { void this.syncSessionStats(); }, 60_000);
    this.statsSyncTimer.unref();
  }

  private requireConfig(): AutomodConfig {
    if (this.config === null) throw new Error("Contrôleur non initialisé.");
    return this.config;
  }

  private async log(message: string, level: "info" | "error" = "info"): Promise<void> {
    this.logs.push({ at: new Date().toISOString(), level, message });
    this.logs = this.logs.slice(-2_500);
  }

  public async status(): Promise<AutomodControllerStatus> {
    const hunt = await this.options.huntStore.snapshot();
    const persistedStats = await this.options.sessionStatsStore?.snapshot();
    return {
      phase: this.phase,
      mode: this.mode,
      startedAt: this.startedAt,
      lastError: this.lastError,
      automod: this.automodState,
      bonusHunt: this.huntState,
      config: structuredClone(this.requireConfig()),
      logs: structuredClone(this.logs),
      huntEntries: hunt.entries,
      queueWritable: this.options.queue.queueWritable,
      controlNonce: this.controlNonce,
      overlaySession: { ...structuredClone(this.overlaySession), ...persistedStats },
    };
  }

  public setStreamStartedAt(value: string | null): void {
    this.overlaySession.streamStartedAt = value;
  }

  public async resetSessionStats(): Promise<void> {
    if (this.phase !== "idle" && this.phase !== "error") throw Error("Arrête l’Automod avant de créer une nouvelle session statistique.");
    const state = await this.options.stateStore?.load();
    if (state?.bonus?.endedAt === null) throw Error("Termine le bonus en cours avant de changer de session.");
    if (!this.options.sessionStatsStore) throw Error("Stockage des statistiques non configuré.");
    await this.options.sessionStatsStore.reset();
    await this.syncSessionStats();
    await this.log("Nouvelle session statistique ; la précédente a été archivée.");
  }

  private async syncSessionStats(): Promise<void> {
    if (!this.options.sessionStatsStore) return;
    try { await this.options.queue.syncSessionStats(await this.options.sessionStatsStore.snapshot()); }
    catch { await this.log("Synchronisation des statistiques LunaLive en attente; une nouvelle tentative sera faite automatiquement.", "error"); }
  }

  public async calls(): Promise<CallsSnapshot> {
    return this.options.queue.listResolved();
  }

  public async setLunaLiveToken(input: unknown): Promise<void> {
    if (this.phase !== "idle" && this.phase !== "error") throw new Error("Arrête l’Automod avant de modifier l’accès Luna Live.");
    if (typeof input !== "string" || input.trim().length < 20 || input.trim().length > 4_096) {
      throw new Error("Le jeton Luna Live est absent ou invalide.");
    }
    const token = input.trim();
    this.options.queue.setToken(token);
    const snapshot = await this.options.queue.listResolved();
    if (!snapshot.queueWritable) {
      this.options.queue.setToken(undefined);
      throw new Error("Luna Live refuse ce jeton ou ne permet pas l’accès complet à la file. Vérifie le compte et les droits de LeCasiNoze.");
    }
    const tokenFile = this.options.lunaLiveTokenFile;
    if (!tokenFile) throw new Error("Le stockage sécurisé du jeton n’est pas configuré sur ce serveur.");
    await mkdir(path.dirname(tokenFile), { recursive: true, mode: 0o700 });
    try {
      await writeFile(tokenFile, `${token}\n`, { encoding: "utf8", mode: 0o600 });
      await chmod(tokenFile, 0o600);
    } catch (error) {
      this.options.queue.setToken(undefined);
      throw error;
    }
    await this.log("Jeton Luna Live validé et enregistré avec accès complet à la file.");
  }

  public async setLunaLiveServiceCredential(input: unknown): Promise<void> {
    if (this.phase !== "idle" && this.phase !== "error") throw new Error("Arrête l’Automod avant de modifier l’accès Luna Live.");
    if (typeof input !== "object" || input === null || Array.isArray(input)) throw new Error("Identifiants de service invalides.");
    const value = input as Record<string, unknown>;
    if (typeof value.serviceId !== "string" || !/^[0-9a-f-]{36}$/i.test(value.serviceId) || typeof value.secret !== "string" || value.secret.length < 40 || value.secret.length > 256) {
      throw new Error("Identifiants de service absents ou invalides.");
    }
    const file = this.options.lunaLiveServiceCredentialFile;
    if (!file) throw new Error("Stockage sécurisé des identifiants de service non configuré.");
    this.options.queue.setServiceCredential({ serviceId: value.serviceId, secret: value.secret });
    const temporary = `${file}.${process.pid}.tmp`;
    try {
      const snapshot = await this.options.queue.listResolved();
      if (!snapshot.queueWritable) throw new Error("LunaLive n’a pas autorisé l’accès de service à la file LeCasiNoze.");
      await this.options.queue.callsSettings();
      await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
      await chmod(path.dirname(file), 0o700);
      await writeFile(temporary, `${JSON.stringify({ serviceId: value.serviceId, secret: value.secret })}\n`, { encoding: "utf8", mode: 0o600, flush: true });
      await chmod(temporary, 0o600);
      await rename(temporary, file);
      await chmod(file, 0o600);
      // Once the machine identity is validated, stop retaining the personal JWT locally.
      if (this.options.lunaLiveTokenFile) await unlink(this.options.lunaLiveTokenFile).catch(() => undefined);
      delete process.env.LUNALIVE_TOKEN;
      await this.log("Identité de service LunaLive vérifiée et enregistrée dans le stockage privé.");
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      this.options.queue.setServiceCredential(undefined);
      throw error;
    }
  }

  public async updateConfig(input: unknown): Promise<AutomodConfig> {
    if (this.phase !== "idle" && this.phase !== "error") throw new Error("Arrête l’Automod avant de modifier sa configuration.");
    if (typeof input !== "object" || input === null || Array.isArray(input)) throw new Error("Configuration JSON invalide.");
    const current = this.requireConfig();
    const row = input as Record<string, unknown>;
    const golden = row.enhancedSpins as Record<string, unknown> | undefined;
    const candidate = {
      ...current,
      stakeCents: row.stakeCents ?? current.stakeCents,
      spinMode: row.spinMode ?? current.spinMode,
      maxSpinsPerSlot: row.spinMode === "infinite" ? null : row.maxSpinsPerSlot ?? current.maxSpinsPerSlot,
      slotDurationMs: row.slotDurationMs ?? current.slotDurationMs,
      randomWhenQueueEmpty: row.randomWhenQueueEmpty ?? current.randomWhenQueueEmpty,
      allowedProviders: (Array.isArray(row.allowedProviders) ? row.allowedProviders : current.allowedProviders)
        .filter((provider): provider is "pragmatic" | "nolimit" | "hacksaw" =>
          provider === "pragmatic" || provider === "nolimit" || provider === "hacksaw"),
      enhancedSpins: {
        ...current.enhancedSpins,
        pragmatic: { ...current.enhancedSpins.pragmatic, ...(golden?.pragmatic as object | undefined) },
        hacksaw: { ...current.enhancedSpins.hacksaw, ...(golden?.hacksaw as object | undefined) },
        nolimit: { ...current.enhancedSpins.nolimit, ...(golden?.nolimit as object | undefined) },
      },
      bonusHunt: { ...current.bonusHunt, ...(row.bonusHunt as object | undefined) },
    };
    const valid = validateAutomodConfig(candidate);
    for (const provider of ["pragmatic", "nolimit", "hacksaw"] as const) {
      if (valid.enhancedSpins[provider].maxMultiplier > 5) {
        throw new Error(`Le mode majoré ${provider} est limité à x5.`);
      }
      valid.enhancedSpins[provider].maxTotalStakeCents = Math.max(
        valid.stakeCents,
        Math.floor(valid.stakeCents * valid.enhancedSpins[provider].maxMultiplier),
      );
    }
    await this.options.configStore.save(valid);
    this.config = valid;
    await this.log("Configuration enregistrée.");
    return structuredClone(valid);
  }

  public async start(): Promise<void> {
    if (this.activeRun !== null || this.phase === "starting" || this.phase === "running" || this.phase === "stopping") {
      throw new Error("Une exécution Automod est déjà active.");
    }
    const mode: ControllerMode = this.requireConfig().bonusHunt.enabled ? "bonus-hunt" : "automod";
    this.automaticRestartCount = 0;
    this.manualStopRequested = false;
    this.overlaySession = { bonusCount: 0, bigWinCents: null, streamStartedAt: this.overlaySession.streamStartedAt };
    await this.launch(mode, false);
  }

  public async openHunt(): Promise<void> {
    const pending = (await this.options.huntStore.snapshot()).entries.some((entry) =>
      entry.status === "pending" || entry.status === "opening" || entry.status === "failed",
    );
    if (!pending) throw new Error("Aucun bonus en attente à ouvrir.");
    if (this.activeRun !== null) {
      if (this.mode !== "bonus-hunt" || this.activeRun.requestOpen === undefined) throw new Error("Le mode Bonus Hunt n’est pas actif.");
      this.activeRun.requestOpen();
      await this.log("Ouverture manuelle du hunt demandée.");
      return;
    }
    await this.launch("bonus-hunt", true);
  }

  private async launch(mode: ControllerMode, openOnly: boolean): Promise<void> {
    if (this.options.createRun === undefined) throw new Error("Fabrique d’exécution absente.");
    this.phase = "starting";
    this.mode = mode;
    this.startedAt = new Date().toISOString();
    this.lastError = null;
    const hooks = {
      log: (message: string) => this.log(message),
      automodState: (state: AutomodRuntimeState) => { this.automodState = structuredClone(state); },
      huntState: (state: BonusHuntState) => { this.huntState = structuredClone(state); },
      sessionStats: (stats: { bonusCount: number; bigWinCents: number | null }) => {
        this.overlaySession.bonusCount = stats.bonusCount;
        this.overlaySession.bigWinCents = stats.bigWinCents;
        void this.syncSessionStats();
      },
    };
    try {
      const run = await this.options.createRun(mode, structuredClone(this.requireConfig()), hooks, openOnly);
      this.activeRun = run;
      this.phase = "running";
      await this.log(openOnly ? "Ouverture du hunt démarrée." : `${mode === "automod" ? "Automod" : "Bonus Hunt"} démarré.`);
      void run.completion.then(async () => {
        if (this.activeRun !== run) return;
        this.activeRun = null;
        this.phase = "idle";
        this.mode = null;
        this.startedAt = null;
        await this.log("Exécution terminée proprement.");
      }).catch(async (error: unknown) => {
        if (this.activeRun !== run) return;
        this.activeRun = null;
        const message = error instanceof Error ? error.message : String(error);
        this.lastError = message;
        if (
          mode === "automod" && !openOnly && !this.manualStopRequested &&
          message.includes("SERVICE_RESTART_REQUIRED") && this.automaticRestartCount < 5
        ) {
          this.automaticRestartCount += 1;
          this.phase = "starting";
          await this.log(`Récupération ${this.automaticRestartCount}/5: redémarrage complet de l’Automod.`, "error");
          await new Promise((resolve) => setTimeout(resolve, 2_000));
          if (!this.manualStopRequested && this.activeRun === null) {
            await this.launch("automod", false).catch(async (restartError: unknown) => {
              this.phase = "error";
              this.lastError = restartError instanceof Error ? restartError.message : String(restartError);
              await this.log(this.lastError, "error");
            });
          }
          return;
        }
        this.phase = "error";
        if (this.automaticRestartCount >= 5) this.lastError = `FATAL_STREAM_STOP_REQUIRED: ${message}`;
        await this.log(this.lastError, "error");
      });
    } catch (error) {
      this.phase = "error";
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    this.manualStopRequested = true;
    const run = this.activeRun;
    if (run === null) {
      this.phase = "idle";
      this.mode = null;
      return;
    }
    this.phase = "stopping";
    run.requestStop();
    await this.log("Arrêt propre demandé; attente du règlement du round courant.");
    await run.completion;
  }

  public async skip(): Promise<void> {
    const run = this.activeRun;
    if (run === null || run.requestSkip === undefined) throw new Error("Aucune machine active à skipper.");
    run.requestSkip();
    await this.log("Skip manuel demandé; attente de la fin du round ou bonus courant.");
  }

  public async abandonFailedActiveItem(): Promise<void> {
    if (this.activeRun !== null || (this.phase !== "error" && this.phase !== "idle")) {
      throw new Error("L’abandon direct est réservé à une exécution arrêtée ou en erreur.");
    }
    if (this.options.stateStore === undefined) throw new Error("Store d’état Automod indisponible.");
    const state = await this.options.stateStore.load();
    const active = state.active;
    if (active === null) throw new Error("Aucune slot active à abandonner.");
    const next = reduceAutomod(state, { type: "discard-processed-item", now: Date.now() });
    await this.options.stateStore.save(next);
    this.automodState = structuredClone(next);
    if (active.callId !== null) await this.options.queue.completeCall(active.callId);
    await this.log(`Slot abandonnée explicitement après erreur: ${active.slotName}; gain du bonus non mesuré. Call retiré de la file.`);
  }

  public async restartSlot(): Promise<void> {
    const run = this.activeRun;
    if (run === null || run.requestRestart === undefined) throw new Error("Aucune machine active à relancer.");
    run.requestRestart();
    await this.log("Relance de la slot demandée; attente d’un état sûr.");
  }
}

async function loadLunaLiveToken(runtimeRoot: string): Promise<string | undefined> {
  const environmentToken = process.env.LUNALIVE_TOKEN?.trim();
  if (environmentToken) return environmentToken;
  try {
    const localToken = (await readFile(path.join(runtimeRoot, "lunalive-token"), "utf8")).trim();
    return localToken || undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function loadLunaLiveServiceCredential(runtimeRoot: string): Promise<{ serviceId: string; secret: string } | undefined> {
  try {
    const value = JSON.parse(await readFile(path.join(runtimeRoot, "lunalive-service-credential"), "utf8")) as Record<string, unknown>;
    return typeof value.serviceId === "string" && typeof value.secret === "string" ? { serviceId: value.serviceId, secret: value.secret } : undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function createProductionController(cwd = process.cwd()): Promise<AutomodController> {
  const runnerConfig = await loadConfig(cwd);
  const runtimeRoot = path.resolve(runnerConfig.runsDir, "..");
  const configStore = new AutomodConfigStore(runtimeRoot);
  const huntStore = new BonusHuntStore(runtimeRoot);
  const initialConfig = await configStore.load();
  const token = await loadLunaLiveToken(runtimeRoot);
  const serviceCredential = await loadLunaLiveServiceCredential(runtimeRoot);
  const client = new LunaLiveClient({
    baseUrl: initialConfig.lunaLiveApiBaseUrl,
    streamerSlug: initialConfig.streamerSlug,
    token,
    serviceCredential,
  });
  const queue = new AutomodQueueGateway(client, huntStore, token, runtimeRoot);
  const stateStore = new AutomodStateStore(runtimeRoot);
  const sessionStatsStore = new SessionStatsStore(runtimeRoot);
  const gainJournal = new GainJournal(runtimeRoot);
  // Enrich only confirmed results, outside the game loop's browser operations.
  const imageCache = new Map<string, string | null>();
  const enrichedGains = { async record(gain: Parameters<GainJournal["record"]>[0]) {
    const key = `${gain.provider}:${gain.slotName}`;
    if (!gain.imageUrl) {
      if (!imageCache.has(key)) imageCache.set(key, await client.resolveImage(gain.slotName, gain.provider));
      gain.imageUrl = imageCache.get(key) ?? null;
    }
    return gainJournal.record(gain);
  } };
  const controller = new AutomodController({
    configStore,
    huntStore,
    queue,
    stateStore,
    sessionStatsStore,
    lunaLiveTokenFile: path.join(runtimeRoot, "lunalive-token"),
    lunaLiveServiceCredentialFile: path.join(runtimeRoot, "lunalive-service-credential"),
    createRun: async (mode, config, hooks, openOnly) => {
      const recorder = await ArtifactRecorder.create(
        runnerConfig.artifactsDir,
        runnerConfig.maxArtifactSessions,
        mode === "automod" ? "automod-web" : "bonus-hunt-web",
        runnerConfig.maxTraceEvents,
        runnerConfig.maxTraceBytes,
      );
      const executor = new BrowserSlotExecutor({
        runnerConfig,
        recorder,
        onMilestone: hooks.log,
        videoCapture: new CdpGameCapture(gameVideoHub),
      });
      if (mode === "automod") {
        const service = new AutomodService({
          config: { ...config, enabled: true },
          stateStore,
          queue: queue as never,
          executor,
          bigWinRecorder: new BigWinStore(runtimeRoot),
          gainJournal: enrichedGains,
          sessionStatsStore,
          sessionDataJournal: new SessionDataJournal(runtimeRoot),
          onState: hooks.automodState,
          onLog: hooks.log,
          onSessionStats: hooks.sessionStats,
        });
        const completion = service.run().finally(() => executor.dispose());
        return {
          requestStop: () => service.requestStop(),
          requestSkip: () => service.requestSkip(),
          requestRestart: () => service.requestRestart(),
          completion,
        };
      }
      const service = new BonusHuntService({
        config: { ...config, enabled: true },
        queue,
        store: huntStore,
        executor: asBonusHuntExecutor(executor),
        onState: hooks.huntState,
        onLog: hooks.log,
      });
      const completion = service.run({ openOnly }).finally(() => executor.dispose());
      return {
        requestStop: () => service.requestStop(),
        requestOpen: () => service.requestOpen(),
        requestSkip: () => service.requestSkip(),
        requestRestart: () => service.requestRestart(),
        completion,
      };
    },
  });
  await controller.initialize();
  return controller;
}
