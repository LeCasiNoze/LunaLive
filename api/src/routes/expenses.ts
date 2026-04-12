import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { pool } from "../db.js";
import { a } from "../utils/async.js";
import { requireFsbAccess } from "./fsb_guard.js";

const expenseCategories = [
  "giveaway",
  "offres",
  "parrainage",
  "abonnement",
  "personnalise",
] as const;

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "invalid_date")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const utc = new Date(Date.UTC(year, month - 1, day));
    return (
      utc.getUTCFullYear() === year &&
      utc.getUTCMonth() === month - 1 &&
      utc.getUTCDate() === day
    );
  }, "invalid_date");

const monthKeySchema = z.string().regex(/^\d{4}-\d{2}$/, "invalid_month");

const nullableText = (max: number) =>
  z.preprocess((value) => {
    if (value == null) return null;
    const text = String(value).trim();
    return text ? text : null;
  }, z.string().max(max).nullable());

const nullableDate = z.preprocess((value) => {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}, isoDateSchema.nullable());

const boolInput = z.preprocess((value) => {
  if (value === true || value === "true" || value === 1 || value === "1" || value === "on") return true;
  if (value === false || value === "false" || value === 0 || value === "0" || value == null || value === "") {
    return false;
  }
  return value;
}, z.boolean());

const expenseInputSchema = z
  .object({
    description: z.string().trim().min(1).max(160),
    category: z.enum(expenseCategories),
    amount: z.coerce.number().positive().max(1_000_000),
    date: isoDateSchema,
    isRecurring: z.coerce.boolean(),
    recurrenceEndDate: nullableDate.optional().default(null),
    notes: nullableText(2_000).optional().default(null),
  })
  .superRefine((value, ctx) => {
    if (value.recurrenceEndDate && value.recurrenceEndDate < value.date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "recurrence_end_before_date",
        path: ["recurrenceEndDate"],
      });
    }
  });

const expensePaymentSchema = z.object({
  paid: boolInput.optional().default(true),
  occurrenceDate: nullableDate.optional().default(null),
});

function normalizeExpenseInput(input: z.infer<typeof expenseInputSchema>) {
  return {
    description: input.description.trim(),
    category: input.category,
    amount: Number(input.amount.toFixed(2)),
    date: input.date,
    isRecurring: input.isRecurring,
    recurrenceEndDate: input.isRecurring ? input.recurrenceEndDate : null,
    notes: input.notes,
  };
}

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

function readMonthKey(req: any) {
  const text = String(req?.query?.month ?? "").trim();
  const parsed = monthKeySchema.safeParse(text || currentParisMonthKey());
  return parsed.success ? parsed.data : currentParisMonthKey();
}

function monthStartDate(monthKey: string) {
  return `${monthKey}-01`;
}

function monthEndDate(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${monthKey}-${String(lastDay).padStart(2, "0")}`;
}

function nextMonthStartDate(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const next = new Date(Date.UTC(year, month, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function roundMoney(value: number | null) {
  if (value == null) return null;
  return Math.round(value * 100) / 100;
}

function normalizeDateOnly(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const next = new Date(String(value));
  return Number.isNaN(next.getTime()) ? null : next.toISOString().slice(0, 10);
}

function toIso(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mapExpenseRow(row: any) {
  return {
    id: String(row.id),
    description: String(row.description || ""),
    category: String(row.category || ""),
    amount: Number(row.amount ?? 0),
    date: normalizeDateOnly(row.date) || "",
    isRecurring: Boolean(row.is_recurring),
    recurrenceEndDate: normalizeDateOnly(row.recurrence_end_date),
    notes: row.notes == null ? null : String(row.notes),
    paidAt: toIso(row.paid_at),
    sourceType: row.source_type == null ? "manual" : String(row.source_type),
    agencyAssignmentId: row.agency_assignment_id == null ? null : Number(row.agency_assignment_id),
    agencyMonthKey: normalizeDateOnly(row.agency_month_key)?.slice(0, 7) || null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function getExpenseId(param: unknown) {
  const value = String(param || "").trim();
  return /^\d+$/.test(value) ? value : null;
}

function resolveRecurringOccurrenceDate(anchorDate: string, monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const anchorDay = Number(anchorDate.slice(8, 10));
  const day = Math.min(anchorDay, daysInMonth(year, month));
  return `${monthKey}-${String(day).padStart(2, "0")}`;
}

function isOccurrenceValid(expense: ReturnType<typeof mapExpenseRow>, occurrenceDate: string) {
  if (!expense.isRecurring) return false;
  if (occurrenceDate.slice(0, 7) < expense.date.slice(0, 7)) return false;
  const expectedDate = resolveRecurringOccurrenceDate(expense.date, occurrenceDate.slice(0, 7));
  if (expectedDate !== occurrenceDate) return false;
  if (expense.recurrenceEndDate && occurrenceDate > expense.recurrenceEndDate) return false;
  return true;
}

function computeAgencyPayouts(input: {
  ftdCount?: number | null;
  totalDeposits?: number | null;
  rsValue?: number | null;
  cpaAmount?: number | null;
  cpaAgencyCut?: number | null;
  ersAgencyPercent?: number | null;
}) {
  const ftdCount = Number(input.ftdCount || 0);
  const totalDeposits = Number(input.totalDeposits || 0);
  const enteredRs = Number(input.rsValue || 0);
  const cpaAmount = Number(input.cpaAmount || 0);
  const cpaAgencyCut = Number(input.cpaAgencyCut || 0);
  const ersAgencyPercent = Number(input.ersAgencyPercent || 0);

  const grossCpa = roundMoney(ftdCount * cpaAmount) || 0;
  const streamerCpa = roundMoney(ftdCount * Math.max(cpaAmount - cpaAgencyCut, 0)) || 0;
  const agencyCpa = roundMoney(ftdCount * cpaAgencyCut) || 0;
  const streamerErs = roundMoney(enteredRs) || 0;
  const payableStreamerErs = roundMoney(Math.max(streamerErs, 0)) || 0;
  const agencyErs = roundMoney((totalDeposits * ersAgencyPercent) / 100) || 0;

  return {
    grossCpa,
    streamerCpa,
    agencyCpa,
    streamerErs,
    payableStreamerErs,
    agencyErs,
    streamerTotal: roundMoney(streamerCpa + payableStreamerErs) || 0,
    agencyTotal: roundMoney(agencyCpa + agencyErs) || 0,
    grossTotal: roundMoney(grossCpa + payableStreamerErs + agencyErs) || 0,
  };
}

function resolveAgencyPaymentDate(paymentDate: string, monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const anchorDay = Number(paymentDate.slice(8, 10));
  const day = Math.min(anchorDay, daysInMonth(year, month));
  return `${monthKey}-${String(day).padStart(2, "0")}`;
}

async function syncAgencyExpensesForMonth(monthKey: string) {
  const monthStart = monthStartDate(monthKey);
  const monthEnd = monthEndDate(monthKey);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `
      SELECT
        asa.id AS assignment_id,
        asa.payment_date,
        asa.start_date,
        asa.end_date,
        ags.display_name AS streamer_display_name,
        d.name AS deal_name,
        d.cpa_amount,
        d.cpa_agency_cut,
        d.ers_agency_percent,
        c.name AS casino_name,
        st.ftd,
        st.total_deposits,
        st.rs_value
      FROM agency_streamer_assignments asa
      JOIN agency_streamers ags
        ON ags.id = asa.agency_streamer_id
      JOIN agency_deals d
        ON d.id = asa.deal_id
      JOIN agency_casinos c
        ON c.id = d.casino_id
      LEFT JOIN agency_streamer_assignment_stats st
        ON st.assignment_id = asa.id
       AND st.month_key = $1::date
      WHERE asa.start_date <= $2::date
        AND (asa.end_date IS NULL OR asa.end_date >= $1::date)
      ORDER BY asa.id ASC
      `,
      [monthStart, monthEnd]
    );

    const validAssignmentIds: number[] = [];
    let agencyPlus = 0;
    let agencyMinus = 0;

    for (const row of result.rows) {
      const payouts = computeAgencyPayouts({
        ftdCount: row.ftd == null ? null : Number(row.ftd),
        totalDeposits: row.total_deposits == null ? null : Number(row.total_deposits),
        rsValue: row.rs_value == null ? null : Number(row.rs_value),
        cpaAmount: row.cpa_amount == null ? null : Number(row.cpa_amount),
        cpaAgencyCut: row.cpa_agency_cut == null ? null : Number(row.cpa_agency_cut),
        ersAgencyPercent: row.ers_agency_percent == null ? null : Number(row.ers_agency_percent),
      });

      agencyPlus += Number(payouts.agencyTotal || 0);
      agencyMinus += Number(payouts.streamerTotal || 0);

      if (payouts.streamerTotal <= 0) continue;

      const assignmentId = Number(row.assignment_id);
      validAssignmentIds.push(assignmentId);

      const dueDate = resolveAgencyPaymentDate(
        normalizeDateOnly(row.payment_date) || normalizeDateOnly(row.start_date) || monthStart,
        monthKey
      );

      await client.query(
        `
        INSERT INTO expenses (
          description,
          category,
          amount,
          date,
          is_recurring,
          recurrence_end_date,
          notes,
          source_type,
          agency_assignment_id,
          agency_month_key
        )
        VALUES ($1, 'personnalise', $2, $3::date, FALSE, NULL, $4, 'agency_streamer_payout', $5, $6::date)
        ON CONFLICT (source_type, agency_assignment_id, agency_month_key)
        DO UPDATE SET
          description = EXCLUDED.description,
          category = EXCLUDED.category,
          amount = EXCLUDED.amount,
          date = EXCLUDED.date,
          notes = EXCLUDED.notes,
          updated_at = NOW()
        `,
        [
          `Paiement affi - ${String(row.streamer_display_name || "").trim()} - ${String(row.casino_name || "").trim()}`,
          payouts.streamerTotal,
          dueDate,
          `Deal ${String(row.deal_name || "").trim()} | Genere depuis agence pour ${monthKey}`,
          assignmentId,
          monthStart,
        ]
      );
    }

    if (validAssignmentIds.length) {
      await client.query(
        `
        DELETE FROM expenses
        WHERE source_type = 'agency_streamer_payout'
          AND agency_month_key = $1::date
          AND NOT (agency_assignment_id = ANY($2::bigint[]))
        `,
        [monthStart, validAssignmentIds]
      );
    } else {
      await client.query(
        `
        DELETE FROM expenses
        WHERE source_type = 'agency_streamer_payout'
          AND agency_month_key = $1::date
        `,
        [monthStart]
      );
    }

    await client.query("COMMIT");

    return {
      plus: roundMoney(agencyPlus) || 0,
      minus: roundMoney(agencyMinus) || 0,
      net: roundMoney(agencyPlus - agencyMinus) || 0,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function buildVisibleExpenseRows(
  expenses: ReturnType<typeof mapExpenseRow>[],
  paidMap: Map<string, string | null>,
  monthKey: string
) {
  return expenses
    .map((expense) => {
      if (expense.sourceType === "agency_streamer_payout" || !expense.isRecurring) {
        if (!expense.date.startsWith(monthKey)) return null;
        return {
          key: `${expense.id}:${expense.date}`,
          expense,
          occurrenceDate: expense.date,
          isProjected: false,
          paid: Boolean(expense.paidAt),
          paidAt: expense.paidAt,
          canEdit: expense.sourceType === "manual",
          canDelete: expense.sourceType === "manual",
        };
      }

      if (monthKey < expense.date.slice(0, 7)) return null;
      const occurrenceDate = resolveRecurringOccurrenceDate(expense.date, monthKey);
      if (expense.recurrenceEndDate && occurrenceDate > expense.recurrenceEndDate) return null;

      const paidAt = paidMap.get(`${expense.id}:${occurrenceDate}`) || null;
      return {
        key: `${expense.id}:${occurrenceDate}`,
        expense,
        occurrenceDate,
        isProjected: occurrenceDate !== expense.date,
        paid: Boolean(paidAt),
        paidAt,
        canEdit: true,
        canDelete: true,
      };
    })
    .filter(Boolean);
}

export const expensesRouter = Router();

expensesRouter.use("/expenses", requireAuth, requireFsbAccess);

expensesRouter.get(
  "/expenses",
  a(async (req, res) => {
    const monthKey = readMonthKey(req);
    const monthStart = monthStartDate(monthKey);
    const monthEnd = monthEndDate(monthKey);
    const nextMonthStart = nextMonthStartDate(monthKey);
    const agencySummary = await syncAgencyExpensesForMonth(monthKey);

    const expensesResult = await pool.query(
      `
      SELECT
        id,
        description,
        category,
        amount,
        date,
        is_recurring,
        recurrence_end_date,
        notes,
        paid_at,
        source_type,
        agency_assignment_id,
        agency_month_key,
        created_at,
        updated_at
      FROM expenses
      WHERE (
        source_type = 'manual'
        AND (
          (is_recurring = FALSE AND date >= $1::date AND date < $2::date)
          OR
          (is_recurring = TRUE AND date <= $3::date AND (recurrence_end_date IS NULL OR recurrence_end_date >= $1::date))
        )
      )
      OR (
        source_type = 'agency_streamer_payout'
        AND agency_month_key = $1::date
      )
      ORDER BY date DESC, created_at DESC
      `,
      [monthStart, nextMonthStart, monthEnd]
    );

    const expenses = expensesResult.rows.map(mapExpenseRow);
    const recurringIds = expenses
      .filter((expense) => expense.isRecurring && expense.sourceType === "manual")
      .map((expense) => Number(expense.id));

    const paidMap = new Map<string, string | null>();
    if (recurringIds.length) {
      const occurrenceResult = await pool.query(
        `
        SELECT expense_id, occurrence_date, paid_at
        FROM expense_occurrence_payments
        WHERE expense_id = ANY($1::bigint[])
          AND occurrence_date >= $2::date
          AND occurrence_date <= $3::date
        `,
        [recurringIds, monthStart, monthEnd]
      );

      for (const row of occurrenceResult.rows) {
        paidMap.set(
          `${String(row.expense_id)}:${normalizeDateOnly(row.occurrence_date)}`,
          toIso(row.paid_at)
        );
      }
    }

    const visibleExpenses = buildVisibleExpenseRows(expenses, paidMap, monthKey);
    const summary = visibleExpenses.reduce(
      (acc, row: any) => {
        acc.total += Number(row.expense.amount || 0);
        if (row.paid) acc.paid += Number(row.expense.amount || 0);
        else acc.due += Number(row.expense.amount || 0);
        return acc;
      },
      { total: 0, paid: 0, due: 0 }
    );

    return res.json({
      ok: true,
      monthKey,
      expenses,
      visibleExpenses,
      summary: {
        total: roundMoney(summary.total) || 0,
        paid: roundMoney(summary.paid) || 0,
        due: roundMoney(summary.due) || 0,
        agencyPlus: agencySummary.plus,
        agencyMinus: agencySummary.minus,
        agencyNet: agencySummary.net,
      },
    });
  })
);

expensesRouter.post(
  "/expenses",
  a(async (req, res) => {
    const parsed = expenseInputSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: parsed.error.issues[0]?.message || "invalid_payload",
      });
    }

    const payload = normalizeExpenseInput(parsed.data);
    const result = await pool.query(
      `
      INSERT INTO expenses (
        description,
        category,
        amount,
        date,
        is_recurring,
        recurrence_end_date,
        notes,
        source_type
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'manual')
      RETURNING
        id,
        description,
        category,
        amount,
        date,
        is_recurring,
        recurrence_end_date,
        notes,
        paid_at,
        source_type,
        agency_assignment_id,
        agency_month_key,
        created_at,
        updated_at
      `,
      [
        payload.description,
        payload.category,
        payload.amount,
        payload.date,
        payload.isRecurring,
        payload.recurrenceEndDate,
        payload.notes,
      ]
    );

    return res.status(201).json({
      ok: true,
      expense: mapExpenseRow(result.rows[0]),
    });
  })
);

expensesRouter.put(
  "/expenses/:id",
  a(async (req, res) => {
    const expenseId = getExpenseId((req as any).params?.id);
    if (!expenseId) {
      return res.status(400).json({ ok: false, error: "bad_id" });
    }

    const lockedResult = await pool.query(
      `SELECT id, source_type FROM expenses WHERE id = $1 LIMIT 1`,
      [expenseId]
    );
    const lockedRow = lockedResult.rows[0];
    if (!lockedRow) {
      return res.status(404).json({ ok: false, error: "not_found" });
    }
    if (String(lockedRow.source_type || "manual") !== "manual") {
      return res.status(400).json({ ok: false, error: "generated_locked" });
    }

    const parsed = expenseInputSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: parsed.error.issues[0]?.message || "invalid_payload",
      });
    }

    const payload = normalizeExpenseInput(parsed.data);
    const result = await pool.query(
      `
      UPDATE expenses
      SET
        description = $2,
        category = $3,
        amount = $4,
        date = $5,
        is_recurring = $6,
        recurrence_end_date = $7,
        notes = $8,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        description,
        category,
        amount,
        date,
        is_recurring,
        recurrence_end_date,
        notes,
        paid_at,
        source_type,
        agency_assignment_id,
        agency_month_key,
        created_at,
        updated_at
      `,
      [
        expenseId,
        payload.description,
        payload.category,
        payload.amount,
        payload.date,
        payload.isRecurring,
        payload.recurrenceEndDate,
        payload.notes,
      ]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ ok: false, error: "not_found" });
    }

    if (!payload.isRecurring) {
      await pool.query(`DELETE FROM expense_occurrence_payments WHERE expense_id = $1`, [expenseId]);
    }

    return res.json({
      ok: true,
      expense: mapExpenseRow(result.rows[0]),
    });
  })
);

expensesRouter.put(
  "/expenses/:id/payment",
  a(async (req, res) => {
    const expenseId = getExpenseId((req as any).params?.id);
    if (!expenseId) {
      return res.status(400).json({ ok: false, error: "bad_id" });
    }

    const parsed = expensePaymentSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: parsed.error.issues[0]?.message || "invalid_payload",
      });
    }

    const expenseResult = await pool.query(
      `
      SELECT
        id,
        description,
        category,
        amount,
        date,
        is_recurring,
        recurrence_end_date,
        notes,
        paid_at,
        source_type,
        agency_assignment_id,
        agency_month_key,
        created_at,
        updated_at
      FROM expenses
      WHERE id = $1
      LIMIT 1
      `,
      [expenseId]
    );

    const row = expenseResult.rows[0];
    if (!row) return res.status(404).json({ ok: false, error: "not_found" });
    const expense = mapExpenseRow(row);

    if (expense.isRecurring && expense.sourceType === "manual") {
      const occurrenceDate = parsed.data.occurrenceDate;
      if (!occurrenceDate) {
        return res.status(400).json({ ok: false, error: "occurrence_date_required" });
      }
      if (!isOccurrenceValid(expense, occurrenceDate)) {
        return res.status(400).json({ ok: false, error: "bad_occurrence_date" });
      }

      if (parsed.data.paid) {
        await pool.query(
          `
          INSERT INTO expense_occurrence_payments (
            expense_id,
            occurrence_date,
            paid_at
          )
          VALUES ($1, $2::date, NOW())
          ON CONFLICT (expense_id, occurrence_date)
          DO UPDATE SET
            paid_at = EXCLUDED.paid_at,
            updated_at = NOW()
          `,
          [expenseId, occurrenceDate]
        );
      } else {
        await pool.query(
          `
          DELETE FROM expense_occurrence_payments
          WHERE expense_id = $1
            AND occurrence_date = $2::date
          `,
          [expenseId, occurrenceDate]
        );
      }
    } else {
      const result = await pool.query(
        `
        UPDATE expenses
        SET paid_at = CASE WHEN $2 THEN NOW() ELSE NULL END,
            updated_at = NOW()
        WHERE id = $1
        RETURNING
          id,
          description,
          category,
          amount,
          date,
          is_recurring,
          recurrence_end_date,
          notes,
          paid_at,
          source_type,
          agency_assignment_id,
          agency_month_key,
          created_at,
          updated_at
        `,
        [expenseId, parsed.data.paid]
      );

      return res.json({
        ok: true,
        expense: mapExpenseRow(result.rows[0]),
      });
    }

    return res.json({
      ok: true,
      expenseId,
      occurrenceDate: parsed.data.occurrenceDate,
      paid: parsed.data.paid,
    });
  })
);

expensesRouter.delete(
  "/expenses/:id",
  a(async (req, res) => {
    const expenseId = getExpenseId((req as any).params?.id);
    if (!expenseId) {
      return res.status(400).json({ ok: false, error: "bad_id" });
    }

    const lockedResult = await pool.query(
      `SELECT id, source_type FROM expenses WHERE id = $1 LIMIT 1`,
      [expenseId]
    );
    const lockedRow = lockedResult.rows[0];
    if (!lockedRow) {
      return res.status(404).json({ ok: false, error: "not_found" });
    }
    if (String(lockedRow.source_type || "manual") !== "manual") {
      return res.status(400).json({ ok: false, error: "generated_locked" });
    }

    const result = await pool.query(
      `DELETE FROM expenses WHERE id = $1 RETURNING id`,
      [expenseId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ ok: false, error: "not_found" });
    }

    return res.json({ ok: true, id: String(result.rows[0].id) });
  })
);
