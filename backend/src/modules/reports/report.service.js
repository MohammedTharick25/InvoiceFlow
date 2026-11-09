import { Customer } from "../customers/customer.model.js";
import { Invoice } from "../invoices/invoice.model.js";
import { Payment } from "../payments/payment.model.js";
import { Expense } from "../expenses/expense.model.js";
import { businessDate } from "../../utils/clock.js";

const ACTIVE_STATUSES = ["issued", "sent", "partially_paid", "paid"];

function utcDateRange(from, to) {
  const range = {};
  if (from) range.$gte = new Date(`${from}T00:00:00.000Z`);
  if (to) {
    const exclusiveTo = new Date(`${to}T00:00:00.000Z`);
    exclusiveTo.setUTCDate(exclusiveTo.getUTCDate() + 1);
    range.$lt = exclusiveTo;
  }
  return Object.keys(range).length ? range : undefined;
}

function localMidnight(date, timeZone) {
  const target = Date.parse(`${date}T00:00:00.000Z`);
  let guess = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(guess));
    const value = Object.fromEntries(
      parts.map(({ type, value }) => [type, value]),
    );
    const represented = Date.UTC(
      Number(value.year),
      Number(value.month) - 1,
      Number(value.day),
      Number(value.hour),
      Number(value.minute),
      Number(value.second),
    );
    guess += target - represented;
  }
  return new Date(guess);
}

function zonedDateRange(from, to, timeZone) {
  const range = {};
  if (from) range.$gte = localMidnight(from, timeZone);
  if (to) {
    const nextDate = new Date(`${to}T00:00:00.000Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    range.$lt = localMidnight(nextDate.toISOString().slice(0, 10), timeZone);
  }
  return Object.keys(range).length ? range : undefined;
}

function sumMinor(rows, read = (row) => row.totals?.totalMinor ?? 0) {
  return rows
    .reduce((total, row) => total + BigInt(read(row) || 0), 0n)
    .toString();
}

function toIsoDate(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

export function escapeCsvCell(value) {
  let text = value == null ? "" : String(value);
  if (/^\s*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function csv(rows, columns) {
  return [
    columns.map(escapeCsvCell).join(","),
    ...rows.map((row) =>
      columns.map((key) => escapeCsvCell(row[key])).join(","),
    ),
  ].join("\r\n");
}

export function createReportService({ now = () => new Date() } = {}) {
  async function cashflow({
    businessId,
    timeZone = "UTC",
    currency = "INR",
    months = 6,
  }) {
    const today = businessDate(now(), timeZone);
    const first = new Date(`${today.slice(0, 7)}-01T00:00:00.000Z`);
    first.setUTCMonth(first.getUTCMonth() - (months - 1));
    const from = localMidnight(first.toISOString().slice(0, 10), timeZone);
    const tomorrow = new Date(`${today}T00:00:00.000Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const to = localMidnight(tomorrow.toISOString().slice(0, 10), timeZone);
    const [payments, expenses] = await Promise.all([
      Payment.find({
        businessId,
        status: "recorded",
        paidAt: { $gte: from, $lt: to },
      })
        .select("amountMinor currency paidAt")
        .lean(),
      Expense.find({
        businessId,
        archivedAt: null,
        date: { $gte: from, $lt: to },
      })
        .select("amountMinor currency date")
        .lean(),
    ]);
    const monthKeys = [];
    for (let offset = months - 1; offset >= 0; offset -= 1) {
      const month = new Date(`${today.slice(0, 7)}-01T00:00:00.000Z`);
      month.setUTCMonth(month.getUTCMonth() - offset);
      monthKeys.push(month.toISOString().slice(0, 7));
    }
    const buckets = new Map(
      monthKeys.map((month) => [
        `${currency}:${month}`,
        { month, currency, inflowMinor: "0", outflowMinor: "0" },
      ]),
    );
    const add = (rows, field, dateField, kind) => {
      for (const row of rows) {
        const key = `${row.currency}:${businessDate(row[dateField], timeZone).slice(0, 7)}`;
        const bucket = buckets.get(key) ?? {
          month: key.slice(-7),
          currency: row.currency,
          inflowMinor: "0",
          outflowMinor: "0",
        };
        bucket[kind] = (BigInt(bucket[kind]) + BigInt(row[field])).toString();
        buckets.set(key, bucket);
      }
    };
    add(payments, "amountMinor", "paidAt", "inflowMinor");
    add(expenses, "amountMinor", "date", "outflowMinor");
    return [...buckets.values()].sort(
      (a, b) =>
        a.month.localeCompare(b.month) || a.currency.localeCompare(b.currency),
    );
  }
  async function dashboard({ businessId, timeZone }) {
    const today = businessDate(now(), timeZone || "UTC");
    const monthStart = `${today.slice(0, 7)}-01`;
    const activeInvoices = await Invoice.find({
      businessId,
      status: { $in: ACTIVE_STATUSES },
    })
      .select(
        "status issueDate dueDate totals balanceMinor currency number customerId",
      )
      .lean();
    const tomorrowDate = new Date(`${today}T00:00:00.000Z`);
    tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
    const tomorrow = localMidnight(
      tomorrowDate.toISOString().slice(0, 10),
      timeZone || "UTC",
    );
    const currentMonthIssued = await Invoice.countDocuments({
      businessId,
      issuedAt: {
        $gte: localMidnight(monthStart, timeZone || "UTC"),
        $lt: tomorrow,
      },
    });
    const customers = await Customer.countDocuments({
      businessId,
      archivedAt: null,
    });
    const outstanding = activeInvoices.filter(
      (invoice) => invoice.balanceMinor > 0,
    );
    const overdue = outstanding.filter(
      (invoice) => invoice.dueDate && toIsoDate(invoice.dueDate) < today,
    );
    const recentInvoices = await Invoice.find({
      businessId,
      status: { $ne: "draft" },
    })
      .sort({ issuedAt: -1, _id: -1 })
      .limit(5)
      .select(
        "number status issueDate dueDate totals balanceMinor currency customerSnapshot customerId",
      )
      .lean();
    return {
      asOf: today,
      currency: activeInvoices[0]?.currency ?? "INR",
      issuedThisMonth: currentMonthIssued,
      outstandingCount: outstanding.length,
      outstandingMinor: sumMinor(outstanding, (row) => row.balanceMinor),
      overdueCount: overdue.length,
      overdueMinor: sumMinor(overdue, (row) => row.balanceMinor),
      activeCustomers: customers,
      recentInvoices: recentInvoices.map((invoice) => ({
        id: invoice._id.toString(),
        number: invoice.number,
        status: invoice.status,
        issueDate: toIsoDate(invoice.issueDate),
        dueDate: toIsoDate(invoice.dueDate),
        totalMinor: String(invoice.totals?.totalMinor ?? 0),
        balanceMinor: String(invoice.balanceMinor ?? 0),
        currency: invoice.currency,
        customer: invoice.customerSnapshot?.name ?? "Customer",
      })),
    };
  }

  async function buildCsv({ businessId, type, from, to, timeZone = "UTC" }) {
    const dateRange = utcDateRange(from, to);
    let rows;
    let columns;
    if (type === "sales") {
      const query = { businessId, status: { $in: ACTIVE_STATUSES } };
      if (dateRange) query.issueDate = dateRange;
      rows = await Invoice.find(query)
        .sort({ issueDate: 1, number: 1 })
        .limit(50001)
        .select(
          "number status issueDate dueDate currency totals amountPaidMinor balanceMinor customerSnapshot",
        )
        .lean();
      columns = [
        "invoiceNumber",
        "customer",
        "status",
        "issueDate",
        "dueDate",
        "currency",
        "totalMinor",
        "paidMinor",
        "balanceMinor",
      ];
      rows = rows.map((row) => ({
        invoiceNumber: row.number,
        customer: row.customerSnapshot?.name,
        status: row.status,
        issueDate: toIsoDate(row.issueDate),
        dueDate: toIsoDate(row.dueDate),
        currency: row.currency,
        totalMinor: row.totals?.totalMinor ?? 0,
        paidMinor: row.amountPaidMinor,
        balanceMinor: row.balanceMinor,
      }));
    } else if (type === "payments") {
      const query = { businessId, status: "recorded" };
      const paidRange =
        from || to ? zonedDateRange(from, to, timeZone) : undefined;
      if (paidRange) query.paidAt = paidRange;
      const payments = await Payment.find(query)
        .sort({ paidAt: 1, _id: 1 })
        .limit(50001)
        .populate({ path: "invoiceId", select: "number" })
        .populate({ path: "customerId", select: "name" })
        .lean();
      columns = [
        "paidAt",
        "invoiceNumber",
        "customer",
        "amountMinor",
        "currency",
        "method",
        "reference",
      ];
      rows = payments.map((row) => ({
        paidAt: toIsoDate(row.paidAt),
        invoiceNumber: row.invoiceId?.number,
        customer: row.customerId?.name,
        amountMinor: row.amountMinor,
        currency: row.currency,
        method: row.method,
        reference: row.reference,
      }));
    } else if (type === "outstanding" || type === "overdue") {
      const query = {
        businessId,
        status: { $in: ["issued", "sent", "partially_paid"] },
        balanceMinor: { $gt: 0 },
      };
      if (dateRange) query.issueDate = dateRange;
      if (type === "overdue")
        query.dueDate = {
          $lt: new Date(`${businessDate(now(), timeZone)}T00:00:00.000Z`),
        };
      const invoices = await Invoice.find(query)
        .sort({ dueDate: 1, issueDate: 1 })
        .limit(50001)
        .populate({ path: "customerId", select: "name" })
        .lean();
      columns = [
        "invoiceNumber",
        "customer",
        "status",
        "issueDate",
        "dueDate",
        "currency",
        "totalMinor",
        "paidMinor",
        "balanceMinor",
      ];
      rows = invoices.map((row) => ({
        invoiceNumber: row.number,
        customer: row.customerId?.name ?? row.customerSnapshot?.name,
        status: row.status,
        issueDate: toIsoDate(row.issueDate),
        dueDate: toIsoDate(row.dueDate),
        currency: row.currency,
        totalMinor: row.totals?.totalMinor ?? 0,
        paidMinor: row.amountPaidMinor,
        balanceMinor: row.balanceMinor,
      }));
    } else if (type === "customer-balances") {
      const invoices = await Invoice.find({
        businessId,
        status: { $in: ["issued", "sent", "partially_paid"] },
        balanceMinor: { $gt: 0 },
      })
        .select("customerId customerSnapshot currency balanceMinor")
        .lean();
      const grouped = new Map();
      for (const row of invoices) {
        const key = `${row.customerId}:${row.currency}`;
        const entry = grouped.get(key) ?? {
          customerId: row.customerId,
          currency: row.currency,
          balance: 0n,
          count: 0,
        };
        entry.balance += BigInt(row.balanceMinor);
        entry.count += 1;
        grouped.set(key, entry);
      }
      const ids = [
        ...new Set(
          [...grouped.values()].map((row) => row.customerId.toString()),
        ),
      ];
      const customers = await Customer.find({ businessId, _id: { $in: ids } })
        .select("name")
        .lean();
      const names = new Map(
        customers.map((customer) => [customer._id.toString(), customer.name]),
      );
      columns = ["customer", "currency", "openInvoices", "balanceMinor"];
      rows = [...grouped.values()].map((row) => ({
        customer: names.get(row.customerId.toString()),
        currency: row.currency,
        openInvoices: row.count,
        balanceMinor: row.balance.toString(),
      }));
    } else {
      throw new TypeError("Unsupported report type");
    }
    if (rows.length > 50000)
      throw Object.assign(
        new Error(
          "Narrow the date range; CSV exports are limited to 50,000 rows.",
        ),
        { code: "REPORT_TOO_LARGE" },
      );
    return { content: `\uFEFF${csv(rows, columns)}`, rowCount: rows.length };
  }

  async function buildCustomerCsv({ businessId }) {
    const customers = await Customer.find({ businessId, archivedAt: null })
      .sort({ name: 1, _id: 1 })
      .limit(50001)
      .lean();
    if (customers.length > 50000)
      throw Object.assign(
        new Error("Customer export is limited to 50,000 rows."),
        { code: "REPORT_TOO_LARGE" },
      );
    const columns = [
      "name",
      "email",
      "phone",
      "gstin",
      "billingLine1",
      "billingLine2",
      "city",
      "stateCode",
      "postalCode",
      "country",
      "shippingLine1",
      "shippingLine2",
      "shippingCity",
      "shippingStateCode",
      "shippingPostalCode",
      "shippingCountry",
      "notes",
      "remindersEnabled",
    ];
    const rows = customers.map((customer) => ({
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      gstin: customer.gstin,
      billingLine1: customer.billingAddress?.line1,
      billingLine2: customer.billingAddress?.line2,
      city: customer.billingAddress?.city,
      stateCode: customer.billingAddress?.stateCode,
      postalCode: customer.billingAddress?.postalCode,
      country: customer.billingAddress?.country,
      shippingLine1: customer.shippingAddress?.line1,
      shippingLine2: customer.shippingAddress?.line2,
      shippingCity: customer.shippingAddress?.city,
      shippingStateCode: customer.shippingAddress?.stateCode,
      shippingPostalCode: customer.shippingAddress?.postalCode,
      shippingCountry: customer.shippingAddress?.country,
      notes: customer.notes,
      remindersEnabled: customer.reminderPrefs?.enabled,
    }));
    return { content: `\uFEFF${csv(rows, columns)}`, rowCount: rows.length };
  }

  return { dashboard, buildCsv, buildCustomerCsv, cashflow };
}
