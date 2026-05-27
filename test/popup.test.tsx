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

    const economyInput = await screen.findByLabelText("Economy");
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

  it("adds and selects a plate after a successful lookup", async () => {
    mockPriceAndVehicleFetch({
      supported: true,
      country: "NL",
      plate: "AB12CD",
      model: "Test Model",
      economy: { value: 5.4, unit: "l_per_100km" }
    });

    render(<Popup />);

    await screen.findByText("Ready");
    fireEvent.change(await screen.findByLabelText("Plate"), { target: { value: "ab-12-cd" } });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Fetch economy" })).not.toBeDisabled()
    );
    fireEvent.click(screen.getByRole("button", { name: "Fetch economy" }));

    await screen.findByText("Loaded Test Model");
    expect(screen.getByRole("button", { name: /^AB12CD/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByLabelText("Economy")).toHaveValue(5.4);

    const settings = await getStoredSettings();
    expect(settings?.selectedVehicleId).toBe("NL:AB12CD");
    expect(settings?.savedVehicles).toEqual([
      {
        id: "NL:AB12CD",
        country: "NL",
        plate: "AB12CD",
        model: "Test Model",
        economy: { value: 5.4, unit: "l_per_100km" }
      }
    ]);
  });

  it("selects a saved plate and keeps the selection after remount", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ prices: [] }), { status: 200 })
    );
    await seedSettings({
      savedVehicles: [
        savedVehicle("NL:AB12CD", "AB12CD", 5.4),
        savedVehicle("NL:EF34GH", "EF34GH", 6.2)
      ]
    });

    const { unmount } = render(<Popup />);

    fireEvent.click(await screen.findByRole("button", { name: /^EF34GH/ }));
    await screen.findByText("Selected EF34GH");
    expect(screen.getByLabelText("Economy")).toHaveValue(6.2);

    unmount();
    render(<Popup />);

    expect(await screen.findByRole("button", { name: /^EF34GH/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByLabelText("Economy")).toHaveValue(6.2);
  });

  it("clears selected plate when manual economy changes", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ prices: [] }), { status: 200 })
    );
    await seedSettings({
      economy: { value: 5.4, unit: "l_per_100km" },
      savedVehicles: [savedVehicle("NL:AB12CD", "AB12CD", 5.4)],
      selectedVehicleId: "NL:AB12CD"
    });

    render(<Popup />);

    fireEvent.change(await screen.findByLabelText("Economy"), { target: { value: "7.1" } });
    await waitFor(async () => expect((await getStoredSettings())?.selectedVehicleId).toBeUndefined());
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
      savedVehicles: [savedVehicle("NL:AB12CD", "AB12CD", 5.4)],
      selectedVehicleId: "NL:AB12CD"
    });

    render(<Popup />);

    fireEvent.click(await screen.findByRole("button", { name: "Remove AB12CD" }));
    await waitFor(async () => expect((await getStoredSettings())?.savedVehicles).toEqual([]));
    expect((await getStoredSettings())?.selectedVehicleId).toBeUndefined();
    expect(screen.getByLabelText("Economy")).toHaveValue(5.4);
  });
});

function mockPriceAndVehicleFetch(vehiclePayload: unknown) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
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

function savedVehicle(id: string, plate: string, economyValue: number) {
  return {
    id,
    country: "NL",
    plate,
    economy: { value: economyValue, unit: "l_per_100km" as const }
  };
}
