import { ApiError } from "../utils/ApiError.js";

const rolesByCapability = {
  team: ["owner"],
  business_settings: ["owner", "admin"],
  currency: ["owner"],
  billing: ["owner"],
  reminders: ["owner", "admin"],
  customer_read: ["owner", "admin", "accountant"],
  customer_write: ["owner", "admin"],
  invoice_read: ["owner", "admin", "accountant"],
  invoice_write: ["owner", "admin"],
  invoice_finalize: ["owner", "admin"],
  payment_write: ["owner", "admin", "accountant"],
  expense_write: ["owner", "admin", "accountant"],
  reports: ["owner", "admin", "accountant"],
};
const staffPermissions = {
  customer_read: "customers:read",
  customer_write: "customers:write",
  invoice_read: "invoices:read",
  invoice_write: "invoices:create_draft",
  expense_write: "expenses:write",
};

export function authorize(capability) {
  const allowed = rolesByCapability[capability];
  if (!allowed)
    throw new TypeError(`Unknown permission capability: ${capability}`);
  return (req, _res, next) => {
    const staffGrant = staffPermissions[capability];
    const permitted =
      req.membership &&
      (allowed.includes(req.membership.role) ||
        (req.membership.role === "staff" &&
          staffGrant &&
          req.membership.permissions.includes(staffGrant)));
    if (!permitted) {
      return next(
        new ApiError(
          403,
          "FORBIDDEN",
          "You do not have permission to perform this action.",
        ),
      );
    }
    next();
  };
}

export function permissionMatrix() {
  return structuredClone(rolesByCapability);
}
