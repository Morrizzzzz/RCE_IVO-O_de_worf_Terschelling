import './vendor/jsts.min.js';
const J=globalThis.jsts;

// Squared Euclidean distance transform, two 1-D passes. No imaginary zero border.
export function distanceTransform(mask, rows, cols, cellSize=.5) {
  const size=Math.max(rows,cols), f=new Float64Array(size),d=new Float64Array(size);
  const v=new Int32Array(size),z=new Float64Array(size+1),tmp=new Float64Array(rows*cols);
  function pass(n){
    let k=0;v[0]=0;z[0]=-Infinity;z[1]=Infinity;
    for(let q=1;q<n;q++){
      let s=((f[q]+q*q)-(f[v[k]]+v[k]*v[k]))/(2*(q-v[k]));
      while(s<=z[k]){k--;s=((f[q]+q*q)-(f[v[k]]+v[k]*v[k]))/(2*(q-v[k]));}
      k++;v[k]=q;z[k]=s;z[k+1]=Infinity;
    }
    k=0;
    for(let q=0;q<n;q++){while(z[k+1]<q)k++;d[q]=(q-v[k])**2+f[v[k]];}
  }
  for(let c=0;c<cols;c++){
    for(let r=0;r<rows;r++)f[r]=mask[r*cols+c]?1e15:0;
    pass(rows);for(let r=0;r<rows;r++)tmp[r*cols+c]=d[r];
  }
  const out=new Float32Array(rows*cols);
  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++)f[c]=tmp[r*cols+c];
    pass(cols);for(let c=0;c<cols;c++)out[r*cols+c]=Math.sqrt(d[c])*cellSize;
  }
  return out;
}
function contains(ring,x,y){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[i],b=ring[j];
    if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
export class GeometryEngine {
  constructor(metadata,moundDistances){
    this.meta=metadata;this.moundDistances=moundDistances;
    this.poly=new J.io.GeoJSONReader().read({type:'Polygon',coordinates:[metadata.contours.mound]});
    this.writer=new J.io.GeoJSONWriter();this.width=null;this.slopeWidth=null;
  }
  buffer(width){return J.operation.buffer.BufferOp.bufferOp(this.poly,width,16);}
  update(ditchWidth,slopeWidth){
    const g=this.meta.grid;
    if(this.width!==ditchWidth){
      const outer=this.buffer(ditchWidth),bounds=outer.getEnvelopeInternal();
      this.outer=this.writer.write(outer).coordinates[0];
      this.centrelineLength=this.buffer(ditchWidth/2).getLength();
      const west=g.west-g.originX,north=g.north-g.originY,s=g.cellSize;
      const c0=Math.floor((bounds.getMinX()-west)/s+.001),r0=Math.floor((north-bounds.getMaxY())/s+.001);
      const cols=Math.floor((bounds.getMaxX()-bounds.getMinX())/s+.5),rows=Math.floor((bounds.getMaxY()-bounds.getMinY())/s+.5);
      if(c0<0||r0<0||c0+cols>g.cols||r0+rows>g.rows)throw new RangeError('The ditch extends beyond the prepared terrain grid.');
      const mask=new Uint8Array(rows*cols);
      for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
        const i=(r0+r)*g.cols+c0+c;
        if(this.moundDistances[i]===0&&contains(this.outer,west+(c0+c+.5)*s,north-(r0+r+.5)*s))mask[r*cols+c]=1;
      }
      const local=distanceTransform(mask,rows,cols,s);
      this.ditch=new Float32Array(g.rows*g.cols);
      for(let r=0;r<rows;r++)this.ditch.set(local.subarray(r*cols,(r+1)*cols),(r+r0)*g.cols+c0);
      this.width=ditchWidth;this.ditchCells=mask.reduce((a,b)=>a+b,0);
    }
    if(this.slopeWidth!==slopeWidth){
      const plateau=this.buffer(-slopeWidth);
      this.plateauArea=plateau.getArea();
      const geometry=this.writer.write(plateau);
      this.plateau=geometry.type==='Polygon'?(geometry.coordinates[0]??[]):[];
      this.slopeWidth=slopeWidth;
    }
    return this;
  }
}
