import browser from "webextension-polyfill";
import { getLatestPrices } from "./api";
import type { FuelType, PriceQuote } from "./types";

const PRICE_CACHE_KEY = "fuelCostDailyPriceCache";
const STALE_PRICE_MAX_AGE_DAYS = 7;
const inFlightPrices = new Map<string, Promise<PriceQuote | undefined>>();

interface CachedPrice {
  day: string;
  quote: PriceQuote;
}

type PriceCache = Record<string, CachedPrice>;

export async function getDailyPrice(
  country: string,
  fuel: FuelType,
  options: { refresh?: boolean } = {}
): Promise<PriceQuote | undefined> {
  const normalizedCountry = country.toUpperCase();
  const key = cacheKey(normalizedCountry, fuel);
  const day = todayKey();
  const cache = await readCache();
  const cached = cache[key];

  if (!options.refresh) {
    if (cached?.day === day) return cached.quote;
  }

  const requestKey = `${key}|${day}|${options.refresh ? "refresh" : "cached"}`;
  const existing = inFlightPrices.get(requestKey);
  if (existing) return existing;

  const request = fetchAndCacheDailyPrice(
    normalizedCountry,
    fuel,
    key,
    day,
    cached
  ).finally(() => {
    inFlightPrices.delete(requestKey);
  });
  inFlightPrices.set(requestKey, request);
  return request;
}

export async function clearDailyPrice(
  country: string,
  fuel: FuelType
): Promise<void> {
  const cache = await readCache();
  delete cache[cacheKey(country.toUpperCase(), fuel)];
  await writeCache(cache);
}

async function readCache(): Promise<PriceCache> {
  const stored = await browser.storage.local.get(PRICE_CACHE_KEY);
  const cache = stored[PRICE_CACHE_KEY];
  return cache && typeof cache === "object" ? (cache as PriceCache) : {};
}

async function writeCache(cache: PriceCache): Promise<void> {
  await browser.storage.local.set({ [PRICE_CACHE_KEY]: cache });
}

async function fetchAndCacheDailyPrice(
  country: string,
  fuel: FuelType,
  key: string,
  day: string,
  cached: CachedPrice | undefined
): Promise<PriceQuote | undefined> {
  const [quote] = await getLatestPrices([country], fuel).catch((error) => {
    if (cached && isCacheDayInRange(cached.day, day, STALE_PRICE_MAX_AGE_DAYS)) {
      return [withStaleDiagnostics(cached.quote, cached.day, error)];
    }
    throw error;
  });
  if (!quote) return undefined;

  const cache = await readCache();
  await writeCache({
    ...pruneCache(cache, day),
    [key]: { day, quote }
  });
  return quote;
}

function pruneCache(cache: PriceCache, day: string): PriceCache {
  return Object.fromEntries(
    Object.entries(cache).filter(([, cached]) =>
      isCacheDayInRange(cached.day, day, STALE_PRICE_MAX_AGE_DAYS)
    )
  );
}

function cacheKey(country: string, fuel: FuelType): string {
  return `${country}|${fuel}`;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function isCacheDayInRange(day: string, today: string, maxAgeDays: number): boolean {
  const cachedTime = Date.parse(`${day}T00:00:00.000Z`);
  const todayTime = Date.parse(`${today}T00:00:00.000Z`);
  if (!Number.isFinite(cachedTime) || !Number.isFinite(todayTime)) return false;
  return todayTime - cachedTime <= maxAgeDays * 24 * 60 * 60 * 1000;
}

function withStaleDiagnostics(
  quote: PriceQuote,
  cachedDay: string,
  error: unknown
): PriceQuote {
  const reason = error instanceof Error ? error.message : "price fetch failed";
  return {
    ...quote,
    diagnostics: {
      provider: quote.diagnostics?.provider || "cache",
      message: `${quote.diagnostics?.message || "Cached fuel price"}; using cached ${cachedDay} value because ${reason}`
    }
  };
}
