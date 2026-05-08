<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# UnitFlip

UnitFlip is an offline-first frontend application. The local development and test flow only needs Node.js and a browser. Docker support is included for clean build and test validation plus optional containerized local dev serving.

## Run Locally

Prerequisites: Node.js

1. Install dependencies:
   `npm ci`
2. Start the dev server:
   `npm run dev`
3. Typecheck:
   `npm run lint`
4. Production build:
   `npm run build`
5. Preview the validated production build:
   `npm run preview`

`npm run preview` serves the built `dist` folder with a small Node server at [http://localhost:3001](http://localhost:3001). Use this only for UnitFlip prod/local preview after `npm run build`; UnitFlip dev/testing stays on [http://localhost:3000](http://localhost:3000). If you specifically need Vite's preview server, use `npm run preview:vite`.

## Port and Tunnel Contract

- UnitFlip dev/testing: [http://localhost:3000](http://localhost:3000)
- Temporary compatibility dev entry: [http://localhost:3100](http://localhost:3100), mapped to the same dev container until the Cloudflare tunnel target is verified.
- UnitFlip prod/local preview: [http://localhost:3001](http://localhost:3001)
- `field.fugetti.com` should point to UnitFlip dev/testing at canonical `localhost:3000`, never to prod/local preview on `3001`. Keep the `3100` compatibility mapping until the live tunnel target is confirmed.

## Docker-Friendly Local Config

The app does not hardcode its repo checkout location, so moving the folder is fine. If you are running the dev server inside Docker, you can override the Vite host, port, proxy target, and file watching behavior from `.env`:

```env
VITE_DEV_HOST=0.0.0.0
VITE_DEV_PORT=3000
VITE_API_PROXY_TARGET=http://host.docker.internal:4317
VITE_DOCKER=true
```

Use `host.docker.internal` for services that still run on your host machine while Vite runs in the container.

## Docker Validation

Build the lint target:

```bash
docker build --target lint -t unitflip:lint .
```

Build the production build target:

```bash
docker build --target build -t unitflip:build .
```

Run the dev server in Docker:

```bash
docker compose up --build
```

Then open [http://localhost:3000](http://localhost:3000).

## Docker Command Overrides

If you want to run commands directly in the dev image:

```bash
docker build --target dev -t unitflip:dev .
docker run --rm unitflip:dev npm run lint
docker run --rm unitflip:dev npm run build
```
