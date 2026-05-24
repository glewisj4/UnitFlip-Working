# UnitFlip Procurement Intelligence & Maintenance Track Completion Plan

## Status Summary

This track is functionally complete for the original roadmap and now sits in refinement/polish territory.

Completed foundation and maintenance capabilities:

- Deterministic procurement intelligence generation
- Vendor intelligence and review guidance
- Draft, report, print/PDF, and CSV visibility
- Portfolio summary and refresh-health triage
- Explicit single-draft refresh and filtered bulk refresh
- Refresh-change visibility, aging analytics, bounded ledger, and weekly maintenance digest
- Exportable maintenance snapshot
- Manual draft-level maintenance annotations
- Annotation visibility polish
- Sorting and grouping ergonomics in ProcurementWorkspace
- Stable Docker validation contract
- Passing `npm run lint` and `npm run build`

This means the next work is no longer foundational. It is about finishing this area cleanly so it can be considered complete and safely deprioritized while attention moves to a more urgent part of the app.

---

## Recommended Remaining Phases

### Phase A — Saved Workspace Preferences

**Goal:** remember the user’s workspace controls between sessions without changing workflow behavior.

**Why this is next:**
The workspace now supports filtering, sorting, and grouping. The next obvious usability win is to persist those choices so users do not have to reset them every session.

**What this phase should include:**
- Save the current ProcurementWorkspace view preferences locally
- Persist at least:
  - selected draft filter
  - selected sort mode
  - selected grouping mode
- Restore those settings on next load
- Keep sensible defaults when no preference exists
- Keep the preference model local-only and lightweight

**What this phase should not include:**
- no sync semantics
- no user profile/settings service
- no analytics coupling
- no per-org preference complexity unless it falls out trivially from current storage patterns

**Success criteria:**
- preferences restore correctly across sessions
- first-time behavior still feels sensible
- no change to deterministic procurement logic

---

### Phase B — Workspace Density and Scanability Polish

**Goal:** tighten the day-to-day workspace presentation so high-signal information is easier to scan with less visual clutter.

**Why this phase matters:**
The workspace is now feature-rich. The risk is not missing capability; the risk is a card becoming a kitchen junk drawer.

**What this phase should include:**
- tighten spacing and hierarchy inside draft cards
- improve consistency of badges, headings, and metadata rows
- reduce repeated wording where signals are already obvious
- ensure grouped sections still scan well when many drafts are present
- make “what needs attention first” even clearer without adding workflow state

**What this phase should not include:**
- no major redesign
- no new workflow controls
- no modal-heavy organization layer

**Success criteria:**
- draft cards feel easier to read at a glance
- dense states remain understandable
- no capability regression

---

### Phase C — Build/Bundle Performance Cleanup

**Goal:** address the recurring Vite large-chunk warning and reduce avoidable front-end weight in this area.

**Why this phase matters:**
This is the only repeatedly reported technical rough edge. Even if it is not breaking anything, it is the obvious cleanup target before calling the area “done done.”

**What this phase should include:**
- inspect bundle contributors in this workspace/report area
- identify low-risk code-splitting or lazy-loading candidates
- reduce unnecessary bundle weight where practical
- preserve current Docker contract and runtime behavior

**What this phase should not include:**
- no broad architectural rewrite
- no premature micro-optimization everywhere
- no performance theater without measurable reason

**Success criteria:**
- either the large-chunk warning is reduced/resolved, or its remaining cause is clearly documented
- no breakage to current workspace/report/export behavior

---

### Phase D — Legacy Draft Compatibility / Backfill Utility

**Goal:** make older local drafts more consistently aligned with the current intelligence stack without introducing surprise mutation.

**Why this phase matters:**
You already handled older drafts safely during refresh, but a narrow compatibility/backfill pass would make this area feel truly finished and less dependent on manual discovery.

**What this phase should include:**
- identify older draft records missing newer optional fields
- provide a safe deterministic way to normalize or refresh them
- keep it explicit or narrowly triggered
- preserve identity and traceability fields

**What this phase should not include:**
- no hidden migration magic
- no background auto-rewrite of user data
- no workflow state expansion

**Success criteria:**
- older drafts can be brought forward cleanly
- current logic remains the single source of derived intelligence truth

---

### Phase E — Completion Pass / Documentation and Exit Criteria

**Goal:** formally close this track so it can be deprioritized with confidence.

**Why this phase matters:**
A track is not truly complete until the stopping point is explicit. Otherwise it keeps attracting “just one more tweak” energy forever.

**What this phase should include:**
- confirm final scope boundaries for this procurement/maintenance subsystem
- document what is intentionally out of scope
- summarize supported capabilities
- record testing/validation expectations:
  - `npm run lint`
  - `npm run build`
  - Docker validation compatibility
- define what would justify reopening this area later

**What this phase should not include:**
- no new feature building disguised as documentation
- no reopening old workflow ideas

**Success criteria:**
- this area has a clear “complete enough to pause” handoff state
- future work can reference a stable completion note instead of rediscovering context from chat history

---

## Recommended Order

1. **Phase A — Saved Workspace Preferences**
2. **Phase B — Workspace Density and Scanability Polish**
3. **Phase C — Build/Bundle Performance Cleanup**
4. **Phase D — Legacy Draft Compatibility / Backfill Utility**
5. **Phase E — Completion Pass / Documentation and Exit Criteria**

This order gives you:
- immediate usability win
- cleaner operator experience
- technical cleanup
- legacy resilience
- formal closure

---

## Why this is enough to call the area complete

If the above phases are done, this part of the app will have:

- mature deterministic intelligence
- operational maintenance tooling
- export and handoff support
- human note support kept separate from computed truth
- good workspace ergonomics
- acceptable performance hygiene
- legacy/local-data resilience
- explicit completion boundaries

At that point, continuing to add more here would mostly be optional polish or scope creep.

---

## Immediate Next Prompt

Use this prompt next for the first remaining completion phase.

```md
Implement the next safe phase in H:\Dev\MyApps\unitflip.

Phase name:
Saved Workspace Preferences

Current state:
- H:\Dev\MyApps\unitflip is the sole source of truth.
- npm run lint and npm run build currently pass locally and in Docker, and must remain passing.
- Docker validation is part of the current development contract and must not be broken.
- The procurement-intelligence and maintenance roadmap is complete, and current work is now focused on finish-quality ergonomics rather than new foundational capability.
- ProcurementWorkspace already supports filtering, sorting, grouping, bulk refresh, refresh-health summary, maintenance digest, manual note visibility, and other stable read-only maintenance features.

Validated Docker contract:
- docker build --no-cache -t unitflip:dev .
- docker build --no-cache --target lint -t unitflip:lint .
- docker build --no-cache --target build -t unitflip:build .
- docker run --rm -p 3000:3000 unitflip:dev npm run dev -- --host 0.0.0.0 --port 3000
- docker compose up --build

Next objective:
Persist the user’s current ProcurementWorkspace viewing controls between sessions so filtering, sorting, and grouping choices are restored automatically.

Phase goal:
Add narrow, local-only saved workspace preferences for ProcurementWorkspace without introducing workflow complexity, sync semantics, or settings sprawl.

Rules:
- Work only in H:\Dev\MyApps\unitflip
- Do not break the validated Docker flow
- Do not introduce approval/review/export workflow machinery
- Do not add modal-heavy flows
- Do not broadly redesign ProcurementWorkspace
- Do not weaken typing
- Preserve offline-first, deterministic behavior
- Keep this phase local-only and additive
- Reuse existing local storage patterns where practical
- Do not change Docker files unless strictly required

Tasks:
1. Review the current ProcurementWorkspace controls and identify the safest additive way to persist view preferences.
2. Save and restore at least these workspace preferences:
   - selected draft filter
   - selected sort mode
   - selected grouping mode
3. Use sensible defaults when no saved preference exists.
4. Ensure the workspace still behaves clearly for first-time use.
5. Keep preferences separate from draft data and analytics data.
6. Keep the implementation lightweight and local-only.

Required completion summary:

1. Phase completed
   - confirm whether this phase was fully completed, partially completed, or blocked

2. Files changed
   - list every file added or modified
   - briefly describe what changed in each file

3. Saved preferences added
   - explain exactly which workspace preferences are now persisted
   - explain where/how they are stored
   - explain how defaults work when no preference exists

4. Surfaces enhanced
   - identify exactly how ProcurementWorkspace behavior changed across sessions

5. Progress status
   - summarize current overall project status
   - explain where this phase fits into the completion plan for this procurement/maintenance area
   - include an updated percent-complete estimate for this completion plan

6. Validation status
   - confirm:
     - npm run lint
     - npm run build
   - confirm Docker validation compatibility
   - list any warnings or limitations

7. What was intentionally deferred
   - list anything deliberately not implemented in this phase

8. Next-step recommendations
   - recommend the best next development step after this phase
   - explain why it is the correct next move
   - note any risks or prerequisites

Deliverable:
Implement only this saved workspace preferences phase and then stop.
```

---

## Suggested Pivot Guidance

This procurement/maintenance area is now stable enough to pause while you work on a more important part of the app.

When you come back to it later, use this order:

1. Saved Workspace Preferences
2. Workspace Density and Scanability Polish
3. Build/Bundle Performance Cleanup
4. Legacy Draft Compatibility / Backfill Utility
5. Completion Pass / Documentation and Exit Criteria

That should let you resume without losing the flow or having to reconstruct the strategy from scratch.

