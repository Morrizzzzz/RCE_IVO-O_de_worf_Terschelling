import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {calculateModel,reconstructionHeights,validateDimension,createScenario,setDimension,resetScenario,DIMENSIONS} from '../dist/model.js';
import {GeometryEngine,distanceTransform} from '../dist/geometry.js';
const meta=JSON.parse(readFileSync(new URL('../dist/data/metadata.json',import.meta.url)));
const b=readFileSync(new URL('../dist/data/mound-distance.bin',import.meta.url));
const mound=new Float32Array(b.buffer,b.byteOffset,b.byteLength/4),engine=new GeometryEngine(meta,mound);
const fixtures=JSON.parse(readFileSync(new URL('./dynamic-reference-values.json',import.meta.url)));
for(const f of fixtures){
  const geometry=engine.update(f.ditchWidth,f.slopeWidth);
  const actual=calculateModel(meta,geometry.ditch,f.ditchAngle,f.moundAngle,f,geometry);
  for(const key of ['ditchVolume','analyticalDitchVolume','moundVolume','height','actualDepth','flatWidth','plateauArea'])
    assert.ok(Math.abs(actual[key]-f[key])<.001,`${key}: ${actual[key]} differs from Python ${f[key]} for ${JSON.stringify(f)}`);
  assert.equal(geometry.ditchCells,f.ditchCells,'Browser raster mask must match Rasterio cell for cell in count');
  const heights=reconstructionHeights(mound,geometry.ditch,actual);
  assert.ok(heights.every(Number.isFinite));
  assert.ok(Math.abs(Math.max(...heights)-actual.height)<.0001);
  assert.ok(Math.min(...heights)>=-f.ditchDepth-.00001);
  assert.equal(geometry.plateau.length>0,true);
}
// Verify EDT against direct nearest-background distances on an asymmetric mask.
const mask=new Uint8Array([0,1,1,1,1,1,1,1,1,1,1,1,0,1,1,1,1,1,1,1]);
const edt=distanceTransform(mask,4,5,.5);
for(let i=0;i<mask.length;i++){
  const expected=Math.min(...Array.from(mask,(m,j)=>m?Infinity:Math.hypot(Math.floor(i/5)-Math.floor(j/5),i%5-j%5)*.5));
  assert.ok(Math.abs(edt[i]-expected)<1e-6);
}
// Locks gate every dimensional edit, independently; re-locking preserves edits.
const state=createScenario();
for(const [key,spec] of Object.entries(DIMENSIONS)){
  assert.equal(state[key],spec.default);assert.equal(state.locked[key],true);
  assert.throws(()=>setDimension(state,key,spec.min));
  state.locked[key]=false;setDimension(state,key,spec.min);assert.equal(state[key],spec.min);
  state.locked[key]=true;assert.equal(state[key],spec.min);assert.throws(()=>setDimension(state,key,spec.default));
  for(const invalid of [NaN,Infinity,-1,'',spec.min-.01,spec.max+.01])assert.throws(()=>validateDimension(key,invalid));
}
state.ditch=45;state.mound=45;resetScenario(state);
assert.equal(state.ditch,15);assert.equal(state.mound,30);
for(const [key,spec] of Object.entries(DIMENSIONS)){assert.equal(state[key],spec.default);assert.equal(state.locked[key],true);}
const shared=createScenario(new URLSearchParams('ditch=20&slope=35&ditch_width=18&ditch_depth=2.4&slope_width=10&view=ahn'));
assert.deepEqual([shared.ditch,shared.mound,shared.ditchWidth,shared.ditchDepth,shared.slopeWidth,shared.view],[20,35,18,2.4,10,'ahn']);
assert.ok(Object.values(shared.locked).every(Boolean));
const invalid=createScenario(new URLSearchParams('ditch_width=999&ditch_depth=-1&slope_width=abc'));
assert.deepEqual([invalid.ditchWidth,invalid.ditchDepth,invalid.slopeWidth],[13,1.7,8]);
console.log(`PASS: ${fixtures.length} dimension scenarios match Python; dynamic masks, EDT, depth caps, plateau geometry, locks, reset and shared URLs verified.`);
