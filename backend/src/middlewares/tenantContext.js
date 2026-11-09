import { BusinessMembership } from "../modules/businesses/business-membership.model.js";
import { Business } from "../modules/businesses/business.model.js";
import { ApiError } from "../utils/ApiError.js";

export async function tenantContext(req, _res, next) {
  try {
    if (req.body && Object.hasOwn(req.body, "businessId")) {
      throw new ApiError(
        400,
        "BUSINESS_ID_NOT_ALLOWED",
        "Business scope is selected from the signed-in membership.",
      );
    }
    if (!req.auth?.membershipId) {
      throw new ApiError(
        409,
        "ONBOARDING_REQUIRED",
        "Create your business workspace before continuing.",
      );
    }
    const membership = await BusinessMembership.findOne({
      _id: req.auth.membershipId,
      userId: req.auth.userId,
      status: "active",
    });
    if (!membership)
      throw new ApiError(
        404,
        "NOT_FOUND",
        "The requested resource was not found.",
      );
    const business = await Business.findById(membership.businessId);
    if (!business)
      throw new ApiError(
        404,
        "NOT_FOUND",
        "The requested resource was not found.",
      );
    req.membership = membership;
    req.business = business;
    req.businessId = business._id;
    req.role = membership.role;
    next();
  } catch (error) {
    next(error);
  }
}
