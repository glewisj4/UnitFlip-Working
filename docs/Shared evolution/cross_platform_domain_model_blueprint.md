# Cross-Platform Domain Model Blueprint
## Canonical Model for UnitFlip and SiteEnhancer Alignment

This document defines the shared domain blueprint that should guide **both UnitFlip and SiteEnhancer**.

The point is not to make both apps identical.

The point is to make the parts that *need* to connect later speak the same language, use compatible identifiers, and avoid ugly migration pain.

---

# 1. Blueprint Goals

This blueprint exists to ensure:

- both apps use compatible core entities
- integration can happen through APIs without major refactors
- shared concepts have stable names and meanings
- ownership boundaries stay clear
- data translation stays minimal

---

# 2. Modeling Principles

## Rule 1 — Favor canonical names
Use one preferred name for each shared concept.

## Rule 2 — Preserve app-specific models
Not every UnitFlip object must exist in SiteEnhancer, and vice versa.

## Rule 3 — Use references, not deep coupling
Shared workflows should pass IDs and summarized payloads, not rely on cross-app direct table joins.

## Rule 4 — All shared entities must support org scoping
Everything important should be traceable to an organization.

## Rule 5 — Design for imports, updates, and sync retries
Cross-app data exchange must be idempotent.

---

# 3. Core Canonical Entities

## Organization

Purpose:
Represents the top-level tenant or business account.

Canonical fields:

```json
{
  "id": "org_...",
  "name": "string",
  "external_ref": "string|null",
  "status": "active|inactive",
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp"
}
```

Used in:
- UnitFlip
- SiteEnhancer

---

## User

Purpose:
Represents an authenticated person associated with an organization.

Canonical fields:

```json
{
  "id": "usr_...",
  "organization_id": "org_...",
  "email": "string",
  "display_name": "string",
  "role": "owner|admin|manager|field_user|contractor|procurement_user|viewer",
  "permissions": ["string"],
  "identity_provider": "local|clerk|sso|other",
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp"
}
```

Used in:
- UnitFlip
- SiteEnhancer

---

## Property

Purpose:
Represents a building or property under management.

Canonical fields:

```json
{
  "id": "prp_...",
  "organization_id": "org_...",
  "name": "string",
  "address": {
    "line1": "string",
    "line2": "string|null",
    "city": "string",
    "state": "string",
    "postal_code": "string"
  },
  "status": "active|inactive",
  "metadata": {},
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp"
}
```

Primary owner:
- UnitFlip

Referenced by:
- SiteEnhancer when procurement work is tied to a location

---

## Unit

Purpose:
Represents an individual unit, suite, or sub-location within a property.

Canonical fields:

```json
{
  "id": "unt_...",
  "organization_id": "org_...",
  "property_id": "prp_...",
  "name": "string",
  "unit_number": "string",
  "floor_plan": "string|null",
  "status": "occupied|vacant|turn|ready",
  "metadata": {},
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp"
}
```

Primary owner:
- UnitFlip

---

## Inspection

Purpose:
Represents an inspection session for a unit.

Canonical fields:

```json
{
  "id": "ins_...",
  "organization_id": "org_...",
  "property_id": "prp_...",
  "unit_id": "unt_...",
  "status": "draft|in_progress|completed|archived",
  "performed_by_user_id": "usr_...",
  "performed_at": "ISO timestamp|null",
  "notes": "string|null",
  "version": 1,
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp"
}
```

Primary owner:
- UnitFlip

---

## Finding

Purpose:
Represents an observed issue, condition, or room-level problem identified during an inspection.

Canonical fields:

```json
{
  "id": "fnd_...",
  "organization_id": "org_...",
  "inspection_id": "ins_...",
  "room_type": "kitchen|bathroom|bedroom|living_room|hallway|exterior|other",
  "issue_type": "string",
  "severity": "low|medium|high|critical",
  "source": "manual|ai|imported",
  "description": "string",
  "photo_refs": ["med_..."],
  "metadata": {},
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp"
}
```

Primary owner:
- UnitFlip

---

## Repair Task

Purpose:
Represents a concrete action that must be completed.

Canonical fields:

```json
{
  "id": "tsk_...",
  "organization_id": "org_...",
  "inspection_id": "ins_...",
  "unit_id": "unt_...",
  "finding_ids": ["fnd_..."],
  "title": "string",
  "description": "string|null",
  "trade": "paint|flooring|electrical|plumbing|cleaning|general|other",
  "status": "draft|open|in_progress|blocked|completed|canceled",
  "priority": "low|medium|high|urgent",
  "estimated_labor_minutes": 0,
  "metadata": {},
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp"
}
```

Primary owner:
- UnitFlip

---

## Requirement

Purpose:
Represents a procurement-relevant need derived from one or more repair tasks.

Canonical fields:

```json
{
  "id": "req_...",
  "organization_id": "org_...",
  "source_system": "unitflip|siteenhancer",
  "source_ref_id": "tsk_...|project_...|other",
  "property_id": "prp_...|null",
  "unit_id": "unt_...|null",
  "title": "string",
  "description": "string|null",
  "category": "paint|flooring|hardware|appliance|fixture|other",
  "quantity": 1,
  "unit_of_measure": "ea|box|roll|gal|sqft|case|other",
  "status": "draft|submitted|resolved|purchased|closed",
  "metadata": {},
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp"
}
```

Primary owner:
- shared concept
- created in UnitFlip or SiteEnhancer
- procurement lifecycle usually handled in SiteEnhancer

---

## Product

Purpose:
Represents a normalized product concept independent of specific vendor offers.

Canonical fields:

```json
{
  "id": "prd_...",
  "organization_id": "org_...|null",
  "title": "string",
  "normalized_title": "string",
  "category": "string",
  "brand": "string|null",
  "description": "string|null",
  "image_url": "string|null",
  "metadata": {},
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp"
}
```

Primary owner:
- SiteEnhancer

Referenced by:
- UnitFlip for suggested materials

---

## SKU

Purpose:
Represents a specific purchasable item.

Canonical fields:

```json
{
  "id": "sku_...",
  "product_id": "prd_...",
  "vendor_id": "ven_...",
  "sku_code": "string",
  "title": "string",
  "uom": "ea|box|roll|gal|sqft|case|other",
  "price": 0,
  "currency": "USD",
  "availability_status": "unknown|available|limited|unavailable",
  "external_ref": "string|null",
  "metadata": {},
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp"
}
```

Primary owner:
- SiteEnhancer

---

## Vendor

Purpose:
Represents a supplier, retailer, distributor, or contractor source.

Canonical fields:

```json
{
  "id": "ven_...",
  "organization_id": "org_...|null",
  "name": "string",
  "type": "retailer|distributor|contractor|local_supplier|other",
  "contact_info": {
    "email": "string|null",
    "phone": "string|null",
    "website": "string|null"
  },
  "service_regions": ["string"],
  "categories": ["string"],
  "integration_connector": "string|null",
  "status": "active|inactive",
  "metadata": {},
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp"
}
```

Primary owner:
- SiteEnhancer

Referenced by:
- UnitFlip when showing procurement options

---

## Basket

Purpose:
Represents a grouped procurement package for review or purchase.

Canonical fields:

```json
{
  "id": "bsk_...",
  "organization_id": "org_...",
  "source_system": "unitflip|siteenhancer",
  "source_ref_id": "string|null",
  "status": "draft|optimized|approved|ordered|canceled",
  "currency": "USD",
  "subtotal": 0,
  "estimated_tax": 0,
  "estimated_total": 0,
  "metadata": {},
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp"
}
```

Primary owner:
- SiteEnhancer

---

## Basket Item

Purpose:
Represents an individual line item in a basket.

Canonical fields:

```json
{
  "id": "bki_...",
  "basket_id": "bsk_...",
  "requirement_id": "req_...|null",
  "product_id": "prd_...|null",
  "sku_id": "sku_...|null",
  "vendor_id": "ven_...|null",
  "quantity": 1,
  "unit_of_measure": "ea|box|roll|gal|sqft|case|other",
  "estimated_unit_price": 0,
  "estimated_total_price": 0,
  "status": "suggested|selected|ordered|received|canceled",
  "metadata": {},
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp"
}
```

Primary owner:
- SiteEnhancer

---

## Quote

Purpose:
Represents a vendor pricing response or quote package.

Canonical fields:

```json
{
  "id": "qte_...",
  "organization_id": "org_...",
  "vendor_id": "ven_...",
  "basket_id": "bsk_...",
  "status": "draft|submitted|accepted|rejected|superseded",
  "quote_number": "string|null",
  "valid_until": "ISO timestamp|null",
  "total_amount": 0,
  "currency": "USD",
  "metadata": {},
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp"
}
```

Primary owner:
- SiteEnhancer

---

## Purchase Order

Purpose:
Represents an approved procurement transaction.

Canonical fields:

```json
{
  "id": "po_...",
  "organization_id": "org_...",
  "vendor_id": "ven_...",
  "basket_id": "bsk_...|null",
  "quote_id": "qte_...|null",
  "source_system": "unitflip|siteenhancer",
  "source_ref_id": "string|null",
  "status": "draft|submitted|acknowledged|partially_received|received|closed|canceled",
  "po_number": "string|null",
  "currency": "USD",
  "total_amount": 0,
  "ordered_at": "ISO timestamp|null",
  "metadata": {},
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp"
}
```

Primary owner:
- SiteEnhancer

Referenced by:
- UnitFlip for project completion tracking

---

## Delivery Event

Purpose:
Represents shipment or receiving activity tied to procurement.

Canonical fields:

```json
{
  "id": "dlv_...",
  "organization_id": "org_...",
  "purchase_order_id": "po_...",
  "status": "pending|shipped|in_transit|delivered|received|exception",
  "carrier": "string|null",
  "tracking_number": "string|null",
  "estimated_arrival": "ISO timestamp|null",
  "actual_arrival": "ISO timestamp|null",
  "location_ref": "prp_...|unt_...|other|null",
  "metadata": {},
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp"
}
```

Primary owner:
- SiteEnhancer

---

# 4. Media and Attachments

## Media Asset

Purpose:
Represents photos or other file references used in inspections and reports.

Canonical fields:

```json
{
  "id": "med_...",
  "organization_id": "org_...",
  "owner_type": "inspection|finding|task|report|other",
  "owner_id": "string",
  "media_type": "image|pdf|video|other",
  "storage_ref": "string",
  "mime_type": "string",
  "filename": "string",
  "metadata": {},
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp"
}
```

Primary owner:
- UnitFlip

---

# 5. Audit and Metadata Fields

Every important entity should support a minimal audit surface.

Recommended shared metadata fields:

```json
{
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp",
  "created_by_user_id": "usr_...|null",
  "updated_by_user_id": "usr_...|null",
  "version": 1,
  "external_ref": "string|null",
  "metadata": {}
}
```

---

# 6. Status Design Rules

## Rule A
Statuses should be finite enums, not free text.

## Rule B
Status meaning should stay stable across both systems.

## Rule C
Do not overload one status field to mean five different things.
That road leads directly to debugging regret.

---

# 7. Identifier Strategy

Use globally unique string IDs with prefixes.

Recommended prefixes:

```text
org_  organization
usr_  user
prp_  property
unt_  unit
ins_  inspection
fnd_  finding
tsk_  repair task
req_  requirement
prd_  product
sku_  sku
ven_  vendor
bsk_  basket
bki_  basket item
qte_  quote
po_   purchase order
dlv_  delivery event
med_  media asset
```

Rules:

- IDs must be unique across environments whenever practical
- IDs must be safe to reference in external systems
- imported references should preserve source metadata

---

# 8. Cross-App Translation Rules

## UnitFlip to SiteEnhancer

Typical translation:

```text
Repair Task(s)
→ Requirement(s)
→ Suggested Product Context
→ Location Context
→ Priority / urgency context
```

## SiteEnhancer back to UnitFlip

Typical translation:

```text
Requirement
→ Resolved Product / SKU
→ Vendor Recommendation
→ Basket / PO status
→ Delivery status
→ Cost summary
```

Only send fields needed for the next step.
Do not shovel the whole database across the fence like a raccoon with no supervision.

---

# 9. Ownership Matrix

| Entity | Primary Owner | Secondary Consumer |
|---|---|---|
| Organization | Shared | Shared |
| User | Shared | Shared |
| Property | UnitFlip | SiteEnhancer |
| Unit | UnitFlip | SiteEnhancer |
| Inspection | UnitFlip | Rarely referenced |
| Finding | UnitFlip | Not usually needed |
| Repair Task | UnitFlip | Input source |
| Requirement | Shared concept | Shared concept |
| Product | SiteEnhancer | UnitFlip |
| SKU | SiteEnhancer | UnitFlip |
| Vendor | SiteEnhancer | UnitFlip |
| Basket | SiteEnhancer | UnitFlip |
| Basket Item | SiteEnhancer | UnitFlip |
| Quote | SiteEnhancer | UnitFlip summary only |
| Purchase Order | SiteEnhancer | UnitFlip |
| Delivery Event | SiteEnhancer | UnitFlip |
| Media Asset | UnitFlip | Report/export consumers |

---

# 10. Recommended Validation Rules

Shared entity validation should include:

- required `organization_id` where applicable
- required timestamps
- stable enum validation
- non-negative quantities and prices
- valid references when foreign IDs are present
- import idempotency keys for sync operations

---

# 11. API Payload Shapes

## Requirement Import Payload

```json
{
  "organization_id": "org_123",
  "source_system": "unitflip",
  "source_ref_id": "ins_456",
  "property_id": "prp_111",
  "unit_id": "unt_222",
  "requirements": [
    {
      "id": "req_001",
      "title": "Replace damaged vinyl flooring",
      "category": "flooring",
      "quantity": 120,
      "unit_of_measure": "sqft",
      "status": "submitted",
      "metadata": {
        "task_ids": ["tsk_9", "tsk_10"],
        "priority": "high"
      }
    }
  ]
}
```

## Procurement Response Payload

```json
{
  "organization_id": "org_123",
  "source_system": "siteenhancer",
  "source_ref_id": "req_import_batch_789",
  "basket_id": "bsk_456",
  "status": "optimized",
  "items": [
    {
      "requirement_id": "req_001",
      "product_id": "prd_777",
      "sku_id": "sku_999",
      "vendor_id": "ven_333",
      "quantity": 120,
      "estimated_total_price": 428.40
    }
  ],
  "summary": {
    "subtotal": 428.40,
    "estimated_tax": 25.70,
    "estimated_total": 454.10
  }
}
```

---

# 12. Versioning Rule

Shared payloads and shared canonical entities should support versioning.

Recommended approach:

- `/api/v1/...`
- payload field like `"schema_version": 1` when needed
- additive changes preferred over breaking changes

---

# 13. Final Blueprint Rule

When in doubt, ask:

1. Does this entity belong operationally to UnitFlip?
2. Does this entity belong procurement-wise to SiteEnhancer?
3. Is this a shared reference or a true shared object?
4. Can this be exchanged by API without database coupling?

If the answer to #4 is no, the design probably needs work.

That is your warning light before the future starts throwing chairs.
