import rateLimit from "express-rate-limit";
import { ApiError } from "../utils/ApiError.js";

export function createGlobalRateLimiter({ limit = 120 } = {}) {
  return rateLimit({
    windowMs: 60_000,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
}

export function createAuthRateLimiter({ limit = 30 } = {}) {
  return rateLimit({
    windowMs: 15 * 60_000,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler(_req, _res, next) {
      next(
        new ApiError(
          429,
          "AUTH_RATE_LIMITED",
          "Too many account requests. Please try again later.",
        ),
      );
    },
  });
}
