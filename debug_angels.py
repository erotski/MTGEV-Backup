import json
from backend.composite_evaluator import load_data, resolve_product_contents, calculate_fixed_ev, build_booster_lookup

def run():
    products, booster_ev, precon_decks, single_prices = load_data()
    prod_map = {p["id"]: p for p in products}
    booster_lookup = build_booster_lookup(booster_ev)
    
    prod_id = '13686b50-ca87-577d-8910-0f02e2b79e49'
    prod = prod_map.get(prod_id)
    print("Product:", prod.get("displayName"))
    contents = resolve_product_contents(prod_id, prod_map)
    print("Contents:", contents)
    
    fixed_ev = calculate_fixed_ev(contents["cards"], contents["decks"], single_prices, precon_decks, "all", prod)
    print("Fixed EV:", fixed_ev)

run()
