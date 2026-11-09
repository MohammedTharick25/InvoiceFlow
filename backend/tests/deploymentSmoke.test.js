import { describe, expect, it, vi } from "vitest";
import { runDeploymentSmoke } from "../scripts/deployment-smoke.mjs";

const env = {
  STAGING_API_URL: "https://api.example.test",
  STAGING_APP_URL: "https://app.example.test",
  STAGING_MARKETING_URL: "https://www.example.test",
  STAGING_APP_ORIGIN: "https://app.example.test",
};

function response(status, headers = {}, body = "") {
  return new Response(status === 204 ? null : body, { status, headers });
}

describe("read-only deployment smoke checks", () => {
  it("checks staging URLs, security headers, health, CORS, and auth", async () => {
    const fetchMock = vi.fn(async (input, options = {}) => {
      const url = new URL(input);
      if (
        url.hostname === "app.example.test" ||
        url.hostname === "www.example.test"
      ) {
        return response(
          200,
          {
            "content-type": "text/html",
            "content-security-policy":
              "default-src 'self'; frame-ancestors 'none'",
            "strict-transport-security": "max-age=31536000",
            "x-content-type-options": "nosniff",
            "referrer-policy": "no-referrer",
          },
          "ok",
        );
      }
      if (url.pathname === "/health") {
        return response(
          200,
          {
            "content-type": "application/json",
            "content-security-policy": "default-src 'self'",
            "strict-transport-security": "max-age=31536000",
            "x-content-type-options": "nosniff",
            "referrer-policy": "no-referrer",
          },
          '{"status":"ok"}',
        );
      }
      if (options.method === "OPTIONS") {
        return response(204, {
          "access-control-allow-origin": env.STAGING_APP_ORIGIN,
        });
      }
      return response(401);
    });
    const checks = await runDeploymentSmoke(env, fetchMock);
    expect(checks).toHaveLength(24);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(
      fetchMock.mock.calls.every(
        ([, options]) =>
          !["POST", "PUT", "PATCH", "DELETE"].includes(options?.method),
      ),
    ).toBe(true);
  });

  it("rejects missing values and non-HTTPS endpoints before making requests", async () => {
    const fetchMock = vi.fn();
    await expect(runDeploymentSmoke({}, fetchMock)).rejects.toThrow(
      "STAGING_API_URL",
    );
    await expect(
      runDeploymentSmoke(
        { ...env, STAGING_API_URL: "http://api.example.test" },
        fetchMock,
      ),
    ).rejects.toThrow("must use HTTPS");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails when a protected endpoint responds without authentication", async () => {
    const fetchMock = vi.fn(async (input, options = {}) => {
      const url = new URL(input);
      if (url.hostname !== "api.example.test") {
        return response(200, {
          "content-type": "text/html",
          "content-security-policy": "frame-ancestors 'none'",
          "strict-transport-security": "max-age=31536000",
          "x-content-type-options": "nosniff",
          "referrer-policy": "no-referrer",
        });
      }
      if (url.pathname === "/health")
        return response(
          200,
          {
            "content-type": "application/json",
            "content-security-policy": "default-src 'self'",
            "strict-transport-security": "max-age=31536000",
            "x-content-type-options": "nosniff",
            "referrer-policy": "no-referrer",
          },
          '{"status":"ok"}',
        );
      if (options.method === "OPTIONS")
        return response(204, {
          "access-control-allow-origin": env.STAGING_APP_ORIGIN,
        });
      return response(200);
    });
    await expect(runDeploymentSmoke(env, fetchMock)).rejects.toThrow(
      "Unauthenticated customer request is denied",
    );
  });
});
