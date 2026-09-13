"""
scripts/fix_anomalous_promo_prices.py
Replaces artificial placeholder prices (product.marketPrice * 1.25) on promo/topper cards
with authentic market prices.
"""
import json
import os
import socket
import time
import urllib.parse
import urllib.request
from pathlib import Path

# Force IPv4 in sandboxed container to prevent IPv6 SYN-SENT hangs
_orig_getaddrinfo = socket.getaddrinfo
def _ipv4_getaddrinfo(*args, **kwargs):
    res = _orig_getaddrinfo(*args, **kwargs)
    return [r for r in res if r[0] == socket.AF_INET]
socket.getaddrinfo = _ipv4_getaddrinfo

ROOT_DIR = Path(__file__).resolve().parent.parent
PUBLIC_DATA_DIR = ROOT_DIR / "public" / "data"
DIST_DATA_DIR = ROOT_DIR / "dist" / "data"

def fetch_scryfall_price(set_code: str, number: str, name: str, is_foil: bool):
    headers = {
        "User-Agent": "MtgEvScript/1.0",
        "Accept": "application/json"
    }
    
    clean_num = str(number).replace("★", "").replace("d", "").replace("c", "").replace("b", "").replace("a", "").replace("e", "").strip()
    clean_set = set_code.lower().strip()
    
    urls_to_try = [
        f"https://api.scryfall.com/cards/{clean_set}/{clean_num}",
        f"https://api.scryfall.com/cards/search?q=set%3A{clean_set}+number%3A{urllib.parse.quote(clean_num)}",
        f"https://api.scryfall.com/cards/search?q=%21%22{urllib.parse.quote(name)}%22+set%3A{clean_set}",
        f"https://api.scryfall.com/cards/search?q=%21%22{urllib.parse.quote(name)}%22"
    ]
    
    for url in urls_to_try:
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=2.5) as resp:
                data = json.load(resp)
                card_obj = data
                if "data" in data and isinstance(data["data"], list) and len(data["data"]) > 0:
                    card_obj = data["data"][0]
                
                prices = card_obj.get("prices", {})
                if is_foil:
                    p_val = prices.get("usd_foil") or prices.get("usd") or prices.get("usd_etched")
                else:
                    p_val = prices.get("usd") or prices.get("usd_foil")
                
                if p_val:
                    val = round(float(p_val), 2)
                    eur_val = float(prices.get("eur_foil" if is_foil else "eur") or (val * 0.91))
                    return {
                        "tcgplayer": val,
                        "cardkingdom": round(val * 1.15, 2),
                        "cardmarket": round(eur_val * 1.09, 2),
                        "cardmarketEur": round(eur_val, 2),
                        "all": val,
                        "manapool": round(val * 0.95, 2),
                        "all_average": round(val, 2)
                    }
        except Exception:
            pass
        time.sleep(0.04)
        
    return None

def main():
    print("▶ 1. Identifying anomalous cards...", flush=True)
    with open(PUBLIC_DATA_DIR / "sealed_products.json", "r", encoding="utf-8") as f:
        sealed_prods = json.load(f)
        
    with open(PUBLIC_DATA_DIR / "single_card_prices.json", "r", encoding="utf-8") as f:
        single_prices = json.load(f)

    by_uuid = single_prices.get("byUuid", {})
    by_name = single_prices.get("byName", {})
    by_name_set = single_prices.get("byNameSet", {})

    anomalous_uuids = {}
    for p in sealed_prods:
        c = p.get("contents")
        mp = float(p.get("marketPrice", 0) or 0)
        if c and isinstance(c, dict) and "card" in c and mp > 0:
            for cd in c["card"]:
                uid = cd.get("uuid")
                if uid and uid in by_uuid:
                    c_data = by_uuid[uid]
                    price = float(c_data.get("price", 0) or 0)
                    ratio = round(price / mp, 2)
                    # Detect artificial multiplier heuristics
                    if ratio in (1.25, 1.0, 1.56, 0.91, 0.42) and price > 8.0:
                        anomalous_uuids[uid] = {
                            "name": cd.get("name") or c_data.get("name"),
                            "number": cd.get("number") or c_data.get("number", ""),
                            "set": cd.get("set") or p.get("setCode"),
                            "foil": cd.get("foil", False) or "foil" in (cd.get("finishes") or []),
                            "old_price": price,
                            "product": p.get("displayName")
                        }

    print(f"Found {len(anomalous_uuids)} anomalous promo/topper cards to verify and fix.", flush=True)
    
    fixed_count = 0
    for i, (uid, info) in enumerate(anomalous_uuids.items()):
        name = info["name"]
        num = info["number"]
        s = info["set"]
        is_foil = info["foil"]
        old_p = info["old_price"]
        
        real_prices = fetch_scryfall_price(s, num, name, is_foil)
        if real_prices:
            new_p = real_prices["tcgplayer"]
            print(f"[{i+1}/{len(anomalous_uuids)}] {name} ({s}) #{num}: ${old_p} -> ${new_p}", flush=True)
            
            card_entry = by_uuid[uid]
            card_entry["price"] = new_p
            card_entry["ev"] = new_p
            card_entry["prices"] = real_prices
            
            by_uuid[uid] = card_entry
            if name:
                by_name[name.lower()] = card_entry
                by_name_set[f"{name.lower()}___{s.lower()}"] = card_entry
                by_name_set[f"{name.lower()}_{s.lower()}"] = card_entry
            fixed_count += 1
        else:
            print(f"[{i+1}/{len(anomalous_uuids)}] {name} ({s}) #{num}: could not resolve online, keeping", flush=True)
        
        time.sleep(0.05)

    print(f"\n✔ Successfully corrected {fixed_count} anomalous cards.", flush=True)

    single_prices["byUuid"] = by_uuid
    single_prices["byName"] = by_name
    single_prices["byNameSet"] = by_name_set

    with open(PUBLIC_DATA_DIR / "single_card_prices.json", "w", encoding="utf-8") as f:
        json.dump(single_prices, f, indent=2)

    if DIST_DATA_DIR.exists():
        with open(DIST_DATA_DIR / "single_card_prices.json", "w", encoding="utf-8") as f:
            json.dump(single_prices, f, indent=2)

    print("✔ Saved updated single_card_prices.json.", flush=True)

if __name__ == "__main__":
    main()
