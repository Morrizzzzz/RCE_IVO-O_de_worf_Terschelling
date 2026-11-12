export const DIMENSIONS={
  ditchWidth:{default:13,min:1,max:25,label:'Ditch width'},
  ditchDepth:{default:1.7,min:.1,max:5,label:'Maximum ditch depth'},
  slopeWidth:{default:8,min:.5,max:14,label:'Inward slope width'}
};
export function validateAngle(value) {
  const angle=Number(value);
  if(!Number.isFinite(angle)||angle<1||angle>89)throw new RangeError('Enter an angle from 1° to 89°.');
  return angle;
}
export function validateDimension(key,value){
  const spec=DIMENSIONS[key],n=Number(value);
  if(!spec||!Number.isFinite(n)||String(value).trim()===''||n<spec.min||n>spec.max)
    throw new RangeError(`${spec?.label??'Dimension'} must be between ${spec?.min} and ${spec?.max} m.`);
  return Math.round(n*10)/10;
}
export function createScenario(query=new URLSearchParams()){
  const state={ditch:15,mound:30,ditchWidth:13,ditchDepth:1.7,slopeWidth:8,view:'model',camera:'3d',wireframe:false,
    locked:{ditchWidth:true,ditchDepth:true,slopeWidth:true}};
  for(const [key,param] of [['ditch','ditch'],['mound','slope']])if(query.has(param)){
    try{state[key]=validateAngle(query.get(param));}catch{}
  }
  for(const [key,param] of [['ditchWidth','ditch_width'],['ditchDepth','ditch_depth'],['slopeWidth','slope_width']])if(query.has(param)){
    try{state[key]=validateDimension(key,query.get(param));}catch{}
  }
  if(query.get('view')==='ahn')state.view='ahn';
  return state;
}
export function setDimension(state,key,value){
  if(state.locked[key])throw new Error('Unlock this dimension before editing it.');
  state[key]=validateDimension(key,value);
}
export function resetScenario(state){
  state.ditch=15;state.mound=30;
  for(const [key,spec] of Object.entries(DIMENSIONS)){state[key]=spec.default;state.locked[key]=true;}
}
export function integrateMound(metadata,width){
  const {step,areas}=metadata.inwardAreaTable;
  let total=0;
  for(let i=0;i<areas.length-1&&i*step<width-1e-10;i++){
    const dx=Math.min(step,width-i*step);
    total+=dx*(areas[i]+areas[i]+(areas[i+1]-areas[i])*dx/step)/2;
  }
  return total;
}
export function calculateModel(metadata,ditchDistances,ditchAngle,moundAngle,dimensions={},geometry={}){
  ditchAngle=validateAngle(ditchAngle);moundAngle=validateAngle(moundAngle);
  const ditchWidth=validateDimension('ditchWidth',dimensions.ditchWidth??13);
  const ditchDepth=validateDimension('ditchDepth',dimensions.ditchDepth??1.7);
  const slopeWidth=validateDimension('slopeWidth',dimensions.slopeWidth??8);
  const ds=Math.tan(ditchAngle*Math.PI/180),ms=Math.tan(moundAngle*Math.PI/180);
  let ditchVolume=0;
  for(const distance of ditchDistances)ditchVolume+=Math.fround(Math.min(distance*ds,ditchDepth));
  ditchVolume*=metadata.grid.cellSize**2;
  const actualDepth=Math.min(ditchWidth/2*ds,ditchDepth);
  const flatWidth=Math.max(0,ditchWidth-2*ditchDepth/ds);
  const crossSection=flatWidth>0?(ditchWidth-ditchDepth/ds)*ditchDepth:.5*ditchWidth*actualDepth;
  const moundVolume=ms*integrateMound(metadata,slopeWidth);
  return {ditchAngle,moundAngle,ditchWidth,ditchDepth,slopeWidth,ditchSlope:ds,moundSlope:ms,
    ditchVolume,moundVolume,height:slopeWidth*ms,actualDepth,flatWidth,
    plateauArea:geometry.plateauArea??metadata.constants.plateauArea,
    analyticalDitchVolume:crossSection*(geometry.centrelineLength??metadata.constants.ditchCentrelineLength),
    balance:ditchVolume-moundVolume,coverage:ditchVolume/moundVolume*100};
}
export function reconstructionHeights(moundDistances,ditchDistances,model){
  return Float32Array.from(moundDistances,(d,i)=>d>0?Math.min(d,model.slopeWidth)*model.moundSlope:-Math.min(ditchDistances[i]*model.ditchSlope,model.ditchDepth));
}
