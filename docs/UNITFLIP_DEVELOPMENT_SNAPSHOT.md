# UnitFlip Development Snapshot

## 1. Executive Summary
UnitFlip is currently an offline-first React/Vite application focused on unit-turn operations, inspections, repair scope generation, procurement intelligence, and report/share workflows. The app is strongest in its local-first service/model architecture, deterministic procurement intelligence stack, and the breadth of implemented operational surfaces around inspections, templates, reports, and procurement maintenance.

The project appears to be in a late feature-complete MVP or early operational hardening stage. Core flows are implemented and many areas have already moved into usability refinement and maintenance polish rather than first-time feature construction.

## 2. Current Development Status
Clearly implemented and working:
- inspection/unit navigation and inspection detail workflows
- checklist/template/layout/mapping management
- repair/material generation and procurement draft creation
- deterministic procurement optimization, vendor intelligence, review guidance, refresh, filtering, digest, and maintenance export
- report snapshot generation, shared/public report viewing, and print/PDF-friendly report presentation
- Docker-based dev/lint/build validation flow

Appears stable:
- local storage/service-driven architecture
- procurement intelligence and maintenance stack
- report/share surfaces
- Docker validation contract

Actively refined/polished:
- procurement workspace ergonomics
- maintenance visibility and ops handoff support
- manual draft annotation usability

Appears incomplete or still rough:
- long-term analytics beyond bounded local history
- richer backend/cloud behavior beyond current local-first approach
- some legacy/local state split remains in `App.tsx`
- bundle size/chunking still needs optimization

## 3. Current Architecture
Frontend stack:
- React 19
- TypeScript
- Vite
- Tailwind CSS
- `lucide-react` icons

Storage approach:
- local adapter abstraction in `src/core/adapters`
- IndexedDB where available, local storage fallback, placeholder Capacitor SQLite path
- many domains use dedicated services with their own local persistence

Offline/local-first behavior:
- primary mode is local-first and deterministic
- services own storage and data access
- sync-related services exist, but the app still behaves like a frontend-first local app

Service/model organization:
- domain models live under `src/core/models`
- operational behavior lives under `src/core/services`
- UI surfaces live under `src/components`

Report/export/share structure:
- report snapshots are built by `InspectionReportSnapshotService`
- report display surfaces use shared presentation components like `ReportProcurementInsights`
- public/shared report viewing is handled by `ShareLinkViewer`
- procurement exports include draft CSV plus a plain-text maintenance snapshot export

Docker/testing setup:
- multi-stage `Dockerfile` supports `lint`, `build`, and `dev`
- `compose.yml` runs Vite in containerized dev mode on container port `3000`
- current validated contract expects explicit Docker lint/build/dev commands to keep working

## 4. Current App Structure
Major repo/app structure:
- `src/components`
  - main UI surfaces like `Dashboard`, `InspectionDetail`, `TemplateManager`, `ProcurementWorkspace`, `ShareLinkViewer`
- `src/core/models`
  - domain models for inspections, operations, procurement, reports, share, sync, templates, archive, audit, retention
- `src/core/services`
  - main service layer for inspections, procurement, templates, reports, sharing, import, retention, sync, catalog, media
- `src/services`
  - legacy/local app-state helpers such as storage
- `docs`
  - prompt/docs material
- `server`
  - server-side or support assets not central to current local-first frontend flow
- `supabase`
  - Supabase-related setup/support files

Major components/workspaces:
- dashboard / rooms / products / repair kits
- unit and inspection flows
- template/layout/mapping management
- procurement workspace
- admin retention surface
- public share viewer

Important models/types:
- `operations.ts`
- `procurement.ts`
- `reports.ts`
- `inspections.ts`
- `templates.ts`
- `types.ts`

## 5. Completed Functional Areas
Inspection and unit workflows:
- supports unit selection, inspection lists, inspection detail editing, media attachment, report generation, and shared/public report viewing
- appears mostly complete for current product scope
- still relies on some mixed legacy app-state patterns in `App.tsx`

Template and checklist generation:
- includes checklist templates, layout templates, layout-to-checklist mapping, inspection generation support, and template manager surfaces
- appears substantially complete
- strong area of the current codebase

Procurement intelligence:
- supports procurement draft creation from material requirements
- includes deterministic pack optimization, vendor intelligence, review guidance, refresh, bulk refresh, sorting/filtering/grouping, maintenance summaries, history, digest, export, and manual notes
- appears highly complete and heavily polished
- safe candidate to deprioritize except for optional UX polish

Reports, share, and presentation:
- report snapshot generation is implemented
- in-app and shared/public report surfaces exist
- procurement intelligence is integrated into reports
- print/PDF friendliness has been explicitly improved
- appears mostly complete within the current browser/PDF-view workflow

Docker/dev validation:
- local dev plus Docker lint/build/dev flow is documented and implemented
- appears stable and should be treated as part of the development contract

## 6. In-Progress / Partial Areas
Legacy app-state split:
- `App.tsx` still notes that some app state is legacy/local-only while other domains live in dedicated services
- current state works, but architectural cleanup could still simplify future development
- risk is cognitive overhead and duplication across state/storage patterns

Sync/cloud readiness:
- sync, Supabase, and remote adapters exist
- local-first behavior is much clearer than any true multi-user or cloud-backed operational mode
- likely partial rather than fully production-ready in distributed scenarios

Analytics/history depth:
- bounded ledger and digest exist for procurement maintenance
- this is intentionally lightweight
- anything beyond bounded local history would require deliberate future design

## 7. Deferred / Not Yet Built Areas
- approval/review/export workflow machinery
- notification systems
- scheduled background jobs
- collaborative comments/mentions/threading
- richer long-horizon analytics or alerting
- fully realized backend-driven operational orchestration
- deep charting/reporting infrastructure

## 8. Procurement / Maintenance Track Status
Implemented:
- draft generation from material requirements
- deterministic optimization
- vendor intelligence and freshness/risk logic
- typed review guidance
- report integration
- in-workspace insights
- CSV export
- portfolio summary
- explicit refresh and bulk refresh
- refresh result visibility
- refresh-health triage
- bounded historical ledger
- weekly maintenance digest
- exportable maintenance snapshot
- manual draft annotations
- annotation visibility polish
- sorting and grouping ergonomics

Polished:
- draft card visibility and scanability
- read-only maintenance triage
- manual notes kept separate from computed intelligence
- maintenance/export handoff surface

What remains optional polish only:
- remembering workspace preferences
- additional visual polish for note visibility
- bundle-size optimization
- small reporting/export formatting improvements

Safety to deprioritize:
- yes, the procurement/maintenance track appears safe to deprioritize while focus shifts elsewhere, as long as the existing Docker contract and deterministic behavior are preserved

## 9. Reports / Exports / Share Surfaces
Report generation/presentation:
- reports use a snapshot architecture
- procurement intelligence is presented in-app and in shared/public views

Shared/public report viewing:
- handled by `ShareLinkViewer`
- supports local and remote share adapter paths

CSV or text export capabilities:
- procurement draft CSV export exists
- maintenance snapshot plain-text export exists

Print/PDF friendliness:
- report procurement presentation has print-friendly styling and grouping
- browser print / PDF-oriented rendering is improved without adding a separate PDF engine

Known limitations:
- current project still leans on browser/rendered report flows rather than a dedicated document-generation pipeline

## 10. Docker / Validation Contract
Known validation expectations:
- `npm run lint`
- `npm run build`
- `docker build --no-cache -t unitflip:dev .`
- `docker build --no-cache --target lint -t unitflip:lint .`
- `docker build --no-cache --target build -t unitflip:build .`
- `docker run --rm -p 3000:3000 unitflip:dev npm run dev -- --host 0.0.0.0 --port 3000`
- `docker compose up --build`

Current Docker details:
- dev image runs Vite on container port `3000`
- compose file maps canonical dev access at `3000:3000`
- compose file also keeps temporary compatibility access at `3100:3000` until the live Cloudflare tunnel target is verified
- local README documents Docker-friendly env overrides for dev

Known warnings:
- Vite build still emits a large-chunk warning for the main bundle

## 11. Known Gaps, Risks, or Rough Edges
- Vite large-chunk warning remains unresolved
- local-first architecture is strong, but cloud/sync semantics appear less mature than the local workflows
- mixed legacy/local app-state vs service-owned domain storage still exists
- bounded history and digest are intentionally lightweight, not long-term analytics
- manual notes are local-only and not versioned
- some server/supabase paths exist, but the dominant source of truth is still the local app/service layer

## 12. Recommended Next Priorities
Highest priority overall app work:
1. Reduce architectural friction between legacy `App.tsx` state and service-owned domain stores
2. Improve bundle/chunking performance and reduce Vite warning pressure
3. Clarify the intended future sync/cloud path versus the current local-first contract

Lower priority polish work:
1. Persist procurement workspace preferences for filters/sorts/grouping
2. Further UI polish for maintenance and annotation discoverability
3. Small export/report formatting refinements

What can safely wait:
1. deeper procurement feature expansion
2. long-term analytics/reporting layers
3. collaboration/notification workflows
4. complex approval or orchestration flows

## 13. Finished vs Unfinished Summary Table
| Area | Status | Notes |
|---|---|---|
| Core local-first frontend architecture | Mostly Complete | Strong local-first foundation, some legacy state split remains |
| Inspection workflows | Mostly Complete | Core flows implemented and usable |
| Templates / checklist / mapping stack | Complete | One of the strongest current areas |
| Procurement intelligence stack | Complete | Mature and heavily polished |
| Procurement maintenance stack | Complete | Refresh, digest, ledger, export, annotations all present |
| Report snapshot and presentation | Mostly Complete | Good browser/report flow, no separate doc pipeline |
| Share/public report viewing | Mostly Complete | Implemented and integrated |
| CSV/text exports | Mostly Complete | Draft CSV and maintenance text export implemented |
| Docker validation setup | Complete | Should be treated as contractually stable |
| Cloud/sync maturity | Partial | Supporting pieces exist, but local-first path is clearer |
| Collaboration/notifications | Deferred | Not built and intentionally avoided |
| Long-term analytics | Deferred | Current approach is bounded and lightweight |

## 14. Suggested Handoff Notes for the Next Development Thread
Authoritative repo/root:
- `H:\Dev\MyApps\unitflip`

What not to break:
- `npm run lint`
- `npm run build`
- validated Docker contract
- deterministic procurement intelligence behavior
- separation between computed intelligence and manual annotations

Architectural rules that should continue:
- treat implemented code as source of truth
- preserve offline-first/local-first behavior
- prefer additive service-first changes
- avoid introducing workflow machinery unless explicitly requested
- keep manual notes separate from computed summaries and analytics

Where the next thread should focus first:
- architectural cleanup and consolidation around state/storage boundaries
- performance/chunking cleanup
- only then consider new feature expansion outside the already-complete procurement/maintenance track
