# MTGEV Backend Review Map

This document describes the current backend pipeline, data ownership, known fallback paths, generated outputs, and the recommended cleanup order.

It is an inventory and review plan. It does not imply that every listed fallback is currently safe to remove.

The corresponding frontend and supporting-layer review is documented in [`FRONTEND_REVIEW.md`](../FRONTEND_REVIEW.md). Keep both maps aligned when changing generated JSON contracts, vendor semantics, provenance fields, or ownership of EV calculations.

## 1. Project Purpose

The backend answers:

> Is the value of a sealed MTG product better or worse than the singles and random contents inside it?

The important backend outputs are:

- Booster distributions by vendor and price mode.
- Composite sealed-product distributions by vendor.
- Product EV summaries and 100 empirical buckets.
- Vendor-aware product chase cards.
- Booster pricing reliability by named vendor and price mode.
- Fixed-card and deck pricing provenance, including exact, fallback, and missing counts.
- JSON files consumed by the React application.

## 2. Runtime Architecture

The intended production path is:

```text
GitHub Actions
  -> temporary MySQL 8 service
  -> download MTGJSON database
  -> download current prices
  -> calculate lowest/reprint prices
  -> simulate booster EV
  -> export JSON
  -> export product chase cards
  -> evaluate composite products
  -> validate outputs
  -> commit public/data JSON
  -> deploy frontend
```

The GitHub workflow is defined in:

- `.github/workflows/daily_mtg_ev_update.yml`

The workflow creates a temporary MySQL database named `test_for_cards`. It does not persist after the workflow finishes. The persistent application data is the generated JSON in `public/data/`.

## 3. Pipeline Order

`backend/daily_update.py` runs these stages in order:

1. `download.py`
2. `download_prices_today.py`
3. `lowest_prices.py`
4. `sync_live_sealed_prices.py`
5. `populate_booster_ev_to_db.py`
6. `export_app_data.py`
7. `load_deck_tables.py`
8. `export_product_chase_cards.py`
9. `composite_evaluator.py`
10. `validate_pricing_and_ev.py`

The runner now fails fast on any stage failure and validates the required JSON output bundle before the GitHub workflow can publish data.

Required output files currently include:

- `public/data/sets.json`
- `public/data/sealed_products.json`
- `public/data/booster_ev.json`
- `public/data/arbitrage_leaderboard.json`
- `public/data/single_card_prices.json`
- `public/data/product_chase_cards.json`
- `public/data/pricing_reliability.json`

The runner also writes `pipeline_execution_logs.json` and `latest_pipeline_run.json` for telemetry, but `validate_output_bundle()` currently checks only the seven files above. Treat that as a validation gap: telemetry files should be included in the required bundle once their schema is defined.

## 4. Backend Files

### `config.py`

Purpose:

- Reads MySQL connection settings from environment variables.
- Reads audit settings from environment variables.

Important environment variables:

```text
DB_HOST
DB_PORT
DB_USER
DB_PASSWORD
DB_NAME
AUDIT_ENABLED
AUDIT_OUTPUT_DIR
```

The password should be supplied by GitHub Actions secrets or a local environment variable. It should not be committed to source.

### `daily_update.py`

Purpose:

- Orchestrates all pipeline stages.
- Captures stage status and timing in `public/data/pipeline_execution_logs.json`.
- Writes the latest run, including compact stage summaries, to `public/data/latest_pipeline_run.json`.
- Stops on failure.
- Validates generated JSON before publication.

Review status:

- Active and important.
- The unused `importlib.util` import should be removed during cleanup.
- The runner validates JSON syntax, required fields, numeric finiteness, product identity uniqueness, and 100-bucket monotonicity for booster and composite outputs. Cross-file schema validation remains a follow-up.

### `download.py`

Purpose:

- Downloads and imports the large MTGJSON AllPrintings SQL database into MySQL.

Review status:

- Active in GitHub Actions.
- Not an application runtime dependency after the workflow completes.
- Should remain separate from analysis/export code.

### `download_prices_today.py`

Purpose:

- Imports the current AllPricesToday data into MySQL.

Review status:

- Active in GitHub Actions.
- Large and network-dependent.
- Should remain separate from EV calculation logic.

### `lowest_prices.py`

Purpose:

- Builds or refreshes lowest-price/reprint data used by cheapest-reprint calculations.

Review status:

- Active prerequisite for correct reprint pricing.
- Must not be removed until the reprint price contract is replaced.

### `sync_live_sealed_prices.py`

Purpose:

- Updates sealed product market prices.

Review status:

- Active pipeline stage.
- External price retrieval should be isolated from EV logic.

### `populate_booster_ev_to_db.py`

Purpose:

- Reads booster configurations and card sheets from MySQL.
- Prefetches card metadata and prices.
- Simulates 5,000 booster openings per booster, vendor, and price mode.
- Stores summary statistics and 100 empirical buckets in `booster_ev_results`.
- Writes optional audit files when `AUDIT_ENABLED=true`.

Important current behavior:

- Named sellers are discovered from the database price rows.
- `all_cheapest` is calculated globally across seller prices.
- `all_average` is calculated from named seller prices and excludes `all_cheapest`.
- Individual seller distributions are simulated separately.
- The two-seller fallback (`tcgplayer`, `cardmarket`) has been removed.
- The old temporary console dump of 5,000 samples has been removed.
- Legacy cleanup now targets `all_cheapest` rather than `all`.

Bucket contract:

1. Simulate pack totals.
2. Round each valid pack total to cents.
3. Sort the valid samples.
4. Divide them into 100 equal percentile groups.
5. Average each group.
6. Round each bucket to cents.

The shared implementation is in `ev_statistics.py`.

Audit output:

```text
backend/audit_output/<set>_<booster>_<price_mode>_<vendor>.json
```

Audit files contain the exact sorted valid samples and the generated bucket means. The directory is ignored by Git. GitHub Actions can upload it as an artifact for manually enabled audit runs.

Review risks:

- The simulation is memory-heavy because all valid pack totals are retained until statistics are calculated.
- Card-price resolution intentionally contains finish and vendor borrowing for every card-content context. If a seller does not carry the exact card or finish, the resolver borrows the nearest usable price from a neighboring finish or vendor so that product coverage remains reasonably complete. This applies to random booster slots, fixed product cards, preconstructed deck cards, variable card options, and random tiny boosters with set/sheet data. It is distinct from synthetic curve generation, and its frequency, type, and source should remain explicit in provenance telemetry. Random content is weighted by occurrence; fixed content is counted per included card.
- Some public helper methods still accept legacy `all` input for compatibility.

Function-level review findings:

| Area | Current responsibility | Finding |
|---|---|---|
| `prefetch_cards` | Loads card metadata, direct prices, and lowest reprint prices | Correct pipeline boundary, but performs three separate batched query families for every new UUID set. |
| `resolve_card_price` | Resolves named-vendor prices for card content | Uses finish and cross-vendor borrowing when the exact seller/finish is unavailable. Apply the same resolver to booster slots, fixed cards, decks, variable card options, and tiny random boosters; measure fallback type and source so borrowed prices remain distinguishable from exact prices. |
| `resolve_card_price_global` | Resolves `all_cheapest` for card content | May borrow across finishes and should share the same card-price provenance contract as named-vendor resolution. Separate implementation duplicates parts of `resolve_card_price`; candidate for a shared resolution primitive. |
| `resolve_card_price_average` | Resolves `all_average` for card content | Averages resolved named-vendor prices. Borrowing remains visible in per-vendor provenance; aggregate coverage must not hide those statuses. |
| `load_booster_config_from_db` | Reads weighted variants, contents, sheets, and weighted cards | Authoritative booster configuration loader. Keep. |
| `simulate_and_store` | Builds matrices, runs 5,000 draws, calculates summaries/buckets, writes MySQL, writes audit files | Too many responsibilities in one method. Highest-priority refactor target. |
| `get_card_price` | Public helper for sealed-product EV | Removed after caller search found no external users. |
| `calculate_sealed_product_ev` | Recursive-ish sealed product EV helper | Removed after caller search found no external users. Its duplicate SQL/fallback logic was not part of the active pipeline. |
| `_init_database_schema` | Creates `booster_ev_results` | Database migration/schema responsibility is mixed into simulation runtime. Keep temporarily; later move to a migration/setup script. |

Remaining cleanup candidates inside this file:

- Remove unused `os` import.
- Remove `convert_time` if no caller remains after pipeline review.
- Extract price resolution into a dedicated module.
- Extract sample generation/statistics into a dedicated module.
- Extract MySQL persistence/audit writing into a repository/output module.

Important: do not remove finish/vendor fallbacks in the same change as the structural extraction. First preserve behavior with tests, then change policy separately.

### `ev_statistics.py`

Purpose:

- Single source of truth for empirical 100-bucket calculation.

Review status:

- Active and should remain.
- It must be used by booster and composite calculations.
- It should not be replaced by summary-statistic interpolation.

### `ev_engine.py`

Purpose:

- Recursive product EV resolver used by synchronization and leaderboard-related code.

Review status:

- Active, but overlaps conceptually with `composite_evaluator.py` and frontend `productUtils.ts`.
- Highest-priority duplication candidate.
- Long-term goal: one backend product-resolution contract.

Known fallback behavior:

- Vendor fallback to other rows.
- Legacy `all` compatibility.
- Market-price-based estimates when a child product cannot be resolved.

### `price_resolver.py`

Purpose:

- Owns direct vendor, global-cheapest, reprint, and named-vendor-average card-price resolution.
- Preserves the status values used for telemetry: `exact`, `finish_fallback`, `vendor_fallback`, `vendor_finish_fallback`, `reprint`, `ignored`, and `unpriced`.

Recent refactor:

- Extracted from `populate_booster_ev_to_db.py` after confirming that the engine was mixing price policy with simulation and database persistence.
- The booster engine now owns caches and simulation; this module owns pricing decisions.

Next test:

- Run one representative booster before and after the refactor and compare summary values, valid sample counts, and selected bucket means.

These should be catalogued before removal because they can change product coverage.

### `export_app_data.py`

Purpose:

- Exports MySQL data to frontend JSON files.
- Exports sealed products, booster EV, leaderboard data, and single-card prices.

Review status:

- Active and central.
- It has historically mixed database export, leaderboard calculation, price resolution, and compatibility preservation.
- It should eventually be split into focused exporters.

### `export_product_chase_cards.py`

Purpose:

- Backend-generated TOP 5 cards for every sealed product.
- Reads booster sheets, nested product contents, deck candidates when available, and local single-card prices.
- Writes `public/data/product_chase_cards.json`.

Important behavior:

- Direct and cheapest-reprint modes are generated.
- Named vendors and aggregate vendors are generated.
- Optional `deckCards`/`decks` tables are tolerated when absent; the exporter falls back to card lists in `precon_decks.json` so deck-referenced products do not lose all deck candidates.
- Scryfall is not required for the price calculation.

Review status:

- New active stage.
- Needs a GitHub workflow run to verify deck candidate coverage and output size. The temporary MTGJSON schema currently omits `deckCards`/`decks` in some runs, so local precon data is the supported fallback for candidate discovery.
- Should eventually share a backend card-candidate resolver with EV calculations.

### `load_deck_tables.py`

Purpose:

- Creates the temporary `decks` and `deckCards` tables when the MTGJSON SQL dump does not provide them.
- Loads the current published `precon_decks.json` snapshot into those tables before chase-card export.
- Enriches fixed deck cards with current AllPricesToday vendor/finish provenance when the feed is available.
- Writes per-deck `pricingReliability` summaries with observed and fallback-completed EV.

Review status:

- Active pipeline stage that establishes the relational deck contract.
- The snapshot remains the current source because the repository has no upstream deck-bundle downloader yet; replacing it with a fresh deck download is a follow-up improvement.
- Neighbor borrowing is explicit in `priceProvenance`; it is not inferred by the frontend.

### `sync_all_from_sqlite.py`

Purpose:

- Legacy/alternative SQLite synchronization path.

Review status:

- Likely obsolete for the GitHub MySQL pipeline.
- Requires history review before deletion because it may support an older local workflow.

### `sync_live_sealed_prices.py`

Purpose:

- Updates live sealed product prices in MySQL.

Review status:

- Active pipeline stage.

### `validate_pricing_and_ev.py`

Purpose:

- Validates booster quantiles, product EV consistency, vendor coverage, and pricing data.

Review status:

- Active validation stage.
- Should be extended to validate `product_chase_cards.json` and the output bundle schema.

### `validate_composite_data.py`

Purpose:

- Audits composite product quantile monotonicity, vendor completeness, archetypes, and variable products.

Review status:

- Useful but not currently listed in `daily_update.py`.
- Should either be added to the pipeline or clearly documented as a manual diagnostic.

### Test files

- `test_ev_statistics.py`: active bucket contract test.
- `test_pipeline_bucket_contract.py`: active 5,000-sample bucket test.
- `test_composite_evaluation.py`: prototype/manual composite test; candidate for replacement with proper deterministic tests.

### `daily_update.log`

Generated runtime log. It should not be treated as source code and should remain ignored.

### `__pycache__/`

Generated Python cache. It should remain ignored and should not be committed.

## 5. Vendor and Price-Mode Contract

Canonical vendor keys:

```text
all_cheapest
all_average
tcgplayer
cardmarket
cardkingdom
manapool
```

Price modes:

```text
direct
cheapest_reprint
```

`all_cheapest` is the global cheapest resolution. `all_average` is the average of named vendors and excludes `all_cheapest`.

Legacy `all` references still exist in a few compatibility paths and should be removed gradually after generated data has been regenerated and verified.

## 6. Generated Data Ownership

| Output | Producer | Consumer |
|---|---|---|
| `sets.json` | `export_app_data.py` | set navigation and hierarchy |
| `sealed_products.json` | `export_app_data.py` + `composite_evaluator.py` | product explorer and leaderboard |
| `booster_ev.json` | `export_app_data.py` from MySQL | booster explorer and composite evaluation |
| `arbitrage_leaderboard.json` | `export_app_data.py` | Products Overview |
| `single_card_prices.json` | `export_app_data.py` | card and chase pricing |
| `product_chase_cards.json` | `export_product_chase_cards.py` | product TOP 5 chase viewer |
| `pricing_reliability.json` | `export_app_data.py` | Products Overview vendor reliability indicator |
| `pipeline_execution_logs.json` | `daily_update.py` | Admin Portal telemetry |
| `latest_pipeline_run.json` | `daily_update.py` | Direct latest-run inspection |

The app should read these files as immutable published snapshots. It should not reconstruct core EV distributions in the browser when backend output exists.

`pricing_reliability.json` reports mode-specific reliability metrics. For `direct` records, `directExactPct` measures the share resolved from the requested vendor and exact card/finish match, while `nonExactPct` is the complementary share. For `cheapest_reprint` records, `reprintResolvedPct` measures the share for which the vendor resolved a cheapest name/reprint price, including an explicitly recorded neighboring source when needed; `unresolvedPct` is the complementary share. Exact-match percentages from `booster_ev.json` remain available for backward compatibility, but they must not be used to judge cheapest-reprint coverage.

## 7. Fallback and Synthetic Logic Inventory

Fallback categories requiring explicit policy and observability:

- Legacy vendor `all` aliases.
- Vendor substitution during random booster card-slot pricing when a requested vendor row is missing (intentional booster-only borrowing).
- Finish substitution during random booster card-slot pricing between normal, foil, and etched (intentional booster-only borrowing).
- Product market-price estimates when contents are unresolved.
- Generic product-title packaging inference.
- Synthetic EV multipliers for sample/prerelease/unknown booster types.
- Browser-side composite resimulation from 100 buckets.
- Curated hardcoded chase-card prices.
- Scryfall set/card discovery when local candidates are unavailable.

Recommended rule:

> Any card-price lookup may produce an explicit borrowed-data result when a documented neighboring price is available. Non-card domains such as sealed-product market prices, metadata, and product identity must remain exact or unresolved; they must not borrow or invent a value.

Neighboring vendor and finish borrowing are intentional for all card-price resolution. Product EV should expose the resulting card provenance, while sealed-product market prices, metadata, and product identity must not borrow or invent values. Existing non-card fallbacks should be removed or replaced with explicit unresolved states.

## 8. Recommended Cleanup Order

### Phase 1: Protect correctness

1. Run the GitHub workflow with audit enabled.
2. Verify arbitrary booster buckets against audit samples.
3. Validate `product_chase_cards.json` for representative products.
4. Add deep output schema validation.
5. Record source-data versions, workflow commit SHA, simulation iteration counts, and audit settings in the published run metadata.
6. Add deterministic test controls or an explicit reproducibility policy for Monte Carlo stages.
7. Verify that a failed or empty vendor evaluation cannot publish stale or partially updated EV fields.
8. Verify fallback vendor selection is intentional and visible in telemetry; do not silently treat `all_cheapest`, `tcgplayer`, or the first available vendor as equivalent.

### Phase 2: Establish backend ownership

1. Make `composite_evaluator.py` the only composite quantile producer.
2. Make `populate_booster_ev_to_db.py` the only booster distribution producer.
3. Make `export_product_chase_cards.py` the only product TOP 5 producer.
4. Remove browser-side synthetic EV fallbacks where backend data exists.
5. Make `validate_pricing_and_ev.py` and `validate_composite_data.py` share one schema and vendor/price-mode contract.

### Phase 3: Remove duplicated logic

1. Compare `ev_engine.py` with `composite_evaluator.py`.
2. Move shared recursive product resolution into one backend module.
3. Remove or isolate `src/utils/productUtils.ts` browser-side valuation logic.
4. Consolidate validation scripts.
5. Remove legacy `all` aliases only after generated-data compatibility has been checked.

### Phase 4: Performance

1. Stop preloading chase cards for every product.
2. Load TOP 5 data only for the selected product.
3. Avoid browser-side 5,000-draw simulations when backend quantiles exist.
4. Reduce repeated parsing of large JSON files through service caches.
5. Consider splitting large generated JSON by domain or set if startup cost remains high.

### Phase 5: Delete candidates

Only after references and replacement paths are verified:

- `sync_all_from_sqlite.py` if no local SQLite workflow remains.
- `test_composite_evaluation.py` after proper tests replace it.
- Obsolete ingestion scripts and duplicated JS/TS WPN ingestors.
- Stale generated/debug files.

Do not delete yet:

- `types.ts`
- `ecommerceBoosterData.ts`
- `ev_engine.py`
- `productUtils.ts`
- `chaseCardsService.ts`
- generated JSON files required by the frontend

## 9. Immediate Next Review

The next file-by-file review should start with:

1. `populate_booster_ev_to_db.py`
2. `composite_evaluator.py`
3. `ev_engine.py`
4. `export_app_data.py`
5. `export_product_chase_cards.py`
6. `productUtils.ts` as the frontend duplicate-resolution boundary

For each file, record:

- Inputs and outputs.
- Public functions.
- Callers.
- Fallbacks.
- Generated data ownership.
- Safe deletion or refactor candidates.
- Focused tests required before changing it.

## 10. Audit Completion Register

Use this register to distinguish a known risk from a completed fix. A phase is complete only when its acceptance evidence is attached to the relevant pull request or workflow run.

| Priority | Area | Current state | Required fix or evidence |
|---|---|---|---|
| P0 | Publication safety | Implemented in the workflow; generated data is staged in an isolated workspace and swapped after the runner succeeds. | Confirm a failed run leaves the previous `public/data/` snapshot unchanged, and confirm `data-sync` contains data only. |
| P0 | Output completeness | `daily_update.py` now checks core booster/composite shapes, finite metrics, unique product IDs, and monotonic 100-bucket curves. Cross-file schemas and telemetry are not yet checked. | Extend schema validation to telemetry, deck provenance, chase cards, vendor/mode completeness, and cross-file product references. |
| P0 | Composite correctness | Composite evaluation is backend-owned, but the independent validator is not part of the daily stage list. | Run `validate_composite_data.py` in CI or document why it remains manual; fail on malformed or incomplete composite quantiles. |
| P1 | Price resolution | Neighbor borrowing is intentional and now represented by provenance. | Verify direct versus cheapest-reprint metrics separately, and publish counts for exact, finish fallback, vendor fallback, unresolved, and complete results. |
| P1 | Fallback vendor policy | Some validation and display paths choose `all_cheapest`, then `tcgplayer`, then another available vendor. | Replace implicit selection with an explicit policy parameter or emit a warning and provenance whenever a requested vendor is unavailable. |
| P1 | Reproducibility | Booster and composite simulations use large Monte Carlo samples; run metadata does not currently record a seed or source snapshot. | Record source URLs/versions, commit SHA, iteration count, audit flag, and seed policy in `latest_pipeline_run.json`. |
| P1 | Stale-data protection | The runner stops before publication on stage failure, but the required-output list excludes telemetry files. | Require telemetry files after they are written and test that missing/empty outputs cannot replace the previous snapshot. |
| P1 | Deployment operations | Repository publication and Vercel deployment are separate workflow actions with different credentials. | Document `contents: write`, Vercel secret requirements, branch behavior, and the expected result of a data publish when deployment fails. |
| P2 | Test coverage | There are focused bucket/provenance tests, but no complete backend test command or coverage threshold. | Add deterministic unit tests for resolver statuses, fallback policy, recursive products, schema validation, and representative exporter fixtures. |
| P2 | Architecture duplication | `ev_engine.py`, `composite_evaluator.py`, and frontend `productUtils.ts` still overlap. | Establish one backend recursive product-resolution contract, migrate callers, then remove browser valuation logic. |
| P2 | Performance | Booster and composite simulations retain many samples and repeatedly parse large datasets. | Measure runtime and memory per stage, cache immutable inputs, and optimize only after correctness evidence is captured. |
| P3 | Cleanup | `sync_all_from_sqlite.py`, prototype tests, legacy ingestion scripts, and unused imports remain candidates. | Use reference search and history review, deleting only after replacement tests and workflows are verified. |

### Minimum local pre-push checks

These checks do not require MySQL and should pass before a backend change is pushed:

```text
python backend/daily_update.py --dry-run
python -m pytest backend/test_ev_statistics.py backend/test_pipeline_bucket_contract.py
npm.cmd run build
git diff --check
```

The full regeneration remains a GitHub Actions operation because it requires MySQL, MTGJSON downloads, current price feeds, and deployment credentials.

## 11. Workflow Regeneration Runbook

The authoritative regeneration path is GitHub Actions. Local machines do not need MySQL for the production run; the workflow provisions a temporary MySQL 8 service.

### Start a diagnostic run

1. Push the intended code to `main`.
2. Open `.github/workflows/daily_mtg_ev_update.yml` in GitHub Actions.
3. Select **Run workflow** and enable `audit_enabled` when validating booster buckets.
4. Confirm the run checks out the expected commit SHA.

### Required success evidence

The job log should contain successful completion for:

- `load_deck_tables.py` with loaded deck/card counts.
- `export_product_chase_cards.py` with the exported product count.
- `composite_evaluator.py` with its completion summary.
- `validate_pricing_and_ev.py` with no fatal error.
- The validated generated-data staging/publication step.
- Vercel deployment, when deployment is enabled.

### Generated files to inspect

After a successful run, inspect the published `public/data/` bundle:

- `latest_pipeline_run.json`: compact run status, stage durations, summaries, and errors.
- `pricing_reliability.json`: weighted named-vendor booster resolution telemetry.
- For `direct`, inspect `directExactPct` and `nonExactPct`; for `cheapest_reprint`, inspect `reprintResolvedPct` and `unresolvedPct`. The latter is resolution coverage, not exact vendor-listing coverage.
- `precon_decks.json`: per-card `priceProvenance` and per-vendor `pricingReliability`.
- `sealed_products.json`: composite `fixedPricingByVendor` where fixed content was resolved.
- `product_chase_cards.json`: vendor/mode-aware product chase output.

When audit mode is enabled, download the `ev-simulation-audit-<run number>` artifact and compare arbitrary bucket means against the exact sorted samples in an audit file.

### Publication safety checks

The workflow generates data in an isolated workspace and swaps the validated `public/data/` directory into place only after all required stages pass. A failed run must leave the previous published dataset intact. The `data-sync` branch is data-only; it must not contain `.github/workflows/` files or require workflow write permission from `GITHUB_TOKEN`.

### Known diagnostic warnings

Market-price fetches may report products without a current market price. This is a coverage diagnostic, not permission to invent a sealed-product price. Product and composite validation may also report anomalous ROI or contents/EV mismatches; investigate those counts before treating the dataset as fully trustworthy, even when the workflow technically completes.
