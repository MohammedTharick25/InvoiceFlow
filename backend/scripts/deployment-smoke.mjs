const requiredEnv = [
  "STAGING_API_URL",
  "STAGING_APP_URL",
  "STAGING_MARKETING_URL",
  "STAGING_APP_ORIGIN",
];

function validateHttpsUrl(value, name) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute HTTPS URL.`);
  }
  if (parsed.protocol !== "https:") throw new Error(`${name} must use HTTPS.`);
  return parsed;
}

async function request(fetchImpl, url, options = {}) {
  return fetchImpl(url, {
    ...options,
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
  });
}

export async function runDeploymentSmoke(env = process.env, fetchImpl = fetch) {
  const missing = requiredEnv.filter((key) => !env[key]);
  if (missing.length)
    throw new Error(`Set required staging URLs: ${missing.join(", ")}`);
  const api = validateHttpsUrl(env.STAGING_API_URL, "STAGING_API_URL");
  const app = validateHttpsUrl(env.STAGING_APP_URL, "STAGING_APP_URL");
  const marketing = validateHttpsUrl(
    env.STAGING_MARKETING_URL,
    "STAGING_MARKETING_URL",
  );
  const origin = new URL(env.STAGING_APP_ORIGIN);
  if (
    origin.protocol !== "https:" ||
    origin.origin !== env.STAGING_APP_ORIGIN
  ) {
    throw new Error(
      "STAGING_APP_ORIGIN must be an HTTPS origin without a path.",
    );
  }
  const checks = [];
  const expect = (condition, message) => {
    if (!condition) throw new Error(message);
    checks.push(message);
  };

  for (const [name, url] of [
    ["app", app],
    ["marketing", marketing],
  ]) {
    const response = await request(fetchImpl, url);
    const headers = response.headers;
    expect(response.ok, `${name} responds successfully`);
    expect(
      (headers.get("content-type") ?? "").includes("text/html"),
      `${name} returns HTML`,
    );
    expect(
      Boolean(headers.get("content-security-policy")),
      `${name} has a CSP`,
    );
    expect(
      Boolean(headers.get("strict-transport-security")),
      `${name} has HSTS`,
    );
    expect(
      Boolean(headers.get("x-content-type-options")),
      `${name} has nosniff protection`,
    );
    expect(
      Boolean(headers.get("referrer-policy")),
      `${name} has a referrer policy`,
    );
    expect(
      Boolean(
        headers.get("x-frame-options") ||
        headers.get("content-security-policy")?.includes("frame-ancestors"),
      ),
      `${name} restricts framing`,
    );
  }

  const health = await request(fetchImpl, new URL("/health", api));
  expect(health.ok, "API health endpoint responds successfully");
  expect(
    (health.headers.get("content-type") ?? "").includes("application/json"),
    "API health returns JSON",
  );
  expect((await health.json()).status === "ok", "API health reports ok");
  expect(
    Boolean(health.headers.get("content-security-policy")),
    "API has a CSP",
  );
  expect(
    Boolean(health.headers.get("strict-transport-security")),
    "API has HSTS",
  );
  expect(
    health.headers.get("x-content-type-options") === "nosniff",
    "API has nosniff protection",
  );
  expect(
    Boolean(health.headers.get("referrer-policy")),
    "API has a referrer policy",
  );

  const preflight = await request(
    fetchImpl,
    new URL("/api/auth/refresh", api),
    {
      method: "OPTIONS",
      headers: {
        Origin: origin.origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    },
  );
  expect(
    preflight.status >= 200 && preflight.status < 300,
    "API CORS preflight succeeds",
  );
  expect(
    preflight.headers.get("access-control-allow-origin") === origin.origin,
    "API allows only the configured app origin",
  );

  const protectedRoute = await request(
    fetchImpl,
    new URL("/api/customers", api),
  );
  expect(
    protectedRoute.status === 401,
    "Unauthenticated customer request is denied",
  );
  return checks;
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    const checks = await runDeploymentSmoke();
    for (const check of checks) console.log(`PASS ${check}`);
    console.log(`Deployment smoke passed (${checks.length} checks).`);
  } catch (error) {
    console.error(`Deployment smoke failed: ${error.message}`);
    process.exitCode = 1;
  }
}
