// Minimal .glb reader for tests: the JSON chunk plus accessor values, and
// world matrices per node (translation/rotation/scale only, as exported).
export function readGlb(bytes){
  const buf=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),dv=new DataView(buf.buffer,buf.byteOffset,buf.byteLength);
  if(dv.getUint32(0,true)!==0x46546C67||dv.getUint32(4,true)!==2)throw new Error('Not a glTF 2 binary');
  if(dv.getUint32(8,true)!==buf.byteLength)throw new Error('GLB length header does not match the file');
  const jsonLength=dv.getUint32(12,true);if(dv.getUint32(16,true)!==0x4E4F534A)throw new Error('First chunk is not JSON');
  const json=JSON.parse(new TextDecoder().decode(buf.subarray(20,20+jsonLength)));
  let bin=new Uint8Array(0);const binStart=20+jsonLength;
  if(binStart<buf.byteLength){if(dv.getUint32(binStart+4,true)!==0x004E4942)throw new Error('Second chunk is not BIN');bin=buf.subarray(binStart+8,binStart+8+dv.getUint32(binStart,true));}
  const types={5126:Float32Array,5125:Uint32Array,5123:Uint16Array,5121:Uint8Array},sizes={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
  const accessor=i=>{const a=json.accessors[i],v=json.bufferViews[a.bufferView],T=types[a.componentType],n=a.count*sizes[a.type];
    const start=bin.byteOffset+v.byteOffset+(a.byteOffset||0);if(start%T.BYTES_PER_ELEMENT)throw new Error('Misaligned accessor');
    if((v.byteOffset+(a.byteOffset||0))+n*T.BYTES_PER_ELEMENT>bin.byteLength)throw new Error('Accessor outside BIN chunk');
    return new T(bin.buffer.slice(start,start+n*T.BYTES_PER_ELEMENT));};
  const parent=new Map();json.nodes.forEach((n,i)=>(n.children||[]).forEach(c=>parent.set(c,i)));
  const localMatrix=n=>{const [x,y,z,w]=n.rotation||[0,0,0,1],[sx,sy,sz]=n.scale||[1,1,1],t=n.translation||[0,0,0];
    return [(1-2*(y*y+z*z))*sx,(2*(x*y+z*w))*sx,(2*(x*z-y*w))*sx,0,(2*(x*y-z*w))*sy,(1-2*(x*x+z*z))*sy,(2*(y*z+x*w))*sy,0,(2*(x*z+y*w))*sz,(2*(y*z-x*w))*sz,(1-2*(x*x+y*y))*sz,0,t[0],t[1],t[2],1];};
  const mul=(a,b)=>{const o=new Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];o[c*4+r]=s;}return o;};
  const worldCache=new Map(),world=i=>{if(!worldCache.has(i)){const p=parent.get(i),l=localMatrix(json.nodes[i]);worldCache.set(i,p==null?l:mul(world(p),l));}return worldCache.get(i);};
  const apply=(m,p)=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
  return {json,accessor,parent,world,apply};
}
