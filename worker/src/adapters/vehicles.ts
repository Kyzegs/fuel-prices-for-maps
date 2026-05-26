import {
  SUPPORTED_PLATE_COUNTRIES,
  type VehicleLookupResponse
} from "../../../src/shared/types";
import type { VehicleProvider } from "../providers";

const VEHICLE_DATASET_URL = "https://opendata.rdw.nl/resource/m9d7-ebf2.json";
const FUEL_DATASET_URL = "https://opendata.rdw.nl/resource/8ys7-d773.json";
const WLTP_FUEL_DATASET_URL = "https://opendata.rdw.nl/resource/7ich-qprq.json";

type RdwRecord = Record<string, string | undefined>;

export async function lookupVehicleEconomy(
  country: string,
  plate: string
): Promise<VehicleLookupResponse> {
  const normalizedCountry = country.toUpperCase();

  if (!SUPPORTED_PLATE_COUNTRIES.some((supported) => supported.code === normalizedCountry)) {
    return {
      supported: false,
      country: normalizedCountry,
      plate,
      message: "Manual economy required for this country."
    };
  }

  const normalizedPlate = plate.replace(/[^a-z0-9]/gi, "").toUpperCase();
  const [vehicle] = await fetchRdwRecords(VEHICLE_DATASET_URL, normalizedPlate, 1);
  if (!vehicle) {
    return {
      supported: true,
      country: normalizedCountry,
      plate: normalizedPlate,
      message: "Vehicle not found. Manual economy required."
    };
  }

  const fuelRecords = await fetchFuelRecords(normalizedPlate);
  const combined = fuelRecords
    .map((fuel) => parseNumber(fuel.brandstofverbruik_gecombineerd))
    .find((value): value is number => value !== undefined);

  if (!combined) {
    return {
      supported: true,
      country: normalizedCountry,
      plate: normalizedPlate,
      model: [vehicle.merk, vehicle.handelsbenaming].filter(Boolean).join(" "),
      message: "Vehicle found, but economy unavailable. Manual economy required."
    };
  }

  return {
    supported: true,
    country: normalizedCountry,
    plate: normalizedPlate,
    model: [vehicle.merk, vehicle.handelsbenaming].filter(Boolean).join(" "),
    economy: {
      value: combined,
      unit: "l_per_100km"
    }
  };
}

export const rdwVehicleProvider: VehicleProvider = {
  id: "rdw",
  lookupEconomy: lookupVehicleEconomy
};

async function fetchFuelRecords(plate: string): Promise<RdwRecord[]> {
  const [fuelRecords, wltpFuelRecords] = await Promise.all([
    fetchRdwRecords(FUEL_DATASET_URL, plate, 5),
    fetchRdwRecords(WLTP_FUEL_DATASET_URL, plate, 5)
  ]);

  return [...fuelRecords, ...wltpFuelRecords];
}

async function fetchRdwRecords(
  datasetUrl: string,
  plate: string,
  limit: number
): Promise<RdwRecord[]> {
  const url = new URL(datasetUrl);
  url.searchParams.set("kenteken", plate);
  url.searchParams.set("$limit", String(limit));

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`RDW lookup failed: ${response.status}`);
  }

  return (await response.json()) as RdwRecord[];
}

function parseNumber(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
