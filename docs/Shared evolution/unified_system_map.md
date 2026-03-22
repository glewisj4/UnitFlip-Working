# Unified System Map
## UnitFlip + SiteEnhancer Future Platform Architecture

This document describes how **UnitFlip** and **SiteEnhancer** should relate to each other over time without forcing an early merge.

The core idea is simple:

- **UnitFlip** handles inspection, repair planning, and field operations
- **SiteEnhancer** handles catalog resolution, vendor intelligence, procurement, and supply workflow
- Both are separate products
- Both eventually connect through stable APIs and shared domain rules

---

# 1. Platform Positioning

## UnitFlip
Operational app focused on property turns, inspections, unit refresh planning, and repair execution.

Primary users:

- property managers
- maintenance teams
- contractors
- regional operations staff

Primary outcome:

- identify issues
- scope work
- generate task lists
- estimate materials
- produce reports

## SiteEnhancer
Procurement intelligence platform focused on product resolution, vendor comparison, sourcing, quote workflow, and purchasing.

Primary users:

- purchasing teams
- operations managers
- sourcing teams
- procurement leads
- vendor coordinators

Primary outcome:

- resolve products
- compare vendors
- optimize purchasing
- manage quote lifecycle
- create purchase orders
- track delivery

---

# 2. High-Level Relationship

```text
                 ┌───────────────────────────────┐
                 │          Shared Layer         │
                 │ domain rules / api contracts  │
                 │ ids / events / auth model     │
                 └───────────────┬───────────────┘
                                 │
             ┌───────────────────┴───────────────────┐
             │                                       │
             │                                       │
┌────────────▼────────────┐              ┌───────────▼────────────┐
│        UnitFlip         │              │      SiteEnhancer      │
│ inspection operations   │              │ procurement engine     │
│ photo analysis          │              │ vendor intelligence    │
│ repair planning         │              │ quotes / POs / delivery│
└────────────┬────────────┘              └───────────┬────────────┘
             │                                       │
             └────────────── API Integration ────────┘
```

---

# 3. Functional Responsibility Split

## UnitFlip owns

```text
organizations
properties
units
inspections
photos
room-level findings
repair tasks
scope summaries
offline capture
field workflow
inspection reports
```

## SiteEnhancer owns

```text
vendor directory
catalog
product normalization
SKU resolution
basket building
vendor scoring
quote lifecycle
purchase orders
delivery tracking
procurement analytics
connector integrations
```

## Shared or mirrored concepts

```text
organization
user
vendor
requirement
product
basket item
purchase order reference
delivery event reference
audit metadata
```

---

# 4. End-to-End Future Workflow

```text
1. UnitFlip inspection completed
2. Issues identified from manual entry or AI photo analysis
3. Repair tasks generated
4. Material requirements inferred
5. Requirements sent to SiteEnhancer
6. SiteEnhancer resolves products / SKUs
7. SiteEnhancer optimizes vendors
8. Quotes or purchasing options returned
9. Purchase orders created
10. Delivery status returned to originating project
11. UnitFlip shows procurement and completion progress
```

---

# 5. Canonical Integration Pipeline

## Step A — UnitFlip creates operational data

```text
Property
→ Unit
→ Inspection
→ Finding
→ Repair Task
→ Material Requirement
```

## Step B — SiteEnhancer turns requirements into procurement

```text
Requirement
→ Product Resolution
→ Vendor Match
→ Basket
→ Quote / PO
→ Delivery Tracking
```

## Step C — Results flow back to UnitFlip

```text
basket status
recommended vendors
PO state
delivery ETA
received materials
cost summary
```

---

# 6. System Component Map

## UnitFlip components

```text
UI
├── property dashboard
├── unit detail
├── inspection workflow
├── photo capture and review
├── AI issue analysis
├── repair task list
├── shopping/material suggestion view
└── report generation

App services
├── local storage / IndexedDB
├── sync queue
├── media storage
├── AI analysis orchestration
└── reporting/export

Backend or sync edge
├── auth/session
├── org/user management
├── inspection sync endpoints
└── integration gateway
```

## SiteEnhancer components

```text
UI
├── customer/project workspace
├── requirements review
├── catalog workspace
├── vendor optimization
├── quote workflow
├── PO management
└── delivery tracking

Backend services
├── auth/RBAC
├── catalog services
├── vendor intelligence
├── quote services
├── purchase order services
├── delivery services
├── analytics/event pipeline
└── connector adapter framework
```

---

# 7. Shared Platform Layer

The shared layer is not a full app. It is a set of agreements.

## It should include

```text
domain naming conventions
API contract definitions
event naming standards
identifier format
auth/role alignment
status enums
audit metadata rules
documentation
```

## It should not include

```text
forced database coupling
cross-app direct table access
early premature shared UI
tight runtime dependency
```

That last one is where projects go to die. Quietly. In a ditch.

---

# 8. Recommended API Boundary

UnitFlip should call SiteEnhancer through explicit APIs, not database shortcuts.

## Recommended integration endpoints

```text
POST   /api/v1/requirements/import
POST   /api/v1/baskets/generate
POST   /api/v1/vendors/optimize
POST   /api/v1/quotes/request
POST   /api/v1/purchase-orders/create
GET    /api/v1/purchase-orders/:id
GET    /api/v1/deliveries/:id
POST   /api/v1/integration/callbacks/procurement-status
```

## Recommended UnitFlip outbound payload types

```text
inspection summary
repair task package
material requirements package
organization and project reference metadata
```

## Recommended SiteEnhancer response payload types

```text
resolved products
vendor matches
basket summary
procurement recommendation
purchase order reference
delivery updates
cost summary
```

---

# 9. Identity and Access Map

Both systems should align around shared identity concepts.

## Core shared auth model

```text
organization
user
membership
role
permissions
identity provider
audit trail
```

## Suggested cross-platform roles

```text
owner
admin
manager
field_user
contractor
procurement_user
viewer
```

UnitFlip may use a subset.
SiteEnhancer may use more granular procurement permissions.

That is fine as long as the top-level roles still map cleanly.

---

# 10. Offline and Sync Architecture

## UnitFlip
Must remain offline-capable.

```text
local-first capture
queued writes
temporary local IDs
attachment persistence
conflict resolution on sync
```

## SiteEnhancer
Should assume imported data may arrive later, in batches, or in revised form.

```text
idempotent imports
status reconciliation
immutable event logs where possible
version tracking
```

Integration should tolerate delayed synchronization.

---

# 11. Data Ownership Rules

To prevent chaos, define who owns what.

## UnitFlip owns source-of-truth for

```text
property
unit
inspection
photo
finding
repair task
task completion state
```

## SiteEnhancer owns source-of-truth for

```text
catalog item
vendor offer
quote
purchase order
delivery status
procurement optimization result
```

## Shared references only

```text
organization
user reference
vendor reference
product reference
requirement reference
external integration ids
```

---

# 12. Event Map

Both apps should emit consistent events even before full event streaming exists.

## UnitFlip events

```text
inspection.created
inspection.completed
finding.created
repair_task.created
repair_task.updated
requirements.generated
report.published
```

## SiteEnhancer events

```text
requirements.imported
product.resolved
basket.generated
vendor.optimized
quote.created
quote.accepted
purchase_order.created
delivery.updated
delivery.received
```

## Cross-platform integration events

```text
integration.requirements.sent
integration.requirements.accepted
integration.procurement.ready
integration.po.linked
integration.delivery.synced
```

---

# 13. Reporting View of the Future

Eventually the user should experience this as a single flow:

```text
Inspect unit
→ Confirm scope
→ Review material plan
→ Choose vendor strategy
→ Order materials
→ Track deliveries
→ Close out work
→ Export final report
```

But under the hood:

- UnitFlip runs the field workflow
- SiteEnhancer runs the procurement workflow
- Shared APIs glue them together

Clean. Practical. No Frankenstein monster required.

---

# 14. Migration Path

## Phase 1
Keep both apps separate.

## Phase 2
Align domain terms and IDs.

## Phase 3
Define shared API contracts.

## Phase 4
Allow UnitFlip to export requirements into SiteEnhancer.

## Phase 5
Return vendor and procurement results back into UnitFlip.

## Phase 6
Add cross-platform analytics and reporting.

---

# 15. Final Design Rule

Do not merge because two systems *can* be merged.

Only share:

- what is stable
- what is expensive to duplicate
- what clearly belongs at platform level

Everything else stays app-specific.

That keeps both products fast, understandable, and far less likely to become a cursed spaghetti palace.
