# UnitFlip Hybrid Inspection Workflow + Voice Integration

## Development Handoff Document

---

## 1. Objective

Shift UnitFlip to a workflow-first inspection experience:
- Fast in the field
- Natural while walking a unit
- Flexible input (structured + unstructured)
- Offline-first
- AI-ready (future)

---

## 2. Core UX Philosophy

"I walk the unit and just capture what I see."

NOT form-filling.

---

## 3. Hybrid Workflow

- Room-based navigation (primary)
- Rapid capture (text)
- Voice capture (hands-free)
- Guided checklist (consistency)

---

## 4. UI Structure

### Room Workspace

Top Bar:
- Back
- Inspection title
- Room selector
- Progress

Room Header:
- Room name
- Issue summary

Capture Strip:
- Quick actions
- Text input
- Voice button

Checklist:
- Room-specific items

Captured Items Feed:
- Real-time list of entries

Bottom Nav:
- Prev / Next room

---

## 5. Voice Capture

Two modes:
- Raw voice note
- Smart parsed capture

Always:
- Show preview
- Allow edit
- Never auto-save

---

## 6. Data Flow

Capture → Intent → Commit

CaptureIntent:
- room
- action
- item
- quantity
- notes

---

## 7. Components

- InspectionRoomWorkspace.tsx
- InspectionCaptureStrip.tsx
- RoomChecklistPanel.tsx
- RoomCapturedItemsFeed.tsx
- VoiceCapturePanel.tsx

---

## 8. Services

- VoiceCaptureService.ts
- InspectionCaptureParserService.ts
- InspectionCaptureCommitService.ts

---

## 9. Validation

Must pass:
- lint
- build
- Docker

Must not break:
- inspection
- reporting
- procurement

---

## 10. AI Roadmap

Phase 1: deterministic
Phase 2: optional AI parsing
Phase 3: photo assist
Phase 4: voice + image
Phase 5: walkthrough mode

---

## 11. Key Rule

AI is assistive, never authoritative.

---

## 12. Success Criteria

- Fast capture
- Minimal clicks
- Natural workflow
- Clean data mapping
