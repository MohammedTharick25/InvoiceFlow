import { Router } from "express";
import { asyncHandler } from "../../middlewares/asyncHandler.js";
import { authenticate } from "../../middlewares/authenticate.js";
import { ApiError } from "../../utils/ApiError.js";
import { createAuthService, readRefreshCookie } from "./auth.service.js";
import {
  changePasswordSchema,
  emailChangeSchema,
  emailSchema,
  loginSchema,
  profileSchema,
  registerSchema,
  resetPasswordSchema,
  tokenSchema,
} from "./auth.validation.js";
import { User } from "../users/user.model.js";
import { RefreshToken } from "./refresh-token.model.js";

function parse(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ApiError(
      422,
      "VALIDATION_FAILED",
      "The request contains invalid fields.",
      result.error.flatten(),
    );
  }
  return result.data;
}

export function createAuthRouter({ env, passwordChecker, mailer, now } = {}) {
  const router = Router();
  const clock = now ?? (() => new Date());
  const auth = createAuthService({ env, passwordChecker, mailer, now: clock });
  const requireUser = authenticate({ env, now: clock });

  router.post(
    "/register",
    asyncHandler(async (req, res) => {
      const result = await auth.register(parse(registerSchema, req.body));
      res.status(result.status).json(result.body);
    }),
  );
  router.post(
    "/verify-email",
    asyncHandler(async (req, res) => {
      const { token } = parse(tokenSchema, req.body);
      res.json(await auth.verifyEmail(token));
    }),
  );
  router.post(
    "/login",
    asyncHandler(async (req, res) => {
      const body = parse(loginSchema, req.body);
      const result = await auth.login(body, req, res);
      res.json(result);
    }),
  );
  router.post(
    "/refresh",
    asyncHandler(async (req, res) => {
      const raw = readRefreshCookie(req);
      if (!raw)
        throw new ApiError(
          401,
          "REFRESH_TOKEN_INVALID",
          "Your session has expired. Sign in again.",
        );
      res.json(await auth.refresh(raw, req, res));
    }),
  );
  router.post(
    "/logout",
    requireUser,
    asyncHandler(async (req, res) => {
      res.json(await auth.logout(req.auth.sessionId, res));
    }),
  );
  router.post(
    "/logout-all",
    requireUser,
    asyncHandler(async (req, res) => {
      res.json(await auth.logoutAll(req.auth.userId, res));
    }),
  );
  router.post(
    "/forgot-password",
    asyncHandler(async (req, res) => {
      const { email } = parse(emailSchema, req.body);
      res.json(await auth.forgotPassword(email));
    }),
  );
  router.post(
    "/reset-password",
    asyncHandler(async (req, res) => {
      const { token, password } = parse(resetPasswordSchema, req.body);
      res.json(await auth.resetPassword(token, password));
    }),
  );
  router.post(
    "/change-password",
    requireUser,
    asyncHandler(async (req, res) => {
      const { currentPassword, password } = parse(
        changePasswordSchema,
        req.body,
      );
      res.json(
        await auth.changePassword(req.auth.userId, currentPassword, password),
      );
    }),
  );
  router.get(
    "/me",
    requireUser,
    asyncHandler(async (req, res) => {
      res.json({ user: auth.publicUser(req.user) });
    }),
  );
  router.put(
    "/me",
    requireUser,
    asyncHandler(async (req, res) => {
      const profile = parse(profileSchema, req.body);
      await User.updateOne({ _id: req.auth.userId }, { $set: profile });
      res.json({ user: auth.publicUser(await User.findById(req.auth.userId)) });
    }),
  );
  router.put(
    "/me/email",
    requireUser,
    asyncHandler(async (req, res) => {
      const { email, password } = parse(emailChangeSchema, req.body);
      res.json(await auth.changeEmail(req.auth.userId, email, password));
    }),
  );
  router.get(
    "/sessions",
    requireUser,
    asyncHandler(async (req, res) => {
      const sessions = await RefreshToken.find({
        userId: req.auth.userId,
        revokedAt: null,
        expiresAt: { $gt: clock() },
      })
        .sort({ createdAt: -1 })
        .select("userAgent ip createdAt expiresAt");
      res.json({
        sessions: sessions.map((session) => ({
          id: session._id.toString(),
          userAgent: session.userAgent,
          ip: session.ip,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          current: session._id.equals(req.auth.sessionId),
        })),
      });
    }),
  );
  router.delete(
    "/sessions/:sessionId",
    requireUser,
    asyncHandler(async (req, res) => {
      const result = await RefreshToken.updateOne(
        { _id: req.params.sessionId, userId: req.auth.userId, revokedAt: null },
        { $set: { revokedAt: clock() } },
      );
      if (!result.matchedCount)
        throw new ApiError(
          404,
          "NOT_FOUND",
          "The requested resource was not found.",
        );
      res.json({ message: "Session signed out." });
    }),
  );
  return router;
}
