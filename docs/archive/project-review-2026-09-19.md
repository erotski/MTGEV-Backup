# MTGEV Project Review

This file is the compact source-of-truth for current project rules and operating constraints.

For detailed architecture and workflow guidance, see:

- [README.md](README.md)
- [docs/architecture.md](docs/architecture.md)
- [docs/operations.md](docs/operations.md)
- [docs/archive/legacy-project-review.md](docs/archive/legacy-project-review.md)

## Purpose

MTGEV compares sealed Magic product prices with the expected value of the cards and contents inside those products.

## Core architecture

- Backend pipeline: pricing, EV simulation, validation, and JSON export
- Frontend app: data loading and presentation only
- Generated snapshots: live application data under `public/data/`

## Hard constraints

- Root `public/data/` is the authoritative generated-data location.
- Do not reintroduce the legacy `all` vendor alias in new code.
- Use only canonical vendor keys:
  - `all_cheapest`
  - `all_average`
  - `tcgplayer`
  - `cardmarket`
  - `cardkingdom`
  - `manapool`
- Frontend must not invent EV values or multiply one vendor’s values into another.
- Backend owns price semantics, provenance, and quantile generation.
- Frontend owns rendering, loading, formatting, and navigation.
- Quick-test pipeline runs must not publish generated snapshots.

## Local validation

```bash
npm run lint
npm run build
npm run dev
```

## Cleanup policy

- Keep active docs focused and short.
- Move old review notes and experiments into `docs/archive/`.
- Avoid deleting generated or legacy code without first archiving it.
- Use small, isolated commits for cleanup and do not mix large refactors with documentation pruning.

## Current focus

- keep the canonical vendor contract aligned across app code and docs
- shrink duplicated project review material
- preserve data-generation boundaries and avoid stale legacy aliases

The frontend reads the existing root `public/data/` snapshots. Use the Vite URL printed by the dev server for browser checks.

### Local backend checks (no MySQL required)

```cmd
py -3.12 -m py_compile backend\daily_update.py
py -3.12 backend\daily_update.py --dry-run
py -3.12 -m unittest backend.test_ev_statistics backend.test_pipeline_bucket_contract
py -3.12 backend\inventory_jumpstart.py
```

### Quick-test pipeline runs

For fast iteration without a full 30-45 minute run, use `QUICK_TEST_LIMIT` (a positive integer, e.g. `50`):

```cmd
py -3.12 backend\daily_update.py --quick-test-limit 50
```

Or in GitHub Actions: **Run workflow** → set `quick_test_limit` to a number. This caps the two heaviest stages:

- `populate_booster_ev_to_db.py` — limits the number of distinct set/booster configurations simulated.
- `sync_live_sealed_prices.py` — limits the number of products synced against TCGplayer's live API.

`download.py` and `download_prices_today.py` still import the full MTGJSON dataset regardless (~12 minutes fixed cost); quick-test mode mainly shrinks the simulation/sync stages. **Quick-test runs never publish** — see Section 5.

### Full data regeneration (GitHub-only)

1. Push the intended source commit to `main`.
2. Open the daily workflow in GitHub Actions.
3. Select **Run workflow**.
4. Enable `audit_enabled` for curve verification. Leave `quick_test_limit` blank for a real production run.
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

### Minimum backend pre-push checks (no MySQL)

```text
python backend/daily_update.py --dry-run
python -m pytest backend/test_ev_statistics.py backend/test_pipeline_bucket_contract.py
npm.cmd run build
git diff --check
```

### Minimum frontend pre-push checks

```text
npm.cmd run lint
npm.cmd run build
git diff --check
```

For valuation or data-boundary changes, also verify representative generated JSON records for: one single booster; one box or bundle; one case or nested sealed product; one preconstructed deck; one variable-content product; one product with a missing vendor or missing quantile record.

## 7. Backend Detail

### Pipeline order

`backend/daily_update.py` runs these stages in order and stops on first failure (never publishes a partial dataset):

1. `download.py`
2. `download_prices_today.py`
3. `lowest_prices.py`
4. `sync_live_sealed_prices.py`
5. `populate_booster_ev_to_db.py`
6. `export_app_data.py`
7. `load_deck_tables.py`
8. `export_product_chase_cards.py`
9. `composite_evaluator.py`
10. `export_product_metrics.py`
11. `validate_pricing_and_ev.py`

Required output files (`REQUIRED_OUTPUTS` in `daily_update.py`):

```text
sets.json, sealed_products.json, booster_ev.json, arbitrage_leaderboard.json,
single_card_prices.json, product_chase_cards.json, product_metrics.json,
pricing_reliability.json, precon_decks.json, pricing_validator_diagnostics.json
```

Plus telemetry outputs (`TELEMETRY_OUTPUTS`), also required and semantically validated:

```text
pipeline_execution_logs.json, latest_pipeline_run.json
```

The published bundle also contains `snapshot_manifest.json`, which binds the
run ID, source commit, generation time, audit mode, and published file list.

`daily_update.py` runs three validation passes before publication: `validate_output_bundle()` (file existence/JSON syntax), `validate_output_semantics()` (shape, numeric finiteness, unique product IDs, 100-bucket monotonicity, booster endpoint agreement with `evMin`/`evMax`, chase-card product-id cross-references), and `validate_telemetry_outputs()` (after the run record is written).

### Important MySQL tables and columns

The temporary MySQL database is imported from MTGJSON's `AllPrintings.sql` and extended by pipeline stages. Do not assume fields from MTGJSON's JSON representation are flattened into `cards`; join normalized tables by UUID.

| Table | Important columns | Purpose |
|---|---|---|
| `cards` | `uuid`, `name`, `setCode`, `number`, `rarity`, `types`, `finishes`, `layout`, `isOnlineOnly` | Printed-card identity and display metadata. |
| `cardIdentifiers` | `uuid`, `scryfallId`, `scryfallIllustrationId`, `scryfallCardBackId` | External identifiers and front/back artwork identity; join with `cards.uuid`. |
| `prices` | `uuid`, `provider`, `finish`, `price`, `source`, `priceType` | Direct printed-card vendor prices. |
| `lowest_prices` | `uuid`, `seller`, `cardfinish`, `price` | Precomputed cheapest-reprint prices. |
| `setBoosterContents` | `setCode`, `boosterName`, `sheetName` | Booster-to-sheet configuration. |
| `setBoosterSheets` | `setCode`, `boosterName`, `sheetName`, `sheetIsFoil` | Booster sheet metadata. |
| `setBoosterSheetCards` | `setCode`, `boosterName`, `sheetName`, `cardUuid` | Cards eligible for each booster sheet. |
| `sealedProducts` | `uuid`, `setCode`, `name`, `category`, `subtype`, `cardCount`, `contents` | Sealed-product identity and structured contents. |
| `sealedproducts_prices` | `sealedproduct_uuid`, `market_price`, `purchase_url`, `fetched_at` | Synced sealed-product market prices. |
| `booster_ev_results` | `set_code`, `booster_name`, `price_mode`, `vendor`, EV summaries, `quantiles` | Pipeline-generated booster simulation results. |
| `decks` / `deckCards` | deck identity; `deckId`, `cardUuid`, `count`, `isFoil` | Temporary normalized preconstructed-deck contents. |

For Scryfall artwork, use `cardIdentifiers.scryfallId` for the front face. `scryfallIllustrationId` is metadata identifying shared artwork, not the card-image CDN identifier. A nonstandard `scryfallCardBackId` identifies a back face; the standard card-back UUID is not treated as a second face.

### File-by-file notes

**`config.py`** — Reads MySQL connection settings and audit settings from environment variables (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `AUDIT_ENABLED`, `AUDIT_OUTPUT_DIR`). Never commit the password; supply via GitHub Actions secrets or a local env var.

**`daily_update.py`** — Orchestrates all stages, captures telemetry, validates before publication, supports `--dry-run`, `--schedule`, `--loop`, and `--quick-test-limit N`. Sets `QUICK_TEST_LIMIT` env var when the flag is used, which propagates to subprocess stages automatically (they inherit the parent environment).

**`download.py` / `download_prices_today.py`** — Stream the full MTGJSON AllPrintings/AllPricesToday SQL dumps into the ephemeral MySQL service. Large, network-dependent, and not shrunk by quick-test mode.

**`sync_booster_fixed_metadata.py`** — Streams MTGJSON `AllPrintings.json` JSON data and writes `public/data/booster_collation_overrides.json`, the compact fixed-sheet metadata overlay for the SQL import's missing `BoosterSheet.fixed` field. It is run by the weekly metadata workflow and published to the `collation-metadata` branch; the daily workflow fetches that file before `populate_booster_ev_to_db.py` runs. The local `all_printings_json/` corpus remains ignored and must not be committed.

**`lowest_prices.py`** — Builds the `lowest_prices` table (per uuid, per seller, per finish minimum price) used for cheapest-reprint resolution. Required before correct reprint pricing.

**`sync_live_sealed_prices.py`** — Syncs live TCGplayer market prices for sealed products via HTTP. Respects `QUICK_TEST_LIMIT` by truncating the product list.

**`populate_booster_ev_to_db.py`** — Reads booster configs/sheets from MySQL, prefetches card metadata/prices, simulates 5,000 booster openings per booster/vendor/price-mode, stores summary stats + 100-bucket quantiles in MySQL `booster_ev_results`.
- `NAMED_VENDORS = {'tcgplayer', 'cardmarket', 'cardkingdom', 'manapool'}` — sellers discovered from `AllPricesToday` are filtered through this allowlist before becoming a per-vendor simulation row. **This was a real bug source**: without the filter, a stray provider string (observed as literally `"all"` for Murders at Karlov Manor) got treated as a genuine vendor, producing a corrupted row and silently omitting the true `all_cheapest` record. Do not remove this filter.
- The pre-migration cleanup `DELETE FROM booster_ev_results WHERE ... vendor = 'all'` must target the legacy `'all'` key, not `'all_cheapest'` — a prior version of this query had the values swapped, which deleted the correct canonical rows instead of the legacy ones.
- Respects `QUICK_TEST_LIMIT` / `--limit N` by truncating the list of distinct set/booster configurations before simulation.
- Bucket contract (shared with composite evaluation via `ev_statistics.py`): simulate pack totals → round to cents → sort → preserve exact min/max as points 1/100 → divide the rest into 98 equal empirical groups → average each group, round to cents.
- Fully fixed booster configurations emit `distributionType = "discrete_fixed_configurations"` and per-configuration `configurationOutcomes` in `booster_ev.json`. Small mixed configurations with at most one variable pick per booster configuration and at most 25,000 total exact outcomes emit `distributionType = "discrete_enumerated_mixed"`; those outcomes are calculated deterministically from fixed sheet EV plus weighted variable-card EV rather than Monte Carlo sampled. The 100-point quantile array remains for compatibility and product-level composition, but standalone fully fixed boosters render fixed-theme outcomes on a configuration/theme x-axis instead of as a smooth percentile curve.
- Audit output: `backend/audit_output/<set>_<booster>_<price_mode>_<vendor>.json` (git-ignored, uploaded as a workflow artifact only when `audit_enabled=true`).
- Known risk: memory-heavy simulation (retains all valid pack totals until statistics are calculated). `simulate_and_store()` mixes too many responsibilities (matrix building, simulation, statistics, persistence, audit writing) — highest-priority refactor target, not yet done. **Verified 2026-09-17:** the function builds, per sheet, a full `matrix[mode][vendor]` price array (2 modes × (2 aggregates + N named vendors) × card count) plus a parallel `status_matrix`, all held in memory simultaneously for every sheet in the booster before any sampling starts; then `valid_packs[mode][vendor]` accumulates one float per simulated pack (default 5,000) for every mode/vendor combination before quantiles are computed. For large sheets (e.g. Collector boosters with big card pools) this is O(cards × vendors × modes) resident memory that could be streamed/aggregated incrementally instead. See DEV-31.

**`ev_statistics.py`** — Single source of truth for the empirical 100-bucket calculation. Must be used by both booster and composite calculations; must not be replaced by summary-statistic interpolation.

**`ev_engine.py`** — Removed 2026-09-18 with the obsolete SQLite sync path. It was not part of the production pipeline; the active complete-product EV implementation is `composite_evaluator.py`.

**`price_resolver.py`** — Owns direct vendor, global-cheapest, reprint, and named-vendor-average card-price resolution; preserves provenance statuses (`exact`, `finish_fallback`, `vendor_fallback`, `vendor_finish_fallback`, `reprint`, `ignored`, `unpriced`). Retains an input-alias normalization (`target_vendor == 'all'` → `'all_cheapest'`) inside `resolve_card_price()`. **Verified 2026-09-17: currently unexercised.** `PriceResolver` has exactly one caller in the whole repo (`populate_booster_ev_to_db.py`), and that caller only ever passes a real named vendor (`s` from the `NAMED_VENDORS`-filtered `sellers` set) into `target_vendor` — the `'all_cheapest'`/`'all_average'` aggregates are computed through the separate `resolve_card_price_global()`/`resolve_card_price_average()` methods, never through this branch. So the normalization is defensive dead code today, not an active caller-input alias — it only matters if a future caller calls `resolve_card_price(..., target_vendor='all', ...)` directly. Safe to keep as a guard, but the doc's prior framing ("this is caller-input aliasing") overstated it as currently live.

**`export_app_data.py`** — Exports MySQL data to `sets.json`, `sealed_products.json`, `booster_ev.json`, `pricing_reliability.json`, `arbitrage_leaderboard.json`, and `single_card_prices.json`.
- Its `resolve_card_prices()` helper (used to build `single_card_prices.json` entries for `contents.card` singles) computes `all_cheapest` (min) and `all_average` (mean) directly — it never writes `all`.
- Contains a **normalization pass** that runs after building `single_card_prices.json`, before writing it: for every entry across `byUuid`/`byName`/`byNameSet`, if a legacy `all` key exists, it is migrated to `all_cheapest` and removed. This exists to correct entries seeded by older one-off ingestion scripts (see below) without needing to manually rerun each one.
- Important limitation still present: this file's `single_card_prices.json` export loop only prices cards found in `contents.card` (direct sealed-product singles) — it does **not** cover regular booster-sheet cards. That gap is why `export_product_chase_cards.py` now resolves its own prices directly from MySQL rather than depending on this file for booster-sourced candidates.

**`export_product_chase_cards.py`** — Backend TOP 5 chase-card producer.
- Candidates come from three sources: MySQL booster sheets (`setBoosterSheetCards`/`setBoosterSheets`/`setBoosterContents`), deck contents (`deckCards`/`decks`, falling back to `precon_decks.json` when those tables are absent), and direct/variable card references in `sealed_products.json` contents.
- **Prices are resolved directly from MySQL** for every discovered candidate uuid: `load_direct_prices()` queries the `prices` table (direct mode), filtered through the `NAMED_VENDORS` allowlist. `resolve_vendor_prices()` computes `all_cheapest`/`all_average`. Product TOP 5 output intentionally contains direct-price records only; it does not emit `cheapest_reprint` lists.
- Display metadata joins `cards.uuid` to `cardIdentifiers.uuid`. `cards` supplies `name`, `setCode`, collector `number`, rarity, and types; `cardIdentifiers` supplies `scryfallId`, `scryfallIllustrationId`, and `scryfallCardBackId`. The exporter does not supplement missing metadata from another snapshot and builds artwork URLs solely from Scryfall UUIDs. The standard card-back UUID `0aeebaf5-8c7d-4636-9e82-8c27447861f7` is discarded; any other `scryfallCardBackId` enables the frontend's animated face toggle.
- The export runs in two passes: resolve all products' candidates first (building one global uuid set), then bulk-query prices/metadata once, then build the per-product/per-vendor/per-mode TOP 5 lists.

**`load_deck_tables.py`** — Creates temporary `decks`/`deckCards` tables when the MTGJSON dump omits them, loads the current `precon_decks.json` snapshot, enriches fixed deck cards with current price provenance, writes per-deck `pricingReliability` summaries.

**`sync_all_from_sqlite.py`** — Removed 2026-09-18. This obsolete SQLite path was not referenced by the MySQL-based production workflow.

**`validate_pricing_and_ev.py`** — Booster quantile skew audit, product contents-vs-EV consistency audit, ROI anomaly audit. Should be extended to validate `product_chase_cards.json` schema too.

**`validate_composite_data.py`** — Composite quantile monotonicity, vendor completeness, archetype, and variable-product audits. Not currently listed in `daily_update.py`'s stage list — run manually or add it to CI.

### Generated data ownership

| Output | Producer | Consumer |
|---|---|---|
| `sets.json` | `export_app_data.py` | set navigation and hierarchy |
| `sealed_products.json` | `export_app_data.py` + `composite_evaluator.py` | product explorer and leaderboard |
| `booster_ev.json` | `export_app_data.py` from MySQL | booster explorer and composite evaluation |
| `arbitrage_leaderboard.json` | `export_app_data.py` | Legacy leaderboard compatibility and ranking metadata |
| `product_metrics.json` | `export_product_metrics.py` | Products Overview complete-product valuation snapshot |
| `single_card_prices.json` | `export_app_data.py` | card pricing lookups; supplementary chase-card artwork |
| `product_chase_cards.json` | `export_product_chase_cards.py` | product TOP 5 chase viewer |
| `pricing_reliability.json` | `export_app_data.py` | Products Overview vendor reliability indicator |
| `pipeline_execution_logs.json` | `daily_update.py` | Admin Portal telemetry |
| `latest_pipeline_run.json` | `daily_update.py` | Direct latest-run inspection, snapshot identity |

`pricing_reliability.json` reports mode-specific reliability metrics. For `direct` records, `directExactPct` measures the share resolved from the requested vendor and exact card/finish match, while `nonExactPct` is the complementary share. For `cheapest_reprint` records, `reprintResolvedPct` measures the share resolved to a cheapest name/reprint price (including explicit neighboring sources); `unresolvedPct` is the complementary share.

## 8. Frontend Detail

### Runtime architecture

```text
App.tsx
  -> dataService.ts
  -> public/data/*.json
  -> catalogProductLoader.ts + ecommerceBoosterData.ts
  -> view components
  -> backend-generated EV, provenance, and chase-card snapshots
```

The frontend never connects directly to MySQL. Its runtime inputs are generated JSON under `public/data/`, static catalog metadata, Scryfall hierarchy metadata, and image assets under `public/products/`.

### Application shell

- **`App.tsx`** — owns top-level tabs, selected set/product, vendor, price mode, EV basis. Loads sets/arbitrage/booster-EV/reliability through `dataService`; local empty arrays are only pre-load fallbacks.
- **`types.ts`** — shared interfaces/unions for vendors, price modes, products, boosters, decks, chase cards, provenance. Changes here are cross-layer contract changes requiring backend JSON + frontend build validation.

### Data loading and caching

**`src/services/dataService.ts`** is the main frontend data boundary. Keep network loading/caching centralized here, not in view components.

- `getProductChaseCards()` — fetches `product_chase_cards.json`.
- `getLatestPipelineRun()` — fetches `latest_pipeline_run.json`.
- `getSnapshotIntegrityReport()` — checks sets/sealed-products/booster-EV loaded and non-empty, surfaces warnings.
- `getProductMetricsSnapshot()` — loads the backend-generated `product_metrics.json` complete-product valuation snapshot. It must not call `productUtils.ts` or calculate EV in the browser.
- Detailed views select product metrics from the loaded snapshot by product ID, vendor, price mode, and EV basis. There is no recursive valuation gateway.

Authoritative frontend data files: `sets.json`, `sealed_products.json`, `booster_ev.json`, `arbitrage_leaderboard.json`, `product_metrics.json`, `single_card_prices.json`, `precon_decks.json`, `product_chase_cards.json`, `pricing_reliability.json`, `latest_pipeline_run.json`, `snapshot_manifest.json`. Root `public/data/` is authoritative; `backend/public/data/` must remain absent.

### Catalog and metadata layers

- **`ecommerceBoosterData.ts`** — curated catalog products/booster variation interfaces. Curated market prices/EV must never override generated pipeline values for products with matching backend IDs.
- **`catalogProductLoader.ts`** — merges curated + generated products, dedupes by ID/UUID. Title-based packaging inference is marked `metadataSource: 'inferred'`; generated records use `'pipeline'`.
- **`setHierarchyUtils.ts`** — loads/resolves generated Scryfall set hierarchy; fallback mappings limited to offline/startup recovery.
- **`productAssetMatcher.ts`** — matches products to WPN packaging assets; guessed matches must never affect product identity, market price, or EV.

### View ownership

- **`ArbitrageLeaderboard.tsx`** (Products Overview) — displays backend complete-product metrics + reliability; must not recompute product EV, divide totals into unit EV, multiply booster EV by pack count, inspect product contents for valuation, or invent product terminology. `packs` and `cards` are display-only backend-derived counts.
- **`BoosterDetailExplorer.tsx`** (Booster Explorer) — displays booster records/curves/slots/chase cards. `booster_ev.json` is authoritative. A missing vendor/mode record must render unavailable, never borrow an unrelated mode. **State declaration order matters**: `activeBoosterName` (and any other `useState` referenced by an effect's setter) must be declared before the effect that calls its setter — a prior ordering bug caused a production `ReferenceError: Cannot access 'X' before initialization` that blanked the whole page.
- **`PackDistributionCurve.tsx`** — renders empirical 100-bucket curves from backend quantiles only. Returns an empty points array (triggering an explicit "missing data" UI) rather than fabricating a flat/synthetic curve when quantiles are absent. For boosters marked `distributionType = "discrete_fixed_configurations"`, renders per-theme fixed EV bars from backend `configurationOutcomes` instead of a percentile x-axis.
- **`BoosterSlotViewer.tsx`** — converts DB booster records into UI models; must not fabricate odds or pricing.
- **`ProductBreakdownTable.tsx`, `ProductHierarchyInspector.tsx`, `RelatedProductsHierarchy.tsx`** — structural contents/fixed-cards/decks/nested-products display via `productUtils.ts`; product-level EV comes from the backend metrics snapshot.
- **`ProductChaseCardsViewer.tsx`** — loads the direct-price record from `product_chase_cards.json` for the selected product/vendor. Resolves the product's chase-card record by matching `id`/`uuid`/`productUuid` against the snapshot's keys (case-insensitive fallback), and surfaces a specific diagnostic message (missing snapshot vs. no record for this vendor vs. no key match at all) instead of a generic empty state.
- **`ProductChaseCardsViewer.tsx`** — displays backend-generated product TOP 5 records and uses their UUID-derived artwork URLs; it does not maintain a separate curated or Scryfall lookup catalog.
- **`SpecialChaseShowcase.tsx`** — curated/editorial, not equivalent to backend chase data; must be labeled as curated.
- **`AdminPortal.tsx`** — pipeline logs, data health, admin controls; should eventually load `latest_pipeline_run.json` directly and distinguish stale/missing/failed/deployed states explicitly.

### Valuation boundary

**`productUtils.ts`** — structural product contents breakdown (card/pack/deck/variable-slot/nested resolution). It is presentation support only; complete-product EV belongs to the backend metrics snapshot.

Required policy:
- Use backend vendor/mode records when present.
- Preserve explicit zero/unresolved values when records are missing.
- Borrow neighboring card prices only when provenance is available from the backend.
- Never derive sealed-product EV from sealed market price.
- Never construct vendor prices by multiplying another vendor price.
- Never construct probability distributions from averages or fixed ratios.
- Products Overview must consume complete-product backend metrics only; it must not derive EV from `packCount`, `cardCount`, product names, or recursive contents.
- Backend pack counts must come from structured containment and an explicit booster/topper classification, not a title substring alone. A “pack” in a deck or unrelated product name is not automatically a booster unit.

**`evScore.ts`** — `calculateEvScore()` returns `null` when empirical quantiles are unavailable; never derives quantiles in the browser.

**`vendorUtils.ts`** — normalizes vendor names/booster codes, finds booster EV records, resolves display-level pricing. `normalizeVendor()` maps a caller-supplied `"all"` string to `"all_cheapest"` as input aliasing (not a data-key issue); missing named vendors must remain unavailable, never silently replaced.

## 9. Fallback and Synthetic Logic Inventory

### Backend

Fallback categories requiring explicit policy and observability:
- Vendor substitution during random booster card-slot pricing when a requested vendor row is missing (intentional booster-only borrowing).
- Finish substitution during random booster card-slot pricing between normal, foil, and etched (intentional booster-only borrowing).
- Product market-price estimates when contents are unresolved.
- Generic product-title packaging inference.
- Synthetic EV multipliers for sample/prerelease/unknown booster types.
- Curated hardcoded chase-card prices (editorial only, never product valuation).
- Scryfall set/card discovery when local candidates are unavailable (artwork only).

Recommended rule: any card-price lookup may produce an explicit borrowed-data result when a documented neighboring price is available. Non-card domains — sealed-product market prices, metadata, and product identity — must remain exact or unresolved; they must not borrow or invent a value.

### Frontend

Fallbacks requiring explicit policy:
- Empty pre-load fallback arrays now live beside their four consumers; the obsolete `src/data.ts` module was removed after migration.
- Static catalog products when generated products are unavailable.
- Title-based packaging inference (marked `inferred`).
- Scryfall hierarchy fallback mappings (offline/startup recovery only).
- Curated Special Chases and Scryfall discovery (artwork/editorial only).
- Vendor input aliases (`"all"` → `"all_cheapest"`) and missing-vendor display behavior.
- Default card-count/pack-count metadata.

Allowed fallbacks: image URL construction from an existing Scryfall ID; display-only formatting/sorting; explicit neighboring card-price provenance from backend data; offline hierarchy recovery when generated hierarchy data is unavailable.

Disallowed fallbacks: sealed market price used as singles EV; static product price used as generated EV; vendor prices generated by percentage multipliers; reprint prices generated by a global discount multiplier; quantiles generated in the browser from summary values; curated chase prices used as product valuation.

## 10. Completed Improvements

Long-standing:
- Replaced synthetic frontend EV curves with backend-owned empirical data.
- Removed browser-side composite Monte Carlo simulation.
- Removed frontend vendor/reprint percentage multipliers.
- Removed fabricated card, foil, and sealed-product EV fallbacks.
- Added endpoint-preserving 100-point empirical curves.
- Added booster endpoint validation against `evMin`/`evMax`.
- Added cross-file output validation for products, chase cards, decks, reliability, telemetry.
- Added backend-generated product chase-card output.
- Added deck card-price provenance and reliability telemetry.
- Added atomic generated-data publication in the workflow.
- Added audit artifact reporting and existence checks.

Most recent session (2026-09-15):
- **Fixed a production-breaking runtime crash**: `BoosterDetailExplorer.tsx` referenced `setActiveBoosterName` in an effect before the corresponding `useState` was declared (temporal dead zone), causing a blank white page in production. Fixed by reordering the declaration.
- **Fixed workflow deployment ordering**: Vercel deploy now runs from the staged `public/data/` working tree before the `data-sync` branch switch; added a "verify deployable generated data bundle" step that fails the workflow if `product_chase_cards.json` / `latest_pipeline_run.json` / `pipeline_execution_logs.json` are missing or empty.
- **Fixed the legacy `all` vendor key** across the entire generated-data path: four one-off ingestion scripts (`ingest_mtgjson_precons.py`, `ingest_sld_decks.py`, `ingest_unsanctioned_decks.py`, `deck_price_provenance.py`) and one JS script (`ingest_final_fantasy_commander.cjs`) were writing `all` instead of `all_cheapest` (and `deck_price_provenance.py` incorrectly equated `all`/`all_average`, the same value). Fixed all writers to emit `all_cheapest` (as true minimum) and `all_average` (as true mean) separately. Added a normalization pass in `export_app_data.py` that migrates any already-persisted legacy `all` key to `all_cheapest` across the full `single_card_prices.json` index. Removed every remaining `all`-key read in generated-data consumers (`export_product_chase_cards.py`, `composite_evaluator.py`, `validate_composite_data.py`, `validate_pricing_and_ev.py`).
- **Fixed the real architectural cause of empty chase cards**: `export_product_chase_cards.py` previously depended entirely on `single_card_prices.json` for pricing, but that file only ever indexed `contents.card` singles and precon/deck-seeded cards — never regular booster-sheet cards, which are the majority of real chase-card candidates. Rewrote the exporter to resolve prices directly from MySQL (`prices` + `lowest_prices` tables) for every discovered candidate uuid, mirroring the same tables `populate_booster_ev_to_db.py` already uses successfully.
- **Fixed the Murders at Karlov Manor Play Booster curve bug**: an unfiltered seller-discovery step in `populate_booster_ev_to_db.py` allowed a stray provider string (observed as literally `"all"`) to be treated as a real named vendor, and a backwards `DELETE ... WHERE vendor = 'all_cheapest'` cleanup query deleted the correct canonical row instead of the legacy one. Added a `NAMED_VENDORS` allowlist and fixed the DELETE to target `'all'`.
- **Fixed a Windows console Unicode crash that was silently aborting the pipeline** (see DEV-26): `export_app_data.py`'s very first line, `print("▶ 1. Exporting sets.json...")`, raised `UnicodeEncodeError: 'charmap' codec can't encode character '\u25b6'` on a default Windows `cp1252` console, confirmed live via `pipeline_execution_logs.json` (run `run-2026-09-12-192927`, `export_app_data.py` exit code 1 after 0.21s). This cascaded into `composite_evaluator.py` and `validate_pricing_and_ev.py` failures, leaving production stale/missing `product_chase_cards.json` and `latest_pipeline_run.json` (both 404 live) — the direct cause of missing Top-5 chase cards and curves for products like Murders at Karlov Manor Collector Booster (see DEV-27). Replaced all Unicode symbols in `export_app_data.py`/`daily_update.py` with ASCII, and hardened `daily_update.py` to force UTF-8 on its own console streams and on every subprocess it launches.
- **Added quick-test pipeline mode**: `QUICK_TEST_LIMIT` env var / `--quick-test-limit` CLI flag caps `populate_booster_ev_to_db.py` and `sync_live_sealed_prices.py` to N sets/products for fast iteration, with a hard workflow guard preventing quick-test output from ever being published.
- **Consolidated documentation**: merged `PROJECT_REVIEW.md`, `backend/BACKEND_REVIEW.md`, and `FRONTEND_REVIEW.md` into this single file.

## 11. Outstanding Data-Quality Diagnostics

The most recent full pipeline run's `validate_pricing_and_ev.py` stage surfaced three categories of findings that have **not yet been triaged**. These are diagnostics, not confirmed bugs — but they must be investigated before the dataset can be considered fully trustworthy, per the "Known diagnostic warnings" principle: a workflow completing successfully does not by itself mean the data is fully correct.

| Category | Count (last observed run) | Meaning | Status |
|---|---:|---|---|
| Booster Quantile Outlier Skews | **0 on audited run `run-2026-09-18-103326`** | Quantile mean deviates >35% or <70% from the analytical `evAverage` for that booster/vendor/mode. | Closed for the current published run. The prior findings were caused by the validator's naive arithmetic mean over endpoint-preserving buckets; weighted validation now passes. |
| Product Contents vs EV Mismatches | **584 on audited run `run-2026-09-18-103326`** | A sealed product's stored total EV does not reconcile with the EV implied by walking its `contents` (packs/cards/decks/variable slots). | Triage found compact `precon_decks.json` display-name lookups resolving to zero; validator coverage fix added for slugs, names, and aliases. Re-run the validator to measure the reduced count; remaining mismatches still need category-level review. |
| Extreme ROI Pricing Anomalies | **183 on the current local validator run** | Product ROI (EV vs. market price) is an extreme outlier, e.g. -99%+ or implausibly high. | Count discrepancy fixed by using one canonical diagnostics object for console, return, and JSON output. Triage found mostly deck/mixed-composite products with stored EV matching contents but implausible market prices; snapshots have no price-freshness timestamps, so stale-price attribution remains unproven. |

Next action for each: rerun the validator after the compact-deck coverage fix, then classify the residual EV mismatches. The remaining validator work is data-quality triage, not evidence that the pipeline failed; the audited run itself completed successfully.

**2026-09-19 triage update:** The ROI count mismatch is resolved by `build_diagnostics()` in `validate_pricing_and_ev.py`; the current local run reports 183 ROI records and the serialized issue list also contains 183. The validator now indexes compact preconstructed-deck slugs, display names, and aliases, addressing a confirmed source of false EV mismatches. `dataService` contract validation now covers required files, vendors, price modes, curve lengths/endpoints, p05/p95 fields, and cross-file product IDs. The Jumpstart report now records fixed-card manifest counts and zero variance, with focused regression tests added. These source changes still require a post-change audited workflow before generated snapshots are considered updated.

### 2026-09-18 FIN product-curve investigation

The production UI showed **Final Fantasy Collector Booster Pack** with a first curve point near `$0.90`, while its summary cards reported a minimum around `$4.23`; Minimum and Bottom 5% were also identical. The curve diagnostic for **Final Fantasy Prerelease Pack** identified the active source as `FIN/play`, despite the selected product not being a Play Booster. The screenshot's six first-point values closely matched the corresponding FIN Play Booster vendor minima, proving that the rendered curve belonged to the wrong booster identity rather than to the selected Collector product.

The checked local snapshot was internally consistent before frontend selection: FIN Collector `all_cheapest/direct` had `min=$4.17`, `p05=$8.85`, with `quantiles[0]=$4.17` and `quantiles[4]=$8.85`. This isolated the mismatch to frontend data plumbing and an incomplete product-metrics schema, not Monte Carlo endpoint generation.

Confirmed root causes:

1. `RelatedProductsHierarchy.tsx` assigned `sp.boosterName || 'play'`, but raw `sealed_products.json` records do not normally carry top-level `boosterName`. Collector, prerelease, and other products could therefore be mislabeled as Play Boosters.
2. The hierarchy's mapped selected-product object discarded `quantilesByVendor` and the backend `metricsByVendor` summaries. The detail view consequently lost the product-owned curve and percentile values during selection.
3. `PackDistributionCurve.tsx` diagnostics allowed a fallback to `booster_ev.json` even when reporting `source=sealed_products.json.quantilesByVendor`; rendering did not allow the same fallback for composite products. A diagnostic could therefore say `status=valid` for 100 Play Booster points while the selected product curve was unavailable.
4. `product_metrics.json` omitted p05/p95. `BoosterDetailExplorer.tsx` compensated by assigning `min5Ev = totalEvMin` and `max5Ev = totalEvMax`, directly causing identical Minimum/Bottom-5% values and conflating percentile statistics.
5. Product `evScore` and `breakevenPercentile` were generated only as top-level primary-curve values. Frontend code manually exposed them only for `all_cheapest`, leaking backend primary-vendor policy into presentation code.

Implemented corrections:

- Direct pack identity is derived from authoritative `contents.pack[0].code`; an absent identity remains empty rather than defaulting to `play`.
- Product selection passes only the selected product's `quantilesByVendor`; no booster curve is substituted for missing product quantiles.
- Selected-vendor min/p05/median/p95/max values come only from `metricsByVendor[selectedVendor]`; top-level primary-vendor values are not used as vendor fallbacks.
- `composite_evaluator.py` computes EV score and breakeven percentile for every vendor curve. `export_product_metrics.py` exports those values together with explicit `totalEvMin5` and `totalEvMax5` fields for every vendor.
- `daily_update.py` and `test_product_metrics_contract.py` require and validate the expanded percentile/score contract.
- Curve diagnostics now inspect the same source used by rendering: booster quantiles only for a verified single-booster leaf, otherwise product `quantilesByVendor`.
- Packaging badges remain presentation-only labels/icons. They do not select curves, calculate EV, or authorize pricing fallback; name-based badge refinements must never be used as product identity or valuation input.

Local validation completed: the Vite production build passes, the focused EV-statistics unit tests pass with the repository interpreter/import path, the per-vendor profit-metric helper passed runtime assertions, and all modified Python files compile. The generated snapshots have not been manually edited. A normal full pipeline run is still required to regenerate and publish `sealed_products.json` and `product_metrics.json`, then verify FIN Collector and Prerelease values in the deployed UI.

### 2026-09-17 roadmap re-verification session

A full re-read of the Numbered Roadmap against the actual source tree, triggered by suspected data/commit loss from recent git operations. Findings:

1. **DEV-04 and DEV-11 were incorrectly marked DONE.** `BoosterDetailExplorer.tsx` still contains a live `activeBooster.evAverage * productPacksCount` synthetic-multiplier fallback (~line 579), and both `BoosterDetailExplorer.tsx` (line 465) and `ProductBreakdownTable.tsx` (line 533) still call `resolveRecursiveProductAudit` and use its output as an EV value, not just structural display data — in `ProductBreakdownTable.tsx` (line 555) the recursive audit result is preferred **over** the backend arbitrage record. Both rows have been changed to `REGRESSED (2026-09-17)` above with the exact evidence. `ArbitrageLeaderboard.tsx` (Products Overview) was checked and is clean — it is detail views specifically that regressed.
2. **DEV-07 (snapshot identity) documentation was already accurate.** Confirmed `dataService.ts:183` (`getSnapshotIntegrityReport`) only checks that `sets`, `sealedProducts`, and `boosterEv` are non-empty; it never compares `pipelineRunId` across files. Confirmed `booster_ev.json` has no `pipelineRunId`/`schemaVersion` field at all, and `product_metrics.json` only carries a per-record `schemaVersion` (no `pipelineRunId`). So mixed-generation snapshots genuinely cannot be detected today. No status change needed — item was already correctly `IN PROGRESS`.
3. **Unrelated but important: uncommitted local working-tree changes were found** in `backend/populate_booster_ev_to_db.py` and `backend/test_jumpstart_collation.py` that are not part of any commit (not in `HEAD`, not staged). They change `select_sheet_indices` so a fixed-sheet card-count mismatch now silently resizes the fixed indices with `np.resize` and emits a `RuntimeWarning`, instead of raising `ValueError`. This directly weakens the DEV-20 Jumpstart guarantee ("Fixed card counts are deterministic") by turning a hard collation-config error into a silently-tolerated, data-altering warning. This diff should be reviewed and either committed intentionally or discarded (`git restore backend/populate_booster_ev_to_db.py backend/test_jumpstart_collation.py`) before the next pipeline run — it is exactly the kind of unreviewed local edit that a stray `git commit`/`push`/`pull` could otherwise lose or accidentally publish.
4. **Repo has several backup/recovery branches** (`backup/main-2026-09-17-before-local-commit`, `backup/main-after-recovery-511976a`, `backup/main-before-f147-promotion`, `backup/main-before-local-fix-merge`, `backup/main-dbce-before-source-recovery`, `recovery/f147-source-dbce-data`, and `data-sync`-side equivalents), consistent with the user's account of a prior data-loss incident. These predate this session and were not further audited here (out of scope for this pass); confirming `main`'s current history against `recovery/f147-source-dbce-data` is recommended as a follow-up if there is still concern about lost commits beyond the DEV-27 incident already documented above.

## 12. Numbered Roadmap

This is the master development list — the source of truth for what is done, in progress, or still broken.

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
| DEV-04 | Frontend fallback removal | P0 | FIXED (2026-09-17, see DEV-29) | Synthetic multipliers, invented card prices, market-price-as-EV, and browser simulations removed from active paths. | Was regressed earlier in this session: `BoosterDetailExplorer.tsx` (~line 579) fell back to `Number((activeBooster.evAverage * productPacksCount).toFixed(2))` whenever `gatewayMetrics` was unavailable. Fixed in DEV-29 — see that row for the exact change and verification. |
| DEV-05 | Chase-card ownership | P0 | DONE | Product TOP 5 cards come from `product_chase_cards.json`, resolved directly from MySQL price tables; curated Special Chases remain editorial. | Viewer renders backend snapshot with explicit diagnostics when missing; exporter rewritten to price booster-sheet candidates, not just `single_card_prices.json` entries. |
| DEV-06 | Output validation | P0 | IN PROGRESS | Validate generated JSON shape, endpoints, cross-file references, telemetry, decks, reliability, and chase cards. | Daily runner passes `output_bundle`, `output_semantics`, and telemetry validation; `pricing_validator_diagnostics.json` is required and published. ROI reporting is now count-consistent; compact precon lookup coverage was fixed locally. Remaining: rerun and triage residual EV mismatches. |
| DEV-07 | Snapshot identity | P0 | DONE (2026-09-18) | Add shared `pipelineRunId`, source commit, generated timestamp, and schema version to generated outputs. | Audited run `run-2026-09-18-103326` published `snapshot_manifest.json` with `pipelineRunId`, `sourceCommit` matching `main` (`dbdec7a...`), `generatedAt`, `schemaVersion`, and `auditEnabled: true`; `dataService` compares the manifest with `latest_pipeline_run.json`. |
| DEV-08 | Frontend data gateway | P0 | DONE | Add a backend-generated complete-product metrics snapshot and make every valuation view consume it through `dataService`, with no browser-side recursive EV calculation. | `product_metrics.json` is loaded through the frontend data boundary; Products Overview and detailed product views select snapshot records by product/vendor/mode. |
| DEV-09 | Frontend contract validation | P1 | FIXED LOCALLY | Validate JSON schemas and cross-file IDs at the `dataService` boundary. | `dataService` now checks required files, snapshot identity, vendors, price modes, 100-point curves, endpoints, p05/p95 fields, and product IDs across `product_metrics.json` and `sealed_products.json`. |
| DEV-10 | End-to-end value checks | P1 | NEXT | Compare UI EV, market price, curve, and chase cards against generated JSON. | Playwright checks assert `displayed value === snapshot value` for representative products. |
| DEV-11 | Recursive EV consolidation | P1 | FIXED (2026-09-17, see DEV-29) | Remove recursive product valuation from React. Retain only structural containment/card/deck display helpers; backend owns complete-product EV. | Was regressed earlier in this session: `BoosterDetailExplorer.tsx:465` and `ProductBreakdownTable.tsx:533` used `resolveRecursiveProductAudit`'s EV totals as a live fallback/first-choice value instead of only structural display data. Fixed in DEV-29 — both files now only use the recursive audit for structural containment/card/deck breakdown display; EV totals come from the canonical backend record only. `ArbitrageLeaderboard.tsx` (Products Overview) was already clean and required no change. |
| DEV-12 | Reproducibility | P1 | NEXT | Record source versions, commit SHA, sample count, audit flag, and seed policy. | `latest_pipeline_run.json` contains reproducibility metadata. |
| DEV-13 | Workflow audit | P1 | DONE (2026-09-18) | Run GitHub Actions with `audit_enabled=true` after source changes. | Audited run `run-2026-09-18-103326` completed successfully and published audit samples; no quick-test limit was used. |
| DEV-14 | Catalog provenance | P1 | DONE | Mark generated catalog metadata as `pipeline` or `inferred`; avoid invented dates/blocks. | Catalog loader tests distinguish inferred metadata. |
| DEV-15 | Performance measurement | P2 | NEXT | Measure startup, JSON parse time, simulation memory, and stage duration. | Optimization decisions are based on recorded measurements. |
| DEV-16 | Backend decomposition | P2 | NEXT | Split simulation, statistics, audit writing, and MySQL persistence. | Focused tests preserve summary, sample, and bucket behavior. |
| DEV-17 | Legacy deletion | P2 | IN PROGRESS | Remove unreferenced ingestion scripts, SQLite paths, prototype tests, and empty files after history checks. | SQLite/EV path and confirmed dead candidates are removed; `src/data.ts` was migrated and deleted. Remaining work is the one-off ingestion review and local-artifact cleanup. |
| DEV-18 | Operational dashboard | P2 | NEXT | Display latest pipeline status, snapshot identity, fallback rates, and unresolved counts in Admin Portal. | Admin Portal explains stale, missing, failed, and deployed states. |
| DEV-19 | Vendor lifecycle | P1 | NEXT | Centralize vendor definitions and make add/remove operations contract-driven. | A vendor change updates backend resolution, generated outputs, frontend controls, validation, provenance, and documentation without scattered edits. |
| DEV-20 | Jumpstart collation | P0 | IN PROGRESS (2026-09-18) | Interpret MTGJSON Jumpstart `fixed` sheet metadata correctly through a centralized `booster_collation_overrides.json` workaround because the MySQL schema omits the optional field. Fixed card counts are deterministic; one-card variable slots can be exact-enumerated; larger random slots remain sampled. Fully fixed Jumpstart-style boosters expose discrete fixed-theme outcomes for frontend charting. | Weekly corpus sync validates 622 fixed sheets across 869 sets; the audited report contains 530 configurations and 0 warnings. Added fixed-card manifest multiplicity and zero-variance assertions to the exporter/tests. Remaining: execute the focused tests and regenerate after source changes. |
| DEV-21 | Curve snapshot integrity | P0 | IN PROGRESS | The published curve data still needs cross-layer validation. | The 2026-09-18 FIN investigation found a real frontend curve-selection mismatch: raw sealed products without top-level `boosterName` defaulted to `play`, selected-product mapping dropped product curves/statistics, and diagnostics inspected a different fallback source than rendering. Fixed locally under DEV-35; pending full pipeline publication and deployed FIN verification. |
| DEV-22 | Chase-card visibility | P0 | PARTIALLY_FIXED | Ensure every product that has backend TOP 5 chase data displays it without silent empty states or stale vendor-mode mismatches. | Full audited run exported chase data for 4,137 products. Backend coverage is regenerated; remaining work is browser-level representative-product verification. |
| DEV-23 | Booster vendor discovery integrity | P0 | DONE (2026-09-18) | Prevent unfiltered/garbage seller strings from AllPricesToday becoming fake booster vendors; fix the backwards legacy-row cleanup query. | Full audited output contains 10 MKM `all_cheapest` booster rows after the allowlist and cleanup fixes. |
| DEV-24 | Quick-test pipeline mode | P0 | DONE | Add an optional fast test-run mode that limits the two heaviest stages to N sets/products, never publishing. | `QUICK_TEST_LIMIT` implemented in `daily_update.py`, `populate_booster_ev_to_db.py`, `sync_live_sealed_prices.py`; workflow input added; publish/deploy steps gated off in quick-test mode. Validated via `--dry-run`; not yet exercised in a real GitHub Actions run. |
| DEV-25 | Validator diagnostic triage | P1 | IN PROGRESS (2026-09-17) | Investigate the 452/752/569 findings from `validate_pricing_and_ev.py` (see Section 11) and classify each as a real bug or an expected outlier. | Root cause found for the 452 "Booster Quantile Outlier Skews": the validator itself compared each booster's true `evAverage` against a naive arithmetic mean of the 100-point quantile curve, which is a biased statistic (see DEV-28). Fixed the validator to use a properly weighted mean (`bucket_weights()`) instead — re-running against current data now reports **0** booster skew records (was 452), confirming these were false positives, not real booster data bugs. The validator now also writes the full untruncated issue lists to `public/data/pricing_validator_diagnostics.json` for offline triage instead of only printing the top 8–10. The 755 "Product Contents vs EV Mismatches" and 569 "Extreme ROI Anomalies" counts are still current-data counts from the *pre-DEV-28-fix* `sealed_products.json`; a full pipeline re-run is required to confirm how much of the 755 figure was the same root cause (early evidence: the worst offenders are all large multi-pack case/box products, where the bias compounds over many packs, e.g. Antiquities Booster Box Case stored $84,305.30 vs recomputed $59,223.60). The 569 ROI anomalies look like a separate issue (EV near-zero against a real market price, e.g. several Secret Lair drops/bundles) and still need real triage. |
| DEV-26 | Windows console Unicode crash | P0 | PARTIALLY_FIXED → corrected 2026-09-17 | `export_app_data.py` and `daily_update.py` printed/logged Unicode symbols (`▶`, `═`, `✔`, `✘`) that crash with `UnicodeEncodeError: 'charmap' codec can't encode character` on a default Windows `cp1252` console. This silently aborted `export_app_data.py` on its very first line, cascading into `composite_evaluator.py` and `validate_pricing_and_ev.py` failures (confirmed live via `pipeline_execution_logs.json`, run `run-2026-09-12-192927`). This class of bug recurs whenever a new Unicode symbol is added to console output. | **The original DONE/FIXED claim was inaccurate.** A 2026-09-17 re-audit found `export_app_data.py` still had 8 raw `✔`/`✘` characters (never actually removed — only `daily_update.py`'s own console/subprocess UTF-8 forcing was hardened, which is why the pipeline appeared to keep working, but any standalone/non-`daily_update.py` invocation of these scripts still crashes), plus previously-undetected instances in `composite_evaluator.py`, `sync_all_from_sqlite.py`, and `validate_composite_data.py`. All five files fixed to plain ASCII (`[OK]`/`[ERROR]`/`[PASS]`/`[FAIL]`) and verified via a direct `python -c` scan of every `backend/*.py` file plus a real standalone run of `validate_pricing_and_ev.py` on Windows (previously crashed at the first `✔` print, now completes and writes its diagnostics JSON). |
| DEV-27 | Cascading chase-card/curve unavailability | P0 | FIXED | Product Top-5 chase cards and empirical curves for specific products (e.g. Murders at Karlov Manor Collector Booster) appeared missing/stale on production even after a pipeline run completed successfully. Confirmed root cause 2026-09-15: Vercel's Git integration "Production Branch" was set to `main`, and `main` had a stale, manually-committed copy of pipeline-generated `public/data/*.json` (last touched 2026-09-12). Any push to `main` re-deployed that stale snapshot, racing against and sometimes overriding the workflow's fresh `data-sync` push/CLI deploy. | Fixed by (1) repointing Vercel's Production Branch setting to `data-sync` (confirmed live: production now serves `run-2026-09-15-092934`), (2) removing the now-redundant/racing `amondnet/vercel-action` CLI deploy step from the workflow, and (3) untracking the stale generated JSON (and the unused `mtg.sqlite`) from `main` via `.gitignore` so it can never again serve as an accidental deploy source. |
| DEV-28 | Quantile endpoint-weighting bias | P0 | FIXED (2026-09-17) | `empirical_quantiles()` stores the exact min and exact max sample as single-observation endpoints (bucket 1 and bucket 100 of 100), while the 98 interior buckets are each the mean of ~1% of samples. `composite_evaluator.py` treated all 100 buckets as equally likely — both when arithmetically averaging a single-pack product's curve and when Monte-Carlo-resampling multi-pack products via `np.random.randint(0, 100, ...)` — giving the two singleton endpoint samples ~50x too much weight. This biased every composite/product-level EV upward relative to the same booster's true `evAverage`, confirmed live on The Hobbit Collector Booster Pack (product-level $51.75 vs true booster-level $45.83, a $5.92/12.9% gap) and is the root cause behind DEV-25's 452 "quantile skew" and a large share of the 752 "contents vs EV mismatch" diagnostics. | Added `bucket_weights()` to `composite_evaluator.py` (and a mirrored copy in `validate_pricing_and_ev.py`) that assigns the true `1/simulatedPacks` probability to the two endpoint buckets and spreads the remainder across the 98 interior buckets; single-guaranteed-pack products now use the booster's exact `evAverage` directly instead of resampling at all. Verified numerically: reconstructed single-pack mean now matches `evAverage` exactly (was $51.81 arithmetic-mean-biased, now exact); a 13-pack box mean landed within Monte Carlo noise of the analytical `evAverage × 13` (was structurally biased before). Still needs a full pipeline re-run to regenerate `sealed_products.json`/`product_metrics.json`/`arbitrage_leaderboard.json` with the fix and confirm the DEV-25 752-count drops accordingly. |
| DEV-29 | Frontend EV fallback closure | P0 | FIXED (2026-09-17) | `BoosterDetailExplorer.tsx` (~line 579) fell back to `activeBooster.evAverage * productPacksCount` (a synthetic multiplier) or the recursive `productAudit.totalEv` whenever the backend `product_metrics.json` gateway record was unavailable — the exact anti-pattern DEV-04/DEV-11 claimed was removed. | Removed both fallbacks; `productAvgEv`/`productMid90Ev`/`productMin5`/`productMax5`/`productMin`/`productMax` now resolve only from `activeProduct.totalEv*` (backend composite snapshot) or `canonicalMetrics` (product_metrics.json gateway), with an explicit `evGatewayUnavailable` banner shown instead of a silently recomputed number when neither is present. `ProductBreakdownTable.tsx`'s total-EV row (used standalone and inside `RelatedProductsHierarchy.tsx`) was similarly fixed to prefer the canonical `product_metrics.json` record over the recursive audit total; verified live in-browser that all panels (Hierarchy, Breakdown, Scorecards, Products Overview) now agree on the same $51.75 for The Hobbit Collector Booster Pack. `resolveRecursiveProductAudit` itself is intentionally still called in both files for structural containment/display data (packs/cards/decks breakdown), per the DEV-11 contract — only its EV totals were disqualified as an authoritative source. |
| DEV-30 | Legacy backend trio (`ev_engine.py`/`sync_all_from_sqlite.py`/`recompute_arbitrage_leaderboard.py`) | P2 | DONE (2026-09-18) | Remove the obsolete recursive EV/SQLite path after reference and history checks. | `scripts/recompute_arbitrage_leaderboard.py`, `sync_all_from_sqlite.py`, and `ev_engine.py` are absent; repository and workflow reference checks found no remaining active callers. |
| DEV-31 | `simulate_and_store()` decomposition | P2 | NEXT | Split `populate_booster_ev_to_db.py`'s `simulate_and_store()` into matrix-building, sampling, statistics, and persistence stages; reduce peak memory by not holding every mode/vendor price matrix and every mode/vendor's full `valid_packs` sample list in memory simultaneously. | Verified 2026-09-17: confirmed the function currently builds `matrix[mode][vendor]`/`status_matrix[mode][vendor]` per sheet (2 modes × (2 aggregates + N vendors) × sheet card count) before any sampling, then separately accumulates `valid_packs[mode][vendor]` (default 5,000 floats each) for every mode/vendor pair before computing quantiles. Focused unit tests should preserve summary/sample/bucket behavior across the refactor (ties into DEV-16). |
| DEV-32 | Frontend anti-pattern sweep (dataService.ts / productUtils.ts) | P0 | FIXED (2026-09-17) | `dataService.ts`'s `injectSldFallbackDecks()` hardcoded 8 Secret Lair decks (16 with foil editions) with forced $0 price/EV, all of which already exist correctly in `precon_decks.json` — and because of insertion-order-dependent index building in `productUtils.ts`'s `getOrBuildPreconIndex()` (`bySetExactName.set()` has no `if (!has())` guard), the fake $0 entries were silently overwriting the real ones for every one of those 8 decks in every consumer of `findMatchingPreconDeck`. Separately, `productUtils.ts`'s `resolveRecursiveProductAudit()` accumulated `totalMinEv`/`totalMid90Ev`/`totalMax5Ev`/`totalMaxEv` for multi-pack contents by linearly multiplying a single pack's order-statistic value by pack count — mathematically invalid for anything but the mean (same root-cause class as DEV-28, on the frontend structural-audit side). | Removed `injectSldFallbackDecks()` and all 3 call sites entirely (all 8 decks already have correct backend data, confirmed by direct `precon_decks.json` lookup). Removed the linear min/mid90/max scaling for random (pack/variable-slot) content in both the direct-packs section and the unmapped-sealed-subitem section of `resolveRecursiveProductAudit()`, replaced with comments pointing to the real backend source (`product_metrics.json`/arbitrage record, already preferred per DEV-29); deterministic content (cards/decks, where min=avg=max is mathematically correct) is unaffected. `tsc --noEmit` clean after both changes. |
| DEV-33 | ROI validator authority correction | P1 | FIXED LOCALLY (2026-09-17) | `validate_pricing_and_ev.py` must calculate ROI anomalies from the backend authoritative complete-product `storedEv`, not from a partial recursive contents walk that can omit decks or nested sealed products. | Changed the validator to use `storedEv` for ROI and retain `calcEv` only as diagnostic context. Against the current local snapshot, ROI anomalies dropped from 569 to 186 and contents/EV mismatches from 755 to 584; the remaining 186 require genuine triage. This correction is not yet reflected in deployed `data-sync` because no new pipeline publication has been run. |
| DEV-34 | Frontend snapshot identity warnings | P0 | DONE (2026-09-18) | `dataService.getSnapshotIntegrityReport()` must inspect product metrics identity in addition to checking that snapshots are non-empty. | Manifest loading and comparison are implemented; the published audited run contains matching manifest/run identity and source commit metadata. |
| DEV-35 | Product curve identity and vendor metrics | P0 | FIXED LOCALLY (2026-09-18) | Product selection must preserve the selected sealed product's empirical curve and vendor statistics without defaulting an unknown booster identity to `play`, substituting a booster/vendor curve, or aliasing min/max to p05/p95. | FIN evidence and all five root causes are recorded in Section 11. `RelatedProductsHierarchy.tsx` derives direct pack identity from `contents.pack[].code`, passes only product-owned `quantilesByVendor`, and preserves selected-vendor statistics without top-level fallback. `PackDistributionCurve.tsx` diagnostics use the renderer's source. `composite_evaluator.py` and `product_metrics.json` now provide p05, p95, EV score, and breakeven percentile for every vendor; validators require the expanded contract. Vite build, focused EV-statistics tests, helper assertions, and Python compilation pass. Pending: full pipeline regeneration and deployed FIN verification. |

### Frontend single-source-of-truth validation

The frontend validation path should prove this chain:

```text
GitHub pipeline -> generated public/data snapshots -> dataService validation and cache
  -> one product metrics gateway -> view components -> displayed value
```

For each representative product, validate:

1. The product ID exists in `sealed_products.json`.
2. Its vendor and price-mode record exists where required.
3. The selected curve has exactly 100 points.
4. Curve point 1 and point 100 match the backend minimum and maximum.
5. Fully fixed booster products render backend `configurationOutcomes` by fixed theme/configuration rather than a percentile x-axis.
6. Curve points 5 and 95 match the selected vendor's backend p05 and p95 values.
7. Displayed EV, EV score, and breakeven percentile equal the selected vendor's backend snapshot values.
8. Displayed market price is not used as singles EV.
9. Chase cards match `product_chase_cards.json`.
10. Deck cards and prices match `precon_decks.json` and `single_card_prices.json`.
11. All loaded files share the same `pipelineRunId` and `schemaVersion`.
12. Missing values produce an explicit unavailable state, never a synthetic estimate or another booster/vendor's data.

Recommended representative fixtures: one single booster; one booster box or bundle; one nested case; one preconstructed deck; one variable-content product; one product with a missing vendor or quantile record.

### DEV-20 investigation order: Jumpstart collation

Current fully fixed Jumpstart-style booster products that should render fixed-theme/configuration outcomes for the standalone booster pack only:

| Set | Configurations | Fixed-chart condition |
|---|---:|---|
| `J22` | 121 | One 20-card fixed sheet per configuration. |
| `J25` | 121 | One 20-card fixed sheet per configuration. |
| `JMP` | 121 | One 20-card fixed sheet per configuration. |
| `MSH` | 51 | One 20-card fixed sheet per configuration. |
| `TLE` | 66 | One 20-card fixed sheet per configuration. |

For these sets, the standalone booster pack x-axis is booster theme/configuration, not percentile. Boxes, cases, bundles, and multipacks must **not** use this chart mode; they still use backend product-level Monte Carlo quantiles because they contain multiple independently selected fixed-theme boosters.

Mixed Jumpstart-style boosters with a fixed theme plus exactly one variable card are exact-enumerated when the total outcome space stays under `MAX_EXACT_CONFIGURATION_OUTCOMES = 25000`. This replaces booster-level random sampling with deterministic weighted outcomes for that pack type, but it does **not** disable product-level Monte Carlo for boxes/cases/multipacks containing those packs.

1. Enumerate all current Jumpstart set codes from `public/data/booster_ev.json` and the raw MTGJSON JSON source.
2. Review each Jumpstart sheet mix and classify sheets as `fixed`, `variable`, or `unknown`.
3. Generate the centralized `public/data/booster_collation_overrides.json` overlay weekly from MTGJSON JSON metadata and publish it to the `collation-metadata` branch rather than modifying the MySQL dump or committing the overlay to `main`.
4. Apply that overlay in `load_booster_config_from_db` after the normal MySQL load.
5. During simulation, treat fixed entries as deterministic card selections/counts rather than weighted random draws.
6. Keep wildcard rare/mythic or other explicitly variable sheets random.
7. Model the usual 10 land cards as fixed only when the MTGJSON source or reviewed override says so; do not infer this solely from the booster name.
8. Add a deterministic Jumpstart fixture test and an audit assertion that fixed portions do not create artificial variance.
9. Regenerate Jumpstart outputs in GitHub Actions and compare EV/variance against the raw MTGJSON configuration.

## 13. Next 5 Steps

1. **Rerun the validator after compact-deck coverage repair** and record the residual EV mismatch count.
2. **Add Playwright checks** for representative EV, market price, curve endpoints, and chase-card snapshots.
3. **Verify deployed FIN curves** against the latest audited manifest and selected product metrics.
4. **Refactor `simulate_and_store()`** with focused curve-contract tests and memory measurements.
5. **Run the final focused suite and audited workflow** after the source changes are published.

## 14. Vendor Add/Remove Procedure

Vendor changes are cross-layer contract changes, not simple UI edits. Vendor definitions live in: `price_resolver.py`, `populate_booster_ev_to_db.py`, `composite_evaluator.py`, `export_product_chase_cards.py`, `load_deck_tables.py`, `ev_engine.py`, `vendorUtils.ts`, `types.ts`, `PackDistributionCurve.tsx`, `AdminPortal.tsx`, and this document.

### Adding a vendor

1. Confirm the upstream price feed exposes the vendor, finish keys, currency, and product/card identifiers.
2. Add the vendor to the canonical `NAMED_VENDORS` allowlist (`populate_booster_ev_to_db.py` and `export_product_chase_cards.py`) and any other backend vendor registry.
3. Update price ingestion and resolver logic.
4. Include it in booster simulation matrices and seller discovery rules.
5. Include it in composite fixed-card and variable-slot resolution.
6. Include it in chase-card and deck provenance output.
7. Add it to generated-output validation and reliability aggregation.
8. Add it to frontend `Vendor` types, controls, curve series, labels, and source-status handling.
9. Add representative tests for exact, finish fallback, vendor fallback, reprint, and unpriced cases.
10. Regenerate data through GitHub Actions and verify the new vendor appears consistently in `booster_ev.json`, `sealed_products.json`, `pricing_reliability.json`, `product_chase_cards.json`, and deck provenance.

### Removing a vendor

1. Confirm no active price feed, generated snapshot, workflow, or UI depends on the vendor.
2. Decide whether historical generated data remains readable; preserve a compatibility alias only if required.
3. Remove it from the `NAMED_VENDORS` allowlist, resolver loops, exporter lists, validation expectations, and frontend controls.
4. Remove or migrate stored provenance records using that vendor.
5. Regenerate all snapshots and verify no records or UI controls reference the removed key.
6. Remove compatibility code only after one successful GitHub workflow and deployment.

### Required vendor invariants

- Named vendors must never be silently replaced by another named vendor.[]
- `all_cheapest` and `all_average` must be recomputed from the current named-vendor registry — never sourced from a raw provider string.
- A missing vendor must be represented as unavailable or an explicit fallback status.
- Reliability metrics must distinguish direct exactness from cheapest-reprint resolution.
- Every generated vendor record must use one canonical key and one documented price mode.
- Any provider string discovered dynamically from a price feed must pass through the `NAMED_VENDORS` allowlist before being trusted as a vendor.

## 15. Change Management

For changes affecting generated data or valuation semantics:

1. Update this document.
2. Update tests and validators first.
3. Make the smallest implementation change.
4. Run local checks that do not require MySQL.
5. Run GitHub Actions with audit enabled when curves or source data change (use `quick_test_limit` first for a fast smoke test, then a full run).
6. Inspect generated artifacts before deployment.
7. Commit source changes separately from generated data changes.
8. Record any intentional fallback or compatibility behavior.

Keep commits focused. A useful sequence: backend-first migration → frontend cleanup → validation/workflow hardening → legacy file deletion → performance refactor.

## 16. Legacy Cleanup Candidates

Delete only after reference and history checks:

- **`src/data.ts`** — **removed 2026-09-19.** It contained only empty startup arrays; the four consumers now own their pre-load fallbacks and production data continues to load through `dataService`.
- **Duplicate data module resolved 2026-09-17:** `src/data/index.ts` had no consumers, while all four imports resolved to `src/data.ts`; the two modules also differed because only `src/data.ts` seeds `CHASE_CARDS_BY_SET` from `CURATED_CHASE_CARDS`. Removed the unused `src/data/index.ts`; `src/data.ts` is now the single canonical startup-data module.
- **`scripts/ingest-wpn.ts` — deleted 2026-09-17.** `package.json`'s `ingest-wpn` script and all in-app help text point at `scripts/ingest-wpn.js`; the TypeScript importer had no consumer.
- Unreferenced ingestion scripts.
- **Dead legacy cleanup completed 2026-09-18:** `scripts/recompute_arbitrage_leaderboard.py`, `backend/sync_all_from_sqlite.py`, and `backend/ev_engine.py` were removed after full-repo reference checks. No active production or workflow references remain.
- **`test_composite_evaluation.py` — REMOVE CANDIDATE.** Confirmed 2026-09-17: zero references anywhere in the repo outside itself. Delete only after its assertions are confirmed subsumed by the focused curve and composite contract tests.
- **`update_overrides.py` — deleted 2026-09-17.** It had zero references anywhere in the repo and was not called by `daily_update.py` or any workflow.
- **`new_file.txt` — deleted 2026-09-17.** It was an empty, unreferenced root file.
- **`src/services/chaseCardsService.ts` — deleted 2026-09-18.** Curated chase-card seeds, bundled deck fallbacks, client-side product availability inference, Scryfall URL construction, and unused product-candidate helpers were removed. Consumers now use backend-generated chase/deck snapshots or explicit empty/unresolved states.
- Local `dist/` when it is not intentionally deployed.
- The uncalled synthetic product factory in `RelatedProductsHierarchy.tsx` (after final reference validation).
- **New finding (2026-09-17, see DEV-32):** `dataService.ts`'s `injectSldFallbackDecks()` already removed this session — all 8 Secret Lair decks it hardcoded already have correct `precon_decks.json` entries, and the fake $0 entries were silently shadowing the real ones. No further action needed here.
- **Name-guess pack-count fallbacks — confirmed unexercised (2026-09-18).** `productUtils.ts`'s "unmapped sealed subitem" branch and `RelatedProductsHierarchy.tsx`'s `resolveRecursivePacks()` name-guess branch both only run when a `contents.sealed[]` entry has no `uuid` resolvable in `productMap`/`rawProductMap`. A full scan of `public/data/sealed_products.json` (3,599 `contents.sealed` references across 4,127 products) found **zero** unresolved/missing-uuid entries — this code path is currently dead in practice, not an active data-completeness gap. Kept as a defensive fallback (a future MTGJSON schema change could plausibly omit a uuid) but instrumented with a `console.warn` at both call sites so it becomes observable instead of silently guessing if it ever does fire. Re-verify after any pipeline/schema change that touches `contents.sealed` before assuming this is still unreachable.


Do not delete yet: `types.ts`, `ecommerceBoosterData.ts`, `productUtils.ts`, `dataService.ts`, `setHierarchyUtils.ts`, generated JSON files required by the frontend.

## 17. File Importance Matrix

This is the cleanup map for the repository. It is intentionally based on references, workflow ownership, and generated-data contracts rather than file size or personal preference. Scores are importance, not code quality:

| Score | Meaning |
|---|---|
| 5 | Production-critical or contract-defining; keep and test. |
| 4 | Active supporting code; keep, refactor only with a focused reason. |
| 3 | Useful test, admin, asset, or maintenance tooling; keep if the workflow remains supported. |
| 2 | Optional, manual, editorial, or weakly integrated; review before keeping. |
| 1 | Generated/local artifact or confirmed dead code; deletion candidate after a final reference check. |

### Root, configuration, and data boundaries

| File or group | Importance | Disposition and comment |
|---|---:|---|
| `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css` | 5 / 5 / 5 / 4 | Keep. Application entrypoint, top-level runtime shell, and global Tailwind import. |
| `package.json`, `bun.lock`, `tsconfig.json`, `vite.config.ts` | 5 | Keep. Build, dependency, and TypeScript contracts. |
| `src/types.ts`, `src/ecommerceBoosterData.ts` | 5 / 4 | Keep. Shared contracts and catalog metadata used across many views. |
| `src/data.ts` | 1 | Removed 2026-09-19 after migrating its four empty fallback consumers. |
| `.env.example`, `.gitignore`, `.vercelignore`, `metadata.json` | 3 / 4 | Keep. Environment/deployment boundaries; review `metadata.json` if no tool consumes it. |
| `PROJECT_REVIEW.md`, `public/products/README.md` | 4 / 3 | Keep. Operational rules and asset-ingestion instructions. |
| Root `dist/`, `node_modules/`, `.venv/`, `backend/__pycache__/`, `scripts/__pycache__/`, local `*.log` | 1 | Local/generated clutter. Never commit; remove locally when stale. |
| Root file `t` | 1 | Unknown unreferenced artifact. Inspect with Git and delete if it is not an intentional tool file. |

### Backend production and validation code

| File | Importance | Disposition and comment |
|---|---:|---|
| `backend/daily_update.py` | 5 | Keep. Authoritative pipeline orchestrator and publication gate. |
| `backend/config.py` | 5 | Keep. MySQL and pipeline environment contract. |
| `backend/download.py`, `backend/download_prices_today.py` | 5 | Keep. Required source ingestion stages. |
| `backend/lowest_prices.py`, `backend/price_resolver.py` | 5 / 4 | Keep. Price preparation and provenance; review the currently defensive/dead alias branch only during a resolver refactor. |
| `backend/populate_booster_ev_to_db.py`, `backend/ev_statistics.py` | 5 | Keep. Core simulation and empirical curve contract. |
| `backend/composite_evaluator.py` | 5 | Keep. Authoritative complete-product EV and quantiles. |
| `backend/export_app_data.py`, `backend/export_product_metrics.py` | 5 | Keep. Generated snapshot producers consumed by the frontend. |
| `backend/export_product_chase_cards.py` | 5 | Keep. MySQL `cardIdentifiers` join and product TOP 5 artwork/pricing producer. |
| `backend/load_deck_tables.py`, `scripts/deck_price_provenance.py` | 4 | Keep. Deck import/enrichment path; test together before any consolidation. |
| `backend/sync_live_sealed_prices.py` | 4 | Keep. Live sealed market-price stage. |
| `backend/sync_booster_fixed_metadata.py` | 4 | Keep. Weekly `collation-metadata` producer. |
| `backend/export_jumpstart_validation_report.py`, `backend/inventory_jumpstart.py` | 3 / 2 | Keep the exporter because the daily workflow calls it; review `inventory_jumpstart.py` as manual investigation tooling. |
| `backend/validate_pricing_and_ev.py` | 4 | Keep. Production quality gate and diagnostics producer. |
| `backend/validate_composite_data.py` | 3 | Keep as manual validation, or add it deliberately to CI; it is not currently in the daily stage list. |
| `backend/test_booster_fixed_metadata.py`, `test_booster_fixed_metadata_corpus.py`, `test_jumpstart_collation.py`, `test_jumpstart_validation_report.py` | 3 | Keep. Focused collation and Jumpstart regression coverage. |
| `backend/test_ev_statistics.py`, `test_pipeline_bucket_contract.py` | 3 | Keep. Focused empirical-curve and bucket-contract regression coverage. |
| `backend/test_composite_evaluation.py` | 1 | **REMOVE CANDIDATE.** No repository references outside the file; delete only after confirming its assertions are covered by focused curve and composite contract tests. |
| `backend/test_pricing_validator.py`, `test_product_chase_cards.py`, `test_product_metrics_contract.py` | 3 | Keep. Contract tests for validators, artwork metadata, and generated product metrics. |

### Manual scripts and import utilities

| File or group | Importance | Disposition and comment |
|---|---:|---|
| `scripts/ingest-wpn.js`, `scripts/process_wpn_assets.py` | 3 | Keep. Documented WPN asset workflow and package-script entrypoint. |
| `scripts/build_precon_decks.py`, `scripts/enrich_precon_decks.py` | 3 | Keep as reproducible deck-data tooling; clarify which one is the canonical generator. |
| `scripts/ingest_mtgjson_precons.py`, `ingest_sld_decks.py`, `ingest_unsanctioned_decks.py` | 2 | Manual/one-off data ingestion. Keep until generated deck provenance is reproducible elsewhere, then archive or delete together. |
| `scripts/archive/ingest_final_fantasy_commander.cjs` | 2 | Archived one-off set ingestion. No active caller; preserve for historical recovery only. |
| `scripts/archive/fix_anomalous_promo_prices.py` | 2 | Archived manual repair utility. No active caller or fixture; not part of the normal pipeline. |

### Frontend services and utilities

| File | Importance | Disposition and comment |
|---|---:|---|
| `src/services/dataService.ts` | 5 | Keep. Sole generated-data loading and caching boundary. |
| `src/utils/productUtils.ts`, `src/utils/vendorUtils.ts`, `src/utils/setHierarchyUtils.ts` | 5 / 4 / 4 | Keep. Structural breakdown, vendor normalization, and set identity support. Do not move EV authority into these helpers. |
| `src/utils/catalogProductLoader.ts`, `src/utils/evScore.ts` | 4 | Keep. Catalog merge and display score logic. |
| `src/utils/productAssetMatcher.ts` | 3 | Keep while packaging assets are supported; review its inferred-match behavior against identity rules. |
| `src/services/adminAuthService.ts` | 3 | Keep if the Admin tab remains deployed; otherwise remove with the complete admin surface. |
| `src/services/scryfallApi.ts` | 1 | **REMOVE CANDIDATE.** Repository search found no active import. Confirm history/manual use, then delete; browser card artwork must continue to come from generated backend URLs, not this service. |

### Frontend components

| File or group | Importance | Disposition and comment |
|---|---:|---|
| `ArbitrageLeaderboard.tsx`, `BoosterDetailExplorer.tsx`, `PackDistributionCurve.tsx`, `BoosterSlotViewer.tsx` | 5 | Keep. Main product/booster views and empirical-curve display. |
| `ProductBreakdownTable.tsx`, `ProductBreakdownModal.tsx`, `ProductHierarchyInspector.tsx`, `RelatedProductsHierarchy.tsx` | 4 | Keep. Active structural inspection views; audit remaining defensive name-guess branches before removing them. |
| `ProductChaseCardsViewer.tsx`, `PreconstructedDeckViewer.tsx` | 4 | Keep. Backend-generated chase/deck display; no curated fallback catalog. |
| `AdminPortal.tsx`, `AdminSecurityGate.tsx`, `AdminUserManagement.tsx` | 4 / 3 / 3 | Keep while the Admin tab is supported; consider extracting or removing as one unit, never individual fragments. |
| `ErrorBoundary.tsx`, `GlobalControlFooter.tsx`, `ManaCostRenderer.tsx`, `SetSymbolIcon.tsx` | 3 / 3 / 3 / 3 | Keep. Shared presentation and failure handling. |
| `ProductPackagingImage.tsx`, `BoosterFoilPackMockup.tsx`, `BoosterDisplayBoxMockup.tsx`, `CollectorBoosterBoxMockup.tsx`, `PackagingStockAssetGuide.tsx`, `PackagingAssetManager.tsx` | 3 | Keep while packaging assets are a product requirement; these are supporting/admin tooling, not valuation logic. |
| `SingleCardBreakdownViewer.tsx` | 3 | Keep. Active child of `ProductBreakdownModal`. |
| `SpecialChaseShowcase.tsx` | 2 | Keep only as explicitly curated/editorial content; never use it for product valuation. |
| `CubeBuilderStudio.tsx` | 1 | **REMOVE CANDIDATE.** Repository search found only its own definition and no active import. Confirm history/manual use, then delete or document as a separately supported feature. |

### Generated and static data

| File or group | Importance | Disposition and comment |
|---|---:|---|
| `public/data/sets.json`, `sealed_products.json`, `booster_ev.json`, `arbitrage_leaderboard.json`, `product_metrics.json`, `single_card_prices.json`, `pricing_reliability.json`, `product_chase_cards.json` | 5 | Keep as generated snapshots on `data-sync`; do not hand-edit or treat `main` copies as authoritative. |
| `public/data/pipeline_execution_logs.json`, `latest_pipeline_run.json`, `snapshot_manifest.json` | 4 | Keep for telemetry, snapshot identity, and Admin diagnostics. |
| `public/data/precon_decks.json`, `booster_slots.json`, `scryfall_set_hierarchy.json`, `product_overrides.json` | 4 | Keep. Static/hand-maintained inputs or recovery metadata used by the frontend/pipeline. |
| `public/data/booster_collation_overrides.json`, `jumpstart_validation_report.json`, `pricing_validator_diagnostics.json` | 3 / 4 / 3 | Keep: generated validation/metadata artifacts, with the overlay owned by `collation-metadata`. |
| `public/products/<set>/` and `public/products/README.md` | 3 | Keep while WPN packaging assets are displayed; remove only unused set folders after an asset-reference scan. |
| `all_printings_json/` | 1 | Local ignored corpus. Never commit; remove when no local investigation is using it. |

### Cleanup order

1. Remove local artifacts (`*.log`, `dist/`, `__pycache__/`, unknown root `t`) after confirming they are untracked or reproducible.
2. **Remove confirmed dead frontend candidates:** `src/services/scryfallApi.ts` and `src/components/CubeBuilderStudio.tsx`, after the final history/manual-use check.
3. Decide whether the one-off ingestion scripts are a supported reproducibility surface; archive them as a unit if not.
4. Keep the migrated consumers on `dataService`; do not reintroduce a duplicate startup-data module.
5. Refactor large active modules only after the deletion candidates are settled; do not mix cleanup with valuation-contract changes.
