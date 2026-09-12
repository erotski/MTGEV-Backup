import json

TARGET_IDS = [
  '3eda255f-9569-5f08-981e-505c1b6d6871', # Electric Entourage Japanese
  '5b87bc72-10c8-5829-bf9e-5700497010b7', # Electric Entourage Japanese Foil
  '7b3a5aa6-b5fd-5233-853c-b3af44f1310d', # Winter Diva Japanese
  'f3c36088-b5c8-5c55-97fc-19beee5174c8', # Winter Diva Japanese Foil
  '45b3bf3c-8316-5c65-ad2d-8aa680aaf7d4'  # Winter Diva English Foil (has 399/400, user wants 199/200)
]

sealed_path = 'public/data/sealed_products.json'
with open(sealed_path, 'r') as f:
    sealed_data = json.load(f)

overrides_path = 'public/data/product_overrides.json'
try:
    with open(overrides_path, 'r') as f:
        overrides = json.load(f)
except Exception:
    overrides = {}

for p in sealed_data:
    if p.get('id') in TARGET_IDS:
        contents = p.get('contents', {})
        if 'variable' in contents:
            for v in contents['variable']:
                if 'configs' in v:
                    # Update configs with proper chance/weight
                    # Typically the first is the normal card, second is Snapcaster
                    if len(v['configs']) == 2:
                        v['configs'][0]['variable_config'] = [{"chance": 199, "weight": 200}]
                        v['configs'][1]['variable_config'] = [{"chance": 1, "weight": 200}]
        
        overrides[p['id']] = {
            "_comment": p.get('displayName'),
            "contents": contents
        }

# Remove the old incorrect ones if they exist
if 'a95a5351-f8dd-533c-aa9a-91ec60e9cd4e' in overrides:
    del overrides['a95a5351-f8dd-533c-aa9a-91ec60e9cd4e']
if 'a4567c30-d0b6-51bf-ab4d-d41b2cb64f3c' in overrides:
    del overrides['a4567c30-d0b6-51bf-ab4d-d41b2cb64f3c']

with open(overrides_path, 'w') as f:
    json.dump(overrides, f, indent=2)

print("Overrides updated.")
