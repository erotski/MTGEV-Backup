# MTGEV Project Review

This is the short policy index for the project. Detailed system structure is in [docs/architecture.md](docs/architecture.md), operating procedures and validation are in [docs/operations.md](docs/operations.md), file-by-file cleanup decisions are in [docs/cleanup-inventory.md](docs/cleanup-inventory.md), and active contract-fix work is in [docs/contract-remediation.md](docs/contract-remediation.md). Historical investigations live in [docs/archive/](docs/archive/).

## Purpose

MTGEV compares sealed Magic product prices with the expected value of the cards and contents inside those products.

## Hard rules

- Use only canonical vendor keys: `all_cheapest`, `all_average`, `tcgplayer`, `cardmarket`, `cardkingdom`, and `manapool`.
- Do not reintroduce the legacy `all` vendor alias in new data or contracts.
- Frontend code must not invent EV, prices, quantiles, pack counts, product identity, or metadata.
- Missing data must remain missing or produce an explicit unavailable state.
- Backend-derived fallback values are allowed only when the backend records their provenance and the rule is documented.
- Sealed market price is never a substitute for singles EV.
- One vendor's price must never be multiplied or copied to fabricate another vendor's price outside the documented, provenance-recorded card-price fallback policy.
- Quantiles and complete-product EV are backend-owned; the browser must not simulate or reconstruct them from summary values.
- Quick-test pipeline runs must never publish generated snapshots.

## Document ownership

- [docs/architecture.md](docs/architecture.md) owns layers, module responsibilities, data boundaries, and generated-output ownership.
- [docs/operations.md](docs/operations.md) owns commands, pipeline stages, validation, release status, and cleanup procedure.
- [docs/cleanup-inventory.md](docs/cleanup-inventory.md) owns the exhaustive file inventory and candidate-by-candidate cleanup decisions.
- [docs/contract-remediation.md](docs/contract-remediation.md) owns the active plan for resolving data-ownership and fallback-contract violations.
- [docs/archive/](docs/archive/) owns historical notes and retired utilities.

## Related guidance

- [README.md](README.md)
- [docs/architecture.md](docs/architecture.md)
- [docs/operations.md](docs/operations.md)
- [docs/cleanup-inventory.md](docs/cleanup-inventory.md)
- [docs/contract-remediation.md](docs/contract-remediation.md)
- [docs/archive/](docs/archive/)
