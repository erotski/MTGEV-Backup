"""Validate the generated snapshot contracts consumed by the frontend.

This is read-only: it checks every published product and booster record without
starting MySQL, regenerating Monte Carlo samples, or publishing data.
"""

import json
from collections import Counter
from pathlib import Path


DATA_DIR = Path(__file__).resolve().parents[1] / "public" / "data"
VALID_VENDORS = {"all_cheapest", "all_average", "tcgplayer", "cardmarket", "cardkingdom", "manapool"}
VALID_MODES = {"direct", "cheapest_reprint"}


def load(name):
    with (DATA_DIR / name).open("r", encoding="utf-8") as handle:
        return json.load(handle)


def validate():
    sealed_products = load("sealed_products.json")
    product_metrics = load("product_metrics.json")
    booster_evs = load("booster_ev.json")
    chase_cards = load("product_chase_cards.json")

    product_ids = [product.get("id") or product.get("uuid") for product in sealed_products]
    if any(not product_id for product_id in product_ids):
        raise ValueError("sealed_products.json contains a product without id/uuid")
    if len(product_ids) != len(set(product_ids)):
        raise ValueError("sealed_products.json contains duplicate product IDs")
    product_id_set = set(product_ids)

    metric_keys = set()
    for metric in product_metrics:
        key = (metric.get("productUuid"), metric.get("vendor"), metric.get("priceMode"))
        if not key[0] or key[0] not in product_id_set:
            raise ValueError(f"product_metrics.json references unknown product: {key[0]}")
        if key[1] not in VALID_VENDORS:
            raise ValueError(f"product_metrics.json has non-canonical vendor: {key[1]}")
        if key[2] not in VALID_MODES:
            raise ValueError(f"product_metrics.json has invalid price mode: {key[2]}")
        if key in metric_keys:
            raise ValueError(f"duplicate product metric key: {key}")
        metric_keys.add(key)
        for field in ("marketPrice", "totalEvMin", "totalEvMin5", "totalEvAvg", "totalEvMid90", "totalEvMax5", "totalEvMax"):
            if not isinstance(metric.get(field), (int, float)):
                raise ValueError(f"product metric {key} has non-numeric {field}")

    distribution_types = Counter()
    outcome_counts = Counter()
    for booster in booster_evs:
        vendor = booster.get("vendor")
        mode = booster.get("priceMode")
        if vendor not in VALID_VENDORS:
            raise ValueError(f"booster_ev.json has non-canonical vendor: {vendor}")
        if mode not in VALID_MODES:
            raise ValueError(f"booster_ev.json has invalid price mode: {mode}")
        distribution_type = booster.get("distributionType", "continuous_sampled")
        distribution_types[distribution_type] += 1
        quantiles = booster.get("quantiles") or []
        outcomes = booster.get("configurationOutcomes") or []
        if distribution_type == "continuous_sampled":
            if len(quantiles) != 100:
                raise ValueError(f"continuous booster has {len(quantiles)} quantiles")
            if any(quantiles[index] > quantiles[index + 1] for index in range(99)):
                raise ValueError("continuous booster quantiles are not monotonic")
            if abs(quantiles[0] - booster.get("evMin", quantiles[0])) > 0.02:
                raise ValueError("continuous booster minimum endpoint mismatch")
            if abs(quantiles[-1] - booster.get("evMax", quantiles[-1])) > 0.02:
                raise ValueError("continuous booster maximum endpoint mismatch")
        elif distribution_type in {"discrete_fixed_configurations", "discrete_enumerated_mixed"}:
            if not outcomes:
                raise ValueError(f"{distribution_type} booster has no configuration outcomes")
            outcome_counts[distribution_type] += len(outcomes)
            probabilities = [float(outcome.get("probability", 0)) for outcome in outcomes]
            if any(probability < 0 for probability in probabilities) or abs(sum(probabilities) - 1.0) > 0.02:
                raise ValueError(f"{distribution_type} probabilities do not sum to 1")
            if any("label" not in outcome or "ev" not in outcome for outcome in outcomes):
                raise ValueError(f"{distribution_type} outcome is missing label or ev")
        else:
            raise ValueError(f"unknown booster distribution type: {distribution_type}")

    unknown_chase_ids = set(chase_cards) - product_id_set
    if unknown_chase_ids:
        raise ValueError(f"product_chase_cards.json references unknown product: {next(iter(unknown_chase_ids))}")

    return {
        "products": len(product_ids),
        "metrics": len(product_metrics),
        "boosters": len(booster_evs),
        "chaseProducts": len(chase_cards),
        "distributionTypes": dict(distribution_types),
        "outcomeCounts": dict(outcome_counts),
    }


if __name__ == "__main__":
    print(json.dumps(validate(), indent=2, sort_keys=True))
