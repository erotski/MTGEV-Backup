"""
build_precon_decks.py
Authoritative MTGJSON Preconstructed Deck Ingestion & Vendor Pricing Engine.

Strict Architectural Rule:
- NEVER FETCH OR REFERENCE PRICING FROM SCRYFALL.
- Card pricing is sourced strictly from MTGJSON vendor feeds (TCGplayer Market/Direct,
  Card Kingdom, Cardmarket EUR/USD).
- Scryfall is used EXCLUSIVELY for high-resolution artwork URLs (cards.scryfall.io)
  and external webpage links for browsing set cards.
"""
import os
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR / "scripts"))

import ingest_mtgjson_precons

def main():
    print("=" * 60)
    print("Building Preconstructed Decks Data (Authoritative MTGJSON Vendor Feeds)...")
    print("=" * 60)
    ingest_mtgjson_precons.main()

if __name__ == "__main__":
    main()
