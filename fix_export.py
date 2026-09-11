import re
with open("backend/export_app_data.py", "r") as f:
    content = f.read()

# Replace everything from Step 1 to Step 4 with just the json.loads loop
old_code = re.compile(r"        # Step 1: Collect authentic empirical shapes.*        with open\(OUTPUT_DIR / \"booster_ev.json\"", re.DOTALL)
new_code = """        for r in ev_results:
            if r.get("quantiles") and isinstance(r["quantiles"], str):
                try:
                    r["quantiles"] = json.loads(r["quantiles"])
                except Exception:
                    r["quantiles"] = []

        with open(OUTPUT_DIR / "booster_ev.json\""""

content = old_code.sub(new_code, content)
with open("backend/export_app_data.py", "w") as f:
    f.write(content)
