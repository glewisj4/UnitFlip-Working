# UnitFlip AI Project Brain

## Persistent Context File for AI Development Agents

This document provides **complete architectural context** for AI agents
working on the **UnitFlip platform**. It should be supplied alongside
the **UnitFlip Master Development Prompt** when performing development.

Purpose: - Prevent architectural drift - Provide system-wide context -
Guide AI coding agents toward correct design decisions - Preserve
compatibility with the future SiteEnhancer integration

------------------------------------------------------------------------

# 1. Product Vision

UnitFlip is a **property‑turn intelligence platform** designed for
property managers that need to inspect, repair, and prepare rental units
quickly between tenants.

The platform transforms the traditional manual process into a structured
workflow:

Inspection\
→ Issue Detection\
→ Repair Task Generation\
→ Material Requirement Generation\
→ Cost Estimation\
→ Report Generation\
→ Procurement Preparation

The system prioritizes:

• speed\
• clarity\
• mobile usability\
• offline capability

------------------------------------------------------------------------

# 2. Core Users

Primary user roles:

**Property Manager** - oversees unit turnover - reviews reports -
approves scope

**Maintenance Supervisor** - validates inspection findings - manages
repair tasks

**Inspector** - performs inspections - records issues and photos

**Contractor** - completes assigned repair tasks

------------------------------------------------------------------------

# 3. Core Workflow

Typical lifecycle of a unit turn:

1.  Unit becomes vacant
2.  Inspector performs inspection
3.  Findings are recorded
4.  Repair tasks are generated
5.  Material requirements are inferred
6.  Cost estimate is generated
7.  Report is produced
8.  Procurement requirements are exported

Future extension:

9.  Requirements sent to SiteEnhancer
10. Vendor optimization performed
11. Purchase orders generated
12. Delivery tracked

------------------------------------------------------------------------

# 4. System Architecture Overview

UnitFlip is designed with **three conceptual layers**.

### Presentation Layer

React UI application.

Responsibilities: - dashboards - inspection interface - photo capture -
task management - reporting

### Application Services Layer

Handles business logic.

Examples: - inspection services - task generation engine - material
estimation engine - reporting services

### Data Layer

Offline‑first local storage.

Technologies:

-   IndexedDB
-   local state persistence
-   sync queue

------------------------------------------------------------------------

# 5. Domain Model Overview

Primary entities:

Organization\
Property\
Unit\
Inspection\
Finding\
RepairTask\
MaterialRequirement\
MediaAsset\
Report

Each entity must include:

id\
organization_id\
created_at\
updated_at\
metadata

------------------------------------------------------------------------

# 6. Entity Relationships

Organization\
└── Properties\
  └── Units\
    └── Inspections\
      ├── Findings\
      └── Repair Tasks

Repair Tasks\
→ generate → Material Requirements

Material Requirements\
→ exported → Procurement system

------------------------------------------------------------------------

# 7. Subsystems

### Inspection System

Captures unit condition.

Features:

-   inspection sessions
-   room classification
-   issue tagging
-   photo capture
-   AI analysis (future)

------------------------------------------------------------------------

### Repair Task Engine

Transforms findings into work items.

Responsibilities:

-   task creation
-   trade classification
-   priority scoring
-   completion tracking

------------------------------------------------------------------------

### Material Estimation Engine

Maps tasks to materials.

Example:

Replace vinyl plank flooring\
→ flooring material\
→ adhesive\
→ trim pieces

------------------------------------------------------------------------

### Reporting Engine

Produces deliverables.

Includes:

-   inspection reports
-   repair summaries
-   cost estimates
-   shareable reports

------------------------------------------------------------------------

# 8. Offline Architecture

UnitFlip must function **fully offline**.

Required behaviors:

• local storage persistence\
• queued sync operations\
• provisional UUID generation\
• conflict resolution

Connectivity should **enhance** the app, not enable it.

------------------------------------------------------------------------

# 9. Integration Future: SiteEnhancer

UnitFlip will eventually connect to the **SiteEnhancer procurement
engine**.

UnitFlip will export:

Material Requirements

SiteEnhancer will handle:

-   product resolution
-   vendor comparison
-   purchase orders
-   delivery tracking

Integration flow:

Inspection\
→ Repair Tasks\
→ Requirements\
→ Send to SiteEnhancer\
→ Receive vendor recommendations\
→ Display procurement status

------------------------------------------------------------------------

# 10. Technology Stack

Frontend

React\
TypeScript\
Vite\
Tailwind\
Lucide Icons

Local Storage

IndexedDB

Future Backend

Node.js\
PostgreSQL\
Supabase

------------------------------------------------------------------------

# 11. AI Development Rules

AI agents must:

• analyze before coding\
• preserve offline capability\
• respect domain model\
• avoid unnecessary rewrites\
• document architectural decisions

If uncertain, ask for clarification.

------------------------------------------------------------------------

# 12. Long Term Goals

UnitFlip should eventually provide:

• automated repair scope generation\
• AI image analysis for inspections\
• automated material estimation\
• procurement optimization via SiteEnhancer\
• performance analytics for property portfolios

------------------------------------------------------------------------

# 13. Design Philosophy

Prefer:

clarity\
simplicity\
modularity\
maintainability

Avoid:

over‑engineering\
premature abstraction\
tight coupling between systems

------------------------------------------------------------------------

# Final Principle

UnitFlip must remain a **fast operational tool for property managers**,
not an overly complex enterprise system.

Keep the platform focused, understandable, and extensible.
