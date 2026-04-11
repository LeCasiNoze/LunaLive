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

function normalizeDateOnly(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const next = new Date(value);
  return Number.isNaN(next.getTime()) ? null : next.toISOString().slice(0, 10);
}

function mapExpenseRow(row: any) {
  const date = normalizeDateOnly(row.date) || "";
  return {
    id: String(row.id),
    description: String(row.description || ""),
    category: String(row.category || ""),
    amount: Number(row.amount ?? 0),
    date,
    isRecurring: Boolean(row.is_recurring),
    recurrenceEndDate: normalizeDateOnly(row.recurrence_end_date),
    notes: row.notes == null ? null : String(row.notes),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

function getExpenseId(param: any) {
  const value = String(param || "").trim();
  return /^\d+$/.test(value) ? value : null;
}

export const expensesRouter = Router();

expensesRouter.use("/expenses", requireAuth, requireFsbAccess);

expensesRouter.get(
  "/expenses",
  a(async (_req, res) => {
    const result = await pool.query(
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
        created_at,
        updated_at
      FROM expenses
      ORDER BY date DESC, created_at DESC
      `
    );

    return res.json({
      ok: true,
      expenses: result.rows.map(mapExpenseRow),
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
        notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING
        id,
        description,
        category,
        amount,
        date,
        is_recurring,
        recurrence_end_date,
        notes,
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

    return res.json({
      ok: true,
      expense: mapExpenseRow(result.rows[0]),
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
