import { describe, expect, it, vi } from "vitest";
import { app } from "../src";
import { latestPricesQuerySchema } from "../src/schema";
import type { Env, KVNamespace, RateLimitBinding } from "../src/env";

describe("Worker API hardening", () => {
  it("does not expose an HTTP price sync endpoint", async () => {
    const response = await app.request("/admin/prices/sync", {
      method: "POST"
    });

    expect(response.status).toBe(404);
  });

  it("does not expose public forced refresh query parsing", () => {
    const parsed = latestPricesQuerySchema.parse({
      countries: "nl,be",
      fuel: "gasoline_95",
      refresh: "true"
    });

    expect(parsed).toEqual({
      countries: ["NL", "BE"],
      fuel: "gasoline_95"
    });
  });

  it("rejects malformed latest price queries", () => {
    expect(() =>
      latestPricesQuerySchema.parse({
        countries: "",
        fuel: "gasoline_95"
      })
    ).toThrow();
  });

  it("rate-limits latest price reads before doing KV work", async () => {
    const env = testEnv({
      PRICE_RATE_LIMITER: deniedRateLimit()
    });

    const response = await app.request(
      "/prices/latest?countries=NL&fuel=gasoline_95",
      {
        headers: {
          "cf-connecting-ip": "203.0.113.10"
        }
      },
      env
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("sets cache headers on latest price reads", async () => {
    const response = await app.request(
      "/prices/latest?countries=NL&fuel=gasoline_95",
      {},
      testEnv()
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400"
    );
  });

  it("rate-limits vehicle lookup and keeps successful lookups uncacheable", async () => {
    const limited = await app.request(
      "/vehicles/lookup?country=NL&plate=AB12CD",
      {},
      testEnv({
        VEHICLE_RATE_LIMITER: deniedRateLimit()
      })
    );
    expect(limited.status).toBe(429);

    const allowed = await app.request(
      "/vehicles/lookup?country=BE&plate=AB12CD",
      {},
      testEnv()
    );
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("cache-control")).toBe("private, no-store");
  });
});

function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    PRICE_CACHE: memoryKv({
      "ec-oil-bulletin:latest": JSON.stringify({
        reportDate: "2026-05-25",
        sourceUrl: "https://example.com/latest.xlsx",
        importedAt: "2026-05-26T00:00:00.000Z",
        countries: {
          NL: {
            gasoline_95: 2.123
          }
        }
      })
    }),
    ...overrides
  };
}

function memoryKv(values: Record<string, string>): KVNamespace {
  return {
    async get(key) {
      return values[key] ?? null;
    },
    async put(key, value) {
      values[key] = value;
    }
  };
}

function deniedRateLimit(): RateLimitBinding {
  return {
    limit: vi.fn(async () => ({ success: false }))
  };
}
