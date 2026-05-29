import { Hono, type Context } from "hono";
import { cors } from "./cors";
import type { Env } from "./env";
import { ecOilBulletinPriceProvider } from "./adapters/prices";
import { rdwVehicleProvider } from "./adapters/vehicles";
import { rateLimit } from "./rateLimit";
import {
  latestPricesQuerySchema,
  vehicleLookupQuerySchema
} from "./schema";

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors);
app.use("/prices/latest", rateLimit("PRICE_RATE_LIMITER"));
app.use("/vehicles/lookup", rateLimit("VEHICLE_RATE_LIMITER"));

app.get("/health", (c) => c.json({ ok: true }));

app.get("/prices/latest", async (c) => {
  const parsed = latestPricesQuerySchema.safeParse({
    countries: c.req.query("countries"),
    fuel: c.req.query("fuel")
  });
  if (!parsed.success) return c.json({ error: parsed.error.message }, 400);

  const prices = await Promise.all(
    parsed.data.countries.map((country) =>
      ecOilBulletinPriceProvider.getLatestPrice(c.env, country, parsed.data.fuel, "EUR", {
        refresh: false
      })
    )
  );

  return c.json(
    { prices },
    200,
    {
      "cache-control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400"
    }
  );
});

app.get("/vehicles/lookup", async (c) => {
  const parsed = vehicleLookupQuerySchema.safeParse({
    country: c.req.query("country"),
    plate: c.req.query("plate")
  });
  if (!parsed.success) return c.json({ error: parsed.error.message }, 400);

  return lookupVehicle(c, parsed.data.country, parsed.data.plate);
});

app.post("/vehicles/lookup", async (c) => {
  const body = await c.req.json().catch(() => undefined);
  const parsed = vehicleLookupQuerySchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.message }, 400);

  return lookupVehicle(c, parsed.data.country, parsed.data.plate);
});

export { app };

export default {
  fetch: app.fetch
};

async function lookupVehicle(
  c: Context<{ Bindings: Env }>,
  country: string,
  plate: string
) {
  try {
    const result = await rdwVehicleProvider.lookupEconomy(
      c.env,
      country,
      plate
    );
    return c.json(
      result,
      200,
      {
        "cache-control": "private, no-store"
      }
    );
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Lookup failed" },
      502,
      {
        "cache-control": "private, no-store"
      }
    );
  }
}
