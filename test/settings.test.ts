import { describe, expect, it } from "vitest";
import browser from "webextension-polyfill";
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  getSettings,
  saveSettings,
  updateSettings
} from "@/shared/settings";
import type { UserSettings } from "@/shared/types";

describe("settings storage", () => {
  it("returns defaults when no settings are stored", async () => {
    await expect(getSettings()).resolves.toEqual(DEFAULT_SETTINGS);
  });

  it("round-trips current settings without normalization", async () => {
    const settings: UserSettings = {
      country: "nl",
      currency: "eur",
      fuelType: "gasoline_95",
      economy: { value: 5.4, unit: "l_per_100km" },
      plateCountry: "nl",
      savedVehicles: [
        {
          id: "custom-id",
          country: "nl",
          plate: "ab-12-cd",
          model: " Test Model ",
          economy: { value: 5.4, unit: "l_per_100km" }
        }
      ],
      selectedVehicleId: "stale-id"
    };

    await saveSettings(settings);

    await expect(getSettings()).resolves.toEqual(settings);
  });

  it("merges setting patches without cleanup", async () => {
    await saveSettings({
      ...DEFAULT_SETTINGS,
      savedVehicles: [
        {
          id: "NL:AB12CD",
          country: "NL",
          plate: "AB12CD",
          economy: { value: 6.1, unit: "l_per_100km" }
        }
      ],
      selectedVehicleId: "NL:AB12CD"
    });

    const next = await updateSettings({
      country: "be",
      selectedVehicleId: "missing"
    });

    expect(next).toMatchObject({
      country: "be",
      selectedVehicleId: "missing"
    });

    const stored = await browser.storage.local.get(SETTINGS_KEY);
    expect(stored[SETTINGS_KEY]).toEqual(next);
  });
});
