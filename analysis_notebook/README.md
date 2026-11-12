# RCE_IVO-O_de_worf_Terschelling
This reposity contains a set of analyses scripts to reconstruct an archaeological mound on the island of Terschelling in the Netherlands. It are analyses scripts developed by the Rijksdienst voor het Cultureel Erfgoed.

The notebook is self explanatory.

<img src=".//img/Afbeelding_analyse_06082026.png" alt="" style="display: inline-block; height: 1000; width: 1250; vertical-align: text-bottom; margin: 0 0.25rem;" />




# De Worf — Terrain Lab

A static, interactive 3D adaptation of Maurice de Kleijn / RCE's
`reconstructing_mound_terschelling.ipynb`. It uses the actual De Worf polygon
and a crop of the AHN5 0.5 m DTM. No Python server, API key, account or build
step is required to run the web app.

## Open the app

The published app is at https://de-worf-terrain-lab.packedspoon2.chatgpt.site
(owner-private by default). For your own public GitHub Pages copy, follow
the steps below.

## Interactive controls

- Ditch angle (`ditch_angle_degrees`): default **15°**.
- Mound angle (`slope_angle_degrees`): default **30°**.
- Both accept **1–89°**, with sliders and numeric entry. Angles are from horizontal.
- Drag the 3D terrain to orbit; scroll to zoom; right-drag to pan.
- Use **3D / Top / Side**, zoom buttons, or **Mesh** to inspect the geometry.
- Switch between the hypothetical **Reconstruction** and measured **AHN5 terrain**.
- Inspect the central east–west section and the live volume comparison.
- **Snapshot** downloads the view as a PNG with scenario labels.
- **Export scenario** downloads parameters, results, assumptions and provenance as JSON.
- **Copy scenario link** stores angles and the selected view in the URL.
- The reset icon restores 15° / 30°.

WebGL is required for the 3D scene. Use a modern Firefox, Chrome, Edge or
Safari browser with graphics acceleration available. Opening `index.html`
directly with `file://` will not work because the page fetches local data.

## Publish on GitHub Pages

### Recommended: included GitHub Actions workflow

1. Extract the ZIP. Create a GitHub repository (or use a dedicated app branch/repository).
2. Upload the **contents** of the extracted folder to the repository root.
   The root should contain `dist/`, `scripts/`, `package.json`, `README.md`,
   and **`.github/workflows/pages.yml`**. Check that the hidden `.github`
   folder is included. Do not upload only the ZIP file.
3. In the repository, open **Settings → Pages**.
4. Under **Build and deployment → Source**, select **GitHub Actions**.
5. Open **Actions → Deploy De Worf to GitHub Pages → Run workflow**.
   Future pushes to `main` will also deploy automatically.
6. Wait for the workflow to finish. The deployment step and Settings → Pages
   show your website's actual URL.

This workflow tests the model, then publishes `dist/`. There is no npm install
or build step. If your default branch is not `main`, update the workflow's
branch filter or use **Run workflow**.

### Simpler alternative: deploy from a branch

Upload only the **contents of `dist/`** to the root of a dedicated repository,
so that `index.html` is directly at the root. Choose **Settings → Pages →
Deploy from a branch → main → / (root) → Save**. Do not choose this mode if
`index.html` is still inside `dist/`. Keep `vendor/` and `data/` beside it.

All URLs are relative, so the app also works under a GitHub project subpath.
No GitHub token is used by the website itself.

## Run locally

From the extracted project directory:

```sh
python -m http.server 8000 --directory dist
```

Then open http://localhost:8000 in your browser.

## Scientific model and height references

Fixed values reproduce the notebook:

| Parameter | Value |
|---|---:|
| Ditch width, outward from the contour | 13 m |
| Hard ditch depth limit | 1.7 m |
| Mound's inward slope width | 8 m |
| Mound contour area | 803.6986 m² |
| Plateau area | 184.3669 m² |
| Ditch raster cell size | 0.5 × 0.5 m |
| Mound integration step | 0.05 m |

Ditch depth is `min(distance_to_edge * tan(ditch_angle), 1.7)`. Its distance
grid preserves the notebook's exact window, rasterisation and SciPy Euclidean
distance transform. A gentle angle produces a V-shaped profile; a steeper
angle reaches the depth cap and develops a flat bottom.

Mound height is `min(inward_distance, 8) * tan(mound_angle)`. Mound **volume**
uses the original Shapely inward-buffer area integral, not a visual-mesh sum.
The precomputed integral is 3674.227344830564 m³; multiply by the slope tangent.

The notebook includes older narrative examples that differ from its later,
depth-capped code. This application follows the executable model and the
stored numerical outputs, including the hard 1.7 m cap.

At **15° / 30°** the expected results are:

| Quantity | Value |
|---|---:|
| Reconstructed maximum mound height | 4.618802 m |
| Reconstructed mound volume | 2121.316147 m³ |
| Raster-derived excavated ditch volume | 1726.7159 m³ |
| Analytical ditch cross-section × centreline estimate | 1629.962299 m³ |
| Additional soil required (raster ditch comparison) | 394.60 m³ |
| Flat ditch bottom width | 0.311027 m |
| Present-day positive mound volume | 939.019338 m³ |
| Present-day maximum height above fitted plane | 2.531369 m |

The analytical ditch estimate is included in the JSON export; the primary
live metric uses the raster estimate, as labelled.

**Reconstruction view:** mound and ditch on a common assumed zero surface,
in relative metres. It is a hypothetical shape, not an absolute NAP model.
The display mound uses an AHN-aligned 0.5 m distance raster, whose alignment
differs slightly from the notebook's separately exported mound TIFF.
Reported mound volume still follows the original vector calculation.

**AHN5 view:** measured terrain in metres NAP. No synthetic ditch or mound
is added in this view, and angle changes do not change the measurements.
NoData cells remain gaps. The live result cards always describe the scenario.

Unlike the notebook's `existing_dem_with_ditch.tif`, the relative combined
view does not subtract a synthetic ditch from today's AHN terrain. It makes
the assumed reconstruction explicit and avoids mixing NAP and relative heights.
Vertical scale is 1:1 in both views. All reported volumes use the native data,
independently of camera orientation and zoom.

The soil balance assumes equal volumes excavated and deposited. Compaction,
bulking, erosion, imported soil and structures are not modelled. The app does
not claim that any selected angle reconstructs the actual historical shape.

## Validation

```sh
node scripts/test-model.mjs
```

Eight independent Python reference scenarios test shallow and steep angles,
the 1.7 m depth cap, V-shaped/flat-bottom transitions, mound integration,
invalid inputs and finite reconstructed surface values. Default results match
the notebook outputs. JavaScript syntax checks passed.

The build environment's preview browser could not create a WebGL context.
Page layout and the graphics-error state were inspected; full 3D rendering
and interaction were not visually verified in that environment.

## Source data and reproducibility

Upstream repository:
https://github.com/Morrizzzzz/RCE_IVO-O_de_worf_Terschelling

Pinned revision: `a967dfde258246e745964014babb8ba528b396bc`.

`source-data/` contains the original GeoPackage and notebook. Large source AHN
tiles are not bundled. The included `dist/data/` files contain only the required
terrain crop and precomputed distance fields, plus provenance in `metadata.json`.

To regenerate the browser data, install `numpy scipy rasterio shapely`, obtain
the source GeoPackage at `UPSTREAM/data/de_worf.gpkg`, and download the AHN tile
to `UPSTREAM/data/AHN5_M_151000_600000.TIF` from:

https://fsn1.your-objectstorage.com/hwh-ahn/AHN5_KM/02a_DTM_50cm/AHN5_M_151000_600000.TIF

Then run:

```sh
python scripts/prepare_data.py --source-dir UPSTREAM
node scripts/test-model.mjs
```

The script uses the notebook's original polygon, raster grid, buffer parameters,
distance transform and fitted reference plane. Browser runtime dependencies
(Three.js 0.170.0, OrbitControls and DM Sans) are bundled locally. No CDN is
needed while using the app.

## Licence and attribution

Adapted from the RCE De Worf notebook and contour data, distributed under the
upstream GPL-3.0 licence; see `LICENSE`. This adaptation also uses GPL-3.0.
Three.js and OrbitControls are MIT-licensed; DM Sans uses the SIL Open Font
License. Their notices are in `dist/vendor/`. AHN5 is credited as the source
of the measured terrain. This is an independent research interface, not an
official RCE website.
