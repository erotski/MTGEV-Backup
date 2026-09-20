"""Canonical sealed-product taxonomy derived from MySQL product metadata."""

import re
from typing import Any


PRIMARY_CATEGORY_ALIASES = {
    "booster_box": "booster_box",
    "booster_pack": "booster_pack",
    "draft_pack": "booster_pack",
    "booster_case": "booster_case",
    "case": "booster_case",
    "bundle": "bundle",
    "bundle_case": "bundle_case",
    "box_set": "box_set",
    "secret_lair": "box_set",
    "deck": "deck",
    "commander_deck": "deck",
    "starter_deck": "deck",
    "deck_box": "deck",
    "multiple_decks": "multiple_decks",
    "limited_aid_tool": "limited_aid_tool",
    "prerelease": "limited_aid_tool",
    "prerelease_pack": "limited_aid_tool",
    "kit": "kit",
}

SUBTYPE_TAGS = {
    "collector": "collector",
    "commander": "commander",
    "draft": "draft",
    "gift": "gift",
    "jumpstart": "jumpstart",
    "play": "play",
    "prerelease": "prerelease",
    "prerelease_kit": "prerelease",
    "set": "set_booster",
}

NAME_TAG_PATTERNS = {
    "jumpstart": (r"\bjumpstart\b",),
    "secret_lair": (r"\bsecret\s+lair\b", r"\bsuperdrop\b"),
    "commander": (r"\bcommander\b",),
    "collector": (r"\bcollector\b",),
    "gift": (r"\bgift\b",),
    "prerelease": (r"\bpre[ -]?release\b",),
    "sample_promo_topper": (
        r"\bsample\b",
        r"\bbox[ _-]?topper\b",
        r"\btopper\b",
        r"\bpromo(?:tional)?\b",
    ),
}

NAME_PRIMARY_PATTERNS = (
    ("bundle_case", (r"\bbundle\b.*\bcase\b", r"\bcase\b.*\bbundle\b")),
    ("booster_case", (r"\bbooster\b.*\bcase\b", r"\bcase\b.*\bbooster\b")),
    ("booster_box", (r"\bbooster\s+(box|display)\b",)),
    ("booster_pack", (r"\bbooster\s+pack\b",)),
    ("bundle", (r"\bbundle\b", r"\bfat\s+pack\b")),
    ("limited_aid_tool", (r"\bpre[ -]?release\b",)),
    ("deck", (r"\bdeck\b", r"\bcommander\b")),
    ("box_set", (r"\bsecret\s+lair\b", r"\bsuperdrop\b")),
)


def _normalized(value: Any) -> str:
    return str(value or "").strip().lower().replace("-", "_").replace(" ", "_")


def _contents_tags(contents: Any) -> set[str]:
    if not isinstance(contents, dict):
        return set()

    tags = set()
    field_tags = {
        "pack": "contains_packs",
        "card": "contains_cards",
        "deck": "contains_decks",
        "sealed": "contains_sealed_products",
        "variable": "variable_contents",
    }
    for field, tag in field_tags.items():
        value = contents.get(field)
        if isinstance(value, list) and value:
            tags.add(tag)

    decks = contents.get("deck")
    if isinstance(decks, list) and len(decks) > 1:
        tags.add("multiple_decks")
    return tags


def _primary_from_name(name: str) -> str | None:
    for primary_category, patterns in NAME_PRIMARY_PATTERNS:
        if any(re.search(pattern, name, flags=re.IGNORECASE) for pattern in patterns):
            return primary_category
    return None


def classify_product(product: dict[str, Any], override: dict[str, Any] | None = None) -> dict[str, Any]:
    """Return canonical category fields without mutating the source product."""
    raw_category = _normalized(product.get("category"))
    raw_subtype = _normalized(product.get("subtype"))
    name = str(product.get("displayName") or product.get("name") or "")
    contents_tags = _contents_tags(product.get("contents"))
    tags = set(contents_tags)
    signals = []
    warnings = []

    if raw_category:
        tags.add(raw_category)
    if raw_subtype:
        tags.add(raw_subtype)

    primary_category = PRIMARY_CATEGORY_ALIASES.get(raw_category)
    if primary_category:
        signals.append("category")
        tags.update((raw_category, primary_category))

    subtype_tag = SUBTYPE_TAGS.get(raw_subtype)
    if subtype_tag:
        signals.append("subtype")
        tags.add(subtype_tag)

    for tag, patterns in NAME_TAG_PATTERNS.items():
        if any(re.search(pattern, name, flags=re.IGNORECASE) for pattern in patterns):
            signals.append("name")
            tags.add(tag)

    if contents_tags:
        signals.append("contents")

    inferred_primary = _primary_from_name(name)
    if not primary_category and inferred_primary:
        primary_category = inferred_primary
        signals.append("name_primary_fallback")
    elif (
        primary_category
        and inferred_primary in {"booster_case", "bundle_case"}
        and inferred_primary != primary_category
    ):
        warnings.append(f"category_name_conflict:{primary_category}:{inferred_primary}")

    if not primary_category:
        if "multiple_decks" in contents_tags:
            primary_category = "multiple_decks"
            signals.append("contents_primary_fallback")
        elif "contains_decks" in contents_tags:
            primary_category = "deck"
            signals.append("contents_primary_fallback")
        else:
            primary_category = "other"
            signals.append("fallback")

    tags.add(primary_category)

    if raw_category in {"prerelease", "prerelease_pack"}:
        tags.add("prerelease")
    if raw_subtype in {"sample", "sample_pack", "collector_sample", "topper", "box_topper", "promotional"}:
        tags.add("sample_promo_topper")
    if primary_category in {"deck", "multiple_decks"}:
        if "commander" in tags:
            tags.add("commander_deck")
        else:
            tags.add("preconstructed_deck")
    if primary_category == "box_set" and "secret_lair" not in tags:
        tags.add("special_collection")

    override = override or {}
    override_applied = False
    override_primary = _normalized(override.get("primaryCategory"))
    if override_primary:
        primary_category = override_primary
        tags.add(override_primary)
        override_applied = True

    add_tags = override.get("addTags") or []
    remove_tags = override.get("removeTags") or []
    if not isinstance(add_tags, list) or not all(isinstance(tag, str) for tag in add_tags):
        raise ValueError("taxonomy override addTags must be an array of strings")
    if not isinstance(remove_tags, list) or not all(isinstance(tag, str) for tag in remove_tags):
        raise ValueError("taxonomy override removeTags must be an array of strings")

    for tag in add_tags:
        normalized_tag = _normalized(tag)
        if normalized_tag:
            tags.add(normalized_tag)
            override_applied = True
    for tag in remove_tags:
        normalized_tag = _normalized(tag)
        if normalized_tag and normalized_tag != primary_category:
            tags.discard(normalized_tag)
            override_applied = True

    if override_applied:
        signals.append("override")

    return {
        "primaryCategory": primary_category,
        "categoryTags": sorted(tags),
        "classificationSource": "override" if override_applied else "automatic",
        "classificationSignals": list(dict.fromkeys(signals)),
        "classificationWarnings": warnings,
    }


def apply_product_taxonomy(product: dict[str, Any], overrides: dict[str, Any] | None = None) -> dict[str, Any]:
    product_id = product.get("id") or product.get("uuid") or product.get("productUuid")
    product.update(classify_product(product, (overrides or {}).get(product_id)))
    return product


def validate_taxonomy_overrides(products: list[dict[str, Any]], overrides: dict[str, Any]) -> None:
    product_ids = {product.get("id") or product.get("uuid") for product in products}
    unknown_ids = sorted(set(overrides) - product_ids)
    if unknown_ids:
        raise ValueError(f"taxonomy override references unknown product UUID: {unknown_ids[0]}")
    for product_id, override in overrides.items():
        if not isinstance(override, dict):
            raise ValueError(f"taxonomy override for {product_id} must be an object")


def validate_product_taxonomy_contract(
    sealed_products: list[dict[str, Any]],
    dependent_snapshots: dict[str, list[dict[str, Any]]] | None = None,
) -> None:
    """Ensure sealed products own taxonomy and dependent snapshots mirror it."""
    canonical = {}
    for product in sealed_products:
        product_id = product.get("id") or product.get("uuid")
        primary_category = product.get("primaryCategory")
        category_tags = product.get("categoryTags")
        if not product_id:
            raise ValueError("sealed product taxonomy is missing id/uuid")
        if not isinstance(primary_category, str) or not primary_category:
            raise ValueError(f"sealed product {product_id} is missing primaryCategory")
        if not isinstance(category_tags, list) or not category_tags or primary_category not in category_tags:
            raise ValueError(f"sealed product {product_id} has invalid categoryTags")
        if len(category_tags) != len(set(category_tags)):
            raise ValueError(f"sealed product {product_id} has duplicate categoryTags")
        canonical[product_id] = (primary_category, category_tags)

    for snapshot_name, records in (dependent_snapshots or {}).items():
        for record in records:
            product_id = record.get("productUuid") or record.get("id")
            if product_id not in canonical:
                raise ValueError(f"{snapshot_name} references unknown product {product_id}")
            expected_primary, expected_tags = canonical[product_id]
            if record.get("primaryCategory") != expected_primary:
                raise ValueError(f"{snapshot_name} taxonomy differs for product {product_id}")
            if record.get("categoryTags") != expected_tags:
                raise ValueError(f"{snapshot_name} tags differ for product {product_id}")