#!/usr/bin/env python3
"""
Composite Product EV Evaluator for MTG Products
Evaluates the 3 product archetypes with 10,000-sample Monte Carlo simulations:
1. Purely Preconstructed (Commander Decks, Starter Decks, Fixed Secret Lairs):
   - Zero pack variance; 100 identical quantiles equal to sum of singles.
2. Purely Randomized (Booster Packs, Booster Boxes, Cases):
   - Multi-pack convolution across empirical booster pack quantiles.
3. Mixed (Draft Night, Bundles / Gift Bundles, Scene Boxes, SLD with Bonus Cards):
   - Fixed base floor (promos, lands, decks) + multi-pack booster quantiles.

Outputs pre-computed 100-bucket quantiles by vendor, exact breakeven percentiles,
and statistical telemetry directly into sealed_products.json and arbitrage_leaderboard.json.
"""

import json
import random
import time
from pathlib import Path

try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False

ROOT_DIR = Path(__file__).resolve().parent.parent
PUBLIC_DATA_DIR = ROOT_DIR / "public" / "data"
DIST_DATA_DIR = ROOT_DIR / "dist" / "data"

VENDORS = ["all", "all_average", "tcgplayer", "cardmarket", "cardkingdom", "manapool"]

def load_data():
    with open(PUBLIC_DATA_DIR / "sealed_products.json", "r", encoding="utf-8") as f:
        sealed_products = json.load(f)
    with open(PUBLIC_DATA_DIR / "booster_ev.json", "r", encoding="utf-8") as f:
        booster_ev = json.load(f)
    
    precon_decks = {}
    precon_path = PUBLIC_DATA_DIR / "precon_decks.json"
    if precon_path.exists():
        try:
            with open(precon_path, "r", encoding="utf-8") as f:
                raw_precon = json.load(f)
                if isinstance(raw_precon, dict):
                    precon_decks = raw_precon.get("decks", raw_precon)
        except Exception as e:
            print(f"[WARN] Error reading precon_decks.json: {e}")

    single_prices = {}
    single_path = PUBLIC_DATA_DIR / "single_card_prices.json"
    if single_path.exists():
        try:
            with open(single_path, "r", encoding="utf-8") as f:
                single_prices = json.load(f)
        except Exception as e:
            print(f"[WARN] Error reading single_card_prices.json: {e}")

    return sealed_products, booster_ev, precon_decks, single_prices

def build_booster_lookup(booster_ev_list):
    """Index booster EV records by (setCode, boosterName, vendor, priceMode)."""
    lookup = {}
    for b in booster_ev_list:
        sc = (b.get("setCode") or "").upper()
        bn = (b.get("boosterName") or "").lower()
        v = (b.get("vendor") or "all").lower()
        pm = (b.get("priceMode") or "direct").lower()
        q = b.get("quantiles")
        avg = float(b.get("evAverage") or 0.0)
        
        if q and len(q) >= 100:
            key = (sc, bn, v, pm)
            lookup[key] = {
                "quantiles": [float(x) for x in q[:100]],
                "evAverage": avg,
                "evMid90": float(b.get("evMid90") or avg),
                "evMin": float(b.get("evMin") or 0.0),
                "evMax": float(b.get("evMax") or 0.0)
            }
    return lookup

def resolve_product_contents(prod_id, product_map, visited=None):
    """Recursively resolves all child packs, cards, and decks in a product."""
    if visited is None:
        visited = set()
    if prod_id in visited:
        return {"packs": {}, "cards": [], "decks": []}
    visited.add(prod_id)

    prod = product_map.get(prod_id)
    if not prod:
        return {"packs": {}, "cards": [], "decks": []}

    c = prod.get("contents") or {}
    packs = {}
    cards = list(c.get("card", []))
    decks = list(c.get("deck", []))

    # 1. Sealed items (e.g. packs, sub-boxes, display cases)
    for s in c.get("sealed", []):
        s_count = int(s.get("count", 1) or 1)
        child_uuid = s.get("uuid")
        child_set = (s.get("set") or prod.get("setCode") or "").upper()
        child_name = (s.get("name") or "").lower()

        if child_uuid and child_uuid in product_map:
            sub = resolve_product_contents(child_uuid, product_map, visited.copy())
            for (p_set, p_code), cnt in sub["packs"].items():
                k = (p_set, p_code)
                packs[k] = packs.get(k, 0) + cnt * s_count
            cards.extend(sub["cards"] * s_count)
            decks.extend(sub["decks"] * s_count)
        else:
            # Infer booster type from child name if no child product in database
            b_code = "play"
            if "collector" in child_name:
                b_code = "collector"
            elif "play" in child_name:
                b_code = "play"
            elif "draft" in child_name:
                b_code = "draft"
            elif "set" in child_name and "booster" in child_name:
                b_code = "set"
            elif "topper" in child_name:
                b_code = "box-topper"
            elif "prerelease" in child_name:
                b_code = "prerelease"
            elif "jumpstart" in child_name:
                b_code = "jumpstart"
            elif "sample" in child_name:
                b_code = "collector-sample"
            packs[(child_set, b_code)] = packs.get((child_set, b_code), 0) + s_count

    # 2. Direct pack array
    for pk in c.get("pack", []):
        pk_cnt = int(pk.get("count", 1) or 1)
        pk_set = (pk.get("set") or prod.get("setCode") or "").upper()
        pk_code = (pk.get("code") or "play").lower()
        packs[(pk_set, pk_code)] = packs.get((pk_set, pk_code), 0) + pk_cnt

    return {"packs": packs, "cards": cards, "decks": decks}

def calculate_fixed_ev(cards, decks, single_prices, precon_decks, vendor="all", prod=None):
    """Calculates fixed singles EV for guaranteed cards, lands, and precon decks."""
    total_fixed = 0.0
    by_uuid = single_prices.get("byUuid", {})
    by_name = single_prices.get("byName", {})
    
    # 1. Evaluate direct fixed cards
    for cd in cards:
        u = cd.get("uuid")
        cname = (cd.get("name") or "").lower().strip()
        c_price = 0.0
        
        # Check prices dictionary inside card item if pre-resolved
        if cd.get("prices") and isinstance(cd["prices"], dict):
            c_price = float(cd["prices"].get(vendor) or cd["prices"].get("all") or cd["prices"].get("tcgplayer") or 0.0)
        elif u and u in by_uuid:
            prices_dict = by_uuid[u].get("prices", {})
            c_price = float(prices_dict.get(vendor) or prices_dict.get("all") or prices_dict.get("tcgplayer") or by_uuid[u].get("price") or 0.0)
        elif cname and cname in by_name:
            prices_dict = by_name[cname].get("prices", {})
            c_price = float(prices_dict.get(vendor) or prices_dict.get("all") or prices_dict.get("tcgplayer") or by_name[cname].get("price") or 0.0)

        total_fixed += max(0.0, c_price)

    # 2. Evaluate precon decks
    for d in decks:
        dname = (d.get("name") or "").strip().lower()
        dset = (d.get("set") or "").strip().upper()
        matched_deck = None
        for k, deck_obj in precon_decks.items():
            if not isinstance(deck_obj, dict):
                continue
            obj_name = (deck_obj.get("deckName") or deck_obj.get("name") or "").strip().lower()
            obj_set = (deck_obj.get("set") or deck_obj.get("setCode") or "").strip().upper()
            if (dname and obj_name == dname) or (k.strip().lower() == dname):
                if not dset or not obj_set or dset == obj_set:
                    matched_deck = deck_obj
                    break
        if not matched_deck and dname:
            for k, deck_obj in precon_decks.items():
                if not isinstance(deck_obj, dict):
                    continue
                obj_name = (deck_obj.get("deckName") or deck_obj.get("name") or "").strip().lower()
                if (len(dname) > 3 and dname in obj_name) or (len(obj_name) > 3 and obj_name in dname):
                    matched_deck = deck_obj
                    break
        if matched_deck:
            d_ev = float(matched_deck.get("totalSinglesEv") or matched_deck.get("singlesEv") or matched_deck.get("estimatedEv") or 0.0)
            total_fixed += max(0.0, d_ev)

    # Fallback to product estimatedEv or baseline if deck not priced individually
    if total_fixed <= 0 and prod:
        p_est = float(prod.get("estimatedEv") or 0.0)
        if p_est > 0:
            total_fixed = p_est

    return round(total_fixed, 2)

def simulate_composite_draws(pack_specs, fixed_ev=0.0, iterations=10000):
    """
    Simulates composite product with 10,000 draws using NumPy if available,
    or high-performance random.choices fallback.
    pack_specs: list of (count, quantiles_100_list)
    """
    if len(pack_specs) == 0:
        # Pure precon / fixed cards (Archetype 1)
        fixed_val = round(fixed_ev, 2)
        return {
            "mean": fixed_val,
            "median": fixed_val,
            "min": fixed_val,
            "max": fixed_val,
            "p05": fixed_val,
            "p50": fixed_val,
            "p95": fixed_val,
            "p99": fixed_val,
            "std": 0.0,
            "quantiles": [fixed_val] * 100
        }

    if HAS_NUMPY:
        composite_draws = np.full(iterations, fixed_ev, dtype=np.float64)
        for count, q_list in pack_specs:
            if count <= 0 or not q_list:
                continue
            q_arr = np.array(q_list[:100], dtype=np.float64)
            draw_indices = np.random.randint(0, len(q_arr), size=(count, iterations))
            pack_evs = q_arr[draw_indices]
            composite_draws += np.sum(pack_evs, axis=0)

        composite_draws.sort()
        mean_val = float(np.mean(composite_draws))
        std_val = float(np.std(composite_draws))
        percentiles = np.percentile(composite_draws, np.linspace(1, 100, 100))
        quantiles = [round(float(x), 2) for x in percentiles]
        
        return {
            "mean": round(mean_val, 2),
            "median": quantiles[49],
            "min": round(float(composite_draws[0]), 2),
            "max": round(float(composite_draws[-1]), 2),
            "p05": quantiles[4],
            "p50": quantiles[49],
            "p95": quantiles[94],
            "p99": quantiles[99],
            "std": round(std_val, 2),
            "quantiles": quantiles
        }
    else:
        totals = [fixed_ev] * iterations
        for count, q_list in pack_specs:
            if count <= 0 or not q_list:
                continue
            for _ in range(count):
                choices = random.choices(q_list[:100], k=iterations)
                for i in range(iterations):
                    totals[i] += choices[i]
        
        totals.sort()
        n = iterations
        mean_val = sum(totals) / n
        var_val = sum((x - mean_val) ** 2 for x in totals) / n
        std_val = var_val ** 0.5
        quantiles = [round(totals[min(n - 1, max(0, int((p / 100.0) * n) - 1))], 2) for p in range(1, 101)]

        return {
            "mean": round(mean_val, 2),
            "median": quantiles[49],
            "min": round(totals[0], 2),
            "max": round(totals[-1], 2),
            "p05": quantiles[4],
            "p50": quantiles[49],
            "p95": quantiles[94],
            "p99": quantiles[99],
            "std": round(std_val, 2),
            "quantiles": quantiles
        }

def run_composite_evaluator(target_set=None):
    print("=" * 70)
    print("STARTING UNIVERSAL COMPOSITE PRODUCT EV EVALUATOR (10,000 SAMPLES)")
    print(f"NumPy Acceleration: {'ENABLED' if HAS_NUMPY else 'DISABLED (Pure Python fallback)'}")
    print("=" * 70)

    start_time = time.time()
    sealed_products, booster_ev, precon_decks, single_prices = load_data()
    booster_lookup = build_booster_lookup(booster_ev)
    product_map = {p["id"]: p for p in sealed_products if p.get("id")}

    evaluated_count = 0
    updated_products = []

    for p in sealed_products:
        prod_id = p.get("id")
        set_code = (p.get("setCode") or "").upper()
        name = p.get("displayName") or p.get("name") or "Unnamed"
        market_price = float(p.get("marketPrice") or 0.0)

        if target_set and set_code != target_set.upper():
            updated_products.append(p)
            continue

        resolved = resolve_product_contents(prod_id, product_map)
        packs_dict = resolved["packs"]
        cards = resolved["cards"]
        decks = resolved["decks"]

        has_packs = len(packs_dict) > 0
        has_fixed = len(cards) > 0 or len(decks) > 0

        if not has_packs and not has_fixed:
            # Nothing to evaluate
            updated_products.append(p)
            continue

        # Classify Archetype
        if not has_packs and has_fixed:
            archetype = "pure_precon"
        elif has_packs and not has_fixed:
            archetype = "pure_randomized"
        else:
            archetype = "mixed_composite"

        quantiles_by_vendor = {}
        vendor_stats = {}

        # Evaluate across all vendors for priceMode = 'direct'
        for v in VENDORS:
            fixed_ev = calculate_fixed_ev(cards, decks, single_prices, precon_decks, vendor=v, prod=p)
            pack_specs = []

            for (p_set, p_code), count in packs_dict.items():
                # Look up booster quantiles
                booster_entry = (
                    booster_lookup.get((p_set, p_code, v, "direct")) or
                    booster_lookup.get((p_set, p_code, "all", "direct")) or
                    booster_lookup.get((p_set, "play", v, "direct")) or
                    booster_lookup.get((p_set, "default", v, "direct"))
                )
                if booster_entry and booster_entry.get("quantiles"):
                    pack_specs.append((count, booster_entry["quantiles"]))

            if len(pack_specs) == 0 and fixed_ev <= 0:
                continue

            stats = simulate_composite_draws(pack_specs, fixed_ev=fixed_ev, iterations=10000)
            quantiles_by_vendor[v] = stats["quantiles"]
            vendor_stats[v] = stats

        if not quantiles_by_vendor:
            updated_products.append(p)
            continue

        # Use 'all' or 'tcgplayer' as default primary stats
        primary_stats = vendor_stats.get("all") or vendor_stats.get("tcgplayer") or next(iter(vendor_stats.values()))
        primary_quantiles = primary_stats["quantiles"]

        # Calculate exact breakeven percentile and EV Score (0-100 probability of profit)
        breakeven_p = 100
        ev_score = 0
        if market_price > 0:
            found = False
            for idx, q_val in enumerate(primary_quantiles):
                if q_val >= market_price:
                    breakeven_p = idx + 1
                    ev_score = 100 - idx
                    found = True
                    break
            if not found:
                ev_score = 0 if market_price > primary_stats["max"] else 1
        else:
            breakeven_p = 1
            ev_score = 100

        # Attach computed fields to product
        p["archetype"] = archetype
        p["totalEvAvg"] = primary_stats["mean"]
        p["totalEvMid90"] = primary_stats["median"]
        p["totalEvMin5"] = primary_stats["p05"]
        p["totalEvMax5"] = primary_stats["p95"]
        p["totalEvMin"] = primary_stats["min"]
        p["totalEvMax"] = primary_stats["max"]
        p["quantiles"] = primary_quantiles
        p["quantilesByVendor"] = quantiles_by_vendor
        p["breakevenPercentile"] = breakeven_p
        p["evScore"] = ev_score
        
        total_packs_count = sum(packs_dict.values())
        if total_packs_count > 0:
            p["packsCount"] = total_packs_count

        updated_products.append(p)
        evaluated_count += 1

    total_time = time.time() - start_time
    print(f"✔ Evaluated {evaluated_count} sealed products in {total_time:.2f}s ({total_time / max(1, evaluated_count) * 1000:.1f}ms/product)")

    # Save to public/data/sealed_products.json
    with open(PUBLIC_DATA_DIR / "sealed_products.json", "w", encoding="utf-8") as f:
        json.dump(updated_products, f, indent=2, default=str)
    print(f"✔ Successfully saved enriched sealed_products.json to {PUBLIC_DATA_DIR}")

    # Also update dist if exists
    if DIST_DATA_DIR.exists():
        with open(DIST_DATA_DIR / "sealed_products.json", "w", encoding="utf-8") as f:
            json.dump(updated_products, f, indent=2, default=str)
        print(f"✔ Successfully saved enriched sealed_products.json to {DIST_DATA_DIR}")

    # Also sync updated metrics into arbitrage_leaderboard.json
    arb_path = PUBLIC_DATA_DIR / "arbitrage_leaderboard.json"
    if arb_path.exists():
        try:
            with open(arb_path, "r", encoding="utf-8") as af:
                arb_records = json.load(af)
            
            prod_lookup = {p["id"]: p for p in updated_products if p.get("id")}
            for r in arb_records:
                u = r.get("productUuid") or r.get("id")
                if u and u in prod_lookup:
                    up = prod_lookup[u]
                    if "quantiles" in up:
                        r["quantiles"] = up["quantiles"]
                    if "quantilesByVendor" in up:
                        r["quantilesByVendor"] = up["quantilesByVendor"]
                    if "totalEvAvg" in up:
                        r["totalEvAvg"] = up["totalEvAvg"]
                        r["totalEvMid90"] = up["totalEvMid90"]
                        r["totalEvMin5"] = up["totalEvMin5"]
                        r["totalEvMax5"] = up["totalEvMax5"]
                        r["totalEvMin"] = up["totalEvMin"]
                        r["totalEvMax"] = up["totalEvMax"]
                    if "breakevenPercentile" in up:
                        r["breakevenPercentile"] = up["breakevenPercentile"]
                    if "archetype" in up:
                        r["archetype"] = up["archetype"]

            with open(arb_path, "w", encoding="utf-8") as af:
                json.dump(arb_records, af, indent=2, default=str)
            print(f"✔ Synchronized pre-computed quantiles into arbitrage_leaderboard.json")

            if DIST_DATA_DIR.exists() and (DIST_DATA_DIR / "arbitrage_leaderboard.json").exists():
                with open(DIST_DATA_DIR / "arbitrage_leaderboard.json", "w", encoding="utf-8") as af:
                    json.dump(arb_records, af, indent=2, default=str)
        except Exception as ex:
            print(f"[WARN] Could not update arbitrage_leaderboard.json: {ex}")

    print("=" * 70)
    print("COMPOSITE EVALUATION COMPLETE")
    print("=" * 70)

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Universal MTG Composite Product EV Evaluator")
    parser.add_argument("--set", type=str, default=None, help="Filter to specific setCode (e.g. HOB)")
    args = parser.parse_args()
    run_composite_evaluator(target_set=args.set)
