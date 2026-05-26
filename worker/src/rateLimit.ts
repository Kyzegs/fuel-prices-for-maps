import type { Context, Next } from "hono";
import type { Env, RateLimitBinding } from "./env";

const RATE_LIMITED_STATUS = 429;

export function rateLimit(bindingName: keyof Pick<Env, "PRICE_RATE_LIMITER" | "VEHICLE_RATE_LIMITER">) {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const binding = c.env?.[bindingName] as RateLimitBinding | undefined;
    if (!binding) {
      await next();
      return;
    }

    const result = await binding.limit({ key: rateLimitKey(c) });
    if (!result.success) {
      return c.json(
        { error: "Rate limit exceeded. Please try again later." },
        RATE_LIMITED_STATUS,
        {
          "retry-after": "60",
          "cache-control": "no-store"
        }
      );
    }

    await next();
  };
}

function rateLimitKey(c: Context): string {
  return (
    c.req.header("cf-connecting-ip") ||
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    "anonymous"
  );
}
