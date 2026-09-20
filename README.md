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
- `public/data/` — local/published runtime snapshots plus the small set of pipeline inputs
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

## Data workflow

The app reads runtime snapshots from `public/data/`. Generated snapshots are not tracked on `main`; the daily pipeline builds and validates them, then publishes the complete bundle to the `data-sync` branch used for production deployment. `main` tracks only the pipeline inputs `precon_decks.json`, `booster_slots.json`, and `product_overrides.json`.

Do not hand-edit generated snapshots. Run the pipeline or update its producers instead. A fresh local checkout of `main` requires a generated data bundle for the frontend to show live data.
