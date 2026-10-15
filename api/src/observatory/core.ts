import { createHmac } from "node:crypto";
export const MINUTE = 60000,
  HOUR = 3600000;
// timestamp, declared viewers, distinct active 15/60m, messages/min, conversation/min,
// continuous 15m coverage, visible channels, raw active 15m (before exclusions).
export type Point = [
  number,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number,
  number,
  number | null,
];
export type Lang = "fr" | "other" | "unknown";
export type Mode = "personal" | "automod" | "unknown";
export type Event = {
  video: string;
  id: string;
  account: string;
  channel: string;
  at: number;
  conversation: boolean;
  excluded: boolean;
  resolved: boolean;
  mode: Mode;
};
export type Channel = {
  slug: string;
  name: string;
  video: string;
  numeric: string | null;
  viewers: number | null;
  seen: number;
  first: number;
  sourceStart: string | null;
  language: Lang;
  languageConfidence: string;
  mode: Mode;
  connected: number | null;
  lastFrame: number;
  users: Map<string, string>;
};
export function pseudonym(secret: string, kind: string, id: string) {
  return createHmac("sha256", secret)
    .update(kind + ":" + id)
    .digest("hex");
}
export function paris(at: number) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return { date: p.year + "-" + p.month + "-" + p.day, hour: Number(p.hour) };
}
export class Activity {
  channels = new Map<string, Channel>();
  visible = new Set<string>();
  events: Event[] = [];
  seen = new Map<string, number>();
  discoveryAt = 0;
  complete = false;
  started: number;
  constructor(
    readonly secret: string,
    readonly config: {
      bots?: string[];
      languages?: Record<string, Lang>;
      owners?: Record<string, string[]>;
      modes?: { start: number; end: number; mode: Mode }[];
    } = {},
    started = Date.now(),
  ) {
    this.started = started;
  }
  discover(lives: Iterable<any>, complete: boolean, now: number) {
    this.discoveryAt = now;
    this.complete = complete;
    const videos = new Set<string>();
    const visible = new Set<string>();
    for (const l of lives) {
      if (videos.has(l.videoId)) continue;
      videos.add(l.videoId);
      const slug = l.username.toLowerCase();
      visible.add(slug);
      const old = this.channels.get(slug);
      const same = !!old && old.video === l.videoId;
      this.channels.set(slug, {
        slug,
        name: l.username,
        video: l.videoId,
        numeric: l.videoIdNumeric,
        viewers: l.viewersCount,
        seen: now,
        first: same ? old!.first : now,
        sourceStart: l.createdAt,
        language: this.config.languages?.[slug] ?? "unknown",
        languageConfidence: this.config.languages?.[slug]
          ? "manual"
          : "unknown",
        mode:
          slug === "lecasinoze"
            ? (this.config.modes?.find((i) => now >= i.start && now < i.end)
                ?.mode ?? "unknown")
            : "unknown",
        connected: same ? old!.connected : null,
        lastFrame: same ? old!.lastFrame : 0,
        users: same ? old!.users : new Map(),
      });
    }
    this.visible = visible;
  }
  envelope(slug: string, env: any, now: number): Event[] {
    const c = this.channels.get(slug);
    if (!c) return [];
    c.lastFrame = now;
    if (!["init", "messages"].includes(env?.type) || !env.data) return [];
    if (Array.isArray(env.data.users))
      for (const u of env.data.users.slice(0, 20000))
        if (u?.id != null && typeof u.username === "string") {
          if (c.users.size >= 20000) c.users.clear();
          c.users.set(String(u.id), u.username.toLowerCase());
        }
    // init is historical, including after a reconnect: never count as new activity.
    if (env.type === "init") return [];
    const accepted: Event[] = [];
    for (const m of (Array.isArray(env.data.messages)
      ? env.data.messages
      : []
    ).slice(0, 5000)) {
      const at = typeof m.time === "string" ? Date.parse(m.time) : NaN;
      if (
        m?.id == null ||
        m.user_id == null ||
        !Number.isFinite(at) ||
        at > now + 5000 ||
        at < now - 90000 ||
        c.connected == null ||
        at < c.connected
      )
        continue;
      const id = pseudonym(this.secret, "message", c.video + ":" + m.id);
      if (this.seen.has(id)) continue;
      this.seen.set(id, now);
      const uid = String(m.user_id),
        name = c.users.get(uid);
      const text = typeof m.text === "string" ? m.text.trim() : "";
      if (!text) continue;
      const excluded =
        !!name &&
        ((this.config.bots ?? []).includes(name) ||
          name === slug ||
          (this.config.owners?.[slug] ?? []).includes(name));
      const event: Event = {
        id,
        video: c.video,
        account: pseudonym(this.secret, "account", uid),
        channel: slug,
        at,
        conversation: !/^[/!]/.test(text),
        excluded,
        resolved: !!name,
        mode:
          slug === "lecasinoze"
            ? (this.config.modes?.find((i) => at >= i.start && at < i.end)
                ?.mode ?? "unknown")
            : "unknown",
      };
      this.events.push(event);
      accepted.push(event);
    }
    this.events = this.events.filter((e) => e.at >= now - HOUR);
    for (const [id, at] of this.seen)
      if (at < now - 2 * HOUR) this.seen.delete(id);
    if (this.events.length > 200000 || this.seen.size > 400000)
      throw new Error("activity_memory_cap");
    return accepted;
  }
  point(now: number, slug?: string, language?: Lang): Point {
    const current = [...this.channels.values()].filter(
      (c) =>
        this.visible.has(c.slug) &&
        now - c.seen <= 150000 &&
        (!slug || c.slug === slug) &&
        (!language || c.language === language),
    );
    const ids = new Set(current.map((c) => c.slug));
    const fresh = (!!slug || this.complete) && now - this.discoveryAt <= 150000;
    const covered = (minutes: number) =>
      current.length > 0 &&
      fresh &&
      current.every(
        (c) =>
          c.numeric &&
          c.connected != null &&
          now - c.connected >= minutes * MINUTE &&
          now - c.lastFrame < 180000,
      );
    const subset = this.events.filter((e) => ids.has(e.channel) && e.at <= now);
    const resolved = (minutes: number) =>
      !subset.some((e) => e.at > now - minutes * MINUTE && !e.resolved);
    const count = (minutes: number, raw = false) =>
      new Set(
        subset
          .filter(
            (e) =>
              e.at > now - minutes * MINUTE &&
              (raw || (!e.excluded && e.resolved)),
          )
          .map((e) => e.account),
      ).size;
    const minute = subset.filter(
      (e) => e.at > now - MINUTE && !e.excluded && e.resolved,
    );
    const coverage = current.length
      ? current.filter(
          (c) =>
            c.connected != null &&
            now - c.connected >= 15 * MINUTE &&
            now - c.lastFrame < 180000,
        ).length / current.length
      : 0;
    return [
      now,
      current.length && fresh && current.every((c) => c.viewers != null)
        ? current.reduce((s, c) => s + c.viewers!, 0)
        : null,
      covered(15) && resolved(15) ? count(15) : null,
      covered(60) && resolved(60) ? count(60) : null,
      covered(1) && resolved(1) ? minute.length : null,
      covered(1) && resolved(1)
        ? minute.filter((e) => e.conversation).length
        : null,
      fresh ? coverage : 0,
      current.length,
      covered(15) ? count(15, true) : null,
    ];
  }
}
export function summarize(points: Point[], bucket: number): Point[] {
  const groups = new Map<number, Point[]>();
  for (const p of points) {
    const t = Math.floor(p[0] / bucket) * bucket;
    const g = groups.get(t) ?? [];
    g.push(p);
    groups.set(t, g);
  }
  return [...groups]
    .sort((a, b) => a[0] - b[0])
    .map(
      ([t, g]) =>
        [
          t,
          ...Array.from({ length: 8 }, (_, i) => {
            const vals = g
              .map((p) => p[i + 1])
              .filter((v): v is number => v != null);
            if (i === 5)
              return (
                Math.round(
                  (g.reduce((s, p) => s + p[6], 0) /
                    Math.max(g.length, bucket / MINUTE)) *
                    1000,
                ) / 1000
              );
            return vals.length
              ? Math.round(
                  (vals.reduce((a, b) => a + b, 0) / vals.length) * 100,
                ) / 100
              : null;
          }),
        ] as Point,
    );
}
export function anomaly(points: Point[]) {
  // Closed hourly averages: these describe observations, not every minute.
  const usable = points.filter(
    (p) => p[6] >= 0.9 && p[1] != null && p[2] != null,
  );
  const signals: {
    code: string;
    reason: string;
    hours: number;
    samples: number;
    confidence: string;
    caveat: string;
  }[] = [];
  const caveat =
    "Lurkers, intégration, format, promotion et langue peuvent expliquer ces écarts. Aucune identité de viewer silencieux ni proportion de bots ne peut être déduite.";
  const low = usable.filter((p) => p[1]! >= 30 && p[2]! <= 1);
  if (low.length >= 2)
    signals.push({
      code: "low_chat",
      reason:
        "Au moins deux heures couvertes avec ≥ 30 viewers déclarés moyens et ≤ 1 compte actif moyen par fenêtre de 15 min.",
      hours: low.length,
      samples: usable.length,
      confidence: "descriptive",
      caveat,
    });
  const jumps = usable.filter(
    (p, i) =>
      i > 0 &&
      p[0] - usable[i - 1][0] === HOUR &&
      p[1]! - usable[i - 1][1]! >= 30 &&
      p[1]! >= 2 * Math.max(1, usable[i - 1][1]!) &&
      Math.abs(p[2]! - usable[i - 1][2]!) <= 2,
  );
  if (jumps.length)
    signals.push({
      code: "viewer_step",
      reason:
        "D’une heure couverte à la suivante : viewers moyens au moins doublés (+30 minimum), variation des actifs moyens /15 min ≤ 2. Résolution horaire, pas une marche instantanée prouvée.",
      hours: jumps.length,
      samples: usable.length,
      confidence: "descriptive",
      caveat,
    });
  let plateau = 0;
  for (let i = 0; i <= usable.length - 6; i++) {
    const g = usable.slice(i, i + 6);
    if (g.some((p, j) => p[0] !== g[0][0] + j * HOUR || p[1]! < 30)) continue;
    const avg = g.reduce((s, p) => s + p[1]!, 0) / 6,
      spread =
        Math.max(...g.map((p) => p[1]!)) - Math.min(...g.map((p) => p[1]!));
    if (spread / avg <= 0.02) plateau++;
  }
  if (plateau)
    signals.push({
      code: "stable_viewers",
      reason:
        "Au moins six heures consécutives couvertes : viewers moyens ≥ 30, amplitude ≤ 2 % de leur moyenne. Un compteur stable peut être normal.",
      hours: 6,
      samples: usable.length,
      confidence: "descriptive",
      caveat,
    });
  return signals;
}

export function firstObservedReport(points:Point[],startedAt:number,now:number){
  if(now-startedAt<48*HOUR)return null;
  const observed=points.filter(p=>p[0]+HOUR>startedAt&&p[0]+HOUR<=now).sort((a,b)=>a[0]-b[0]);
  const rank=(duration:number,period:'morning'|'evening')=>{
    const candidates:{start:number;end:number;demand:number;competition:number;coverage:number;score:number}[]=[];
    for(let i=0;i<=observed.length-duration;i++){
      const group=observed.slice(i,i+duration),first=paris(group[0][0]),last=paris(group.at(-1)![0]);
      if(first.date!==last.date||group.some((p,j)=>p[0]!==group[0][0]+j*HOUR||p[6]<.9||p[2]==null||p[7]<1))continue;
      if(period==='morning'?(first.hour<6||last.hour>=12):(first.hour<16||last.hour>23))continue;
      const demand=group.reduce((s,p)=>s+p[2]!,0)/duration,competition=group.reduce((s,p)=>s+p[7],0)/duration;if(demand<=0)continue;
      candidates.push({start:group[0][0],end:group.at(-1)![0]+HOUR,demand,competition,coverage:group.reduce((s,p)=>s+p[6],0)/duration,score:demand/(1+competition)});
    }
    return candidates.sort((a,b)=>b.score-a.score)[0]??null;
  };
  const windows=[2,3,4].map(duration=>({duration,morning:rank(duration,'morning'),evening:rank(duration,'evening')}));
  return {createdAt:now,periodStart:startedAt,periodEnd:now,language:'fr' as const,status:windows.some(w=>w.morning)&&windows.some(w=>w.evening)?'observed_windows' as const:'insufficient_coverage' as const,coveredHours:observed.filter(p=>p[6]>=.9&&p[2]!=null&&p[7]>0).length,totalHours:observed.length,windows};
}
