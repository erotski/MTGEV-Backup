"""
export_set_hierarchy.py — Rebuilds public/data/scryfall_set_hierarchy.json from the MTGJSON
`sets` table already synced into MySQL by download.py, so root/sub-set relationships
(e.g. Foundations -> Foundations Jumpstart -> Foundations Jumpstart Front Cards) never
drift stale between manual refreshes.

This output is a UI convenience layer only (dropdown grouping, containment filters) with a
frontend fallback dictionary for anything missing, so a failure here must never abort the
required daily pipeline: all errors are caught and logged, and the script always exits 0.
"""
import json
import sys
from pathlib import Path

import mysql.connector
from config import DB_CONFIG

OUTPUT_PATH = Path(__file__).resolve().parent.parent / "public" / "data" / "scryfall_set_hierarchy.json"


def fetch_sets() -> list[dict]:
    conn = mysql.connector.connect(**DB_CONFIG)
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT code, name, parentCode, type, totalSetSize, releaseDate FROM sets")
        return cursor.fetchall()
    finally:
        conn.close()


def build_hierarchy(rows: list[dict]) -> dict:
    by_code: dict[str, dict] = {}
    for row in rows:
        code = (row.get("code") or "").upper()
        if not code:
            continue
        by_code[code] = {
            "code": code,
            "name": row.get("name") or code,
            "parentCode": (row.get("parentCode") or "").upper() or None,
            "setType": row.get("type"),
            "cardCount": row.get("totalSetSize") or 0,
            "releaseDate": str(row["releaseDate"]) if row.get("releaseDate") else None,
        }

    # A parentCode that isn't itself a known set (stale/removed reference) is treated as root.
    for node in by_code.values():
        if node["parentCode"] and node["parentCode"] not in by_code:
            node["parentCode"] = None

    children_by_parent: dict[str, list[str]] = {}
    for code, node in by_code.items():
        if node["parentCode"]:
            children_by_parent.setdefault(node["parentCode"], []).append(code)

    def resolve_root(code: str) -> str:
        seen = set()
        current = code
        while by_code[current]["parentCode"] and current not in seen:
            seen.add(current)
            current = by_code[current]["parentCode"]
        return current

    def collect_descendants(code: str, seen: set) -> set:
        for child in children_by_parent.get(code, []):
            if child not in seen:
                seen.add(child)
                collect_descendants(child, seen)
        return seen

    hierarchy: dict[str, dict] = {}
    for code, node in by_code.items():
        child_codes = sorted(children_by_parent.get(code, []))
        hierarchy[code] = {
            "code": code,
            "name": node["name"],
            "parentCode": node["parentCode"],
            "rootCode": resolve_root(code),
            "setType": node["setType"],
            "cardCount": node["cardCount"],
            "releaseDate": node["releaseDate"],
            "isRoot": node["parentCode"] is None,
            "childSets": [
                {
                    "code": c,
                    "name": by_code[c]["name"],
                    "setType": by_code[c]["setType"],
                    "cardCount": by_code[c]["cardCount"],
                }
                for c in child_codes
            ],
            "allDescendantCodes": sorted(collect_descendants(code, set())),
        }
    return hierarchy


def main() -> None:
    try:
        rows = fetch_sets()
        hierarchy = build_hierarchy(rows)
        OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
        with OUTPUT_PATH.open("w", encoding="utf-8") as handle:
            json.dump(hierarchy, handle, indent=2)
        print(f"[OK] Exported {len(hierarchy)} sets to {OUTPUT_PATH.name}")
    except Exception as error:  # noqa: BLE001 - best-effort export, never abort the pipeline
        print(f"[WARN] Could not regenerate {OUTPUT_PATH.name}: {error}", file=sys.stderr)


if __name__ == "__main__":
    main()
