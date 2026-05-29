import { z } from "zod";
import { FUEL_TYPES } from "../../src/shared/types";

const fuelTypeSchema = z.enum(FUEL_TYPES);

const economySchema = z.object({
  value: z.number().positive(),
  unit: z.enum(["l_per_100km", "km_per_l", "mpg_us", "mpg_imp"])
});

export const latestPricesQuerySchema = z.object({
  countries: z
    .string()
    .min(2)
    .transform((value) =>
      value
        .split(",")
        .map((country) => country.trim().toUpperCase())
        .filter(Boolean)
    ),
  fuel: fuelTypeSchema
});

export const vehicleLookupQuerySchema = z.object({
  country: z.string().min(2).max(2).transform((value) => value.toUpperCase()),
  plate: z.string().min(2)
});
