import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import nodemailer from "nodemailer";
import { createResendMailer } from "./resend-mailer.js";
import { createHmac, createHash, randomBytes, randomUUID } from "node:crypto";
import { ApiError } from "../../utils/ApiError.js";
import { AuthToken } from "./auth-token.model.js";
import { RefreshToken } from "./refresh-token.model.js";
import { User } from "../users/user.model.js";
import {
  isBreachedPassword,
  validatePasswordShape,
} from "./password-security.js";

const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const AUTH_TOKEN_TTL_MS = 60 * 60 * 1000;
const LOCK_THRESHOLD = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const dummyPasswordHash = bcrypt.hash(randomBytes(32).toString("hex"), 12);
const genericCredentialsError = () =>
  new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");

function tokenDigest(value, secret) {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function createAccessToken(user, membership, sessionId, env) {
  return jwt.sign(
    {
      membershipId: membership?._id?.toString(),
      role: membership?.role,
      sid: sessionId.toString(),
    },
    env.JWT_ACCESS_SECRET,
    {
      subject: user._id.toString(),
      issuer: "invoiceflow",
      audience: "invoiceflow-api",
      expiresIn: ACCESS_TTL_SECONDS,
    },
  );
}

function cookieOptions(env) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/auth",
    maxAge: REFRESH_TTL_MS,
  };
}

function sendRefreshCookie(res, raw, env) {
  res.cookie("invoiceflow_refresh", raw, cookieOptions(env));
}

function clearRefreshCookie(res, env) {
  res.clearCookie("invoiceflow_refresh", {
    ...cookieOptions(env),
    maxAge: undefined,
  });
}

async function createAuthToken({ user, type, env, now, mailer, targetEmail }) {
  await AuthToken.updateMany(
    { userId: user._id, type, usedAt: null },
    { $set: { usedAt: now } },
  );
  const raw = randomBytes(32).toString("base64url");
  const authToken = await AuthToken.create({
    userId: user._id,
    type,
    targetEmail: targetEmail ?? user.email,
    tokenHash: createHash("sha256").update(raw).digest("hex"),
    expiresAt: new Date(now.getTime() + AUTH_TOKEN_TTL_MS),
  });
  const path = type === "verify_email" ? "verify-email" : "reset-password";
  const link = `${env.FRONTEND_ORIGIN.split(",")[0]}/auth/${path}#token=${encodeURIComponent(raw)}`;
  const emailConfigured =
    env.EMAIL_PROVIDER === "resend"
      ? Boolean(env.RESEND_API_KEY)
      : Boolean(env.EMAIL_URL);
  if (emailConfigured) {
    const transport =
      mailer ??
      (env.EMAIL_PROVIDER === "resend"
        ? createResendMailer({ apiKey: env.RESEND_API_KEY })
        : nodemailer.createTransport(env.EMAIL_URL));
    try {
      const message = {
        from: env.DEFAULT_FROM_EMAIL,
        to: targetEmail ?? user.email,
        subject:
          type === "verify_email"
            ? "Verify your InvoiceFlow email"
            : "Reset your InvoiceFlow password",
        text: `Use this one-time link within one hour: ${link}`,
      };
      if (env.EMAIL_PROVIDER === "resend") {
        await transport.sendMail({
          ...message,
          idempotencyKey: `${type}/${authToken._id}`,
        });
      } else {
        await transport.sendMail(message);
      }
    } catch {
      throw new ApiError(
        503,
        "EMAIL_DELIVERY_FAILED",
        "Account email could not be delivered. Please try again later.",
      );
    }
    return {};
  }
  if (env.NODE_ENV === "production") {
    throw new ApiError(
      503,
      "EMAIL_NOT_CONFIGURED",
      "Account email delivery is not configured.",
    );
  }
  // Local development only: do not log tokens; return them to the local caller.
  return { developmentToken: raw };
}

async function createSession({
  user,
  membership,
  req,
  res,
  env,
  now,
  familyId,
}) {
  const raw = randomBytes(48).toString("base64url");
  const expiresAt = new Date(now.getTime() + REFRESH_TTL_MS);
  const session = await RefreshToken.create({
    userId: user._id,
    tokenHash: tokenDigest(raw, env.JWT_REFRESH_SECRET),
    familyId: familyId ?? randomUUID(),
    expiresAt,
    userAgent: (req.get("user-agent") ?? "").slice(0, 500),
    ip: (req.ip ?? "").slice(0, 100),
  });
  sendRefreshCookie(res, raw, env);
  return {
    accessToken: createAccessToken(user, membership, session._id, env),
    tokenType: "Bearer",
    expiresIn: ACCESS_TTL_SECONDS,
    user: publicUser(user),
    business: membership
      ? { id: membership.businessId.toString(), role: membership.role }
      : null,
  };
}

function publicUser(user) {
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    phone: user.phone,
    emailVerifiedAt: user.emailVerifiedAt,
    theme: user.theme,
  };
}

function authTokenHash(raw) {
  return createHash("sha256").update(raw).digest("hex");
}

export function createAuthService({
  env,
  now = () => new Date(),
  passwordChecker = isBreachedPassword,
  mailer,
} = {}) {
  if (!env) throw new TypeError("env is required");

  async function checkNewPassword(password) {
    validatePasswordShape(password);
    if (await passwordChecker(password)) {
      throw new ApiError(
        422,
        "PASSWORD_BREACHED",
        "Choose a password that has not appeared in known data breaches.",
      );
    }
  }

  async function register(input) {
    const email = input.email.toLowerCase();
    let user = await User.findOne({ email }).select("+passwordHash");
    if (user?.emailVerifiedAt) {
      return {
        status: 202,
        body: {
          message:
            "If this address can be registered, verification instructions will be sent.",
        },
      };
    }
    if (user && !(await bcrypt.compare(input.password, user.passwordHash))) {
      return {
        status: 202,
        body: {
          message:
            "If this address can be registered, verification instructions will be sent.",
        },
      };
    }
    await checkNewPassword(input.password);
    if (!user) {
      const passwordHash = await bcrypt.hash(input.password, 12);
      try {
        user = await User.create({
          email,
          passwordHash,
          name: input.name,
          phone: input.phone,
        });
      } catch (error) {
        if (error?.code !== 11000) throw error;
        user = await User.findOne({ email }).select("+passwordHash");
        if (
          !user ||
          !(await bcrypt.compare(input.password, user.passwordHash))
        ) {
          return {
            status: 202,
            body: {
              message:
                "If this address can be registered, verification instructions will be sent.",
            },
          };
        }
      }
    }
    const local = await createAuthToken({
      user,
      type: "verify_email",
      env,
      now: now(),
      mailer,
      targetEmail: user.email,
    });
    return {
      status: 202,
      body: {
        message:
          "If this address can be registered, verification instructions will be sent.",
        ...local,
      },
    };
  }

  async function verifyEmail(raw) {
    const current = now();
    const session = await mongoose.startSession();
    let token;
    try {
      await session.withTransaction(async () => {
        token = await AuthToken.findOneAndUpdate(
          {
            type: "verify_email",
            tokenHash: authTokenHash(raw),
            usedAt: null,
            expiresAt: { $gt: current },
          },
          { $set: { usedAt: current } },
          { returnDocument: "after", session },
        );
        if (!token) return;
        const user = await User.findById(token.userId).session(session);
        if (!user) return;
        if (user.pendingEmail && user.pendingEmail === token.targetEmail) {
          await User.updateOne(
            { _id: user._id, pendingEmail: token.targetEmail },
            {
              $set: {
                email: token.targetEmail,
                emailVerifiedAt: current,
                pendingEmail: null,
              },
            },
            { session },
          );
          await RefreshToken.updateMany(
            { userId: user._id, revokedAt: null },
            { $set: { revokedAt: current } },
            { session },
          );
        } else if (!user.emailVerifiedAt && user.email === token.targetEmail) {
          await User.updateOne(
            { _id: user._id, emailVerifiedAt: null },
            { $set: { emailVerifiedAt: current } },
            { session },
          );
        } else {
          token = null;
        }
      });
    } finally {
      await session.endSession();
    }
    if (!token)
      throw new ApiError(
        400,
        "AUTH_TOKEN_INVALID",
        "This link is invalid or has expired.",
      );
    return { message: "Email verified. You can now sign in." };
  }

  async function login(input, req, res) {
    const email = input.email.toLowerCase();
    const user = await User.findOne({ email }).select("+passwordHash");
    if (!user) {
      await bcrypt.compare(input.password, await dummyPasswordHash);
      throw genericCredentialsError();
    }
    const passwordMatches = await bcrypt.compare(
      input.password,
      user.passwordHash,
    );
    const current = now();
    if (user.lockUntil && user.lockUntil > current)
      throw genericCredentialsError();
    if (!passwordMatches || user.status !== "active" || !user.emailVerifiedAt) {
      const nextCount = { $add: [{ $ifNull: ["$failedLoginCount", 0] }, 1] };
      await User.collection.updateOne(
        {
          _id: user._id,
          $or: [{ lockUntil: null }, { lockUntil: { $lte: current } }],
        },
        [
          {
            $set: {
              failedLoginCount: {
                $cond: [{ $gte: [nextCount, LOCK_THRESHOLD] }, 0, nextCount],
              },
              lockUntil: {
                $cond: [
                  { $gte: [nextCount, LOCK_THRESHOLD] },
                  new Date(current.getTime() + LOCK_DURATION_MS),
                  "$lockUntil",
                ],
              },
            },
          },
        ],
      );
      throw genericCredentialsError();
    }
    await User.updateOne(
      { _id: user._id },
      { $set: { failedLoginCount: 0, lockUntil: null, lastLoginAt: current } },
    );
    const membership = await mongooseMembershipForLogin(user._id);
    return createSession({ user, membership, req, res, env, now: current });
  }

  async function refresh(raw, req, res) {
    const current = now();
    const existing = await RefreshToken.findOne({
      tokenHash: tokenDigest(raw, env.JWT_REFRESH_SECRET),
    });
    if (!existing)
      throw new ApiError(
        401,
        "REFRESH_TOKEN_INVALID",
        "Your session has expired. Sign in again.",
      );
    if (existing.revokedAt || existing.replacedBy) {
      await RefreshToken.updateMany(
        { familyId: existing.familyId, revokedAt: null },
        { $set: { revokedAt: current } },
      );
      throw new ApiError(
        401,
        "REFRESH_TOKEN_REUSE_DETECTED",
        "Your session was revoked. Sign in again.",
      );
    }
    if (existing.expiresAt <= current)
      throw new ApiError(
        401,
        "REFRESH_TOKEN_INVALID",
        "Your session has expired. Sign in again.",
      );
    const user = await User.findById(existing.userId);
    if (!user || user.status !== "active" || !user.emailVerifiedAt) {
      await RefreshToken.updateMany(
        { familyId: existing.familyId, revokedAt: null },
        { $set: { revokedAt: current } },
      );
      throw new ApiError(
        401,
        "REFRESH_TOKEN_INVALID",
        "Your session has expired. Sign in again.",
      );
    }
    const membership = await mongooseMembershipForLogin(user._id);
    const rawNext = randomBytes(48).toString("base64url");
    const replacement = await RefreshToken.create({
      userId: user._id,
      tokenHash: tokenDigest(rawNext, env.JWT_REFRESH_SECRET),
      familyId: existing.familyId,
      expiresAt: new Date(current.getTime() + REFRESH_TTL_MS),
      userAgent: (req.get("user-agent") ?? "").slice(0, 500),
      ip: (req.ip ?? "").slice(0, 100),
    });
    const result = await RefreshToken.updateOne(
      {
        _id: existing._id,
        revokedAt: null,
        replacedBy: null,
        expiresAt: { $gt: current },
      },
      { $set: { revokedAt: current, replacedBy: replacement._id } },
    );
    if (result.modifiedCount !== 1) {
      await RefreshToken.deleteOne({ _id: replacement._id });
      await RefreshToken.updateMany(
        { familyId: existing.familyId, revokedAt: null },
        { $set: { revokedAt: current } },
      );
      throw new ApiError(
        401,
        "REFRESH_TOKEN_REUSE_DETECTED",
        "Your session was revoked. Sign in again.",
      );
    }
    sendRefreshCookie(res, rawNext, env);
    return {
      accessToken: createAccessToken(user, membership, replacement._id, env),
      tokenType: "Bearer",
      expiresIn: ACCESS_TTL_SECONDS,
      user: publicUser(user),
      business: membership
        ? { id: membership.businessId.toString(), role: membership.role }
        : null,
    };
  }

  async function logout(sessionId, res) {
    if (sessionId)
      await RefreshToken.updateOne(
        { _id: sessionId, revokedAt: null },
        { $set: { revokedAt: now() } },
      );
    clearRefreshCookie(res, env);
    return { message: "Signed out." };
  }

  async function logoutAll(userId, res) {
    await RefreshToken.updateMany(
      { userId, revokedAt: null },
      { $set: { revokedAt: now() } },
    );
    clearRefreshCookie(res, env);
    return { message: "All sessions have been signed out." };
  }

  async function forgotPassword(email) {
    const user = await User.findOne({
      email: email.toLowerCase(),
      status: "active",
    });
    if (!user)
      return {
        message:
          "If an account exists for that address, reset instructions will be sent.",
      };
    const local = await createAuthToken({
      user,
      type: "reset_password",
      env,
      now: now(),
      mailer,
    });
    return {
      message:
        "If an account exists for that address, reset instructions will be sent.",
      ...local,
    };
  }

  async function resetPassword(raw, password) {
    await checkNewPassword(password);
    const current = now();
    const session = await mongoose.startSession();
    let updated = false;
    try {
      await session.withTransaction(async () => {
        const token = await AuthToken.findOneAndUpdate(
          {
            type: "reset_password",
            tokenHash: authTokenHash(raw),
            usedAt: null,
            expiresAt: { $gt: current },
          },
          { $set: { usedAt: current } },
          { returnDocument: "after", session },
        );
        if (!token) return;
        const passwordHash = await bcrypt.hash(password, 12);
        await User.updateOne(
          { _id: token.userId },
          { $set: { passwordHash, failedLoginCount: 0, lockUntil: null } },
          { session },
        );
        await RefreshToken.updateMany(
          { userId: token.userId, revokedAt: null },
          { $set: { revokedAt: current } },
          { session },
        );
        updated = true;
      });
    } finally {
      await session.endSession();
    }
    if (!updated)
      throw new ApiError(
        400,
        "AUTH_TOKEN_INVALID",
        "This link is invalid or has expired.",
      );
    return { message: "Password changed. Sign in with your new password." };
  }

  async function changePassword(userId, currentPassword, password) {
    await checkNewPassword(password);
    const user = await User.findById(userId).select("+passwordHash");
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw genericCredentialsError();
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const current = now();
    await User.updateOne(
      { _id: userId },
      { $set: { passwordHash, failedLoginCount: 0, lockUntil: null } },
    );
    await RefreshToken.updateMany(
      { userId, revokedAt: null },
      { $set: { revokedAt: current } },
    );
    return { message: "Password changed. Sign in again on your devices." };
  }

  async function changeEmail(userId, email, password) {
    const targetEmail = email.toLowerCase();
    const user = await User.findById(userId).select("+passwordHash");
    if (!user || !(await bcrypt.compare(password, user.passwordHash)))
      throw genericCredentialsError();
    if (targetEmail === user.email)
      throw new ApiError(
        422,
        "EMAIL_UNCHANGED",
        "Enter a different email address.",
      );
    const taken = await User.exists({
      email: targetEmail,
      _id: { $ne: userId },
    });
    if (taken)
      throw new ApiError(
        409,
        "EMAIL_UNAVAILABLE",
        "That email address cannot be used.",
      );
    await User.updateOne(
      { _id: userId },
      { $set: { pendingEmail: targetEmail } },
    );
    const local = await createAuthToken({
      user,
      type: "verify_email",
      env,
      now: now(),
      mailer,
      targetEmail,
    });
    return {
      message: "Verification instructions have been sent to the new address.",
      ...local,
    };
  }

  return {
    register,
    verifyEmail,
    login,
    refresh,
    logout,
    logoutAll,
    forgotPassword,
    resetPassword,
    changePassword,
    changeEmail,
    publicUser,
  };
}

async function mongooseMembershipForLogin(userId) {
  const { BusinessMembership } =
    await import("../businesses/business-membership.model.js");
  return BusinessMembership.findOne({ userId, status: "active" }).sort({
    slot: 1,
  });
}

export function readRefreshCookie(req) {
  return req.cookies?.invoiceflow_refresh ?? "";
}
