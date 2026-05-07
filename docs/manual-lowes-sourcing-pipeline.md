# Manual Lowe's Sourcing Pipeline

This workflow feeds the existing UnitFlip catalog import pipeline:

`CatalogImportService -> CatalogCategoryAssignmentService -> ProductManager review -> org correction memory`

It does not use scraping, APIs, or runtime classification.

## Archetype workflow

Use the seeded archetype list in `src/core/data/manualLowesArchetypes.ts`.

Each archetype represents a normalized inspection/material need:

- stable `id`
- readable `displayName`
- `categoryHint`
- reusable `keywords`
- `unitType`
- `lowesCategoryHint`

The archetype id maps directly to the catalog `equivalentGroup` bridge used by product recommendation.

## Human workflow

1. Pick an archetype.
2. Search Lowe's with three queries:
   - budget: `cheap <displayName>`
   - standard: `<displayName>`
   - premium: `best <displayName>`
3. Select one viable product for each tier.
4. Copy the product data into the CSV.
5. Import with Product Manager.
6. Review any low-confidence category assignments.
7. Save org-specific category corrections when needed.

## CSV columns

Required by the import-ready template:

- `title`
- `category`
- `tags`
- `notes`
- `archetype_id`
- `tier`
- `lowes_url`
- `image_url`
- `unit_type`
- `pack_size`
- `coverage`
- `estimated_unit_cost`
- `category_hint`
- `keyword_hints`
- `lowes_category_hint`
- `confidence`
- `source`
- `last_reviewed_at`

## Assignment guidance

Use these fields to improve deterministic category assignment:

- `category`
  - preferred when you already know the correct UnitFlip category path
- `category_hint`
  - canonical UnitFlip-style path when `category` is blank
- `keyword_hints`
  - normalized words and phrases from the product and archetype
- `lowes_category_hint`
  - Lowe's-style category label that can still help the existing alias/keyword resolver
- `tags`
  - broader search terms and brand clues

If confidence is weak, leave `category` blank and let review catch it.

## Tier validation rules

For each archetype:

- exactly one `budget`, one `standard`, and one `premium`
- price should rise across tiers
- no duplicate product title/URL across tiers
- avoid junk-tier budget products

## Output notes

- `archetype_id` is imported as the catalog archetype/equivalent-group bridge
- `tier` is imported as the catalog default tier
- `estimated_unit_cost` becomes the default option price
- `pack_size` and `coverage` are preserved for downstream estimation
- low-confidence rows remain reviewable instead of being silently forced into the wrong category
