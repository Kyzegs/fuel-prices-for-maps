# Fuel Prices for Maps

Chrome and Firefox extension that overlays selected-country fuel costs on Google Maps routes.

## What It Does

- Detects visible driving-route distances in Google Maps.
- Shows an inline trip fuel-cost estimate next to each route distance.
- Uses European Commission Weekly Oil Bulletin prices for EU gasoline 95, diesel, and LPG.
- Lets users set fuel economy, country, fuel type, and display currency.
- Optionally looks up Dutch RDW vehicle economy and UK DVLA vehicle details by license plate. Saved plates stay in local extension storage only.

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

For local Worker UK plate lookups, add your DVLA VES key to `.env` or `.dev.vars`:

```env
DVLA_VES_API_KEY=your_dvla_ves_key
```

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
npm run worker:deploy
```

The Worker/API deployment does not need `WXT_API_BASE_URL`; that variable is only required when building the browser extension because the extension package needs to know the API URL at build time.

`ALLOWED_ORIGINS` is intentionally empty by default, which makes public GET CORS open for extension clients whose browser-store origins are not known before publication.

UK plate lookups use the DVLA Vehicle Enquiry Service from the Worker only. For production, configure the key as a Cloudflare secret instead of committing it:

```bash
npx wrangler secret put DVLA_VES_API_KEY --env production
```

Wrangler v4 can load Worker local secrets from `.env` or `.dev.vars`; production secrets should be configured through Cloudflare Workers secrets.

## Scheduled Price Sync Worker

Fuel price imports run in a separate sync-only Cloudflare Worker with a Cron Trigger. It has no public routes and writes to the same `PRICE_CACHE` KV namespace as the API Worker.

Deploy it with:

```bash
npm run sync-worker:deploy
```

The cron schedule is configured in `wrangler.sync.toml` and runs daily at `03:15` UTC:

```toml
[triggers]
crons = ["15 3 * * *"]
```

## Public API

- `GET /health`
- `GET /prices/latest?countries=NL,BE&fuel=gasoline_95`
- `POST /vehicles/lookup` with JSON body `{ "country": "UK", "plate": "AB12CDE" }`
- `GET /vehicles/lookup?country=NL&plate=...` for legacy clients

Public price reads do not trigger forced upstream refreshes. If a fresh backend fetch fails in the extension, recent local cached data can be shown with a cached-data status message.

## API Cost Controls

The Worker uses Cloudflare Rate Limiting bindings as a first line of defense:

- `/prices/latest`: 10 requests per minute per client IP.
- `/vehicles/lookup`: 2 requests per minute per client IP.

Price responses are cacheable for a short browser window and a longer shared-cache window because the imported prices change daily. Vehicle lookup responses are marked `private, no-store`.

Cloudflare billing/usage alerts are still recommended; rate limits reduce abuse, while alerts catch accidental traffic spikes or configuration mistakes.

## Packaging

```bash
WXT_API_BASE_URL=https://api.fuel-cost.app npm run build:extension
WXT_API_BASE_URL=https://api.fuel-cost.app npm run release:check
npm run zip:chrome
npm run zip:firefox
```

Generated packages are written under `.output/`.

## Troubleshooting

- If fuel prices are unavailable, check Worker `/health`, KV bindings, and the sync Worker cron logs.
- If Google Maps annotations disappear, reload the Maps tab; the content script observes route sidebar changes and re-annotates visible route distances.
- If RDW or DVLA lookup fails or returns no economy, enter fuel economy manually.
