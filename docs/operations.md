# Operations and runbook

## Local validation

```bash
npm run lint
npm run build
npm run dev
```

## Safe cleanup rules

- Do not delete generated data under `public/data/` without understanding the pipeline.
- Keep source docs separate from generated snapshots.
- Move legacy notes or experiments to `docs/archive/` instead of leaving them in active docs.
- Keep one source of truth per concern.

## Production workflow

The canonical daily pipeline runs in GitHub Actions. Local quick tests are for validation only and must not publish to the generated-data branch.

## Known risk areas

- `src/types.ts` — canonical app contracts
- `backend/daily_update.py` — orchestration and publication gate
- `public/data/` — generated snapshots used by frontend
- `backend/price_resolver.py` — vendor and provenance logic

## Cleanup policy

When removing legacy code or notes:

1. Archive it first.
2. Verify the app still compiles.
3. Commit the cleanup separately from logic changes.
4. Keep the docs focused on the current operating reality.
