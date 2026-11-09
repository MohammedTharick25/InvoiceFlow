import { Subscription } from "../modules/billing/subscription.model.js";
import { Customer } from "../modules/customers/customer.model.js";
import { evaluateEntitlements } from "../modules/billing/entitlements.service.js";
import plans from "../config/plans.json" with { type: "json" };
import { ApiError } from "../utils/ApiError.js";

export function requireWritable({ now = () => new Date() } = {}) {
  return async (req, _res, next) => {
    try {
      const subscription = await Subscription.findOne({
        businessId: req.businessId,
      }).lean();
      const entitlements = evaluateEntitlements({
        subscription,
        business: req.business,
        now: now(),
      });
      if (entitlements.readOnly) {
        return next(
          new ApiError(
            402,
            "SUBSCRIPTION_READ_ONLY",
            "This workspace is read-only until a plan is active.",
          ),
        );
      }
      req.entitlements = entitlements;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireFeature(feature, { now = () => new Date() } = {}) {
  return async (req, _res, next) => {
    try {
      const subscription = await Subscription.findOne({
        businessId: req.businessId,
      }).lean();
      const entitlements = evaluateEntitlements({
        subscription,
        business: req.business,
        now: now(),
      });
      if (!entitlements.features[feature]) {
        const requiredPlan =
          Object.entries(plans.plans).find(
            ([, plan]) => plan.features?.[feature],
          )?.[0] ?? "king";
        return next(
          new ApiError(
            402,
            "FEATURE_NOT_IN_PLAN",
            "This feature is not available on the current plan.",
            { requiredPlan },
          ),
        );
      }
      req.entitlements = entitlements;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireCustomerCapacity({ now = () => new Date() } = {}) {
  return async (req, _res, next) => {
    try {
      const subscription = await Subscription.findOne({
        businessId: req.businessId,
      }).lean();
      const entitlements = evaluateEntitlements({
        subscription,
        business: req.business,
        now: now(),
      });
      const limit = entitlements.limits.activeCustomers;
      if (limit !== null) {
        const count = await Customer.countDocuments({
          businessId: req.businessId,
          archivedAt: null,
        });
        if (count >= limit)
          return next(
            new ApiError(
              402,
              "PLAN_LIMIT_REACHED",
              "The plan's active customer limit has been reached.",
              { limit, resource: "active_customers" },
            ),
          );
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
