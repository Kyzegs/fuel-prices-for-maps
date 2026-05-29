import {
  SUPPORTED_PLATE_COUNTRIES,
  type FuelType,
  type VehicleLookupResponse
} from "../../../src/shared/types";
import type { Env } from "../env";
import type { VehicleProvider } from "../providers";

const VEHICLE_DATASET_URL = "https://opendata.rdw.nl/resource/m9d7-ebf2.json";
const FUEL_DATASET_URL = "https://opendata.rdw.nl/resource/8ys7-d773.json";
const DVLA_VES_URL = "https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles";
type RdwRecord = Record<string, string | number | undefined>;
type DvlaVehicleResponse = Record<string, string | number | boolean | undefined>;

export async function lookupVehicleEconomy(
  env: Env,
  country: string,
  plate: string
): Promise<VehicleLookupResponse> {
  const normalizedCountry = country.toUpperCase();
  const normalizedPlate = normalizePlate(plate);

  if (!SUPPORTED_PLATE_COUNTRIES.some((supported) => supported.code === normalizedCountry)) {
    return {
      supported: false,
      country: normalizedCountry,
      plate,
      message: "Manual economy required for this country."
    };
  }

  if (normalizedCountry === "UK") {
    return lookupDvlaVehicle(env, normalizedPlate);
  }

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
  const fuelType = fuelRecords
    .map((fuel) => fuelTypeFromLookupValue(fuel.brandstof_omschrijving))
    .find((value): value is FuelType => value !== undefined);
  const combined = fuelRecords
    .flatMap((fuel) => [
      parseNumber(fuel.brandstof_verbruik_gecombineerd_wltp),
      parseNumber(fuel.brandstofverbruik_gecombineerd)
    ])
    .find((value): value is number => value !== undefined);
  const rangeKm = fuelRecords
    .flatMap((fuel) => [
      parseNumber(fuel.actieradius),
      parseNumber(fuel.actieradius_extern_oplaadbaar),
      parseNumber(fuel.actie_radius_enkel_elektrisch_wltp),
      parseNumber(fuel.actie_radius_extern_opladen_wltp)
    ])
    .find((value): value is number => value !== undefined);

  if (!combined) {
    return {
      supported: true,
      country: normalizedCountry,
      plate: normalizedPlate,
      model: [vehicle.merk, vehicle.handelsbenaming].filter(Boolean).join(" "),
      fuelType,
      message: "Vehicle found, but economy unavailable. Manual economy required."
    };
  }

  return {
    supported: true,
    country: normalizedCountry,
    plate: normalizedPlate,
    model: [vehicle.merk, vehicle.handelsbenaming].filter(Boolean).join(" "),
    fuelType,
    economy: {
      value: combined,
      unit: "l_per_100km"
    },
    rangeKm
  };
}

export const rdwVehicleProvider: VehicleProvider = {
  id: "rdw",
  lookupEconomy: lookupVehicleEconomy
};

async function lookupDvlaVehicle(
  env: Env,
  plate: string
): Promise<VehicleLookupResponse> {
  if (!env.DVLA_VES_API_KEY) {
    return {
      supported: true,
      country: "UK",
      plate,
      message: "UK lookup is not configured. Manual economy required."
    };
  }

  let response: Response;
  try {
    response = await fetch(DVLA_VES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.DVLA_VES_API_KEY
      },
      body: JSON.stringify({ registrationNumber: plate })
    });
  } catch {
    throw new Error("DVLA lookup failed. Try again later.");
  }

  if (response.status === 400) {
    return {
      supported: true,
      country: "UK",
      plate,
      message: "Invalid UK registration. Manual economy required."
    };
  }

  if (response.status === 404) {
    return {
      supported: true,
      country: "UK",
      plate,
      message: "Vehicle not found. Manual economy required."
    };
  }

  if (response.status === 429) {
    throw new Error("DVLA lookup rate limit reached. Try again later.");
  }

  if (response.status === 500 || response.status === 503) {
    throw new Error("DVLA lookup is temporarily unavailable. Try again later.");
  }

  if (!response.ok) {
    throw new Error("DVLA lookup failed. Try again later.");
  }

  const vehicle = (await response.json()) as DvlaVehicleResponse;
  const model = typeof vehicle.make === "string" ? vehicle.make : undefined;
  const fuelType = fuelTypeFromLookupValue(vehicle.fuelType);
  return {
    supported: true,
    country: "UK",
    plate: normalizePlate(String(vehicle.registrationNumber || plate)),
    model,
    fuelType,
    message: model
      ? `Found ${model}. Enter fuel economy manually.`
      : "Vehicle found. Enter fuel economy manually."
  };
}

async function fetchFuelRecords(plate: string): Promise<RdwRecord[]> {
  return fetchRdwRecords(FUEL_DATASET_URL, plate, 5);
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

function parseNumber(value?: string | number): number | undefined {
  if (!value) return undefined;
  const parsed = typeof value === "number" ? value : Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizePlate(plate: string): string {
  return plate.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function fuelTypeFromLookupValue(value: string | number | boolean | undefined): FuelType | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();

  if (normalized === "benzine" || normalized === "petrol") return "gasoline_95";
  if (normalized === "diesel") return "diesel";
  if (normalized === "lpg") return "lpg";
  return undefined;
}
