import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { calculateModel, reconstructionHeights, validateAngle, createScenario, setDimension, resetScenario, DIMENSIONS } from './model.js';
import { GeometryEngine } from './geometry.js';

const $ = id => document.getElementById(id);
const fmt = (value, digits=0) => value.toLocaleString('en-GB',{minimumFractionDigits:digits,maximumFractionDigits:digits});
const state = createScenario(new URLSearchParams(location.search));
let data, model, heights, scene, camera, renderer, controls, surface, wire, sideMesh, lines, sectionLine, geometry;
let lastFitHeight=0, framePending=false, toastTimer;

function toast(message) {
  $('toast').textContent=message; $('toast').hidden=false;
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3000);
}
function download(contents,name,type) {
  const blob=contents instanceof Blob?contents:new Blob([contents],{type});
  const url=URL.createObjectURL(blob), a=document.createElement('a');
  a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function syncControls() {
  for(const key of ['ditch','mound']) {
    $(key+'-angle').value=state[key];$(key+'-number').value=state[key];
    $(key+'-angle').style.setProperty('--fill',`${(state[key]-1)/88*100}%`);
  }
}
function syncDimensions() {
  for(const [key,spec] of Object.entries(DIMENSIONS)) {
    const locked=state.locked[key],number=$(key+'-number'),range=$(key+'-range'),button=$('lock-'+key);
    number.value=state[key].toFixed(1);range.value=state[key];
    number.disabled=locked;range.disabled=locked;
    range.style.setProperty('--fill',`${(state[key]-spec.min)/(spec.max-spec.min)*100}%`);
    button.setAttribute('aria-pressed',String(!locked));
    button.setAttribute('aria-label',`${locked?'Unlock':'Lock'} ${spec.label.toLowerCase()}`);
    button.title=locked?'Unlock to change this dimension':'Lock this dimension at its current value';
    button.classList.toggle('unlocked',!locked);
    button.querySelector('use').setAttribute('href',locked?'#i-lock':'#i-unlock');
    button.querySelector('span').textContent=locked?'Locked':'Editable';
  }
}
function updateUrl() {
  const url=new URL(location.href);
  url.searchParams.set('ditch',state.ditch);url.searchParams.set('slope',state.mound);
  for(const [key,param] of [['ditchWidth','ditch_width'],['ditchDepth','ditch_depth'],['slopeWidth','slope_width']])url.searchParams.set(param,state[key]);
  if(state.view==='ahn')url.searchParams.set('view','ahn');else url.searchParams.delete('view');
  history.replaceState(null,'',url);
}
function updateNumbers() {
  $('metric-height').innerHTML=`${fmt(model.height,2)}<em>m</em>`;
  $('metric-mound').innerHTML=`${fmt(model.moundVolume)}<em>m³</em>`;
  $('metric-ditch').innerHTML=`${fmt(model.ditchVolume)}<em>m³</em>`;
  $('metric-depth').innerHTML=`${fmt(model.actualDepth,2)}<em>m</em>`;
  $('depth-cap-label').textContent=`maximum ${fmt(state.ditchDepth,2)} m`;
  $('plateau-area').textContent=`${fmt(model.plateauArea,1)} m²`;
  $('ditch-shape').textContent=model.flatWidth>0
    ?`Depth-capped · ${fmt(model.flatWidth,2)} m flat bottom`
    :`V-shaped · reaches ${fmt(model.actualDepth,2)} m deep`;
  const balanced=Math.abs(model.balance)<0.5;
  $('balance-number').innerHTML=`${fmt(Math.abs(model.balance))}<em>m³</em>`;
  $('balance-type').textContent=balanced?'approximately balanced':model.balance<0?'additional soil required':'excavated soil remaining';
  $('coverage-bar').style.width=`${Math.min(100,model.coverage)}%`;
  $('coverage-bar').style.background=model.balance<0?'#b08b51':'#557d58';
  $('coverage-label').textContent=`Ditch supplies ${fmt(model.coverage)}%`;
  $('balance-note').textContent=`A volume-for-volume comparison, before compaction or erosion. The measured present-day mound contains ${fmt(data.meta.observed.volume)} m³ above its fitted reference plane.`;
}
function recalculate() {
  framePending=false;
  geometry.update(state.ditchWidth,state.slopeWidth);
  data.ditch=geometry.ditch;
  model=calculateModel(data.meta,data.ditch,state.ditch,state.mound,state,geometry);
  heights=reconstructionHeights(data.mound,data.ditch,model);
  updateNumbers();updateSurface();drawProfile();updateUrl();
  if(state.view==='model' && (model.height>Math.max(20,lastFitHeight*1.35) || (lastFitHeight>20&&model.height<lastFitHeight*.65)))fitCamera(state.camera);
}
function schedule() { if(!framePending) {framePending=true;requestAnimationFrame(recalculate);} }

function buildIndices(values) {
  const {rows,cols}=data.meta.grid, indices=[];
  for(let r=0;r<rows-1;r++)for(let c=0;c<cols-1;c++) {
    const a=r*cols+c,b=a+1,d=a+cols,e=d+1;
    if([a,d,b].every(i=>Number.isFinite(values[i]))) indices.push(a,d,b);
    if([b,d,e].every(i=>Number.isFinite(values[i]))) indices.push(b,d,e);
  }
  return indices;
}
function currentValues(){return state.view==='ahn'?data.terrain:heights;}
function buildScene() {
  const host=$('scene');
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  renderer.setClearColor('#e8ede4');renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
  host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden','true');
  scene=new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff,0xaaa88c,2.2));
  const sun=new THREE.DirectionalLight(0xfffae9,2.7);sun.position.set(-35,65,25);
  sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
  Object.assign(sun.shadow.camera,{left:-65,right:65,top:65,bottom:-65,near:1,far:180});
  sun.shadow.bias=-.0003;sun.shadow.normalBias=.1;scene.add(sun);
  camera=new THREE.OrthographicCamera(-60,60,40,-40,.1,3000);
  controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true;controls.dampingFactor=.1;
  controls.maxPolarAngle=Math.PI*.49;controls.minDistance=8;controls.maxDistance=2000;
  controls.minZoom=.25;controls.maxZoom=12;controls.enablePan=true;
  controls.addEventListener('start',()=>{document.querySelectorAll('.view-buttons .active').forEach(el=>el.classList.remove('active'));});
  const {rows,cols,cellSize,west,north,originX,originY}=data.meta.grid;
  const positions=new Float32Array(rows*cols*3);
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++) {
    const i=(r*cols+c)*3;positions[i]=west+(c+.5)*cellSize-originX;
    positions[i+2]=originY-(north-(r+.5)*cellSize);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.BufferAttribute(new Float32Array(positions.length),3));
  geometry.setIndex(buildIndices(heights));
  surface=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,metalness:0,side:THREE.DoubleSide}));
  surface.castShadow=true;surface.receiveShadow=true;scene.add(surface);
  wire=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:0x294834,wireframe:true,transparent:true,opacity:.12,depthWrite:false}));
  wire.position.y=.025;wire.visible=false;scene.add(wire);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(2000,2000),new THREE.ShadowMaterial({opacity:.11}));
  ground.name='shadow-ground';ground.rotation.x=-Math.PI/2;ground.position.y=-4.5;ground.receiveShadow=true;scene.add(ground);
  lines=new THREE.Group();scene.add(lines);
  createGrid();fitCamera('3d');
  new ResizeObserver(()=>resize()).observe(host);
  const northVector=new THREE.Vector3(),originVector=new THREE.Vector3();
  const animate=()=>{requestAnimationFrame(animate);controls.update();
    northVector.set(0,0,-1).project(camera);originVector.set(0,0,0).project(camera);
    $('north-needle').style.transform=`rotate(${Math.atan2(northVector.x-originVector.x,northVector.y-originVector.y)*180/Math.PI}deg)`;
    renderer.render(scene,camera);
  };animate();
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();$('load-error').hidden=false;$('load-error').textContent='The 3D graphics context was lost. Reload this page to restore the terrain. Your scenario angles are preserved in the URL.';});
}
function resize() {
  const host=$('scene'),w=host.clientWidth,h=host.clientHeight;
  if(!w||!h||!renderer)return;
  const half=(camera.top-camera.bottom)/2, aspect=w/h;
  camera.left=-half*aspect;camera.right=half*aspect;camera.updateProjectionMatrix();
  renderer.setSize(w,h,false);
}
function fitCamera(view='3d') {
  if(!camera)return;state.camera=view;
  const h=state.view==='model'?model.height:5;
  lastFitHeight=h;
  const aspect=$('scene').clientWidth/Math.max(1,$('scene').clientHeight);
  const focusY=Math.max(0,(h-10)*.38),size=Math.max(view==='top'?92:75,(view==='3d'?125:92)/aspect,h*1.35+35);
  camera.top=size/2;camera.bottom=-size/2;camera.zoom=1;
  controls.target.set(0,focusY,0);
  if(view==='top')camera.position.set(0,focusY+Math.max(150,h+100),.001);
  else if(view==='side')camera.position.set(0,focusY+.3,Math.max(150,h+100));
  else camera.position.copy(new THREE.Vector3(88,80,105).normalize().multiplyScalar(Math.max(160,h*1.5+150)).add(controls.target));
  camera.lookAt(controls.target);camera.updateProjectionMatrix();controls.update();resize();
  for(const v of ['3d','top','side'])$('camera-'+v).classList.toggle('active',v===view);
}
function createGrid() {
  const positions=[];
  for(let p=-40;p<=40;p+=10){positions.push(-42.75,.01,p,42.75,.01,p,p,.01,-42.75,p,.01,42.75);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  const grid=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:0x8fa382,transparent:true,opacity:.2}));
  grid.name='reference-grid';scene.add(grid);
  const scaleGeo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-35,.06,37),new THREE.Vector3(-25,.06,37)]);
  const scale=new THREE.Line(scaleGeo,new THREE.LineBasicMaterial({color:0x65745b}));scale.name='scale-bar';scene.add(scale);
  for(let x of [-35,-25]) {
    const g=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x,.06,36.4),new THREE.Vector3(x,.06,37.6)]);
    const l=new THREE.Line(g,new THREE.LineBasicMaterial({color:0x65745b}));l.name='scale-tick';scene.add(l);
  }
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=80;
  const ctx=canvas.getContext('2d');ctx.font='30px sans-serif';ctx.fillStyle='#5d6e54';ctx.textAlign='center';ctx.fillText('10 m',128,50);
  const texture=new THREE.CanvasTexture(canvas);
  const label=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false}));label.position.set(-30,.2,41);label.scale.set(11,3.4,1);label.name='scale-label';scene.add(label);
}
function disposeObject(object) {
  if(!object)return;object.traverse(o=>{o.geometry?.dispose();if(o.material)Array.isArray(o.material)?o.material.forEach(m=>m.dispose()):o.material.dispose();});
}
function updateSurface() {
  if(!surface)return;
  const values=currentValues(),pos=surface.geometry.attributes.position,col=surface.geometry.attributes.color;
  const ground=new THREE.Color('#b4c1a2'),moundLow=new THREE.Color('#7c9763'),moundHigh=new THREE.Color('#486c45');
  const ditchTop=new THREE.Color('#cab17d'),ditchLow=new THREE.Color('#9f7c48'),terrainLow=new THREE.Color('#b1c09c'),terrainHigh=new THREE.Color('#557f4c');
  const color=new THREE.Color();
  for(let i=0;i<values.length;i++){
    pos.setY(i,Number.isFinite(values[i])?values[i]:0);
    if(state.view==='ahn')color.copy(terrainLow).lerp(terrainHigh,THREE.MathUtils.clamp((values[i]-.3)/3.2,0,1));
    else if(data.mound[i]>0)color.copy(moundLow).lerp(moundHigh,Math.min(data.mound[i]/state.slopeWidth,1));
    else if(data.ditch[i]>0)color.copy(ditchTop).lerp(ditchLow,Math.min(-values[i]/state.ditchDepth,1));
    else color.copy(ground);
    const variation=1+Math.sin(i*93.127)*.022;color.multiplyScalar(variation);col.setXYZ(i,color.r,color.g,color.b);
  }
  if(surface.userData.view!==state.view){surface.geometry.setIndex(buildIndices(values));surface.userData.view=state.view;}
  pos.needsUpdate=true;col.needsUpdate=true;
  surface.geometry.computeVertexNormals();surface.geometry.computeBoundingSphere();
  scene.getObjectByName('shadow-ground').position.y=baseHeight()-.1;
  rebuildSides(values);rebuildLines(values);
  for(const name of ['reference-grid','scale-bar','scale-tick','scale-label'])scene.children.filter(c=>c.name===name).forEach(c=>c.visible=state.view==='model');
}
function baseHeight(){return state.view==='model'?-Math.max(4.4,state.ditchDepth+1.5):-4.4;}
function rebuildSides(values) {
  if(sideMesh){scene.remove(sideMesh);disposeObject(sideMesh);}
  const {rows,cols}=data.meta.grid,ids=[];
  for(let c=0;c<cols;c++)ids.push(c);
  for(let r=1;r<rows;r++)ids.push(r*cols+cols-1);
  for(let c=cols-2;c>=0;c--)ids.push((rows-1)*cols+c);
  for(let r=rows-2;r>0;r--)ids.push(r*cols);
  ids.push(ids[0]);const vertices=[],colors=[],p=surface.geometry.attributes.position;
  const top=new THREE.Color('#a1ac8d'),bottom=new THREE.Color('#92947b');
  for(let k=0;k<ids.length-1;k++){
    const a=ids[k],b=ids[k+1];if(!Number.isFinite(values[a])||!Number.isFinite(values[b]))continue;
    const va=[p.getX(a),values[a],p.getZ(a)],vb=[p.getX(b),values[b],p.getZ(b)];
    const ba=[va[0],baseHeight(),va[2]],bb=[vb[0],baseHeight(),vb[2]];
    for(const [v,c] of [[va,top],[ba,bottom],[vb,top],[vb,top],[ba,bottom],[bb,bottom]]){vertices.push(...v);colors.push(c.r,c.g,c.b);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals();
  sideMesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide}));sideMesh.castShadow=true;sideMesh.receiveShadow=true;scene.add(sideMesh);
}
function rebuildLines(values) {
  disposeObject(lines);lines.clear();
  if(state.view==='model') {
    for(const [name,y,opacity] of [['mound',.04,.65],['outer',.04,.4],['plateau',model.height+.025,.45]]) {
      const contour=name==='outer'?geometry.outer:name==='plateau'?geometry.plateau:data.meta.contours.mound;
      if(!contour.length)continue;
      const points=contour.map(([x,n])=>new THREE.Vector3(x,y,-n));
      const geo=new THREE.BufferGeometry().setFromPoints(points);
      lines.add(new THREE.Line(geo,new THREE.LineBasicMaterial({color:name==='plateau'?0xe0e6c7:0x6b7953,transparent:true,opacity})));
    }
  }
  // Actual central east-west section, shared with the chart.
  const {rows,cols}=data.meta.grid,row=Math.floor(rows/2),pos=surface.geometry.attributes.position;
  const segments=[];
  for(let c=0;c<cols-1;c++){
    const a=row*cols+c,b=a+1;if(!Number.isFinite(values[a])||!Number.isFinite(values[b]))continue;
    segments.push(pos.getX(a),values[a]+.055,pos.getZ(a),pos.getX(b),values[b]+.055,pos.getZ(b));
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(segments,3));
  sectionLine=new THREE.LineSegments(geo,new THREE.LineDashedMaterial({color:0xf7f7df,dashSize:1,gapSize:.7,transparent:true,opacity:.9}));
  sectionLine.computeLineDistances();lines.add(sectionLine);
}
function drawProfile() {
  const {rows,cols,cellSize}=data.meta.grid,row=Math.floor(rows/2),values=currentValues();
  const subset=Array.from({length:cols},(_,c)=>({x:(c-(cols-1)/2)*cellSize,y:values[row*cols+c],i:row*cols+c}));
  const valid=subset.filter(p=>Number.isFinite(p.y)),max=Math.max(6,...valid.map(p=>p.y)),min=Math.min(-2,...valid.map(p=>p.y));
  const w=720,h=160,left=40,right=18,top=18,bottom=26,plotW=w-left-right,plotH=h-top-bottom;
  // Uniform metres per SVG unit on both axes, with a minimum visible height range.
  const scale=Math.min(plotW/86,plotH/(max-min));
  const x0=left+plotW/2,x=v=>x0+v*scale;
  const y0=top+plotH*max/(max-min),y=v=>y0-v*scale;
  const baseline=y(0),tick= (max-min)>30?Math.ceil((max-min)/5/10)*10:2;
  let svg='';
  for(let t=Math.ceil(min/tick)*tick;t<=max;t+=tick){
    const yy=y(t);if(yy<top||yy>h-bottom)continue;
    svg+=`<line x1="${left}" x2="${w-right}" y1="${yy}" y2="${yy}" stroke="${t===0?'#b8c3ae':'#edf0e8'}" ${t===0?'stroke-dasharray="4 4"':''}/><text x="${left-10}" y="${yy+3}" font-size="9" fill="#99a18f" text-anchor="end">${t}</text>`;
  }
  for(let t=-40;t<=40;t+=20)svg+=`<text x="${x(t)}" y="${h-7}" font-size="9" fill="#99a18f" text-anchor="middle">${t===0?'0':t} m</text>`;
  svg+=`<text x="3" y="12" font-size="9" fill="#99a18f">m</text>`;
  let segment=[];
  const flush=()=>{
    if(segment.length<2){segment=[];return;}
    const d=segment.map((p,i)=>`${i?'L':'M'} ${x(p.x).toFixed(2)} ${y(p.y).toFixed(2)}`).join(' ');
    const fill=state.view==='ahn'?'#cad9bd':segment.some(p=>p.y>.1)?'#b8cbae':'#dfccaa';
    const stroke=state.view==='ahn'?'#789a68':segment.some(p=>p.y>.1)?'#678755':'#b3935e';
    svg+=`<path d="${d} L ${x(segment.at(-1).x)} ${baseline} L ${x(segment[0].x)} ${baseline} Z" fill="${fill}" fill-opacity=".65"/><path d="${d}" fill="none" stroke="${stroke}" stroke-width="1.6"/>`;
    segment=[];
  };
  for(const p of subset){
    if(!Number.isFinite(p.y)){flush();continue;}
    if(segment.length&&state.view==='model'&&(p.y>0)!==(segment.at(-1).y>0)){const prev=segment.at(-1);flush();segment.push(prev);}
    segment.push(p);
  }flush();
  $('profile').innerHTML=svg;
  $('profile-label').textContent='WEST → EAST · TRUE SCALE';
  $('profile-note').textContent=state.view==='ahn'?'Measured east–west AHN5 section. Heights in m NAP; gaps indicate missing data.':'A central east–west section. Zero is an assumed ground surface, not NAP.';
}
function setView(view) {
  state.view=view;
  $('view-model').classList.toggle('active',view==='model');$('view-model').setAttribute('aria-pressed',view==='model');
  $('view-ahn').classList.toggle('active',view==='ahn');$('view-ahn').setAttribute('aria-pressed',view==='ahn');
  $('datum-label').textContent=view==='model'?'RELATIVE HEIGHT · METRES':'MEASURED AHN5 · METRES NAP';
  $('scene-legend').innerHTML=view==='model'?'<span><i class="swatch mound"></i>Mound</span><span><i class="swatch ditch"></i>Ditch</span><span><i class="swatch ground"></i>Reference surface</span>':'<span><i class="swatch mound"></i>AHN5 DTM</span><span>Measured terrain · angles affect reconstruction only</span>';
  updateSurface();drawProfile();fitCamera(state.camera);updateUrl();
}
function wireEvents() {
  for(const key of ['ditch','mound']){
    $(key+'-angle').addEventListener('input',e=>{state[key]=validateAngle(e.target.value);syncControls();$('angle-error').hidden=true;schedule();});
    $(key+'-number').addEventListener('change',e=>{
      try{state[key]=validateAngle(e.target.value);$('angle-error').hidden=true;syncControls();schedule();}
      catch(err){$('angle-error').textContent=err.message;$('angle-error').hidden=false;e.target.value=state[key];}
    });
  }
  for(const key of Object.keys(DIMENSIONS)) {
    $('lock-'+key).addEventListener('click',()=>{state.locked[key]=!state.locked[key];syncDimensions();});
    const change=e=>{
      try{setDimension(state,key,e.target.value);$('angle-error').hidden=true;syncDimensions();schedule();}
      catch(err){$('angle-error').textContent=err.message;$('angle-error').hidden=false;syncDimensions();}
    };
    $(key+'-range').addEventListener('input',change);
    $(key+'-number').addEventListener('change',change);
  }
  $('reset').addEventListener('click',()=>{resetScenario(state);syncControls();syncDimensions();$('angle-error').hidden=true;recalculate();toast('Notebook defaults restored. All three dimensions are locked.');});
  $('view-model').addEventListener('click',()=>setView('model'));
  $('view-ahn').addEventListener('click',()=>setView('ahn'));
  for(const view of ['3d','top','side'])$('camera-'+view).addEventListener('click',()=>fitCamera(view));
  $('camera-reset').addEventListener('click',()=>fitCamera('3d'));
  $('zoom-in').addEventListener('click',()=>{camera.zoom=Math.min(12,camera.zoom*1.25);camera.updateProjectionMatrix();});
  $('zoom-out').addEventListener('click',()=>{camera.zoom=Math.max(.25,camera.zoom/1.25);camera.updateProjectionMatrix();});
  $('wireframe').addEventListener('change',e=>{state.wireframe=e.target.checked;wire.visible=state.wireframe;});
  $('snapshot').addEventListener('click',()=>{
    renderer.render(scene,camera);
    // Include parameters and the height reference in the exported scientific image.
    const out=document.createElement('canvas'),src=renderer.domElement;
    out.width=src.width;out.height=src.height+130;const ctx=out.getContext('2d');
    ctx.fillStyle='#f6f7f2';ctx.fillRect(0,0,out.width,out.height);ctx.drawImage(src,0,0);
    ctx.fillStyle='#294634';ctx.font='20px sans-serif';ctx.fillText(`De Worf · ${state.view==='model'?'Relative reconstruction (m)':'AHN5 measured terrain (m NAP)'}`,24,src.height+35);
    ctx.font='15px sans-serif';ctx.fillText(`Ditch ${state.ditch}° · mound ${state.mound}° · mound ${fmt(model.moundVolume)} m³ · ditch ${fmt(model.ditchVolume)} m³`,24,src.height+65);
    ctx.fillText(`Ditch width ${state.ditchWidth} m · depth limit ${state.ditchDepth} m · inward slope width ${state.slopeWidth} m`,24,src.height+94);
    out.toBlob(blob=>{if(blob){download(blob,`de-worf-${state.view}-${state.ditch}-${state.mound}.png`);toast('Snapshot downloaded.');}},'image/png');
  });
  $('download-summary').addEventListener('click',()=>{
    const output={site:data.meta.name,exportedAt:new Date().toISOString(),parameters:{ditch_angle_degrees:state.ditch,slope_angle_degrees:state.mound,ditch_width:state.ditchWidth,ditch_depth:state.ditchDepth,slope_width:state.slopeWidth},
      locks:{...state.locked},results:{plateau_area_m2:model.plateauArea,mound_height_m:model.height,mound_volume_m3:model.moundVolume,ditch_raster_volume_m3:model.ditchVolume,ditch_analytical_volume_m3:model.analyticalDitchVolume,actual_ditch_depth_m:model.actualDepth,flat_bottom_width_m:model.flatWidth,excavated_minus_mound_m3:model.balance},
      observed:data.meta.observed,source:{repository:data.meta.sourceRepository,commit:data.meta.sourceCommit,ahn:data.meta.ahnUrl},heightReference:'Model: relative to assumed zero. AHN5: m NAP.',assumptions:data.meta.notes};
    download(JSON.stringify(output,null,2),`de-worf-scenario-${state.ditch}-${state.mound}.json`,'application/json');toast('Scenario and source metadata downloaded.');
  });
  $('share').addEventListener('click',async()=>{updateUrl();try{await navigator.clipboard.writeText(location.href);toast('Scenario link copied.');}catch{toast('Copy the address bar URL to share this scenario.');}});
}

$('method-open').addEventListener('click',()=>$('method-dialog').showModal());
$('method-close').addEventListener('click',()=>$('method-dialog').close());
$('method-dialog').addEventListener('click',e=>{if(e.target===$('method-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
syncControls();syncDimensions();
try {
  const checked=async path=>{const r=await fetch(path);if(!r.ok)throw new Error(`Could not load ${path} (${r.status}).`);return r;};
  const [meta,terrain,mound,ditch]=await Promise.all([
    checked('./data/metadata.json').then(r=>r.json()),
    checked('./data/terrain.bin').then(r=>r.arrayBuffer()).then(b=>new Float32Array(b)),
    checked('./data/mound-distance.bin').then(r=>r.arrayBuffer()).then(b=>new Float32Array(b)),
    checked('./data/ditch-distance.bin').then(r=>r.arrayBuffer()).then(b=>new Float32Array(b))
  ]);
  data={meta,terrain,mound,ditch};
  geometry=new GeometryEngine(meta,mound);
  const size=meta.grid.rows*meta.grid.cols;
  if([terrain,mound,ditch].some(a=>a.length!==size))throw new Error('The terrain grid is incomplete.');
  geometry.update(state.ditchWidth,state.slopeWidth);data.ditch=geometry.ditch;
  model=calculateModel(meta,data.ditch,state.ditch,state.mound,state,geometry);heights=reconstructionHeights(mound,data.ditch,model);
  buildScene();wireEvents();recalculate();setView(state.view);
  $('pinned-source').href=`${meta.sourceRepository}/blob/${meta.sourceCommit}/${meta.sourceNotebook}`;
  document.querySelectorAll('fieldset').forEach(f=>f.disabled=false);syncDimensions();$('loading').hidden=true;
} catch(err) {
  console.error(err);$('loading').hidden=true;$('load-error').hidden=false;
  $('load-error').textContent=`The interactive terrain could not start. ${err.message} Please use a WebGL-enabled browser and serve the site over HTTP(S), rather than opening index.html directly.`;
  document.querySelectorAll('.viewer button,.page-footer button,#reset').forEach(b=>b.disabled=true);
}
