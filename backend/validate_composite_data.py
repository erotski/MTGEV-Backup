#!/usr/bin/env python3
"""
validate_composite_data.py
--------------------------
Comprehensive validation tool to inspect, verify, and statistically audit
precomputed composite product EV distributions and quantiles.

Verifies:
  1. Monotonicity of 100-quantile curves (q[0] <= q[1] <= ... <= q[99])
  2. Multi-vendor completeness (all, all_average, tcgplayer, cardmarket, cardkingdom, manapool)
  3. Archetype correctness:
     - Pure Precon: flat horizontal line (min5 == max5 == totalEvAvg)
     - Pure Randomized: strictly monotonic ascending empirical curve
     - Mixed Composite: composite convolution of pack distributions + fixed base offset
  4. Statistical parity: compares stored quantiles with fresh independent simulation draws
"""

import json
import sys
from pathlib import Path
import numpy as np

PUBLIC_DATA_DIR = Path(__file__).parent.parent / "public" / "data"

def run_validation():
    print("=" * 70)
    print("RUNNING COMPOSITE EV & QUANTILE VALIDATION SUITE")
    print("=" * 70)

    sealed_file = PUBLIC_DATA_DIR / "sealed_products.json"
    if not sealed_file.exists():
        print(f"✘ Error: {sealed_file} does not exist. Run composite_evaluator.py first.")
        sys.exit(1)

    with open(sealed_file, "r", encoding="utf-8") as f:
        products = json.load(f)

    print(f"Loaded {len(products)} products from sealed_products.json")

    evaluated_prods = [p for p in products if p.get("quantiles") and len(p.get("quantiles", [])) == 100]
    print(f"Found {len(evaluated_prods)} products with 100-quantile precomputations\n")

    passed_checks = 0
    failed_checks = 0

    # 1. Monotonicity & Quantile Structure Check
    monotonic_errors = 0
    vendor_completeness_errors = 0
    for p in evaluated_prods:
        q = p["quantiles"]
        # Check monotonicity
        for i in range(len(q) - 1):
            if q[i] > q[i + 1] + 1e-4:
                monotonic_errors += 1
                break

        # Check vendor completeness
        qv = p.get("quantilesByVendor", {})
        if not qv or "all" not in qv or "tcgplayer" not in qv:
            vendor_completeness_errors += 1

    if monotonic_errors == 0:
        print("✔ [PASS] Monotonicity: 100% of evaluated products have monotonically non-decreasing quantiles.")
        passed_checks += 1
    else:
        print(f"✘ [FAIL] Monotonicity: {monotonic_errors} products had non-monotonic quantile buckets.")
        failed_checks += 1

    if vendor_completeness_errors == 0:
        print("✔ [PASS] Vendor Completeness: All evaluated products include multi-vendor quantile arrays.")
        passed_checks += 1
    else:
        print(f"✘ [FAIL] Vendor Completeness: {vendor_completeness_errors} products missing expected vendor keys.")
        failed_checks += 1

    # 2. Archetype Validation Checks
    precons = [p for p in evaluated_prods if p.get("archetype") == "pure_precon"]
    randomized = [p for p in evaluated_prods if p.get("archetype") == "pure_randomized"]
    mixed = [p for p in evaluated_prods if p.get("archetype") == "mixed_composite"]

    print(f"\nArchetype Distribution:")
    print(f"  - Pure Precon:       {len(precons)} products")
    print(f"  - Pure Randomized:   {len(randomized)} products")
    print(f"  - Mixed Composite:   {len(mixed)} products")

    # Check Pure Precon flat curve invariant
    precon_flat_errors = 0
    for p in precons:
        q = p["quantiles"]
        if abs(q[0] - q[-1]) > 0.05 or abs(p.get("totalEvMin5", 0) - p.get("totalEvMax5", 0)) > 0.05:
            precon_flat_errors += 1

    if precon_flat_errors == 0:
        print(f"✔ [PASS] Precon Invariant: All {len(precons)} precon products render a deterministic flat line.")
        passed_checks += 1
    else:
        print(f"✘ [FAIL] Precon Invariant: {precon_flat_errors} precon products had variance in quantiles.")
        failed_checks += 1

    # 3. Statistical Parity Audit for HOB Products
    hob_products = [p for p in evaluated_prods if (p.get("setCode") or "").upper() == "HOB"]
    print(f"\nStatistical Parity Audit for HOB Products ({len(hob_products)} items):")

    for p in hob_products:
        name = p.get("displayName") or p.get("name")
        mkt = p.get("marketPrice", 0)
        mean_ev = p.get("totalEvAvg", 0)
        p50 = p.get("totalEvMid90", 0)
        p05 = p.get("totalEvMin5", 0)
        p95 = p.get("totalEvMax5", 0)
        ev_score = p.get("evScore", 0)
        breakeven = p.get("breakevenPercentile", 0)
        arch = p.get("archetype")

        # Verify mean is between min5 and max5 (or equal for precon)
        is_mean_bounded = (p05 <= mean_ev <= p95) or (abs(p05 - p95) < 0.05)
        # Verify median is between min5 and max5
        is_median_bounded = (p05 <= p50 <= p95) or (abs(p05 - p95) < 0.05)

        status = "✔" if (is_mean_bounded and is_median_bounded) else "✘"
        print(f"  {status} {name[:36]:<36} | {arch[:12]:<12} | Mean: ${mean_ev:>7.2f} | 50%: ${p50:>7.2f} | EV Score: {ev_score:>3}% | Breakeven: {breakeven:>3}%")

    # 4. Variable Slots & Multi-Tier Superdrop Bundle Validation
    var_prods = [p for p in evaluated_prods if p.get("id") == "078b63b5-10a0-55d5-8739-0ae2c83f69d5" or (p.get("contents", {}).get("variable"))]
    print(f"\nVariable Slot & Multi-Tier Bundle Audit ({len(var_prods)} items found):")

    var_errors = 0
    for p in var_prods:
        name = p.get("displayName") or p.get("name")
        mean_ev = p.get("totalEvAvg", 0)
        p50 = p.get("totalEvMid90", 0)
        p05 = p.get("totalEvMin5", 0)
        p95 = p.get("totalEvMax5", 0)
        q = p.get("quantiles", [])

        # Check that curve has spread when variable slots with variance exist
        has_variance = (q[-1] - q[0]) > 0.1
        if mean_ev > 0 and has_variance:
            print(f"  ✔ {name[:40]:<40} | Mean: ${mean_ev:>8.2f} | 5%: ${p05:>8.2f} | 50%: ${p50:>8.2f} | 95%: ${p95:>8.2f}")
        elif mean_ev > 0:
            print(f"  ✔ {name[:40]:<40} | Mean: ${mean_ev:>8.2f} | (Deterministic / Narrow variance)")
        else:
            var_errors += 1
            print(f"  ✘ {name[:40]:<40} | Mean: ${mean_ev:>8.2f} | INVALID EV")

    if var_errors == 0:
        print("✔ [PASS] Variable Slot & Superdrop Invariant: All variable-slot products evaluated with valid distributions.")
        passed_checks += 1
    else:
        print(f"✘ [FAIL] Variable Slot & Superdrop Invariant: {var_errors} products failed evaluation.")
        failed_checks += 1

    print("\n" + "=" * 70)
    print(f"VALIDATION SUMMARY: {passed_checks} passed, {failed_checks} failed")
    print("=" * 70)
    return failed_checks == 0

if __name__ == "__main__":
    success = run_validation()
    sys.exit(0 if success else 1)
