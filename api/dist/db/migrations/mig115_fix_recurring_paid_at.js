export async function mig115_fix_recurring_paid_at(pool) {
    // Bug correctif : un mark-paid précédent (ancienne version du bouton Discord)
    // avait UPDATE'd `expenses.paid_at = NOW()` pour des expenses récurrentes.
    // Pour les récurrents, l'état "payé" se gère par occurrence dans la table
    // `expense_occurrence_payments` — le parent.paid_at doit rester NULL.
    // On nettoie ce champ pour que les boards Discord et le FSB voient à nouveau
    // ces récurrents comme "à payer mensuellement" (avec leur sous-table d'occurrences).
    await pool.query(`
    UPDATE expenses
    SET    paid_at = NULL,
           updated_at = NOW()
    WHERE  is_recurring = TRUE
      AND  paid_at IS NOT NULL;
  `);
}
