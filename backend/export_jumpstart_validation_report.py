"""Export an auditable report of Jumpstart collation treatment."""

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data"
REPORT_PATH = DATA / "jumpstart_validation_report.json"
MTGJSON_SET_URL = "https://mtgjson.com/api/v5/{set_code}.json"


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def allocate_counts(weights, sample_size: int):
    if not weights or sample_size <= 0:
        return [0] * len(weights)
    normalized = [max(0.0, float(weight)) for weight in weights]
    total = sum(normalized)
    if total == 0:
        normalized = [1.0] * len(weights)
        total = float(len(weights))
    exact = [weight / total * sample_size for weight in normalized]
    counts = [int(value) for value in exact]
    remainder_order = sorted(
        range(len(weights)), key=lambda index: (-(exact[index] - counts[index]), index)
    )
    for index in remainder_order[: sample_size - sum(counts)]:
        counts[index] += 1
    return counts


def fetch_mtgjson_jumpstart(set_code: str):
    request = Request(
        MTGJSON_SET_URL.format(set_code=set_code),
        headers={"User-Agent": "MTGEV-Jumpstart-Validator/1.0"},
    )
    with urlopen(request, timeout=30) as response:
        payload = json.load(response)
    return (payload.get("data", {}).get("booster", {}).get("jumpstart"), payload.get("meta", {}))


def classify_set(set_code, booster, override, sample_size, source, source_meta=None):
    issues = []
    notes = []
    exact_fixed_sheets = set(override.get("fixedSheets", [])) if "fixedSheets" in override else None
    variable_sheets = set(override.get("variableSheets", []))
    fixed_by_default = override.get("fixedByDefault") is True
    sheets = booster.get("sheets") or {}
    configurations = booster.get("boosters") or []
    allocations = allocate_counts(
        [configuration.get("weight", 0) for configuration in configurations],
        sample_size,
    )
    referenced_sheets = set()
    configuration_reports = []

    for index, configuration in enumerate(configurations):
        content_report = []
        total_picks = 0
        for sheet_name, picks in (configuration.get("contents") or {}).items():
            referenced_sheets.add(sheet_name)
            sheet = sheets.get(sheet_name) or {}
            if exact_fixed_sheets is not None:
                treatment = "fixed" if sheet_name in exact_fixed_sheets else "variable"
            else:
                treatment = "variable" if sheet_name in variable_sheets else "fixed" if fixed_by_default else "unknown"
            if not sheet:
                issues.append(f"Configuration {index} references missing sheet {sheet_name}.")
            if treatment not in {"fixed", "variable"}:
                issues.append(f"Configuration {index} sheet {sheet_name} has unknown treatment.")
            if source == "mtgjson" and treatment == "fixed" and sheet.get("fixed") is not True:
                issues.append(f"Override treats {sheet_name} as fixed but MTGJSON does not mark it fixed.")
            if source == "mtgjson" and treatment == "variable" and sheet.get("fixed") is True:
                issues.append(f"Override treats {sheet_name} as variable but MTGJSON marks it fixed.")
            total_picks += int(picks)
            content_report.append({
                "sheetName": sheet_name,
                "picks": int(picks),
                "treatment": treatment,
                "foil": bool(sheet.get("foil", False)),
                "cardCount": sheet.get("cardCount") or len(sheet.get("cards") or {}),
                "totalWeight": sheet.get("totalWeight"),
                "sourceFixed": sheet.get("fixed") if source == "mtgjson" else None,
            })
        if total_picks != 20:
            issues.append(f"Configuration {index} contains {total_picks} cards instead of 20.")
        configuration_reports.append({
            "boosterIndex": index,
            "weight": configuration.get("weight", 0),
            "allocatedSamples": allocations[index],
            "totalPicks": total_picks,
            "contents": content_report,
        })

    if exact_fixed_sheets is not None:
        missing_fixed_sheets = sorted(exact_fixed_sheets - referenced_sheets)
        if missing_fixed_sheets:
            issues.append(f"Overlay fixed sheets are not referenced: {', '.join(missing_fixed_sheets)}.")
    else:
        missing_variable_sheets = sorted(variable_sheets - referenced_sheets)
        if missing_variable_sheets:
            issues.append(f"Override variable sheets are not referenced: {', '.join(missing_variable_sheets)}.")

    return {
        "setCode": set_code,
        "status": "pass" if not issues else "warning",
        "configurationSource": source,
        "sourceMetadata": source_meta or {},
        "notes": notes,
        "sampleSize": sample_size,
        "configurationCount": len(configurations),
        "totalConfigurationWeight": sum(float(item.get("weight", 0)) for item in configurations),
        "metadataMode": "exactFixedSheets" if exact_fixed_sheets is not None else "legacyFixedByDefault",
        "fixedSheets": sorted(exact_fixed_sheets or []),
        "fixedByDefault": fixed_by_default if exact_fixed_sheets is None else None,
        "variableSheets": sorted(variable_sheets) if exact_fixed_sheets is None else [],
        "issues": issues,
        "configurations": configuration_reports,
    }


def build_report(booster_slots, booster_evs, overrides, fetch_missing=True):
    jumpstart_records = [
        record for record in booster_evs
        if str(record.get("boosterName", "")).lower() == "jumpstart"
    ]
    ev_by_set = {}
    for record in jumpstart_records:
        ev_by_set.setdefault(str(record.get("setCode", "")).upper(), []).append(record)

    set_codes = sorted(set(ev_by_set) | {
        key.split(":", 1)[0].upper()
        for key in overrides
        if key.lower().endswith(":jumpstart")
    })
    set_reports = []
    for set_code in set_codes:
        records = ev_by_set.get(set_code, [])
        sample_sizes = sorted({int(record.get("simulatedPacks") or 0) for record in records if record.get("simulatedPacks")})
        sample_size = sample_sizes[-1] if sample_sizes else 0
        booster = (booster_slots.get(set_code) or {}).get("jumpstart")
        source = "booster_slots"
        source_meta = {}
        fetch_error = None
        if not booster and fetch_missing:
            try:
                booster, source_meta = fetch_mtgjson_jumpstart(set_code)
                source = "mtgjson"
            except (OSError, URLError, ValueError, json.JSONDecodeError) as error:
                fetch_error = str(error)
        override = overrides.get(f"{set_code}:jumpstart") or {}
        if booster:
            set_report = classify_set(set_code, booster, override, sample_size, source, source_meta)
        else:
            set_report = {
                "setCode": set_code,
                "status": "warning",
                "configurationSource": "unavailable",
                "sampleSize": sample_size,
                "configurationCount": 0,
                "fixedByDefault": override.get("fixedByDefault") is True,
                "variableSheets": override.get("variableSheets", []),
                "issues": [f"No Jumpstart configuration available{': ' + fetch_error if fetch_error else '.'}"],
                "configurations": [],
            }
        set_report["boosterEvRecordCount"] = len(records)
        set_report["boosterEvSampleSizes"] = sample_sizes
        unknown_treatments = [
            item
            for configuration in set_report.get("configurations", [])
            for item in configuration.get("contents", [])
            if item.get("treatment") not in {"fixed", "variable"}
        ]
        if unknown_treatments:
            set_report["issues"].append(
                f"{len(unknown_treatments)} sheets have unknown treatment."
            )
            set_report["status"] = "warning"
        if source == "mtgjson":
            set_report.setdefault("notes", []).append(
                "Jumpstart configuration is absent from booster_slots.json; MTGJSON fallback was used."
            )
        set_reports.append(set_report)

    warnings = sum(len(item["issues"]) for item in set_reports)
    return {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "status": "pass" if warnings == 0 else "warning",
        "sources": {
            "boosterSlots": "public/data/booster_slots.json",
            "boosterEv": "public/data/booster_ev.json",
            "overrides": "public/data/booster_collation_overrides.json",
            "mtgjsonFallback": MTGJSON_SET_URL,
        },
        "summary": {
            "setCount": len(set_reports),
            "configurationCount": sum(item["configurationCount"] for item in set_reports),
            "warningCount": warnings,
        },
        "sets": set_reports,
    }


def main():
    parser = argparse.ArgumentParser(description="Export Jumpstart collation validation report")
    parser.add_argument("--offline", action="store_true", help="Do not fetch missing configurations from MTGJSON")
    args = parser.parse_args()
    overrides_document = load_json(DATA / "booster_collation_overrides.json")
    report = build_report(
        load_json(DATA / "booster_slots.json"),
        load_json(DATA / "booster_ev.json"),
        overrides_document.get("entries", {}),
        fetch_missing=not args.offline,
    )
    REPORT_PATH.write_text(json.dumps(report, indent=2, allow_nan=False), encoding="utf-8")
    print(
        f"[{report['status'].upper()}] Exported Jumpstart validation report: "
        f"{report['summary']['setCount']} sets, "
        f"{report['summary']['configurationCount']} configurations, "
        f"{report['summary']['warningCount']} warnings"
    )


if __name__ == "__main__":
    main()