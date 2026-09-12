# MTGEV Backend Review Map

This document describes the current backend pipeline, data ownership, known fallback paths, generated outputs, and the recommended cleanup order.

It is an inventory and review plan. It does not imply that every listed fallback is currently safe to remove.

## 1. Project Purpose

The backend answers:

> Is the value of a sealed MTG product better or worse than the singles and random contents inside it?

The important backend outputs are:

- Booster distributions by vendor and price mode.
- Composite sealed-product distributions by vendor.
- Product EV summaries and 100 empirical buckets.
- Vendor-aware product chase cards.
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
7. `export_product_chase_cards.py`
8. `composite_evaluator.py`
9. `validate_pricing_and_ev.py`

The runner now fails fast on any stage failure and validates the required JSON output bundle before the GitHub workflow can publish data.

Required output files currently include:

- `public/data/sets.json`
- `public/data/sealed_products.json`
- `public/data/booster_ev.json`
- `public/data/arbitrage_leaderboard.json`
- `public/data/single_card_prices.json`
- `public/data/product_chase_cards.json`

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
- Stops on failure.
- Validates generated JSON before publication.

Review status:

- Active and important.
- The unused `importlib.util` import should be removed during cleanup.
- The runner currently validates JSON syntax and file presence, but not deep schema or cross-file consistency.

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
- Random booster card-slot price resolution intentionally contains finish and vendor borrowing. If a seller does not carry the exact card or finish in a randomly opened booster slot, the resolver borrows the nearest usable price from a neighboring finish or vendor so that booster coverage remains reasonably complete. This is the only accepted borrowing policy. It is distinct from synthetic curve generation, and its frequency, type, and source should remain explicit in booster status counts and audit output.
- Some public helper methods still accept legacy `all` input for compatibility.

Function-level review findings:

| Area | Current responsibility | Finding |
|---|---|---|
| `prefetch_cards` | Loads card metadata, direct prices, and lowest reprint prices | Correct pipeline boundary, but performs three separate batched query families for every new UUID set. |
| `resolve_card_price` | Resolves named-vendor prices for random booster card slots | Uses the only accepted finish and cross-vendor borrowing policy when the exact seller/finish is unavailable. Preserve it for booster completeness, but measure the fallback type and source so borrowed prices remain distinguishable from exact prices. |
| `resolve_card_price_global` | Resolves `all_cheapest` for random booster card slots | May borrow across finishes for booster completeness; it must not be generalized as a fallback policy for other data domains. Separate implementation duplicates parts of `resolve_card_price`; candidate for a shared resolution primitive. |
| `resolve_card_price_average` | Resolves `all_average` for random booster card slots | Averages only vendors discovered in the current booster card set. Missing sellers are excluded from the average; they are not borrowed or substituted. |
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
- Optional `deckCards`/`decks` tables are tolerated when absent.
- Scryfall is not required for the price calculation.

Review status:

- New active stage.
- Needs a GitHub workflow run to verify the temporary database schema and output size.
- Should eventually share a backend card-candidate resolver with EV calculations.

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
| `pipeline_execution_logs.json` | `daily_update.py` | Admin Portal telemetry |

The app should read these files as immutable published snapshots. It should not reconstruct core EV distributions in the browser when backend output exists.

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

> Only random booster card-slot pricing may produce an explicit borrowed-data result when a documented neighboring price is available. Every other data domain must remain exact or unresolved; it must not borrow or invent a value.

Neighboring vendor and finish borrowing are intentional only inside random booster card-slot resolution. Product EV, sealed-product prices, metadata, chase-card exports, preconstructed-deck data, and other outputs must not borrow or invent values; unresolved data must remain missing or fail validation. Existing non-booster fallbacks should be removed or replaced with explicit unresolved states.

## 8. Recommended Cleanup Order

### Phase 1: Protect correctness

1. Run the GitHub workflow with audit enabled.
2. Verify arbitrary booster buckets against audit samples.
3. Validate `product_chase_cards.json` for representative products.
4. Add deep output schema validation.

### Phase 2: Establish backend ownership

1. Make `composite_evaluator.py` the only composite quantile producer.
2. Make `populate_booster_ev_to_db.py` the only booster distribution producer.
3. Make `export_product_chase_cards.py` the only product TOP 5 producer.
4. Remove browser-side synthetic EV fallbacks where backend data exists.

### Phase 3: Remove duplicated logic

1. Compare `ev_engine.py` with `composite_evaluator.py`.
2. Move shared recursive product resolution into one backend module.
3. Remove or isolate `src/utils/productUtils.ts` browser-side valuation logic.
4. Consolidate validation scripts.

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
