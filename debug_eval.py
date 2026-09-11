from backend.composite_evaluator import load_data, resolve_product_contents, calculate_fixed_ev, build_booster_lookup, simulate_composite_draws
import json

def run():
    products, booster_ev, precon_decks, single_prices = load_data()
    prod_map = {p["id"]: p for p in products}
    booster_lookup = build_booster_lookup(booster_ev)
    
    prod_id = '13686b50-ca87-577d-8910-0f02e2b79e49'
    prod = prod_map.get(prod_id)
    contents = resolve_product_contents(prod_id, prod_map)
    fixed_ev = calculate_fixed_ev(contents["cards"], contents["decks"], single_prices, precon_decks, "all", prod)
    
    print("Fixed EV:", fixed_ev)
    pack_specs = []
    
    print("Pack specs:", pack_specs)
    
    # Let's import the full function to see what it does
    import backend.composite_evaluator as ce
    res = ce._evaluate_product(prod, prod_map, booster_lookup, precon_decks, single_prices)
    print("RES:", res)
run()
