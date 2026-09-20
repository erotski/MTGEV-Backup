# Cleanup Inventory

Status: initial inventory, 2026-09-20

This document records the cleanup boundary for MTGEV. It is based on the workspace scan of 1,541 files: 1,537 tracked files plus 4 non-ignored untracked files. No files were deleted by this inventory pass.

The project rules in [PROJECT_REVIEW.md](../PROJECT_REVIEW.md) are authoritative. `public/data/` contains three tracked pipeline inputs plus generated or published data; generated files are not tracked on `main` and must not be hand-edited. A cleanup decision is not permission to delete a file until its references and owning validation have been checked.

## Decision key

- **Keep**: active source, required runtime input, or required project configuration.
- **Keep/generated**: generated or published output; change the producer, never hand-edit the file.
- **Keep/archive**: historical or retired material retained for traceability.
- **Review**: possible cleanup candidate; requires an explicit reference and validation check.
- **Delete after validation**: apparently local/generated debris, removable only after confirming it is not needed by a workflow or developer process.

## Immediate candidates

| Candidate | Owner | References/evidence | Decision |
| --- | --- | --- | --- |
| `backend/unittest.out` | Backend validation | Output artifact; no production ownership identified | Delete after confirming it is not a developer-kept test transcript; add the pattern to `.gitignore` if it is regenerated. |
| `backend/validator.out` | Backend validation | Output artifact; no production ownership identified | Delete after confirming it is not consumed by CI; add the pattern to `.gitignore` if it is regenerated. |
| `package.json` `clean` script | Frontend tooling | Uses Unix `rm -rf`; project is developed on Windows | Review and replace with a cross-platform command or remove if unused. |
| `docs/archive/project-review-2026-09-19.md` | Documentation | Duplicates older project-review guidance; active guidance is in `PROJECT_REVIEW.md`, `docs/architecture.md`, and `docs/operations.md` | Keep/archive for now; review for deletion only after confirming the historical record is unnecessary. |
| `scripts/archive/ingest_final_fantasy_commander.cjs` | Retired ingestion | Archived and not referenced by active code | Keep/archive; delete only in a separately approved historical cleanup. |
| `scripts/archive/fix_anomalous_promo_prices.py` | Retired repair utility | Archived and not referenced by active code | Keep/archive; do not run against generated data. |
| `public/data/snapshot_manifest.json` | Pipeline/publication | Produced and validated by `backend/daily_update.py`; consumed as published bundle identity | Keep/generated. Fix the producer if its file list is wrong; never hand-edit the snapshot. |
| `public/data/scryfall_set_hierarchy.json` | Set hierarchy pipeline | Produced by `backend/export_set_hierarchy.py`; loaded by `src/utils/setHierarchyUtils.ts` | Keep/generated. It is not removable while the frontend loader depends on it. |

## Ownership map

| Area | Owner | References | Decision |
| --- | --- | --- | --- |
| `.github/workflows/` | CI and publication | Daily, weekly validation, and collation workflows | Keep. |
| `backend/` production scripts | Data pipeline | Orchestrated by `backend/daily_update.py` or called by workflows | Keep unless a reference audit proves a stage obsolete. |
| `backend/test_*.py` | Backend validation | Focused tests and workflow validation | Keep. |
| `backend/validate_*.py` | Backend validation | Daily pipeline, weekly workflow, or documented manual checks | Keep. |
| `scripts/` active utilities | Data ingestion and asset preparation | Preconstructed decks, SLD, Unsanctioned, WPN, and packaging workflows | Keep until ownership is replaced and reproducibility is verified. |
| `scripts/archive/` | Historical tooling | No active references found | Keep/archive. |
| `src/` | Frontend application | `src/main.tsx`, `src/App.tsx`, component imports, and `src/services/dataService.ts` | Keep; use TypeScript and build checks before removing anything. |
| `public/data/` | Tracked pipeline inputs plus generated/public data | Backend producers and frontend data service | Keep inputs tracked; ignore generated output on `main`; publish the validated bundle to `data-sync`. |
| `public/products/` | Frontend product media | Product asset matching and packaging components | Keep unless an asset-level reference audit proves an image unused. |
| `docs/` | Project guidance | README and project review links | Keep active docs short; archive historical material. |

## Complete file inventory

The following names every non-media file in the scan and every generated data file. The product image corpus is listed by exact set directory below because it contains 1,390+ individual PNG/JPG files; the reproducible command at the end expands every media path exactly.

### Root files

- `.env.example`
- `.gitignore`
- `.vercelignore`
- `bun.lock`
- `index.html`
- `metadata.json`
- `package.json`
- `PROJECT_REVIEW.md`
- `README.md`
- `tsconfig.json`
- `vite.config.ts`

### GitHub workflows

- `.github/workflows/daily_mtg_ev_update.yml`
- `.github/workflows/refresh_booster_collation_metadata.yml`
- `.github/workflows/weekly_snapshot_validation.yml`

### Backend

- `backend/composite_evaluator.py`
- `backend/config.py`
- `backend/daily_update.py`
- `backend/download.py`
- `backend/download_prices_today.py`
- `backend/ev_statistics.py`
- `backend/export_app_data.py`
- `backend/export_jumpstart_validation_report.py`
- `backend/export_product_chase_cards.py`
- `backend/export_product_metrics.py`
- `backend/export_set_hierarchy.py`
- `backend/inventory_jumpstart.py`
- `backend/load_deck_tables.py`
- `backend/lowest_prices.py`
- `backend/populate_booster_ev_to_db.py`
- `backend/price_resolver.py`
- `backend/sync_booster_fixed_metadata.py`
- `backend/sync_live_sealed_prices.py`
- `backend/test_booster_fixed_metadata.py`
- `backend/test_booster_fixed_metadata_corpus.py`
- `backend/test_daily_update_contract.py`
- `backend/test_ev_statistics.py`
- `backend/test_frontend_snapshot.py`
- `backend/test_jumpstart_collation.py`
- `backend/test_jumpstart_validation_report.py`
- `backend/test_pipeline_bucket_contract.py`
- `backend/test_pricing_validator.py`
- `backend/test_product_chase_cards.py`
- `backend/test_product_metrics_contract.py`
- `backend/unittest.out`
- `backend/validate_composite_data.py`
- `backend/validate_frontend_snapshot.py`
- `backend/validate_pricing_and_ev.py`
- `backend/validator.out`

### Documentation

- `docs/architecture.md`
- `docs/cleanup-inventory.md`
- `docs/operations.md`
- `docs/archive/legacy-project-review.md`
- `docs/archive/project-review-2026-09-19.md`

### Active scripts

- `scripts/build_precon_decks.py`
- `scripts/deck_price_provenance.py`
- `scripts/enrich_precon_decks.py`
- `scripts/ingest_mtgjson_precons.py`
- `scripts/ingest_sld_decks.py`
- `scripts/ingest_unsanctioned_decks.py`
- `scripts/ingest-wpn.js`
- `scripts/process_wpn_assets.py`
- `scripts/archive/fix_anomalous_promo_prices.py`
- `scripts/archive/ingest_final_fantasy_commander.cjs`

### Frontend source

- `src/App.tsx`
- `src/ecommerceBoosterData.ts`
- `src/index.css`
- `src/main.tsx`
- `src/types.ts`
- `src/components/AdminPortal.tsx`
- `src/components/AdminSecurityGate.tsx`
- `src/components/AdminUserManagement.tsx`
- `src/components/ArbitrageLeaderboard.tsx`
- `src/components/BoosterDetailExplorer.tsx`
- `src/components/BoosterDisplayBoxMockup.tsx`
- `src/components/BoosterFoilPackMockup.tsx`
- `src/components/BoosterSlotViewer.tsx`
- `src/components/CollectorBoosterBoxMockup.tsx`
- `src/components/ErrorBoundary.tsx`
- `src/components/GlobalControlFooter.tsx`
- `src/components/ManaCostRenderer.tsx`
- `src/components/PackagingAssetManager.tsx`
- `src/components/PackagingStockAssetGuide.tsx`
- `src/components/PackDistributionCurve.tsx`
- `src/components/PreconstructedDeckViewer.tsx`
- `src/components/ProductBreakdownModal.tsx`
- `src/components/ProductBreakdownTable.tsx`
- `src/components/ProductChaseCardsViewer.tsx`
- `src/components/ProductHierarchyInspector.tsx`
- `src/components/ProductPackagingImage.tsx`
- `src/components/RelatedProductsHierarchy.tsx`
- `src/components/SetSymbolIcon.tsx`
- `src/components/SingleCardBreakdownViewer.tsx`
- `src/components/SpecialChaseShowcase.tsx`
- `src/services/adminAuthService.ts`
- `src/services/dataService.ts`
- `src/utils/catalogProductLoader.ts`
- `src/utils/evScore.ts`
- `src/utils/productAssetMatcher.ts`
- `src/utils/productUtils.ts`
- `src/utils/scryfallApi.ts`
- `src/utils/setHierarchyUtils.ts`
- `src/utils/vendorUtils.ts`

### Public data files

- `public/data/arbitrage_leaderboard.json`
- `public/data/booster_collation_overrides.json`
- `public/data/booster_ev.json`
- `public/data/booster_slots.json`
- `public/data/jumpstart_validation_report.json`
- `public/data/latest_pipeline_run.json`
- `public/data/pipeline_execution_logs.json`
- `public/data/precon_decks.json`
- `public/data/pricing_reliability.json`
- `public/data/pricing_validator_diagnostics.json`
- `public/data/product_chase_cards.json`
- `public/data/product_metrics.json`
- `public/data/product_overrides.json`
- `public/data/sealed_products.json`
- `public/data/sets.json`
- `public/data/single_card_prices.json`
- `public/data/snapshot_manifest.json`

### Other tracked project files

- `assets/.aistudio/.gitignore`
- `public/products/README.md`

### Product media directories

Every file under these directories is a frontend-owned product asset. Do not delete by filename pattern alone; compare against product IDs, `productAssetMatcher.ts`, and the generated product catalog first.

- `public/products/acr/`
- `public/products/blb/`
- `public/products/dft/`
- `public/products/dsk/`
- `public/products/ecl/`
- `public/products/eoe/`
- `public/products/fdn/`
- `public/products/fin/`
- `public/products/fra/`
- `public/products/hob/`
- `public/products/inr/`
- `public/products/lci/`
- `public/products/ltrh/`
- `public/products/mh3/`
- `public/products/mkm/`
- `public/products/msh/`
- `public/products/otj/`
- `public/products/pds/`
- `public/products/pip/`
- `public/products/rvr/`
- `public/products/sld/`
- `public/products/sos/`
- `public/products/spm/`
- `public/products/tdm/`
- `public/products/tmt/`
- `public/products/trk/`
- `public/products/who/`

## Reproduce the exact complete inventory

Run from the repository root in PowerShell. This prints every file, including every product image, and excludes ignored build/cache directories. The output is the authoritative expansion of the directory list above.

```powershell
Get-ChildItem -LiteralPath . -Recurse -File | Where-Object {
  $_.FullName -notmatch '\\node_modules\\|\\dist\\|\\build\\|\\coverage\\|\\__pycache__\\|\\.git\\'
} | ForEach-Object {
  $_.FullName.Substring((Get-Location).Path.Length + 1).Replace('\\', '/')
} | Sort-Object
```

## Validation gate for cleanup

For any deletion affecting code, configuration, generated-data producers, or frontend assets:

```cmd
npm.cmd run lint
npm.cmd run build
py -3.12 -m py_compile backend\daily_update.py
py -3.12 -m unittest backend.test_ev_statistics backend.test_pipeline_bucket_contract
```

For generated-data or publication changes, also run the focused validator described in [docs/operations.md](operations.md), and require the audited GitHub workflow before treating a regenerated snapshot as final.
