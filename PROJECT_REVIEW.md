# MTGEV Project Guide

This is the **single consolidated reference** for the MTGEV codebase. It merges what were previously three separate documents (`PROJECT_REVIEW.md`, `backend/BACKEND_REVIEW.md`, `FRONTEND_REVIEW.md`) into one file so there is exactly one place to check for architecture, rules, restrictions, current status, and next steps.

> **Note for AI coding agents:** This document is written to be read by both humans and AI agents working on this repository. Section 5 ("Restrictions") contains hard rules — treat every `Do not` / `Must not` statement as a constraint to check before making a change, not a suggestion. Section 12 ("Numbered Roadmap") is the current source of truth for what is done, in progress, or still broken. Read Section 5 and Section 12 before editing backend pricing/EV logic or frontend data-consuming components.

Update this document whenever a change crosses backend, frontend, generated-data, or deployment boundaries. Do not create new parallel `.md` review files — extend this one.

## Table of Contents

1. [Project Purpose](#1-project-purpose)
2. [Architecture](#2-architecture)
3. [Repository Layers & Key Files](#3-repository-layers--key-files)
4. [Definitions and Contracts](#4-definitions-and-contracts)
5. [Restrictions (Hard Rules)](#5-restrictions-hard-rules)
6. [Usage / Commands](#6-usage--commands)
7. [Backend Detail](#7-backend-detail)
8. [Frontend Detail](#8-frontend-detail)
9. [Fallback and Synthetic Logic Inventory](#9-fallback-and-synthetic-logic-inventory)
10. [Completed Improvements](#10-completed-improvements)
11. [Outstanding Data-Quality Diagnostics](#11-outstanding-data-quality-diagnostics)
12. [Numbered Roadmap](#12-numbered-roadmap)
13. [Next 5 Steps](#13-next-5-steps)
14. [Vendor Add/Remove Procedure](#14-vendor-addremove-procedure)
15. [Change Management](#15-change-management)
16. [Legacy Cleanup Candidates](#16-legacy-cleanup-candidates)

## 1. Project Purpose

MTGEV compares sealed Magic: The Gathering product prices with the expected value of the cards and contents inside those products. It answers:

- What is the expected singles value of a booster, box, bundle, case, deck, or composite product?
- How does value change by vendor and price mode?
- What is the empirical distribution of possible opened values?
- Which cards are the highest-value chase cards in a product?
- How reliable and complete are the source prices used in the calculation?

## 2. Architecture

```text
GitHub Actions
  -> temporary MySQL 8 service (ephemeral, recreated every run)
  -> download MTGJSON AllPrintings + AllPricesToday
  -> calculate lowest/reprint prices
  -> sync live sealed product market prices
  -> simulate booster EV (5,000 draws per booster/vendor/mode)
  -> export JSON (sets, sealed products, booster EV, single-card prices, reliability)
  -> load preconstructed decks
  -> export product chase cards (direct MySQL price resolution)
  -> evaluate composite products (10,000 MC samples)
  -> export complete-product metrics
  -> validate output bundle + semantics + telemetry
  -> stage & atomically publish public/data/
  -> commit to data-sync branch
  -> deploy to Vercel

React frontend
  -> App.tsx (global vendor/price-mode/EV-basis/set state)
  -> dataService.ts (loads/caches generated JSON)
  -> catalogProductLoader.ts + ecommerceBoosterData.ts (catalog metadata)
  -> view components (BoosterDetailExplorer, ArbitrageLeaderboard, ProductChaseCardsViewer, ...)
```

The workflow is `.github/workflows/daily_mtg_ev_update.yml`. It provisions a temporary MySQL database named `test_for_cards` that does **not** persist between runs — every run starts from a fresh MTGJSON import. The only persistent application data is the generated JSON committed to the `data-sync` branch.

**Vercel's Git integration "Production Branch" is `data-sync`, not `main`.** `data-sync` is a full mirror of `main` (source + app code) with freshly generated `public/data/` overlaid on top, force-pushed by the workflow every run — pushing to it is what triggers the production deploy. `main` is for source development only and must never carry a stale, manually-committed copy of pipeline-generated JSON (see DEV-27 below for the incident this caused). The one-time CLI `vercel --prod` deploy step was removed from the workflow because it raced against Vercel's own Git-integration deploy from `data-sync` and could leave production pinned to whichever one deployed last.

## 3. Repository Layers & Key Files

| Layer | Main location | Responsibility |
|---|---|---|
| Pipeline orchestration | `backend/daily_update.py` | Runs required stages, validates output, records telemetry, gates publication. |
| Source ingestion | `backend/download.py`, `download_prices_today.py` | Loads MTGJSON and current price feeds into temporary MySQL. |
| Price preparation | `backend/lowest_prices.py`, `price_resolver.py` | Resolves direct, reprint, vendor, finish, and aggregate prices. |
| Booster simulation | `backend/populate_booster_ev_to_db.py`, `ev_statistics.py` | Simulates booster openings and produces empirical distributions. |
| Product evaluation | `backend/composite_evaluator.py`, `ev_engine.py` | Evaluates nested, fixed, variable, and composite products. |
| Deck/chase export | `backend/load_deck_tables.py`, `export_product_chase_cards.py` | Loads deck contracts and exports product TOP 5 cards (resolves prices directly from MySQL). |
| Validation | `backend/validate_pricing_and_ev.py`, `validate_composite_data.py`, `daily_update.py` | Checks output structure, EV consistency, quantiles, provenance, references. |
| Published data | root `public/data/` | Authoritative immutable frontend snapshots. |
| Frontend shell | `src/App.tsx`, `src/types.ts` | Global state, navigation, shared contracts. |
| Frontend data boundary | `src/services/dataService.ts` | Loads and caches generated JSON. |
| Frontend views | `src/components/` | Displays backend data and presentation-only calculations. |
| Catalog/assets | `src/ecommerceBoosterData.ts`, `catalogProductLoader.ts`, `productAssetMatcher.ts` | Product metadata, packaging, hierarchy, images. |
| Documentation | `PROJECT_REVIEW.md` (this file) | Architecture, restrictions, roadmap, operating procedures. |

### Most important individual files

**Backend:**
- `daily_update.py` — authoritative production sequence and publication gate; also the quick-test-limit entry point.
- `populate_booster_ev_to_db.py` — booster price resolution and simulation; owns `NAMED_VENDORS` allowlist.
- `ev_statistics.py` — single source for the 100-point endpoint-preserving curve contract.
- `composite_evaluator.py` — backend composite quantile producer.
- `price_resolver.py` — explicit card-price and provenance decisions.
- `export_app_data.py` — generated application snapshot exporter; owns `single_card_prices.json` and its legacy-key normalization pass.
- `export_product_chase_cards.py` — backend product chase-card producer; resolves prices directly from MySQL (`prices` + `lowest_prices` tables), not just `single_card_prices.json`.
- `validate_pricing_and_ev.py` / `validate_composite_data.py` — pricing/EV/composite quality checks.

**Frontend:**
- `App.tsx` — global vendor, price mode, EV basis, set, and tab state.
- `dataService.ts` — JSON loading/caching boundary; product-metrics snapshot gateway.
- `productUtils.ts` — structural breakdown helper; backend data remains authoritative for product EV.
- `evScore.ts` — EV score calculation from empirical quantiles.
- `BoosterDetailExplorer.tsx` — booster and product exploration; state declaration order matters here (see Section 10 fix log).
- `PackDistributionCurve.tsx` — curve rendering from backend quantiles only; never fabricates a flat/synthetic curve.
- `ProductChaseCardsViewer.tsx` — backend-generated product TOP 5 display with explicit missing-data diagnostics.
- `ArbitrageLeaderboard.tsx` — product overview and pricing reliability.
- `ProductBreakdownTable.tsx`, `ProductHierarchyInspector.tsx`, `RelatedProductsHierarchy.tsx` — contents and hierarchy presentation.
- `SpecialChaseShowcase.tsx` — curated editorial showcase, separate from product TOP 5 data.

## 4. Definitions and Contracts

### Terminology rules

Use these terms consistently in code, UI labels, logs, tests, and documentation. Do not use `estimated`, `market`, `exact`, or `fallback` as vague substitutes for a more precise state.

| Term | Meaning | Must not mean |
|---|---|---|
| **EV / singles EV** | The value of the cards or fixed contents inside a sealed product, calculated from card prices and product collation. | The sealed product's own market price. |
| **Market price** | The observed price of the sealed product itself. | The value of the cards inside it. |
| **Unit EV** | A backend simulation metric for a standalone contained unit, primarily used by Booster EV and breakdown views. | A value that Products Overview must calculate, divide, or display as a product valuation. |
| **Total EV** | The only EV metric Products Overview uses: EV for the complete sealed product record, including all contained packs, fixed cards, decks, promos, toppers, and nested products. | A price copied from the sealed product listing, or a browser calculation from `packCount`. |
| **Products Overview contract** | Displays backend-generated complete-product `totalEv*`, `marketPrice`, `profitUsd`, `roiPct`, and `evScore`, selected by product/vendor/price mode/EV basis. | Recursive contents valuation, unit-EV division, booster multiplication, or inferred product economics in React. |
| **Pack count** | A backend-derived descriptive count of sealed booster units in the complete product, including nested products and explicitly classified booster/topper packs. | A frontend valuation multiplier, or a title substring match that treats every item containing “pack” as a booster. |
| **Card count** | A backend-derived descriptive total of cards in the complete product, including nested products and fixed decks where authoritative data exists. | A frontend estimate used to calculate EV. |
| **Direct mode** | Price resolution for the requested vendor, card identity, and finish where available. | A guaranteed exact listing when provenance says a neighbor was used. |
| **Cheapest-reprint mode** | Cheapest available name/reprint resolution for the requested vendor context. | Exact native vendor-listing coverage. |
| **Named vendor** | An actual marketplace price source: `tcgplayer`, `cardmarket`, `cardkingdom`, or `manapool`. | `all_cheapest` or `all_average`. |
| **Aggregate mode** | A calculated comparison view derived from named-vendor prices. Stored in the `vendor` field for schema compatibility. | A physical marketplace or independent price feed. |
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
| **Quick-test run** | A pipeline run with `QUICK_TEST_LIMIT` set, simulating only N sets/products for fast validation. | A run whose output should ever be published — quick-test runs never publish to `data-sync` or Vercel. |
| **Provenance** | Metadata describing where a value came from and whether it was exact, borrowed, reprinted, or unresolved. | A generic "live" label. |
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
- Never write a literal `all` vendor key into any generated JSON. The only valid canonical vendor keys are listed below. `all` was a legacy alias that has been eliminated from every writer (see Section 10) — do not reintroduce it, even as a "compatibility" fallback, in new code.

### Vendors

Canonical vendor keys (exactly these six, nothing else):

```text
all_cheapest
all_average
tcgplayer
cardmarket
cardkingdom
manapool
```

`tcgplayer`, `cardmarket`, `cardkingdom`, `manapool` are named marketplace sources — the only vendors ever discovered dynamically from price feeds (see `NAMED_VENDORS` allowlist in `populate_booster_ev_to_db.py` and `export_product_chase_cards.py`). `all_cheapest` and `all_average` are aggregate calculation modes; they are never sourced from a real seller string and must always be computed by the code, never copied from a raw provider field.

### Price modes

```text
direct
cheapest_reprint
```

- `direct`: requested card/vendor/finish pricing where available, with explicit neighboring card-price provenance when borrowed.
- `cheapest_reprint`: cheapest name/reprint resolution via the `lowest_prices` table. Its reliability metric is resolution coverage, not exact native vendor-listing coverage.

### Empirical curve

Every valid booster or composite curve contains exactly 100 points:

```text
point 1       exact minimum sample
points 2-99   98 equal empirical interior bucket means
point 100     exact maximum sample
```

Raw samples are retained in audit artifacts when audit mode is enabled. Percentile indexes are zero-based in code, so `quantiles[0]` is point 1 and `quantiles[99]` is point 100.

### Provenance

Card prices may have explicit statuses:

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

## 5. Restrictions (Hard Rules)

### Runtime restrictions

- Do not run the full `backend/daily_update.py` locally unless a complete compatible MySQL/data environment is deliberately configured.
- The authoritative full pipeline runs in GitHub Actions with a temporary MySQL 8 service.
- Run manual workflows from `main`, not `data-sync`.
- `data-sync` is for generated snapshots; source changes belong on `main`.
- Never commit audit samples or local generated caches.
- A quick-test run (`QUICK_TEST_LIMIT` set) must never publish to `data-sync` or deploy to Vercel — this is enforced with `if: ${{ !inputs.quick_test_limit }}` on those workflow steps. Do not remove that guard.

### Data restrictions

- Root `public/data/` is the only authoritative generated-data location.
- Do not recreate `backend/public/data/`.
- Do not use sealed market price as singles EV.
- Do not derive one vendor price by multiplying another vendor price.
- Do not apply synthetic reprint multipliers.
- Do not generate quantiles from averages or fixed percentage bands.
- Missing vendor, card, finish, or quantile data must remain explicit and observable.
- Neighboring card-price borrowing is allowed only with provenance.
- Never write or read a literal `all` vendor key in generated JSON (`prices`, `quantilesByVendor`, DB `vendor` columns). Always use `all_cheapest`.
- Any seller/provider string discovered from a raw price feed must be filtered through the `NAMED_VENDORS` allowlist before being treated as a vendor. Never trust an unfiltered provider string from `AllPricesToday`.

### Ownership restrictions

- Backend owns booster EV, composite EV, quantiles, vendor semantics, price modes, provenance, and product chase-card output.
- Frontend owns loading, presentation, navigation, formatting, sorting, and image/metadata display.
- Curated Special Chases are editorial content and must not become product valuation data.
- Static catalog metadata must not override matching generated product values.
- `export_product_chase_cards.py` must resolve candidate card prices directly from MySQL (`prices` + `lowest_prices`), not solely from `single_card_prices.json`, because that file only ever indexed `contents.card` singles and precon/deck-seeded cards — never regular booster-sheet cards. Do not revert to reading only `single_card_prices.json["byUuid"]`, or booster-sheet-sourced chase candidates will silently disappear again.

## 6. Usage / Commands

### Local frontend development

```cmd
npm.cmd run lint
npm.cmd run build
npm.cmd run dev
```

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
pricing_reliability.json, precon_decks.json
```

Plus telemetry outputs (`TELEMETRY_OUTPUTS`), also required and semantically validated:

```text
pipeline_execution_logs.json, latest_pipeline_run.json
```

`daily_update.py` runs three validation passes before publication: `validate_output_bundle()` (file existence/JSON syntax), `validate_output_semantics()` (shape, numeric finiteness, unique product IDs, 100-bucket monotonicity, booster endpoint agreement with `evMin`/`evMax`, chase-card product-id cross-references), and `validate_telemetry_outputs()` (after the run record is written).

### File-by-file notes

**`config.py`** — Reads MySQL connection settings and audit settings from environment variables (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `AUDIT_ENABLED`, `AUDIT_OUTPUT_DIR`). Never commit the password; supply via GitHub Actions secrets or a local env var.

**`daily_update.py`** — Orchestrates all stages, captures telemetry, validates before publication, supports `--dry-run`, `--schedule`, `--loop`, and `--quick-test-limit N`. Sets `QUICK_TEST_LIMIT` env var when the flag is used, which propagates to subprocess stages automatically (they inherit the parent environment).

**`download.py` / `download_prices_today.py`** — Stream the full MTGJSON AllPrintings/AllPricesToday SQL dumps into the ephemeral MySQL service. Large, network-dependent, and not shrunk by quick-test mode.

**`lowest_prices.py`** — Builds the `lowest_prices` table (per uuid, per seller, per finish minimum price) used for cheapest-reprint resolution. Required before correct reprint pricing.

**`sync_live_sealed_prices.py`** — Syncs live TCGplayer market prices for sealed products via HTTP. Respects `QUICK_TEST_LIMIT` by truncating the product list.

**`populate_booster_ev_to_db.py`** — Reads booster configs/sheets from MySQL, prefetches card metadata/prices, simulates 5,000 booster openings per booster/vendor/price-mode, stores summary stats + 100-bucket quantiles in MySQL `booster_ev_results`.
- `NAMED_VENDORS = {'tcgplayer', 'cardmarket', 'cardkingdom', 'manapool'}` — sellers discovered from `AllPricesToday` are filtered through this allowlist before becoming a per-vendor simulation row. **This was a real bug source**: without the filter, a stray provider string (observed as literally `"all"` for Murders at Karlov Manor) got treated as a genuine vendor, producing a corrupted row and silently omitting the true `all_cheapest` record. Do not remove this filter.
- The pre-migration cleanup `DELETE FROM booster_ev_results WHERE ... vendor = 'all'` must target the legacy `'all'` key, not `'all_cheapest'` — a prior version of this query had the values swapped, which deleted the correct canonical rows instead of the legacy ones.
- Respects `QUICK_TEST_LIMIT` / `--limit N` by truncating the list of distinct set/booster configurations before simulation.
- Bucket contract (shared with composite evaluation via `ev_statistics.py`): simulate pack totals → round to cents → sort → preserve exact min/max as points 1/100 → divide the rest into 98 equal empirical groups → average each group, round to cents.
- Audit output: `backend/audit_output/<set>_<booster>_<price_mode>_<vendor>.json` (git-ignored, uploaded as a workflow artifact only when `audit_enabled=true`).
- Known risk: memory-heavy simulation (retains all valid pack totals until statistics are calculated). `simulate_and_store()` mixes too many responsibilities (matrix building, simulation, statistics, persistence, audit writing) — highest-priority refactor target, not yet done.

**`ev_statistics.py`** — Single source of truth for the empirical 100-bucket calculation. Must be used by both booster and composite calculations; must not be replaced by summary-statistic interpolation.

**`ev_engine.py`** — Recursive product EV resolver used by sync/leaderboard code. Overlaps conceptually with `composite_evaluator.py` and frontend `productUtils.ts` — highest-priority duplication candidate, not yet consolidated. Retains an intentional `vendor == "all"` → `"all_cheapest"` input-argument normalization; this is caller-input aliasing (a caller might still pass the word `"all"`), distinct from the generated-data key bug fixed elsewhere — leave it.

**`price_resolver.py`** — Owns direct vendor, global-cheapest, reprint, and named-vendor-average card-price resolution; preserves provenance statuses (`exact`, `finish_fallback`, `vendor_fallback`, `vendor_finish_fallback`, `reprint`, `ignored`, `unpriced`). Also retains an input-alias normalization (`target_vendor == 'all'` → `'all_cheapest'`) for the same caller-input reason as `ev_engine.py`.

**`export_app_data.py`** — Exports MySQL data to `sets.json`, `sealed_products.json`, `booster_ev.json`, `pricing_reliability.json`, `arbitrage_leaderboard.json`, and `single_card_prices.json`.
- Its `resolve_card_prices()` helper (used to build `single_card_prices.json` entries for `contents.card` singles) computes `all_cheapest` (min) and `all_average` (mean) directly — it never writes `all`.
- Contains a **normalization pass** that runs after building `single_card_prices.json`, before writing it: for every entry across `byUuid`/`byName`/`byNameSet`, if a legacy `all` key exists, it is migrated to `all_cheapest` and removed. This exists to correct entries seeded by older one-off ingestion scripts (see below) without needing to manually rerun each one.
- Important limitation still present: this file's `single_card_prices.json` export loop only prices cards found in `contents.card` (direct sealed-product singles) — it does **not** cover regular booster-sheet cards. That gap is why `export_product_chase_cards.py` now resolves its own prices directly from MySQL rather than depending on this file for booster-sourced candidates.

**`export_product_chase_cards.py`** — Backend TOP 5 chase-card producer.
- Candidates come from three sources: MySQL booster sheets (`setBoosterSheetCards`/`setBoosterSheets`/`setBoosterContents`), deck contents (`deckCards`/`decks`, falling back to `precon_decks.json` when those tables are absent), and direct/variable card references in `sealed_products.json` contents.
- **Prices are resolved directly from MySQL** for every discovered candidate uuid: `load_direct_prices()` queries the `prices` table (direct mode), filtered through the `NAMED_VENDORS` allowlist. `resolve_vendor_prices()` computes `all_cheapest`/`all_average`. Product TOP 5 output intentionally contains direct-price records only; it does not emit `cheapest_reprint` lists.
- Display metadata (`name`, `setCode`, collector `number`, `scryfallId`, rarity, and type) comes directly from the MySQL `cards` table. The exporter builds the artwork URL solely from `scryfallId`; missing Scryfall UUIDs remain explicit and must not trigger a collector-number or set-code image lookup. `single_card_prices.json` is only a compatibility supplement.
- The export runs in two passes: resolve all products' candidates first (building one global uuid set), then bulk-query prices/metadata once, then build the per-product/per-vendor/per-mode TOP 5 lists.

**`load_deck_tables.py`** — Creates temporary `decks`/`deckCards` tables when the MTGJSON dump omits them, loads the current `precon_decks.json` snapshot, enriches fixed deck cards with current price provenance, writes per-deck `pricingReliability` summaries.

**`sync_all_from_sqlite.py`** — Legacy/alternative SQLite sync path. Likely obsolete for the GitHub MySQL pipeline; still a Section 16 cleanup candidate pending history review.

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

- **`App.tsx`** — owns top-level tabs, selected set/product, vendor, price mode, EV basis. Loads sets/arbitrage/booster-EV/reliability through `dataService`. Initial arrays from `src/data.ts` are empty startup scaffolding, not a production data source.
- **`types.ts`** — shared interfaces/unions for vendors, price modes, products, boosters, decks, chase cards, provenance. Changes here are cross-layer contract changes requiring backend JSON + frontend build validation.

### Data loading and caching

**`src/services/dataService.ts`** is the main frontend data boundary. Keep network loading/caching centralized here, not in view components.

- `getProductChaseCards()` — fetches `product_chase_cards.json`.
- `getLatestPipelineRun()` — fetches `latest_pipeline_run.json`.
- `getSnapshotIntegrityReport()` — checks sets/sealed-products/booster-EV loaded and non-empty, surfaces warnings.
- `getProductMetricsSnapshot()` — loads the backend-generated `product_metrics.json` complete-product valuation snapshot. It must not call `productUtils.ts` or calculate EV in the browser.
- Detailed views select product metrics from the loaded snapshot by product ID, vendor, price mode, and EV basis. There is no recursive valuation gateway.

Authoritative frontend data files: `sets.json`, `sealed_products.json`, `booster_ev.json`, `arbitrage_leaderboard.json`, `product_metrics.json`, `single_card_prices.json`, `precon_decks.json`, `product_chase_cards.json`, `pricing_reliability.json`, `latest_pipeline_run.json`. Root `public/data/` is authoritative; `backend/public/data/` must remain absent.

### Catalog and metadata layers

- **`ecommerceBoosterData.ts`** — curated catalog products/booster variation interfaces. Curated market prices/EV must never override generated pipeline values for products with matching backend IDs.
- **`catalogProductLoader.ts`** — merges curated + generated products, dedupes by ID/UUID. Title-based packaging inference is marked `metadataSource: 'inferred'`; generated records use `'pipeline'`.
- **`setHierarchyUtils.ts`** — loads/resolves generated Scryfall set hierarchy; fallback mappings limited to offline/startup recovery.
- **`productAssetMatcher.ts`** — matches products to WPN packaging assets; guessed matches must never affect product identity, market price, or EV.

### View ownership

- **`ArbitrageLeaderboard.tsx`** (Products Overview) — displays backend complete-product metrics + reliability; must not recompute product EV, divide totals into unit EV, multiply booster EV by pack count, inspect product contents for valuation, or invent product terminology. `packs` and `cards` are display-only backend-derived counts.
- **`BoosterDetailExplorer.tsx`** (Booster Explorer) — displays booster records/curves/slots/chase cards. `booster_ev.json` is authoritative. A missing vendor/mode record must render unavailable, never borrow an unrelated mode. **State declaration order matters**: `activeBoosterName` (and any other `useState` referenced by an effect's setter) must be declared before the effect that calls its setter — a prior ordering bug caused a production `ReferenceError: Cannot access 'X' before initialization` that blanked the whole page.
- **`PackDistributionCurve.tsx`** — renders empirical 100-bucket curves from backend quantiles only. Returns an empty points array (triggering an explicit "missing data" UI) rather than fabricating a flat/synthetic curve when quantiles are absent.
- **`BoosterSlotViewer.tsx`** — converts DB booster records into UI models; must not fabricate odds or pricing.
- **`ProductBreakdownTable.tsx`, `ProductHierarchyInspector.tsx`, `RelatedProductsHierarchy.tsx`** — structural contents/fixed-cards/decks/nested-products display via `productUtils.ts`; product-level EV comes from the backend metrics snapshot.
- **`ProductChaseCardsViewer.tsx`** — loads the direct-price record from `product_chase_cards.json` for the selected product/vendor. Resolves the product's chase-card record by matching `id`/`uuid`/`productUuid` against the snapshot's keys (case-insensitive fallback), and surfaces a specific diagnostic message (missing snapshot vs. no record for this vendor vs. no key match at all) instead of a generic empty state.
- **`chaseCardsService.ts`** — reduced to image/metadata helpers and the curated Special Chases catalog; legacy product-candidate discovery functions removed.
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
- Empty initial arrays in `src/data.ts` (startup scaffolding only).
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
| Booster Quantile Outlier Skews | 452 records | Quantile mean deviates >35% or <70% from the analytical `evAverage` for that booster/vendor/mode. | Not yet triaged. |
| Product Contents vs EV Mismatches | 752 records | A sealed product's stored total EV does not reconcile with the EV implied by walking its `contents` (packs/cards/decks/variable slots). | Not yet triaged. |
| Extreme ROI Pricing Anomalies | 569 records | Product ROI (EV vs. market price) is an extreme outlier, e.g. -99%+ or implausibly high. | Not yet triaged; at least one observed case (a Secret Lair bundle) may be a genuine low-EV curated product rather than a bug. |

Next action for each: extend `validate_pricing_and_ev.py`'s output (or a follow-up script) to dump the top N offending records per category with enough context (product ID, set, vendor, price mode, contents summary) to distinguish real bugs from expected outliers (e.g., intentionally low-value curated bundles).

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
| DEV-04 | Frontend fallback removal | P0 | DONE | Synthetic multipliers, invented card prices, market-price-as-EV, and browser simulations removed from active paths. | `npm.cmd run lint` and `npm.cmd run build` pass; no active multiplier references remain. |
| DEV-05 | Chase-card ownership | P0 | DONE | Product TOP 5 cards come from `product_chase_cards.json`, resolved directly from MySQL price tables; curated Special Chases remain editorial. | Viewer renders backend snapshot with explicit diagnostics when missing; exporter rewritten to price booster-sheet candidates, not just `single_card_prices.json` entries. |
| DEV-06 | Output validation | P0 | IN PROGRESS | Validate generated JSON shape, endpoints, cross-file references, telemetry, decks, reliability, and chase cards. | Daily runner passes `output_bundle`, `output_semantics`, and telemetry validation. Outstanding: triage the 452/752/569 diagnostic findings in Section 11. |
| DEV-07 | Snapshot identity | P0 | IN PROGRESS | Add shared `pipelineRunId`, source commit, generated timestamp, and schema version to generated outputs. | `latest_pipeline_run.json` confirmed live with real run id/timestamp/status/stages. Still missing: a shared `sourceCommit` field and frontend rejection/warning when snapshots disagree on run identity. |
| DEV-08 | Frontend data gateway | P0 | DONE | Add a backend-generated complete-product metrics snapshot and make every valuation view consume it through `dataService`, with no browser-side recursive EV calculation. | `product_metrics.json` is loaded through the frontend data boundary; Products Overview and detailed product views select snapshot records by product/vendor/mode. |
| DEV-09 | Frontend contract validation | P1 | IN PROGRESS | Validate JSON schemas and cross-file IDs at the `dataService` boundary. | Invalid snapshots produce structured warnings and an Admin Portal diagnostic. |
| DEV-10 | End-to-end value checks | P1 | NEXT | Compare UI EV, market price, curve, and chase cards against generated JSON. | Playwright checks assert `displayed value === snapshot value` for representative products. |
| DEV-11 | Recursive EV consolidation | P1 | DONE | Remove recursive product valuation from React. Retain only structural containment/card/deck display helpers; backend owns complete-product EV. | Products Overview and detailed views read backend metrics directly; no `getCanonicalProductMetrics()` call remains in the source tree. A full audited pipeline run remains required for operational verification. |
| DEV-12 | Reproducibility | P1 | NEXT | Record source versions, commit SHA, sample count, audit flag, and seed policy. | `latest_pipeline_run.json` contains reproducibility metadata. |
| DEV-13 | Workflow audit | P1 | BLOCKED | Run GitHub Actions with `audit_enabled=true` after source changes. | Audit artifact exists; endpoint means reproduce from raw samples. |
| DEV-14 | Catalog provenance | P1 | DONE | Mark generated catalog metadata as `pipeline` or `inferred`; avoid invented dates/blocks. | Catalog loader tests distinguish inferred metadata. |
| DEV-15 | Performance measurement | P2 | NEXT | Measure startup, JSON parse time, simulation memory, and stage duration. | Optimization decisions are based on recorded measurements. |
| DEV-16 | Backend decomposition | P2 | NEXT | Split simulation, statistics, audit writing, and MySQL persistence. | Focused tests preserve summary, sample, and bucket behavior. |
| DEV-17 | Legacy deletion | P2 | IN PROGRESS | Remove unreferenced ingestion scripts, SQLite paths, prototype tests, and empty files after history checks. | Reference search, workflow review, and focused validation pass. |
| DEV-18 | Operational dashboard | P2 | NEXT | Display latest pipeline status, snapshot identity, fallback rates, and unresolved counts in Admin Portal. | Admin Portal explains stale, missing, failed, and deployed states. |
| DEV-19 | Vendor lifecycle | P1 | NEXT | Centralize vendor definitions and make add/remove operations contract-driven. | A vendor change updates backend resolution, generated outputs, frontend controls, validation, provenance, and documentation without scattered edits. |
| DEV-20 | Jumpstart collation | P0 | NEXT | Interpret MTGJSON Jumpstart `fixed` sheet metadata correctly through a centralized `booster_collation_overrides.json` workaround because the MySQL schema omits the optional field. Fixed card counts are deterministic; only wildcard/variable slots are sampled. | A reviewed Jumpstart inventory identifies each set/booster/sheet mix; representative audit files show fixed land/content counts, correct variance, and agreement with MTGJSON configuration. |
| DEV-21 | Curve snapshot integrity | P0 | PARTIALLY_FIXED | The published curve data still needs continued cross-layer validation. | GitHub Actions review found no frontend curve-selection mismatches. Note: a separate, real curve-integrity bug was found and fixed at the backend vendor-discovery layer — see DEV-23. |
| DEV-22 | Chase-card visibility | P0 | IN PROGRESS | Ensure every product that has backend TOP 5 chase data displays it without silent empty states or stale vendor-mode mismatches. | Root cause (booster-sheet cards never priced, legacy `all` key) found and fixed in source (see DEV-05, DEV-23). Pending: a full non-quick-test pipeline run to confirm chase-card coverage improves broadly, not just for spot-checked products. |
| DEV-23 | Booster vendor discovery integrity | P0 | IN PROGRESS | Prevent unfiltered/garbage seller strings from AllPricesToday becoming fake booster vendors; fix the backwards legacy-row cleanup query. | `NAMED_VENDORS` allowlist added to `populate_booster_ev_to_db.py` and `export_product_chase_cards.py`; DELETE query fixed to target `'all'` instead of `'all_cheapest'`. Pending: full pipeline run confirming MKM (and any other affected sets) now produce a real `all_cheapest` row. |
| DEV-24 | Quick-test pipeline mode | P0 | DONE | Add an optional fast test-run mode that limits the two heaviest stages to N sets/products, never publishing. | `QUICK_TEST_LIMIT` implemented in `daily_update.py`, `populate_booster_ev_to_db.py`, `sync_live_sealed_prices.py`; workflow input added; publish/deploy steps gated off in quick-test mode. Validated via `--dry-run`; not yet exercised in a real GitHub Actions run. |
| DEV-25 | Validator diagnostic triage | P1 | NEXT | Investigate the 452/752/569 findings from `validate_pricing_and_ev.py` (see Section 11) and classify each as a real bug or an expected outlier. | A documented triage pass with counts reduced to only genuinely-expected outliers, or follow-up fixes filed for confirmed bugs. |
| DEV-26 | Windows console Unicode crash | P0 | FIXED | `export_app_data.py` and `daily_update.py` printed/logged Unicode symbols (`▶`, `═`, `✔`, `✘`) that crash with `UnicodeEncodeError: 'charmap' codec can't encode character` on a default Windows `cp1252` console. This silently aborted `export_app_data.py` on its very first line, cascading into `composite_evaluator.py` and `validate_pricing_and_ev.py` failures (confirmed live via `pipeline_execution_logs.json`, run `run-2026-09-12-192927`). This class of bug recurs whenever a new Unicode symbol is added to console output. | Replaced all Unicode symbols in both scripts with ASCII equivalents; `daily_update.py` now reconfigures `sys.stdout`/`sys.stderr` with `errors="replace"` and forces `PYTHONIOENCODING=utf-8` + `encoding="utf-8", errors="replace"` on every `subprocess.run()` call, so any future stray Unicode character in a child script's output can no longer crash the run. Needs one full local Windows run to confirm no further encoding failures. |
| DEV-27 | Cascading chase-card/curve unavailability | P0 | FIXED | Product Top-5 chase cards and empirical curves for specific products (e.g. Murders at Karlov Manor Collector Booster) appeared missing/stale on production even after a pipeline run completed successfully. Confirmed root cause 2026-09-15: Vercel's Git integration "Production Branch" was set to `main`, and `main` had a stale, manually-committed copy of pipeline-generated `public/data/*.json` (last touched 2026-09-12). Any push to `main` re-deployed that stale snapshot, racing against and sometimes overriding the workflow's fresh `data-sync` push/CLI deploy. | Fixed by (1) repointing Vercel's Production Branch setting to `data-sync` (confirmed live: production now serves `run-2026-09-15-092934`), (2) removing the now-redundant/racing `amondnet/vercel-action` CLI deploy step from the workflow, and (3) untracking the stale generated JSON (and the unused `mtg.sqlite`) from `main` via `.gitignore` so it can never again serve as an accidental deploy source. |

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
5. Displayed EV equals the selected backend snapshot value.
6. Displayed market price is not used as singles EV.
7. Chase cards match `product_chase_cards.json`.
8. Deck cards and prices match `precon_decks.json` and `single_card_prices.json`.
9. All loaded files share the same `pipelineRunId` and `schemaVersion`.
10. Missing values produce an explicit unavailable state, never a synthetic estimate.

Recommended representative fixtures: one single booster; one booster box or bundle; one nested case; one preconstructed deck; one variable-content product; one product with a missing vendor or quantile record.

### DEV-20 investigation order: Jumpstart collation

1. Enumerate all current Jumpstart set codes from `public/data/booster_ev.json` and the raw MTGJSON JSON source.
2. Review each Jumpstart sheet mix and classify sheets as `fixed`, `variable`, or `unknown`.
3. Add reviewed corrections to a centralized `public/data/booster_collation_overrides.json` file rather than modifying the MySQL dump.
4. Apply that overlay in `load_booster_config_from_db` after the normal MySQL load.
5. During simulation, treat fixed entries as deterministic card selections/counts rather than weighted random draws.
6. Keep wildcard rare/mythic or other explicitly variable sheets random.
7. Model the usual 10 land cards as fixed only when the MTGJSON source or reviewed override says so; do not infer this solely from the booster name.
8. Add a deterministic Jumpstart fixture test and an audit assertion that fixed portions do not create artificial variance.
9. Regenerate Jumpstart outputs in GitHub Actions and compare EV/variance against the raw MTGJSON configuration.

## 13. Next 5 Steps

1. **Run the full audited GitHub Actions pipeline** from `main` with `audit_enabled=true` and no quick-test limit.
2. **Inspect the generated product-metrics snapshot** for representative single boosters, boxes/bundles, nested cases, preconstructed decks, variable-content products, and missing vendor/quantile records.
3. **Verify publication and deployment**: confirm `data-sync` contains the source plus generated snapshots, Vercel serves the new `pipelineRunId`, and the frontend loads the same product-metrics records.
4. **Add end-to-end frontend checks** that compare displayed EV, market price, curve endpoints, and chase cards against the selected published snapshots.
5. **Triage the remaining validator diagnostics**: classify the 452 quantile skews, 752 contents-versus-EV mismatches, and 569 ROI anomalies, then fix confirmed data or collation defects.

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

- Named vendors must never be silently replaced by another named vendor.
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

- `src/data.ts` empty startup exports after imports are migrated.
- `scripts/ingest-wpn.ts` if the JavaScript importer is the only supported path.
- Unreferenced ingestion scripts.
- `sync_all_from_sqlite.py` if no SQLite workflow remains.
- `test_composite_evaluation.py` after deterministic tests replace it.
- `update_overrides.py` if no operational workflow uses it.
- Empty or stray root files such as `new_file.txt`.
- Local `dist/` when it is not intentionally deployed.
- The uncalled synthetic product factory in `RelatedProductsHierarchy.tsx` (after final reference validation).
- Obsolete product candidate functions in `chaseCardsService.ts`.

Do not delete yet: `types.ts`, `ecommerceBoosterData.ts`, `ev_engine.py`, `productUtils.ts`, `chaseCardsService.ts`, `dataService.ts`, `setHierarchyUtils.ts`, generated JSON files required by the frontend.
