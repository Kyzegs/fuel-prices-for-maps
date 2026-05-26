import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDailyPrice } from "@/shared/priceCache";
import type { PriceQuote } from "@/shared/types";

describe("daily price cache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-26T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("does not expose client-controlled refresh query params", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        prices: [priceQuote("2026-05-26")]
      })
    );

    await getDailyPrice("nl", "gasoline_95", {
      refresh: true
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8787/prices/latest?countries=NL&fuel=gasoline_95"
    );
  });

  it("returns a recent cached price when the backend fetch fails", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({
          prices: [priceQuote("2026-05-25")]
        })
      )
      .mockRejectedValueOnce(new Error("offline"));

    await getDailyPrice("NL", "gasoline_95");
    vi.setSystemTime(new Date("2026-05-27T12:00:00.000Z"));

    const quote = await getDailyPrice("NL", "gasoline_95");

    expect(quote).toMatchObject({
      available: true,
      pricePerLiter: 2.1,
      diagnostics: {
        message: expect.stringContaining("using cached 2026-05-26 value")
      }
    });
  });
});

function priceQuote(updatedAt: string): PriceQuote {
  return {
    country: "NL",
    fuel: "gasoline_95",
    available: true,
    pricePerLiter: 2.1,
    currency: "EUR",
    source: "provider",
    updatedAt,
    diagnostics: {
      provider: "test-provider",
      message: `Test price ${updatedAt}`
    }
  };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
