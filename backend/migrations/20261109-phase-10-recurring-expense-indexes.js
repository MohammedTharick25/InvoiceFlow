export async function up(db) {
  await db.collection("expenses").createIndex(
    { recurringExpenseId: 1, recurringOccurrenceDate: 1 },
    {
      unique: true,
      name: "recurring_expense_occurrence_unique",
      partialFilterExpression: {
        recurringExpenseId: { $type: "objectId" },
      },
    },
  );
  await db
    .collection("recurringexpenses")
    .createIndex(
      { archivedAt: 1, pausedAt: 1, nextRunAt: 1 },
      { name: "recurring_expense_due_scheduler" },
    );
}

export async function down(db) {
  await db
    .collection("expenses")
    .dropIndex("recurring_expense_occurrence_unique");
  await db
    .collection("recurringexpenses")
    .dropIndex("recurring_expense_due_scheduler");
}
