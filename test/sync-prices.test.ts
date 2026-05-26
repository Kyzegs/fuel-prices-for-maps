import { describe, expect, it, vi } from "vitest";
import {
  CloudflareKvNamespace,
  loadSyncConfig,
  runPriceSync
} from "../scripts/sync-prices";
import type { KVNamespace } from "../worker/src/env";
import type { PriceQuote } from "@/shared/types";

describe("price sync runner", () => {
  it("writes latest and report-date values through the provided KV adapter", async () => {
    const kv = new MemoryKvNamespace();
    const synced = await runPriceSync({
      config: syncConfig(),
      kv,
      logger: silentLogger(),
      provider: {
        async sync(env) {
          await env.PRICE_CACHE?.put("ec-oil-bulletin:latest", "latest-report");
          await env.PRICE_CACHE?.put("ec-oil-bulletin:report:2026-05-26", "dated-report");
          return [priceQuote()];
        }
      }
    });

    expect(synced).toBe(1);
    await expect(kv.get("ec-oil-bulletin:latest")).resolves.toBe("latest-report");
    await expect(kv.get("ec-oil-bulletin:report:2026-05-26")).resolves.toBe("dated-report");
  });

  it("loads required Cloudflare sync configuration", () => {
    expect(
      loadSyncConfig({
        CLOUDFLARE_ACCOUNT_ID: "account",
        CLOUDFLARE_API_TOKEN: "token",
        CLOUDFLARE_KV_NAMESPACE_ID: "namespace"
      })
    ).toEqual({
      accountId: "account",
      apiToken: "token",
      namespaceId: "namespace",
      intervalMinutes: 1440
    });

    expect(() => loadSyncConfig({})).toThrow("CLOUDFLARE_ACCOUNT_ID is required");
  });

  it("surfaces Cloudflare REST write failures clearly", async () => {
    const kv = new CloudflareKvNamespace(syncConfig(), vi.fn().mockResolvedValue(
      new Response("bad token", { status: 403 })
    ));

    await expect(kv.put("example", "value")).rejects.toThrow(
      "Cloudflare KV write failed for example: 403 bad token"
    );
  });
});

class MemoryKvNamespace implements KVNamespace {
  private readonly values = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

function syncConfig() {
  return {
    accountId: "account",
    apiToken: "token",
    namespaceId: "namespace",
    intervalMinutes: 1440
  };
}

function silentLogger() {
  return {
    info() {},
    error() {}
  };
}

function priceQuote(): PriceQuote {
  return {
    country: "NL",
    fuel: "gasoline_95",
    available: true,
    pricePerLiter: 2,
    currency: "EUR",
    source: "provider"
  };
}
