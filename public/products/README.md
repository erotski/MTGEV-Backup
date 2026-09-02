# Local WPN & Sealed Product Packaging Assets

Drop your official Wizards Play Network (WPN) 3D product renders or scanned packaging images into this directory (`/public/products/`).

The web application automatically detects and displays physical packaging photos using the following standard naming conventions:

### Recommended File Naming Convention:
Format: `{setcode}-{packagingtype}.png` (all lowercase)

Examples:
- `mh3-box.png` (Modern Horizons 3 Booster Box)
- `mh3-bundle.png` (Modern Horizons 3 Bundle)
- `mh3-prerelease.png` (Modern Horizons 3 Prerelease Pack)
- `mh3-pack.png` (Modern Horizons 3 Booster Pack)
- `mh3-case.png` (Modern Horizons 3 Sealed Case)
- `otj-box.png` (Outlaws of Thunder Junction Booster Box)
- `otj-bundle.png` (Outlaws of Thunder Junction Bundle)
- `blb-box.png` (Bloomburrow Booster Box)
- `lci-box.png` (Lost Caverns of Ixalan Booster Box)

Supported Formats: `.png`, `.jpg`, `.jpeg`, `.webp`, `.svg`

### Where to Download Official WPN 3D Renders:
1. Go to [wpn.wizards.com/en/marketing-materials](https://wpn.wizards.com/en/marketing-materials)
2. Open your desired set kit (e.g. Modern Horizons 3, Duskmourn, Bloomburrow).
3. Download the **"Digital Marketing Assets (DMA)"** or **"Product Shots"** zip file.
4. Extract the transparent 3D box/pack PNGs into this `/public/products/` folder and name them according to the convention above.

If no local image is found, the app automatically falls back to the stylized 3D card with official Scryfall vector set emblems.
