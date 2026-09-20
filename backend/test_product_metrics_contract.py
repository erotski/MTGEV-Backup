"""Contract checks for the backend-owned complete-product metrics snapshot."""
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data"
REQUIRED_FIELDS = {
    "productUuid",
    "marketPrice",
    "totalEvMin",
    "totalEvMin5",
    "totalEvAvg",
    "totalEvMid90",
    "totalEvMax5",
    "totalEvMax",
    "effectiveEv",
    "profitUsd",
    "roiPct",
    "evScore",
    "breakevenPercentile",
    "packCount",
    "cardCount",
    "vendor",
    "priceMode",
    "provenance",
    "primaryCategory",
    "categoryTags",
}


def load(name):
    with (DATA / name).open("r", encoding="utf-8") as handle:
        return json.load(handle)


def main() -> None:
    metrics = load("product_metrics.json")
    sealed = load("sealed_products.json")
    assert isinstance(metrics, list) and metrics, "product_metrics.json is empty"
    sealed_ids = {p.get("id") or p.get("uuid") for p in sealed if isinstance(p, dict)}
    sealed_taxonomy = {
        p.get("id") or p.get("uuid"): (p.get("primaryCategory"), p.get("categoryTags"))
        for p in sealed
        if isinstance(p, dict)
    }
    seen = set()
    categories = set()

    for index, record in enumerate(metrics):
        missing = REQUIRED_FIELDS - record.keys()
        assert not missing, f"record {index} missing {sorted(missing)}"
        identity = (record["productUuid"], record["vendor"], record["priceMode"])
        assert identity not in seen, f"duplicate metric identity: {identity}"
        seen.add(identity)
        assert record["productUuid"] in sealed_ids, f"unknown product: {record['productUuid']}"
        assert (record["primaryCategory"], record["categoryTags"]) == sealed_taxonomy[record["productUuid"]]
        assert record["priceMode"] == "direct", "unexpected product metric price mode"
        assert record["provenance"].get("source") == "pipeline"
        assert record["provenance"].get("schemaVersion") == 1

        minimum = record["totalEvMin"]
        p05 = record["totalEvMin5"]
        average = record["totalEvAvg"]
        mid90 = record["totalEvMid90"]
        p95 = record["totalEvMax5"]
        maximum = record["totalEvMax"]
        values = [minimum, p05, average, mid90, p95, maximum]
        assert all(isinstance(value, (int, float)) for value in values)
        assert minimum <= p05 <= mid90 <= p95 <= maximum, f"invalid percentile bounds: {identity}"
        assert minimum <= average <= maximum, f"invalid average bounds: {identity}"
        assert isinstance(record["evScore"], int) and 0 <= record["evScore"] <= 100
        assert isinstance(record["breakevenPercentile"], int) and 1 <= record["breakevenPercentile"] <= 100
        assert record["packCount"] >= 0 and record["cardCount"] >= 0
        categories.add(record.get("category"))

    expected_categories = {"booster_pack", "booster_box", "booster_case", "bundle", "deck", "box_set"}
    missing_categories = expected_categories - categories
    assert not missing_categories, f"missing representative product categories: {sorted(missing_categories)}"
    print(f"OK validated {len(metrics)} product metric records across {len(categories)} categories")


if __name__ == "__main__":
    main()
