/**
 * Consume the entitlement snapshot supplied by the authenticated API. The UI
 * never infers plan access from a plan name or subscription status.
 */
export function useEntitlements(entitlements) {
  const flags = entitlements?.features ?? entitlements;
  return Object.freeze({
    expenses: flags?.expenses === true,
    reports: flags?.reports === true,
    reminders: flags?.reminders === true,
    team: flags?.team === true,
    cashflow: flags?.cashflow === true,
    fullExport: flags?.fullExport === true,
  });
}
