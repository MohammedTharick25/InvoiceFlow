export function corsOptions(
  frontendOrigin,
  { allowLoopbackAliases = false } = {},
) {
  const origins = frontendOrigin
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowed = new Set(origins.map((origin) => new URL(origin).origin));

  if (allowLoopbackAliases) {
    for (const origin of origins) {
      const parsed = new URL(origin);
      if (parsed.hostname === "localhost") parsed.hostname = "127.0.0.1";
      else if (parsed.hostname === "127.0.0.1") parsed.hostname = "localhost";
      else continue;
      allowed.add(parsed.origin);
    }
  }

  return {
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowed.has(origin)) callback(null, true);
      else callback(new Error("Origin is not allowed by the CORS policy."));
    },
  };
}
