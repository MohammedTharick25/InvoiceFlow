import jwt from "jsonwebtoken";
import { RefreshToken } from "../modules/auth/refresh-token.model.js";
import { User } from "../modules/users/user.model.js";
import { ApiError } from "../utils/ApiError.js";

export function authenticate({ env, now = () => new Date() }) {
  return async (req, _res, next) => {
    try {
      const match = /^Bearer ([^ ]+)$/i.exec(req.get("authorization") ?? "");
      if (!match)
        throw new ApiError(
          401,
          "AUTHENTICATION_REQUIRED",
          "Sign in to continue.",
        );
      let claims;
      try {
        claims = jwt.verify(match[1], env.JWT_ACCESS_SECRET, {
          issuer: "invoiceflow",
          audience: "invoiceflow-api",
          algorithms: ["HS256"],
        });
      } catch {
        throw new ApiError(
          401,
          "ACCESS_TOKEN_INVALID",
          "Your session has expired. Sign in again.",
        );
      }
      if (typeof claims !== "object" || !claims.sub || !claims.sid) {
        throw new ApiError(
          401,
          "ACCESS_TOKEN_INVALID",
          "Your session has expired. Sign in again.",
        );
      }
      const [user, session] = await Promise.all([
        User.findOne({
          _id: claims.sub,
          status: "active",
          emailVerifiedAt: { $ne: null },
        }),
        RefreshToken.findOne({
          _id: claims.sid,
          userId: claims.sub,
          revokedAt: null,
          expiresAt: { $gt: now() },
        }),
      ]);
      if (!user || !session)
        throw new ApiError(
          401,
          "SESSION_REVOKED",
          "Your session has expired. Sign in again.",
        );
      req.auth = {
        userId: user._id,
        sessionId: session._id,
        membershipId: claims.membershipId ?? null,
      };
      req.user = user;
      next();
    } catch (error) {
      next(error);
    }
  };
}
