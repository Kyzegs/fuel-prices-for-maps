export const FUEL_TYPES = [
  "gasoline_95",
  "gasoline_98",
  "diesel",
  "diesel_plus",
  "lpg",
  "e85",
  "cng"
] as const;

export type FuelType = (typeof FUEL_TYPES)[number];

export const SUPPORTED_PRICE_FUEL_TYPES = [
  "gasoline_95",
  "diesel",
  "lpg"
] as const satisfies readonly FuelType[];

export const FUEL_LABELS: Record<FuelType, string> = {
  gasoline_95: "Gasoline 95",
  gasoline_98: "Gasoline 98",
  diesel: "Diesel",
  diesel_plus: "Diesel Plus",
  lpg: "LPG",
  e85: "E85",
  cng: "CNG"
};

export const SUPPORTED_PLATE_COUNTRIES = [
  { code: "NL", label: "Netherlands" },
  { code: "UK", label: "United Kingdom" }
] as const;

export const SUPPORTED_PRICE_COUNTRIES = [
  { code: "AT", label: "Austria", currency: "EUR" },
  { code: "BE", label: "Belgium", currency: "EUR" },
  { code: "BG", label: "Bulgaria", currency: "EUR" },
  { code: "HR", label: "Croatia", currency: "EUR" },
  { code: "CY", label: "Cyprus", currency: "EUR" },
  { code: "CZ", label: "Czechia", currency: "EUR" },
  { code: "DK", label: "Denmark", currency: "EUR" },
  { code: "EE", label: "Estonia", currency: "EUR" },
  { code: "FI", label: "Finland", currency: "EUR" },
  { code: "FR", label: "France", currency: "EUR" },
  { code: "DE", label: "Germany", currency: "EUR" },
  { code: "GR", label: "Greece", currency: "EUR" },
  { code: "HU", label: "Hungary", currency: "EUR" },
  { code: "IE", label: "Ireland", currency: "EUR" },
  { code: "IT", label: "Italy", currency: "EUR" },
  { code: "LV", label: "Latvia", currency: "EUR" },
  { code: "LT", label: "Lithuania", currency: "EUR" },
  { code: "LU", label: "Luxembourg", currency: "EUR" },
  { code: "MT", label: "Malta", currency: "EUR" },
  { code: "NL", label: "Netherlands", currency: "EUR" },
  { code: "PL", label: "Poland", currency: "EUR" },
  { code: "PT", label: "Portugal", currency: "EUR" },
  { code: "RO", label: "Romania", currency: "EUR" },
  { code: "SK", label: "Slovakia", currency: "EUR" },
  { code: "SI", label: "Slovenia", currency: "EUR" },
  { code: "ES", label: "Spain", currency: "EUR" },
  { code: "SE", label: "Sweden", currency: "EUR" }
] as const;

export const SUPPORTED_CURRENCIES = Array.from(
  new Set(SUPPORTED_PRICE_COUNTRIES.map((country) => country.currency))
).sort();

export type SupportedPlateCountry = (typeof SUPPORTED_PLATE_COUNTRIES)[number]["code"];

export type EconomyUnit = "l_per_100km" | "km_per_l" | "mpg_us" | "mpg_imp";

export interface FuelEconomy {
  value: number;
  unit: EconomyUnit;
}

export interface SavedVehicle {
  id: string;
  country: string;
  plate: string;
  nickname?: string;
  model?: string;
  fuelType?: FuelType;
  economy: FuelEconomy;
  refuelMode?: "tank" | "range";
  tankCapacityLiters?: number | null;
  rangeKm?: number | null;
}

export interface UserSettings {
  country: string;
  currency: string;
  fuelType: FuelType;
  economy: FuelEconomy;
  showFuelLiters: boolean;
  showRefuelsNeeded: boolean;
  tankCapacityLiters: number | null;
  rangeKm?: number | null;
  plateCountry: string;
  savedVehicles: SavedVehicle[];
  selectedVehicleId?: string;
}

export interface RouteInput {
  origin: string;
  destination: string;
  waypoints?: string[];
}

export interface PriceQuote {
  country: string;
  fuel: FuelType;
  available: boolean;
  pricePerLiter?: number;
  currency: string;
  source: "provider" | "fallback" | "unavailable";
  updatedAt?: string;
  diagnostics?: {
    provider: string;
    message: string;
  };
}

export interface RouteCostSegment {
  country: string;
  distanceKm: number;
  liters: number;
  price: PriceQuote;
  cost?: number;
}

export interface VehicleLookupResponse {
  supported: boolean;
  country: string;
  plate?: string;
  model?: string;
  fuelType?: FuelType;
  economy?: FuelEconomy;
  tankCapacityLiters?: number;
  rangeKm?: number;
  message?: string;
}
