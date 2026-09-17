"""Synchronize JSON-only MTGJSON booster sheet metadata with the SQL import.

The AllPrintings SQL schema omits BoosterSheet.fixed. This stage reads the
authoritative per-set JSON files and writes a small overlay keyed by the same
set/booster/sheet identities used by the SQL tables.
"""

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
from urllib.request import Request, urlopen

import ijson

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_PATH = ROOT / "public" / "data" / "booster_collation_overrides.json"
MTGJSON_SET_URL = "https://mtgjson.com/api/v5/{set_code}.json"


def fetch_set_document(set_code: str):
    request = Request(
        MTGJSON_SET_URL.format(set_code=set_code.upper()),
        headers={"User-Agent": "MTGEV-Booster-Metadata-Sync/1.0"},
    )
    with urlopen(request, timeout=60) as response:
        return json.load(response)


def extract_fixed_entries(set_code: str, document, database_sheets):
    entries = {}
    warnings = []
    boosters = document.get("data", {}).get("booster", {})
    for booster_name, booster in boosters.items():
        if not isinstance(booster, dict):
            continue
        json_sheets = booster.get("sheets") or {}
        if not isinstance(json_sheets, dict):
            continue
        database_names = database_sheets.get((set_code.upper(), booster_name.lower()))
        if database_names is None:
            continue
        fixed_sheets = sorted(
            sheet_name
            for sheet_name, sheet in json_sheets.items()
            if isinstance(sheet, dict) and sheet.get("fixed") is True
        )
        missing_in_database = sorted(set(json_sheets) - database_names)
        missing_in_json = sorted(database_names - set(json_sheets))
        if missing_in_database:
            warnings.append(
                f"{set_code}:{booster_name} JSON sheets absent from SQL: "
                f"{', '.join(missing_in_database)}"
            )
        if missing_in_json:
            warnings.append(
                f"{set_code}:{booster_name} SQL sheets absent from JSON: "
                f"{', '.join(missing_in_json)}"
            )
        entries[f"{set_code.upper()}:{booster_name.lower()}"] = {
            "fixedSheets": fixed_sheets,
            "sheetNames": sorted(database_names),
        }
    return entries, warnings


def load_database_sheets(cursor):
    cursor.execute(
        """
        SELECT setCode, boosterName, sheetName
        FROM setBoosterSheets
        ORDER BY setCode, boosterName, sheetName
        """
    )
    sheets = {}
    for row in cursor.fetchall():
        key = (str(row["setCode"]).upper(), str(row["boosterName"]).lower())
        sheets.setdefault(key, set()).add(str(row["sheetName"]))
    return sheets


def build_overlay(database_sheets, fetch_document=fetch_set_document):
    entries = {}
    warnings = []
    source_versions = set()
    source_dates = set()
    set_codes = sorted({set_code for set_code, _ in database_sheets})
    for set_code in set_codes:
        document = fetch_document(set_code)
        meta = document.get("meta", {})
        if meta.get("version"):
            source_versions.add(str(meta["version"]))
        if meta.get("date"):
            source_dates.add(str(meta["date"]))
        set_entries, set_warnings = extract_fixed_entries(
            set_code, document, database_sheets
        )
        entries.update(set_entries)
        warnings.extend(set_warnings)
    return {
        "schemaVersion": 2,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "MTGJSON per-set JSON BoosterSheet.fixed metadata",
        "sourceVersions": sorted(source_versions),
        "sourceDates": sorted(source_dates),
        "setCount": len(set_codes),
        "entryCount": len(entries),
        "warningCount": len(warnings),
        "warnings": warnings,
        "entries": entries,
    }


def build_overlay_from_corpus(path):
    entries = {}
    source_versions = set()
    source_dates = set()
    set_count = 0
    booster_count = 0
    fixed_sheet_count = 0

    with Path(path).open("rb") as handle:
        for set_code, data in ijson.kvitems(handle, "data"):
            set_count += 1
            meta = data.get("meta") or {}
            if meta.get("version"):
                source_versions.add(str(meta["version"]))
            if meta.get("date"):
                source_dates.add(str(meta["date"]))
            for booster_name, booster in (data.get("booster") or {}).items():
                if not isinstance(booster, dict):
                    continue
                sheets = booster.get("sheets") or {}
                if not isinstance(sheets, dict):
                    continue
                booster_count += 1
                fixed_sheets = sorted(
                    name
                    for name, sheet in sheets.items()
                    if isinstance(sheet, dict) and sheet.get("fixed") is True
                )
                fixed_sheet_count += len(fixed_sheets)
                entries[f"{str(set_code).upper()}:{booster_name.lower()}"] = {
                    "fixedSheets": fixed_sheets,
                    "sheetNames": sorted(sheets),
                }

    return {
        "schemaVersion": 2,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "MTGJSON AllPrintings.json BoosterSheet.fixed metadata",
        "sourceVersions": sorted(source_versions),
        "sourceDates": sorted(source_dates),
        "setCount": set_count,
        "boosterDefinitionCount": booster_count,
        "fixedSheetCount": fixed_sheet_count,
        "warningCount": 0,
        "warnings": [],
        "entries": entries,
    }


def main():
    parser = argparse.ArgumentParser(
        description="Synchronize MTGJSON BoosterSheet.fixed metadata"
    )
    parser.add_argument(
        "--json-corpus",
        type=Path,
        help="Build the overlay from a local AllPrintings.json corpus instead of MySQL/API per-set files",
    )
    args = parser.parse_args()
    if args.json_corpus:
        overlay = build_overlay_from_corpus(args.json_corpus)
        OUTPUT_PATH.write_text(
            json.dumps(overlay, indent=2, allow_nan=False), encoding="utf-8"
        )
        print(
            f"[SUCCESS] Synchronized {overlay['fixedSheetCount']} fixed sheets "
            f"from {overlay['setCount']} sets"
        )
        return

    import mysql.connector
    from config import DB_CONFIG

    connection = mysql.connector.connect(**DB_CONFIG)
    cursor = connection.cursor(dictionary=True)
    try:
        overlay = build_overlay(load_database_sheets(cursor))
    finally:
        cursor.close()
        connection.close()
    OUTPUT_PATH.write_text(
        json.dumps(overlay, indent=2, allow_nan=False), encoding="utf-8"
    )
    status = "WARNING" if overlay["warningCount"] else "SUCCESS"
    print(
        f"[{status}] Synchronized fixed metadata for {overlay['entryCount']} "
        f"booster configurations across {overlay['setCount']} sets "
        f"({overlay['warningCount']} warnings)"
    )


if __name__ == "__main__":
    main()