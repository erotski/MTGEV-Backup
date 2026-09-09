#!/usr/bin/env python3
"""
WPN Marketing Asset Optimizer (Angle 01 Filter & Resizer)
=========================================================
Processes official Wizards of the Coast WPN Digital Marketing Asset (DMA)
ZIP files or unzipped folders.

Features:
- Selects only Angle '01' 3D product renders (the canonical isometric front angle)
- Filters out wallpaper, dieline, banner, social, and poster images
- Resizes massive 4000x4000 (5MB-15MB) renders down to max 800px width/height
- Preserves 32-bit transparent alpha channels
- Compresses output as optimized PNG and WebP (~50KB-80KB)
- Automatically names output: {setcode}-{type}.png into public/products/

Usage:
  python scripts/process_wpn_assets.py /path/to/HOB_DMA.zip
  python scripts/process_wpn_assets.py /path/to/unzipped_folder/ --set hob
"""

import os
import sys
import io
import re
import zipfile
import argparse
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("❌ Pillow library not found. Please install it with:\n    pip install Pillow\n")
    sys.exit(1)

MAX_DIMENSION = 800  # Max width/height for web display
DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parent.parent / "public" / "products"

KNOWN_SETS = {
    "hob": "The Hobbit",
    "mh3": "Modern Horizons 3",
    "otj": "Outlaws of Thunder Junction",
    "blb": "Bloomburrow",
    "dsk": "Duskmourn: House of Horror",
    "fdn": "Foundations",
    "mkm": "Murders at Karlov Manor",
    "lci": "The Lost Caverns of Ixalan",
    "woe": "Wilds of Eldraine",
    "ltr": "The Lord of the Rings: Tales of Middle-earth",
    "mom": "March of the Machine",
    "one": "Phyrexia: All Will Be One",
    "bro": "The Brothers' War",
    "dmu": "Dominaria United",
    "snc": "Streets of New Capenna",
    "neo": "Kamigawa: Neon Dynasty",
    "vow": "Innistrad: Crimson Vow",
    "mid": "Innistrad: Midnight Hunt",
    "afr": "Adventures in the Forgotten Realms",
    "stx": "Strixhaven: School of Mages",
    "khm": "Kaldheim",
    "znr": "Zendikar Rising",
}


def detect_set_code(filename_or_path: str, explicit_set: str = None) -> str:
    if explicit_set:
        return explicit_set.lower().strip()

    clean = os.path.basename(filename_or_path).lower()

    for code in KNOWN_SETS.keys():
        if re.search(rf"\b{code}\b|[_\-]{code}[_\-]|^{code}[_\-]", clean):
            return code

    # Fallback to first 3-4 alphanumeric characters
    match = re.match(r"^[a-z0-9]{3,4}", clean)
    return match.group(0) if match else "mtg"


def is_angle_01(filename: str) -> bool:
    """Returns True if the file represents the primary '01' marketing angle."""
    b = os.path.basename(filename).lower()
    return bool(
        b.startswith("01_")
        or b.startswith("01-")
        or b.startswith("01.")
        or "_01_" in b
        or "_01." in b
        or "-01-" in b
        or "-01." in b
        or "angle01" in b
        or "angle_1" in b
        or "pos01" in b
        or "pos_1" in b
    )


def is_other_angle(filename: str) -> bool:
    """Returns True if the file represents alternative secondary angles (02, 03, etc.)."""
    b = os.path.basename(filename).lower()
    return bool(
        b.startswith("02_")
        or b.startswith("03_")
        or b.startswith("04_")
        or b.startswith("02-")
        or b.startswith("03-")
        or "_02_" in b
        or "_03_" in b
        or "_04_" in b
        or "angle02" in b
        or "angle03" in b
    )


def get_product_group_key(filename: str) -> str:
    """Extracts normalized base product name without angle prefixes/suffixes."""
    base = os.path.splitext(os.path.basename(filename))[0].lower()
    clean = re.sub(r"^(\d{1,2}[_\-\s]|angle\d{1,2}[_\-\s]|pos\d{1,2}[_\-\s])", "", base, flags=re.IGNORECASE)
    clean = re.sub(r"([_\-\s]\d{1,2}|[_\-\s]angle\d{1,2}|[_\-\s]pos\d{1,2})$", "", clean, flags=re.IGNORECASE)
    clean = re.sub(r"[-_\s]+", "_", clean).strip()
    return clean


def determine_target_filenames(set_code: str, raw_filename: str) -> list[str]:
    """Determines canonical target filenames and aliases for a product."""
    p = raw_filename.lower()
    base = os.path.splitext(os.path.basename(p))[0]

    clean = re.sub(r"^(\d{1,2}[_\-\s]|angle\d{1,2}[_\-\s]|pos\d{1,2}[_\-\s])", "", base, flags=re.IGNORECASE)
    clean = re.sub(r"([_\-\s]\d{1,2}|[_\-\s]angle\d{1,2}|[_\-\s]pos\d{1,2})$", "", clean, flags=re.IGNORECASE)
    clean = re.sub(r"_3d$", "", clean, flags=re.IGNORECASE)
    clean = re.sub(r"[-_\s]+", "_", clean).strip("_")

    filenames = []

    is_collector = "collector" in p or "clctr" in p
    is_display_box = "box" in p or "display" in p or "dspbx" in p or "dsp_bx" in p
    is_booster_pack = "pack" in p or "bstr" in p or "bstrpk" in p
    is_gift_bundle = "gftbndl" in p or ("gift" in p and ("bundle" in p or "edition" in p))
    is_standard_bundle = "bndl" in p or "bundle" in p or "fatpack" in p
    is_prerelease = "prrls" in p or "prerls" in p or "prerelease" in p or "pre-release" in p or "pr_pack" in p or "prpack" in p
    is_draft_night = "drftnght" in p or "draft_night" in p or "draft_set" in p

    # 1. Collector Display Box
    if is_collector and is_display_box:
        filenames.extend([f"{set_code}-collector.png", f"{set_code}-collector_box.png", f"{set_code}-collector_booster_box.png"])
    elif is_collector and is_booster_pack:
        filenames.extend([f"{set_code}-collector_pack.png", f"{set_code}-collector_booster_pack.png"])
    elif is_collector and "case" in p:
        filenames.append(f"{set_code}-collector_case.png")
    elif is_gift_bundle:
        filenames.extend([f"{set_code}-gift_bundle.png", f"{set_code}-gift.png"])
    elif is_standard_bundle:
        filenames.append(f"{set_code}-bundle.png")
    elif is_prerelease:
        filenames.append(f"{set_code}-prerelease.png")
    elif is_draft_night:
        filenames.append(f"{set_code}-draft_night.png")
    elif "jumpstart" in p and is_display_box:
        filenames.extend([f"{set_code}-jumpstart_box.png", f"{set_code}-jumpstart.png"])
    elif "jumpstart" in p and is_booster_pack:
        filenames.append(f"{set_code}-jumpstart_pack.png")
    elif "starter" in p or "beginner" in p:
        filenames.extend([f"{set_code}-starter_kit.png", f"{set_code}-starter.png"])
    elif ("play" in p or is_display_box) and not is_collector:
        filenames.extend([f"{set_code}-box.png", f"{set_code}-play_box.png", f"{set_code}-play_booster_box.png"])
    elif ("play" in p or is_booster_pack) and not is_collector:
        filenames.extend([f"{set_code}-pack.png", f"{set_code}-play_pack.png", f"{set_code}-play_booster_pack.png"])
    elif "commander" in p or "deck" in p or "precon" in p:
        deck_slug = re.sub(r"^(commander_deck_|commander_|deck_)", "", clean, flags=re.IGNORECASE)
        filenames.extend([f"{set_code}-commander_{deck_slug}.png", f"{set_code}-deck_{deck_slug}.png"])
    elif "scene" in p:
        scene_slug = re.sub(r"^scene_box_", "", clean, flags=re.IGNORECASE)
        filenames.append(f"{set_code}-scene_{scene_slug}.png")
    elif "case" in p:
        filenames.append(f"{set_code}-case.png")

    generic_slug = re.sub(f"^{set_code}_", "", clean, flags=re.IGNORECASE)
    generic_slug = re.sub(f"_{set_code}$", "", generic_slug, flags=re.IGNORECASE)
    if generic_slug:
        filenames.append(f"{set_code}-{generic_slug}.png")

    # Deduplicate while preserving order
    seen = set()
    result = []
    for f in filenames:
        if f not in seen:
            seen.add(f)
            result.append(f)
    return result


def is_image_file(path_str: str) -> bool:
    p = path_str.lower()
    ext = os.path.splitext(p)[1]
    if ext not in [".png", ".webp", ".jpg", ".jpeg"]:
        return False

    # Ignore marketing banners, logos, social media, flat dielines, etc.
    ignore_keywords = [
        "social", "facebook", "instagram", "banner", "header", "logo",
        "symbol", "poster", "flyer", "dieline", "diemap", "flat", "wallpaper"
    ]
    return not any(k in p for k in ignore_keywords)


def resize_and_save(img_bytes: bytes, out_png_path: Path, write_webp: bool = False) -> tuple[int, int]:
    """Resizes and compresses transparent image to max 800px."""
    orig_size = len(img_bytes)

    with Image.open(io.BytesIO(img_bytes)) as img:
        img = img.convert("RGBA")
        width, height = img.size

        # Downscale proportionally if larger than MAX_DIMENSION
        if width > MAX_DIMENSION or height > MAX_DIMENSION:
            scale = MAX_DIMENSION / max(width, height)
            new_width = int(width * scale)
            new_height = int(height * scale)
            img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)

        # Save optimized PNG with quantized palette
        out_png_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Save quantized PNG (massive reduction while maintaining 100% transparency)
        quantized = img.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        quantized.save(out_png_path, format="PNG", optimize=True)

        # Also save WebP version only if explicitly requested
        if write_webp:
            webp_path = out_png_path.with_suffix(".webp")
            img.save(webp_path, format="WEBP", quality=85, method=6)

    opt_size = os.path.getsize(out_png_path)
    return orig_size, opt_size


def format_bytes(num_bytes: int) -> str:
    if num_bytes < 1024:
        return f"{num_bytes} B"
    elif num_bytes < 1024 * 1024:
        return f"{num_bytes / 1024:.1f} KB"
    return f"{num_bytes / (1024 * 1024):.2f} MB"


def process_zip(zip_path: Path, output_dir: Path, explicit_set: str = None, write_webp: bool = False):
    print(f"\n📦 Inspecting archive: \033[36m{zip_path.name}\033[0m")
    set_code = detect_set_code(zip_path.name, explicit_set)
    set_name = KNOWN_SETS.get(set_code, set_code.upper())
    print(f"🏷️  Target Set: \033[32m{set_name} ({set_code.upper()})\033[0m")

    product_groups = {}

    with zipfile.ZipFile(zip_path, "r") as z:
        for info in z.infolist():
            if info.is_dir():
                continue
            if not is_image_file(info.filename):
                continue

            group_key = get_product_group_key(info.filename)
            is_01 = is_angle_01(info.filename)
            is_other = is_other_angle(info.filename)

            # Match variation / angle number
            num_match = re.search(r"(\d{1,2})", os.path.basename(info.filename))
            var_num = num_match.group(1).zfill(2) if num_match else ("01" if is_01 else None)

            score = 100 if is_01 else (20 if is_other else 50)

            if group_key not in product_groups:
                product_groups[group_key] = {
                    "primary_filename": info.filename,
                    "primary_is_01": is_01,
                    "best_score": score,
                    "variations": [],
                }

            product_groups[group_key]["variations"].append({
                "filename": info.filename,
                "var_num": var_num,
                "bytes": z.read(info.filename),
            })

            if score > product_groups[group_key]["best_score"]:
                product_groups[group_key]["primary_filename"] = info.filename
                product_groups[group_key]["primary_is_01"] = is_01
                product_groups[group_key]["best_score"] = score

        if not product_groups:
            print("⚠️  No product packaging renders found in this archive.")
            return

        print(f"✨ Found \033[32m{len(product_groups)}\033[0m distinct product(s) in kit:")

        for group_key, item in product_groups.items():
            target_filenames = determine_target_filenames(set_code, item["primary_filename"])
            if not target_filenames:
                continue

            primary_target = target_filenames[0]
            dest_path = output_dir / primary_target

            # Find bytes for primary
            primary_bytes = next(v["bytes"] for v in item["variations"] if v["filename"] == item["primary_filename"])
            orig_size, opt_size = resize_and_save(primary_bytes, dest_path, write_webp)
            ratio = ((orig_size - opt_size) / orig_size) * 100

            # Copy to aliases
            for alias in target_filenames[1:]:
                alias_path = output_dir / alias
                shutil.copy2(dest_path, alias_path)

            # Extract distinct variation angles
            distinct_vars = [v for v in item["variations"] if v["var_num"]]
            if len(distinct_vars) > 1:
                for v in distinct_vars:
                    var_target = re.sub(r"\.png$", f"_{v['var_num']}.png", primary_target, flags=re.IGNORECASE)
                    var_dest = output_dir / var_target
                    if not var_dest.exists():
                        resize_and_save(v["bytes"], var_dest, write_webp)

            angle_tag = "\033[35m[01]\033[0m " if item["primary_is_01"] else "    "
            alias_tag = f" \033[90m(+{len(target_filenames) - 1} aliases)\033[0m" if len(target_filenames) > 1 else ""
            var_tag = f" \033[36m({len(distinct_vars)} angles)\033[0m" if len(distinct_vars) > 1 else ""

            print(
                f"   ✅ {angle_tag}\033[32m{primary_target}\033[0m{alias_tag}{var_tag} "
                f"({format_bytes(orig_size)} ➔ \033[32m{format_bytes(opt_size)}\033[0m, -{ratio:.1f}%)"
            )

    print(f"\n🎉 Extracted and optimized \033[32m{len(product_groups)}\033[0m products for {set_code.upper()}!")


def process_folder(folder_path: Path, output_dir: Path, explicit_set: str = None):
    print(f"\n📁 Inspecting folder: \033[36m{folder_path}\033[0m")
    set_code = detect_set_code(folder_path.name, explicit_set)
    set_name = KNOWN_SETS.get(set_code, set_code.upper())
    print(f"🏷️  Target Set: \033[32m{set_name} ({set_code.upper()})\033[0m")

    product_groups = {}

    for root, _, files in os.walk(folder_path):
        for f in files:
            full_path = Path(root) / f
            if not is_image_file(str(full_path)):
                continue

            group_key = get_product_group_key(str(full_path))
            is_01 = is_angle_01(str(full_path))
            is_other = is_other_angle(str(full_path))

            score = 100 if is_01 else (10 if is_other else 50)

            if group_key not in product_groups or score > product_groups[group_key]["score"]:
                product_groups[group_key] = {
                    "path": full_path,
                    "score": score,
                    "is_01": is_01,
                }

    if not product_groups:
        print("⚠️  No product packaging renders found.")
        return

    print(f"✨ Found \033[32m{len(product_groups)}\033[0m distinct product(s):")

    for group_key, item in product_groups.items():
        target_filenames = determine_target_filenames(set_code, str(item["path"]))
        if not target_filenames:
            continue

        primary_target = target_filenames[0]
        dest_path = output_dir / primary_target

        with open(item["path"], "rb") as fp:
            data = fp.read()

        orig_size, opt_size = resize_and_save(data, dest_path)
        ratio = ((orig_size - opt_size) / orig_size) * 100
        angle_tag = "\033[35m[01]\033[0m " if item["is_01"] else "    "
        alias_tag = f" \033[90m(+{len(target_filenames) - 1} aliases)\033[0m" if len(target_filenames) > 1 else ""

        for alias in target_filenames[1:]:
            alias_path = output_dir / alias
            shutil.copy2(dest_path, alias_path)
            webp_src = dest_path.with_suffix(".webp")
            webp_dest = alias_path.with_suffix(".webp")
            if webp_src.exists():
                shutil.copy2(webp_src, webp_dest)

        print(
            f"   ✅ {angle_tag}\033[32m{primary_target}\033[0m{alias_tag} "
            f"({format_bytes(orig_size)} ➔ \033[32m{format_bytes(opt_size)}\033[0m, -{ratio:.1f}%)"
        )


def main():
    parser = argparse.ArgumentParser(description="WPN Marketing Assets 01 Angle Filter & Optimizer")
    parser.add_argument("source", nargs="?", help="Path to ZIP archive or extracted folder")
    parser.add_argument("--set", "-s", dest="set_code", help="Explicit MTG set code (e.g. 'hob', 'mh3')")
    parser.add_argument("--out", "-o", dest="out_dir", default=str(DEFAULT_OUTPUT_DIR), help="Output destination folder")
    parser.add_argument("--clean", "-c", dest="clean", action="store_true", help="Delete source zip archive after successful optimization")
    parser.add_argument("--webp", "-w", dest="webp", action="store_true", help="Also generate WebP copies alongside PNG")

    args = parser.parse_args()
    out_dir = Path(args.out_dir)

    if not args.source:
        incoming_dir = Path(__file__).resolve().parent.parent / "incoming_zips"
        zips = list(incoming_dir.glob("*.zip"))
        if not zips:
            print(f"ℹ️  No source specified and no .zip files in {incoming_dir}")
            print("\nUsage:\n  python scripts/process_wpn_assets.py /path/to/my_set.zip --set hob --clean")
            return
        for z in zips:
            process_zip(z, out_dir, args.set_code, write_webp=args.webp)
            if args.clean:
                z.unlink(missing_ok=True)
                print(f"   🗑️  Cleaned up: {z.name}")
        return

    src_path = Path(args.source)
    if src_path.is_file() and src_path.suffix.lower() == ".zip":
        process_zip(src_path, out_dir, args.set_code, write_webp=args.webp)
        if args.clean:
            src_path.unlink(missing_ok=True)
            print(f"   🗑️  Cleaned up: {src_path.name}")
    elif src_path.is_dir():
        process_folder(src_path, out_dir, args.set_code)
    else:
        print(f"❌ Invalid source path: {src_path}")


if __name__ == "__main__":
    main()
