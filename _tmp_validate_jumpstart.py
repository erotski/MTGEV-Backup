import glob
import json
import os
import sys
import importlib.util

sys.path.insert(0, os.path.join(os.getcwd(), 'backend'))

spec = importlib.util.spec_from_file_location(
    'populate_booster_ev_to_db',
    os.path.join(os.getcwd(), 'backend', 'populate_booster_ev_to_db.py'),
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

overrides = json.load(open('public/data/booster_collation_overrides.json', 'r', encoding='utf-8'))['entries']
obj = module.DatabaseBoosterEVEngine.__new__(module.DatabaseBoosterEVEngine)
obj.collation_overrides = overrides

for fp in sorted(glob.glob('temp_jumpbooster/*.json')):
    with open(fp, 'r', encoding='utf-8') as handle:
        payload = json.load(handle)
    jumpstart = payload.get('data', {}).get('booster', {}).get('jumpstart', {})
    if not jumpstart:
        continue

    sheets = jumpstart.get('sheets') or {}
    fixed = []
    variable = []
    if isinstance(sheets, dict):
        for name, sheet in sheets.items():
            if sheet.get('fixed') is True:
                fixed.append(name)
            elif sheet.get('fixed') is not True:
                variable.append(name)
    else:
        for sheet in sheets:
            name = sheet.get('name')
            if sheet.get('fixed') is True:
                fixed.append(name)
            elif sheet.get('fixed') is not True:
                variable.append(name)

    set_code = os.path.splitext(os.path.basename(fp))[0]
    entry = overrides.get(f'{set_code}:jumpstart')
    if entry:
        for name in fixed:
            assert obj._sheet_fixed_override(set_code, 'jumpstart', name) is True, (
                f'fixed mismatch: {set_code} {name}'
            )
        for name in entry.get('variableSheets', []):
            assert obj._sheet_fixed_override(set_code, 'jumpstart', name) is False, (
                f'variable mismatch: {set_code} {name}'
            )
        print(f'{set_code}: fixed={len(fixed)} variable={len(variable)} override_variable={len(entry.get("variableSheets", []))}')
    else:
        print(f'NO_OVERRIDE {set_code}')

print('VALIDATION_OK')
