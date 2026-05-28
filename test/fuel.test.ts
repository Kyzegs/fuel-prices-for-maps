import { describe, expect, it } from "vitest";
import { costForDistance, litersForDistance, refuelsForDistance } from "@/shared/fuel";

describe("fuel math", () => {
  it("converts L/100 km to liters and cost", () => {
    expect(litersForDistance(250, { value: 6, unit: "l_per_100km" })).toBe(15);
    expect(costForDistance(250, { value: 6, unit: "l_per_100km" }, 2)).toBe(30);
  });

  it("converts MPG US", () => {
    expect(litersForDistance(160.9344, { value: 40, unit: "mpg_us" })).toBe(9.464);
  });

  it("calculates refuels after starting with a full tank", () => {
    expect(refuelsForDistance(500, { value: 6, unit: "l_per_100km" }, 50)).toBe(0);
    expect(refuelsForDistance(833.333, { value: 6, unit: "l_per_100km" }, 50)).toBe(0);
    expect(refuelsForDistance(900, { value: 6, unit: "l_per_100km" }, 50)).toBe(1);
    expect(refuelsForDistance(1800, { value: 6, unit: "l_per_100km" }, 50)).toBe(2);
    expect(refuelsForDistance(900, { value: 6, unit: "l_per_100km" }, 0)).toBe(0);
  });

  it("calculates refuels from range before tank capacity", () => {
    expect(refuelsForDistance(500, { value: 6, unit: "l_per_100km" }, 50, 300)).toBe(1);
    expect(refuelsForDistance(900, { value: 6, unit: "l_per_100km" }, undefined, 300)).toBe(2);
  });
});
