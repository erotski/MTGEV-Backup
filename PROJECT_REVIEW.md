# MTGEV Project Guide

This document is the project-wide map for MTGEV. It defines the major layers, ownership boundaries, operating restrictions, common workflows, completed improvements, and future development priorities.

Detailed layer reviews are maintained separately:

- [`backend/BACKEND_REVIEW.md`](backend/BACKEND_REVIEW.md): data pipeline, MySQL processing, generated outputs, validation, and publication.
- [`FRONTEND_REVIEW.md`](FRONTEND_REVIEW.md): React runtime, data loading, catalog metadata, UI ownership, and browser fallback policy.

Update this document when a change crosses backend, frontend, generated-data, or deployment boundaries.

## 1. Project Purpose

MTGEV compares sealed Magic: The Gathering product prices with the expected value of the cards and contents inside those products.

The system answers questions such as:

- What is the expected singles value of a booster, box, bundle, case, deck, or composite product?
- How does value change by vendor and price mode?
- What is the empirical distribution of possible opened values?
- Which cards are the highest-value chase cards in a product?
- How reliable and complete are the source prices used in the calculation?

## 2. Generic Structure

```text
GitHub Actions
  -> temporary MySQL 8
  -> MTGJSON and price downloads
  -> price/reprint preparation
  -> booster simulation
  -> JSON export
  -> deck and chase-card enrichment
  -> composite-product evaluation
  -> output validation
  -> atomic public/data publication
  -> Vercel deployment

React frontend
  -> dataService.ts
  -> root public/data/*.json snapshots
  -> catalog and hierarchy metadata
  -> view components
```

### Repository layers

| Layer | Main location | Responsibility |
|---|---|---|
| Pipeline orchestration | `backend/daily_update.py` | Runs required stages and records telemetry. |
| Source ingestion | `backend/download.py`, `download_prices_today.py` | Loads MTGJSON and current price feeds into temporary MySQL. |
| Price preparation | `backend/lowest_prices.py`, `price_resolver.py` | Resolves direct, reprint, vendor, finish, and aggregate prices. |
| Booster simulation | `backend/populate_booster_ev_to_db.py`, `ev_statistics.py` | Simulates booster openings and produces empirical distributions. |
| Product evaluation | `backend/composite_evaluator.py`, `ev_engine.py` | Evaluates nested, fixed, variable, and composite products. |
| Deck/chase export | `backend/load_deck_tables.py`, `export_product_chase_cards.py` | Loads deck contracts and exports product TOP 5 cards. |
| Validation | `backend/validate_pricing_and_ev.py`, `validate_composite_data.py`, `daily_update.py` | Checks output structure, EV consistency, quantiles, provenance, and references. |
| Published data | root `public/data/` | Authoritative immutable frontend snapshots. |
| Frontend shell | `src/App.tsx`, `src/types.ts` | Global state, navigation, and shared contracts. |
| Frontend data boundary | `src/services/dataService.ts` | Loads and caches generated JSON. |
| Frontend views | `src/components/` | Displays backend data and presentation-only calculations. |
| Catalog/assets | `src/ecommerceBoosterData.ts`, `catalogProductLoader.ts`, `productAssetMatcher.ts` | Product metadata, packaging, hierarchy, and images. |
| Documentation | `PROJECT_REVIEW.md`, `BACKEND_REVIEW.md`, `FRONTEND_REVIEW.md` | Architecture, restrictions, and operating procedures. |

## 3. Most Important Components

### Backend

- `daily_update.py`: authoritative production sequence and publication gate.
- `populate_booster_ev_to_db.py`: booster price resolution and simulation.
- `ev_statistics.py`: single source for the 100-point endpoint-preserving curve contract.
- `composite_evaluator.py`: backend composite quantile producer.
- `price_resolver.py`: explicit card-price and provenance decisions.
- `export_app_data.py`: generated application snapshot exporter.
- `export_product_chase_cards.py`: backend product chase-card producer.
- `validate_pricing_and_ev.py`: pricing and EV quality checks.
- `validate_composite_data.py`: composite distribution diagnostics.

### Frontend

- `App.tsx`: global vendor, price mode, EV basis, set, and tab state.
- `dataService.ts`: JSON loading and caching boundary.
- `productUtils.ts`: transitional structural breakdown helper; backend data remains authoritative for product EV.
- `evScore.ts`: EV score calculation from empirical quantiles.
- `BoosterDetailExplorer.tsx`: booster and product exploration.
- `PackDistributionCurve.tsx`: curve rendering from backend quantiles.
- `ProductChaseCardsViewer.tsx`: backend-generated product TOP 5 display.
- `ArbitrageLeaderboard.tsx`: product overview and pricing reliability.
- `ProductBreakdownTable.tsx`, `ProductHierarchyInspector.tsx`, `RelatedProductsHierarchy.tsx`: contents and hierarchy presentation.
- `SpecialChaseShowcase.tsx`: curated editorial showcase, separate from product TOP 5 data.

## 4. Definitions and Contracts

### Terminology rules

Use these terms consistently in code, UI labels, logs, tests, and documentation. Do not use `estimated`, `market`, `exact`, or `fallback` as vague substitutes for a more precise state.

| Term | Meaning | Must not mean |
|---|---|---|
| **EV / singles EV** | The value of the cards or fixed contents inside a sealed product, calculated from card prices and product collation. | The sealed product's own market price. |
| **Market price** | The observed price of the sealed product itself. | The value of the cards inside it. |
| **Unit EV** | EV for one contained unit, such as one booster pack or one deck. | The total EV of the containing box, bundle, or case. |
| **Total EV** | EV for the complete product record being displayed. | A price copied from the sealed product listing. |
| **Direct mode** | Price resolution for the requested vendor, card identity, and finish where available. | A guaranteed exact listing when provenance says a neighbor was used. |
| **Cheapest-reprint mode** | Cheapest available name/reprint resolution for the requested vendor context. | Exact native vendor-listing coverage. |
| **Named vendor** | An actual marketplace price source: `tcgplayer`, `cardmarket`, `cardkingdom`, or `manapool`. | `all_cheapest` or `all_average`. |
| **Aggregate mode** | A calculated comparison view derived from named-vendor prices. The generated-data schema stores it in the `vendor` field for compatibility. | A physical marketplace or independent price feed. |
| **`all_cheapest`** | The lowest usable price among configured named vendors for each resolved card/content context. | A vendor account, marketplace listing, or guarantee that every vendor has the card. |
| **`all_average`** | The arithmetic average of usable configured named-vendor prices for the resolved context, excluding `all_cheapest`; missing vendors are not treated as zero. | A marketplace or a sealed-product market price. |
| **Exact price** | A price resolved from the requested vendor and finish/card context. | Any successfully resolved price. |
| **Neighboring price** | An explicitly borrowed card price from another finish, vendor, or reprint context. | A fabricated percentage estimate. |
| **Fallback** | A documented alternate resolution path with an observable source/status. | Silent invention, synthetic multipliers, or market-price substitution. |
| **Unpriced / unresolved** | No valid source price or authoritative product value was available. | Zero being presented as a real market value. |
| **Empirical curve** | Exactly 100 sorted distribution points generated from simulated samples. | A curve interpolated from summary statistics. |
| **Curve endpoint** | Point 1, the exact minimum sample, or point 100, the exact maximum sample. | A percentile bucket mean. |
| **Interior bucket mean** | One of the 98 equal empirical groups between the exact endpoints. | An exact minimum or maximum. |
| **Audit artifact** | A temporary GitHub Actions JSON file containing sorted raw samples and derived bucket means. | A committed application dataset. |
| **Published snapshot** | A generated JSON file in root `public/data/` produced by one pipeline run. | A mutable frontend cache or hand-edited fixture. |
| **Pipeline run** | One complete backend regeneration attempt, including validation and publication decisions. | A local dry-run or frontend build. |
| **Provenance** | Metadata describing where a value came from and whether it was exact, borrowed, reprinted, or unresolved. | A generic “live” label. |
| **Curated editorial data** | Human-maintained showcase content such as Special Chases. | Backend-calculated product TOP 5 data. |
| **Inferred metadata** | Metadata derived from names or heuristics when source fields are missing. | Authoritative product identity or valuation. |
| **`main` branch** | Source code, workflows, documentation, and application changes. | The generated-data-only branch. |
| **`data-sync` branch** | Workflow-published generated `public/data/` snapshots. | The branch for backend or frontend source development. |

### Naming restrictions

- Use **`market price`** for the sealed product price and **`EV`** for card/content value.
- Use **`exact`** only when provenance confirms an exact requested source.
- Use **`resolved`** for successful cheapest-reprint resolution.
- Use **`borrowed`** or **`neighboring`** for explicit card-price substitution.
- Use **`unresolved`** or **`unpriced`** when no authoritative value exists.
- Use **`published snapshot`** for root `public/data` files and **`audit artifact`** for temporary workflow downloads.
- Use **`curated`** for editorial content and **`inferred`** for heuristic metadata.

### Vendors

Canonical vendor keys:

```text
all_cheapest
all_average
tcgplayer
cardmarket
cardkingdom
manapool
```

The first four keys are named marketplace sources. `all_cheapest` and `all_average` are aggregate calculation modes stored in the vendor field for compatibility with generated JSON; they are not marketplaces. `all_cheapest` selects the lowest usable configured named-vendor price for each resolution. `all_average` averages usable configured named-vendor prices and excludes `all_cheapest`.

### Price modes

```text
direct
cheapest_reprint
```

- `direct`: requested card/vendor/finish pricing where available, with explicit neighboring card-price provenance when borrowed.
- `cheapest_reprint`: cheapest name/reprint resolution. Its reliability metric is resolution coverage, not exact native vendor-listing coverage.

### Empirical curve

Every valid booster or composite curve contains exactly 100 points:

```text
point 1       exact minimum sample
points 2-99  98 equal empirical interior bucket means
point 100     exact maximum sample
```

The raw samples are retained in audit artifacts when audit mode is enabled. Existing percentile indexes remain zero-based in code, so `quantiles[0]` is point 1 and `quantiles[99]` is point 100.

### Provenance

Card prices may have explicit statuses such as:

```text
exact
finish_fallback
vendor_fallback
vendor_finish_fallback
reprint
ignored
unpriced
```

A borrowed card price must remain distinguishable from an exact source price. Sealed-product market prices and product identity must not be invented or borrowed.

## 5. Restrictions

### Runtime restrictions

- Do not run the full `backend/daily_update.py` locally unless a complete compatible MySQL/data environment is deliberately configured.
- The authoritative full pipeline runs in GitHub Actions with temporary MySQL 8.
- Run manual workflows from `main`, not `data-sync`.
- `data-sync` is for generated snapshots; source changes belong on `main`.
- Never commit audit samples or local generated caches.

### Data restrictions

- Root `public/data/` is the only authoritative generated-data location.
- Do not recreate `backend/public/data/`.
- Do not use sealed market price as singles EV.
- Do not derive one vendor price by multiplying another vendor price.
- Do not apply synthetic reprint multipliers.
- Do not generate quantiles from averages or fixed percentage bands.
- Missing vendor, card, finish, or quantile data must remain explicit and observable.
- Neighboring card-price borrowing is allowed only with provenance.

### Ownership restrictions

- Backend owns booster EV, composite EV, quantiles, vendor semantics, price modes, provenance, and product chase-card output.
- Frontend owns loading, presentation, navigation, formatting, sorting, and image/metadata display.
- Curated Special Chases are editorial content and must not become product valuation data.
- Static catalog metadata must not override matching generated product values.

## 6. Usage

### Local frontend development

```cmd
npm.cmd run lint
npm.cmd run build
npm.cmd run dev
```

The frontend reads the existing root `public/data/` snapshots. Use the Vite URL printed by the dev server for browser checks.

### Local backend checks

These do not require MySQL:

```cmd
py -3.12 -m py_compile backend\daily_update.py
py -3.12 backend\daily_update.py --dry-run
py -3.12 -m unittest backend.test_ev_statistics backend.test_pipeline_bucket_contract
py -3.12 backend\inventory_jumpstart.py
```

### Full data regeneration

The full regeneration is GitHub-only:

1. Push the intended source commit to `main`.
2. Open the daily workflow in GitHub Actions.
3. Select **Run workflow**.
4. Enable `audit_enabled` for curve verification.
5. Inspect `latest_pipeline_run.json`, reliability, provenance, chase cards, composite outputs, and the uploaded `ev-simulation-audit-<run number>` artifact.

Audit artifacts are attached to the workflow run for a limited retention period. They are not committed to Git.

### Pre-push checks

```cmd
git diff --check
npm.cmd run lint
npm.cmd run build
py -3.12 -m py_compile backend\daily_update.py
py -3.12 backend\daily_update.py --dry-run
```

## 7. Planned improvements and known gaps

### Product inspection should expose fixed-vs-variable content details

The inspection layer currently focuses on resulting EV and high-level product breakdowns, but it does not yet make the underlying collation semantics legible to reviewers. For products such as Jumpstart, the critical distinction is not just the total card count or pack value; it is whether the product contains fixed sheets, variable sheets, or a mixed structure with rare/mythic randomness.

This should be treated as a documented project improvement rather than a one-off bug fix. The system should make the fixed/variable structure visible wherever a product or booster is inspected or opened in the UI and exported metadata.

Suggested follow-up:

1. Add a backend-exported inspection contract for each product/booster entry, including:
   - `fixed_by_default` or equivalent boolean flag
   - `variable_sheets` list
   - `fixed_sheets` list
   - `sheet_count`, `card_count`, and source metadata
   - a `collation_source` or `source_provenance` marker that distinguishes MTGJSON-native, override-based, and inferred data
2. Surface this in the inspection views next to the pack breakdown or product details, for example:
   - `Fixed: 20 sheets`
   - `Variable: rareMythicBlack, rareMythicBlue, ...`
   - `Collation status: mixed` / `deterministic`
3. Add a validator that compares exported product metadata against the canonical MTGJSON sheet definition and the reviewed override file so drift is caught before publication.
4. Keep the override layer explicit and reviewable, rather than hiding it in downstream rendering logic. The user should be able to see that a product is using a temporary collation override and which sheet names are affected.
5. Document the inspection metadata contract in the backend review and schema documentation, so product reviewers know exactly which fields are intentionally authoritative versus inferred.

This is especially important for Jumpstart and any other product families where fixed sheets and variable sheets coexist in the same product. The inspection layer should make that distinction obvious to both data reviewers and product users.

## 7. Completed Improvements

- Replaced synthetic frontend EV curves with backend-owned empirical data.
- Removed browser-side composite Monte Carlo simulation.
- Removed frontend vendor/reprint percentage multipliers.
- Removed fabricated card, foil, and sealed-product EV fallbacks.
- Added endpoint-preserving 100-point empirical curves.
- Added booster endpoint validation against `evMin` and `evMax`.
- Added cross-file output validation for products, chase cards, decks, reliability, and telemetry.
- Added backend-generated product chase-card output.
- Added deck card-price provenance and reliability telemetry.
- Added atomic generated-data publication in the workflow.
- Added audit artifact reporting and existence checks.
- Added frontend and backend architecture review documents.

## 8. Optimization Opportunities

Prioritize measured improvements over speculative refactors:

1. Measure stage runtime and memory for booster simulation and composite evaluation.
2. Split `simulate_and_store()` into simulation, statistics, audit, and persistence responsibilities.
3. Consolidate recursive product resolution between `ev_engine.py` and `composite_evaluator.py`.
4. Reduce frontend recursive valuation to structural breakdown only.
5. Load product chase data for the selected product rather than preloading unrelated product data.
6. Cache immutable JSON indexes at the data-service boundary.
7. Consider splitting large generated JSON files only after startup cost is measured.
8. Add reproducibility metadata: source versions, commit SHA, sample count, audit flag, and seed policy.

## 9. Future Development

- Add a formal JSON schema layer for every generated output.
- Add deterministic resolver fixtures and backend test coverage.
- Add a fresh upstream preconstructed-deck bundle downloader.
- Replace compatibility `all` aliases after generated data has migrated.
- Move database schema creation into explicit migrations/setup.
- Decide whether `sync_all_from_sqlite.py` remains supported.
- Replace prototype composite tests with deterministic automated tests.
- Add workflow status and latest-run diagnostics to the Admin Portal.
- Add artifact retention/download instructions to project documentation.
- Introduce a data-quality dashboard for missing prices, fallback rates, and unresolved products.

## 10. Legacy Cleanup Candidates

Delete only after reference and history checks:

- `src/data.ts` empty startup exports after imports are migrated.
- `scripts/ingest-wpn.ts` if the JavaScript importer is the only supported path.
- Unreferenced ingestion scripts.
- `sync_all_from_sqlite.py` if no SQLite workflow remains.
- `test_composite_evaluation.py` after deterministic tests replace it.
- `update_overrides.py` if no operational workflow uses it.
- Empty or stray root files such as `new_file.txt`.
- Local `dist/` when it is not intentionally deployed.

## 11. Change Management

For changes affecting generated data or valuation semantics:

1. Update the owning backend/frontend review document.
2. Update tests and validators first.
3. Make the smallest implementation change.
4. Run local checks that do not require MySQL.
5. Run GitHub Actions with audit enabled when curves or source data change.
6. Inspect generated artifacts before deployment.
7. Commit source changes separately from generated data changes.
8. Record any intentional fallback or compatibility behavior.

Keep commits focused. A useful sequence is:

```text
backend-first migration
frontend cleanup
validation/workflow hardening
legacy file deletion
performance refactor
```

## 12. Numbered Project Roadmap

This is the master development list. The backend and frontend review documents contain implementation detail; this section tracks cross-project work and acceptance evidence.

Statuses:

- `DONE`: implemented and locally or operationally verified.
- `PARTIALLY_FIXED`: no active issue remains in the current validated path, but a broader follow-up or cross-layer validation remains advisable.
- `IN PROGRESS`: active work with a known remaining slice.
- `NEXT`: ready to start after prerequisites.
- `BLOCKED`: requires an external dependency such as GitHub Actions, MySQL, or an upstream data source.

| ID | Area | Priority | Status | Deliverable | Acceptance evidence |
|---|---|---:|---|---|---|
| DEV-01 | Backend ownership | P0 | DONE | Backend owns booster EV, composite EV, quantiles, price modes, provenance, and product chase output. | Generated snapshots and frontend consumers use backend records. |
| DEV-02 | Empirical curves | P0 | DONE | Curves contain 100 points: exact minimum, 98 interior means, exact maximum. | Bucket tests, audit samples, monotonicity, and endpoint checks pass. |
| DEV-03 | Publication safety | P0 | DONE | Generated data is staged and published atomically. | Failed workflow preserves the previous root `public/data/` snapshot. |
| DEV-04 | Frontend fallback removal | P0 | DONE | Synthetic multipliers, invented card prices, market-price-as-EV, and browser simulations removed from active paths. | `npm.cmd run lint` and `npm.cmd run build` pass; no active multiplier references remain. |
| DEV-05 | Chase-card ownership | P0 | DONE | Product TOP 5 cards come from `product_chase_cards.json`; curated Special Chases remain editorial. | Viewer renders backend snapshot and shows explicit empty state when missing. |
| DEV-06 | Output validation | P0 | IN PROGRESS | Validate generated JSON shape, endpoints, cross-file references, telemetry, decks, reliability, and chase cards. | Daily runner passes `output_bundle`, `output_semantics`, and telemetry validation. |
| DEV-07 | Snapshot identity | P0 | IN PROGRESS | Add shared `pipelineRunId`, source commit, generated timestamp, and schema version to generated outputs. | Frontend rejects or warns when snapshots come from different pipeline runs. |
| DEV-08 | Frontend data gateway | P0 | IN PROGRESS | Add `dataService.getProductMetrics(productId, vendor, priceMode, evBasis)`. | Main product views display values from one gateway and expose `source`/`pipelineRunId`. |
| DEV-09 | Frontend contract validation | P1 | IN PROGRESS | Validate JSON schemas and cross-file IDs at the `dataService` boundary. | Invalid snapshots produce structured warnings and an Admin Portal diagnostic. |
| DEV-10 | End-to-end value checks | P1 | NEXT | Compare UI EV, market price, curve, and chase cards against generated JSON. | Playwright checks assert `displayed value === snapshot value` for representative products. |
| DEV-11 | Recursive EV consolidation | P1 | IN PROGRESS | Reduce `productUtils.ts` and view helpers to structural breakdown; remove duplicate product valuation. | No component computes authoritative EV when a backend record exists. |
| DEV-12 | Reproducibility | P1 | NEXT | Record source versions, commit SHA, sample count, audit flag, and seed policy. | `latest_pipeline_run.json` contains reproducibility metadata. |
| DEV-13 | Workflow audit | P1 | BLOCKED | Run GitHub Actions with `audit_enabled=true` after source changes. | Audit artifact exists; endpoint means reproduce from raw samples. |
| DEV-14 | Catalog provenance | P1 | DONE | Mark generated catalog metadata as `pipeline` or `inferred`; avoid invented dates/blocks. | Catalog loader tests distinguish inferred metadata. |
| DEV-15 | Performance measurement | P2 | NEXT | Measure startup, JSON parse time, simulation memory, and stage duration. | Optimization decisions are based on recorded measurements. |
| DEV-16 | Backend decomposition | P2 | NEXT | Split simulation, statistics, audit writing, and MySQL persistence. | Focused tests preserve summary, sample, and bucket behavior. |
| DEV-17 | Legacy deletion | P2 | IN PROGRESS | Remove unreferenced ingestion scripts, SQLite paths, prototype tests, and empty files after history checks. | Reference search, workflow review, and focused validation pass. |
| DEV-18 | Operational dashboard | P2 | NEXT | Display latest pipeline status, snapshot identity, fallback rates, and unresolved counts in Admin Portal. | Admin Portal explains stale, missing, failed, and deployed states. |
| DEV-19 | Vendor lifecycle | P1 | NEXT | Centralize vendor definitions and make add/remove operations contract-driven. | A vendor change updates backend resolution, generated outputs, frontend controls, validation, provenance, and documentation without scattered edits. |
| DEV-20 | Jumpstart collation | P0 | NEXT | Interpret MTGJSON Jumpstart `fixed` sheet metadata correctly through a centralized `booster_collation_overrides.json` workaround because the MySQL schema omits the optional field. Fixed card counts are deterministic; only wildcard/variable slots are sampled. | A reviewed Jumpstart inventory identifies each set/booster/sheet mix; representative audit files show fixed land/content counts, correct variance, and agreement with MTGJSON configuration. |
| DEV-21 | Curve snapshot integrity | P0 | PARTIALLY_FIXED | The published curve data still needs continued cross-layer validation, but no active curve integrity issues were found in the GitHub Actions review. The website should continue to be checked against the latest snapshot when broader backend-to-frontend validation is required. | GitHub Actions review found no curve mismatches; future backend-to-frontend validation should compare snapshot identity, selected record key, quantile source, endpoint values, and no-data reason. |
| DEV-22 | Chase-card visibility | P0 | IN PROGRESS | Ensure every product that has backend TOP 5 chase data displays it in the product detail and breakdown views without silent empty states or stale vendor-mode mismatches. | Representative products show the expected `product_chase_cards.json` cards for the selected vendor and price mode, and any missing record surfaces a clear diagnostic rather than an empty card grid. |

### Frontend single-source-of-truth validation

The frontend validation path should prove this chain:

```text
GitHub pipeline
  -> generated public/data snapshots
  -> dataService validation and cache
  -> one product metrics gateway
  -> view components
  -> displayed value
```

For each representative product, validate:

1. The product ID exists in `sealed_products.json`.
2. Its vendor and price-mode record exists where required.
3. The selected curve has exactly 100 points.
4. Curve point 1 and point 100 match the backend minimum and maximum.
5. Displayed EV equals the selected backend snapshot value.
6. Displayed market price is not used as singles EV.
7. Chase cards match `product_chase_cards.json`.
8. Deck cards and prices match `precon_decks.json` and `single_card_prices.json`.
9. All loaded files share the same `pipelineRunId` and `schemaVersion`.
10. Missing values produce an explicit unavailable state, never a synthetic estimate.

Recommended representative fixtures:

- one single booster;
- one booster box or bundle;
- one nested case;
- one preconstructed deck;
- one variable-content product;
- one product with a missing vendor or quantile record.

### Immediate issue investigation order

#### DEV-20: Jumpstart collation

1. Enumerate all current Jumpstart set codes from `public/data/booster_ev.json` and the raw MTGJSON JSON source.
2. Review each Jumpstart sheet mix and classify sheets as `fixed`, `variable`, or `unknown`.
3. Add reviewed corrections to a centralized `public/data/booster_collation_overrides.json` file rather than modifying the MySQL dump.
4. Apply that overlay in `load_booster_config_from_db` after the normal MySQL load.
5. During simulation, treat fixed entries as deterministic card selections/counts rather than weighted random draws.
6. Keep wildcard rare/mythic or other explicitly variable sheets random.
7. Model the usual 10 land cards as fixed only when the MTGJSON source or reviewed override says so; do not infer this solely from the booster name.
8. Add a deterministic Jumpstart fixture test and an audit assertion that fixed portions do not create artificial variance.
9. Regenerate Jumpstart outputs in GitHub Actions and compare EV/variance against the raw MTGJSON configuration.

#### DEV-21: Curve snapshot integrity

Status: `PARTIALLY_FIXED`. The GitHub Actions curve checks did not reveal a current issue, so this item is no longer treated as an active bug. It should remain on the validation watchlist for broader backend-to-frontend checks when new data or UI changes are introduced.

1. Add a development diagnostics record showing: product ID, set, booster, vendor, price mode, source file, snapshot timestamp/run ID, quantile length, first point, last point, and no-data reason.
2. Compare the selected frontend record against `sealed_products.json` and `booster_ev.json` for the same key.
3. Verify that `vendor` and `priceMode` normalization does not silently select `all_cheapest`, `tcgplayer`, or another row when the requested record is absent.
4. Verify that `activeProduct.quantilesByVendor` is used for composite products and the exact `booster_ev.json` record is used for a single booster.
5. Verify that the website is serving the current root `public/data` snapshot after the `data-sync` publication and Vercel deployment.
6. Run the check once with `audit_enabled=false` and once with `audit_enabled=true`; the published curve must be identical for the same source data.
7. Treat missing quantiles as an explicit data-contract failure with the selected key, not as a generic “No data available” message.
8. Keep cross-layer validation in mind whenever future backend or frontend data refactors occur; the current status is “no issue found,” not “no further checks needed.”

#### DEV-22: Chase-card visibility

Status: `IN PROGRESS`. The product TOP 5 chase cards are still not appearing for some products even though the backend export path exists. This is a real issue rather than an accepted empty state, and it should be tracked as a product-data contract bug until the mismatch is resolved.

1. Confirm the exact key mapping between `sealed_products.json` and `product_chase_cards.json` for a representative product list.
2. Verify that the selected product resolves to the same canonical ID or UUID on both backend and frontend paths.
3. Validate the vendor and price mode key format, such as `direct:tcgplayer`, `direct:cardmarket`, or `cheapest_reprint:all_cheapest`, before treating the record as missing.
4. Add a diagnostic warning when a product has a valid backend record but no frontend entry for the current vendor/mode combination.
5. Add a regression test for a known product with chase data to prevent silent empty-grid regressions.
6. Keep the empty-state message truthful and explicit; it should explain that the selected product has no chase-card record, not merely that “no cards are available.”

### Vendor add/remove procedure

Vendor changes are cross-layer contract changes, not simple UI edits. The current codebase has vendor definitions in several places, including `price_resolver.py`, `populate_booster_ev_to_db.py`, `composite_evaluator.py`, `export_product_chase_cards.py`, `load_deck_tables.py`, `ev_engine.py`, `vendorUtils.ts`, `types.ts`, `PackDistributionCurve.tsx`, `AdminPortal.tsx`, and the review documents.

#### Adding a vendor

1. Confirm the upstream price feed exposes the vendor, finish keys, currency, and product/card identifiers.
2. Add the vendor to one canonical backend vendor registry.
3. Update price ingestion and resolver logic.
4. Include it in booster simulation matrices and seller discovery rules.
5. Include it in composite fixed-card and variable-slot resolution.
6. Include it in chase-card and deck provenance output.
7. Add it to generated-output validation and reliability aggregation.
8. Add it to frontend `Vendor` types, controls, curve series, labels, and source-status handling.
9. Add representative tests for exact, finish fallback, vendor fallback, reprint, and unpriced cases.
10. Regenerate data through GitHub Actions and verify the new vendor appears consistently in `booster_ev.json`, `sealed_products.json`, `pricing_reliability.json`, `product_chase_cards.json`, and deck provenance.

#### Removing a vendor

1. Confirm no active price feed, generated snapshot, workflow, or UI depends on the vendor.
2. Decide whether historical generated data remains readable; preserve a compatibility alias only if required.
3. Remove it from the canonical registry, resolver loops, exporter lists, validation expectations, and frontend controls.
4. Remove or migrate stored provenance records using that vendor.
5. Regenerate all snapshots and verify no records or UI controls reference the removed key.
6. Remove compatibility code only after one successful GitHub workflow and deployment.

#### Required vendor invariants

- Named vendors must never be silently replaced by another named vendor.
- `all_cheapest` and `all_average` must be recomputed from the current named-vendor registry.
- A missing vendor must be represented as unavailable or an explicit fallback status.
- Reliability metrics must distinguish direct exactness from cheapest-reprint resolution.
- Every generated vendor record must use one canonical key and one documented price mode.
