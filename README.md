# MTGEV

MTGEV compares sealed MTG product pricing against the expected value of the cards and contents inside those products.

## Project purpose

- Evaluate sealed product EV and product-level value
- Compare market price vs expected singles value
- Support vendor and price-mode views
- Surface product chase cards and product metrics
- Publish generated data snapshots for the frontend

## App structure

- `backend/` — Python pipeline for pricing, EV simulation, validation, and export
- `src/` — React frontend for product exploration and controls
- `public/data/` — generated snapshot data used by the app at runtime
- `scripts/` — one-off ingestion and maintenance scripts
- `docs/` — current operational and architecture docs

## Quick start

```bash
npm install
npm run lint
npm run build
npm run dev
```

## Source-of-truth docs

- [PROJECT_REVIEW.md](PROJECT_REVIEW.md) — current rules and decision summary
- [docs/architecture.md](docs/architecture.md) — structural overview
- [docs/operations.md](docs/operations.md) — runbook and command guide

## Important rule

The active app data is generated and published under `public/data/`; source code and documentation should stay separate from generated snapshots.
