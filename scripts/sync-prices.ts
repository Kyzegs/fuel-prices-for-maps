import "dotenv/config";
import { ecOilBulletinPriceProvider } from "../worker/src/adapters/prices";
import type { Env, KVNamespace } from "../worker/src/env";
import type { PriceQuote } from "../src/shared/types";

const CLOUDFLARE_KV_API_BASE_URL = "https://api.cloudflare.com/client/v4";
const DEFAULT_SYNC_INTERVAL_MINUTES = 1440;

type Fetcher = typeof fetch;

export interface SyncConfig {
  accountId: string;
  apiToken: string;
  namespaceId: string;
  intervalMinutes: number;
}

export interface SyncLogger {
  info(message: string): void;
  error(message: string): void;
}

export class CloudflareKvNamespace implements KVNamespace {
  constructor(
    private readonly config: Pick<SyncConfig, "accountId" | "apiToken" | "namespaceId">,
    private readonly fetcher: Fetcher = fetch
  ) {}

  async get(key: string): Promise<string | null> {
    const response = await this.fetcher(this.valueUrl(key), {
      headers: this.headers()
    });

    if (response.status === 404) return null;
    if (!response.ok) throw await cloudflareError("read", key, response);
    return response.text();
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    const url = new URL(this.valueUrl(key));
    if (options?.expirationTtl) {
      url.searchParams.set("expiration_ttl", String(options.expirationTtl));
    }

    const response = await this.fetcher(url, {
      method: "PUT",
      headers: {
        ...this.headers(),
        "content-type": "text/plain"
      },
      body: value
    });

    if (!response.ok) throw await cloudflareError("write", key, response);
  }

  private valueUrl(key: string): string {
    return `${CLOUDFLARE_KV_API_BASE_URL}/accounts/${this.config.accountId}/storage/kv/namespaces/${this.config.namespaceId}/values/${encodeURIComponent(key)}`;
  }

  private headers(): Record<string, string> {
    return {
      authorization: `Bearer ${this.config.apiToken}`
    };
  }
}

export function loadSyncConfig(env: NodeJS.ProcessEnv = process.env): SyncConfig {
  const accountId = requiredEnv(env, "CLOUDFLARE_ACCOUNT_ID");
  const apiToken = requiredEnv(env, "CLOUDFLARE_API_TOKEN");
  const namespaceId = requiredEnv(env, "CLOUDFLARE_KV_NAMESPACE_ID");
  const intervalMinutes = parseIntervalMinutes(env.SYNC_INTERVAL_MINUTES);

  return {
    accountId,
    apiToken,
    namespaceId,
    intervalMinutes
  };
}

export async function runPriceSync(options: {
  config?: SyncConfig;
  kv?: KVNamespace;
  logger?: SyncLogger;
  provider?: {
    sync(env: Env): Promise<PriceQuote[]>;
  };
} = {}): Promise<number> {
  const logger = options.logger || console;
  const config = options.config || loadSyncConfig();
  const kv =
    options.kv ||
    new CloudflareKvNamespace({
      accountId: config.accountId,
      apiToken: config.apiToken,
      namespaceId: config.namespaceId
    });

  const provider = options.provider || ecOilBulletinPriceProvider;
  const quotes = await provider.sync({ PRICE_CACHE: kv });
  logger.info(`Synced ${quotes.length} fuel prices.`);
  return quotes.length;
}

export async function runDaemon(options: {
  config?: SyncConfig;
  logger?: SyncLogger;
} = {}): Promise<void> {
  const config = options.config || loadSyncConfig();
  const logger = options.logger || console;
  const intervalMs = config.intervalMinutes * 60 * 1000;

  await runPriceSync({ config, logger });
  logger.info(`Next price sync in ${config.intervalMinutes} minutes.`);

  setInterval(() => {
    void runPriceSync({ config, logger }).catch((error) => {
      logger.error(error instanceof Error ? error.message : String(error));
    });
  }, intervalMs);
}

async function cloudflareError(action: "read" | "write", key: string, response: Response) {
  const body = await response.text().catch(() => "");
  return new Error(
    `Cloudflare KV ${action} failed for ${key}: ${response.status}${body ? ` ${body}` : ""}`
  );
}

function requiredEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} is required for price sync.`);
  return value;
}

function parseIntervalMinutes(value: string | undefined): number {
  if (!value) return DEFAULT_SYNC_INTERVAL_MINUTES;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("SYNC_INTERVAL_MINUTES must be a positive number.");
  }
  return parsed;
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  const isDaemon = process.argv.includes("--daemon");
  const runner = isDaemon ? runDaemon() : runPriceSync().then(() => undefined);

  runner.catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
