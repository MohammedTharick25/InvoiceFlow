import plans from "../../config/plans.json" with { type: "json" };

const DAY_MS = 24 * 60 * 60 * 1000;

export function evaluateEntitlements({
  subscription,
  business,
  now = new Date(),
}) {
  const trialEndsAt = subscription?.trialEndsAt ?? null;
  const planKey =
    subscription?.planKey ?? business?.billing?.entitlementPlanKey ?? "king";
  let state =
    subscription?.status ?? business?.billing?.entitlementState ?? "expired";
  if (state === "trialing" && trialEndsAt && now >= new Date(trialEndsAt))
    state = "expired";
  if (
    state === "past_due" &&
    subscription?.graceEndsAt &&
    now >= new Date(subscription.graceEndsAt)
  )
    state = "halted";
  if (
    state === "cancelled" &&
    subscription?.currentPeriodEnd &&
    now >= new Date(subscription.currentPeriodEnd)
  )
    state = "expired";
  if (
    state === "active" &&
    subscription?.currentPeriodEnd &&
    now >= new Date(subscription.currentPeriodEnd)
  ) {
    state =
      subscription?.graceEndsAt && now < new Date(subscription.graceEndsAt)
        ? "past_due"
        : "halted";
  }
  const plan = plans.plans[planKey] ?? plans.plans.basic;
  const readOnly = ["halted", "expired"].includes(state);
  const feature = (name) => !readOnly && plan.features?.[name] === true;
  const trialDaysLeft =
    state === "trialing" && trialEndsAt
      ? Math.max(
          0,
          Math.ceil((new Date(trialEndsAt).getTime() - now.getTime()) / DAY_MS),
        )
      : 0;
  return Object.freeze({
    planKey,
    planName: plan.name,
    state,
    readOnly,
    trialEndsAt,
    trialDaysLeft,
    limits: Object.freeze({
      finalizedInvoicesPerMonth: plan.finalizedInvoicesPerMonth,
      activeCustomers: plan.activeCustomers,
      teamMembers: plan.teamMembers,
    }),
    features: Object.freeze({
      expenses: feature("expenses"),
      reports: feature("reports"),
      reminders: !readOnly,
      fullReminders: feature("fullReminders"),
      reminderEmail: feature("reminderEmail"),
      cashflow: feature("cashflow"),
      receipts: feature("receipts"),
      team: feature("team"),
      fullExport: feature("fullExport"),
    }),
  });
}
