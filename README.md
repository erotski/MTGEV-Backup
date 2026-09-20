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

The app reads runtime snapshots from `public/data/`. Generated snapshots are not tracked on `main`; the daily pipeline builds and validates them, then publishes the complete bundle to the `data-sync` branch used for production deployment. `main` tracks only the pipeline inputs `precon_decks.json`, `booster_slots.json`, `product_overrides.json`, and `product_taxonomy_overrides.json`.

Do not hand-edit generated snapshots. Run the pipeline or update its producers instead. A fresh local checkout of `main` requires a generated data bundle for the frontend to show live data.

## Product category filters

`backend/product_taxonomy.py` classifies every MySQL sealed-product record once. It preserves the raw `category`, derives one `primaryCategory`, and emits reusable `categoryTags` from category, subtype, structured contents, and finally product name. Explicit UUID overrides are applied last.

Both Products and Booster EV & Chase Cards use `PRODUCT_CATEGORY_DEFINITIONS` in `src/config/productCategories.ts`. A product can match multiple filters, such as Booster Boxes and Jumpstart. Filters with no products are hidden in the selected-set view. Set a definition's `enabled` field to `false` to remove a small standalone filter; products not matching another enabled definition flow to Other.

To override one automatic decision without editing MySQL, add its UUID to `public/data/product_taxonomy_overrides.json`:

```json
{
	"product-uuid": {
		"primaryCategory": "bundle",
		"addTags": ["secret_lair", "gift"],
		"removeTags": ["box_set"],
		"reason": "Sold as a multi-drop bundle"
	}
}
```

`primaryCategory`, `addTags`, and `removeTags` are optional. Regenerate the snapshots after an override change. Do not edit `sealed_products.json`, `product_metrics.json`, or `arbitrage_leaderboard.json` directly.
