# Incoming WPN Zip Archives

Place any `.zip` marketing kits downloaded from [wpn.wizards.com/en/marketing-materials](https://wpn.wizards.com/en/marketing-materials) into this directory.

### Quick Ingestion:
1. Save the downloaded `.zip` file here (e.g. `MH3_Digital_Marketing_Assets.zip`, `BLB_Product_Shots.zip`, etc.).
2. Run in your terminal:
   ```bash
   npm run ingest-wpn
   ```
   Or specify a set code explicitly if needed:
   ```bash
   npm run ingest-wpn -- mh3
   ```
3. The script will automatically scan the zip, extract the transparent 3D box, bundle, prerelease, and pack renders, rename them to `{setcode}-{type}.png`, and move them to `/public/products/`.
