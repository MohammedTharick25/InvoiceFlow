import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { tenantContext } from "../../middlewares/tenantContext.js";
import { asyncHandler } from "../../middlewares/asyncHandler.js";
import { buildBusinessRecordExport } from "./record-export.service.js";

export function createRecordExportRouter({ env, now } = {}) {
  const router = Router();
  router.use(
    authenticate({ env, now }),
    tenantContext,
    authorize("invoice_read"),
  );
  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const data = await buildBusinessRecordExport({
        businessId: req.businessId,
        now,
      });
      res
        .set("Cache-Control", "private, no-store")
        .set(
          "Content-Disposition",
          `attachment; filename="invoiceflow-records-${new Date().toISOString().slice(0, 10)}.json"`,
        )
        .type("application/json")
        .send(JSON.stringify(data));
    }),
  );
  return router;
}
