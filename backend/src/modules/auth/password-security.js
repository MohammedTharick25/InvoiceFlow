import { createHash } from "node:crypto";
import { ApiError } from "../../utils/ApiError.js";

export async function isBreachedPassword(password, fetchImpl = fetch) {
  const sha1 = createHash("sha1")
    .update(password, "utf8")
    .digest("hex")
    .toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetchImpl(
      `https://api.pwnedpasswords.com/range/${prefix}`,
      {
        headers: {
          "Add-Padding": "true",
          "User-Agent": "InvoiceFlow-password-check",
        },
        signal: controller.signal,
      },
    );
    if (!response.ok)
      throw new Error(`Password range service returned ${response.status}.`);
    return (await response.text()).split(/\r?\n/).some((line) => {
      const [candidate, count] = line.split(":");
      return candidate?.toUpperCase() === suffix && Number(count) > 0;
    });
  } catch {
    throw new ApiError(
      503,
      "BREACH_CHECK_UNAVAILABLE",
      "Password safety could not be checked. Please try again.",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function validatePasswordShape(password) {
  if (
    typeof password !== "string" ||
    password.length < 12 ||
    Buffer.byteLength(password) > 72
  ) {
    throw new ApiError(
      422,
      "PASSWORD_REQUIREMENTS_NOT_MET",
      "Use a password with at least 12 characters.",
    );
  }
}
