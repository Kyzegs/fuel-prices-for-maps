export interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{
    success: boolean;
  }>;
}

export interface Env {
  PRICE_CACHE?: KVNamespace;
  ALLOWED_ORIGINS?: string;
  DVLA_VES_API_KEY?: string;
  PRICE_RATE_LIMITER?: RateLimitBinding;
  VEHICLE_RATE_LIMITER?: RateLimitBinding;
}
