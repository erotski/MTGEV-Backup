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

Runtime data lives in `public/data/` and is treated as generated output, not hand-edited source code.

## Ownership boundaries

- Backend owns pricing semantics, EV simulation, quantiles, and provenance.
- Frontend owns loading, navigation, presentation, and UI formatting.
- Documentation owns operational constraints and current status.

## Canonical vendor contract

The app uses exactly these vendor keys:

- `all_cheapest`
- `all_average`
- `tcgplayer`
- `cardmarket`
- `cardkingdom`
- `manapool`

The legacy `all` alias is not part of the canonical contract and should not be reintroduced in new code.
