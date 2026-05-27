import { describe, expect, it } from "vitest";
import { costForDistance, litersForDistance } from "@/shared/fuel";

describe("fuel math", () => {
  it("converts L/100 km to liters and cost", () => {
    expect(litersForDistance(250, { value: 6, unit: "l_per_100km" })).toBe(15);
    expect(costForDistance(250, { value: 6, unit: "l_per_100km" }, 2)).toBe(30);
  });

  it("converts MPG US", () => {
    expect(litersForDistance(160.9344, { value: 40, unit: "mpg_us" })).toBe(9.464);
  });
});
