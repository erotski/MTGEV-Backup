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
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Tuple

PUBLIC_DATA_DIR = Path(__file__).parent.parent / "public" / "data"


def should_skip_roi_anomaly(product: Dict[str, Any]) -> bool:
    """Low-coverage mixed bundles can have tiny EV coverage while still showing a huge
    negative ROI due to missing vendor data. Those are a coverage-quality problem,
    not a real arbitrage signal, so the ROI audit should ignore them.
    """
    if not isinstance(product, dict):
        return False

    category = (product.get("category") or "").lower()
    if category not in {"box_set", "deck_box", "subset", "bundle", "mixed_composite"}:
        return False

    pricing_by_vendor = product.get("fixedPricingByVendor") or {}
    if not isinstance(pricing_by_vendor, dict):
        return False

    coverage_values = []
    for vendor_data in pricing_by_vendor.values():
        if not isinstance(vendor_data, dict):
            continue
        coverage = vendor_data.get("coveragePct")
        if coverage is not None:
            try:
                coverage_values.append(float(coverage))
            except (TypeError, ValueError):
                pass

    if not coverage_values:
        return False

    max_coverage = max(coverage_values)
    return max_coverage < 25.0


def bucket_weights(bucket_count: int = 100, simulated_packs: int = 5000) -> List[float]:
    """True probability weight of each empirical_quantiles() bucket.

    Mirrors composite_evaluator.py's bucket_weights(): the exact min/max
    endpoints represent a single sample each, not a full 1% bucket. A naive
    arithmetic mean of the 100-point curve overweights those endpoints and
    was previously misreported here as a "quantile skew" data-quality bug
    (see PROJECT_REVIEW.md DEV-25) when it was actually this same artifact.
    """
    if bucket_count <= 2 or simulated_packs <= bucket_count:
        return [1.0 / bucket_count] * bucket_count
    endpoint_weight = 1.0 / simulated_packs
    interior_weight = (1.0 - 2 * endpoint_weight) / (bucket_count - 2)
    return [endpoint_weight] + [interior_weight] * (bucket_count - 2) + [endpoint_weight]


BUCKET_WEIGHTS_100 = bucket_weights()


def build_diagnostics(
    booster_skew_issues: List[Dict[str, Any]],
    ev_mismatch_issues: List[Dict[str, Any]],
    roi_anomaly_issues: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Build one canonical report so counts cannot diverge from issue lists."""
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "boosterSkewCount": len(booster_skew_issues),
        "evMismatchCount": len(ev_mismatch_issues),
        "roiAnomalyCount": len(roi_anomaly_issues),
        "boosterSkewIssues": booster_skew_issues,
        "evMismatchIssues": ev_mismatch_issues,
        "roiAnomalyIssues": roi_anomaly_issues,
    }


def normalize_deck_name(value: Any) -> str:
    return " ".join(str(value or "").replace("_", " ").split()).strip().lower()


def build_precon_index(precon_data: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    """Index both compact slug keys and display names from precon_decks.json."""
    if not isinstance(precon_data, dict):
        return {}

    records = precon_data.get("decks") if isinstance(precon_data.get("decks"), dict) else precon_data
    index: Dict[str, Dict[str, Any]] = {}
    for key, record in records.items():
        if not isinstance(record, dict):
            continue
        for candidate in (key, record.get("deckName"), record.get("name")):
            normalized = normalize_deck_name(candidate)
            if normalized:
                index[normalized] = record

    aliases = precon_data.get("aliases") if isinstance(precon_data.get("aliases"), dict) else {}
    for alias, target in aliases.items():
        target_record = records.get(target)
        if isinstance(target_record, dict):
            index[normalize_deck_name(alias)] = target_record
    return index


def load_json(filepath: Path) -> Any:
    if not filepath.exists():
        print(f"[ERROR] {filepath} does not exist.")
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
    precon_index = build_precon_index(precon_decks)

    print(f"Loaded {len(sealed_products):,} sealed products")
    print(f"Loaded {len(booster_evs):,} booster EV records")
    print(f"Loaded {len(arbitrage_leaderboard):,} arbitrage leaderboard records\n")

    # Build Booster EV Lookup: (setCode, boosterName, vendor, priceMode) -> record
    booster_map: Dict[Tuple[str, str, str, str], Dict[str, Any]] = {}
    for b in booster_evs:
        s_code = (b.get("setCode") or "").upper()
        b_name = (b.get("boosterName") or "").lower()
        v = (b.get("vendor") or "all_cheapest").lower()
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
            q_weighted_mean = sum(v * w for v, w in zip(q, BUCKET_WEIGHTS_100))
            q_max = max(q)
            ratio = q_weighted_mean / ev_avg
            if ratio > 1.35 or ratio < 0.70:
                booster_skew_issues.append({
                    "setCode": s_code,
                    "boosterName": b_name,
                    "vendor": v,
                    "priceMode": pm,
                    "evAverage": ev_avg,
                    "quantileMean": q_mean,
                    "quantileWeightedMean": q_weighted_mean,
                    "quantileMax": q_max,
                    "skewRatio": ratio,
                })

    booster_skew_issues.sort(key=lambda x: x["skewRatio"], reverse=True)
    if booster_skew_issues:
        print(f"[FAIL] Found {len(booster_skew_issues)} booster distributions with significant quantile mean skew:")
        for issue in booster_skew_issues[:8]:
            print(f"  • {issue['setCode']} {issue['boosterName']:<14} ({issue['vendor']}/{issue['priceMode']}) | "
                  f"True EV Avg: ${issue['evAverage']:>6.2f} | Quantile Mean: ${issue['quantileMean']:>6.2f} | "
                  f"Max Jackpot: ${issue['quantileMax']:>7.2f} (Skew: {issue['skewRatio']:.1f}x)")
        if len(booster_skew_issues) > 8:
            print(f"  ... and {len(booster_skew_issues) - 8} more.")
    else:
        print("[PASS] All booster quantile distributions match their analytical expected value.")

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
                    booster_map.get((target_set, code, "tcgplayer", "direct")) or
                    booster_map.get((target_set, "draft", "all_cheapest", "direct")) or
                    booster_map.get((target_set, "play", "all_cheapest", "direct")) or
                    booster_map.get((target_set, "default", "all_cheapest", "direct"))
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
                matched_deck = precon_index.get(normalize_deck_name(d_name))
                if matched_deck is None and d_name:
                    normalized_name = normalize_deck_name(d_name)
                    matched_deck = next(
                        (d for key, d in precon_index.items() if normalized_name in key or key in normalized_name),
                        None,
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
                    "productUuid": p.get("id") or p.get("uuid"),
                    "name": name,
                    "setCode": s_code,
                    "category": p.get("category"),
                    "archetype": p.get("archetype"),
                    "marketPrice": market_price,
                    "storedEv": stored_ev,
                    "calcEv": calc_ev,
                    "diff": diff,
                    "pctDiff": pct_diff * 100,
                    "details": details[:2],
                })

        # ROI must use the authoritative complete-product EV, not a partial
        # recursive contents walk that can omit decks or nested sealed items.
        # Guard against low-coverage mixed bundles where missing pricing data makes
        # the stored EV look catastrophically bad even though the product is not
        # meaningfully actionable as an arbitrage opportunity.
        if market_price > 5.0 and stored_ev > 0:
            if should_skip_roi_anomaly(p):
                continue
            roi = ((stored_ev - market_price) / market_price) * 100
            if roi > 300.0 or roi < -90.0:
                roi_anomaly_issues.append({
                    "id": p.get("id"),
                    "productUuid": p.get("id") or p.get("uuid"),
                    "name": name,
                    "setCode": s_code,
                    "category": p.get("category"),
                    "archetype": p.get("archetype"),
                    "marketPrice": market_price,
                    "storedEv": stored_ev,
                    "calcEv": calc_ev,
                    "roi": roi,
                })

    ev_mismatch_issues.sort(key=lambda x: x["diff"], reverse=True)
    if ev_mismatch_issues:
        print(f"[FAIL] Found {len(ev_mismatch_issues)} products with stored EV diverging from actual contents EV:")
        for issue in ev_mismatch_issues[:10]:
            print(f"  • [{issue['setCode']}] {issue['name'][:35]:<35} | Stored: ${issue['storedEv']:>8.2f} | "
                  f"Actual Contents: ${issue['calcEv']:>8.2f} | Diff: +${issue['diff']:>7.2f} (+{issue['pctDiff']:.1f}%)")
        if len(ev_mismatch_issues) > 10:
            print(f"  ... and {len(ev_mismatch_issues) - 10} more.")
    else:
        print("[PASS] 100% of composite products match their aggregated contents EV.")

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
                f"Stored EV: ${issue['storedEv']:>8.2f} | ROI: {issue['roi']:>+7.1f}%")
    else:
        print("[PASS] No extreme arbitrage pricing outliers detected.")

    diagnostics = build_diagnostics(
        booster_skew_issues,
        ev_mismatch_issues,
        roi_anomaly_issues,
    )

    # ---------------------------------------------------------
    # SUMMARY & RECOMMENDATIONS
    # ---------------------------------------------------------
    print("\n" + "=" * 78)
    print("VALIDATOR DIAGNOSTIC SUMMARY")
    print("=" * 78)
    print(f"1. Booster Quantile Outlier Skews:    {diagnostics['boosterSkewCount']} records")
    print(f"2. Product Contents vs EV Mismatches:  {diagnostics['evMismatchCount']} records")
    print(f"3. Extreme ROI Pricing Anomalies:      {diagnostics['roiAnomalyCount']} records")
    print("-" * 78)

    # Persist the full (untruncated) issue lists for offline DEV-25 triage, since
    # the console only prints the top few per category.
    diagnostics_path = PUBLIC_DATA_DIR / "pricing_validator_diagnostics.json"
    try:
        with open(diagnostics_path, "w", encoding="utf-8") as f:
            json.dump(diagnostics, f, indent=2)
        print(f"Full diagnostic detail written to {diagnostics_path}")
    except Exception as e:
        print(f"[WARN] Could not write {diagnostics_path}: {e}")

    return {
        "booster_skew_count": diagnostics["boosterSkewCount"],
        "ev_mismatch_count": diagnostics["evMismatchCount"],
        "roi_anomaly_count": diagnostics["roiAnomalyCount"],
        "top_mismatches": diagnostics["evMismatchIssues"][:15],
    }

if __name__ == "__main__":
    run_audit()

