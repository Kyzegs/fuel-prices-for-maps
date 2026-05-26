import type { FuelType, PriceQuote, VehicleLookupResponse } from "../../src/shared/types";
import type { Env } from "./env";

export interface PriceProvider {
  readonly id: string;
  getLatestPrice(
    env: Env,
    country: string,
    fuel: FuelType,
    currency: string,
    options?: { refresh?: boolean }
  ): Promise<PriceQuote>;
  sync(env: Env): Promise<PriceQuote[]>;
}

export interface VehicleProvider {
  readonly id: string;
  lookupEconomy(country: string, plate: string): Promise<VehicleLookupResponse>;
}
