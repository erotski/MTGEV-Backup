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
import re
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

def resolve_product_contents(prod_id, product_map, visited=None, name_map=None):
    """Recursively resolves all child packs, cards, decks, and variable slots in a product."""
    if visited is None:
        visited = set()
    if prod_id in visited:
        return {"packs": {}, "cards": [], "decks": [], "variables": []}
    visited.add(prod_id)

    prod = product_map.get(prod_id)
    if not prod:
        return {"packs": {}, "cards": [], "decks": [], "variables": []}

    c = prod.get("contents") or {}
    packs = {}
    cards = list(c.get("card", []))
    decks = list(c.get("deck", []))
    variables = list(c.get("variable", []))

    # 1. Sealed items (e.g. packs, sub-boxes, display cases, nested secret lair drops)
    for s in c.get("sealed", []):
        s_count = int(s.get("count", 1) or 1)
        child_uuid = s.get("uuid")
        child_set = (s.get("set") or prod.get("setCode") or "").upper()
        child_name = (s.get("name") or "").strip().lower()

        child_prod = None
        if child_uuid and child_uuid in product_map:
            child_prod = product_map[child_uuid]
        elif name_map and (child_set, child_name) in name_map:
            child_prod = name_map[(child_set, child_name)]
        elif name_map and child_name in name_map:
            child_prod = name_map[child_name]

        if child_prod:
            sub = resolve_product_contents(child_prod["id"], product_map, visited.copy(), name_map)
            for (p_set, p_code), cnt in sub["packs"].items():
                k = (p_set, p_code)
                packs[k] = packs.get(k, 0) + cnt * s_count
            cards.extend(sub["cards"] * s_count)
            decks.extend(sub["decks"] * s_count)
            variables.extend(sub["variables"] * s_count)
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

    return {"packs": packs, "cards": cards, "decks": decks, "variables": variables}

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
        dname_alpha = re.sub(r"[^a-z0-9]", "", dname)
        matched_deck = None

        # 1. Exact name or key match in same set or without set constraint
        for k, deck_obj in precon_decks.items():
            if not isinstance(deck_obj, dict):
                continue
            obj_name = (deck_obj.get("deckName") or deck_obj.get("name") or "").strip().lower()
            obj_set = (deck_obj.get("set") or deck_obj.get("setCode") or "").strip().upper()
            if dset and obj_set and dset != obj_set:
                continue
            if (dname and obj_name == dname) or (k.strip().lower() == dname):
                matched_deck = deck_obj
                break

        # 2. Match within same set if set is specified
        if not matched_deck and dname and dset:
            for k, deck_obj in precon_decks.items():
                if not isinstance(deck_obj, dict):
                    continue
                obj_set = (deck_obj.get("set") or deck_obj.get("setCode") or "").strip().upper()
                if obj_set != dset:
                    continue
                obj_name = (deck_obj.get("deckName") or deck_obj.get("name") or "").strip().lower()
                obj_alpha = re.sub(r"[^a-z0-9]", "", obj_name)
                if (dname_alpha and dname_alpha == obj_alpha) or (dname in obj_name) or (obj_name in dname):
                    matched_deck = deck_obj
                    break

        # 3. Exact full alphanumeric match across all decks only if sets do not conflict
        if not matched_deck and dname and not dset:
            for k, deck_obj in precon_decks.items():
                if not isinstance(deck_obj, dict):
                    continue
                obj_name = (deck_obj.get("deckName") or deck_obj.get("name") or "").strip().lower()
                obj_alpha = re.sub(r"[^a-z0-9]", "", obj_name)
                if dname_alpha and dname_alpha == obj_alpha:
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

def resolve_variable_slot(slot, single_prices, booster_lookup, precon_decks, vendor="all"):
    """
    Normalizes a discrete MTGJson variable slot into options with probabilities,
    fixed values (cards/decks), and booster pack quantile specs.
    """
    configs = slot.get("configs", [])
    if not configs:
        return []

    raw_options = []
    total_chance = 0.0

    for cfg in configs:
        vc = cfg.get("variable_config", [{}])
        vc_first = vc[0] if vc else {}
        chance = vc_first.get("chance")

        if chance is not None:
            c_val = float(chance)
        else:
            c_val = 1.0

        raw_options.append((c_val, cfg))
        total_chance += c_val

    if total_chance <= 0:
        total_chance = float(len(configs))
        raw_options = [(1.0, cfg) for cfg in configs]

    normalized_options = []
    for c_val, cfg in raw_options:
        prob = c_val / total_chance

        cards = cfg.get("card", [])
        decks = cfg.get("deck", [])
        fixed_val = calculate_fixed_ev(cards, decks, single_prices, precon_decks, vendor=vendor)

        pack_specs = []
        for pk in cfg.get("pack", []):
            pk_set = (pk.get("set") or "SLD").upper()
            pk_code = (pk.get("code") or "play").lower()
            cnt = int(pk.get("count", 1) or 1)
            booster_entry = (
                booster_lookup.get((pk_set, pk_code, vendor, "direct")) or
                booster_lookup.get((pk_set, pk_code, "all", "direct")) or
                booster_lookup.get((pk_set, "play", vendor, "direct")) or
                booster_lookup.get((pk_set, "default", vendor, "direct"))
            )
            if booster_entry and booster_entry.get("quantiles"):
                pack_specs.append((cnt, booster_entry["quantiles"]))
            elif booster_entry and booster_entry.get("evAverage"):
                fixed_val += float(booster_entry["evAverage"]) * cnt

        desc_parts = []
        for cd in cards:
            desc_parts.append(f"Card: {cd.get('name')} #{cd.get('number')}")
        for pk in cfg.get("pack", []):
            desc_parts.append(f"Pack: {pk.get('code')}")
        for dk in decks:
            desc_parts.append(f"Deck: {dk.get('name')}")

        normalized_options.append({
            "probability": prob,
            "fixed_ev": round(fixed_val, 2),
            "pack_specs": pack_specs,
            "description": ", ".join(desc_parts) or "Empty"
        })

    return normalized_options

def simulate_composite_draws(pack_specs, fixed_ev=0.0, variable_slots=None, iterations=10000):
    """
    Simulates composite product draws using NumPy if available,
    or high-performance random fallback.
    pack_specs: list of (count, quantiles_100_list)
    variable_slots: list of slot option lists, where each option has:
      { 'probability': float, 'fixed_ev': float, 'pack_specs': [(count, quantiles)] }
    """
    has_packs = len(pack_specs) > 0
    has_vars = bool(variable_slots and len(variable_slots) > 0)

    if not has_packs and not has_vars:
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

        # 1. Guaranteed packs
        for count, q_list in pack_specs:
            if count <= 0 or not q_list:
                continue
            q_arr = np.array(q_list[:100], dtype=np.float64)
            draw_indices = np.random.randint(0, len(q_arr), size=(count, iterations))
            pack_evs = q_arr[draw_indices]
            composite_draws += np.sum(pack_evs, axis=0)

        # 2. Variable lottery slots
        if has_vars:
            for slot_opts in variable_slots:
                probs = [opt["probability"] for opt in slot_opts]
                k_opts = len(slot_opts)
                chosen_indices = np.random.choice(k_opts, size=iterations, p=probs)
                for opt_idx, opt in enumerate(slot_opts):
                    mask = (chosen_indices == opt_idx)
                    count_chosen = int(np.sum(mask))
                    if count_chosen == 0:
                        continue
                    if opt.get("fixed_ev", 0.0) > 0:
                        composite_draws[mask] += opt["fixed_ev"]
                    for p_cnt, p_quantiles in opt.get("pack_specs", []):
                        if p_cnt <= 0 or not p_quantiles:
                            continue
                        q_arr = np.array(p_quantiles[:100], dtype=np.float64)
                        p_draws = np.random.randint(0, len(q_arr), size=(p_cnt, count_chosen))
                        composite_draws[mask] += np.sum(q_arr[p_draws], axis=0)

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
        # If no variable slots and single pack count:
        if not has_vars and len(pack_specs) == 1 and pack_specs[0][0] == 1:
            q_clean = sorted(pack_specs[0][1][:100])
            mean_val = sum(q_clean) / len(q_clean) + fixed_ev
            q_res = [round(x + fixed_ev, 2) for x in q_clean]
            return {
                "mean": round(mean_val, 2),
                "median": q_res[49],
                "min": q_res[0],
                "max": q_res[-1],
                "p05": q_res[4],
                "p50": q_res[49],
                "p95": q_res[94],
                "p99": q_res[99],
                "std": 0.0,
                "quantiles": q_res
            }

        n = 500
        totals = [fixed_ev] * n

        # 1. Guaranteed packs
        for count, q_list in pack_specs:
            if count <= 0 or not q_list:
                continue
            q_clean = q_list[:100]
            # Batch sample simulation
            for _ in range(count):
                choices = random.choices(q_clean, k=n)
                for i in range(n):
                    totals[i] += choices[i]

        # 2. Variable lottery slots
        if has_vars:
            for slot_opts in variable_slots:
                weights = [opt["probability"] for opt in slot_opts]
                chosen = random.choices(slot_opts, weights=weights, k=n)
                for i in range(n):
                    opt = chosen[i]
                    if opt.get("fixed_ev", 0.0) > 0:
                        totals[i] += opt["fixed_ev"]
                    for p_cnt, p_quantiles in opt.get("pack_specs", []):
                        if p_cnt <= 0 or not p_quantiles:
                            continue
                        p_picks = random.choices(p_quantiles[:100], k=p_cnt)
                        totals[i] += sum(p_picks)
        
        totals.sort()
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
    name_map = {}
    for p in sealed_products:
        n = (p.get("displayName") or p.get("name") or "").strip().lower()
        s = (p.get("setCode") or "").strip().upper()
        if n:
            name_map[(s, n)] = p
            if n not in name_map:
                name_map[n] = p

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

        resolved = resolve_product_contents(prod_id, product_map, name_map=name_map)
        packs_dict = resolved["packs"]
        cards = resolved["cards"]
        decks = resolved["decks"]
        variables = resolved.get("variables", [])

        has_packs = len(packs_dict) > 0
        has_fixed = len(cards) > 0 or len(decks) > 0
        has_variables = len(variables) > 0

        if not has_packs and not has_fixed and not has_variables:
            # Nothing to evaluate
            updated_products.append(p)
            continue

        # Classify Archetype
        if not has_packs and not has_variables and has_fixed:
            archetype = "pure_precon"
        elif (has_packs or has_variables) and not has_fixed:
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

            variable_slots_for_vendor = []
            for slot in variables:
                opts = resolve_variable_slot(slot, single_prices, booster_lookup, precon_decks, vendor=v)
                if opts:
                    variable_slots_for_vendor.append(opts)

            if len(pack_specs) == 0 and len(variable_slots_for_vendor) == 0 and fixed_ev <= 0:
                continue

            stats = simulate_composite_draws(
                pack_specs,
                fixed_ev=fixed_ev,
                variable_slots=variable_slots_for_vendor,
                iterations=10000
            )
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
