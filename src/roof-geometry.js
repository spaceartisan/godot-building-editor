import {profileRoomSolids,excludeRoofFootprint,boundedSolid} from './profile-roof-envelope.js';
import { polygonRoofParts, polygonPrism, offsetConvexArea } from './polygon-geometry.js';
import { convexOutline, roofFootprintAreas, manualRoofOverhang } from './roof-outline.js';
import { floorElevation, floorView, structuralFloorRectangles, subtractRectAreas } from './model.js';
import { unionFaceWriter } from './wall-union.js';

const EPS=1e-7;
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const neg=p=>({x:-p.x,y:-p.y,z:-p.z});
const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
function rotate(v,r={}){
  let {x,y,z}=v;
  if(r.x){const c=Math.cos(r.x),s=Math.sin(r.x);[y,z]=[y*c-z*s,y*s+z*c];}
  if(r.y){const c=Math.cos(r.y),s=Math.sin(r.y);[x,z]=[x*c+z*s,-x*s+z*c];}
  if(r.z){const c=Math.cos(r.z),s=Math.sin(r.z);[x,y]=[x*c-y*s,x*s+y*c];}
  return {x,y,z};
}

// One source for roof slab dimensions, thickness, ridge caps and transforms.
// Untouched export boxes retain their names and dimensions.
export function roofBoxParts(rs,roof,baseY,index=0,manual=false){
  if(!manual&&((rs.type||roof.type)==='hip'||(rs.polygon&&(rs.type||roof.type)==='flat')))return polygonRoofParts(rs,roof,baseY,index);
  // Manual hip roofs and polygon footprints share the automatic polygon path,
  // with the manual roof's own overhang and pitch (Halcyon: angled entrance bay).
  if(manual&&(rs.type==='hip'||rs.polygon)){
    const overhang=manualRoofOverhang(rs,roof),name=`ManualRoof_${String(index+1).padStart(3,'0')}`;
    // A concave flat outline is built from convex pieces of its grown outline.
    if(rs.polygon&&!convexOutline(rs.polygon))return roofFootprintAreas(rs,overhang).map((piece,i)=>({name:`${name}_Flat_${String(i+1).padStart(2,'0')}`,solid:polygonPrism(piece,baseY+.12,baseY)}));
    return polygonRoofParts(rs,{overhang,pitch:Number(rs.pitch)||Number(roof.pitch)||35},baseY,index,name);
  }
  const type=rs.type||roof.type,dir=rs.direction==='z'?'z':'x',t=.12;
  const w=rs.maxX-rs.minX,d=rs.maxZ-rs.minZ,cx=(rs.minX+rs.maxX)/2,cz=(rs.minZ+rs.maxZ)/2;
  if(w<=.05||d<=.05)return [];
  const pitch=(manual?Math.max(5,Math.min(70,Number(rs.pitch)||Number(roof.pitch)||35)):Number(rs.pitch)||roof.pitch||35)*Math.PI/180;
  const o=manual?manualRoofOverhang(rs,roof):roof.overhang||0;
  const idx=String(index+1).padStart(3,'0'),out=[];
  const add=(name,size,pos,rot={x:0,y:0,z:0})=>out.push({name,size,pos,rot});
  if(type==='flat')add(manual?`ManualRoof_${idx}_Flat`:`RoofSection_${idx}`,{x:w+2*o,y:t,z:d+2*o},{x:cx,y:baseY+t/2,z:cz});
  else if(type==='shed'){
    const run=(dir==='x'?w:d)+2*o,rise=(dir==='x'?w:d)*Math.tan(pitch),slope=run/Math.cos(pitch);
    add(manual?`ManualRoof_${idx}_Shed`:`RoofSection_${idx}`,{x:dir==='x'?slope+t*.75:w+2*o,y:t,z:dir==='x'?d+2*o:slope+t*.75},{x:cx,y:baseY+rise/2,z:cz},{x:dir==='x'?0:pitch,y:0,z:dir==='x'?-pitch:0});
  }else{
    const minO=!manual&&rs.suppressMin?0:o,maxO=!manual&&rs.suppressMax?0:o;
    const half=(dir==='x'?d:w)/2,run=half+o,rise=half*Math.tan(pitch),drop=o*Math.tan(pitch),slope=run/Math.cos(pitch),centerY=baseY+(rise-drop)/2;
    const length=(dir==='x'?w:d)+minO+maxO,center=(dir==='x'?cx:cz)+(maxO-minO)/2;
    for(const side of [-1,1]){
      const suffix=dir==='x'?(side<0?'North':'South'):(side<0?'West':'East');
      add(`${manual?'ManualRoof':'Roof'}_${idx}_${suffix}`,{x:dir==='x'?length:slope+t*.75,y:t,z:dir==='x'?slope+t*.75:length},{x:dir==='x'?center:cx+side*run/2,y:centerY,z:dir==='x'?cz+side*run/2:center},{x:dir==='x'?side*pitch:0,y:0,z:dir==='x'?0:-side*pitch});
    }
    add(manual?`ManualRoof_${idx}_Ridge`:`RidgeCap_${idx}`,{x:dir==='x'?length+.08:t*1.6,y:t*.85,z:dir==='x'?t*1.6:length+.08},{x:dir==='x'?center:cx,y:baseY+rise+t*.25,z:dir==='x'?cz:center});
  }
  return out;
}

// Interior volumes stop at each story's wall top. Roof-to-roof joins above
// that height remain authored roof geometry. Exclude this roof's own support
// footprint on its supporting story, but never exclude a taller story.
export function roofInteriorBlockers(building,rs,baseY,originY=0){
  const out=[],inset=Math.max(0,(Number(building.wallThickness)||.18)/2-.002);
  for(let i=0;i<(building.floors||[]).length;i++){
    const view=floorView(building,i),e=floorElevation(building,i),top=e+view.wallHeight;
    const shaped=profileRoomSolids(view,e,originY);
    // Polygon subtraction needs convex blockers: use the roof's footprint pieces.
    const footprint=roofFootprintAreas(rs);
    if(shaped.active&&!shaped.reason){for(const solid of shaped.solids)for(const piece of baseY>=top-.00001?footprint.reduce((list,area)=>list.flatMap(s=>excludeRoofFootprint(s,area)),[solid]):[solid])out.push(boundedSolid(piece));continue;}
    let rects=structuralFloorRectangles(view);
    if(baseY>=top-.00001)rects=subtractRectAreas(rects,footprint);
    for(const r of rects){if(r.polygon){const solid=polygonPrism(offsetConvexArea(r,inset),top-originY,e-view.floorThickness-originY);out.push({...solid,solid});continue;}out.push({minX:r.minX-inset,maxX:r.maxX+inset,minZ:r.minZ-inset,maxZ:r.maxZ+inset,minY:e-view.floorThickness-originY,maxY:top-originY});}
  }
  return out;
}

function boxSolid(size,pos,rot={}){
  const faces=[],planes=[];
  for(const [axis,uAxis,vAxis] of [['x','y','z'],['y','z','x'],['z','x','y']])for(const side of [-1,1]){
    const normal=rotate({x:axis==='x'?side:0,y:axis==='y'?side:0,z:axis==='z'?side:0},rot);
    const points=[],uvs=[];
    for(const [u,v] of [[-1,-1],[1,-1],[1,1],[-1,1]]){
      const q=rotate({[axis]:side*size[axis]/2,[uAxis]:u*size[uAxis]/2,[vAxis]:v*size[vAxis]/2},rot);
      points.push({x:q.x+pos.x,y:q.y+pos.y,z:q.z+pos.z});uvs.push({u:u*size[uAxis]/2,v:v*size[vAxis]/2});
    }
    if(side<0){points.reverse();uvs.reverse();}
    faces.push({points,uvs,normal});planes.push({n:normal,d:dot(points[0],normal)});
  }
  return {faces,planes};
}

export function clippedSolid(solid,plane){
  const distances=solid.faces.flatMap(f=>f.points.map(p=>dot(p,plane.n)-plane.d));
  if(distances.every(d=>d<=EPS))return solid;
  if(distances.every(d=>d>=-EPS))return {faces:[],planes:[...solid.planes,plane]};
  const faces=[],cut=[];
  for(const f of solid.faces){
    const points=clip(f.points,[plane]);if(points.length>=3)faces.push({...f,points,uvs:points.map(p=>({u:p.x,v:p.z}))});
    for(const p of points)if(Math.abs(dot(p,plane.n)-plane.d)<EPS&&!cut.some(q=>Math.hypot(p.x-q.x,p.y-q.y,p.z-q.z)<EPS))cut.push(p);
  }
  if(cut.length>=3){
    const center=cut.reduce((a,p)=>({x:a.x+p.x/cut.length,y:a.y+p.y/cut.length,z:a.z+p.z/cut.length}),{x:0,y:0,z:0});
    const axis=Math.abs(plane.n.y)<.9?{x:0,y:1,z:0}:{x:1,y:0,z:0},u=cross(axis,plane.n),v=cross(plane.n,u);
    cut.sort((a,b)=>Math.atan2(dot(sub(a,center),v),dot(sub(a,center),u))-Math.atan2(dot(sub(b,center),v),dot(sub(b,center),u)));
    faces.push({points:cut,normal:plane.n,uvs:cut.map(p=>({u:p.x,v:p.z}))});
  }
  return {faces,planes:[...solid.planes,plane]};
}

// An explicit, one-way attachment trims the selected section to its host's
// roof envelope. The host remains intact; this is not an automatic valley union.
export function roofAttachmentBlockers(building,rs,originY=0){
  const out=[];
  for(const [edge,mode] of Object.entries(rs.edgeModes||{}))if(mode==='flush'){
    const axis=edge.endsWith('X')?'x':'z',min=edge.startsWith('min'),value=rs[edge];
    const r={minX:rs.minX-1e4,maxX:rs.maxX+1e4,minZ:rs.minZ-1e4,maxZ:rs.maxZ+1e4,minY:-1e7,maxY:1e7};
    r[(min?'max':'min')+axis.toUpperCase()]=value;out.push(r);
  }
  const host=(building.roofSections||[]).find(r=>r.id===rs.hostRoofId);if(!host)return out;
  const hostY=Number.isFinite(Number(host.baseY))?Number(host.baseY):Number(building.wallHeight)||2.8;
  const parts=roofBoxParts(host,building.roof||{},hostY-originY,0,true).filter(p=>!p.name.endsWith('_Ridge'));
  if(!parts.length)return out;
  const all=parts.flatMap(p=>boxSolid(p.size,p.pos,p.rot).faces.flatMap(f=>f.points));
  const bounds=Object.fromEntries(['x','y','z'].flatMap(k=>[[`min${k.toUpperCase()}`,Math.min(...all.map(p=>p[k]))],[`max${k.toUpperCase()}`,Math.max(...all.map(p=>p[k]))]]));
  let solid=boxSolid({x:bounds.maxX-bounds.minX,y:bounds.maxY-bounds.minY,z:bounds.maxZ-bounds.minZ},{x:(bounds.minX+bounds.maxX)/2,y:(bounds.minY+bounds.maxY)/2,z:(bounds.minZ+bounds.maxZ)/2});
  for(const part of parts.filter(p=>!p.name.endsWith('_Ridge'))){
    const top=boxSolid(part.size,part.pos,part.rot).faces[3];
    solid=clippedSolid(solid,{n:top.normal,d:dot(top.normal,top.points[0])});
  }
  for(const [edge,mode] of Object.entries(host.edgeModes||{}))if(mode==='flush'){
    const axis=edge.endsWith('X')?'x':'z',sign=edge.startsWith('min')?-1:1;
    solid=clippedSolid(solid,{n:{x:axis==='x'?sign:0,y:0,z:axis==='z'?sign:0},d:sign*host[edge]});
  }
  out.push({...bounds,solid});return out;
}
function clip(points,planes){
  let poly=points;
  for(const {n,d} of planes){
    const next=[];
    for(let i=0;i<poly.length;i++){
      const a=poly[i],b=poly[(i+1)%poly.length],da=dot(a,n)-d,db=dot(b,n)-d;
      if(da<=EPS)next.push(a);
      if((da>EPS)!==(db>EPS)){
        const t=da/(da-db);next.push(Object.fromEntries(Object.keys(a).map(k=>[k,a[k]+(b[k]-a[k])*t])));
      }
    }
    poly=next;if(poly.length<3)return [];
  }
  return poly;
}
function intersectionVolume(a,b){
  let volume=0;
  for(const [solid,planes] of [[a,b.planes],[b,a.planes]])for(const face of solid.faces){
    const p=clip(face.points,planes);
    for(let i=1;i<p.length-1;i++)volume+=dot(p[0],cross(p[i],p[i+1]))/6;
  }
  return Math.abs(volume);
}

// Subtract finite interior volumes from the actual rotated solid, then cap
// the cuts. Subtracting faces alone would leave holes; clipping centerlines
// alone would leave the slab thickness projecting through the wall.
// null means the original box is unchanged; [] means entirely removed.
export function trimRoofBox(part,blockers=[]){
  if(!blockers.length)return part.solid?.faces||null;
  const roof=part.solid||boxSolid(part.size,part.pos,part.rot);
  const vertices=roof.faces.flatMap(f=>f.points);
  const bounds=Object.fromEntries(['x','y','z'].flatMap(k=>[[`min${k.toUpperCase()}`,Math.min(...vertices.map(p=>p[k]))],[`max${k.toUpperCase()}`,Math.max(...vertices.map(p=>p[k]))]]));
  const solids=[];
  for(const r of blockers){
    if(['X','Y','Z'].some(k=>Math.min(r[`max${k}`],bounds[`max${k}`])-Math.max(r[`min${k}`],bounds[`min${k}`])<=EPS))continue;
    const solid=r.solid||boxSolid({x:r.maxX-r.minX,y:r.maxY-r.minY,z:r.maxZ-r.minZ},{x:(r.minX+r.maxX)/2,y:(r.minY+r.maxY)/2,z:(r.minZ+r.maxZ)/2});
    if(intersectionVolume(roof,solid)>1e-9)solids.push({...solid,ownerIndex:solids.length});
  }
  if(!solids.length)return part.solid?.faces||null;
  const faces=[],writer={face(points,uvs,normal){
    points=[...points];uvs=[...uvs];
    for(let i=points.length-1;i>=0&&points.length>=3;i--){
      const n=cross(sub(points[i],points[(i+points.length-1)%points.length]),sub(points[(i+1)%points.length],points[i]));
      if(Math.hypot(n.x,n.y,n.z)<1e-9){points.splice(i,1);uvs.splice(i,1);}
    }
    if(points.length<3)return;
    let area=0;for(let i=1;i<points.length-1;i++){const n=cross(sub(points[i],points[0]),sub(points[i+1],points[0]));area+=Math.hypot(n.x,n.y,n.z);}
    if(area>1e-9)faces.push({points,uvs,normal});
  }};
  const outer=unionFaceWriter(writer,solids.length,solids);
  for(const f of roof.faces)outer.face(f.points,f.uvs,f.normal);
  const capWriter={face(points,uvs,normal){writer.face([...points].reverse(),[...uvs].reverse(),neg(normal));}};
  for(const solid of solids){
    const boundary=unionFaceWriter(capWriter,solid.ownerIndex,solids);
    for(const f of solid.faces){
      const poly=clip(f.points.map((p,i)=>({...p,...f.uvs[i]})),roof.planes);
      if(roof.planes.some(p=>poly.every(v=>Math.abs(dot(v,p.n)-p.d)<EPS)))continue;
      if(poly.length>=3)boundary.face(poly.map(({x,y,z})=>({x,y,z})),poly.map(({u,v})=>({u,v})),f.normal);
    }
  }
  return faces;
}

// Independently capped gable end prisms, sharing slab subtraction and host cuts.
export function trimmedGableEnds(rs,baseY,thickness,blockers){
  const axis=rs.direction==='z'?'z':'x',span=axis==='x'?'z':'x',lo=rs['min'+span.toUpperCase()],hi=rs['max'+span.toUpperCase()],pitch=Math.tan((Number(rs.pitch)||35)*Math.PI/180),rise=(hi-lo)/2*pitch,ends=rs.gableEnds||'both',out=[];let changed=false;
  if(rise<=EPS)return null;
  for(const side of [-1,1]){
    if(ends==='none'||ends==='min'&&side>0||ends==='max'&&side<0||side<0&&rs.suppressMin||side>0&&rs.suppressMax)continue;
    const at=rs[(side<0?'min':'max')+axis.toUpperCase()],size={x:axis==='x'?thickness:hi-lo,y:rise,z:axis==='z'?thickness:hi-lo},pos={x:axis==='x'?at:(lo+hi)/2,y:baseY+rise/2,z:axis==='z'?at:(lo+hi)/2};
    let solid=boxSolid(size,pos);
    for(const sign of [-1,1]){const length=Math.hypot(pitch,1),n={x:span==='x'?sign*pitch/length:0,y:1/length,z:span==='z'?sign*pitch/length:0},d=(baseY+(sign<0?-lo:hi)*pitch)/length;solid=clippedSolid(solid,{n,d});}
    const faces=trimRoofBox({solid},blockers);changed ||= faces!==solid.faces;
    out.push({axis,side,at,thickness,faces});
  }
  return changed?out:null;
}
