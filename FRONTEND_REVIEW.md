# MTGEV Frontend Review Map

This document describes the React application structure, data ownership, runtime boundaries, known fallback paths, and the recommended frontend cleanup order.

The frontend should primarily load and display immutable JSON snapshots produced by the backend pipeline. It may calculate presentation-only values, but it must not invent card prices, sealed-product EV, vendor prices, or probability distributions when authoritative backend data is unavailable.

## 1. Runtime Architecture

The browser path is:

```text
App.tsx
  -> dataService.ts
  -> public/data/*.json
  -> catalogProductLoader.ts + ecommerceBoosterData.ts
  -> view components
  -> backend-generated EV, provenance, and chase-card snapshots
```

The frontend does not connect directly to MySQL. Its runtime inputs are generated JSON files under `public/data/`, static catalog metadata, Scryfall hierarchy metadata, and image assets under `public/products/`.

## 2. Application Shell

### `src/App.tsx`

Purpose:

- Owns the top-level tabs and global selected set/product state.
- Owns the selected vendor, price mode, and EV basis.
- Loads sets, arbitrage records, booster EV, and pricing reliability through `dataService`.
- Routes data into Products Overview, Booster Explorer, Special Chases, and Admin Portal.

Review status:

- Active and central.
- Initial arrays from `src/data.ts` are empty startup scaffolding, not a production data source.
- The app should expose an explicit empty/error state when pipeline data cannot be loaded rather than silently treating empty data as a live dataset.

### `src/types.ts`

Purpose:

- Shared interfaces and unions for vendors, price modes, products, boosters, decks, chase cards, and provenance.

Review status:

- Active and must remain.
- Treat changes here as cross-layer contract changes requiring backend JSON and frontend build validation.

## 3. Data Loading and Caching

### `src/services/dataService.ts`

Purpose:

- Loads generated JSON snapshots from `/data/`.
- Caches asynchronous and synchronous access to sets, products, booster EV, pricing reliability, deck data, single-card prices, booster slots, and product chase cards.
- Converts database booster slot records into display models.

Review status:

- Active and the main frontend data boundary.
- Keep network loading and caching here rather than in individual view components.
- `getProductChaseCards()` correctly prefers backend-generated product chase data.
- All fetches should distinguish unavailable data from valid empty data and expose source/status metadata where practical.

Authoritative frontend data files:

- `sets.json`: set and hierarchy inputs.
- `sealed_products.json`: sealed product records, EV summaries, quantiles, and provenance.
- `booster_ev.json`: booster distributions by vendor and price mode.
- `arbitrage_leaderboard.json`: product market/EV overview.
- `single_card_prices.json`: indexed card prices.
- `precon_decks.json`: deck contents and pricing provenance.
- `product_chase_cards.json`: backend-generated product TOP 5 cards.
- `pricing_reliability.json`: vendor reliability telemetry.
- `latest_pipeline_run.json`: latest pipeline status for operations views.

## 4. Catalog and Metadata Layers

### `src/ecommerceBoosterData.ts`

Purpose:

- Defines catalog product and booster variation interfaces.
- Provides curated catalog products and packaging metadata used by catalog merging, asset matching, booster slots, product hierarchy, Admin Portal, and product matching.

Review status:

- Active runtime dependency; do not delete.
- Separate static catalog metadata from backend valuation fields.
- Curated market prices or EV values in this file must not override generated pipeline values for products with matching backend IDs.

### `src/utils/catalogProductLoader.ts`

Purpose:

- Merges curated catalog products with generated sealed products.
- Deduplicates by IDs and UUIDs.
- Normalizes packaging type and maps generated product fields into the frontend catalog model.

Review risks:

- Title-based packaging inference remains a metadata fallback and is marked with `metadataSource: 'inferred'`.
- Missing release date and block metadata now remain empty instead of being replaced with invented defaults.
- `metadataSource: 'pipeline'` identifies generated records whose source fields were present; curated static records remain distinct from pipeline records.

### `src/utils/setHierarchyUtils.ts`

Purpose:

- Loads and resolves generated Scryfall set hierarchy data.
- Maps child and parent set codes for navigation and product grouping.

Review status:

- Active.
- Generated hierarchy data should be authoritative; fallback mappings should be limited to offline/startup recovery and visibly distinguishable from generated hierarchy data.

### `src/utils/productAssetMatcher.ts`

Purpose:

- Matches product records to WPN packaging assets.
- Uses set folders, WPN tokens, product categories, and product indices.

Review status:

- Active metadata/asset layer, not an EV layer.
- Guessed asset matches must never affect product identity, market price, or EV.
- Keep manual overrides distinct from guessed matches.

## 5. View Ownership

### Products Overview

`src/components/ArbitrageLeaderboard.tsx`

- Displays backend leaderboard records and pricing reliability.
- May calculate display-only sorting and labels.
- Must not recompute product EV when the selected vendor/mode record exists in generated data.

### Booster Explorer

`src/components/BoosterDetailExplorer.tsx`

- Displays booster records, product details, curves, slots, and chase cards.
- Backend `booster_ev.json` is authoritative for booster statistics and quantiles.
- Any missing vendor/mode record should render an unavailable state, not borrow an unrelated mode or synthetic multiplier.

`src/components/PackDistributionCurve.tsx`

- Renders empirical 100-bucket curves.
- Backend-generated composite quantiles or single-booster quantiles are authoritative.
- Browser-side composite simulation has been removed.
- Continue removing callers that expect client-generated quantiles.

`src/components/BoosterSlotViewer.tsx`

- Displays database-derived booster collation and sheet structure.
- It may convert database records into UI models, but should not fabricate card odds or pricing.

### Product Breakdown and Hierarchy

`src/components/ProductBreakdownTable.tsx`

`src/components/ProductHierarchyInspector.tsx`

`src/components/RelatedProductsHierarchy.tsx`

- Display recursive contents, fixed cards, decks, nested products, market prices, and EV.
- Currently depend on `productUtils.ts` for recursive structural calculations.
- Local synthetic reprint multipliers, vendor percentage estimates, foil inflation, market-price-as-EV fallbacks, and dummy deck prices have been removed.
- `ProductHierarchyInspector` now uses `getCanonicalProductMetrics` for product EV instead of maintaining a second recursive EV fallback resolver.
- Migration target: use backend product/composite outputs for valuation and retain frontend recursion only for structural display where backend detail is unavailable.

### Chase Cards

`src/components/ProductChaseCardsViewer.tsx`

- Loads `product_chase_cards.json` for the selected product, vendor, and price mode.
- Product-level deck reconstruction, curated-card fallback, Scryfall discovery, and all-product preloading have been removed.
- Missing backend output renders an explicit empty state.

`src/services/chaseCardsService.ts`

- Provides card image URL helpers, metadata enrichment, curated Special Chases, Scryfall discovery, and legacy product candidate functions.
- The legacy product candidate functions currently have no active callers and are cleanup candidates. The product-wide preload function has been removed.

Ownership policy:

- Product TOP 5 cards must come from `product_chase_cards.json`.
- Scryfall may provide artwork and metadata only.
- Curated Special Chases are a separate editorial/showcase feature and must not be presented as backend-calculated product TOP 5 data.
- Remove product candidate discovery after backend coverage is verified.

### Special Chases

`src/components/SpecialChaseShowcase.tsx`

- Separate curated/editorial page.
- It is not equivalent to backend-generated product chase cards.
- Keep only if the UI labels it clearly as a curated showcase and does not use its prices for EV calculations.

### Admin and Operations

`src/components/AdminPortal.tsx`

- Displays pipeline logs, data health, and administrative controls.
- It should eventually load and display `latest_pipeline_run.json` directly.
- Operational diagnostics should distinguish pipeline failure, stale data, missing files, and deployment failure.

## 6. Valuation Boundary

### `src/utils/productUtils.ts`

Purpose today:

- Recursive product contents breakdown.
- Card, pack, deck, variable-slot, and nested sealed-item resolution.
- Product metrics used by several views.

Current status:

- Still active and high risk because it overlaps backend valuation.
- Synthetic booster records, reprint multipliers, fabricated card prices, synthetic percentile bounds, market-price-as-EV fallbacks, and browser-side composite simulation have been removed during the current cleanup pass.
- Remaining recursive resolution should be treated as a transitional display helper, not a second authoritative valuation engine.

Required policy:

- Use backend vendor/mode records when present.
- Preserve explicit zero/unresolved values when records are missing.
- Borrow neighboring card prices only when provenance is available from the backend.
- Never derive sealed-product EV from sealed market price.
- Never construct vendor prices by multiplying another vendor price.
- Never construct probability distributions from averages or fixed ratios.

### `src/utils/evScore.ts`

Purpose:

- Calculates EV score from market price and empirical quantiles.
- Provides score styling helpers.

Review status:

- `calculateEvScore()` correctly returns `null` when empirical quantiles are unavailable.
- The browser composite simulation helper and its standalone diagnostic scripts have been removed; composite quantiles must come from backend snapshots.

### `src/utils/vendorUtils.ts`

Purpose:

- Normalizes vendor names and booster codes.
- Finds booster EV records.
- Resolves display-level card pricing.

Review risks:

- Compatibility aliases such as `all` should be removed after generated data is verified.
- Missing named vendors must remain unavailable rather than being silently replaced by another vendor.

## 7. Fallback and Synthetic Logic Inventory

Fallbacks requiring explicit policy:

- Empty initial arrays in `src/data.ts`.
- Static catalog products when generated products are unavailable.
- Title-based packaging inference.
- Scryfall hierarchy fallback mappings.
- Curated Special Chases and Scryfall discovery.
- Deck-detail fallback in the chase-card viewer.
- Legacy recursive product resolution in `productUtils.ts`.
- Vendor aliases and missing-vendor display behavior.
- Default card-count and pack-count metadata.

Allowed fallbacks:

- Image URL construction from an existing Scryfall ID.
- Display-only formatting and sorting.
- Explicit neighboring card-price provenance supplied by backend data.
- Offline hierarchy recovery when generated hierarchy data is unavailable.

Disallowed fallbacks:

- Sealed market price used as singles EV.
- Static product price used as generated EV.
- Vendor prices generated by percentage multipliers.
- Reprint prices generated by a global discount multiplier.
- Quantiles generated in the browser from summary values.
- Curated chase prices used as product valuation.

## 8. Recommended Cleanup Order

### Phase 1: Preserve the data boundary

1. Keep generated JSON loading centralized in `dataService.ts`.
2. Make missing data explicit in all main views.
3. Add source/status labels for generated, curated, inferred, and unavailable data.
4. Ensure static catalog values cannot overwrite matching generated products.

### Phase 2: Finish valuation migration

1. Remove remaining recursive synthetic branches from `productUtils.ts` and the hierarchy consumers.
2. Keep composite quantiles backend-owned; the retired browser simulation helper is no longer part of the frontend.
3. Make backend product/composite records the only source for displayed EV and quantiles.
4. Keep structural card/pack/deck row helpers separate from product-level EV ownership.
5. Retain frontend recursive breakdown only for structural contents display.
6. Add focused tests for missing vendor, missing quantiles, missing cards, and mixed products.

### Phase 3: Simplify chase cards

1. Verify `product_chase_cards.json` coverage for representative booster, bundle, case, deck, and Secret Lair products.
2. Keep `ProductChaseCardsViewer` backend-only for product TOP 5 data.
3. Move curated Special Chases behind an explicit editorial boundary.
4. Reduce `chaseCardsService.ts` to image and metadata helpers plus the editorial catalog.
5. Delete the now-unused product candidate, live-set discovery, and product-wide preload functions after the frontend build passes.

### Phase 4: Improve frontend performance

1. Load product chase data only for the selected product or use the existing cached snapshot efficiently.
2. Avoid recalculating recursive product breakdowns on every render.
3. Memoize or cache immutable catalog indexes at the service boundary.
4. Measure startup cost of large generated JSON files.
5. Split generated JSON by domain or set only if measurement justifies it.

### Phase 5: Clean legacy files

Only after reference searches and focused validation:

- Remove the uncalled synthetic product factory in `RelatedProductsHierarchy.tsx` after final reference validation.
- Remove empty exports from `src/data.ts` after all imports are migrated.
- Review `test_composite_evaluation.py` on the backend side.
- Remove obsolete product candidate functions from `chaseCardsService.ts`.
- Remove compatibility aliases and unused imports.

Do not delete yet:

- `src/types.ts`
- `src/ecommerceBoosterData.ts`
- `src/services/dataService.ts`
- `src/utils/productUtils.ts`
- `src/utils/setHierarchyUtils.ts`
- `src/services/chaseCardsService.ts`

## 9. Frontend Audit Completion Register

| Priority | Area | Current state | Required evidence |
|---|---|---|---|
| P0 | Data boundary | Central JSON loader exists, but several views still call recursive valuation helpers. | Main views display backend records when available and show explicit missing states otherwise. |
| P0 | EV authority | Backend is authoritative for booster EV; the main recursive utility and breakdown/hierarchy consumers no longer apply synthetic reprint/vendor multipliers. | No frontend-generated EV or quantiles for products with backend records. |
| P0 | Product chase ownership | Product viewer is backend-only; remaining service discovery functions are uncalled, and product-wide preload has been removed. | Representative products show backend TOP 5 output with no candidate-discovery fallback; then delete the remaining uncalled service functions. |
| P1 | Vendor/mode semantics | Global vendor and price mode state is centralized in `App.tsx`; active breakdown and hierarchy consumers no longer apply percentage multipliers. | Missing vendor/mode records never borrow unrelated records or apply multipliers. |
| P1 | Catalog provenance | Curated and generated products are merged, with title inference for unknown metadata. | Generated products win by stable ID/UUID; inferred metadata is marked or logged. |
| P1 | Hierarchy provenance | Scryfall hierarchy is loaded centrally with fallback mappings. | Generated hierarchy is preferred and fallback usage is observable. |
| P2 | Performance | Data service caches several large snapshots; recursive calculations remain in views. | Startup and selected-product loading are measured; no product-wide chase preload is required. |
| P2 | Test coverage | Build/type checking exists, backend semantic output validation now covers core booster/composite shapes, but focused frontend data-contract tests are limited. | Add tests for loader normalization, vendor/mode lookup, missing data, and backend chase-card selection. |
| P3 | Cleanup | Empty startup exports, unused simulation helper, curated legacy paths, and compatibility aliases remain. | Delete only after import/reference checks and successful build. |

## 10. Minimum Frontend Checks

Before frontend changes are pushed:

```text
npm.cmd run lint
npm.cmd run build
git diff --check
```

For valuation or data-boundary changes, also verify representative generated JSON records for:

- one single booster;
- one box or bundle;
- one case or nested sealed product;
- one preconstructed deck;
- one variable-content product;
- one product with a missing vendor or missing quantile record.

## 11. Relationship To Backend Review

`backend/BACKEND_REVIEW.md` owns backend pipeline stages, MySQL processing, generated-output ownership, provenance, validation, and publication safety.

This document owns frontend consumption, runtime display, catalog merging, asset and hierarchy metadata, browser fallback policy, and migration away from duplicate valuation logic.

The two documents should be updated together when changing:

- vendor keys or price modes;
- generated JSON schemas;
- product or booster identifiers;
- provenance fields;
- chase-card output shape;
- quantile or EV semantics.
