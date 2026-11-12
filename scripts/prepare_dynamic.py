"""Extend the static crop with geometry tables and independent variable-parameter fixtures."""
import argparse
import json
import math
import sqlite3
from pathlib import Path
import numpy as np
from scipy.ndimage import distance_transform_edt
from shapely import wkb
from rasterio.features import rasterize
from rasterio.transform import from_origin
from rasterio.windows import from_bounds, transform as window_transform

root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--gpkg',type=Path,default=root/'source-data/de_worf.gpkg')
args=parser.parse_args()
meta_path=root/'dist/data/metadata.json'
m=json.loads(meta_path.read_text());g=m['grid']
db=sqlite3.connect(args.gpkg)
col=db.execute("SELECT column_name FROM gpkg_geometry_columns WHERE table_name='contour_mound'").fetchone()[0]
blob=db.execute(f'SELECT "{col}" FROM contour_mound').fetchone()[0]
skip={0:0,1:32,2:48,3:48,4:64}[(blob[3]>>1)&7]
p=wkb.loads(blob[8+skip:])
transform=from_origin(g['west'],g['north'],g['cellSize'],g['cellSize'])
shape=(g['rows'],g['cols'])
mask=rasterize([(p,1)],out_shape=shape,transform=transform,dtype='uint8')
distance_transform_edt(mask,sampling=(.5,.5)).astype('<f4').tofile(root/'dist/data/mound-distance.bin')
m['contours']['mound']=[[x-g['originX'],y-g['originY']] for x,y in p.exterior.coords]
m['inwardAreaTable']={'step':.05,'areas':[p.buffer(-i*.05).area if i else p.area for i in range(281)]}
m['parameterRanges']={'ditchWidth':[1,25],'ditchDepth':[.1,5],'slopeWidth':[.5,14]}
m['notes'][0]='Ditch mask and Euclidean distance transform are recalculated in the browser at 0.5 m when ditch width changes, using the notebook window convention.'
m['notes'][1]='Mound volume integrates the original Shapely inward-buffer areas at 0.05 m intervals up to the selected slope width.'
meta_path.write_text(json.dumps(m,indent=2))
fixtures=[]
scenarios=[(15,30,13,1.7,8),(15,30,20,1.7,8),(15,30,6,1.7,8),(30,30,13,3,8),
           (10,20,8,.5,4),(45,40,25,5,14),(5,15,1,.1,.5),(60,60,17.5,2.3,10.5),
           (15,30,13,1.7,12),(15,30,13,1.7,2),(89,89,25,5,14)]
for da,ma,w,depth,sw in scenarios:
    outer=p.buffer(w);ditch=outer.difference(p)
    win=from_bounds(*outer.bounds,transform=transform).round_offsets().round_lengths()
    dt=window_transform(win,transform)
    dm=rasterize([(ditch,1)],out_shape=(int(win.height),int(win.width)),transform=dt,dtype='uint8')
    dd=distance_transform_edt(dm,sampling=(.5,.5))
    ds=math.tan(math.radians(da));ms=math.tan(math.radians(ma))
    actual=min(w/2*ds,depth);flat=max(0,w-2*depth/ds)
    section=(w-depth/ds)*depth if flat>0 else .5*w*actual
    distances=np.arange(0,sw+.00001,.05)
    areas=[p.buffer(-d).area if d else p.area for d in distances]
    fixtures.append({'ditchAngle':da,'moundAngle':ma,'ditchWidth':w,'ditchDepth':depth,'slopeWidth':sw,
      'ditchVolume':float(np.minimum(dd*ds,depth).astype('float32').sum()*.25),
      'analyticalDitchVolume':p.buffer(w/2).length*section,'moundVolume':float(np.trapezoid(areas,distances)*ms),
      'height':sw*ms,'actualDepth':actual,'flatWidth':flat,'plateauArea':p.buffer(-sw).area,
      'ditchCells':int(dm.sum()),'window':[int(win.row_off),int(win.col_off),int(win.height),int(win.width)]})
(root/'scripts/dynamic-reference-values.json').write_text(json.dumps(fixtures,indent=2))
print(f'Prepared full mound distances, 281 inward areas and {len(fixtures)} independent scenarios.')
