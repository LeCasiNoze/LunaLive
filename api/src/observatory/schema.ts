import { z } from "zod";
const count = z.number().finite().min(0).max(1e9);
const stamp = z.number().int().min(1700000000000).max(2200000000000);
const nullable = count.nullable();
export const pointSchema = z.tuple([
  stamp,
  nullable,
  nullable,
  nullable,
  nullable,
  nullable,
  z.number().min(0).max(1),
  count,
  nullable,
]);
const history = z.array(pointSchema).max(744);
const cohort = z
  .object({
    firstObserved: count,
    evening: count,
    j1: count,
    j3: count,
    matureEvening: count,
    matureJ1: count,
    matureJ3: count,
  })
  .strict();
const reportWindow=z.object({start:stamp,end:stamp,demand:count,competition:count,coverage:z.number().min(0).max(1),score:count}).strict();
const firstReportSchema=z.object({createdAt:stamp,periodStart:stamp,periodEnd:stamp,language:z.literal('fr'),status:z.enum(['observed_windows','insufficient_coverage']),coveredHours:count,totalHours:count,windows:z.array(z.object({duration:z.union([z.literal(2),z.literal(3),z.literal(4)]),morning:reportWindow.nullable(),evening:reportWindow.nullable()}).strict()).length(3)}).strict();

export const snapshotSchema = z
  .object({
    version: z.literal(1),
    firstReport:firstReportSchema.nullable().optional(),
    startedAt: stamp.nullable(),
    capturedAt: stamp,
    complete: z.boolean(),
    status: z.enum([
      "awaiting_collection",
      "collecting",
      "degraded",
      "paused_budget",
    ]),
    channels: z
      .array(
        z
          .object({
            slug: z.string().regex(/^[a-z0-9_-]{1,64}$/),
            name: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
            language: z.enum(["fr", "other", "unknown"]),
            languageConfidence: z.enum(["manual", "unknown"]),
            mode: z.enum(["personal", "automod", "unknown"]),
            firstSeen: stamp,
            lastSeen: stamp,
            sourceStart: z.string().datetime({ offset: true }).nullable(),
            latest: pointSchema,
            history,
            daily: history,
            sessions: z
              .array(
                z
                  .object({
                    video: z.string().regex(/^v[a-z0-9]{5,20}$/),
                    first: stamp,
                    last: stamp,
                    minuteSamples: count,
                    coveredSamples: count,
                    netDistinct8d: nullable,
                    messages8d: nullable,
                    conversation8d: nullable,
                    sourceStart: z
                      .string()
                      .datetime({ offset: true })
                      .nullable(),
                    mode: z.enum(["personal", "automod", "unknown"]),
                  })
                  .strict(),
              )
              .max(100),
          })
          .strict(),
      )
      .max(256),
    latest: z.object({ all: pointSchema, fr: pointSchema }).strict(),
    series: z.object({ all: history, fr: history }).strict(),
    daily: z.object({ all: history, fr: history }).strict(),
    cohorts: z
      .object({ personal: cohort, automod: cohort, unknown: cohort })
      .strict(),
    costs: z
      .object({
        day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        rumbleBytes: count,
        renderBytes: count,
        nivoraBytes: count,
        requests: count,
        reconnects: count,
        dbBytes: count,
        vpsDailyBudget: count,
        apiDailyBudget: count,
      })
      .strict(),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (
      (s.startedAt != null && s.capturedAt < s.startedAt) ||
      s.capturedAt > Date.now() + 60000
    )
      ctx.addIssue({ code: "custom", message: "snapshot_time" });
    if (new Set(s.channels.map((c) => c.slug)).size !== s.channels.length)
      ctx.addIssue({ code: "custom", message: "duplicate_channel" });
    for (const series of [
      s.series.all,
      s.series.fr,
      s.daily.all,
      s.daily.fr,
      ...s.channels.flatMap((c) => [c.history, c.daily, [c.latest]]),
    ]) {
      let last = 0;
      for (const p of series) {
        if (p[0] <= last || p[0] > s.capturedAt)
          ctx.addIssue({ code: "custom", message: "invalid_series_time" });
        last = p[0];
      }
    }
  });
export type Snapshot = z.infer<typeof snapshotSchema>;
