# Field Access Verification

## Purpose

`field.fugetti.com` must not be used for field testing until Cloudflare Access or equivalent identity protection is verified from a logged-out browser. This repo documents the gate and provides a local probe, but it does not currently own Cloudflare Access policy-as-code.

Cloudflare setup reference:

- Cloudflare self-hosted public applications: https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/self-hosted-public-app/
- Cloudflare Access application types: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/choose-application-type/
- Cloudflare one-time PIN login: https://developers.cloudflare.com/cloudflare-one/identity/one-time-pin/

## Required Cloudflare Access Policy

- Application hostname: `field.fugetti.com`
- Access must challenge before UnitFlip loads.
- Allowed users must be limited to Greg and explicitly approved testers.
- Use one-time PIN, Cloudflare identity, or an approved identity provider login.
- Do not add a public bypass rule.
- Do not use a service-token-only policy for browser access.
- Use a reasonable session duration for field testing, then require reauthentication.
- Protect every browser route and any API, share, or report endpoint reachable through `field.fugetti.com`.
- Do not expose the app to all internet users.

## Manual Cloudflare Dashboard Setup Checklist

This is external infrastructure work unless Cloudflare Access policy management is later added to this repo.

- Open the Cloudflare dashboard.
- Go to Zero Trust.
- Go to Access controls, then Applications.
- Add an application.
- Choose a self-hosted application for a public hostname.
- Set the application hostname to `field.fugetti.com`.
- Configure allowed tester emails or an approved tester group.
- Choose one-time PIN, Cloudflare identity, or the approved identity provider.
- Confirm there is no public bypass policy.
- Confirm there is no service-token-only browser policy.
- Save the application and policy.
- Test in a logged-out or incognito browser before sharing the field URL.

## Verification Procedure

Use this procedure before any field test:

- Open `https://field.fugetti.com` in a logged-out or incognito desktop browser.
- Confirm a Cloudflare Access, one-time PIN, Cloudflare identity, or equivalent identity challenge appears before UnitFlip loads.
- Confirm the UnitFlip shell, app HTML, inspection workflow, or static asset UI does not load before authentication.
- Authenticate as an approved tester.
- Confirm UnitFlip loads normally after the challenge.
- Repeat the logged-out test on a mobile browser if field testing will happen on a phone.
- Record the date, tester identity method, device type, and result in the PR or release handoff.

Optional repo-side probe:

```powershell
npm run check:field-access
```

The probe is conservative. It does not authenticate and it does not prove the Access policy is correct for all users; it only helps detect obvious public app exposure.

## Failure Criteria

Field access is unsafe if any of these are true:

- App HTML loads directly in a logged-out or incognito browser.
- A `200 OK` app shell is returned without an authentication challenge.
- Cloudflare proxies the app but does not challenge.
- UnitFlip static assets or the inspection workflow are visible before login.
- A public bypass rule allows unauthenticated browser traffic.
- Browser access relies only on a service token policy.

## PR Checklist

Required before field testing:

- [ ] Cloudflare Access app created for `field.fugetti.com`.
- [ ] Allowed tester emails/groups configured.
- [ ] Logged-out/incognito desktop browser shows Access challenge before UnitFlip loads.
- [ ] Mobile logged-out test shows Access challenge before UnitFlip loads.
- [ ] Authenticated tester can load UnitFlip after challenge.
- [ ] Verification result recorded in the PR or release handoff.

## Merge And Field-Test Rule

- The PR can be reviewed repo-locally.
- Field testing is blocked until Cloudflare Access verification passes.
- Do not call the deployment field-test safe until verification is recorded.
- If `npm run check:field-access` reports `FAIL_PUBLIC_APP_HTML`, treat that as a release blocker until manual verification proves protection is active.
