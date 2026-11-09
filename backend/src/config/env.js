import { z } from "zod";

const schema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    MONGODB_URI: z.string().min(1),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    FRONTEND_ORIGIN: z.string().url().default("http://localhost:5173"),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    EMAIL_URL: z.string().default(""),
    DEFAULT_FROM_EMAIL: z.string().email().default("auth@invoiceflow.local"),
    MAX_BUSINESSES_PER_USER: z.coerce.number().int().min(1).max(10).default(1),
    CLOUDINARY_CLOUD_NAME: z.string().default(""),
    CLOUDINARY_API_KEY: z.string().default(""),
    CLOUDINARY_API_SECRET: z.string().default(""),
    INVOICE_STORAGE_PROVIDER: z.enum(["local", "cloudinary"]).default("local"),
    RAZORPAY_KEY_ID: z.string().default(""),
    RAZORPAY_KEY_SECRET: z.string().default(""),
    RAZORPAY_WEBHOOK_SECRET: z.string().default(""),
  })
  .strict();

export function parseEnv(input = process.env) {
  const parsed = schema.parse(
    Object.fromEntries(
      Object.keys(schema.shape).map((key) => [key, input[key]]),
    ),
  );
  assertProductionConfiguration(parsed);
  if (
    parsed.INVOICE_STORAGE_PROVIDER === "cloudinary" &&
    (!parsed.CLOUDINARY_CLOUD_NAME ||
      !parsed.CLOUDINARY_API_KEY ||
      !parsed.CLOUDINARY_API_SECRET)
  ) {
    throw new z.ZodError([
      {
        code: "custom",
        path: ["INVOICE_STORAGE_PROVIDER"],
        message:
          "Cloudinary storage requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.",
      },
    ]);
  }
  return parsed;
}

export function safeParseEnv(input = process.env) {
  try {
    return { success: true, data: parseEnv(input) };
  } catch (error) {
    if (error instanceof z.ZodError) return { success: false, error };
    throw error;
  }
}

function assertProductionConfiguration(env) {
  if (env.NODE_ENV !== "production") return;
  const issues = [];
  for (const key of ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"]) {
    if (env[key].startsWith("local-development-")) {
      issues.push({
        code: "custom",
        path: [key],
        message: `${key} must be replaced before production.`,
      });
    }
  }
  if (!env.EMAIL_URL) {
    issues.push({
      code: "custom",
      path: ["EMAIL_URL"],
      message:
        "EMAIL_URL is required for production account verification and password recovery.",
    });
  }
  if (env.DEFAULT_FROM_EMAIL.endsWith(".local")) {
    issues.push({
      code: "custom",
      path: ["DEFAULT_FROM_EMAIL"],
      message:
        "Set DEFAULT_FROM_EMAIL to a real sender address before production.",
    });
  }
  if (issues.length) throw new z.ZodError(issues);
}
