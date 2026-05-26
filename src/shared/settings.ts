import browser from "webextension-polyfill";
import { SUPPORTED_PRICE_COUNTRIES, type UserSettings } from "./types";

export const DEFAULT_SETTINGS: UserSettings = {
  country: "NL",
  currency: "EUR",
  fuelType: "gasoline_95",
  economy: {
    value: 6.5,
    unit: "l_per_100km"
  },
  overrides: [],
  plateCountry: "NL",
  savePlate: false
};

export const SETTINGS_KEY = "fuelCostSettings";

export async function getSettings(): Promise<UserSettings> {
  const stored = await browser.storage.local.get(SETTINGS_KEY);
  return normalizeSettings(stored[SETTINGS_KEY]);
}

export async function saveSettings(settings: UserSettings): Promise<void> {
  await browser.storage.local.set({
    [SETTINGS_KEY]: normalizeSettings(settings)
  });
}

export async function updateSettings(
  patch: Partial<UserSettings>
): Promise<UserSettings> {
  const next = normalizeSettings({
    ...(await getSettings()),
    ...patch
  });
  await saveSettings(next);
  return next;
}

export function normalizeSettings(value: unknown): UserSettings {
  const raw = value && typeof value === "object" ? value : {};
  const record = raw as Partial<UserSettings> & { backendBaseUrl?: string };
  const { backendBaseUrl: _legacyBackendBaseUrl, ...settingsRecord } = record;
  const country = (record.country || detectCurrentCountry() || DEFAULT_SETTINGS.country).toUpperCase();
  const countryConfig = SUPPORTED_PRICE_COUNTRIES.find((item) => item.code === country);

  return {
    ...DEFAULT_SETTINGS,
    ...settingsRecord,
    country,
    currency: (record.currency || countryConfig?.currency || DEFAULT_SETTINGS.currency).toUpperCase(),
    plateCountry: (record.plateCountry || DEFAULT_SETTINGS.plateCountry).toUpperCase(),
    economy: {
      ...DEFAULT_SETTINGS.economy,
      ...record.economy
    },
    overrides: Array.isArray(record.overrides) ? record.overrides : []
  };
}

function detectCurrentCountry(): string | undefined {
  if (typeof Intl === "undefined" || typeof navigator === "undefined") return undefined;

  for (const language of navigator.languages || [navigator.language]) {
    try {
      const region = new Intl.Locale(language).region?.toUpperCase();
      if (region && SUPPORTED_PRICE_COUNTRIES.some((country) => country.code === region)) {
        return region;
      }
    } catch {
      // Ignore malformed extension/browser locale values.
    }
  }

  return undefined;
}
