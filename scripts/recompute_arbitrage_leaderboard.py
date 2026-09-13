"""
scripts/recompute_arbitrage_leaderboard.py
Recomputes public/data/arbitrage_leaderboard.json strictly from MTGJSON contents and public datasets.
Never relies on product names or cardCount multipliers.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
from ev_engine import evaluate_product_composite  # noqa: E402

DATA_DIR = Path("public/data")

with open(DATA_DIR / "sealed_products.json", "r", encoding="utf-8") as f:
    sealed_products = json.load(f)

product_map = {}
for p in sealed_products:
    uid = p.get("id") or p.get("uuid")
    if uid:
        product_map[uid] = p

with open(DATA_DIR / "booster_ev.json", "r", encoding="utf-8") as f:
    booster_ev_list = json.load(f)

booster_ev_lookup = {}
for row in booster_ev_list:
    s = (row.get("setCode") or "").lower()
    b = (row.get("boosterName") or "").lower()
    m = (row.get("priceMode") or "direct").lower()
    v = (row.get("vendor") or "tcgplayer").lower()
    booster_ev_lookup[(s, b, m, v)] = row

with open(DATA_DIR / "precon_decks.json", "r", encoding="utf-8") as f:
    precon_decks = json.load(f)

with open(DATA_DIR / "single_card_prices.json", "r", encoding="utf-8") as f:
    single_prices = json.load(f)

# Build Leaderboard
leaderboard = []
for p in sealed_products:
    m_price = float(p.get("marketPrice", 0) or 0)
    if m_price <= 0:
        continue

    res = evaluate_product_composite(p, product_map, booster_ev_lookup, precon_decks, single_prices)
    box_ev = res["evAvg"]
    if box_ev <= 0:
        continue

    pack_count = res["packs"]
    card_count = res["cards"]
    pack_ev_avg = round(box_ev / pack_count, 2) if pack_count > 0 else 0.0
    pack_ev_mid90 = round(res["evMid90"] / pack_count, 2) if pack_count > 0 else 0.0
    pack_ev_min = round(res["evMin"] / pack_count, 2) if pack_count > 0 else 0.0
    pack_ev_max = round(res["evMax"] / pack_count, 2) if pack_count > 0 else 0.0

    arbitrage_val = round(box_ev - m_price, 2)
    roi_pct = round((arbitrage_val / m_price) * 100, 2)

    item = {
        "productUuid": p.get("id") or p.get("uuid"),
        "boxName": p.get("displayName") or p.get("name"),
        "category": p.get("category", "other"),
        "setCode": (p.get("setCode") or "").upper(),
        "setName": p.get("setName", ""),
        "marketPrice": m_price,
        "packCount": pack_count,
        "cardCount": card_count,
        "boosterName": res["boosterName"],
        "unitEvAvg": pack_ev_avg,
        "unitEvMid90": pack_ev_mid90,
        "unitEvMin": pack_ev_min,
        "unitEvMax": pack_ev_max,
        "totalEvAvg": box_ev,
        "totalEvMid90": res["evMid90"],
        "totalEvMin": res["evMin"],
        "totalEvMax": res["evMax"],
        "arbitrageValue": arbitrage_val,
        "profitUsd": arbitrage_val,
        "roiPercent": roi_pct,
        "roiPct": roi_pct,
        "completePct": "100.00",
        "updatedAt": p.get("priceFetchedAt", ""),
        "vendor": "tcgplayer",
        "priceMode": "direct",
        "purchaseUrl": p.get("purchaseUrl", ""),
        "contents": p.get("contents"),
    }
    leaderboard.append(item)

# Sort by arbitrage value descending
leaderboard.sort(key=lambda x: x["arbitrageValue"], reverse=True)

with open(DATA_DIR / "arbitrage_leaderboard.json", "w", encoding="utf-8") as f:
    json.dump(leaderboard, f, indent=2)

dist_dir = Path(__file__).resolve().parent.parent / "dist" / "data"
if dist_dir.exists():
    with open(dist_dir / "arbitrage_leaderboard.json", "w", encoding="utf-8") as f:
        json.dump(leaderboard, f, indent=2)

print(f"Successfully recomputed arbitrage_leaderboard.json with {len(leaderboard)} products.")
