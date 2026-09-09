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


def classify_product_type(path_str: str) -> tuple[str, int, bool] | None:
    """
    Classifies a packaging file into standard product types.
    Returns: (product_type, confidence_score, is_angle_01)
    """
    p = path_str.lower()
    ext = os.path.splitext(p)[1]

    if ext not in [".png", ".webp", ".jpg", ".jpeg"]:
        return None

    # Ignore marketing banners, logos, social media, flat dielines, etc.
    ignore_keywords = [
        "social", "facebook", "instagram", "banner", "header", "logo",
        "symbol", "poster", "flyer", "dieline", "diemap", "flat", "wallpaper"
    ]
    if any(k in p for k in ignore_keywords):
        return None

    angle_01 = is_angle_01(p)
    other_angle = is_other_angle(p)

    bonus = 60 if angle_01 else (-80 if other_angle else 0)
    png_bonus = 20 if ext == ".png" else 0
    total_bonus = bonus + png_bonus

    # 1. Collector Display Box
    if ("collector" in p and ("box" in p or "display" in p)) or "collector_box" in p or "collector_display" in p:
        return ("collector", 100 + total_bonus, angle_01)

    # 2. Bundle Box / Gift Edition
    if "bundle" in p or "gift_edition" in p or "fatpack" in p:
        return ("bundle", 90 + total_bonus, angle_01)

    # 3. Prerelease Pack
    if "prerelease" in p or "pre-release" in p or "pr_pack" in p or "prpack" in p:
        return ("prerelease", 85 + total_bonus, angle_01)

    # 4. Booster Display Box (Play / Standard / Draft / Set)
    if ("play" in p and "box" in p) or ("booster" in p and "box" in p) or ("display" in p) or "box_3d" in p:
        return ("box", 95 + total_bonus, angle_01)

    # 5. Single Booster Pack
    if ("pack" in p and ("booster" in p or "play" in p)) or "pack_front" in p or "pack_3d" in p or "foil_pack" in p:
        return ("pack", 80 + total_bonus, angle_01)

    # 6. Commander / Precon Deck
    if "commander" in p or "deck" in p or "precon" in p:
        return ("deck", 75 + total_bonus, angle_01)

    # 7. Master Case
    if "case" in p or "master_case" in p:
        return ("case", 70 + total_bonus, angle_01)

    # Generic fallbacks
    if "box" in p:
        return ("box", 60 + total_bonus, angle_01)
    if "pack" in p:
        return ("pack", 55 + total_bonus, angle_01)

    return None


def resize_and_save(img_bytes: bytes, out_png_path: Path) -> tuple[int, int]:
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

        # Also save WebP version for maximum speed
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


def process_zip(zip_path: Path, output_dir: Path, explicit_set: str = None):
    print(f"\n📦 Inspecting archive: \033[36m{zip_path.name}\033[0m")
    set_code = detect_set_code(zip_path.name, explicit_set)
    set_name = KNOWN_SETS.get(set_code, set_code.upper())
    print(f"🏷️  Target Set: \033[32m{set_name} ({set_code.upper()})\033[0m")

    best_by_type = {}

    with zipfile.ZipFile(zip_path, "r") as z:
        for info in z.infolist():
            if info.is_dir():
                continue

            res = classify_product_type(info.filename)
            if not res:
                continue

            prod_type, confidence, is_01 = res
            current = best_by_type.get(prod_type)

            if not current or confidence > current["confidence"]:
                best_by_type[prod_type] = {
                    "filename": info.filename,
                    "confidence": confidence,
                    "is_01": is_01,
                    "bytes": z.read(info.filename),
                }

        if not best_by_type:
            print("⚠️  No product packaging renders found in this archive.")
            return

        print(f"✨ Found {len(best_by_type)} packaging renders (selected Angle 01):")

        for prod_type, item in best_by_type.items():
            target_filename = f"{set_code}-{prod_type}.png"
            dest_path = output_dir / target_filename

            orig_size, opt_size = resize_and_save(item["bytes"], dest_path)
            ratio = ((orig_size - opt_size) / orig_size) * 100
            angle_tag = "\033[35m[Angle 01]\033[0m " if item["is_01"] else ""

            print(
                f"   ✅ {angle_tag}Saved \033[32m{target_filename}\033[0m "
                f"({format_bytes(orig_size)} ➔ \033[32m{format_bytes(opt_size)}\033[0m, -{ratio:.1f}%)"
            )


def process_folder(folder_path: Path, output_dir: Path, explicit_set: str = None):
    print(f"\n📁 Inspecting folder: \033[36m{folder_path}\033[0m")
    set_code = detect_set_code(folder_path.name, explicit_set)
    set_name = KNOWN_SETS.get(set_code, set_code.upper())
    print(f"🏷️  Target Set: \033[32m{set_name} ({set_code.upper()})\033[0m")

    best_by_type = {}

    for root, _, files in os.walk(folder_path):
        for f in files:
            full_path = Path(root) / f
            res = classify_product_type(str(full_path))
            if not res:
                continue

            prod_type, confidence, is_01 = res
            current = best_by_type.get(prod_type)

            if not current or confidence > current["confidence"]:
                best_by_type[prod_type] = {
                    "path": full_path,
                    "confidence": confidence,
                    "is_01": is_01,
                }

    if not best_by_type:
        print("⚠️  No product packaging renders found.")
        return

    print(f"✨ Found {len(best_by_type)} packaging renders:")

    for prod_type, item in best_by_type.items():
        target_filename = f"{set_code}-{prod_type}.png"
        dest_path = output_dir / target_filename

        with open(item["path"], "rb") as fp:
            data = fp.read()

        orig_size, opt_size = resize_and_save(data, dest_path)
        ratio = ((orig_size - opt_size) / orig_size) * 100
        angle_tag = "\033[35m[Angle 01]\033[0m " if item["is_01"] else ""

        print(
            f"   ✅ {angle_tag}Saved \033[32m{target_filename}\033[0m "
            f"({format_bytes(orig_size)} ➔ \033[32m{format_bytes(opt_size)}\033[0m, -{ratio:.1f}%)"
        )


def main():
    parser = argparse.ArgumentParser(description="WPN Marketing Assets 01 Angle Filter & Optimizer")
    parser.add_argument("source", nargs="?", help="Path to ZIP archive or extracted folder")
    parser.add_argument("--set", "-s", dest="set_code", help="Explicit MTG set code (e.g. 'hob', 'mh3')")
    parser.add_argument("--out", "-o", dest="out_dir", default=str(DEFAULT_OUTPUT_DIR), help="Output destination folder")
    parser.add_argument("--clean", "-c", dest="clean", action="store_true", help="Delete source zip archive after successful optimization")

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
            process_zip(z, out_dir, args.set_code)
            if args.clean:
                z.unlink(missing_ok=True)
                print(f"   🗑️  Cleaned up: {z.name}")
        return

    src_path = Path(args.source)
    if src_path.is_file() and src_path.suffix.lower() == ".zip":
        process_zip(src_path, out_dir, args.set_code)
        if args.clean:
            src_path.unlink(missing_ok=True)
            print(f"   🗑️  Cleaned up: {src_path.name}")
    elif src_path.is_dir():
        process_folder(src_path, out_dir, args.set_code)
    else:
        print(f"❌ Invalid source path: {src_path}")


if __name__ == "__main__":
    main()
