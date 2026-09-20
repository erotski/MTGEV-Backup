# Operations and runbook

## Standard checks

Frontend:

```cmd
npm.cmd run lint
npm.cmd run build
```

Backend checks that do not require MySQL:

```cmd
py -3.12 -m py_compile backend\daily_update.py
py -3.12 backend\daily_update.py --dry-run
py -3.12 -m unittest backend.test_ev_statistics backend.test_pipeline_bucket_contract
```

## Representative data validation

For valuation or data-boundary changes, verify representative generated records for:

- a single booster
- a container, bundle, or nested product
- a preconstructed deck
- a variable-content product
- a fixed-sheet or discrete-outcome product
- a missing-vendor or missing-quantile case

## Frontend smoke validation

Status: the all-product JSON snapshot validator is implemented in `backend/validate_frontend_snapshot.py` and is included in the weekly workflow. The browser smoke test and exhaustive browser audit described below are planned but not yet implemented.

Validate these surfaces: Products Overview/arbitrage, Booster EV detail, product breakdown/hierarchy, and chase cards.

For each representative product, verify that:

- identity comes from product contents or metrics
- the matching product-level or booster-level record is selected
- vendor and price mode are preserved
- displayed EV and market price match published JSON
- no synthetic EV or cross-booster fallback appears
- missing curves, empty panels, visible error states, and runtime exceptions fail the check

Continuous random curves must have 100 monotonic points with endpoints matching the published minimum and maximum. Curves with a special fixed or discrete x-axis must instead contain the correct number of published configuration/theme outcomes for that axis, with matching labels, ordering, probabilities, and endpoints or outcome values. Compare 10 seeded pseudo-random indexes against continuous selected vendor/mode snapshots so validation does not check only p05 and p95.

Fixed-sheet or discrete products are exempt from the 100-point percentile rule. They must render their published configuration outcomes, labels, probabilities, and zero artificial variance where applicable.

## Weekly snapshot validation

The weekly published-snapshot workflow checks the complete `data-sync` bundle across all sets and products without regenerating Monte Carlo samples or publishing data. Fresh 5,000-sample generation remains the responsibility of the daily audited pipeline.

The weekly job validates:

- generated JSON shape and cross-file IDs
- vendors, price modes, curves, endpoints, and product metrics
- Jumpstart configuration and telemetry contracts, including fixed-sheet cardinality where the published report provides it
- pricing/EV diagnostics
- consistency between diagnostic counts and serialized issue lists

The all-product validator currently covers every published product, product metric, booster record, and chase-card product ID. It accepts continuous 100-point curves, discrete enumerated outcomes, and fixed configuration outcomes. It does not open browser pages.

## Browser validation cadence

- Daily/PR: run all-product JSON-to-UI contract validation plus a small browser smoke test covering the main rendering paths.
- Weekly: run an exhaustive browser pass across all products with 4-8 parallel workers when infrastructure permits.
- On failure: retain the product ID, set code, screenshot, browser console errors, and published-versus-displayed mismatch details for triage.

The exhaustive browser pass is separate from the weekly published-snapshot contract validation. It checks actual UI rendering across the product catalog; the snapshot job checks the data bundle and does not open product pages.

Jumpstart does not have a separate release-blocking audit workflow. Its existing focused tests, published report status, configuration counts, and weekly snapshot checks are sufficient unless a future data change introduces a concrete fixed-sheet regression.

## Safe cleanup rules

- Generated data under `public/data/` is intentionally not tracked on `main`. It may be removed from a local checkout and regenerated, but do not remove the three tracked pipeline inputs: `precon_decks.json`, `booster_slots.json`, or `product_overrides.json`.
- The complete validated runtime bundle is published to `data-sync`; verify that production deploys from that branch before changing publication behavior.
- Keep source docs separate from generated snapshots.
- Move legacy notes or experiments to `docs/archive/` instead of leaving them in active docs.
- Keep one source of truth per concern.

The complete candidate list, ownership, references, and decisions are maintained in [cleanup-inventory.md](cleanup-inventory.md). Do not duplicate that inventory here.

## Production workflow

The canonical daily pipeline runs in GitHub Actions. Local quick tests are for validation only and must not publish to the generated-data branch.

The daily audited workflow is required after changes to EV calculation, simulation, collation, generated-data contracts, or publication logic. The weekly snapshot workflow is read-only and does not replace an audited generation run.

The authoritative stage order is maintained by `backend/daily_update.py`. It currently covers source downloads, price preparation, sealed-price synchronization, booster EV generation, app-data export, set hierarchy export, deck loading, chase-card export, composite evaluation, product metrics export, Jumpstart report export, and pricing/EV validation. A full run publishes the resulting generated bundle to `data-sync`; `main` supplies the tracked pipeline inputs.

### Pending administrator action

After the product-metric duplicate guard and frontend snapshot validator are merged, an administrator must manually start the full GitHub Action with `audit_enabled=true`. That run must regenerate `product_metrics.json`, publish a fresh `data-sync` snapshot, and confirm that the all-product validator passes without duplicate metric identities. Until that run succeeds, the current published `data-sync` snapshot remains a known validation failure and must not be treated as final.

The booster EV memory refactor, one-off ingestion review, browser smoke test, and exhaustive browser audit do not require the current generated snapshot to be treated as final; they remain source-work items before the final audited run.

## Known risk areas

- `src/types.ts` — canonical app contracts
- `backend/daily_update.py` — orchestration and publication gate
- `public/data/` — generated snapshots used by frontend
- `backend/price_resolver.py` — vendor and provenance logic
- `.github/workflows/weekly_snapshot_validation.yml` — read-only weekly validation of the published `data-sync` snapshots

## Cleanup policy

When removing legacy code or notes:

1. Archive it first.
2. Verify the app still compiles.
3. Commit the cleanup separately from logic changes.
4. Keep the docs focused on the current operating reality.

After cleanup, run the standard checks above plus the focused test or validator for the affected ownership boundary. Generated-data changes require the audited workflow before a regenerated snapshot is considered final.
