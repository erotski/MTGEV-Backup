#!/usr/bin/env python3
"""
Test script to prototype and verify the 10,000-sample NumPy composite evaluation
for the 3 MTG product archetypes on The Hobbit (HOB):
1. Pure Precon (Welcome Deck)
2. Pure Randomized (Play Booster Box, Collector Booster Box)
3. Mixed Composite (The Hobbit Draft Night: 12 Play + 1 Collector, Gift Bundle: 9 Play + 1 Collector)
"""

import json
import random
import time
from ev_statistics import empirical_quantiles
from pathlib import Path

PUBLIC_DATA_DIR = Path("public/data")

def load_data():
    with open(PUBLIC_DATA_DIR / "sealed_products.json", "r", encoding="utf-8") as f:
        sealed_products = json.load(f)
    with open(PUBLIC_DATA_DIR / "booster_ev.json", "r", encoding="utf-8") as f:
        booster_ev = json.load(f)
    return sealed_products, booster_ev

def get_booster_quantiles(booster_ev, set_code, booster_name, vendor="tcgplayer", price_mode="direct"):
    """Finds 100 empirical quantiles for a booster."""
    set_code = set_code.upper()
    booster_name = booster_name.lower()
    for b in booster_ev:
        if (b.get("setCode") == set_code and 
            b.get("boosterName") == booster_name and 
            b.get("vendor") == vendor and 
            b.get("priceMode") == price_mode):
            q = b.get("quantiles")
            if q and len(q) >= 100:
                return [float(x) for x in q[:100]], float(b.get("evAverage") or 0.0)
    return None, 0.0

def simulate_composite_product(pack_specs, fixed_ev=0.0, iterations=10000):
    """
    Simulates a product with fixed EV and variable packs using pure Python standard library.
    pack_specs: list of tuples (count, quantiles_list)
    """
    t0 = time.perf_counter()
    
    # Pre-generate random uniform draws
    composite_draws = [fixed_ev] * iterations
    
    for count, q_list in pack_specs:
        if count <= 0 or not q_list:
            continue
        q_len = len(q_list)
        for _ in range(count):
            for i in range(iterations):
                # Pick a random bucket from 0..99
                composite_draws[i] += q_list[random.randint(0, q_len - 1)]

    composite_draws.sort()
    t1 = time.perf_counter()
    
    # Calculate statistics
    n = len(composite_draws)
    mean_val = sum(composite_draws) / n
    variance = sum((x - mean_val) ** 2 for x in composite_draws) / n
    std_val = variance ** 0.5
    
    # Extract the same 1%-bucket averages used by the production pipeline.
    percentiles = empirical_quantiles(composite_draws)
    
    stats = {
        "time_ms": round((t1 - t0) * 1000, 2),
        "mean": round(mean_val, 2),
        "median": percentiles[49],
        "std": round(std_val, 2),
        "min": round(composite_draws[0], 2),
        "p05": percentiles[4],
        "p25": percentiles[24],
        "p50": percentiles[49],
        "p75": percentiles[74],
        "p95": percentiles[94],
        "p99": percentiles[99],
        "max": round(composite_draws[-1], 2),
        "quantiles": percentiles
    }
    return stats

def main():
    sealed_products, booster_ev = load_data()
    hob_products = [p for p in sealed_products if (p.get("setCode") or "").upper() == "HOB"]
    
    print("=" * 70)
    print("TESTING 10,000-SAMPLE COMPOSITE EVALUATION ON THE HOBBIT (HOB)")
    print("=" * 70)
    
    vendors = ["tcgplayer", "cardmarket", "all_cheapest", "all_average"]
    
    # 1. Inspect Single Boosters
    print("\n--- SINGLE BOOSTER EMPIRICAL BENCHMARKS (TCGPLAYER) ---")
    q_play, avg_play = get_booster_quantiles(booster_ev, "HOB", "play", "tcgplayer")
    q_coll, avg_coll = get_booster_quantiles(booster_ev, "HOB", "collector", "tcgplayer")
    print(f"Play Booster:      Avg = ${avg_play:.2f} | Floor(q0) = ${q_play[0]:.2f} | Median(q50) = ${q_play[49]:.2f} | Ceiling(q99) = ${q_play[99]:.2f}")
    print(f"Collector Booster: Avg = ${avg_coll:.2f} | Floor(q0) = ${q_coll[0]:.2f} | Median(q50) = ${q_coll[49]:.2f} | Ceiling(q99) = ${q_coll[99]:.2f}")

    test_cases = [
        ("The Hobbit Draft Night", "MIXED (12 Play + 1 Collector)", [("play", 12), ("collector", 1)], 0.0),
        ("The Hobbit Gift Bundle", "MIXED (9 Play + 1 Collector + Promo/Lands)", [("play", 9), ("collector", 1)], 5.0),
        ("The Hobbit Play Booster Box", "PURE RANDOMIZED (30 Play)", [("play", 30)], 0.0),
        ("The Hobbit Collector Booster Box", "PURE RANDOMIZED (12 Collector)", [("collector", 12)], 0.0),
        ("The Hobbit Welcome Deck Black", "PURE PRECONSTRUCTED (Fixed)", [], 4.50),
    ]

    for name, archetype, pack_config, fixed_ev in test_cases:
        p = next((x for x in hob_products if x.get("displayName") == name), None)
        market_price = float(p.get("marketPrice", 0.0)) if p else 0.0
        
        print("\n" + "=" * 70)
        print(f"PRODUCT: {name}")
        print(f"Archetype: {archetype} | Market Price: ${market_price:.2f}")
        print("-" * 70)
        
        for v in vendors:
            # Build pack specs for this vendor
            pack_specs = []
            for b_name, count in pack_config:
                q_arr, _ = get_booster_quantiles(booster_ev, "HOB", b_name, vendor=v)
                if q_arr is not None:
                    pack_specs.append((count, q_arr))
            
            stats = simulate_composite_product(pack_specs, fixed_ev=fixed_ev, iterations=10000)
            
            # Find break-even percentile
            breakeven_p = None
            if market_price > 0:
                for idx, q_val in enumerate(stats["quantiles"]):
                    if q_val >= market_price:
                        breakeven_p = f"{idx + 1}% (Profitable in {100 - (idx + 1)}% of openings)"
                        break
                if not breakeven_p:
                    breakeven_p = "Unprofitable at all percentiles" if market_price > stats["max"] else "Profitable from 1%"

            print(f"[{v.upper():11s}] Compute: {stats['time_ms']}ms | Mean EV: ${stats['mean']:6.2f} (±${stats['std']:.2f})")
            print(f"              Distribution: Floor=${stats['min']:6.2f} | Q05=${stats['p05']:6.2f} | Q50(Median)=${stats['p50']:6.2f} | Q95=${stats['p95']:6.2f} | Top 1%=${stats['p99']:6.2f}")
            if market_price > 0:
                print(f"              Market: ${market_price:.2f} -> Break-even: {breakeven_p}")

if __name__ == "__main__":
    main()
