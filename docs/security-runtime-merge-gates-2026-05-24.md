# Security Runtime Merge Gates - 2026-05-24

## Builder Proposal

Before merging `repo-hardening-may-24-2026`, keep this pass limited to security/runtime evidence and low-risk corrections. The branch should remain focused on local-first MVP hardening and must not absorb deferred Supabase/report-renderer spike work.

## Critic Review

The biggest release risk is external access control, not local code. A green build does not make `field.fugetti.com` safe if a logged-out user can reach UnitFlip. Dependency advisories also need direct treatment, but broad upgrades or behavior changes would be the wrong fix during a merge hardening pass.

## Revised Solution

This pass applies only non-force audit remediation and documents merge gates:

- No product workflow changes.
- No inspection or procurement refactor.
- No deferred Supabase/report-renderer spike files.
- No secrets or local env files.
- External field access protection remains a release gate.

## Security Findings

Secret scan status:

- No committed real secret values were found in tracked source, docs, Docker, compose, or scripts.
- `.env` and `.env.production.local` are ignored and not tracked.
- `.env.example` and `.env.production.example` are tracked templates with blank placeholder values.
- Supabase service-role references are environment variable lookups in edge functions or blank examples, not committed values.

Rotation recommendation:

- No rotation is recommended from this scan because no concrete key/token value was found.
- Rotate externally if any real value has previously been copied into local untracked env files or Cloudflare/Supabase dashboards.

## Field Access Gate

Status: release-blocking until externally verified.

This repo owns local runtime scripts and documentation for `field.fugetti.com`, including the Cloudflare tunnel startup helper. It does not own Cloudflare Access policy-as-code. Do not treat the field URL as safe until a logged-out/incognito request to `https://field.fugetti.com` shows Cloudflare Access, Zero Trust, VPN, or equivalent authentication before the UnitFlip UI loads.

## npm Audit Triage

Baseline `npm audit` found:

- Critical: `protobufjs`
- High: `vite`, `picomatch`
- Moderate: `@protobufjs/utf8`, `brace-expansion`, `postcss`, `uuid`, `ws`

`npm audit fix --dry-run` showed non-force patch/minor remediation only. The applied fix updated `package-lock.json` without changing `package.json` and reduced audit output to `0 vulnerabilities`.

## Docker Runtime Gate

Docker reports `VITE_SUPABASE_ANON_KEY` as an ARG/ENV secret warning because the variable name contains `KEY`.

Assessment:

- Supabase anon keys are public client configuration, not service-role credentials.
- The real secret boundary is `SUPABASE_SERVICE_ROLE_KEY`; it must never be passed to the frontend image or committed.
- The warning is worth documenting, but changing the Vite build-time env pattern would alter deployment behavior and is outside this narrow pass.

## Bundle Gate

The Vite large chunk warning remains. This is not a security/runtime merge blocker for this pass. It should be handled as a separate performance cleanup phase with deliberate code splitting.

## Deferred Files

These files remain intentionally untracked and must not be included in this merge:

- `supabase/functions/_shared/reportRenderer.enriched-deferred.ts`
- `supabase/functions/generate-report/index.enriched-deferred.ts`

## Merge Recommendation

Safe to merge only after external Cloudflare Access verification.
