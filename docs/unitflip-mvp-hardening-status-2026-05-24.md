# UnitFlip MVP Hardening Status - 2026-05-24

## Builder Proposal

Prepare the current UnitFlip repository for a safe GitHub review branch by preserving the dirty work, separating MVP hardening from risky cloud/report experiments, and validating every code commit.

## Critic Review

The main risk is not the local app. The risk is accidentally bundling unfinished Supabase/report-renderer work or treating the public field URL as field-test safe before access protection is verified. A cleanup branch should reduce release risk, not turn this into a broader feature push.

## Revised Solution

Keep the branch focused on local-first MVP hardening:

- Preserve the dirty worktree with local patch manifests.
- Commit docs and security status first.
- Commit local role/session, focused workflow, template, catalog/material, procurement-view preference, seed, and test changes in small groups.
- Leave deferred Supabase/report-renderer files uncommitted unless separately validated.
- Treat public field access as a release blocker until Cloudflare Access or equivalent protection is confirmed.

## Implementation Plan

Files and areas expected in the review stack:

- `docs/` and `ai/`: operating docs, handoff notes, hardening status, and field access checklist.
- `src/core/services/AppContextService.ts` and `src/core/services/AuthPolicyService.ts`: default role and permission hardening.
- `src/components/Layout.tsx` and `src/components/LocalSignInScreen.tsx`: role-aware local shell behavior.
- `src/components/NewInspectionModal.tsx`, `src/components/RoomCapturedItemsFeed.tsx`, and `voice.spec.js`: focused inspection workflow stability and coverage.
- `src/components/ChecklistTemplateEditorModal.tsx`, `src/components/TemplateManager.tsx`, and `src/components/ChecklistScopedOverrideEditorModal.tsx`: checklist editing and scoped override polish.
- `src/components/ProductManager.tsx`: catalog/material management refinement.
- `src/components/ProcurementWorkspace.tsx`: local procurement workspace view preferences only.
- `src/core/services/DevSeedService.ts`: deterministic demo seed and fixture cleanup.

## Classification

Safe MVP hardening:

- `src/components/Layout.tsx`
- `src/components/LocalSignInScreen.tsx`
- `src/components/NewInspectionModal.tsx`
- `src/components/RoomCapturedItemsFeed.tsx`
- `src/core/services/AppContextService.ts`
- `src/core/services/AuthPolicyService.ts`
- `voice.spec.js`

Procurement/workspace polish:

- `src/components/ProductManager.tsx`
- `src/components/ProcurementWorkspace.tsx`
- `docs/Master prompt/Procurement/Saved Workspace Preferences procurement.txt`
- `docs/Master prompt/Procurement/procurement_maintenance_completion_plan.md`
- `docs/Master prompt/Procurement/unitflip-procurement-maintenance-completion-plan.md`

Template/configuration polish:

- `src/components/ChecklistTemplateEditorModal.tsx`
- `src/components/TemplateManager.tsx`
- `src/components/ChecklistScopedOverrideEditorModal.tsx`

Risky or unfinished work:

- `supabase/functions/_shared/reportRenderer.enriched-deferred.ts`
- `supabase/functions/generate-report/index.enriched-deferred.ts`

Docs-only:

- `ai/`
- `docs/Master prompt/handoff/unitflip_handoff.md`
- `docs/unitflip-mvp-hardening-status-2026-05-24.md`
- `docs/field-access-hardening-checklist.md`

Generated/cache/should-ignore:

- `repo-dirty-worktree-2026-05-24.patch`
- `repo-staged-2026-05-24.patch`
- `repo-untracked-2026-05-24.txt`

## Summary of Changes

This cleanup intentionally removes release ambiguity rather than adding new field workflows. It documents what is safe, what needs review, and what must stay out of the MVP push.

## Next Step Suggestions

1. Finish the reviewable commit stack on `repo-hardening-may-24-2026`.
2. Validate lint, build, and Docker compatibility.
3. Push the branch and open a PR, not a direct push to `main`.
