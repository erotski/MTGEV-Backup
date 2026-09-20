# Contract Remediation Plan

Status: proposed, 2026-09-20

This plan records the remediation work identified by the source-contract review of `src/` and `backend/`. It applies the hard rules in [PROJECT_REVIEW.md](../PROJECT_REVIEW.md): generated backend data owns valuation semantics, and missing data remains unavailable unless a documented backend fallback records its provenance.

## Target behavior

- Product metrics and booster records retain canonical vendor and price-mode identities. Documented card-price fallbacks remain visible through provenance and reliability telemetry.
- Products with unresolved contents, card counts, pack counts, or market prices are explicitly incomplete; they do not receive guessed values, ROI, breakeven percentile, or EV score.
- The frontend renders published values and unavailable states. It does not select a different vendor, price mode, booster, or inferred pack/deck size.
- Provenance distinguishes `exact`, `finish_fallback`, `vendor_fallback`, `vendor_finish_fallback`, `reprint`, `ignored`, and `unpriced` outcomes. Fallback values must never be reported as exact.

## Remediation Order

### 1. Preserve fallback provenance and prohibit silent booster substitution

Owners: `backend/price_resolver.py`, `backend/composite_evaluator.py`, `backend/load_deck_tables.py`, `src/utils/vendorUtils.ts`, and `src/utils/productUtils.ts`.

- Preserve the documented price resolver behavior used to complete Monte Carlo samples: same-vendor finish, alternate-vendor, alternate-vendor-finish, and reprint fallbacks are permitted only with their distinct provenance statuses.
- Continue to expose `exactMatchPct`, `differentFinishPct`, `differentVendorPct`, `completeBoosterPct`, and failure counts with generated booster data.
- Do not silently use `all_cheapest`, another price mode, `play`, or `default` when the requested booster record is absent. A booster configuration is not a card-price fallback; it changes the sampled product.
- Return an explicit unavailable result when no valid requested booster record exists.
- Keep aggregate calculations (`all_cheapest` and `all_average`) in their dedicated aggregation paths only.

Required tests:

- A named-vendor alternate-seller value carries `vendor_fallback` or `vendor_finish_fallback`, never `exact`.
- A same-vendor finish fallback retains `finish_fallback` provenance.
- A missing requested booster mode/vendor must not return a different booster or price mode.
- Aggregate vendor outputs may use multiple sellers through their dedicated resolver paths.

### 2. Remove guessed product-content cardinality

Owners: `backend/composite_evaluator.py`, `backend/export_app_data.py`, and `src/utils/productUtils.ts`.

- Resolve card and pack counts from source `contents`, linked child products, or authoritative preconstructed-deck records.
- Remove default pack, box, and deck assumptions such as 15 cards per unknown pack, 36 packs per unknown box, or 60/100 cards per unmatched deck.
- When a child product cannot be resolved, retain an incomplete-content status and omit derived count-dependent metrics.
- Keep static collation metadata only in the documented pipeline input files (`booster_slots.json`, `precon_decks.json`, and `product_overrides.json`), not in frontend or evaluator heuristics.

Required tests:

- Unknown pack code, sealed child, and deck each produce an incomplete result rather than a numeric estimate.
- A known nested product resolves its count recursively from linked content.
- `product_metrics.json` contains a card count only when the producer can substantiate it.

### 3. Preserve missing market prices

Owners: `backend/export_app_data.py` and `backend/composite_evaluator.py`.

- Serialize absent sealed-product market price as `null` or omit the valuation record instead of coercing it to zero.
- Do not calculate profit, ROI, breakeven percentile, or EV score when a product has no positive market price.
- Render the value as unavailable in the frontend; do not display a free product or a 100-point EV score.

Required tests:

- A product without a market price has no derived valuation metrics.
- A zero market price cannot generate an EV score of 100.

### 4. Correct exported vendor identity

Owner: `backend/export_app_data.py`.

- Ensure `arbitrage_leaderboard.json` labels aggregate values as `all_cheapest`.
- If the compatibility leaderboard must expose `tcgplayer`, query and publish the actual TCGplayer computation instead.
- Add a cross-file validator that compares leaderboard vendor/mode fields and values with the matching product metric or producer record.

Required tests:

- Every leaderboard record's vendor and price mode match the calculation source.
- Aggregate rows are never labeled as named-vendor rows.

### 5. Make the frontend presentation-only

Owners: `src/utils/productUtils.ts`, `src/utils/vendorUtils.ts`, and detail components using those utilities.

- Remove frontend pack/deck/card-count estimates and price reconstruction from product valuation paths.
- Preserve the selected vendor and price mode during lookups; show an unavailable value if no exact published record exists.
- Restrict the legacy `all` alias to one explicitly documented ingestion-compatibility boundary. New UI and runtime code use canonical vendor keys exclusively.

Required tests:

- A missing frontend booster/card record renders unavailable without changing vendor, mode, or booster type.
- No frontend valuation helper returns a value from a different vendor or price mode.

## Validation Gates

Add focused checks before running the audited daily pipeline:

1. `PriceResolver` unit tests for named-vendor, aggregate, finish, and reprint paths.
2. Composite evaluator fixtures for unavailable children, prices, decks, and boosters.
3. Product-metric contract checks requiring source-backed counts and a positive market price for ROI/EV score.
4. Snapshot validation that verifies vendor/mode provenance for `product_metrics.json` and `arbitrage_leaderboard.json`.
5. Frontend tests asserting unavailable rendering and exact vendor/mode preservation.

After these checks pass, run the daily workflow with `audit_enabled=true` to publish a fresh validated bundle. Do not hand-edit generated files under `public/data/`.

## Existing Snapshot Blocker

The current local `product_metrics.json` contains a duplicate `(productUuid, vendor, priceMode)` identity. This must be corrected in the metric producer and confirmed by `backend/test_product_metrics_contract.py` before a regenerated snapshot is treated as valid.