"""Prepare browser data from the De Worf notebook's real GeoPackage and AHN5.

Usage: python scripts/prepare_data.py --source-dir /path/to/upstream
Requires numpy, scipy, rasterio and shapely. The browser needs no Python server.
"""
import argparse
import json
import math
import sqlite3
from pathlib import Path

import numpy as np
import rasterio
from rasterio.features import rasterize
from rasterio.mask import mask
from rasterio.windows import from_bounds, transform as window_transform
from scipy.ndimage import distance_transform_edt
from shapely import wkb
from shapely.geometry import mapping
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--source-dir', type=Path, required=True)
parser.add_argument('--source-commit', default='a967dfde258246e745964014babb8ba528b396bc')
parser.add_argument('--source-date', default='2026-10-21T09:30:13Z')
args = parser.parse_args()
out = ROOT / 'dist/data'
out.mkdir(parents=True, exist_ok=True)
db = sqlite3.connect(args.source_dir / 'data/de_worf.gpkg')
column = db.execute("SELECT column_name FROM gpkg_geometry_columns WHERE table_name='contour_mound'").fetchone()[0]
geometries = []
for (blob,) in db.execute(f'SELECT "{column}" FROM contour_mound'):
    envelope = (blob[3] >> 1) & 7
    skip = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}[envelope]
    geometries.append(wkb.loads(blob[8 + skip:]))
poly = unary_union(geometries)
outer = poly.buffer(13)
ditch = outer.difference(poly)
distances = np.arange(0, 8.0 + 0.05, 0.05)
areas = np.array([poly.buffer(-d).area if d else poly.area for d in distances])
integral = float(np.trapezoid(areas, distances))
centreline = poly.buffer(6.5).length

with rasterio.open(args.source_dir / 'data/AHN5_M_151000_600000.TIF') as src:
    # Preserve the exact notebook ditch window, rasterisation and EDT.
    win = from_bounds(*outer.bounds, transform=src.transform).round_offsets().round_lengths()
    dt = window_transform(win, src.transform)
    shape = (int(win.height), int(win.width))
    ditch_mask = rasterize([(ditch, 1)], out_shape=shape, transform=dt, dtype='uint8')
    ditch_distance = distance_transform_edt(ditch_mask, sampling=(0.5, 0.5))

    # A wider AHN-aligned display grid provides spatial context.
    cx = round(poly.centroid.x * 2) / 2
    cy = round(poly.centroid.y * 2) / 2
    view_win = from_bounds(cx-43, cy-43, cx+43, cy+43, src.transform).round_offsets().round_lengths()
    trans = window_transform(view_win, src.transform)
    terrain = src.read(1, window=view_win, masked=True).filled(np.nan).astype('float32')
    display_shape = terrain.shape
    mound_mask = rasterize([(poly, 1)], out_shape=display_shape, transform=trans, dtype='uint8')
    mound_distance = np.minimum(distance_transform_edt(mound_mask, sampling=(0.5, 0.5)), 8)
    display_ditch = np.zeros(display_shape, dtype='float32')
    ro = int(win.row_off - view_win.row_off)
    co = int(win.col_off - view_win.col_off)
    display_ditch[ro:ro+shape[0], co:co+shape[1]] = ditch_distance

    # Reproduce the notebook's observed-mound volume and fitted reference plane.
    ring = poly.buffer(5).difference(poly.buffer(1))
    crop, ct = mask(src, [mapping(poly.buffer(5))], crop=True, filled=False)
    arr = crop[0].filled(np.nan).astype('float64')
    rr, cc = np.indices(arr.shape)
    xs = ct.c + (cc + 0.5) * ct.a
    ys = ct.f + (rr + 0.5) * ct.e
    rm = rasterize([(ring,1)],out_shape=arr.shape,transform=ct).astype(bool) & np.isfinite(arr)
    mm = rasterize([(poly,1)],out_shape=arr.shape,transform=ct).astype(bool) & np.isfinite(arr)
    low, high = np.percentile(arr[rm], [2,98])
    rm &= (arr >= low) & (arr <= high)
    xo, yo = xs[rm].mean(), ys[rm].mean()
    design = np.column_stack([xs[rm]-xo,ys[rm]-yo,np.ones(rm.sum())])
    abc = np.linalg.lstsq(design,arr[rm],rcond=None)[0]
    plane = abc[0]*(xs-xo)+abc[1]*(ys-yo)+abc[2]
    observed_volume = float(np.maximum(arr[mm]-plane[mm],0).sum()*0.25)
    observed_height = float(np.max(arr[mm]-plane[mm]))
    rmse = float(np.sqrt(np.mean((design@abc-arr[rm])**2)))

def ring_coords(g):
    return [[round(x-cx,6), round(y-cy,6)] for x,y in g.exterior.coords]

for filename, array in [('terrain',terrain),('mound-distance',mound_distance),('ditch-distance',display_ditch)]:
    np.asarray(array,dtype='<f4').tofile(out / f'{filename}.bin')

source = {'sha': args.source_commit, 'date': args.source_date}
metadata = {
    'name':'De Worf · Lies, Terschelling',
    'sourceRepository':'https://github.com/Morrizzzzz/RCE_IVO-O_de_worf_Terschelling',
    'sourceNotebook':'reconstructing_mound_terschelling.ipynb',
    'sourceCommit':source['sha'], 'sourceDate':source['date'],
    'ahnUrl':'https://fsn1.your-objectstorage.com/hwh-ahn/AHN5_KM/02a_DTM_50cm/AHN5_M_151000_600000.TIF',
    'horizontalCrs':'EPSG:28992', 'terrainVerticalDatum':'NAP',
    'grid':{'rows':display_shape[0], 'cols':display_shape[1], 'cellSize':0.5,
            'west':trans.c,'north':trans.f,'originX':cx,'originY':cy},
    'constants':{'ditchWidth':13,'ditchDepthCap':1.7,'slopeWidth':8,'integrationStep':0.05,
                 'moundArea':poly.area,'moundPerimeter':poly.length,'plateauArea':poly.buffer(-8).area,
                 'moundAreaIntegral':integral,'ditchCentrelineLength':centreline},
    'observed':{'volume':observed_volume,'maxHeight':observed_height,'ringRmse':rmse,
                'plane':abc.tolist(),'planeOrigin':[float(xo),float(yo)],
                'validCells':int(np.isfinite(terrain).sum()),'totalCells':int(terrain.size)},
    'contours':{'mound':ring_coords(poly),'outer':ring_coords(outer),'plateau':ring_coords(poly.buffer(-8))},
    'notes':[
        'Ditch volume uses the original notebook 0.5 m raster mask and Euclidean distance transform.',
        'Mound volume uses the original 0.05 m inward-buffer integration.',
        'The display mound uses a 0.5 m AHN-aligned raster EDT. Its alignment differs slightly from the notebook mound export.',
        'Reconstruction is relative to an assumed zero surface. AHN5 is measured terrain in m NAP. These are separate views.',
        'No soil compaction, erosion, imported soil, water surface or structural reconstruction is assumed.'
    ]
}
(out/'metadata.json').write_text(json.dumps(metadata,indent=2))
fixtures=[]
for da, ma in [(1,1),(5,15),(10,20),(15,30),(30,30),(45,45),(60,60),(89,89)]:
    tan_d = math.tan(math.radians(da))
    depths = np.minimum(ditch_distance*tan_d,1.7).astype('float32')
    actual = min(6.5*tan_d,1.7)
    flat = max(0,13-2*1.7/tan_d)
    section = (13-1.7/tan_d)*1.7 if flat>0 else 0.5*13*actual
    fixtures.append({'ditchAngle':da,'moundAngle':ma,'ditchVolume':float(np.sum(depths)*0.25),
                     'analyticalDitchVolume':float(centreline*section),
                     'moundVolume':integral*math.tan(math.radians(ma)),
                     'height':8*math.tan(math.radians(ma)), 'actualDepth':actual,'flatWidth':flat})
(ROOT/'scripts/reference-values.json').write_text(json.dumps(fixtures,indent=2))
print(json.dumps({'grid':metadata['grid'],'constants':metadata['constants'],'observed':metadata['observed'],'default':fixtures[3]},indent=2))

# Version 2: retain the full inward distance field and the variable-width tables.
import subprocess, sys
subprocess.run([sys.executable,str(ROOT/'scripts/prepare_dynamic.py'),'--gpkg',str(args.source_dir/'data/de_worf.gpkg')],check=True)
