# Architecture overview

## Layers

### Backend pipeline

The backend pipeline owns the authoritative EV, pricing, and output generation logic.

Key responsibilities:

- ingest MTGJSON and pricing feeds
- resolve vendor and reprint pricing
- simulate booster and product EV distributions
- generate product metrics and chase-card exports
- validate the generated output before publishing

Important files:

- `backend/daily_update.py` — orchestration entry point
- `backend/populate_booster_ev_to_db.py` — booster EV generation
- `backend/composite_evaluator.py` — product/composite EV logic
- `backend/price_resolver.py` — pricing and provenance rules
- `backend/export_app_data.py` — snapshot generation

### Frontend app

The frontend is presentation-oriented. It consumes generated data snapshots and renders the interactive exploration UI.

Important files:

- `src/App.tsx` — global state and shell
- `src/types.ts` — shared TypeScript contracts
- `src/services/dataService.ts` — data loading boundary
- `src/components/` — UI and presentation views

### Published data

Runtime data lives in `public/data/`. Generated snapshots are ignored on `main`, built and validated by the pipeline, and published as a complete bundle to the `data-sync` branch. `main` retains only the pipeline inputs `precon_decks.json`, `booster_slots.json`, and `product_overrides.json`.

## Ownership boundaries

- Backend owns pricing semantics, EV simulation, quantiles, and provenance.
- Frontend owns loading, navigation, presentation, and UI formatting.
- Documentation owns operational constraints and current status.

## Pipeline boundary

`backend/daily_update.py` runs the authoritative stages and validates the complete generated bundle before publication. The workflow starts from `main`, copies the generated output into place, and publishes it to `data-sync`. The frontend reads the published `public/data/` snapshots through `src/services/dataService.ts`.

The published bundle must retain shared snapshot identity, valid JSON, unique product IDs, canonical vendors, valid price modes, monotonic 100-point continuous curves or the correct cardinality and ordering for special fixed/discrete x-axis curves, endpoint or outcome agreement, and cross-file product references.

## Generated-output ownership

| Output area | Producer or owner | Frontend consumer |
| --- | --- | --- |
| `public/data/sets.json` | `backend/export_app_data.py` | Set navigation and hierarchy |
| `public/data/sealed_products.json` | `backend/export_app_data.py` and `backend/composite_evaluator.py` | Product explorer and rankings |
| `public/data/booster_ev.json` | `backend/export_app_data.py` from MySQL EV results | Booster explorer and product composition |
| `public/data/product_metrics.json` | `backend/export_product_metrics.py` | Complete-product valuation views |
| `public/data/product_chase_cards.json` | `backend/export_product_chase_cards.py` | Chase-card viewer |
| `public/data/precon_decks.json` | Tracked pipeline input; deck ingestion tooling and pipeline stages may update it | Preconstructed-deck views |
| `public/data/booster_slots.json` | Tracked pipeline input | Booster slot fallback data |
| `public/data/product_overrides.json` | Tracked optional pipeline input | Product export and evaluation overrides |
| `public/data/scryfall_set_hierarchy.json` | `backend/export_set_hierarchy.py` | Set hierarchy utilities |
| Remaining `public/data/*.json` | Pipeline stages, static catalog inputs, or telemetry producers | `src/services/dataService.ts` and related loaders |

All files under `public/data/` are runtime data. The three tracked input files are source/configuration data; generated files must be changed through their producer and publication workflow, never by hand. A local checkout without generated snapshots is expected to have an empty or degraded frontend until a pipeline bundle is supplied.

## Canonical vendor contract

The app uses exactly these vendor keys:

- `all_cheapest`
- `all_average`
- `tcgplayer`
- `cardmarket`
- `cardkingdom`
- `manapool`

The legacy `all` alias is not part of the canonical contract and should not be reintroduced in new code.
