"""Fixed-deck card pricing with explicit vendor/finish provenance."""

VENDORS = ("tcgplayer", "cardkingdom", "cardmarket")
FINISHES = ("normal", "foil", "etched")


def resolve_fixed_card_prices(all_prices_data, card_uuid, want_foil=False):
    """Resolve a fixed card while recording any documented neighbor borrowing."""
    entry = all_prices_data.get(card_uuid, {}).get("paper", {})
    requested_finish = "foil" if want_foil else "normal"
    finish_order = (
        ["foil", "normal", "etched"]
        if requested_finish == "foil"
        else ["normal", "foil", "etched"]
    )
    raw = {}
    for vendor in VENDORS:
        retail = entry.get(vendor, {}).get("retail", {})
        raw[vendor] = {
            finish: retail.get(finish, {}) for finish in FINISHES
        }

    prices = {}
    provenance = {}
    for vendor in VENDORS:
        resolved_vendor = vendor
        resolved_finish = None
        price_map = raw[vendor]
        if price_map.get(requested_finish):
            resolved_finish = requested_finish
            status = "exact"
        else:
            resolved_finish = next((finish for finish in finish_order if price_map.get(finish)), None)
            status = "finish_fallback" if resolved_finish else "unpriced"

        if not resolved_finish:
            for other_vendor in VENDORS:
                if raw[other_vendor].get(requested_finish):
                    resolved_vendor = other_vendor
                    resolved_finish = requested_finish
                    status = "vendor_fallback"
                    break
        if not resolved_finish:
            for other_vendor in VENDORS:
                resolved_finish = next(
                    (finish for finish in finish_order if raw[other_vendor].get(finish)),
                    None,
                )
                if resolved_finish:
                    resolved_vendor = other_vendor
                    status = "vendor_finish_fallback"
                    break

        if resolved_finish:
            date_prices = raw[resolved_vendor][resolved_finish]
            latest_date = sorted(date_prices.keys())[-1]
            value = round(float(date_prices[latest_date]), 2)
            if vendor == "cardmarket":
                prices["cardmarketEur"] = value if resolved_vendor == "cardmarket" else prices.get("cardmarketEur")
                prices[vendor] = round(value * 1.09, 2) if resolved_vendor == "cardmarket" else value
            else:
                prices[vendor] = value

        provenance[vendor] = {
            "status": status,
            "requestedVendor": vendor,
            "resolvedVendor": resolved_vendor if resolved_finish else None,
            "requestedFinish": requested_finish,
            "resolvedFinish": resolved_finish,
        }

    values = [prices[vendor] for vendor in VENDORS if prices.get(vendor, 0) > 0]
    if values:
        prices["all"] = round(sum(values) / len(values), 2)
        prices["all_average"] = prices["all"]
        provenance["all_average"] = {
            "status": "exact" if all(provenance[v]["status"] == "exact" for v in VENDORS) else "vendor_fallback",
            "requestedVendor": "all_average",
            "resolvedVendor": None,
            "requestedFinish": requested_finish,
            "resolvedFinish": None,
        }
    else:
        provenance["all_average"] = {
            "status": "unpriced",
            "requestedVendor": "all_average",
            "resolvedVendor": None,
            "requestedFinish": requested_finish,
            "resolvedFinish": None,
        }

    return prices, provenance
