import type {
  FuelType,
  PriceQuote,
  VehicleLookupResponse
} from "./types";
import { getApiBaseUrl } from "./config";

class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
  }
}

export async function getLatestPrices(
  countries: string[],
  fuel: FuelType
): Promise<PriceQuote[]> {
  const params = new URLSearchParams({
    countries: countries.map((country) => country.toUpperCase()).join(","),
    fuel
  });
  const response = await fetch(`${getApiBaseUrl()}/prices/latest?${params}`);
  const payload = await readJson<{ prices: PriceQuote[] }>(response);
  return payload.prices;
}

export async function lookupVehicle(
  country: string,
  plate: string
): Promise<VehicleLookupResponse> {
  const response = await fetch(`${getApiBaseUrl()}/vehicles/lookup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ country, plate })
  });
  return readJson(response);
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => undefined);

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String(payload.error)
        : `Request failed with ${response.status}`;
    throw new ApiError(message, response.status);
  }

  return payload as T;
}
