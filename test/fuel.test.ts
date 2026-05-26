import { describe, expect, it } from "vitest";
import { applyOverride, costForDistance, litersForDistance } from "@/shared/fuel";
import type { PriceQuote } from "@/shared/types";

describe("fuel math", () => {
  it("converts L/100 km to liters and cost", () => {
    expect(litersForDistance(250, { value: 6, unit: "l_per_100km" })).toBe(15);
    expect(costForDistance(250, { value: 6, unit: "l_per_100km" }, 2)).toBe(30);
  });

  it("converts MPG US", () => {
    expect(litersForDistance(160.9344, { value: 40, unit: "mpg_us" })).toBe(9.464);
  });

  it("lets manual override replace unavailable provider price", () => {
    const price: PriceQuote = {
      country: "NL",
      fuel: "gasoline_98",
      available: false,
      currency: "EUR",
      source: "unavailable"
    };

    expect(
      applyOverride(price, [
        { country: "NL", fuel: "gasoline_98", pricePerLiter: 2.29, currency: "EUR" }
      ])
    ).toMatchObject({
      available: true,
      pricePerLiter: 2.29,
      source: "override"
    });
  });
});
