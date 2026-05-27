import { describe, expect, it } from "vitest";
import { syncFuelPrices } from "../src/sync";
import type { KVNamespace } from "../src/env";

describe("scheduled sync Worker", () => {
  it("imports prices into the bound KV namespace", async () => {
    const synced = await syncFuelPrices({
      PRICE_CACHE: memoryKv({
        "ec-oil-bulletin:latest": JSON.stringify({
          reportDate: "2026-05-25",
          sourceUrl: "https://example.com/latest.xlsx",
          importedAt: "2026-05-26T00:00:00.000Z",
          countries: {
            NL: {
              gasoline_95: 2.123,
              diesel: 1.987,
              lpg: 0.842
            }
          }
        })
      })
    }, {
      async sync(env) {
        await env.PRICE_CACHE?.put("ec-oil-bulletin:latest", "{}");
        return [
          priceQuote("gasoline_95"),
          priceQuote("diesel"),
          priceQuote("lpg")
        ];
      }
    });

    expect(synced).toBe(3);
  });
});

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

function priceQuote(fuel: "gasoline_95" | "diesel" | "lpg") {
  return {
    country: "NL",
    fuel,
    available: true,
    pricePerLiter: 2,
    currency: "EUR",
    source: "provider" as const
  };
}
