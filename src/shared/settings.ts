import browser from "webextension-polyfill";
import type { UserSettings } from "./types";

export const DEFAULT_SETTINGS: UserSettings = {
  country: "NL",
  currency: "EUR",
  fuelType: "gasoline_95",
  economy: {
    value: 6.5,
    unit: "l_per_100km"
  },
  plateCountry: "NL",
  savedVehicles: []
};

export const SETTINGS_KEY = "fuelCostSettings";

export async function getSettings(): Promise<UserSettings> {
  const stored = await browser.storage.local.get(SETTINGS_KEY);
  return isStoredSettings(stored[SETTINGS_KEY]) ? stored[SETTINGS_KEY] : DEFAULT_SETTINGS;
}

export async function saveSettings(settings: UserSettings): Promise<void> {
  await browser.storage.local.set({
    [SETTINGS_KEY]: settings
  });
}

export async function updateSettings(
  patch: Partial<UserSettings>
): Promise<UserSettings> {
  const next = {
    ...(await getSettings()),
    ...patch
  };
  await saveSettings(next);
  return next;
}

function isStoredSettings(value: unknown): value is UserSettings {
  return Boolean(value && typeof value === "object");
}
