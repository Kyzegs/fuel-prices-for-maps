import type {
  FuelEconomy,
  PriceQuote
} from "./types";

const KM_PER_MILE = 1.609344;
const LITERS_PER_US_GALLON = 3.785411784;
const LITERS_PER_IMP_GALLON = 4.54609;

export function litersPerKm(economy: FuelEconomy): number {
  if (!Number.isFinite(economy.value) || economy.value <= 0) {
    throw new Error("Fuel economy must be greater than zero.");
  }

  switch (economy.unit) {
    case "l_per_100km":
      return economy.value / 100;
    case "km_per_l":
      return 1 / economy.value;
    case "mpg_us":
      return LITERS_PER_US_GALLON / (economy.value * KM_PER_MILE);
    case "mpg_imp":
      return LITERS_PER_IMP_GALLON / (economy.value * KM_PER_MILE);
  }
}

export function litersForDistance(distanceKm: number, economy: FuelEconomy): number {
  return round(distanceKm * litersPerKm(economy), 3);
}

export function costForDistance(
  distanceKm: number,
  economy: FuelEconomy,
  pricePerLiter: number
): number {
  return round(litersForDistance(distanceKm, economy) * pricePerLiter, 2);
}

export function refuelsForDistance(
  distanceKm: number,
  economy: FuelEconomy,
  tankCapacityLiters?: number | null,
  rangeKm?: number | null
): number {
  if (Number.isFinite(rangeKm) && rangeKm !== undefined && rangeKm !== null && rangeKm > 0) {
    return Math.max(0, Math.ceil(distanceKm / rangeKm) - 1);
  }
  if (
    tankCapacityLiters === undefined ||
    tankCapacityLiters === null ||
    !Number.isFinite(tankCapacityLiters) ||
    tankCapacityLiters <= 0
  ) {
    return 0;
  }
  return Math.max(0, Math.ceil(litersForDistance(distanceKm, economy) / tankCapacityLiters) - 1);
}

export function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
