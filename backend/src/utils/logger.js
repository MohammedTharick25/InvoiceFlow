import pino from "pino";

export function createLogger(options = {}) {
  const { stream, ...overrides } = options;
  return pino(
    {
      level: process.env.LOG_LEVEL ?? "info",
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "headers.authorization",
          "headers.cookie",
          "password",
          "passwordHash",
          "token",
          "accessToken",
          "refreshToken",
          "SMTP_PASSWORD",
          "EMAIL_URL",
          "RAZORPAY_KEY_SECRET",
          "RAZORPAY_WEBHOOK_SECRET",
          "CLOUDINARY_API_SECRET",
          "recipient",
          "email",
        ],
        censor: "[REDACTED]",
      },
      messageKey: "message",
      base: undefined,
      ...overrides,
    },
    stream,
  );
}

export const logger = createLogger();
