import { describe, expect, it, vi } from "vitest";
import { lookupVehicleEconomy } from "../src/adapters/vehicles";

describe("RDW vehicle lookup", () => {
  it("returns fuel economy and range when RDW publishes action radius", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/m9d7-ebf2.json")) {
        return jsonResponse([{ merk: "Test", handelsbenaming: "Car" }]);
      }
      if (url.includes("/8ys7-d773.json")) {
        return jsonResponse([{ brandstofverbruik_gecombineerd: "5.4", actieradius: 720 }]);
      }

      return jsonResponse([]);
    });

    await expect(lookupVehicleEconomy("NL", "AB-12-CD")).resolves.toMatchObject({
      supported: true,
      country: "NL",
      plate: "AB12CD",
      model: "Test Car",
      economy: { value: 5.4, unit: "l_per_100km" },
      rangeKm: 720
    });
  });
});

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200 });
}
