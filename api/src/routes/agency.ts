import { randomBytes } from "crypto";
import { Router } from "express";
import type { PoolClient } from "pg";
import { z } from "zod";
import { hashPassword, requireAuth } from "../auth.js";
import { pool } from "../db.js";
import { a } from "../utils/async.js";
import { requireFsbAccess } from "./fsb_guard.js";

const textOrNull = (max: number) =>
  z.preprocess((value) => {
    if (value == null) return null;
    const text = String(value).trim();
    return text ? text : null;
  }, z.string().max(max).nullable());

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
const monthKeyPattern = /^\d{4}-\d{2}$/;

const dateOnlyOrNull = z.preprocess((value) => {
  if (value == null || value === "") return null;
  return String(value).trim();
}, z.string().regex(dateOnlyPattern).nullable());

const intOrNull = z.preprocess((value) => {
  if (value == null || value === "") return null;
  const next = Number(value);
  return Number.isFinite(next) ? Math.trunc(next) : value;
}, z.number().int().min(0).nullable());

const moneyOrNull = z.preprocess((value) => {
  if (value == null || value === "") return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : value;
}, z.number().min(0).max(1_000_000).nullable());

const percentOrNull = z.preprocess((value) => {
  if (value == null || value === "") return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : value;
}, z.number().min(0).max(100).nullable());

const nullablePositiveInt = z.preprocess((value) => {
  if (value == null || value === "") return null;
  const next = Number(value);
  return Number.isFinite(next) ? Math.trunc(next) : value;
}, z.number().int().positive().nullable());

const idParamSchema = z.coerce.number().int().positive();

const casinoInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  notes: textOrNull(4000).optional().default(null),
});

const dealInputSchema = z
  .object({
    casinoId: z.coerce.number().int().positive(),
    name: z.string().trim().min(1).max(160),
    cpaAmount: moneyOrNull.optional().default(null),
    cpaAgencyCut: moneyOrNull.optional().default(null),
    ersPercent: percentOrNull.optional().default(null),
    ersAgencyPercent: percentOrNull.optional().default(null),
    notes: textOrNull(4000).optional().default(null),
  })
  .superRefine((value, ctx) => {
    if (
      value.cpaAmount != null &&
      value.cpaAgencyCut != null &&
      value.cpaAgencyCut > value.cpaAmount
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cpaAgencyCut"],
        message: "agency_cut_gt_cpa",
      });
    }
    if (
      value.ersPercent != null &&
      value.ersAgencyPercent != null &&
      value.ersAgencyPercent > value.ersPercent
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ersAgencyPercent"],
        message: "agency_cut_gt_ers",
      });
    }
  });

const agencyStreamerUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(160),
  linkedStreamerId: nullablePositiveInt.optional().default(null),
  notes: textOrNull(4000).optional().default(null),
});

const agencyStreamerCreateSchema = agencyStreamerUpdateSchema
  .extend({
    initialDealId: nullablePositiveInt.optional().default(null),
    initialStartDate: dateOnlyOrNull.optional().default(null),
    initialEndDate: dateOnlyOrNull.optional().default(null),
    initialLinksText: textOrNull(4000).optional().default(null),
    initialAssignmentNotes: textOrNull(4000).optional().default(null),
  })
  .superRefine((value, ctx) => {
    if (!value.initialDealId) {
      if (value.initialStartDate || value.initialEndDate || value.initialLinksText || value.initialAssignmentNotes) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["initialDealId"],
          message: "initial_deal_required",
        });
      }
      return;
    }

    const startDate = value.initialStartDate || currentParisDateKey();
    if (value.initialEndDate && value.initialEndDate < startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["initialEndDate"],
        message: "end_before_start",
      });
    }
  });

const assignmentBaseSchema = z
  .object({
    dealId: z.coerce.number().int().positive(),
    startDate: dateOnlyOrNull.optional().default(null),
    endDate: dateOnlyOrNull.optional().default(null),
    linksText: textOrNull(4000).optional().default(null),
    notes: textOrNull(4000).optional().default(null),
  })
  .superRefine((value, ctx) => {
    const startDate = value.startDate || currentParisDateKey();
    if (value.endDate && value.endDate < startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "end_before_start",
      });
    }
  });

const assignmentCreateSchema = assignmentBaseSchema.safeExtend({
  agencyStreamerId: z.coerce.number().int().positive(),
});

const statsInputSchema = z.object({
  monthKey: z.preprocess((value) => String(value == null ? "" : value).trim(), z.string().regex(monthKeyPattern)),
  signups: intOrNull.optional().default(null),
  ftd: intOrNull.optional().default(null),
  totalDeposits: moneyOrNull.optional().default(null),
});

function currentParisDateKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function currentParisMonthKey() {
  return currentParisDateKey().slice(0, 7);
}

function normalizeMonthKey(value: unknown) {
  const text = String(value == null ? "" : value).trim();
  if (!text) return currentParisMonthKey();
  if (!monthKeyPattern.test(text)) throw new Error("bad_month");
  return text;
}

function readMonthKey(req: any) {
  try {
    return normalizeMonthKey(req?.query?.month);
  } catch {
    return currentParisMonthKey();
  }
}

function monthStartDate(monthKey: string) {
  return `${monthKey}-01`;
}

function monthEndDate(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${monthKey}-${String(lastDay).padStart(2, "0")}`;
}

function overlapsMonth(startDate: string | null, endDate: string | null, monthKey: string) {
  const effectiveStart = startDate || monthStartDate(monthKey);
  const effectiveEnd = endDate || "9999-12-31";
  return effectiveStart <= monthEndDate(monthKey) && effectiveEnd >= monthStartDate(monthKey);
}

function toIso(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toDateOnly(value: unknown) {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function roundMoney(value: number | null) {
  if (value == null) return null;
  return Math.round(value * 100) / 100;
}

function computeAgencyPayouts(input: {
  ftd?: number | null;
  totalDeposits?: number | null;
  cpaAmount?: number | null;
  cpaAgencyCut?: number | null;
  ersPercent?: number | null;
  ersAgencyPercent?: number | null;
}) {
  const ftd = Number(input.ftd || 0);
  const totalDeposits = Number(input.totalDeposits || 0);
  const cpaAmount = Number(input.cpaAmount || 0);
  const cpaAgencyCut = Number(input.cpaAgencyCut || 0);
  const ersPercent = Number(input.ersPercent || 0);
  const ersAgencyPercent = Number(input.ersAgencyPercent || 0);

  const streamerCpaUnit = Math.max(cpaAmount - cpaAgencyCut, 0);
  const streamerCpa = roundMoney(ftd * streamerCpaUnit) || 0;
  const agencyCpa = roundMoney(ftd * cpaAgencyCut) || 0;

  const streamerErsRate = Math.max(ersPercent - ersAgencyPercent, 0);
  const streamerErs = roundMoney((totalDeposits * streamerErsRate) / 100) || 0;
  const agencyErs = roundMoney((totalDeposits * ersAgencyPercent) / 100) || 0;

  return {
    streamerCpaUnit: roundMoney(streamerCpaUnit),
    streamerErsRate: roundMoney(streamerErsRate),
    agencyCpaUnit: roundMoney(cpaAgencyCut),
    agencyErsRate: roundMoney(ersAgencyPercent),
    streamerCpa,
    agencyCpa,
    streamerErs,
    agencyErs,
    streamerTotal: roundMoney(streamerCpa + streamerErs) || 0,
    agencyTotal: roundMoney(agencyCpa + agencyErs) || 0,
  };
}

function sanitizeUsernameBase(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 12);
  return normalized || "agency";
}

function generateAccessPassword() {
  return randomBytes(12)
    .toString("base64url")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 12);
}

export const agencyRouter = Router();

async function createAgencyAccessUser(client: PoolClient, displayName: string, ip: string | undefined) {
  const base = sanitizeUsernameBase(displayName);

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const suffix = randomBytes(3).toString("hex");
    const username = `agency_${base}_${suffix}`;
    const email = `${username}@agency.lunalive.invalid`;
    const password = generateAccessPassword();
    const passwordHash = await hashPassword(password);

    try {
      const result = await client.query(
        `
        INSERT INTO users (
          username,
          email,
          email_verified,
          password_hash,
          role,
          rubis,
          created_ip,
          last_login_ip,
          last_login_at
        )
        VALUES ($1, $2, TRUE, $3, 'viewer', 0, $4, $4, NOW())
        RETURNING id, username
        `,
        [username, email, passwordHash, ip ?? null]
      );

      return {
        id: Number(result.rows[0].id),
        username: String(result.rows[0].username || username),
        password,
      };
    } catch (error: any) {
      if (String(error?.code || "") === "23505") continue;
      throw error;
    }
  }

  throw new Error("access_user_create_failed");
}

async function resetAgencyAccessPassword(client: PoolClient, userId: number) {
  const password = generateAccessPassword();
  const passwordHash = await hashPassword(password);

  const result = await client.query(
    `
    UPDATE users
    SET password_hash = $2, email_verified = TRUE
    WHERE id = $1
    RETURNING id, username
    `,
    [userId, passwordHash]
  );

  if (!result.rows[0]) throw new Error("access_user_not_found");

  return {
    id: Number(result.rows[0].id),
    username: String(result.rows[0].username || ""),
    password,
  };
}

async function getLinkedStreamer(streamerId: number | null) {
  if (!streamerId) return null;
  const result = await pool.query(
    `
    SELECT id, user_id, slug, display_name
    FROM streamers
    WHERE id = $1
    LIMIT 1
    `,
    [streamerId]
  );
  return result.rows[0] || null;
}

async function dealExists(dealId: number) {
  const result = await pool.query(`SELECT 1 FROM agency_deals WHERE id = $1 LIMIT 1`, [dealId]);
  return Boolean(result.rows[0]);
}

function buildDashboardQuery(monthKey: string, extraWhereSql = "", extraParams: unknown[] = []) {
  return {
    sql: `
      SELECT
        ags.id AS streamer_id,
        ags.display_name AS streamer_display_name,
        ags.linked_streamer_id,
        ags.lunalive_user_id,
        ags.access_user_id,
        ags.notes AS streamer_notes,
        ags.created_at AS streamer_created_at,
        ags.updated_at AS streamer_updated_at,
        s.slug AS linked_streamer_slug,
        s.display_name AS linked_streamer_name,
        access_u.username AS access_username,
        asa.id AS assignment_id,
        asa.deal_id,
        asa.start_date,
        asa.end_date,
        asa.links_text,
        asa.notes AS assignment_notes,
        asa.created_at AS assignment_created_at,
        asa.updated_at AS assignment_updated_at,
        d.name AS deal_name,
        d.casino_id,
        c.name AS casino_name,
        d.cpa_amount,
        d.cpa_agency_cut,
        d.ers_percent,
        d.ers_agency_percent,
        st.signups,
        st.ftd,
        st.total_deposits,
        st.created_at AS stat_created_at,
        st.updated_at AS stat_updated_at
      FROM agency_streamers ags
      LEFT JOIN streamers s
        ON s.id = ags.linked_streamer_id
      LEFT JOIN users access_u
        ON access_u.id = ags.access_user_id
      LEFT JOIN agency_streamer_assignments asa
        ON asa.agency_streamer_id = ags.id
      LEFT JOIN agency_deals d
        ON d.id = asa.deal_id
      LEFT JOIN agency_casinos c
        ON c.id = d.casino_id
      LEFT JOIN agency_streamer_assignment_stats st
        ON st.assignment_id = asa.id
       AND st.month_key = $1::date
      ${extraWhereSql}
      ORDER BY lower(ags.display_name) ASC, asa.start_date DESC NULLS LAST, asa.id DESC
    `,
    params: [monthStartDate(monthKey), ...extraParams],
  };
}

function mapDashboardRows(rows: any[], monthKey: string) {
  const streamersMap = new Map<number, any>();

  for (const row of rows) {
    const streamerId = Number(row.streamer_id);
    if (!streamersMap.has(streamerId)) {
      streamersMap.set(streamerId, {
        id: streamerId,
        displayName: String(row.streamer_display_name || ""),
        linkedStreamerId: row.linked_streamer_id == null ? null : Number(row.linked_streamer_id),
        linkedStreamerSlug: row.linked_streamer_slug == null ? null : String(row.linked_streamer_slug),
        linkedStreamerName: row.linked_streamer_name == null ? null : String(row.linked_streamer_name),
        lunaliveUserId: row.lunalive_user_id == null ? null : Number(row.lunalive_user_id),
        accessUserId: row.access_user_id == null ? null : Number(row.access_user_id),
        accessUsername: row.access_username == null ? null : String(row.access_username),
        notes: row.streamer_notes == null ? null : String(row.streamer_notes),
        createdAt: toIso(row.streamer_created_at),
        updatedAt: toIso(row.streamer_updated_at),
        assignments: [],
      });
    }

    if (row.assignment_id == null) continue;

    const stats = {
      monthKey,
      signups: row.signups == null ? null : Number(row.signups),
      ftd: row.ftd == null ? null : Number(row.ftd),
      totalDeposits: row.total_deposits == null ? null : Number(row.total_deposits),
      createdAt: toIso(row.stat_created_at),
      updatedAt: toIso(row.stat_updated_at),
    };

    const deal = {
      id: Number(row.deal_id),
      name: String(row.deal_name || ""),
      casinoId: Number(row.casino_id),
      casinoName: String(row.casino_name || ""),
      cpaAmount: row.cpa_amount == null ? null : Number(row.cpa_amount),
      cpaAgencyCut: row.cpa_agency_cut == null ? null : Number(row.cpa_agency_cut),
      ersPercent: row.ers_percent == null ? null : Number(row.ers_percent),
      ersAgencyPercent: row.ers_agency_percent == null ? null : Number(row.ers_agency_percent),
    };

    const assignment = {
      id: Number(row.assignment_id),
      agencyStreamerId: streamerId,
      dealId: deal.id,
      streamerDisplayName: String(row.streamer_display_name || ""),
      startDate: toDateOnly(row.start_date),
      endDate: toDateOnly(row.end_date),
      linksText: row.links_text == null ? null : String(row.links_text),
      notes: row.assignment_notes == null ? null : String(row.assignment_notes),
      createdAt: toIso(row.assignment_created_at),
      updatedAt: toIso(row.assignment_updated_at),
      activeDuringMonth: overlapsMonth(toDateOnly(row.start_date), toDateOnly(row.end_date), monthKey),
      stats,
      deal,
      payouts: computeAgencyPayouts({
        ftd: stats.ftd,
        totalDeposits: stats.totalDeposits,
        cpaAmount: deal.cpaAmount,
        cpaAgencyCut: deal.cpaAgencyCut,
        ersPercent: deal.ersPercent,
        ersAgencyPercent: deal.ersAgencyPercent,
      }),
    };

    streamersMap.get(streamerId).assignments.push(assignment);
  }

  const streamers = Array.from(streamersMap.values());
  const assignments = streamers.flatMap((streamer) =>
    streamer.assignments.map((assignment: any) => ({
      ...assignment,
      linkedStreamerId: streamer.linkedStreamerId,
      linkedStreamerSlug: streamer.linkedStreamerSlug,
      linkedStreamerName: streamer.linkedStreamerName,
      accessUserId: streamer.accessUserId,
      accessUsername: streamer.accessUsername,
    }))
  );

  return { streamers, assignments };
}

async function getAgencyDashboardPayload(monthKey: string) {
  const dashboardQuery = buildDashboardQuery(monthKey);
  const [casinosResult, dealsResult, dashboardResult, availableStreamersResult, historyMonthsResult] = await Promise.all([
    pool.query(
      `
      SELECT id, name, notes, created_at, updated_at
      FROM agency_casinos
      ORDER BY lower(name) ASC, id ASC
      `
    ),
    pool.query(
      `
      SELECT
        d.id,
        d.casino_id,
        c.name AS casino_name,
        d.name,
        d.cpa_amount,
        d.cpa_agency_cut,
        d.ers_percent,
        d.ers_agency_percent,
        d.notes,
        d.created_at,
        d.updated_at
      FROM agency_deals d
      JOIN agency_casinos c
        ON c.id = d.casino_id
      ORDER BY lower(c.name) ASC, lower(d.name) ASC, d.id ASC
      `
    ),
    pool.query(dashboardQuery.sql, dashboardQuery.params),
    pool.query(
      `
      SELECT
        id AS streamer_id,
        user_id,
        slug,
        display_name
      FROM streamers
      WHERE user_id IS NOT NULL
      ORDER BY lower(display_name) ASC, id ASC
      `
    ),
    pool.query(
      `
      SELECT to_char(month_key, 'YYYY-MM') AS month_key
      FROM agency_streamer_assignment_stats
      GROUP BY month_key
      ORDER BY month_key DESC
      `
    ),
  ]);

  const casinos = casinosResult.rows.map((row) => ({
    id: Number(row.id),
    name: String(row.name || ""),
    notes: row.notes == null ? null : String(row.notes),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }));

  const deals = dealsResult.rows.map((row) => ({
    id: Number(row.id),
    casinoId: Number(row.casino_id),
    casinoName: String(row.casino_name || ""),
    name: String(row.name || ""),
    cpaAmount: row.cpa_amount == null ? null : Number(row.cpa_amount),
    cpaAgencyCut: row.cpa_agency_cut == null ? null : Number(row.cpa_agency_cut),
    ersPercent: row.ers_percent == null ? null : Number(row.ers_percent),
    ersAgencyPercent: row.ers_agency_percent == null ? null : Number(row.ers_agency_percent),
    notes: row.notes == null ? null : String(row.notes),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }));

  const { streamers, assignments } = mapDashboardRows(dashboardResult.rows, monthKey);

  const summary = assignments.reduce(
    (acc, assignment: any) => {
      acc.streamerEarnings += Number(assignment.payouts.streamerTotal || 0);
      acc.agencyEarnings += Number(assignment.payouts.agencyTotal || 0);
      if (assignment.activeDuringMonth) acc.activeAssignments += 1;
      return acc;
    },
    {
      casinos: casinos.length,
      deals: deals.length,
      streamers: streamers.length,
      assignments: assignments.length,
      activeAssignments: 0,
      streamerEarnings: 0,
      agencyEarnings: 0,
    }
  );

  const historyMonths = Array.from(
    new Set([monthKey, ...historyMonthsResult.rows.map((row) => String(row.month_key || ""))].filter(Boolean))
  ).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));

  return {
    monthKey,
    historyMonths,
    casinos,
    deals,
    streamers,
    assignments,
    availableStreamers: availableStreamersResult.rows.map((row) => ({
      streamerId: Number(row.streamer_id),
      userId: row.user_id == null ? null : Number(row.user_id),
      slug: String(row.slug || ""),
      displayName: String(row.display_name || ""),
    })),
    summary: {
      ...summary,
      streamerEarnings: roundMoney(summary.streamerEarnings) || 0,
      agencyEarnings: roundMoney(summary.agencyEarnings) || 0,
    },
  };
}

async function getAgencyStreamerForUser(userId: number, monthKey: string) {
  const query = buildDashboardQuery(monthKey, "WHERE ags.access_user_id = $2 OR ags.lunalive_user_id = $2", [userId]);
  const result = await pool.query(query.sql, query.params);
  if (!result.rows[0]) return null;

  const { streamers } = mapDashboardRows(result.rows, monthKey);
  const streamer = streamers[0];
  if (!streamer) return null;

  const summary = streamer.assignments.reduce(
    (acc: any, assignment: any) => {
      acc.signups += Number(assignment.stats.signups || 0);
      acc.ftd += Number(assignment.stats.ftd || 0);
      acc.totalDeposits += Number(assignment.stats.totalDeposits || 0);
      acc.cpa += Number(assignment.payouts.streamerCpa || 0);
      acc.ers += Number(assignment.payouts.streamerErs || 0);
      acc.total += Number(assignment.payouts.streamerTotal || 0);
      return acc;
    },
    {
      signups: 0,
      ftd: 0,
      totalDeposits: 0,
      cpa: 0,
      ers: 0,
      total: 0,
    }
  );

  const historyMonthsResult = await pool.query(
    `
    SELECT to_char(st.month_key, 'YYYY-MM') AS month_key
    FROM agency_streamer_assignment_stats st
    JOIN agency_streamer_assignments asa
      ON asa.id = st.assignment_id
    WHERE asa.agency_streamer_id = $1
    GROUP BY st.month_key
    ORDER BY st.month_key DESC
    `,
    [streamer.id]
  );

  const historyMonths = Array.from(
    new Set([monthKey, ...historyMonthsResult.rows.map((row) => String(row.month_key || ""))].filter(Boolean))
  ).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));

  return {
    monthKey,
    historyMonths,
    streamer,
    summary: {
      signups: summary.signups,
      ftd: summary.ftd,
      totalDeposits: roundMoney(summary.totalDeposits) || 0,
      cpa: roundMoney(summary.cpa) || 0,
      ers: roundMoney(summary.ers) || 0,
      total: roundMoney(summary.total) || 0,
    },
    updatedAt:
      streamer.assignments
        .map((assignment: any) => assignment.stats.updatedAt || assignment.updatedAt)
        .filter(Boolean)
        .sort()
        .at(-1) || streamer.updatedAt,
  };
}

function isForeignKeyError(error: any) {
  return String(error?.code || "") === "23503";
}

function isNotNullStats(payload: z.infer<typeof statsInputSchema>) {
  return payload.signups != null || payload.ftd != null || payload.totalDeposits != null;
}

agencyRouter.use("/fsb/agency", requireAuth, requireFsbAccess);

agencyRouter.get(
  "/fsb/agency",
  a(async (req, res) => {
    const payload = await getAgencyDashboardPayload(readMonthKey(req));
    return res.json({ ok: true, ...payload });
  })
);

agencyRouter.post(
  "/fsb/agency/casinos",
  a(async (req, res) => {
    const parsed = casinoInputSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.issues[0]?.message || "invalid_payload" });
    }

    try {
      await pool.query(
        `
        INSERT INTO agency_casinos (name, notes)
        VALUES ($1, $2)
        `,
        [parsed.data.name.trim(), parsed.data.notes]
      );
    } catch (error: any) {
      if (String(error?.message || "").includes("agency_casinos_name_uq")) {
        return res.status(409).json({ ok: false, error: "casino_exists" });
      }
      throw error;
    }

    const payload = await getAgencyDashboardPayload(readMonthKey(req));
    return res.status(201).json({ ok: true, ...payload });
  })
);

agencyRouter.put(
  "/fsb/agency/casinos/:id",
  a(async (req, res) => {
    const id = idParamSchema.safeParse((req as any).params?.id);
    if (!id.success) return res.status(400).json({ ok: false, error: "bad_id" });

    const parsed = casinoInputSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.issues[0]?.message || "invalid_payload" });
    }

    const result = await pool.query(
      `
      UPDATE agency_casinos
      SET name = $2, notes = $3, updated_at = NOW()
      WHERE id = $1
      RETURNING id
      `,
      [id.data, parsed.data.name.trim(), parsed.data.notes]
    );

    if (!result.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });

    const payload = await getAgencyDashboardPayload(readMonthKey(req));
    return res.json({ ok: true, ...payload });
  })
);

agencyRouter.delete(
  "/fsb/agency/casinos/:id",
  a(async (req, res) => {
    const id = idParamSchema.safeParse((req as any).params?.id);
    if (!id.success) return res.status(400).json({ ok: false, error: "bad_id" });

    try {
      const result = await pool.query(`DELETE FROM agency_casinos WHERE id = $1 RETURNING id`, [id.data]);
      if (!result.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
    } catch (error: any) {
      if (isForeignKeyError(error)) {
        return res.status(409).json({ ok: false, error: "casino_in_use" });
      }
      throw error;
    }

    const payload = await getAgencyDashboardPayload(readMonthKey(req));
    return res.json({ ok: true, ...payload });
  })
);

agencyRouter.post(
  "/fsb/agency/deals",
  a(async (req, res) => {
    const parsed = dealInputSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.issues[0]?.message || "invalid_payload" });
    }

    const payload = parsed.data;
    const casinoExists = await pool.query(`SELECT 1 FROM agency_casinos WHERE id = $1 LIMIT 1`, [payload.casinoId]);
    if (!casinoExists.rows[0]) return res.status(400).json({ ok: false, error: "casino_not_found" });

    try {
      await pool.query(
        `
        INSERT INTO agency_deals (
          casino_id, name, cpa_amount, cpa_agency_cut, ers_percent, ers_agency_percent, notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          payload.casinoId,
          payload.name.trim(),
          payload.cpaAmount == null ? null : roundMoney(payload.cpaAmount),
          payload.cpaAgencyCut == null ? null : roundMoney(payload.cpaAgencyCut),
          payload.ersPercent == null ? null : roundMoney(payload.ersPercent),
          payload.ersAgencyPercent == null ? null : roundMoney(payload.ersAgencyPercent),
          payload.notes,
        ]
      );
    } catch (error: any) {
      if (String(error?.message || "").includes("agency_deals_casino_name_uq")) {
        return res.status(409).json({ ok: false, error: "deal_exists" });
      }
      throw error;
    }

    const dashboard = await getAgencyDashboardPayload(readMonthKey(req));
    return res.status(201).json({ ok: true, ...dashboard });
  })
);

agencyRouter.put(
  "/fsb/agency/deals/:id",
  a(async (req, res) => {
    const id = idParamSchema.safeParse((req as any).params?.id);
    if (!id.success) return res.status(400).json({ ok: false, error: "bad_id" });

    const parsed = dealInputSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.issues[0]?.message || "invalid_payload" });
    }

    const payload = parsed.data;
    const casinoExists = await pool.query(`SELECT 1 FROM agency_casinos WHERE id = $1 LIMIT 1`, [payload.casinoId]);
    if (!casinoExists.rows[0]) return res.status(400).json({ ok: false, error: "casino_not_found" });

    const result = await pool.query(
      `
      UPDATE agency_deals
      SET
        casino_id = $2,
        name = $3,
        cpa_amount = $4,
        cpa_agency_cut = $5,
        ers_percent = $6,
        ers_agency_percent = $7,
        notes = $8,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id
      `,
      [
        id.data,
        payload.casinoId,
        payload.name.trim(),
        payload.cpaAmount == null ? null : roundMoney(payload.cpaAmount),
        payload.cpaAgencyCut == null ? null : roundMoney(payload.cpaAgencyCut),
        payload.ersPercent == null ? null : roundMoney(payload.ersPercent),
        payload.ersAgencyPercent == null ? null : roundMoney(payload.ersAgencyPercent),
        payload.notes,
      ]
    );

    if (!result.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });

    const dashboard = await getAgencyDashboardPayload(readMonthKey(req));
    return res.json({ ok: true, ...dashboard });
  })
);

agencyRouter.delete(
  "/fsb/agency/deals/:id",
  a(async (req, res) => {
    const id = idParamSchema.safeParse((req as any).params?.id);
    if (!id.success) return res.status(400).json({ ok: false, error: "bad_id" });

    try {
      const result = await pool.query(`DELETE FROM agency_deals WHERE id = $1 RETURNING id`, [id.data]);
      if (!result.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
    } catch (error: any) {
      if (isForeignKeyError(error)) {
        return res.status(409).json({ ok: false, error: "deal_in_use" });
      }
      throw error;
    }

    const payload = await getAgencyDashboardPayload(readMonthKey(req));
    return res.json({ ok: true, ...payload });
  })
);

agencyRouter.post(
  "/fsb/agency/streamers",
  a(async (req, res) => {
    const parsed = agencyStreamerCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.issues[0]?.message || "invalid_payload" });
    }

    const payload = parsed.data;
    const linked = await getLinkedStreamer(payload.linkedStreamerId);
    if (payload.linkedStreamerId && !linked) {
      return res.status(400).json({ ok: false, error: "linked_streamer_not_found" });
    }

    if (payload.initialDealId && !(await dealExists(payload.initialDealId))) {
      return res.status(400).json({ ok: false, error: "deal_not_found" });
    }

    const client = await pool.connect();
    let generatedAccess: { id: number; username: string; password: string } | null = null;

    try {
      await client.query("BEGIN");
      generatedAccess = await createAgencyAccessUser(client, payload.displayName, req.ip);

      const insertResult = await client.query(
        `
        INSERT INTO agency_streamers (
          display_name,
          linked_streamer_id,
          lunalive_user_id,
          access_user_id,
          notes
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
        `,
        [
          payload.displayName.trim(),
          linked?.id ?? null,
          linked?.user_id ?? null,
          generatedAccess.id,
          payload.notes,
        ]
      );

      const agencyStreamerId = Number(insertResult.rows[0].id);

      if (payload.initialDealId) {
        await client.query(
          `
          INSERT INTO agency_streamer_assignments (
            agency_streamer_id,
            deal_id,
            start_date,
            end_date,
            links_text,
            notes
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [
            agencyStreamerId,
            payload.initialDealId,
            payload.initialStartDate || currentParisDateKey(),
            payload.initialEndDate,
            payload.initialLinksText,
            payload.initialAssignmentNotes,
          ]
        );
      }

      await client.query("COMMIT");
    } catch (error: any) {
      await client.query("ROLLBACK");
      const message = String(error?.message || "");
      if (message.includes("agency_streamers_linked_streamer_uq")) {
        return res.status(409).json({ ok: false, error: "streamer_already_linked" });
      }
      if (message.includes("agency_streamers_user_uq")) {
        return res.status(409).json({ ok: false, error: "user_already_linked" });
      }
      if (message.includes("agency_streamer_assignments_unique_span_uq")) {
        return res.status(409).json({ ok: false, error: "assignment_exists" });
      }
      throw error;
    } finally {
      client.release();
    }

    const dashboard = await getAgencyDashboardPayload(readMonthKey(req));
    return res.status(201).json({
      ok: true,
      ...dashboard,
      generatedAccess: generatedAccess
        ? {
            username: generatedAccess.username,
            password: generatedAccess.password,
            loginPath: "/agency",
          }
        : null,
    });
  })
);

agencyRouter.put(
  "/fsb/agency/streamers/:id",
  a(async (req, res) => {
    const id = idParamSchema.safeParse((req as any).params?.id);
    if (!id.success) return res.status(400).json({ ok: false, error: "bad_id" });

    const parsed = agencyStreamerUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.issues[0]?.message || "invalid_payload" });
    }

    const payload = parsed.data;
    const linked = await getLinkedStreamer(payload.linkedStreamerId);
    if (payload.linkedStreamerId && !linked) {
      return res.status(400).json({ ok: false, error: "linked_streamer_not_found" });
    }

    try {
      const result = await pool.query(
        `
        UPDATE agency_streamers
        SET
          display_name = $2,
          linked_streamer_id = $3,
          lunalive_user_id = $4,
          notes = $5,
          updated_at = NOW()
        WHERE id = $1
        RETURNING id
        `,
        [id.data, payload.displayName.trim(), linked?.id ?? null, linked?.user_id ?? null, payload.notes]
      );

      if (!result.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
    } catch (error: any) {
      const message = String(error?.message || "");
      if (message.includes("agency_streamers_linked_streamer_uq")) {
        return res.status(409).json({ ok: false, error: "streamer_already_linked" });
      }
      if (message.includes("agency_streamers_user_uq")) {
        return res.status(409).json({ ok: false, error: "user_already_linked" });
      }
      throw error;
    }

    const dashboard = await getAgencyDashboardPayload(readMonthKey(req));
    return res.json({ ok: true, ...dashboard });
  })
);

agencyRouter.delete(
  "/fsb/agency/streamers/:id",
  a(async (req, res) => {
    const id = idParamSchema.safeParse((req as any).params?.id);
    if (!id.success) return res.status(400).json({ ok: false, error: "bad_id" });

    const result = await pool.query(`DELETE FROM agency_streamers WHERE id = $1 RETURNING id`, [id.data]);
    if (!result.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });

    const dashboard = await getAgencyDashboardPayload(readMonthKey(req));
    return res.json({ ok: true, ...dashboard });
  })
);

agencyRouter.post(
  "/fsb/agency/streamers/:id/reset-access",
  a(async (req, res) => {
    const id = idParamSchema.safeParse((req as any).params?.id);
    if (!id.success) return res.status(400).json({ ok: false, error: "bad_id" });

    const client = await pool.connect();
    let generatedAccess: { id: number; username: string; password: string } | null = null;

    try {
      await client.query("BEGIN");

      const streamerResult = await client.query(
        `
        SELECT id, display_name, access_user_id
        FROM agency_streamers
        WHERE id = $1
        LIMIT 1
        `,
        [id.data]
      );

      const streamer = streamerResult.rows[0];
      if (!streamer) {
        await client.query("ROLLBACK");
        return res.status(404).json({ ok: false, error: "not_found" });
      }

      if (streamer.access_user_id == null) {
        generatedAccess = await createAgencyAccessUser(client, String(streamer.display_name || ""), req.ip);
        await client.query(
          `
          UPDATE agency_streamers
          SET access_user_id = $2, updated_at = NOW()
          WHERE id = $1
          `,
          [id.data, generatedAccess.id]
        );
      } else {
        generatedAccess = await resetAgencyAccessPassword(client, Number(streamer.access_user_id));
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const dashboard = await getAgencyDashboardPayload(readMonthKey(req));
    return res.json({
      ok: true,
      ...dashboard,
      generatedAccess: generatedAccess
        ? {
            username: generatedAccess.username,
            password: generatedAccess.password,
            loginPath: "/agency",
          }
        : null,
    });
  })
);

agencyRouter.post(
  "/fsb/agency/assignments",
  a(async (req, res) => {
    const parsed = assignmentCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.issues[0]?.message || "invalid_payload" });
    }

    const payload = parsed.data;
    const [streamerExists, dealOk] = await Promise.all([
      pool.query(`SELECT 1 FROM agency_streamers WHERE id = $1 LIMIT 1`, [payload.agencyStreamerId]),
      dealExists(payload.dealId),
    ]);

    if (!streamerExists.rows[0]) return res.status(404).json({ ok: false, error: "streamer_not_found" });
    if (!dealOk) return res.status(400).json({ ok: false, error: "deal_not_found" });

    try {
      await pool.query(
        `
        INSERT INTO agency_streamer_assignments (
          agency_streamer_id,
          deal_id,
          start_date,
          end_date,
          links_text,
          notes
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          payload.agencyStreamerId,
          payload.dealId,
          payload.startDate || currentParisDateKey(),
          payload.endDate,
          payload.linksText,
          payload.notes,
        ]
      );
    } catch (error: any) {
      if (String(error?.message || "").includes("agency_streamer_assignments_unique_span_uq")) {
        return res.status(409).json({ ok: false, error: "assignment_exists" });
      }
      throw error;
    }

    const dashboard = await getAgencyDashboardPayload(readMonthKey(req));
    return res.status(201).json({ ok: true, ...dashboard });
  })
);

agencyRouter.put(
  "/fsb/agency/assignments/:id",
  a(async (req, res) => {
    const id = idParamSchema.safeParse((req as any).params?.id);
    if (!id.success) return res.status(400).json({ ok: false, error: "bad_id" });

    const parsed = assignmentBaseSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.issues[0]?.message || "invalid_payload" });
    }

    const payload = parsed.data;
    if (!(await dealExists(payload.dealId))) {
      return res.status(400).json({ ok: false, error: "deal_not_found" });
    }

    try {
      const result = await pool.query(
        `
        UPDATE agency_streamer_assignments
        SET
          deal_id = $2,
          start_date = $3,
          end_date = $4,
          links_text = $5,
          notes = $6,
          updated_at = NOW()
        WHERE id = $1
        RETURNING id
        `,
        [
          id.data,
          payload.dealId,
          payload.startDate || currentParisDateKey(),
          payload.endDate,
          payload.linksText,
          payload.notes,
        ]
      );

      if (!result.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });
    } catch (error: any) {
      if (String(error?.message || "").includes("agency_streamer_assignments_unique_span_uq")) {
        return res.status(409).json({ ok: false, error: "assignment_exists" });
      }
      throw error;
    }

    const dashboard = await getAgencyDashboardPayload(readMonthKey(req));
    return res.json({ ok: true, ...dashboard });
  })
);

agencyRouter.delete(
  "/fsb/agency/assignments/:id",
  a(async (req, res) => {
    const id = idParamSchema.safeParse((req as any).params?.id);
    if (!id.success) return res.status(400).json({ ok: false, error: "bad_id" });

    const result = await pool.query(`DELETE FROM agency_streamer_assignments WHERE id = $1 RETURNING id`, [id.data]);
    if (!result.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });

    const dashboard = await getAgencyDashboardPayload(readMonthKey(req));
    return res.json({ ok: true, ...dashboard });
  })
);

agencyRouter.put(
  "/fsb/agency/assignments/:id/stats",
  a(async (req, res) => {
    const id = idParamSchema.safeParse((req as any).params?.id);
    if (!id.success) return res.status(400).json({ ok: false, error: "bad_id" });

    const parsed = statsInputSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: parsed.error.issues[0]?.message || "invalid_payload" });
    }

    const assignmentExists = await pool.query(
      `SELECT 1 FROM agency_streamer_assignments WHERE id = $1 LIMIT 1`,
      [id.data]
    );
    if (!assignmentExists.rows[0]) return res.status(404).json({ ok: false, error: "not_found" });

    if (!isNotNullStats(parsed.data)) {
      await pool.query(
        `
        DELETE FROM agency_streamer_assignment_stats
        WHERE assignment_id = $1
          AND month_key = $2::date
        `,
        [id.data, monthStartDate(parsed.data.monthKey)]
      );
    } else {
      await pool.query(
        `
        INSERT INTO agency_streamer_assignment_stats (
          assignment_id,
          month_key,
          signups,
          ftd,
          total_deposits
        )
        VALUES ($1, $2::date, $3, $4, $5)
        ON CONFLICT (assignment_id, month_key)
        DO UPDATE SET
          signups = EXCLUDED.signups,
          ftd = EXCLUDED.ftd,
          total_deposits = EXCLUDED.total_deposits,
          updated_at = NOW()
        `,
        [
          id.data,
          monthStartDate(parsed.data.monthKey),
          parsed.data.signups,
          parsed.data.ftd,
          parsed.data.totalDeposits == null ? null : roundMoney(parsed.data.totalDeposits),
        ]
      );
    }

    const dashboard = await getAgencyDashboardPayload(readMonthKey(req));
    return res.json({ ok: true, ...dashboard });
  })
);

agencyRouter.get(
  "/agency/me",
  requireAuth,
  a(async (req, res) => {
    const monthKey = readMonthKey(req);
    const agency = await getAgencyStreamerForUser(req.user!.id, monthKey);
    if (!agency) return res.json({ ok: true, monthKey, agency: null });

    return res.json({
      ok: true,
      monthKey,
      agency: {
        streamer: {
          id: agency.streamer.id,
          displayName: agency.streamer.displayName,
          linkedStreamerSlug: agency.streamer.linkedStreamerSlug,
          linkedStreamerName: agency.streamer.linkedStreamerName,
          accessUsername: agency.streamer.accessUsername,
        },
        assignments: agency.streamer.assignments.map((assignment: any) => ({
          id: assignment.id,
          startDate: assignment.startDate,
          endDate: assignment.endDate,
          linksText: assignment.linksText,
          notes: assignment.notes,
          activeDuringMonth: assignment.activeDuringMonth,
          casino: {
            id: assignment.deal.casinoId,
            name: assignment.deal.casinoName,
          },
          deal: {
            id: assignment.dealId,
            name: assignment.deal.name,
            cpaPerFtdNet: assignment.payouts.streamerCpaUnit,
            ersPercentNet: assignment.payouts.streamerErsRate,
          },
          stats: assignment.stats,
          earnings: {
            cpa: assignment.payouts.streamerCpa,
            ers: assignment.payouts.streamerErs,
            total: assignment.payouts.streamerTotal,
          },
          updatedAt: assignment.stats.updatedAt || assignment.updatedAt,
        })),
        summary: agency.summary,
        historyMonths: agency.historyMonths,
        updatedAt: agency.updatedAt,
      },
    });
  })
);
