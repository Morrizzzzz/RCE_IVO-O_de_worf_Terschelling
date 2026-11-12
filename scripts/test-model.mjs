import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {calculateModel,reconstructionHeights,validateAngle} from '../dist/model.js';
const meta=JSON.parse(readFileSync(new URL('../dist/data/metadata.json',import.meta.url)));
const binary=name=>{const b=readFileSync(new URL(`../dist/data/${name}.bin`,import.meta.url));return new Float32Array(b.buffer,b.byteOffset,b.byteLength/4);};
const ditch=binary('ditch-distance'),mound=binary('mound-distance');
const fixtures=JSON.parse(readFileSync(new URL('./reference-values.json',import.meta.url)));
for(const expected of fixtures){
  const actual=calculateModel(meta,ditch,expected.ditchAngle,expected.moundAngle);
  for(const key of ['ditchVolume','analyticalDitchVolume','moundVolume','height','actualDepth','flatWidth']){
    assert.ok(Math.abs(actual[key]-expected[key])<.001,`${key} differs at ${expected.ditchAngle}° / ${expected.moundAngle}°: ${actual[key]} vs ${expected[key]}`);
  }
  const surface=reconstructionHeights(mound,ditch,actual);
  assert.equal(surface.length,meta.grid.rows*meta.grid.cols);
  assert.ok(surface.every(Number.isFinite));
  assert.ok(Math.min(...surface)>=-1.700001,'Ditch exceeds 1.7 m cap');
  assert.ok(Math.abs(Math.max(...surface)-actual.height)<.0001);
}
for(const bad of [NaN,Infinity,-1,0,90,'','abc',null])assert.throws(()=>validateAngle(bad));
assert.equal(validateAngle('15.5'),15.5);
const defaults=calculateModel(meta,ditch,15,30);
assert.ok(Math.abs(defaults.moundVolume-2121.316)<.001);
assert.ok(Math.abs(defaults.ditchVolume-1726.716)<.001);
assert.ok(Math.abs(meta.observed.volume-939.0193)<.001);
assert.ok(defaults.balance<0);
assert.equal(calculateModel(meta,ditch,10,30).flatWidth,0);
assert.ok(calculateModel(meta,ditch,45,30).balance>0);
console.log(`PASS: ${fixtures.length} scenarios match independent Python notebook calculations; depth cap, terrain values, invalid inputs, V-shaped and flat-bottomed transitions verified.`);
await import('./test-dynamic.mjs');
