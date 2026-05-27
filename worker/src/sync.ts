import type { Env } from "./env";
import { ecOilBulletinPriceProvider } from "./adapters/prices";
import type { PriceQuote } from "../../src/shared/types";

export async function syncFuelPrices(
  env: Env,
  provider: { sync(env: Env): Promise<PriceQuote[]> } = ecOilBulletinPriceProvider
): Promise<number> {
  const quotes = await provider.sync(env);
  return quotes.length;
}

export default {
  async scheduled(_event: unknown, env: Env, _ctx: unknown) {
    await syncFuelPrices(env);
  }
};
