import { Business } from "../businesses/business.model.js";
import { BusinessSettings } from "../businesses/business-settings.model.js";
import { Customer } from "../customers/customer.model.js";
import { Expense } from "../expenses/expense.model.js";
import { ExpenseCategory } from "../expenses/expense-category.model.js";
import { Invoice } from "../invoices/invoice.model.js";
import { Payment } from "../payments/payment.model.js";
import { TaxRate } from "../settings/tax-rate.model.js";

export async function buildBusinessRecordExport({
  businessId,
  now = () => new Date(),
}) {
  const [
    business,
    settings,
    customers,
    invoices,
    payments,
    expenses,
    expenseCategories,
    taxRates,
  ] = await Promise.all([
    Business.findById(businessId).select("-billing.subscriptionId").lean(),
    BusinessSettings.findOne({ businessId }).lean(),
    Customer.find({ businessId }).lean(),
    Invoice.find({ businessId }).lean(),
    Payment.find({ businessId }).lean(),
    Expense.find({ businessId }).lean(),
    ExpenseCategory.find({ businessId }).lean(),
    TaxRate.find({ businessId }).lean(),
  ]);
  return {
    schemaVersion: "invoiceflow-record-export-v1",
    exportedAt: now().toISOString(),
    business,
    settings,
    customers,
    invoices,
    payments,
    expenses,
    expenseCategories,
    taxRates,
  };
}
