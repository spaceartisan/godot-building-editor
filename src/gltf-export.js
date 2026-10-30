// glTF 2.0 (.glb) export for engines other than Godot, Unreal Engine 5 first.
// The Godot scenes stay the single geometry source: this module reads the
// exporter's own building, door and elevator .tscn output (exportGodotFiles)
// and writes the same nodes, meshes, collision, lights and metadata as glTF,
// so .tscn bytes are unaffected and the web editor and CLI share one route.
//
// Conventions (checked by importing into UE 5.8 Interchange and Godot 4.7):
// - Godot and glTF are both Y-up, right-handed and in metres; positions copy.
// - Godot front faces are clockwise, glTF counter-clockwise: indices flip.
// - Each named surface (OutsideFaces, Door, ...) gets a material of that name,
//   so engines can bind materials by slot. Untrimmed BoxMesh parts take their
//   building_part (roof, post, ...) as the material name.
// - Every metadata/* entry (building_part, building_opening_id, ...) becomes
//   glTF extras on its node; groups become extras.godot_groups.
// - Collision uses Unreal's naming convention, which UE reads from glTF:
//   UBX_<node>_NN boxes and UCX_<node>_NN convex hulls, as children at
//   identity of a "carrier" mesh node, in the carrier's local space. Concave
//   (triangle) shapes become one thin convex prism per triangle. A body's
//   carrier is the nearest mesh in its subtree, else in its parent's, so a
//   door leaf's collision swings with its hinge. UE matches collision to the
//   carrier by node name, so glTF node names are made unique (_2, _3, ...;
//   the original name is kept in extras.godot_name).
// - OmniLight3D becomes a KHR_lights_punctual point light (placeholders, as
//   in Godot: intensity is the Godot energy).
import { exportGodotFiles, decodeOctNormal, decodeOctTangent } from './exporter.js';

export const GLB_PRISM_THICKNESS=0.02;

// --- .tscn reading -----------------------------------------------------------
// The grammar is the exporter's own (asset-check.mjs enforces it on exports):
// [header attrs] blocks followed by key = value lines, values in Godot's
// variant text syntax.
function parseValue(text,start){
  let i=start;
  const ws=()=>{while(i<text.length&&/\s/.test(text[i]))i++;};
  const value=()=>{
    ws();const c=text[i];
    if(c==='"'||(c==='&'&&text[i+1]==='"')){
      if(c==='&')i++;i++;let s='';
      while(text[i]!=='"'){if(i>=text.length)throw new Error('Unterminated string in scene');if(text[i]==='\\'){const n=text[i+1];s+=n==='n'?'\n':n==='t'?'\t':n;i+=2;}else s+=text[i++];}
      i++;return s;
    }
    if(c==='['){i++;const out=[];ws();if(text[i]===']'){i++;return out;}for(;;){out.push(value());ws();if(text[i]===','){i++;ws();if(text[i]===']'){i++;return out;}continue;}if(text[i]===']'){i++;return out;}throw new Error(`Unexpected ${text[i]} in array`);}}
    if(c==='{'){i++;const out={};ws();if(text[i]==='}'){i++;return out;}for(;;){const k=value();ws();if(text[i]!==':')throw new Error('Expected : in dictionary');i++;out[k]=value();ws();if(text[i]===','){i++;ws();if(text[i]==='}'){i++;return out;}continue;}if(text[i]==='}'){i++;return out;}throw new Error(`Unexpected ${text[i]} in dictionary`);}}
    const num=/^-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/i.exec(text.slice(i,i+40));
    if(num){i+=num[0].length;return Number(num[0]);}
    const id=/^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(i,i+64));
    if(!id)throw new Error(`Unexpected scene text near: ${text.slice(i,i+30)}`);
    i+=id[0].length;
    if(id[0]==='true')return true;if(id[0]==='false')return false;if(id[0]==='null')return null;
    if(id[0]==='inf')return Infinity;if(id[0]==='nan')return NaN;
    ws();if(text[i]!=='(')throw new Error(`Unsupported scene value: ${id[0]}`);
    i++;const args=[];ws();
    if(text[i]===')'){i++;return {type:id[0],args};}
    for(;;){args.push(value());ws();if(text[i]===','){i++;continue;}if(text[i]===')'){i++;break;}throw new Error(`Unexpected ${text[i]} in ${id[0]}()`);}
    return {type:id[0],args};
  };
  const v=value();return {value:v,end:i};
}

export function parseSceneText(text){
  // Sequential: a [header attr=value ...] block, then key = value properties
  // until the next header. Values are read whole, so brackets inside them
  // (groups=[...], multi-line _surfaces) never look like headers.
  const blocks=[];let i=0;
  const skip=()=>{while(i<text.length&&/\s/.test(text[i]))i++;};
  skip();
  while(i<text.length){
    if(text[i]!=='[')throw new Error(`Unreadable scene text: ${text.slice(i,i+40)}`);
    const km=/^\[([a-z_]+)/.exec(text.slice(i,i+40));if(!km)throw new Error(`Unreadable scene header: ${text.slice(i,i+40)}`);
    i+=km[0].length;const attrs={};
    for(;;){
      skip();if(text[i]===']'){i++;break;}
      const am=/^([A-Za-z_]+)=/.exec(text.slice(i,i+40));if(!am)throw new Error(`Unreadable scene header attribute: ${text.slice(i,i+40)}`);
      i+=am[0].length;const {value,end}=parseValue(text,i);attrs[am[1]]=value;i=end;
    }
    const props={};
    for(;;){
      skip();if(i>=text.length||text[i]==='[')break;
      const pm=/^([A-Za-z_][A-Za-z0-9_/]*) = /.exec(text.slice(i,i+200));if(!pm)throw new Error(`Unreadable scene property after [${km[1]}]: ${text.slice(i,i+40)}`);
      i+=pm[0].length;const {value,end}=parseValue(text,i);props[pm[1]]=value;i=end;
    }
    blocks.push({kind:km[1],attrs,props});
  }
  const scene={ext:{},sub:{},nodes:[]};
  for(const b of blocks){
    if(b.kind==='ext_resource')scene.ext[b.attrs.id]=b.attrs;
    else if(b.kind==='sub_resource')scene.sub[b.attrs.id]={type:b.attrs.type,...b.props};
    else if(b.kind==='node')scene.nodes.push({...b.attrs,props:b.props});
  }
  return scene;
}

// --- math -------------------------------------------------------------------
const nums=v=>v.args;
function quatFromEulerYXZ([x,y,z]){
  // Godot's default rotation order: Basis = Ry * Rx * Rz.
  const qx=[Math.sin(x/2),0,0,Math.cos(x/2)],qy=[0,Math.sin(y/2),0,Math.cos(y/2)],qz=[0,0,Math.sin(z/2),Math.cos(z/2)];
  return qmul(qmul(qy,qx),qz);
}
function qmul(a,b){return [a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];}
function matFromTRS(t,q,s){
  const [x,y,z,w]=q,[sx,sy,sz]=s;
  return [(1-2*(y*y+z*z))*sx,(2*(x*y+z*w))*sx,(2*(x*z-y*w))*sx,0,(2*(x*y-z*w))*sy,(1-2*(x*x+z*z))*sy,(2*(y*z+x*w))*sy,0,(2*(x*z+y*w))*sz,(2*(y*z-x*w))*sz,(1-2*(x*x+y*y))*sz,0,t[0],t[1],t[2],1];
}
function mmul(a,b){const o=new Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];o[c*4+r]=s;}return o;}
function minv(m){
  // Rigid transforms with uniform scale only (exports use none): R^T and -R^T t.
  const s2=m[0]*m[0]+m[1]*m[1]+m[2]*m[2]||1,o=new Array(16).fill(0);
  for(let r=0;r<3;r++)for(let c=0;c<3;c++)o[c*4+r]=m[r*4+c]/s2;
  for(let r=0;r<3;r++)o[12+r]=-(o[r]*m[12]+o[4+r]*m[13]+o[8+r]*m[14]);
  o[15]=1;return o;
}
const xform=(m,p)=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
const sub3=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],cross3=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot3=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const IDENTITY=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];

// Convex hull triangles of a small point set (collision shapes have at most a
// few dozen points): every triple whose plane has all points on one side.
// Faces with more than three coplanar points yield overlapping triangles,
// which engines accept (they rebuild the hull from the vertices).
export function convexHullTriangles(points,eps=1e-6){
  const pts=[];for(const p of points)if(!pts.some(q=>Math.abs(q[0]-p[0])<eps&&Math.abs(q[1]-p[1])<eps&&Math.abs(q[2]-p[2])<eps))pts.push(p);
  const tris=[];
  for(let a=0;a<pts.length;a++)for(let b=a+1;b<pts.length;b++)for(let c=b+1;c<pts.length;c++){
    // Skip near-collinear triples: their planes are unstable once positions are float32.
    const n=cross3(sub3(pts[b],pts[a]),sub3(pts[c],pts[a])),len=Math.hypot(...n);if(len<1e-5)continue;
    let pos=false,neg=false;
    for(let k=0;k<pts.length&&!(pos&&neg);k++){const d=dot3(n,sub3(pts[k],pts[a]))/len;if(d>eps)pos=true;else if(d<-eps)neg=true;}
    if(pos&&neg)continue;
    // Counter-clockwise seen from outside (the side with no points).
    tris.push(pos?[a,c,b]:[a,b,c]);
  }
  return {points:pts,triangles:tris};
}

// Concave (triangle) collision as few convex pieces: triangles on one plane
// that share an edge are joined while their union stays convex (its hull has
// the summed area). Each piece is a planar convex polygon, later thickened
// into a thin prism. Degenerate triangles are dropped.
export function coplanarConvexPieces(triangles,eps=1e-6){
  const planes=new Map();
  for(const t of triangles){
    const n=cross3(sub3(t[1],t[0]),sub3(t[2],t[0])),len=Math.hypot(...n);if(len<1e-9)continue;
    const u=n.map(v=>v/len),d=dot3(u,t[0]),key=[...u,d].map(v=>Math.round(v*1e4)).join(',');
    if(!planes.has(key))planes.set(key,{normal:u,polys:[]});
    planes.get(key).polys.push({points:t,area:len/2});
  }
  const pieces=[];
  for(const {normal,polys} of planes.values()){
    // 2D frame in the plane for hull/area tests.
    const ax=Math.abs(normal[0])<.9?[1,0,0]:[0,1,0],e1=cross3(normal,ax),l1=Math.hypot(...e1),u=e1.map(v=>v/l1),v=cross3(normal,u);
    const flat=p=>[dot3(p,u),dot3(p,v)];
    const hull2=pts=>{
      const s=pts.map((p,i)=>({p,q:flat(p),i})).sort((a,b)=>a.q[0]-b.q[0]||a.q[1]-b.q[1]),cr=(o,a,b)=>(a.q[0]-o.q[0])*(b.q[1]-o.q[1])-(a.q[1]-o.q[1])*(b.q[0]-o.q[0]);
      const lower=[],upper=[];for(const x of s){while(lower.length>1&&cr(lower.at(-2),lower.at(-1),x)<=eps*eps)lower.pop();lower.push(x);}
      for(const x of s.reverse()){while(upper.length>1&&cr(upper.at(-2),upper.at(-1),x)<=eps*eps)upper.pop();upper.push(x);}
      const h=[...lower.slice(0,-1),...upper.slice(0,-1)];let area=0;for(let i=0;i<h.length;i++){const a=h[i].q,b=h[(i+1)%h.length].q;area+=a[0]*b[1]-b[0]*a[1];}
      return {points:h.map(x=>x.p),area:Math.abs(area)/2};
    };
    const same=(a,b)=>Math.abs(a[0]-b[0])<eps&&Math.abs(a[1]-b[1])<eps&&Math.abs(a[2]-b[2])<eps;
    const shared=(a,b)=>a.points.filter(p=>b.points.some(q=>same(p,q))).length;
    for(let merged=true;merged;){
      merged=false;
      for(let i=0;i<polys.length&&!merged;i++)for(let j=i+1;j<polys.length&&!merged;j++){
        if(shared(polys[i],polys[j])<2)continue;
        const union=[...polys[i].points,...polys[j].points.filter(p=>!polys[i].points.some(q=>same(p,q)))],h=hull2(union),sum=polys[i].area+polys[j].area;
        if(Math.abs(h.area-sum)<=Math.max(1e-9,sum*1e-6)){polys[i]={points:h.points,area:sum};polys.splice(j,1);merged=true;}
      }
    }
    for(const p of polys)pieces.push({normal,points:p.points});
  }
  return pieces;
}

// --- glTF building ------------------------------------------------------------
class GlbWriter{
  constructor(){this.chunks=[];this.length=0;this.json={asset:{version:'2.0',generator:'Building Studio'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],materials:[],accessors:[],bufferViews:[],buffers:[]};}
  view(bytes,target){
    const pad=(4-this.length%4)%4;if(pad){this.chunks.push(new Uint8Array(pad));this.length+=pad;}
    this.json.bufferViews.push({buffer:0,byteOffset:this.length,byteLength:bytes.byteLength,...(target?{target}:{})});
    this.chunks.push(new Uint8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength));this.length+=bytes.byteLength;
    return this.json.bufferViews.length-1;
  }
  accessor(array,type,componentType,target,withBounds=false){
    const size={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[type],count=array.length/size,acc={bufferView:this.view(array,target),componentType,count,type};
    if(withBounds){const min=new Array(size).fill(Infinity),max=new Array(size).fill(-Infinity);for(let i=0;i<array.length;i++){const k=i%size;if(array[i]<min[k])min[k]=array[i];if(array[i]>max[k])max[k]=array[i];}acc.min=min.map(Math.fround);acc.max=max.map(Math.fround);}
    this.json.accessors.push(acc);return this.json.accessors.length-1;
  }
  indices(n,flip){
    const idx=n>65535?new Uint32Array(n):new Uint16Array(n);
    for(let i=0;i<n;i+=3){idx[i]=i;idx[i+1]=flip?i+2:i+1;idx[i+2]=flip?i+1:i+2;}
    return this.accessor(idx,'SCALAR',n>65535?5125:5123,34963);
  }
  finish(){
    this.json.buffers=this.length?[{byteLength:this.length}]:[];
    for(const k of ['meshes','materials','accessors','bufferViews','buffers'])if(!this.json[k].length)delete this.json[k];
    const enc=new TextEncoder();let js=enc.encode(JSON.stringify(this.json));
    const jsPad=(4-js.length%4)%4,binPad=(4-this.length%4)%4;
    const total=12+8+js.length+jsPad+(this.length?8+this.length+binPad:0),out=new Uint8Array(total),dv=new DataView(out.buffer);
    dv.setUint32(0,0x46546C67,true);dv.setUint32(4,2,true);dv.setUint32(8,total,true);
    dv.setUint32(12,js.length+jsPad,true);dv.setUint32(16,0x4E4F534A,true);out.set(js,20);out.fill(0x20,20+js.length,20+js.length+jsPad);
    if(this.length){
      let o=20+js.length+jsPad;dv.setUint32(o,this.length+binPad,true);dv.setUint32(o+4,0x004E4942,true);o+=8;
      for(const c of this.chunks){out.set(c,o);o+=c.byteLength;}
    }
    return out;
  }
}

function base64Bytes(b64){
  if(typeof Buffer!=='undefined')return new Uint8Array(Buffer.from(b64,'base64'));
  const s=atob(b64),out=new Uint8Array(s.length);for(let i=0;i<s.length;i++)out[i]=s.charCodeAt(i);return out;
}
const SURFACE_FORMAT=34359738391; // vertex | normal | tangent | UV1, written by packExteriorMesh()

function arrayMeshPrimitives(res,material){
  return res._surfaces.map(s=>{
    if(s.format!==SURFACE_FORMAT||s.primitive!==3)throw new Error(`Unsupported ArrayMesh surface format ${s.format} (${s.name})`);
    const n=s.vertex_count,vb=base64Bytes(s.vertex_data.args[0]),ab=base64Bytes(s.attribute_data.args[0]);
    const vv=new DataView(vb.buffer,vb.byteOffset,vb.byteLength),av=new DataView(ab.buffer,ab.byteOffset,ab.byteLength);
    const pos=new Float32Array(n*3),nor=new Float32Array(n*3),tan=new Float32Array(n*4),uv=new Float32Array(n*2);
    for(let i=0;i<n;i++){
      for(let k=0;k<3;k++)pos[i*3+k]=vv.getFloat32(i*12+k*4,true);
      const nn=decodeOctNormal(vv.getUint32(n*12+i*8,true)),tt=decodeOctTangent(vv.getUint32(n*12+i*8+4,true));
      nor.set([nn.x,nn.y,nn.z],i*3);
      // The sign is kept as stored, as Godot's own glTF exporter writes it
      // (and its importer reads it back), checked on exported walls and doors.
      tan.set([tt.x,tt.y,tt.z,tt.w],i*4);
      uv[i*2]=av.getFloat32(i*8,true);uv[i*2+1]=av.getFloat32(i*8+4,true);
    }
    return {name:s.name,positions:pos,normals:nor,tangents:tan,uvs:uv,material:material(s.name)};
  });
}

function boxMeshPrimitive(size,materialName){
  const [sx,sy,sz]=size.map(v=>v/2),pos=[],nor=[],uv=[];
  // Six faces, each two counter-clockwise triangles seen from outside; UVs in metres.
  const faces=[[[1,0,0],[0,0,-1],[0,1,0]],[[-1,0,0],[0,0,1],[0,1,0]],[[0,1,0],[1,0,0],[0,0,-1]],[[0,-1,0],[1,0,0],[0,0,1]],[[0,0,1],[1,0,0],[0,1,0]],[[0,0,-1],[-1,0,0],[0,1,0]]];
  const half=[sx,sy,sz];
  for(const [n,u,v] of faces){
    const c=n.map((k,i)=>k*half[i]),hu=Math.abs(dot3(u,half)),hv=Math.abs(dot3(v,half));
    const corner=(a,b)=>[c[0]+u[0]*a*hu+v[0]*b*hv,c[1]+u[1]*a*hu+v[1]*b*hv,c[2]+u[2]*a*hu+v[2]*b*hv];
    for(const [a,b] of [[-1,-1],[1,-1],[1,1],[-1,-1],[1,1],[-1,1]]){pos.push(...corner(a,b));nor.push(...n);uv.push((a+1)*hu,(1-b)*hv);}
  }
  return {name:materialName,positions:new Float32Array(pos),normals:new Float32Array(nor),uvs:new Float32Array(uv),material:materialName,ccw:true};
}

const META_PREFIX='metadata/';
function jsonValue(v){
  if(v&&typeof v==='object'&&!Array.isArray(v)&&v.type&&Array.isArray(v.args)){
    if(['Vector2','Vector3','Vector4','Color','Quaternion'].includes(v.type))return v.args.map(Number);
    return {[v.type]:v.args.map(jsonValue)};
  }
  if(Array.isArray(v))return v.map(jsonValue);
  if(v&&typeof v==='object'){const o={};for(const [k,x] of Object.entries(v))o[k]=jsonValue(x);return o;}
  return v;
}

const BODY_TYPES=new Set(['StaticBody3D','AnimatableBody3D','RigidBody3D','CharacterBody3D']);

// Builds the instanced scene tree: [{name,type,props,file,path,children}].
function sceneTree(files){
  const parsed=new Map();
  const get=name=>{if(!parsed.has(name)){const text=files.get(name);if(text==null)throw new Error(`Missing scene dependency: ${name}`);parsed.set(name,parseSceneText(text));}return parsed.get(name);};
  const dirOf=name=>name.includes('/')?name.slice(0,name.lastIndexOf('/')+1):'';
  const build=(file,stack=[])=>{
    if(stack.includes(file))throw new Error(`Cyclic scene dependency: ${file}`);
    const scene=get(file),byPath=new Map();let root=null;
    for(const n of scene.nodes){
      let node;
      if(n.instance){
        const ext=scene.ext[n.instance.args[0]];if(!ext)throw new Error(`Unknown ExtResource in ${file}`);
        const target=(dirOf(file)+ext.path).replace(/^\.\//,'');
        node=build(target,[...stack,file]);
        node.name=n.name;node.props={...node.props,...n.props};node.instanceOf=target;
      }else node={name:n.name,type:n.type,props:n.props,groups:n.groups||[],file,children:[],sub:scene.sub};
      const parentPath=n.parent;
      if(parentPath==null){root=node;byPath.set('.',node);}
      else{const parent=byPath.get(parentPath);if(!parent)throw new Error(`Unknown parent ${parentPath} in ${file}`);parent.children.push(node);byPath.set(parentPath==='.'?n.name:`${parentPath}/${n.name}`,node);}
    }
    return root;
  };
  return build;
}

export function buildGlb(sceneFiles,rootFile,options={}){
  const files=new Map(sceneFiles.map(f=>[f.name,f.text]));
  const root=sceneTree(files)(rootFile);
  const w=new GlbWriter(),json=w.json,usedNames=new Map(),materials=new Map(),meshCache=new Map(),lights=[];
  const stats={nodes:0,meshes:0,boxCollision:0,convexCollision:0,concaveCollision:0,lights:0,collisionBodies:0};
  const uniqueName=name=>{const n=usedNames.get(name)||0;usedNames.set(name,n+1);if(!n)return name;let k=n+1,candidate=`${name}_${k}`;while(usedNames.has(candidate))candidate=`${name}_${++k}`;usedNames.set(candidate,1);return candidate;};
  const material=name=>{
    if(!materials.has(name)){
      const m={name,pbrMetallicRoughness:{baseColorFactor:[.8,.8,.8,1],metallicFactor:0,roughnessFactor:1}};
      if(name==='Glass'){m.pbrMetallicRoughness.baseColorFactor=[.85,.92,1,.25];m.alphaMode='BLEND';}
      json.materials.push(m);materials.set(name,json.materials.length-1);
    }
    return materials.get(name);
  };
  const writeMesh=(name,prims)=>{
    const mesh={name,primitives:prims.map(p=>{
      const n=p.positions.length/3,attributes={POSITION:w.accessor(p.positions,'VEC3',5126,34962,true)};
      if(p.normals)attributes.NORMAL=w.accessor(p.normals,'VEC3',5126,34962);
      if(p.tangents)attributes.TANGENT=w.accessor(p.tangents,'VEC4',5126,34962);
      if(p.uvs)attributes.TEXCOORD_0=w.accessor(p.uvs,'VEC2',5126,34962);
      const prim={attributes,indices:p.indices!=null?p.indices:w.indices(n,!p.ccw),mode:4};
      if(p.material!=null)prim.material=typeof p.material==='number'?p.material:material(p.material);
      return prim;
    })};
    json.meshes.push(mesh);stats.meshes++;return json.meshes.length-1;
  };
  const meshPrimitives=node=>{
    const ref=node.props.mesh;if(!ref)return null;
    const res=node.sub[ref.args[0]];if(!res)throw new Error(`Unknown mesh resource in ${node.file}`);
    if(res.type==='ArrayMesh')return arrayMeshPrimitives(res,name=>name||'Default');
    if(res.type==='BoxMesh')return [boxMeshPrimitive(res.size?nums(res.size):[1,1,1],String(node.props['metadata/building_part']||'Default'))];
    throw new Error(`Unsupported mesh resource ${res.type} in ${node.file}`);
  };

  // World matrices and parents, then carriers for each collision body.
  const parentOf=new Map(),local=new Map(),world=new Map();
  const localMatrix=n=>{
    if(n.props.transform)throw new Error(`Unsupported transform property on ${n.name}`);
    const t=n.props.position?nums(n.props.position):[0,0,0],r=n.props.rotation?quatFromEulerYXZ(nums(n.props.rotation)):[0,0,0,1],s=n.props.scale?nums(n.props.scale):[1,1,1];
    return {t,r,s,m:matFromTRS(t,r,s)};
  };
  const walk=(n,parent,pm)=>{parentOf.set(n,parent);const l=localMatrix(n);local.set(n,l);const m=mmul(pm,l.m);world.set(n,m);for(const c of n.children)walk(c,n,m);};
  walk(root,null,IDENTITY);
  const isMesh=n=>n.type==='MeshInstance3D'&&n.props.mesh;
  const carrierFor=body=>{
    // Breadth-first from the body itself, then from each ancestor, never entering another body.
    const search=(start,skip)=>{const queue=[start];while(queue.length){const n=queue.shift();if(n!==start&&BODY_TYPES.has(n.type)&&n!==body)continue;if(isMesh(n))return n;for(const c of n.children)if(c!==skip)queue.push(c);}return null;};
    let found=search(body,null);for(let child=body,p=parentOf.get(body);!found&&p;child=p,p=parentOf.get(p))found=search(p,child);
    return found;
  };
  const collisionByCarrier=new Map(),dropped=new Set();
  if(options.collision!==false){
    const bodies=[];const find=n=>{if(BODY_TYPES.has(n.type))bodies.push(n);n.children.forEach(find);};find(root);
    for(const body of bodies){
      const shapes=[];const gather=n=>{for(const c of n.children){if(BODY_TYPES.has(c.type))continue;if(c.type==='CollisionShape3D')shapes.push(c);gather(c);}};gather(body);
      if(!shapes.length)continue;stats.collisionBodies++;
      const carrier=carrierFor(body);if(!carrier)throw new Error(`No mesh to carry the collision of ${body.name}`);
      const inv=minv(world.get(carrier)),list=collisionByCarrier.get(carrier)||[];
      for(const shape of shapes){
        const res=shape.sub[shape.props.shape?.args[0]];if(!res)continue;
        const m=mmul(inv,world.get(shape));
        if(res.type==='BoxShape3D'){const [x,y,z]=nums(res.size).map(v=>v/2);list.push({kind:'UBX',points:[[-x,-y,-z],[x,-y,-z],[-x,y,-z],[x,y,-z],[-x,-y,z],[x,-y,z],[-x,y,z],[x,y,z]].map(p=>xform(m,p))});stats.boxCollision++;}
        else if(res.type==='ConvexPolygonShape3D'){const a=nums(res.points);const pts=[];for(let i=0;i<a.length;i+=3)pts.push(xform(m,[a[i],a[i+1],a[i+2]]));list.push({kind:'UCX',points:pts});stats.convexCollision++;}
        else if(res.type==='ConcavePolygonShape3D'){
          const a=nums(res.data),tris=[];
          for(let i=0;i+8<a.length;i+=9)tris.push([0,3,6].map(o=>xform(m,[a[i+o],a[i+o+1],a[i+o+2]])));
          for(const piece of coplanarConvexPieces(tris)){
            const h=piece.normal.map(v=>v*GLB_PRISM_THICKNESS/2);
            list.push({kind:'UCX',points:[...piece.points.map(q=>[q[0]+h[0],q[1]+h[1],q[2]+h[2]]),...piece.points.map(q=>[q[0]-h[0],q[1]-h[1],q[2]-h[2]])]});stats.concaveCollision++;
          }
        }else throw new Error(`Unsupported collision shape ${res.type}`);
      }
      collisionByCarrier.set(carrier,list);
    }
  }
  // Collision shapes, and bodies left empty without them, are not written as nodes.
  const keep=n=>{
    if(n.type==='CollisionShape3D')return false;
    const kids=n.children.filter(keep);
    if(BODY_TYPES.has(n.type)&&!kids.length&&!isMesh(n))return false;
    return true;
  };
  const emit=n=>{
    if(!keep(n)){dropped.add(n);return null;}
    const name=uniqueName(n.name),l=local.get(n),node={name},extras={};
    if(l.t.some(v=>v!==0))node.translation=l.t;
    if(!(l.r[0]===0&&l.r[1]===0&&l.r[2]===0))node.rotation=l.r;
    if(l.s.some(v=>v!==1))node.scale=l.s;
    if(name!==n.name)extras.godot_name=n.name;
    if(n.type!=='Node3D'&&n.type!=='MeshInstance3D')extras.godot_type=n.type;
    for(const [k,v] of Object.entries(n.props))if(k.startsWith(META_PREFIX))extras[k.slice(META_PREFIX.length)]=jsonValue(v);
    if(n.groups?.length)extras.godot_groups=n.groups;
    const index=json.nodes.length;json.nodes.push(node);stats.nodes++;
    const collision=collisionByCarrier.get(n);
    if(isMesh(n)){
      // Carriers get their own mesh (their collision is per node); others share per resource.
      const key=collision?null:`${n.file}#${n.props.mesh.args[0]}`;
      let mi=key!=null?meshCache.get(key):undefined;
      if(mi==null){mi=writeMesh(name,meshPrimitives(n));if(key!=null)meshCache.set(key,mi);}
      node.mesh=mi;
    }
    if(n.type==='OmniLight3D'){
      const c=n.props.light_color?nums(n.props.light_color):[1,1,1,1];
      lights.push({type:'point',color:c.slice(0,3),intensity:n.props.light_energy??1,range:n.props.omni_range??5});
      node.extensions={KHR_lights_punctual:{light:lights.length-1}};stats.lights++;
      extras.shadow_enabled=n.props.shadow_enabled??false;
    }
    if(Object.keys(extras).length)node.extras=extras;
    const children=n.children.map(emit).filter(i=>i!=null);
    if(collision){
      collision.forEach((c,k)=>{
        const hull=c.kind==='UBX'?{points:c.points,triangles:[[0,2,3],[0,3,1],[4,5,7],[4,7,6],[0,1,5],[0,5,4],[2,6,7],[2,7,3],[0,4,6],[0,6,2],[1,3,7],[1,7,5]]}:convexHullTriangles(c.points);
        const pts=new Float32Array(hull.points.flat()),idx=new Uint16Array(hull.triangles.flat());
        const cname=`${c.kind}_${name}_${String(k).padStart(2,'0')}`;usedNames.set(cname,1);
        const mesh={name:cname,primitives:[{attributes:{POSITION:w.accessor(pts,'VEC3',5126,34962,true)},indices:w.accessor(idx,'SCALAR',5123,34963),mode:4}]};
        json.meshes.push(mesh);
        json.nodes.push({name:cname,mesh:json.meshes.length-1});children.push(json.nodes.length-1);
      });
    }
    if(children.length)node.children=children;
    return index;
  };
  json.scenes[0].nodes=[emit(root)];
  if(lights.length){json.extensionsUsed=['KHR_lights_punctual'];json.extensions={KHR_lights_punctual:{lights}};}
  return {bytes:w.finish(),stats};
}

// Same inputs and options as exportGodotFiles (game layers and placeholder
// colours are Godot-side and rejected); returns {base, glbName, glb, stats, warnings}.
export function exportGltfFiles(building,options={}){
  if(options.gameLayer)throw new Error('A game layer applies to Godot scenes; glTF export does not take one.');
  if(options.placeholderMaterials)throw new Error('Placeholder colours apply to Godot scenes; glTF export names one material per surface instead.');
  const f=exportGodotFiles(building,{...options,placeholderMaterials:false,gameLayer:undefined});
  const sceneFiles=[{name:f.tscnName,text:f.tscn},...f.doors.map(d=>({name:d.filename,text:d.tscn}))];
  const {bytes,stats}=buildGlb(sceneFiles,f.tscnName,options);
  return {base:f.base,glbName:`${f.base}.glb`,glb:bytes,stats,warnings:f.warnings};
}
