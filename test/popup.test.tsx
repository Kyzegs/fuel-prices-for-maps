import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import browser from "webextension-polyfill";
import { Popup } from "../entrypoints/popup/main";
import { SETTINGS_KEY } from "../src/shared/settings";
import type { UserSettings } from "../src/shared/types";

describe("popup settings UX", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("saves valid economy edits live without a save button", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          prices: [
            {
              country: "NL",
              fuel: "gasoline_95",
              available: true,
              pricePerLiter: 2,
              currency: "EUR",
              source: "provider"
            }
          ]
        }),
        { status: 200 }
      )
    );

    render(<Popup />);

    const economyInput = await screen.findByLabelText("Trip economy");
    fireEvent.change(economyInput, { target: { value: "" } });
    expect(screen.getByText("Enter a valid fuel economy")).toBeInTheDocument();

    fireEvent.change(economyInput, { target: { value: "7.1" } });

    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Save economy" })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();
  });

  it("opens extension options from the popup settings button", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ prices: [] }), { status: 200 })
    );

    render(<Popup />);

    fireEvent.click(await screen.findByRole("button", { name: "Manage settings" }));

    expect(browser.runtime.openOptionsPage).toHaveBeenCalled();
  });

  it("shows vehicle lookup and manual add as one-open accordion panels", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ prices: [] }), { status: 200 })
    );

    render(<Popup />);

    expect(await screen.findByLabelText("Plate")).toBeInTheDocument();
    expect(screen.queryByLabelText("Manual vehicle nickname")).not.toBeInTheDocument();
    expect(screen.queryByText("Enter at least 4 plate characters.")).not.toBeInTheDocument();
    expect(screen.queryByText("Look up a vehicle by license plate.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fetch economy" })).not.toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Fetch economy" }));
    expect(screen.getByText("Enter at least 4 plate characters.")).toHaveClass("error");

    fireEvent.click(screen.getByRole("button", { name: /Add vehicle manually/ }));

    expect(screen.getByLabelText("Manual vehicle nickname")).toBeInTheDocument();
    expect(screen.queryByText("Add a vehicle with nickname and fuel economy.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add vehicle" })).not.toBeDisabled();
    expect(screen.queryByRole("button", { name: "Fetch economy" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add vehicle" }));
    expect(screen.getByText("Enter a vehicle nickname")).toHaveClass("error");

    fireEvent.click(screen.getByRole("button", { name: /Vehicle lookup/ }));

    expect(screen.getByLabelText("Plate")).toBeInTheDocument();
    expect(screen.queryByLabelText("Manual vehicle nickname")).not.toBeInTheDocument();
  });

  it("adds and selects a plate after a successful lookup", async () => {
    const fetchMock = mockPriceAndVehicleFetch({
      supported: true,
      country: "NL",
      plate: "AB12CD",
      model: "Test Model",
      fuelType: "diesel",
      economy: { value: 5.4, unit: "l_per_100km" },
      rangeKm: 720
    });

    render(<Popup />);

    await screen.findByText("Ready");
    fireEvent.change(await screen.findByLabelText("Plate"), { target: { value: "ab-12-cd" } });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Fetch economy" })).not.toBeDisabled()
    );
    fireEvent.click(screen.getByRole("button", { name: "Fetch economy" }));

    expect(await screen.findByText("Loaded Test Model")).toHaveClass("success");
    expect(screen.getByRole("button", { name: /^Test Model/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByLabelText("Trip economy")).toHaveValue(5.4);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/prices/latest?countries=NL&fuel=diesel")
      )
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/vehicles\/lookup$/),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ country: "NL", plate: "ab-12-cd" })
      })
    );

    const settings = await getStoredSettings();
    expect(settings?.selectedVehicleId).toBe("NL:AB12CD");
    expect(settings?.fuelType).toBe("diesel");
    expect(settings?.savedVehicles).toEqual([
      {
        id: "NL:AB12CD",
        country: "NL",
        plate: "AB12CD",
        nickname: "Test Model",
        model: "Test Model",
        fuelType: "diesel",
        economy: { value: 5.4, unit: "l_per_100km" },
        refuelMode: "range",
        tankCapacityLiters: null,
        rangeKm: 720
      }
    ]);
  });

  it("prefills the manual add panel after a UK lookup and saves with manual economy", async () => {
    mockPriceAndVehicleFetch({
      supported: true,
      country: "UK",
      plate: "AB12CDE",
      model: "FORD",
      fuelType: "lpg",
      message: "Found FORD. Enter fuel economy manually."
    });

    render(<Popup />);

    await screen.findByText("Ready");
    expect(screen.getByRole("option", { name: "United Kingdom (UK)" })).toBeInTheDocument();

    fireEvent.change(screen.getAllByLabelText("Country")[1], { target: { value: "UK" } });
    await waitFor(() => expect(screen.getAllByLabelText("Country")[1]).toHaveValue("UK"));
    fireEvent.change(screen.getByLabelText("Plate"), { target: { value: "ab 12 cde" } });
    fireEvent.click(screen.getByRole("button", { name: "Fetch economy" }));

    await screen.findByText("Found FORD. Enter fuel economy manually.");
    expect(await getStoredSettings()).toMatchObject({ savedVehicles: [] });
    expect(screen.getByRole("button", { name: /Add vehicle manually/ })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(screen.queryByRole("button", { name: "Fetch economy" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Manual vehicle nickname")).toHaveValue("FORD");
    expect(screen.getByLabelText("Manual vehicle plate")).toHaveValue("AB12CDE");
    expect(screen.getByLabelText("Manual vehicle fuel type")).toHaveValue("lpg");
    expect(screen.queryByText("Enter a valid fuel economy.")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Manual vehicle economy"), { target: { value: "6.9" } });
    fireEvent.click(screen.getByRole("button", { name: "Add vehicle" }));

    expect(await screen.findByText("Added FORD")).toHaveClass("success");
    expect(screen.getByRole("button", { name: /^FORD/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(await getStoredSettings()).toMatchObject({
      plateCountry: "UK",
      fuelType: "lpg",
      selectedVehicleId: "UK:AB12CDE",
      savedVehicles: [
        {
          id: "UK:AB12CDE",
          country: "UK",
          plate: "AB12CDE",
          nickname: "FORD",
          model: "FORD",
          fuelType: "lpg",
          economy: { value: 6.9, unit: "l_per_100km" },
          refuelMode: "tank",
          tankCapacityLiters: null,
          rangeKm: null
        }
      ]
    });
  });

  it("adds and selects a manual vehicle without a plate", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ prices: [] }), { status: 200 })
    );

    render(<Popup />);

    await screen.findByText("Ready");
    fireEvent.click(screen.getByRole("button", { name: /Add vehicle manually/ }));
    fireEvent.change(await screen.findByLabelText("Manual vehicle nickname"), {
      target: { value: "Roadtrip" }
    });
    fireEvent.change(screen.getByLabelText("Manual vehicle economy"), {
      target: { value: "6.8" }
    });
    fireEvent.change(screen.getByLabelText("Manual vehicle fuel type"), {
      target: { value: "diesel" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Add vehicle" }));

    expect(await screen.findByText("Added Roadtrip")).toHaveClass("success");
    expect(screen.getByRole("button", { name: /^Roadtrip/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByLabelText("Trip economy")).toHaveValue(6.8);

    const settings = await getStoredSettings();
    expect(settings).toBeDefined();
    if (!settings) throw new Error("Settings were not persisted");
    expect(settings.selectedVehicleId).toMatch(/^manual:/);
    expect(settings.savedVehicles).toHaveLength(1);
    expect(settings.savedVehicles[0]).toMatchObject({
      id: settings.selectedVehicleId,
      country: "NL",
      plate: "",
      nickname: "Roadtrip",
      fuelType: "diesel",
      economy: { value: 6.8, unit: "l_per_100km" },
      refuelMode: "tank",
      tankCapacityLiters: null,
      rangeKm: null
    });
    expect(settings.fuelType).toBe("diesel");
  });

  it("adds a manual vehicle with optional plate, tank, and range values", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ prices: [] }), { status: 200 })
    );

    render(<Popup />);

    await screen.findByText("Ready");
    fireEvent.click(screen.getByRole("button", { name: /Add vehicle manually/ }));
    fireEvent.change(await screen.findByLabelText("Manual vehicle nickname"), {
      target: { value: "Van" }
    });
    fireEvent.change(screen.getByLabelText("Manual vehicle plate"), {
      target: { value: "xy-99-zz" }
    });
    fireEvent.change(screen.getByLabelText("Manual vehicle economy"), {
      target: { value: "7.2" }
    });
    fireEvent.change(screen.getByLabelText("Manual vehicle tank capacity"), {
      target: { value: "55" }
    });
    fireEvent.change(screen.getByLabelText("Manual vehicle range"), {
      target: { value: "640" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Add vehicle" }));

    expect(await screen.findByText("Added Van")).toHaveClass("success");
    expect(screen.getByLabelText("Trip economy")).toHaveValue(7.2);

    expect(await getStoredSettings()).toMatchObject({
      economy: { value: 7.2, unit: "l_per_100km" },
      tankCapacityLiters: null,
      rangeKm: 640,
      savedVehicles: [
        {
          country: "NL",
          plate: "xy-99-zz",
          nickname: "Van",
          refuelMode: "range",
          tankCapacityLiters: 55,
          rangeKm: 640
        }
      ]
    });
  });

  it("edits a saved vehicle nickname and optional plate", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ prices: [] }), { status: 200 })
    );
    await seedSettings({
      savedVehicles: [savedVehicle("manual:one", "", 6.4, null, null, "Old name")],
      selectedVehicleId: "manual:one"
    });

    render(<Popup />);

    fireEvent.change(await screen.findByLabelText("Nickname for Old name"), {
      target: { value: "New name" }
    });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^New name/ })).toBeInTheDocument()
    );
    fireEvent.change(screen.getByLabelText("Plate for New name"), {
      target: { value: "ZZ99YY" }
    });

    await waitFor(async () =>
      expect(await getStoredSettings()).toMatchObject({
        savedVehicles: [
          {
            id: "manual:one",
            nickname: "New name",
            plate: "ZZ99YY"
          }
        ]
      })
    );
  });

  it("selects a saved plate and keeps the selection after remount", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ prices: [] }), { status: 200 })
    );
    await seedSettings({
      savedVehicles: [
        savedVehicle("NL:AB12CD", "AB12CD", 5.4, 45, 650, undefined, "gasoline_95"),
        savedVehicle("NL:EF34GH", "EF34GH", 6.2, 60, 700, undefined, "diesel")
      ]
    });

    const { unmount } = render(<Popup />);

    fireEvent.click(await screen.findByRole("button", { name: /^EF34GH/ }));
    await screen.findByText("Selected EF34GH");
    expect(screen.getByLabelText("Trip economy")).toHaveValue(6.2);
    expect((await getStoredSettings())?.tankCapacityLiters).toBeNull();
    expect((await getStoredSettings())?.rangeKm).toBe(700);
    expect((await getStoredSettings())?.fuelType).toBe("diesel");

    unmount();
    render(<Popup />);

    expect(await screen.findByRole("button", { name: /^EF34GH/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await waitFor(() => expect(screen.getByLabelText("Trip economy")).toHaveValue(6.2));
  });

  it("updates active fuel price when selected vehicle fuel type is edited", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ prices: [] }), { status: 200 })
    );
    await seedSettings({
      savedVehicles: [
        savedVehicle("NL:AB12CD", "AB12CD", 5.4, 45, 650, undefined, "gasoline_95")
      ],
      selectedVehicleId: "NL:AB12CD"
    });

    render(<Popup />);

    fireEvent.change(await screen.findByLabelText("Fuel type for AB12CD"), {
      target: { value: "lpg" }
    });

    await waitFor(async () =>
      expect(await getStoredSettings()).toMatchObject({
        fuelType: "lpg",
        savedVehicles: [{ id: "NL:AB12CD", fuelType: "lpg" }]
      })
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/prices/latest?countries=NL&fuel=lpg")
      )
    );
  });

  it("clears selected plate when top fuel type changes", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ prices: [] }), { status: 200 })
    );
    await seedSettings({
      fuelType: "gasoline_95",
      savedVehicles: [
        savedVehicle("NL:AB12CD", "AB12CD", 5.4, 45, 650, undefined, "gasoline_95")
      ],
      selectedVehicleId: "NL:AB12CD"
    });

    render(<Popup />);

    fireEvent.change(await screen.findByLabelText("Fuel type"), {
      target: { value: "diesel" }
    });

    await waitFor(async () =>
      expect(await getStoredSettings()).toMatchObject({
        fuelType: "diesel",
        selectedVehicleId: undefined
      })
    );
    expect(screen.getByRole("button", { name: /^AB12CD/ })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("clears selected plate when manual economy changes", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ prices: [] }), { status: 200 })
    );
    await seedSettings({
      economy: { value: 5.4, unit: "l_per_100km" },
      savedVehicles: [savedVehicle("NL:AB12CD", "AB12CD", 5.4, 45, 650)],
      selectedVehicleId: "NL:AB12CD"
    });

    render(<Popup />);

    fireEvent.change(await screen.findByLabelText("Trip economy"), { target: { value: "7.1" } });
    await waitFor(async () => expect((await getStoredSettings())?.selectedVehicleId).toBeUndefined());
    expect((await getStoredSettings())?.tankCapacityLiters).toBeNull();
    expect((await getStoredSettings())?.rangeKm).toBeNull();
    expect(screen.getByRole("button", { name: /^AB12CD/ })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("removes selected plate without changing current economy", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ prices: [] }), { status: 200 })
    );
    await seedSettings({
      economy: { value: 5.4, unit: "l_per_100km" },
      savedVehicles: [savedVehicle("NL:AB12CD", "AB12CD", 5.4, 45, 650)],
      selectedVehicleId: "NL:AB12CD"
    });

    render(<Popup />);

    fireEvent.click(await screen.findByRole("button", { name: "Remove AB12CD" }));
    await waitFor(async () => expect((await getStoredSettings())?.savedVehicles).toEqual([]));
    expect((await getStoredSettings())?.selectedVehicleId).toBeUndefined();
    expect((await getStoredSettings())?.tankCapacityLiters).toBeNull();
    expect((await getStoredSettings())?.rangeKm).toBeNull();
    expect(screen.getByLabelText("Trip economy")).toHaveValue(5.4);
  });

  it("edits saved vehicle economy and range when range is available", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ prices: [] }), { status: 200 })
    );
    await seedSettings({
      savedVehicles: [savedVehicle("NL:AB12CD", "AB12CD", 5.4, 45, 650)],
      selectedVehicleId: "NL:AB12CD"
    });

    render(<Popup />);

    fireEvent.change(await screen.findByLabelText("Economy for AB12CD"), {
      target: { value: "6.1" }
    });
    expect(screen.queryByLabelText("Tank capacity for AB12CD")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Range" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.change(screen.getByLabelText("Range for AB12CD"), {
      target: { value: "720" }
    });

    await waitFor(async () =>
      expect(await getStoredSettings()).toMatchObject({
        economy: { value: 6.1, unit: "l_per_100km" },
        tankCapacityLiters: null,
        rangeKm: 720,
        savedVehicles: [
          {
            id: "NL:AB12CD",
            refuelMode: "range",
            tankCapacityLiters: 45,
            rangeKm: 720,
            economy: { value: 6.1, unit: "l_per_100km" }
          }
        ]
      })
    );
  });

  it("edits saved vehicle tank capacity when range is not available", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ prices: [] }), { status: 200 })
    );
    await seedSettings({
      savedVehicles: [savedVehicle("NL:AB12CD", "AB12CD", 5.4, null)],
      selectedVehicleId: "NL:AB12CD"
    });

    render(<Popup />);

    expect(await screen.findByLabelText("Tank capacity for AB12CD")).toHaveValue(null);
    expect(screen.queryByLabelText("Range for AB12CD")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tank" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.change(screen.getByLabelText("Tank capacity for AB12CD"), {
      target: { value: "55" }
    });

    await waitFor(async () =>
      expect(await getStoredSettings()).toMatchObject({
        tankCapacityLiters: 55,
        rangeKm: null,
        savedVehicles: [
          {
            id: "NL:AB12CD",
            refuelMode: "tank",
            tankCapacityLiters: 55,
            rangeKm: null
          }
        ]
      })
    );
  });

  it("switches a saved vehicle between tank capacity and range inputs", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ prices: [] }), { status: 200 })
    );
    await seedSettings({
      savedVehicles: [savedVehicle("NL:AB12CD", "AB12CD", 5.4, 45, 650)],
      selectedVehicleId: "NL:AB12CD"
    });

    render(<Popup />);

    expect(await screen.findByLabelText("Range for AB12CD")).toHaveValue(650);

    fireEvent.click(screen.getByRole("button", { name: "Tank" }));

    expect(await screen.findByLabelText("Tank capacity for AB12CD")).toHaveValue(45);
    expect(screen.queryByLabelText("Range for AB12CD")).not.toBeInTheDocument();
    await waitFor(async () =>
      expect(await getStoredSettings()).toMatchObject({
        tankCapacityLiters: 45,
        rangeKm: null,
        savedVehicles: [{ id: "NL:AB12CD", refuelMode: "tank" }]
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "Range" }));

    expect(await screen.findByLabelText("Range for AB12CD")).toHaveValue(650);
    expect(screen.queryByLabelText("Tank capacity for AB12CD")).not.toBeInTheDocument();
    await waitFor(async () =>
      expect(await getStoredSettings()).toMatchObject({
        tankCapacityLiters: null,
        rangeKm: 650,
        savedVehicles: [{ id: "NL:AB12CD", refuelMode: "range" }]
      })
    );
  });
});

function mockPriceAndVehicleFetch(vehiclePayload: unknown) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/vehicles/lookup")) {
      return new Response(JSON.stringify(vehiclePayload), { status: 200 });
    }

    return new Response(JSON.stringify({ prices: [] }), { status: 200 });
  });
}

async function seedSettings(settings: Partial<UserSettings>) {
  await browser.storage.local.set({
    [SETTINGS_KEY]: {
      country: "NL",
      currency: "EUR",
      fuelType: "gasoline_95",
      economy: { value: 6.5, unit: "l_per_100km" },
      showFuelLiters: false,
      showRefuelsNeeded: false,
      tankCapacityLiters: null,
      rangeKm: null,
      plateCountry: "NL",
      savedVehicles: [],
      ...settings
    }
  });
}

async function getStoredSettings(): Promise<UserSettings | undefined> {
  const stored = await browser.storage.local.get(SETTINGS_KEY);
  return stored[SETTINGS_KEY] as UserSettings | undefined;
}

function savedVehicle(
  id: string,
  plate: string,
  economyValue: number,
  tankCapacityLiters: number | null,
  rangeKm: number | null = null,
  nickname?: string,
  fuelType: UserSettings["fuelType"] = "gasoline_95"
) {
  return {
    id,
    country: "NL",
    plate,
    nickname,
    fuelType,
    economy: { value: economyValue, unit: "l_per_100km" as const },
    refuelMode: rangeKm ? "range" as const : "tank" as const,
    tankCapacityLiters,
    rangeKm
  };
}
