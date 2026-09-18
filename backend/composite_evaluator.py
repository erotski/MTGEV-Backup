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

from ev_statistics import empirical_quantiles

try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False

ROOT_DIR = Path(__file__).resolve().parent.parent
PUBLIC_DATA_DIR = ROOT_DIR / "public" / "data"
DIST_DATA_DIR = ROOT_DIR / "dist" / "data"

VENDORS = ["all_cheapest", "all_average", "tcgplayer", "cardmarket", "cardkingdom", "manapool"]

# populate_booster_ev_to_db.py always simulates this many packs per booster/vendor/mode
# (see booster_ev.json "simulatedPacks"). Used to correct the endpoint-weighting bug below.
BOOSTER_SIMULATED_PACKS = 5000


def bucket_weights(bucket_count: int = 100, simulated_packs: int = BOOSTER_SIMULATED_PACKS):
    """Probability weight of each of the 100 empirical_quantiles() buckets.

    empirical_quantiles() stores the exact min and exact max as single-sample
    endpoints (bucket 1 and bucket 100), while the 98 interior buckets are each
    the mean of ~(simulated_packs-2)/98 samples. Treating all 100 buckets as
    equally likely (as a naive uniform resample or arithmetic mean does) gives
    the min/max endpoints ~50x too much weight and biases the reconstructed
    mean upward for right-skewed (chase-card-driven) distributions. This
    reweights each bucket to match its true share of the original samples.
    """
    if bucket_count <= 2 or simulated_packs <= bucket_count:
        return [1.0 / bucket_count] * bucket_count
    endpoint_weight = 1.0 / simulated_packs
    interior_weight = (1.0 - 2 * endpoint_weight) / (bucket_count - 2)
    return [endpoint_weight] + [interior_weight] * (bucket_count - 2) + [endpoint_weight]


def calculate_profit_metrics(quantiles, market_price):
    """Return backend-owned breakeven percentile and EV score for one curve."""
    if market_price <= 0:
        return 1, 100
    for index, value in enumerate(quantiles):
        if value >= market_price:
            return index + 1, 100 - index
    return 100, 0


def load_data():
    with open(PUBLIC_DATA_DIR / "sealed_products.json", "r", encoding="utf-8") as f:
        sealed_products = json.load(f)
    
    # Load overrides
    overrides = {}
    overrides_path = PUBLIC_DATA_DIR / "product_overrides.json"
    if overrides_path.exists():
        try:
            with open(overrides_path, "r", encoding="utf-8") as f:
                overrides = json.load(f)
            print(f"  [INFO] Loaded {len(overrides)} product overrides.")
        except Exception as e:
            print(f"[WARN] Error reading product_overrides.json: {e}")
    
    # Apply overrides
    for sp in sealed_products:
        sp_id = sp.get("id") or sp.get("uuid")
        if sp_id and sp_id in overrides:
            print(f"  [INFO] Applying overrides for product: {sp.get('displayName')}")
            # Simple deep update for contents
            if "contents" in overrides[sp_id]:
                sp["contents"] = overrides[sp_id]["contents"]

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
        v = (b.get("vendor") or "all_cheapest").lower()
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

def find_matched_precon_deck(d, precon_decks):
    """Resolves a contents.deck entry to its authoritative precon_decks.json record."""
    dname = (d.get("name") or "").strip().lower()
    dset = (d.get("set") or "").strip().upper()
    dname_alpha = re.sub(r"[^a-z0-9]", "", dname)

    # 1. Exact name or key match in same set or without set constraint
    for k, deck_obj in precon_decks.items():
        if not isinstance(deck_obj, dict):
            continue
        obj_name = (deck_obj.get("deckName") or deck_obj.get("name") or "").strip().lower()
        obj_set = (deck_obj.get("set") or deck_obj.get("setCode") or "").strip().upper()
        if dset and obj_set and dset != obj_set:
            continue
        if (dname and obj_name == dname) or (k.strip().lower() == dname):
            return deck_obj

    # 2. Match within same set if set is specified
    if dname and dset:
        for k, deck_obj in precon_decks.items():
            if not isinstance(deck_obj, dict):
                continue
            obj_set = (deck_obj.get("set") or deck_obj.get("setCode") or "").strip().upper()
            if obj_set != dset:
                continue
            obj_name = (deck_obj.get("deckName") or deck_obj.get("name") or "").strip().lower()
            obj_alpha = re.sub(r"[^a-z0-9]", "", obj_name)
            if (dname_alpha and dname_alpha == obj_alpha) or (dname in obj_name) or (obj_name in dname):
                return deck_obj

    # 3. Exact full alphanumeric match across all decks only if sets do not conflict
    if dname and not dset:
        for k, deck_obj in precon_decks.items():
            if not isinstance(deck_obj, dict):
                continue
            obj_name = (deck_obj.get("deckName") or deck_obj.get("name") or "").strip().lower()
            obj_alpha = re.sub(r"[^a-z0-9]", "", obj_name)
            if dname_alpha and dname_alpha == obj_alpha:
                return deck_obj

    return None


def get_cards_per_pack(code):
    """Cards per booster pack by MTGJSON booster code, mirroring src/utils/productUtils.ts."""
    c = (code or "").lower()
    if "sample" in c:
        return 2
    if "prerelease" in c:
        return 2
    if "collector" in c:
        return 15
    if c in ("play", "draft", "set", "default", "booster"):
        return 15
    if "jumpstart" in c:
        return 20
    if "theme" in c:
        return 35
    if "topper" in c:
        return 1
    return 15


def resolve_total_card_count(cards, decks, packs_dict, precon_decks):
    """Recursively derives the true total card count for a composite product from its
    resolved cards/decks/packs — this is the sole authority consumed by the frontend
    (product_metrics.json cardCount); no frontend fallback/estimation should override it."""
    total = 0
    for cd in cards:
        total += int(cd.get("count", 1) or 1)

    for d in decks:
        matched_deck = find_matched_precon_deck(d, precon_decks)
        deck_cards = int((matched_deck or {}).get("cardCount") or 0)
        if deck_cards <= 0:
            dname = (d.get("name") or "").lower()
            category = ((matched_deck or {}).get("category") or "").lower()
            is_commander = "commander" in dname or "commander" in category
            deck_cards = 100 if is_commander else 60
        total += deck_cards

    for (_p_set, p_code), cnt in packs_dict.items():
        total += cnt * get_cards_per_pack(p_code)

    return total


def calculate_fixed_ev(cards, decks, single_prices, precon_decks, vendor="all_cheapest", prod=None, provenance=None):
    """Calculates fixed singles EV for guaranteed cards, lands, and precon decks."""
    total_fixed = 0.0
    by_uuid = single_prices.get("byUuid", {})
    by_name = single_prices.get("byName", {})

    if provenance is None:
        provenance = {"expectedCards": 0, "exactCards": 0, "fallbackCards": 0, "missingCards": 0, "observedEv": 0.0, "fallbackCompletedEv": 0.0}
    else:
        provenance.setdefault("expectedCards", 0)
        provenance.setdefault("exactCards", 0)
        provenance.setdefault("fallbackCards", 0)
        provenance.setdefault("missingCards", 0)
        provenance.setdefault("observedEv", 0.0)
        provenance.setdefault("fallbackCompletedEv", 0.0)
    
    # 1. Evaluate direct fixed cards
    for cd in cards:
        u = cd.get("uuid")
        cname = (cd.get("name") or "").lower().strip()
        c_price = 0.0
        
        # Check prices dictionary inside card item if pre-resolved
        prices_dict = {}
        if cd.get("prices") and isinstance(cd["prices"], dict):
            prices_dict = cd["prices"]
        elif u and u in by_uuid:
            prices_dict = by_uuid[u].get("prices", {})
            c_price = float(prices_dict.get(vendor) or by_uuid[u].get("price") or 0.0)
        elif cname and cname in by_name:
            prices_dict = by_name[cname].get("prices", {})
            c_price = float(prices_dict.get(vendor) or by_name[cname].get("price") or 0.0)

        count = int(cd.get("count", 1) or 1)
        requested = float(prices_dict.get(vendor) or 0.0)
        if requested > 0:
            c_price = requested
            status = "exact"
        else:
            alternatives = [float(prices_dict.get(other) or 0.0) for other in VENDORS if float(prices_dict.get(other) or 0.0) > 0]
            c_price = alternatives[0] if alternatives else 0.0
            status = "vendor_fallback" if alternatives else "unpriced"
        provenance["expectedCards"] += count
        provenance["observedEv"] += requested * count
        provenance["fallbackCompletedEv"] += c_price * count
        provenance["exactCards" if status == "exact" else "fallbackCards" if status == "vendor_fallback" else "missingCards"] += count

        total_fixed += max(0.0, c_price * count)

    # 2. Evaluate precon decks
    for d in decks:
        matched_deck = find_matched_precon_deck(d, precon_decks)

        if matched_deck:
            deck_stats = (matched_deck.get("pricingReliability") or {}).get(vendor)
            if deck_stats and "expectedCards" in deck_stats:
                provenance["expectedCards"] += int(deck_stats.get("expectedCards") or 0)
                provenance["exactCards"] += int(deck_stats.get("exactCards") or 0)
                provenance["fallbackCards"] += int(deck_stats.get("fallbackCards") or 0)
                provenance["missingCards"] += int(deck_stats.get("missingCards") or 0)
                provenance["observedEv"] += float(deck_stats.get("observedEv") or 0.0)
                provenance["fallbackCompletedEv"] += float(deck_stats.get("fallbackCompletedEv") or 0.0)
                d_ev = float(deck_stats.get("fallbackCompletedEv") or 0.0)
            else:
                # Preserve compatibility with pre-provenance deck snapshots.
                d_ev = float(matched_deck.get("totalSinglesEv") or matched_deck.get("singlesEv") or matched_deck.get("estimatedEv") or 0.0)
            total_fixed += max(0.0, d_ev)

    # Fallback to product estimatedEv or baseline if deck not priced individually
    if total_fixed <= 0 and prod:
        p_est = float(prod.get("estimatedEv") or 0.0)
        if p_est > 0:
            total_fixed = p_est

    return round(total_fixed, 2)

def resolve_variable_slot(slot, single_prices, booster_lookup, precon_decks, vendor="all_cheapest"):
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
                booster_lookup.get((pk_set, pk_code, "all_cheapest", "direct")) or
                booster_lookup.get((pk_set, "play", vendor, "direct")) or
                booster_lookup.get((pk_set, "default", vendor, "direct"))
            )
            if booster_entry and booster_entry.get("quantiles"):
                pack_specs.append((cnt, booster_entry["quantiles"], booster_entry["evAverage"]))
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
    pack_specs: list of (count, quantiles_100_list, booster_evAverage)
    variable_slots: list of slot option lists, where each option has:
      { 'probability': float, 'fixed_ev': float, 'pack_specs': [(count, quantiles, evAverage)] }
    """
    has_packs = len(pack_specs) > 0
    has_vars = bool(variable_slots and len(variable_slots) > 0)
    weights_100 = bucket_weights()

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

    if not has_vars and len(pack_specs) == 1 and pack_specs[0][0] == 1:
        # Single guaranteed pack, no variable slots: the booster's own evAverage
        # (the true 5,000-sample mean) is authoritative and exact — resampling
        # the 100-point curve here would only add Monte Carlo noise and risk
        # reintroducing the endpoint-overweighting bias bucket_weights() fixes.
        _count, q_list, ev_average = pack_specs[0]
        q_clean = sorted(q_list[:100])
        mean_val = ev_average + fixed_ev
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

    if HAS_NUMPY:
        composite_draws = np.full(iterations, fixed_ev, dtype=np.float64)
        weights_arr = np.array(weights_100, dtype=np.float64)

        # 1. Guaranteed packs
        for count, q_list, _ev_average in pack_specs:
            if count <= 0 or not q_list:
                continue
            q_arr = np.array(q_list[:100], dtype=np.float64)
            # Weighted resample: the exact min/max endpoints are single samples,
            # not equally-likely buckets (see bucket_weights()).
            draw_indices = np.random.choice(len(q_arr), size=(count, iterations), p=weights_arr)
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
                    for p_cnt, p_quantiles, _p_ev_average in opt.get("pack_specs", []):
                        if p_cnt <= 0 or not p_quantiles:
                            continue
                        q_arr = np.array(p_quantiles[:100], dtype=np.float64)
                        p_draws = np.random.choice(len(q_arr), size=(p_cnt, count_chosen), p=weights_arr)
                        composite_draws[mask] += np.sum(q_arr[p_draws], axis=0)

        composite_draws.sort()
        mean_val = float(np.mean(composite_draws))
        std_val = float(np.std(composite_draws))
        quantiles = empirical_quantiles(composite_draws)
        
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
        n = 500
        totals = [fixed_ev] * n

        # 1. Guaranteed packs
        for count, q_list, _ev_average in pack_specs:
            if count <= 0 or not q_list:
                continue
            q_clean = q_list[:100]
            # Batch sample simulation, weighted to match true endpoint probability.
            for _ in range(count):
                choices = random.choices(q_clean, weights=weights_100, k=n)
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
                    for p_cnt, p_quantiles, _p_ev_average in opt.get("pack_specs", []):
                        if p_cnt <= 0 or not p_quantiles:
                            continue
                        p_picks = random.choices(p_quantiles[:100], weights=weights_100, k=p_cnt)
                        totals[i] += sum(p_picks)
        
        totals.sort()
        mean_val = sum(totals) / n
        var_val = sum((x - mean_val) ** 2 for x in totals) / n
        std_val = var_val ** 0.5
        quantiles = empirical_quantiles(totals)

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

        # Authoritative recursive pack/card totals — the frontend must consume these
        # directly rather than re-deriving or estimating them from raw contents.
        total_packs_count = sum(packs_dict.values())
        if total_packs_count > 0:
            p["packsCount"] = total_packs_count
        else:
            p.pop("packsCount", None)

        total_card_count = resolve_total_card_count(cards, decks, packs_dict, precon_decks)
        if total_card_count > 0:
            p["cardCount"] = total_card_count

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
        fixed_pricing_by_vendor = {}

        # Evaluate across all vendors for priceMode = 'direct'
        for v in VENDORS:
            fixed_provenance = {}
            fixed_ev = calculate_fixed_ev(
                cards,
                decks,
                single_prices,
                precon_decks,
                vendor=v,
                prod=p,
                provenance=fixed_provenance,
            )
            if fixed_provenance.get("expectedCards", 0) > 0:
                expected = fixed_provenance["expectedCards"]
                fixed_provenance["observedEv"] = round(fixed_provenance["observedEv"], 2)
                fixed_provenance["fallbackCompletedEv"] = round(fixed_provenance["fallbackCompletedEv"], 2)
                fixed_provenance["coveragePct"] = round(
                    (expected - fixed_provenance["missingCards"]) / expected * 100,
                    2,
                )
                fixed_provenance["status"] = (
                    "missing" if fixed_provenance["missingCards"]
                    else "fallback_used" if fixed_provenance["fallbackCards"]
                    else "exact"
                )
                fixed_pricing_by_vendor[v] = fixed_provenance
            pack_specs = []

            for (p_set, p_code), count in packs_dict.items():
                # Look up booster quantiles for the exact pack code only. A pack code with
                # no simulated booster_ev record (e.g. "prerelease", which MTGJSON does not
                # model as a simulated booster type) must remain unpriced/unresolved here —
                # it must NEVER silently borrow the "play" booster's distribution, which
                # previously fabricated an extra phantom Play Booster draw on top of any
                # genuinely-contained play boosters (see PROJECT_REVIEW.md DEV-11/DEV-28
                # "no invented substitute data" rule).
                booster_entry = (
                    booster_lookup.get((p_set, p_code, v, "direct")) or
                    booster_lookup.get((p_set, p_code, "all_cheapest", "direct"))
                )
                if booster_entry and booster_entry.get("quantiles"):
                    pack_specs.append((count, booster_entry["quantiles"], booster_entry["evAverage"]))

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
            # We didn't evaluate anything. Wipe any old EV data to prevent stale inflation!
            for k in ["totalEvAvg", "totalEvMid90", "totalEvMin5", "totalEvMax5", "totalEvMin", "totalEvMax", "quantiles", "quantilesByVendor", "evScore", "breakevenPercentile", "archetype"]:
                p.pop(k, None)
            updated_products.append(p)
            continue

        # Use all_cheapest or tcgplayer as default primary stats
        primary_stats = vendor_stats.get("all_cheapest") or vendor_stats.get("tcgplayer") or next(iter(vendor_stats.values()))
        if fixed_pricing_by_vendor:
            p["fixedPricingByVendor"] = fixed_pricing_by_vendor
        primary_quantiles = primary_stats["quantiles"]

        breakeven_p, ev_score = calculate_profit_metrics(primary_quantiles, market_price)

        # Attach computed fields to product
        p.pop("quantiles", None)
        p["archetype"] = archetype
        p["totalEvAvg"] = primary_stats["mean"]
        p["totalEvMid90"] = primary_stats["median"]
        p["totalEvMin5"] = primary_stats["p05"]
        p["totalEvMax5"] = primary_stats["p95"]
        p["totalEvMin"] = primary_stats["min"]
        p["totalEvMax"] = primary_stats["max"]
        p["quantilesByVendor"] = quantiles_by_vendor
        p["metricsByVendor"] = {}
        for vendor, stats in vendor_stats.items():
            vendor_breakeven, vendor_ev_score = calculate_profit_metrics(stats["quantiles"], market_price)
            p["metricsByVendor"][vendor] = {
                "mean": stats["mean"],
                "median": stats["median"],
                "p05": stats["p05"],
                "p95": stats["p95"],
                "min": stats["min"],
                "max": stats["max"],
                "breakevenPercentile": vendor_breakeven,
                "evScore": vendor_ev_score,
            }
        p["breakevenPercentile"] = breakeven_p
        p["evScore"] = ev_score

        updated_products.append(p)
        evaluated_count += 1

    total_time = time.time() - start_time
    print(f"[OK] Evaluated {evaluated_count} sealed products in {total_time:.2f}s ({total_time / max(1, evaluated_count) * 1000:.1f}ms/product)")

    # Save to public/data/sealed_products.json
    with open(PUBLIC_DATA_DIR / "sealed_products.json", "w", encoding="utf-8") as f:
        json.dump(updated_products, f, indent=2, default=str)
    print(f"[OK] Successfully saved enriched sealed_products.json to {PUBLIC_DATA_DIR}")

    # Also update dist if exists
    if DIST_DATA_DIR.exists():
        with open(DIST_DATA_DIR / "sealed_products.json", "w", encoding="utf-8") as f:
            json.dump(updated_products, f, indent=2, default=str)
        print(f"[OK] Successfully saved enriched sealed_products.json to {DIST_DATA_DIR}")

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
                    for k in ["quantilesByVendor", "totalEvAvg", "totalEvMid90", "totalEvMin5", "totalEvMax5", "totalEvMin", "totalEvMax", "breakevenPercentile", "archetype"]:
                        if k in up:
                            r[k] = up[k]
                        elif k in r:
                            # if it was wiped, wipe it here too, or set to 0
                            if "totalEv" in k:
                                r[k] = 0.0
                            else:
                                r.pop(k, None)

            with open(arb_path, "w", encoding="utf-8") as af:
                json.dump(arb_records, af, indent=2, default=str)
            print(f"[OK] Synchronized pre-computed quantiles into arbitrage_leaderboard.json")

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
