import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupVehicleEconomy } from "../src/adapters/vehicles";

describe("RDW vehicle lookup", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns fuel economy and range when RDW publishes action radius", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/m9d7-ebf2.json")) {
        return jsonResponse([{ merk: "Test", handelsbenaming: "Car" }]);
      }
      if (url.includes("/8ys7-d773.json")) {
        return jsonResponse([
          {
            brandstof_omschrijving: "Diesel",
            brandstofverbruik_gecombineerd: "5.4",
            actieradius: 720
          }
        ]);
      }

      return jsonResponse([]);
    });

    await expect(lookupVehicleEconomy({}, "NL", "AB-12-CD")).resolves.toMatchObject({
      supported: true,
      country: "NL",
      plate: "AB12CD",
      model: "Test Car",
      fuelType: "diesel",
      economy: { value: 5.4, unit: "l_per_100km" },
      rangeKm: 720
    });
  });

  it("omits unsupported RDW fuel types", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/m9d7-ebf2.json")) {
        return jsonResponse([{ merk: "Test", handelsbenaming: "EV" }]);
      }
      if (url.includes("/8ys7-d773.json")) {
        return jsonResponse([
          { brandstof_omschrijving: "Elektriciteit", brandstofverbruik_gecombineerd: "5.4" }
        ]);
      }

      return jsonResponse([]);
    });

    const response = await lookupVehicleEconomy({}, "NL", "AB-12-CD");

    expect(response).toMatchObject({
      supported: true,
      country: "NL",
      plate: "AB12CD",
      model: "Test EV"
    });
    expect(response.fuelType).toBeUndefined();
  });

  it("looks up UK vehicle details through DVLA VES", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ make: "FORD", registrationNumber: "AB12CDE", fuelType: "PETROL" })
    );

    await expect(
      lookupVehicleEconomy({ DVLA_VES_API_KEY: "secret-key" }, "UK", "ab 12 cde")
    ).resolves.toMatchObject({
      supported: true,
      country: "UK",
      plate: "AB12CDE",
      model: "FORD",
      fuelType: "gasoline_95",
      message: "Found FORD. Enter fuel economy manually."
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "secret-key"
        },
        body: JSON.stringify({ registrationNumber: "AB12CDE" })
      })
    );
  });

  it("does not call DVLA when UK lookup is missing an API key", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(lookupVehicleEconomy({}, "UK", "AB12CDE")).resolves.toMatchObject({
      supported: true,
      country: "UK",
      plate: "AB12CDE",
      message: "UK lookup is not configured. Manual economy required."
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [400, "Invalid UK registration. Manual economy required."],
    [404, "Vehicle not found. Manual economy required."]
  ])("returns a manual-economy response for DVLA status %s", async (status, message) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({}, status));

    await expect(
      lookupVehicleEconomy({ DVLA_VES_API_KEY: "secret-key" }, "UK", "AB12CDE")
    ).resolves.toMatchObject({
      supported: true,
      country: "UK",
      plate: "AB12CDE",
      message
    });
  });

  it("throws a user-safe error when DVLA is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({}, 503));

    await expect(
      lookupVehicleEconomy({ DVLA_VES_API_KEY: "secret-key" }, "UK", "AB12CDE")
    ).rejects.toThrow("DVLA lookup is temporarily unavailable. Try again later.");
  });
});

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status });
}
