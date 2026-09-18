# MTGEV Project Review

This is the active source of truth for project rules. Historical investigations and cleanup inventories live in [docs/archive/](docs/archive/).

## Purpose

MTGEV compares sealed Magic product prices with the expected value of the cards and contents inside those products.

## Ownership

- `backend/` owns source ingestion, pricing semantics, EV calculation, provenance, validation, and generated-data export.
- `src/` owns loading, contract validation, rendering, formatting, and navigation.
- `public/data/` contains generated snapshots consumed by the frontend. Do not hand-edit them.
- `docs/` contains active architecture and operations guidance; `docs/archive/` contains historical notes and retired utilities.

## Hard rules

- Use only canonical vendor keys: `all_cheapest`, `all_average`, `tcgplayer`, `cardmarket`, `cardkingdom`, and `manapool`.
- Do not reintroduce the legacy `all` vendor alias in new data or contracts.
- Frontend code must not invent EV, prices, quantiles, pack counts, product identity, or metadata.
- Missing data must remain missing or produce an explicit unavailable state.
- Backend-derived fallback values are allowed only when the backend records their provenance and the rule is documented.
- Sealed market price is never a substitute for singles EV.
- One vendor's price must never be multiplied or copied to fabricate another vendor's price.
- Quantiles and complete-product EV are backend-owned; the browser must not simulate or reconstruct them from summary values.
- Quick-test pipeline runs must never publish generated snapshots.

## Validation

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

For valuation or data-boundary changes, verify representative generated records for a single booster, container, nested product, preconstructed deck, variable-content product, and missing-vendor or missing-quantile case.

## Pipeline boundary

`backend/daily_update.py` runs the authoritative stages and validates the complete generated bundle before publication. The frontend reads the root `public/data/` snapshots through `src/services/dataService.ts`.

The published bundle must retain shared snapshot identity, valid JSON, unique product IDs, canonical vendors, valid price modes, monotonic 100-point curves, endpoint agreement, and cross-file product references.

## Cleanup status

- Active documentation is intentionally short; older review material is archived under `docs/archive/`.
- The unused Final Fantasy importer and manual promo-price repair utility are archived under `scripts/archive/`.
- The SLD, Unsanctioned, preconstructed-deck, WPN asset, and booster-collation utilities remain active or reproducible tooling until their ownership is replaced and verified.
- Do not remove generated data or legacy code without checking references, preserving the file in an archive, and running the focused validation for its ownership boundary.

## Related guidance

- [README.md](README.md)
- [docs/architecture.md](docs/architecture.md)
- [docs/operations.md](docs/operations.md)
- [docs/archive/](docs/archive/)
