"""Export backend-owned complete-product valuation metrics.

This runs after composite_evaluator.py so vendor-specific product statistics are
available in sealed_products.json. Products Overview consumes this snapshot;
it does not reconstruct product valuation in the browser.
"""
import json
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "public" / "data"


def export_product_metrics() -> None:
    with (DATA_DIR / "sealed_products.json").open("r", encoding="utf-8") as handle:
        products = json.load(handle)

    metrics = []
    for product in products:
        product_id = product.get("id") or product.get("uuid") or product.get("productUuid")
        vendor_stats = product.get("metricsByVendor") or {}
        if not product_id or not isinstance(vendor_stats, dict):
            continue

        market_price = float(product.get("marketPrice") or 0)
        for vendor, stats in vendor_stats.items():
            if not isinstance(stats, dict):
                continue
            total_avg = float(stats.get("mean") or 0)
            total_mid90 = float(stats.get("median") or 0)
            total_min = float(stats.get("min") or 0)
            total_min5 = float(stats["p05"])
            total_max5 = float(stats["p95"])
            total_max = float(stats.get("max") or 0)
            profit = round(total_avg - market_price, 2)
            roi = round((profit / market_price) * 100, 2) if market_price > 0 else 0.0
            basis_values = {
                "min": total_min,
                "mid90": total_mid90,
                "avg": total_avg,
                "max": total_max,
            }
            profit_by_basis = {
                basis: round(value - market_price, 2)
                for basis, value in basis_values.items()
            }
            roi_by_basis = {
                basis: round((value / market_price) * 100, 2) if market_price > 0 else 0.0
                for basis, value in profit_by_basis.items()
            }
            metrics.append({
                "productUuid": product_id,
                "boxName": product.get("name") or product.get("displayName"),
                "setCode": product.get("setCode"),
                "setName": product.get("setName"),
                "category": product.get("category"),
                "marketPrice": market_price,
                "totalEvMin": total_min,
                "totalEvMin5": total_min5,
                "totalEvAvg": total_avg,
                "totalEvMid90": total_mid90,
                "totalEvMax5": total_max5,
                "totalEvMax": total_max,
                "effectiveEv": total_avg,
                "effectiveEvByBasis": basis_values,
                "profitUsd": profit,
                "profitUsdByBasis": profit_by_basis,
                "roiPct": roi,
                "roiPctByBasis": roi_by_basis,
                "evScore": stats.get("evScore"),
                "breakevenPercentile": stats.get("breakevenPercentile"),
                "packCount": int(product.get("packsCount") or 0),
                "cardCount": int(product.get("cardCount") or 0),
                "vendor": vendor,
                "priceMode": "direct",
                "provenance": {
                    "source": "pipeline",
                    "schemaVersion": 1,
                    "archetype": product.get("archetype"),
                    "fixedPricing": (product.get("fixedPricingByVendor") or {}).get(vendor),
                },
            })

    with (DATA_DIR / "product_metrics.json").open("w", encoding="utf-8") as handle:
        json.dump(metrics, handle, indent=2, allow_nan=False)
    print(f"[SUCCESS] Exported {len(metrics)} complete-product vendor metrics")


if __name__ == "__main__":
    export_product_metrics()
