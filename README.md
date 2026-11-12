# De Worf — Terrain Lab, versie 2

Interactieve 3D-webapp op basis van het De Worf-notebook van Maurice de Kleijn / RCE.
De echte heuvelcontour en een uitsnede van het AHN5-DTM zijn meegeleverd.
De website draait volledig in de browser en is geschikt voor GitHub Pages.
Er is op GitHub Pages geen ChatGPT-login, Python-server, token of API-sleutel nodig.

## Nieuw: drie afzonderlijk vergrendelde afmetingen

| Parameter | Standaard | Instelbaar bereik | Bij openen |
|---|---:|---:|---|
| `ditch_width` — grachtbreedte naar buiten | 13,0 m | 1–25 m | Vergrendeld |
| `ditch_depth` — maximale grachtdiepte | 1,7 m | 0,1–5 m | Vergrendeld |
| `slope_width` — horizontale hellingbreedte naar binnen | 8,0 m | 0,5–14 m | Vergrendeld |

Klik bij een afmeting op **Locked** (het slotje). Het veld wordt **Editable** en
kan met het getalveld of de schuifregelaar worden aangepast, in stappen van 0,1 m.
Klik opnieuw op het slotje om de gekozen waarde vast te zetten. De andere
parameters blijven onafhankelijk vergrendeld.

**Reset all parameters** herstelt beide hoeken (15° en 30°), alle drie afmetingen
(13,0 / 1,7 / 8,0 m) en zet alle drie slotjes weer dicht. Bij een gedeelde scenariolink
worden de meegestuurde waarden geladen, eveneens vergrendeld.

De maximale grachtbreedte houdt de geometrie binnen de meegeleverde AHN-uitsnede.
De maximale hellingbreedte houdt een plateau binnen de bestaande heuvelcontour.
De ingestelde grachtdiepte is een **bovengrens**: bij flauwe hellingen kan de gracht
ondieper blijven. De hoeken blijven vrij instelbaar tussen 1° en 89°.

## Publiceren op GitHub Pages — eenvoudigste route

1. Pak het ZIP-bestand uit.
2. Open de map **`dist`**. Hierin staat `index.html`.
3. Upload **de inhoud van `dist`**, inclusief `data` en `vendor`, naar de hoofdmap
   van je website-repository op GitHub. Upload dus niet alleen het ZIP-bestand
   en laat `index.html` niet in een extra bovenliggende map staan.
4. Open **Settings → Pages** in de repository.
5. Kies **Deploy from a branch**, selecteer **main** en **/ (root)** en klik op **Save**.
6. Wacht tot de publicatie voltooid is. De website-URL verschijnt onder Settings → Pages.

Vervang bij een update alle websitebestanden en de mappen `data` en `vendor`.
Deze versie heeft naast de oude bestanden ook `geometry.js`, nieuwe geometriegegevens
in `metadata.json` en JSTS in `vendor` nodig. Alleen `app.js` vervangen is onvoldoende.
Alle paden zijn relatief en werken ook onder een GitHub Pages-projectpad.

### Alternatief: de complete broncode publiceren via GitHub Actions

Upload de volledige inhoud van dit ZIP-bestand naar de repository-root, inclusief
**`.github/workflows/pages.yml`**. Kies **Settings → Pages → Source → GitHub Actions**.
Start daarna **Actions → Deploy De Worf to GitHub Pages → Run workflow**.
De workflow test de berekeningen en publiceert de map `dist`.
Toekomstige pushes naar `main` starten automatisch een nieuwe publicatie.
Er is geen installatie- of buildstap nodig. Bij een andere standaardbranch pas je
de branchnaam in de workflow aan.

## Bediening

- Linkermuisknop slepen: roteren. Scrollen: zoomen. Rechtermuisknop slepen: verschuiven.
- **3D / Top / Side**: cameraweergave; **Mesh**: triangulatie zichtbaar maken.
- **Reconstruction / AHN5 terrain**: hypothetische reconstructie of gemeten terrein.
- De resultaten, dwarsdoorsnede en grondbalans veranderen mee met de parameters.
- **Snapshot**: PNG van de huidige 3D-weergave met hoeken en afmetingen.
- **Export scenario**: JSON met alle vijf parameters, resultaten, slotstatus en brongegevens.
- **Copy scenario link**: link met alle vijf parameters en de geselecteerde terreinweergave.

De 3D-weergave vereist WebGL. Open de website via HTTP(S), niet door rechtstreeks
op `index.html` te dubbelklikken. Lokaal testen:

```sh
python -m http.server 8000 --directory dist
```

Open vervolgens http://localhost:8000.

## Berekeningen en hoogtereferenties

De gracht wordt bij een gewijzigde breedte opnieuw naar buiten gebufferd. Vervolgens
worden het 0,5 m-rastermasker en de Euclidische afstand tot de dichtstbijzijnde rand
opnieuw berekend. De vensterafronding volgt het notebook. Diepte per cel:

`min(afstand_tot_rand × tan(grachthoek), ingestelde_maximale_diepte)`

De heuvelhoogte gebruikt de volledige afstand tot de binnenrand, begrensd door de
geselecteerde hellingbreedte:

`min(afstand_naar_binnen, hellingbreedte) × tan(heuvelhoek)`

Het heuvelvolume gebruikt de oorspronkelijke Shapely-binnenbufferoppervlakken op
0,05 m-intervallen tot de gekozen hellingbreedte. Het plateau wordt opnieuw gebufferd
voor de 3D-contour en de oppervlakte. De grondbalans vergelijkt grachtuitgraving met
heuvelvolume, zonder compactie, erosie of grondaanvoer te modelleren.

| Resultaat met standaardwaarden | Waarde |
|---|---:|
| Gereconstrueerde heuvelhoogte | 4,618802 m |
| Gereconstrueerd heuvelvolume | 2121,316147 m³ |
| Grachtvolume uit raster | 1726,7159 m³ |
| Analytisch grachtvolume (doorsnede × middenlijn) | 1629,962299 m³ |
| Plateauoppervlakte | 184,3669 m² |
| Huidig positief heuvelvolume | 939,019338 m³ |

De primaire grachtvolumemetriek gebruikt het raster; de analytische schatting staat
ook in de JSON-export. Kleine verschillen in het laatste decimaal ontstaan door
floating-point optellingen.

**Reconstruction:** relatieve hoogtes boven/onder een aangenomen nulvlak, niet NAP.
De weergave combineert de relatieve heuvel- en grachtmodellen. Het heuvelraster ligt
op het AHN-raster; de uitlijning verschilt iets van de losse heuvel-TIFF uit het
notebook. Het gerapporteerde heuvelvolume volgt de vectorintegratie.

**AHN5 terrain:** bestaande maaiveldhoogtes in m NAP. Parameters veranderen deze
metingen niet. De resultaatkaarten blijven de gekozen reconstructie beschrijven.
NoData-cellen blijven gaten. Het model gebruikt geen verticale overdrijving.

## Validatie

```sh
node scripts/test-model.mjs
```

De acht oorspronkelijke hoekscenario's en elf scenario's met gewijzigde afmetingen
komen overeen met onafhankelijk in Python berekende referenties. Er zijn controles
op rastermaskers, afstandstransformatie, maximale diepte, plateauoppervlakte,
vergrendeling, reset, parameterbereiken en gedeelde URLs. JavaScript-syntax is gecontroleerd.

De previewbrowser in de bouwomgeving ondersteunt geen WebGL. De nieuwe velden en
standaardwaarden zijn in de pagina geïnspecteerd; de volledige 3D-bediening en het
ontgrendelen via de browser konden daar niet visueel worden getest. De bijbehorende
statuslogica en berekeningen zijn wel automatisch getest.

## Bronnen en opnieuw voorbereiden

Repository: https://github.com/Morrizzzzz/RCE_IVO-O_de_worf_Terschelling/analysis_notebook

Notebook: `reconstructing_mound_terschelling.ipynb`

Bronrevisie: `a967dfde258246e745964014babb8ba528b396bc`.

De oorspronkelijke contour en het notebook staan in `source-data`. De compacte
webgegevens staan in `dist/data`. Het volledige AHN-bestand is niet meegeleverd.

Met `numpy scipy rasterio shapely` geïnstalleerd kun je de extra geometriegegevens
opnieuw voorbereiden vanuit de meegeleverde contour:

```sh
python scripts/prepare_dynamic.py
```

Voor volledige herbouw plaats je het GeoPackage in `UPSTREAM/data/de_worf.gpkg` en
het AHN-bestand in `UPSTREAM/data/AHN5_M_151000_600000.TIF`. Bron AHN:

https://fsn1.your-objectstorage.com/hwh-ahn/AHN5_KM/02a_DTM_50cm/AHN5_M_151000_600000.TIF

```sh
python scripts/prepare_data.py --source-dir UPSTREAM
node scripts/test-model.mjs
```

Three.js 0.170.0, OrbitControls, JSTS 2.12.1 en DM Sans zijn lokaal meegeleverd;
de website heeft tijdens gebruik geen CDN nodig.

## Licentie

Notebook, contour en deze aanpassing: GPL-3.0, zie `LICENSE`. Three.js/OrbitControls:
MIT. JSTS: Eclipse Distribution License / Eclipse Public License. DM Sans: SIL Open
Font License. De betreffende teksten staan in `dist/vendor`. Gemeten terrein: AHN5.
Dit is een onafhankelijke onderzoeksinterface, geen officiële RCE-website.
