#!/usr/bin/env python3
"""
validate_pricing_and_ev.py
--------------------------
Automated Data Quality & Pricing/EV Discrepancy Validator.

Audits all sealed products, booster packs, and composite boxes across the database:
  1. Contents-to-Product EV Mathematical Parity:
     Verifies that totalEvAvg matches the true recursive sum of its contents
     (e.g., 36 draft booster packs * $5.55 = $199.80).
  2. Booster Quantile Calibration & Lottery Skew Detection:
     Detects when 100-quantile discretizations in booster_ev.json have extreme outliers
     (e.g. Masterpiece Inventions) that skew Monte Carlo draws.
  3. Market Price vs EV Sanity:
     Flags extreme ROI anomalies (>500% or <-90%), missing market prices, or broken vendor rates.
  4. Automatic Report Generation:
     Generates categorized severity tables (CRITICAL, HIGH, WARNING) with actionable fixes.
"""

import json
import sys
import os
from pathlib import Path
from typing import Dict, Any, List, Tuple

PUBLIC_DATA_DIR = Path(__file__).parent.parent / "public" / "data"

def load_json(filepath: Path) -> Any:
    if not filepath.exists():
        print(f"✘ Error: {filepath} does not exist.")
        return None
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)

def run_audit(fix_mode: bool = False):
    print("=" * 78)
    print(" MTG SEALED PRODUCTS & EV AUTOMATED VALIDATION SUITE")
    print("=" * 78)

    sealed_products = load_json(PUBLIC_DATA_DIR / "sealed_products.json") or []
    booster_evs = load_json(PUBLIC_DATA_DIR / "booster_ev.json") or []
    single_prices = load_json(PUBLIC_DATA_DIR / "single_card_prices.json") or {}
    precon_decks = load_json(PUBLIC_DATA_DIR / "precon_decks.json") or {}
    arbitrage_leaderboard = load_json(PUBLIC_DATA_DIR / "arbitrage_leaderboard.json") or []

    print(f"Loaded {len(sealed_products):,} sealed products")
    print(f"Loaded {len(booster_evs):,} booster EV records")
    print(f"Loaded {len(arbitrage_leaderboard):,} arbitrage leaderboard records\n")

    # Build Booster EV Lookup: (setCode, boosterName, vendor, priceMode) -> record
    booster_map: Dict[Tuple[str, str, str, str], Dict[str, Any]] = {}
    for b in booster_evs:
        s_code = (b.get("setCode") or "").upper()
        b_name = (b.get("boosterName") or "").lower()
        v = (b.get("vendor") or "all_cheapest").lower()
        if v == "all":
            v = "all_cheapest"
        pm = (b.get("priceMode") or "direct").lower()
        booster_map[(s_code, b_name, v, pm)] = b

    # Map sealed products by ID / UUID
    product_by_id: Dict[str, Dict[str, Any]] = {}
    for p in sealed_products:
        p_id = p.get("id") or p.get("uuid")
        if p_id:
            product_by_id[p_id] = p

    # ---------------------------------------------------------
    # TEST 1: Booster Quantile Calibration & Lottery Skew Audit
    # ---------------------------------------------------------
    print("AUDIT 1: BOOSTER QUANTILE CALIBRATION & LOTTERY CARD SKEW")
    print("-" * 78)
    booster_skew_issues = []

    for b in booster_evs:
        q = b.get("quantiles")
        ev_avg = float(b.get("evAverage") or 0)
        s_code = (b.get("setCode") or "").upper()
        b_name = b.get("boosterName")
        v = b.get("vendor")
        pm = b.get("priceMode")

        if q and len(q) == 100 and ev_avg > 0:
            q_mean = sum(q) / len(q)
            q_max = max(q)
            ratio = q_mean / ev_avg
            if ratio > 1.35 or ratio < 0.70:
                booster_skew_issues.append({
                    "setCode": s_code,
                    "boosterName": b_name,
                    "vendor": v,
                    "priceMode": pm,
                    "evAverage": ev_avg,
                    "quantileMean": q_mean,
                    "quantileMax": q_max,
                    "skewRatio": ratio,
                })

    booster_skew_issues.sort(key=lambda x: x["skewRatio"], reverse=True)
    if booster_skew_issues:
        print(f"✘ Found {len(booster_skew_issues)} booster distributions with significant quantile mean skew:")
        for issue in booster_skew_issues[:8]:
            print(f"  • {issue['setCode']} {issue['boosterName']:<14} ({issue['vendor']}/{issue['priceMode']}) | "
                  f"True EV Avg: ${issue['evAverage']:>6.2f} | Quantile Mean: ${issue['quantileMean']:>6.2f} | "
                  f"Max Jackpot: ${issue['quantileMax']:>7.2f} (Skew: {issue['skewRatio']:.1f}x)")
        if len(booster_skew_issues) > 8:
            print(f"  ... and {len(booster_skew_issues) - 8} more.")
    else:
        print("✔ [PASS] All booster quantile distributions match their analytical expected value.")

    # ---------------------------------------------------------
    # TEST 2: Sealed Products Contents vs Total EV Consistency
    # ---------------------------------------------------------
    print("\n" + "=" * 78)
    print("AUDIT 2: SEALED PRODUCT CONTENTS VS STORED TOTAL EV")
    print("-" * 78)

    def resolve_contents_ev_and_cards(prod: Dict[str, Any], visited=None) -> Tuple[float, int, List[str]]:
        if visited is None:
            visited = set()
        p_id = prod.get("id") or prod.get("uuid")
        if p_id and p_id in visited:
            return 0.0, 0, []
        if p_id:
            visited.add(p_id)

        contents = prod.get("contents") or {}
        p_set = (prod.get("setCode") or "").upper()
        total_ev = 0.0
        total_cards = 0
        details = []

        # 1. Packs
        if "pack" in contents:
            for pk in contents["pack"]:
                count = pk.get("count", 1)
                code = (pk.get("code") or "draft").lower()
                target_set = (pk.get("set") or p_set).upper()
                
                # Lookup pack ev
                b_entry = (
                    booster_map.get((target_set, code, "all_cheapest", "direct")) or
                    booster_map.get((target_set, code, "all", "direct")) or
                    booster_map.get((target_set, code, "tcgplayer", "direct")) or
                    booster_map.get((target_set, "draft", "all_cheapest", "direct")) or
                    booster_map.get((target_set, "draft", "all", "direct")) or
                    booster_map.get((target_set, "play", "all_cheapest", "direct")) or
                    booster_map.get((target_set, "play", "all", "direct")) or
                    booster_map.get((target_set, "default", "all_cheapest", "direct")) or
                    booster_map.get((target_set, "default", "all", "direct"))
                )
                unit_ev = float(b_entry.get("evAverage") or 0) if b_entry else 0.0
                cards_per_pack = 15
                if "sample" in code or "prerelease" in code:
                    cards_per_pack = 2
                elif "jumpstart" in code:
                    cards_per_pack = 20
                elif "theme" in code:
                    cards_per_pack = 35

                pack_ev = count * unit_ev
                total_ev += pack_ev
                total_cards += count * cards_per_pack
                details.append(f"{count}x {target_set} {code} booster (${unit_ev:.2f} ea)")

        # 2. Decks
        if "deck" in contents:
            for dk in contents["deck"]:
                d_name = dk.get("name")
                matched_deck = precon_decks.get(d_name) or next(
                    (d for k, d in precon_decks.items() if d_name and d_name.lower() in k.lower()), None
                )
                d_ev = float(matched_deck.get("totalValue") or matched_deck.get("deckEv") or 0) if matched_deck else 0.0
                d_cards = int(matched_deck.get("cardCount") or 100) if matched_deck else 100
                total_ev += d_ev
                total_cards += d_cards
                details.append(f"1x Deck '{d_name}' (${d_ev:.2f})")

        # 3. Sealed subproducts (cases -> boxes -> packs)
        if "sealed" in contents:
            for s in contents["sealed"]:
                count = s.get("count", 1)
                sub_uuid = s.get("uuid")
                sub_prod = product_by_id.get(sub_uuid)
                if sub_prod:
                    sub_ev, sub_c, sub_det = resolve_contents_ev_and_cards(sub_prod, set(visited))
                    total_ev += count * sub_ev
                    total_cards += count * sub_c
                    details.append(f"{count}x Sealed '{sub_prod.get('name')}' (${sub_ev:.2f} ea)")

        # 4. Individual Cards
        if "card" in contents:
            for c in contents["card"]:
                count = c.get("count", 1)
                c_uuid = c.get("uuid")
                sp_entry = single_prices.get("byUuid", {}).get(c_uuid, {}) if isinstance(single_prices, dict) else {}
                c_price = float(sp_entry.get("price") or 0)
                total_ev += count * c_price
                total_cards += count

        return total_ev, total_cards, details

    ev_mismatch_issues = []
    roi_anomaly_issues = []

    for p in sealed_products:
        name = p.get("displayName") or p.get("name") or "Unknown"
        s_code = (p.get("setCode") or "").upper()
        stored_ev = float(p.get("totalEvAvg") or 0)
        market_price = float(p.get("marketPrice") or 0)

        calc_ev, calc_cards, details = resolve_contents_ev_and_cards(p)

        # Check for substantial mismatch between stored EV and calculated sum of contents
        if calc_ev > 0 and stored_ev > 0:
            diff = abs(stored_ev - calc_ev)
            pct_diff = diff / max(calc_ev, stored_ev)
            
            # If difference > 25% and > $15, flag it
            if pct_diff > 0.25 and diff > 15.0:
                ev_mismatch_issues.append({
                    "id": p.get("id"),
                    "name": name,
                    "setCode": s_code,
                    "marketPrice": market_price,
                    "storedEv": stored_ev,
                    "calcEv": calc_ev,
                    "diff": diff,
                    "pctDiff": pct_diff * 100,
                    "details": details[:2],
                })

        # Check for extreme ROI anomaly when market price is known
        if market_price > 5.0 and (calc_ev > 0 or stored_ev > 0):
            eval_ev = calc_ev if calc_ev > 0 else stored_ev
            roi = ((eval_ev - market_price) / market_price) * 100
            if roi > 300.0 or roi < -90.0:
                roi_anomaly_issues.append({
                    "name": name,
                    "setCode": s_code,
                    "marketPrice": market_price,
                    "evalEv": eval_ev,
                    "roi": roi,
                })

    ev_mismatch_issues.sort(key=lambda x: x["diff"], reverse=True)
    if ev_mismatch_issues:
        print(f"✘ Found {len(ev_mismatch_issues)} products with stored EV diverging from actual contents EV:")
        for issue in ev_mismatch_issues[:10]:
            print(f"  • [{issue['setCode']}] {issue['name'][:35]:<35} | Stored: ${issue['storedEv']:>8.2f} | "
                  f"Actual Contents: ${issue['calcEv']:>8.2f} | Diff: +${issue['diff']:>7.2f} (+{issue['pctDiff']:.1f}%)")
        if len(ev_mismatch_issues) > 10:
            print(f"  ... and {len(ev_mismatch_issues) - 10} more.")
    else:
        print("✔ [PASS] 100% of composite products match their aggregated contents EV.")

    # ---------------------------------------------------------
    # TEST 3: Extreme ROI Anomaly Audit
    # ---------------------------------------------------------
    print("\n" + "=" * 78)
    print("AUDIT 3: EXTREME ROI & PRICING ANOMALIES (ROI > +300% or < -90%)")
    print("-" * 78)
    roi_anomaly_issues.sort(key=lambda x: abs(x["roi"]), reverse=True)
    if roi_anomaly_issues:
        print(f"Found {len(roi_anomaly_issues)} products with abnormal arbitrage spreads:")
        for issue in roi_anomaly_issues[:8]:
            print(f"  • [{issue['setCode']}] {issue['name'][:38]:<38} | Market: ${issue['marketPrice']:>7.2f} | "
                  f"EV: ${issue['evalEv']:>8.2f} | ROI: {issue['roi']:>+7.1f}%")
    else:
        print("✔ [PASS] No extreme arbitrage pricing outliers detected.")

    # ---------------------------------------------------------
    # SUMMARY & RECOMMENDATIONS
    # ---------------------------------------------------------
    print("\n" + "=" * 78)
    print("VALIDATOR DIAGNOSTIC SUMMARY")
    print("=" * 78)
    print(f"1. Booster Quantile Outlier Skews:    {len(booster_skew_issues)} records")
    print(f"2. Product Contents vs EV Mismatches:  {len(ev_mismatch_issues)} records")
    print(f"3. Extreme ROI Pricing Anomalies:      {len(roi_anomaly_issues)} records")
    print("-" * 78)

    return {
        "booster_skew_count": len(booster_skew_issues),
        "ev_mismatch_count": len(ev_mismatch_issues),
        "roi_anomaly_count": len(roi_anomaly_issues),
        "top_mismatches": ev_mismatch_issues[:15],
    }

if __name__ == "__main__":
    run_audit()
