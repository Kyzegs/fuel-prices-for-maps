import type { Context, Next } from "hono";

export async function cors(c: Context, next: Next) {
  const origin = c.req.header("origin");
  const allowedOrigin = allowedCorsOrigin(c.env?.ALLOWED_ORIGINS, origin);

  c.header("access-control-allow-origin", allowedOrigin);
  c.header("access-control-allow-methods", "GET,POST,OPTIONS");
  c.header("access-control-allow-headers", "content-type, authorization");
  c.header("vary", "Origin");

  if (c.req.method === "OPTIONS") {
    return c.body(null, 204);
  }

  await next();
}

function allowedCorsOrigin(allowedOrigins: string | undefined, origin: string | undefined): string {
  const configuredOrigins = (allowedOrigins || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (configuredOrigins.length === 0) return "*";
  if (!origin) return configuredOrigins[0];
  return configuredOrigins.includes(origin) ? origin : configuredOrigins[0];
}
