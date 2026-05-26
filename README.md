# Fuel Cost for Maps

Chrome and Firefox extension that overlays selected-country fuel costs on Google Maps routes.

## What It Does

- Detects visible driving-route distances in Google Maps.
- Shows an inline trip fuel-cost estimate next to each route distance.
- Uses European Commission Weekly Oil Bulletin prices for EU gasoline 95, diesel, and LPG.
- Lets users set fuel economy, country, fuel type, and manual country/fuel price overrides.
- Optionally looks up Dutch RDW vehicle economy by license plate. Saved plates stay in local extension storage only.

## Stack

- WXT + React + TypeScript browser extension
- Cloudflare Workers + Hono backend API
- Cloudflare KV for imported price reports
- `chrome.storage`/WebExtension storage for user settings
- Vitest + Testing Library for unit and UI tests

## Local Development

```bash
npm install
cp .env.example .env
npm run dev
npm run dev:firefox
npm run worker:dev
```

Set `WXT_API_BASE_URL` in `.env` to the one API URL the extension should call. Browser extensions cannot read `.env` after packaging, so this value is compiled into each build.

## Quality Gates

```bash
npm run typecheck
npm test
npm run build:chrome
npm run build:firefox
npm run worker:build
npm run release:check
```

`release:check` typechecks, tests, builds both extension targets, dry-runs the Worker bundle, and creates Chrome/Firefox zip packages.

## Worker Setup

1. Create production and preview Cloudflare KV namespaces for `PRICE_CACHE`.
2. Replace the placeholder IDs in `wrangler.toml`.
3. Deploy the Worker:

```bash
wrangler deploy --env production
```

`ALLOWED_ORIGINS` is intentionally empty by default, which makes public GET CORS open for extension clients whose browser-store origins are not known before publication.

## Price Sync Job

Fuel price imports run outside the public API Worker. Configure these environment variables in `.env` or your scheduler:

```bash
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_API_TOKEN=...
CLOUDFLARE_KV_NAMESPACE_ID=...
SYNC_INTERVAL_MINUTES=1440
```

Run once:

```bash
npm run sync:prices
```

Run as a lightweight daemon:

```bash
npm run sync:prices:daemon
```

The daemon runs immediately, then repeats on `SYNC_INTERVAL_MINUTES`. It can also be replaced by cron, systemd, GitHub Actions, or another scheduler that runs `npm run sync:prices`.

## Public API

- `GET /health`
- `GET /prices/latest?countries=NL,BE&fuel=gasoline_95`
- `GET /vehicles/lookup?country=NL&plate=...`

Public price reads do not trigger forced upstream refreshes. If a fresh backend fetch fails in the extension, recent local cached data can be shown with a cached-data status message.

## API Cost Controls

The Worker uses Cloudflare Rate Limiting bindings as a first line of defense:

- `/prices/latest`: 10 requests per minute per client IP.
- `/vehicles/lookup`: 2 requests per minute per client IP.

Price responses are cacheable for a short browser window and a longer shared-cache window because the imported prices change daily. Vehicle lookup responses are marked `private, no-store`.

Cloudflare billing/usage alerts are still recommended; rate limits reduce abuse, while alerts catch accidental traffic spikes or configuration mistakes.

## Packaging

```bash
npm run zip:chrome
npm run zip:firefox
```

Generated packages are written under `.output/`.

## Troubleshooting

- If fuel prices are unavailable, check Worker `/health`, KV bindings, and the external sync job logs.
- If Google Maps annotations disappear, reload the Maps tab; the content script observes route sidebar changes and re-annotates visible route distances.
- If RDW lookup fails or returns no economy, enter fuel economy manually.
