// api/src/lib/expenses_unpaid.ts
//
// Helper partagé pour énumérer les frais "à payer" (non-récurrents impayés
// + occurrences récurrentes non encore enregistrées dans
// `expense_occurrence_payments`).
//
// Utilisé par :
//   - agency_fees_board.ts (board Discord)
//   - agency_fee_reminder.ts (DM rappel)
//   - discord/admin_commands.ts (/dette + bouton mark-paid)

import { pool } from "../db.js";

export type UnpaidRow = {
  expense_id: number;
  description: string;
  amount: number;
  due_date: string;        // YYYY-MM-DD (occurrence pour récurrent, anchor pour non-récurrent)
  days_until: number;
  is_recurring: boolean;
  occurrence_date: string | null; // YYYY-MM-DD si récurrent, null sinon
};

function toDateUTC(yyyymmdd: string): Date {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function daysInMonth(year: number, monthZeroIndex: number): number {
  return new Date(Date.UTC(year, monthZeroIndex + 1, 0)).getUTCDate();
}

function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

/**
 * Énumère tous les frais impayés sur la fenêtre [today - lookbackDays, today + lookaheadDays].
 *  - Non-récurrents : 1 entry si paid_at IS NULL et date dans fenêtre
 *  - Récurrents : 1 entry par occurrence dans la fenêtre, anchor ≤ occ ≤ recurrence_end_date,
 *                 absente de expense_occurrence_payments
 */
export async function loadUnpaidOccurrences(
  todayParis: string,
  lookbackDays = 365,
  lookaheadDays = 90,
): Promise<UnpaidRow[]> {
  const today = toDateUTC(todayParis);
  const windowStart = new Date(today); windowStart.setUTCDate(windowStart.getUTCDate() - lookbackDays);
  const windowEnd   = new Date(today); windowEnd.setUTCDate(windowEnd.getUTCDate() + lookaheadDays);

  const expensesRes = await pool.query(
    `
    SELECT id::text                          AS id,
           description,
           amount::float                     AS amount,
           to_char(date, 'YYYY-MM-DD')       AS anchor_date,
           is_recurring,
           to_char(recurrence_end_date, 'YYYY-MM-DD') AS recurrence_end_date,
           paid_at IS NOT NULL               AS parent_paid
    FROM expenses
    `
  );

  const paidRes = await pool.query(
    `SELECT expense_id::text AS eid, to_char(occurrence_date, 'YYYY-MM-DD') AS occ
     FROM expense_occurrence_payments`
  );
  const paidSet = new Set<string>(paidRes.rows.map((r: any) => `${r.eid}:${r.occ}`));

  const out: UnpaidRow[] = [];

  for (const e of expensesRes.rows as any[]) {
    const expenseId   = Number(e.id);
    const desc        = String(e.description || "");
    const amount      = Number(e.amount || 0);
    const anchor      = String(e.anchor_date);
    const recEnd      = e.recurrence_end_date ? String(e.recurrence_end_date) : null;
    const isRecurring = !!e.is_recurring;
    const parentPaid  = !!e.parent_paid;

    if (!isRecurring) {
      if (parentPaid) continue;
      const dueDate = toDateUTC(anchor);
      if (dueDate < windowStart || dueDate > windowEnd) continue;
      out.push({
        expense_id: expenseId,
        description: desc,
        amount,
        due_date: anchor,
        days_until: diffDays(dueDate, today),
        is_recurring: false,
        occurrence_date: null,
      });
      continue;
    }

    // Récurrent : énumère les occurrences à partir du 1er mois de l'anchor
    // jusqu'à windowEnd. Une occurrence est définie par anchor_day clamped au
    // dernier jour du mois courant.
    const anchorDate = toDateUTC(anchor);
    const anchorDay  = anchorDate.getUTCDate();
    const cursor = new Date(Date.UTC(anchorDate.getUTCFullYear(), anchorDate.getUTCMonth(), 1));

    while (cursor <= windowEnd) {
      const y = cursor.getUTCFullYear();
      const m = cursor.getUTCMonth();
      const day = Math.min(anchorDay, daysInMonth(y, m));
      const occDate = new Date(Date.UTC(y, m, day));
      const occStr  = ymd(occDate);

      // Avance le cursor pour le tour suivant
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);

      if (occStr < anchor) continue;                  // avant la date d'anchor
      if (recEnd && occStr > recEnd) break;           // recurrence terminée
      if (occDate < windowStart) continue;            // hors fenêtre
      if (occDate > windowEnd)   break;
      if (paidSet.has(`${expenseId}:${occStr}`)) continue; // déjà payée

      out.push({
        expense_id: expenseId,
        description: desc,
        amount,
        due_date: occStr,
        days_until: diffDays(occDate, today),
        is_recurring: true,
        occurrence_date: occStr,
      });
    }
  }

  // Trier par date asc
  out.sort((a, b) => a.due_date.localeCompare(b.due_date));
  return out;
}

/**
 * Marque un frais comme payé (gère récurrent vs non-récurrent).
 * Pour récurrent : INSERT dans expense_occurrence_payments.
 * Pour non-récurrent : UPDATE expenses.paid_at.
 */
export async function markExpensePaid(
  expenseId: number,
  occurrenceDate: string | null,
): Promise<void> {
  if (occurrenceDate) {
    await pool.query(
      `INSERT INTO expense_occurrence_payments (expense_id, occurrence_date, paid_at)
       VALUES ($1, $2::date, NOW())
       ON CONFLICT (expense_id, occurrence_date)
       DO UPDATE SET paid_at = NOW(), updated_at = NOW()`,
      [expenseId, occurrenceDate]
    );
  } else {
    await pool.query(
      `UPDATE expenses SET paid_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [expenseId]
    );
  }
}
