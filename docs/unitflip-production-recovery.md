# UnitFlip Production Recovery

This repo now supports a production-safe frontend container that is separate from the local dev/Vite flow and does not depend on SiteEnhancer.

## Local production-style run

1. Provide public frontend env vars:

```powershell
$env:VITE_SUPABASE_URL='https://your-project.supabase.co'
$env:VITE_SUPABASE_ANON_KEY='public-anon-key'
$env:VITE_USE_EDGE_FUNCTIONS='true'
```

2. Build and run:

```powershell
docker compose -f compose.prod.yml up --build -d
```

3. Verify:

```powershell
curl http://localhost:3001/healthz
```

Open [http://localhost:3001](http://localhost:3001).

## Cloudflare ingress shape

Use a new hostname only:

- `field.fugetti.com` -> UnitFlip dev/testing at `localhost:3000`
- `localhost:3100` remains a temporary compatibility entry to the same dev container until the live Cloudflare tunnel target is verified.
- UnitFlip prod/local preview remains local-only at `localhost:3001`; do not point `field.fugetti.com` at port `3001`.

Do not point UnitFlip at SiteEnhancer routes or hostnames.

## Required public env vars

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_USE_EDGE_FUNCTIONS=true`

Do not put `SUPABASE_SERVICE_ROLE_KEY` in the frontend container.

## Legacy notes

- `compose.yml` remains the local dev setup.
- The `/api -> 4317` Vite proxy is still present for legacy local development only.
- Current production recovery should not depend on port `4317` unless you intentionally restore the old retail resolver.
