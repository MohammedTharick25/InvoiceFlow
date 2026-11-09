import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { tenantContext } from "../../middlewares/tenantContext.js";
import { asyncHandler } from "../../middlewares/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { createReportService } from "./report.service.js";
import { reportQuerySchema, reportTypes } from "./report.validation.js";
import { requireFeature } from "../../middlewares/billing.js";
import PDFDocument from "pdfkit";

function parseCsv(content) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const source = content.replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else cell += character;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else cell += character;
  }
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  if (quoted) throw new Error("Invalid internal CSV report.");
  return rows;
}

export function createReportRouter({ env, now } = {}) {
  const router = Router();
  const reports = createReportService({ now });
  router.use(
    authenticate({ env }),
    tenantContext,
    requireFeature("reports"),
    authorize("reports"),
  );
  router.get(
    "/dashboard",
    asyncHandler(async (req, res) => {
      const data = await reports.dashboard({
        businessId: req.businessId,
        timeZone: req.business.timezone,
      });
      res.json(data);
    }),
  );
  router.get(
    "/cashflow",
    requireFeature("cashflow", { now }),
    asyncHandler(async (req, res) => {
      res.set("Cache-Control", "private, no-store").json({
        currency: req.business.currency,
        months: await reports.cashflow({
          businessId: req.businessId,
          timeZone: req.business.timezone,
          currency: req.business.currency,
        }),
      });
    }),
  );
  router.get(
    "/customers.csv",
    requireFeature("fullExport", { now }),
    asyncHandler(async (req, res) => {
      let result;
      try {
        result = await reports.buildCustomerCsv({ businessId: req.businessId });
      } catch (error) {
        if (error.code === "REPORT_TOO_LARGE")
          throw new ApiError(422, error.code, error.message);
        throw error;
      }
      const { content, rowCount } = result;
      res
        .set("Cache-Control", "private, no-store")
        .type("text/csv; charset=utf-8")
        .set(
          "Content-Disposition",
          'attachment; filename="invoiceflow-customers.csv"',
        )
        .set("X-Report-Row-Count", String(rowCount))
        .send(content);
    }),
  );
  router.get(
    "/:type.csv",
    asyncHandler(async (req, res) => {
      if (!reportTypes.includes(req.params.type))
        throw new ApiError(
          404,
          "NOT_FOUND",
          "The requested resource was not found.",
        );
      const parsed = reportQuerySchema.safeParse(req.query);
      if (!parsed.success)
        throw new ApiError(
          422,
          "VALIDATION_FAILED",
          "The report filters are invalid.",
          parsed.error.flatten(),
        );
      try {
        const { content, rowCount } = await reports.buildCsv({
          businessId: req.businessId,
          timeZone: req.business.timezone,
          type: req.params.type,
          ...parsed.data,
        });
        res
          .set("Cache-Control", "private, no-store")
          .type("text/csv; charset=utf-8")
          .set(
            "Content-Disposition",
            `attachment; filename="invoiceflow-${req.params.type}.csv"`,
          )
          .set("X-Report-Row-Count", String(rowCount))
          .send(content);
      } catch (error) {
        if (error.code === "REPORT_TOO_LARGE")
          throw new ApiError(422, error.code, error.message);
        throw error;
      }
    }),
  );
  router.get(
    "/:type.pdf",
    asyncHandler(async (req, res) => {
      if (!reportTypes.includes(req.params.type))
        throw new ApiError(
          404,
          "NOT_FOUND",
          "The requested resource was not found.",
        );
      const parsed = reportQuerySchema.safeParse(req.query);
      if (!parsed.success)
        throw new ApiError(
          422,
          "VALIDATION_FAILED",
          "The report filters are invalid.",
          parsed.error.flatten(),
        );
      let content;
      try {
        ({ content } = await reports.buildCsv({
          businessId: req.businessId,
          timeZone: req.business.timezone,
          type: req.params.type,
          ...parsed.data,
        }));
      } catch (error) {
        if (error.code === "REPORT_TOO_LARGE")
          throw new ApiError(422, error.code, error.message);
        throw error;
      }
      const lines = parseCsv(content);
      const document = new PDFDocument({
        size: "A4",
        margin: 42,
        bufferPages: true,
      });
      res
        .set("Cache-Control", "private, no-store")
        .type("application/pdf")
        .set(
          "Content-Disposition",
          `attachment; filename="invoiceflow-${req.params.type}.pdf"`,
        );
      document.pipe(res);
      document
        .fontSize(16)
        .text(`InvoiceFlow ${req.params.type.replaceAll("-", " ")} report`);
      document
        .moveDown()
        .fontSize(8)
        .text(
          `Generated ${new Date().toISOString()} · ${lines.length - 1} rows`,
        );
      document.moveDown();
      for (const row of lines) {
        if (document.y > 760) {
          document.addPage();
        }
        document
          .fontSize(row === lines[0] ? 8 : 7)
          .text(row.join("  |  "), { width: 510, lineGap: 2 });
        document.moveDown(0.25);
      }
      document.end();
    }),
  );
  return router;
}
