"""Inventory Jumpstart records in the published root data snapshots.

This is a read-only diagnostic. It does not connect to MySQL or modify data.
"""
import json
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data"


def load(name):
    with (DATA / name).open("r", encoding="utf-8") as handle:
        return json.load(handle)


def main():
    booster_records = load("booster_ev.json")
    sealed_products = load("sealed_products.json")

    jumpstart = [
        record for record in booster_records
        if (record.get("boosterName") or "").lower() == "jumpstart"
    ]
    by_set = defaultdict(list)
    for record in jumpstart:
        by_set[(record.get("setCode") or "").upper()].append(record)

    print(f"Jumpstart booster record count: {len(jumpstart)}")
    print("Set codes and record coverage:")
    for set_code in sorted(by_set):
        records = by_set[set_code]
        modes = Counter(record.get("priceMode") or "unknown" for record in records)
        vendors = Counter(record.get("vendor") or "unknown" for record in records)
        print(f"  {set_code}: records={len(records)} modes={dict(sorted(modes.items()))} vendors={dict(sorted(vendors.items()))}")

    products = [
        product for product in sealed_products
        if "jumpstart" in (product.get("displayName") or "").lower()
        or "jumpstart" in (product.get("subtype") or "").lower()
    ]
    print(f"Matching sealed-product records: {len(products)}")
    for product in sorted(products, key=lambda item: ((item.get("setCode") or ""), (item.get("displayName") or ""))):
        print(f"  {(product.get('setCode') or '').upper()} | {product.get('displayName')}")


if __name__ == "__main__":
    main()
