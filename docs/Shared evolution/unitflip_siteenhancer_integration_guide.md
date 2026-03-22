# Unified Evolution Guide

## Preparing UnitFlip and SiteEnhancer for Future Integration

This document defines architectural rules and development practices that
allow **UnitFlip** and **SiteEnhancer** to evolve independently while
remaining compatible for future integration.

The goal is **loose coupling with strong conceptual alignment**.

------------------------------------------------------------------------

# 1. Strategic Philosophy

Both applications serve different operational roles but share
overlapping procurement and workflow concepts.

**UnitFlip** Operational property inspection and unit renovation
workflow.

**SiteEnhancer** Procurement intelligence and vendor optimization
platform.

Future integration goal:

Inspection → Repair Tasks → Procurement Requirements → Vendor
Optimization → Purchase Orders → Delivery Tracking

Both systems should therefore evolve around **shared domain language**
and **compatible data structures**.

------------------------------------------------------------------------

# 2. Domain Language Alignment

Both apps should standardize the following conceptual vocabulary.

  Concept         UnitFlip Meaning              SiteEnhancer Equivalent
  --------------- ----------------------------- -------------------------
  Organization    Property management company   Tenant organization
  Property        Physical building             Customer asset
  Unit            Individual apartment/home     Project location
  Inspection      Room condition analysis       Requirement discovery
  Repair Task     Needed maintenance action     Requirement
  Product         Suggested repair material     Catalog item
  SKU             Specific purchasable item     SKU
  Vendor          Supplier of materials         Vendor
  Shopping List   Materials required            Basket
  Purchase        Material acquisition          Purchase Order
  Delivery        Material arrival              Delivery tracking

Developers should always use **consistent naming conventions** across
both apps.

------------------------------------------------------------------------

# 3. Data Model Compatibility Rules

When defining schemas, ensure that core objects share similar
structures.

Recommended shared base objects:

    Organization
    User
    Vendor
    Product
    SKU
    Requirement
    BasketItem
    PurchaseOrder
    DeliveryEvent

Key rules:

1.  Use **UUIDs for all primary keys**
2.  Include `created_at` and `updated_at` timestamps
3.  Include `organization_id` for multi-tenant separation
4.  Avoid tightly coupled foreign keys between apps
5.  Prefer **API communication instead of shared databases**

------------------------------------------------------------------------

# 4. API Contract Preparation

Both apps should design APIs assuming future communication.

Recommended resource endpoints:

    /organizations
    /vendors
    /products
    /requirements
    /baskets
    /quotes
    /purchase-orders
    /deliveries

Example future integration flow:

    UnitFlip

    POST /requirements
    {
      property_id,
      unit_id,
      issue_type,
      suggested_products
    }

    ↓

    SiteEnhancer

    resolve → vendor optimize → procurement plan

All APIs should use:

-   JSON
-   versioned endpoints `/api/v1`
-   consistent error structures

------------------------------------------------------------------------

# 5. Shared Identifier Strategy

Use globally unique IDs so objects can move between systems safely.

Example:

    req_01H8AZM9F1J5
    sku_01H8AZM9F1J6
    ven_01H8AZM9F1J7

Prefix IDs by resource type.

This avoids collisions during cross-system synchronization.

------------------------------------------------------------------------

# 6. Event Architecture (Future)

Both systems should log important events.

Example events:

    inspection.completed
    task.created
    requirements.generated
    basket.created
    vendor.optimized
    purchase_order.created
    delivery.received

Even if event streaming is not yet implemented, logging these
consistently will make later integration easier.

------------------------------------------------------------------------

# 7. Catalog Alignment

Both apps should maintain compatible catalog fields.

Recommended product schema:

    product_id
    title
    normalized_title
    category
    brand
    sku
    vendor_id
    price
    image_url
    metadata

UnitFlip may use simplified catalog data, but should retain these fields
where possible.

------------------------------------------------------------------------

# 8. Vendor Model Alignment

Vendor records should include:

    vendor_id
    name
    contact_info
    service_regions
    categories
    rating
    integration_connector

This ensures SiteEnhancer vendor intelligence can later power UnitFlip
procurement.

------------------------------------------------------------------------

# 9. Authentication Compatibility

Both apps should use compatible identity models.

Recommended fields:

    user_id
    organization_id
    role
    permissions
    identity_provider

Suggested roles:

    owner
    admin
    manager
    contractor
    viewer

Future SSO integration becomes easier if roles match across systems.

------------------------------------------------------------------------

# 10. Offline Compatibility (UnitFlip)

UnitFlip should remain offline-first.

Guidelines:

-   Store local data in IndexedDB
-   Maintain sync queue
-   Assign provisional UUIDs offline
-   Sync via API when connection restored

SiteEnhancer should assume **eventual consistency** with incoming data.

------------------------------------------------------------------------

# 11. Procurement Boundary

Define a clear boundary:

UnitFlip responsibilities:

    inspection
    issue detection
    repair tasks
    material suggestions

SiteEnhancer responsibilities:

    catalog resolution
    vendor comparison
    quote management
    purchase orders
    delivery tracking

UnitFlip should never directly implement procurement complexity.

------------------------------------------------------------------------

# 12. Shared Documentation

Maintain a shared folder:

    /docs/platform

Documents to maintain:

    system-map.md
    domain-model.md
    api-contracts.md
    integration-roadmap.md

Both projects should reference these files.

------------------------------------------------------------------------

# 13. Repository Structure Recommendation

Long-term structure:

    platform/

      siteenhancer/
        backend
        frontend

      unitflip/
        backend
        frontend

      shared/
        domain-models
        api-contracts
        documentation

This allows shared logic without forcing full coupling.

------------------------------------------------------------------------

# 14. Integration Milestones

Suggested future phases:

Phase 1 --- Independent development\
Phase 2 --- Shared domain model alignment\
Phase 3 --- API contract compatibility\
Phase 4 --- Vendor procurement integration\
Phase 5 --- Unified analytics and reporting

------------------------------------------------------------------------

# 15. Success Criteria

Integration is successful when:

-   UnitFlip can generate requirements
-   SiteEnhancer can resolve procurement automatically
-   Materials can be purchased through vendor optimization
-   Delivery can be tracked back to the originating inspection

At that point the combined system becomes a **full
inspection-to-procurement automation platform**.

------------------------------------------------------------------------

# End of Document
