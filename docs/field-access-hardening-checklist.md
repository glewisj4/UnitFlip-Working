# Field Access Hardening Checklist

## Builder Proposal

Protect `field.fugetti.com` before using it for real field testing. The repo owns local runtime scripts and documentation, but it does not appear to own Cloudflare Access policy configuration.

## Critic Review

The field URL being reachable is useful for testing, but public access is not acceptable for inspection data. Do not hide this behind optimistic wording. Until protection is verified, this is a release blocker.

## Revised Solution

Do not implement Cloudflare Access directly from this repo. Track the required manual or infrastructure-owned checks here and keep the app release status blocked until access protection is confirmed.

Detailed setup and verification steps live in [field-access-verification.md](field-access-verification.md).

## Implementation Plan

Use this checklist before treating `field.fugetti.com` as safe:

- Confirm `field.fugetti.com` routes only to the UnitFlip dev/testing origin at `localhost:3000`.
- Confirm it is not routed to the local production preview at `localhost:3001`.
- Add Cloudflare Access, Zero Trust, VPN, or equivalent authentication in the infrastructure owner account.
- Require identity-based login before the UnitFlip app loads.
- Protect both the HTML app route and any API/share/report endpoints reachable through the same hostname.
- Test from a logged-out browser profile and a separate network.
- Logged-out or incognito requests to `https://field.fugetti.com` must show a Cloudflare Access, Zero Trust, VPN, or equivalent authentication challenge before any UnitFlip UI loads.
- Confirm unauthenticated access shows the access provider challenge, not UnitFlip.
- Confirm authenticated access still loads the focused field workflow on mobile.
- Record who owns Access policy changes and where rollback happens.
- Record the completed verification result in the PR or release handoff.

## Release Blocker

Status: unknown / blocked.

`field.fugetti.com` must be treated as unprotected until verified from outside an authenticated session. This branch does not prove Cloudflare Access is enabled.

## Validation Notes

Repository checks currently find Cloudflare tunnel/runtime scripts and `field.fugetti.com` documentation, but no Cloudflare Access policy-as-code owned by this repo. Access protection must be verified outside the app code unless that infrastructure is later added here.

## Summary of Changes

This checklist keeps field access risk visible without coupling UnitFlip MVP cleanup to external Cloudflare account changes.

## Next Step Suggestions

1. Verify current public reachability from a private browser session.
2. Add Cloudflare Access in the infrastructure owner account.
3. Re-run the logged-out access check before field testing.
