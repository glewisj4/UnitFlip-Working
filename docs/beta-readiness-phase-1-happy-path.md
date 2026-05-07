# Beta Readiness Phase 1 Happy Path

Use this checklist to validate focused inspection report generation in the local/dev runtime.

## Setup

- Start the app with `docker compose up --build -d`.
- Open `http://localhost:3000` or `https://field.fugetti.com`.
- Use a local/dev account with access to Focused Mode.

## Manual Path

1. Create a test unit, or select an existing test unit.
2. Start a focused inspection for the unit.
3. Capture a mixed inspection:
   - Mark at least one item `Good`.
   - Mark at least one item `Repair`.
   - Mark at least one item `Replace`.
4. Leave at least one repair or replace item without assigned materials.
5. Confirm the completion action points the tester to finish materials before report generation.
6. Assign materials to the repair and replace items.
7. Complete each room and return to the focused summary.
8. Select `Generate Report`.
9. Confirm report generation succeeds and the app opens the inspection report handoff view.
10. Open the generated report artifact.
11. Confirm the report is real rendered output, not a placeholder/noop PDF.
12. Confirm the report shows:
    - top counts for `Good`, `Repair`, `Replace`, and `Need Materials`
    - `Issues Requiring Action` before passed/good items
    - repair and replace issues grouped by room/item
    - assigned materials inline under each issue
    - missing materials flagged inline if any issue is generated without materials
    - good items condensed under passed items
13. Reload the app and resume the same unit or inspection.
14. Confirm the inspection remains finalized/locked after successful report generation.
15. Choose `Edit Inspection`, confirm editing unlocks, then generate the report again when done.
16. Confirm the browser console has no runtime errors during the path.

## Failure Handling Check

- Simulate or force a report generation failure if practical.
- Confirm the app shows a clear error.
- Confirm the inspection is not finalized or locked when report generation fails.
- Confirm the tester can correct the issue and retry `Generate Report`.

## Deliberate Deferrals

- Do not validate purchase orders, RFQs, vendor optimization, or procurement automation in this path.
- Do not validate SiteEnhancer integration in this path.
