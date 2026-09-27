import {concaveEnvelopePlan,concaveRoomSolids} from './concave-profile-envelope.js';
import {areaPoints,edgePlanes} from './polygon-areas.js';
import {polygonPrism} from './polygon-geometry.js';
import {structuralFloorRectangles,wallHeightFor} from './model.js';
import {wallTypeFor,sampleWallType} from './wall-types.js';
import {clippedSolid} from './roof-geometry.js';
const EPS=1e-6,dot=(n,p)=>n.x*p.x+n.z*p.z;
// A filled room envelope, not just wall solids: removing only thin wall solids
// would leave detached roof fragments inside the room.
export function profileEnvelopePlan(view){
  if(!view.walls.some(w=>wallTypeFor(view,w)&&w.role!=='interior'))return {active:false};
  const areas=structuralFloorRectangles(view);if(areas.length!==1||(view.regions||[]).some(r=>r.effect==='void'))return concaveEnvelopePlan(view,areas);
  const points=areaPoints(areas[0]),edges=edgePlanes(points),sides=[];
  for(const [i,edge] of edges.entries()){
    const a=points[i],b=points[(i+1)%points.length],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz),along=p=>((p.x-a.x)*dx+(p.z-a.z)*dz)/len;
    const walls=view.walls.filter(w=>w.role!=='interior'&&[w.a,w.b].every(p=>Math.abs(dot(edge.n,p)-edge.d)<EPS)&&Math.min(along(w.a),along(w.b))<len-EPS&&Math.max(along(w.a),along(w.b))>EPS);
    const ranges=walls.map(w=>[Math.min(along(w.a),along(w.b)),Math.max(along(w.a),along(w.b))]).sort((a,b)=>a[0]-b[0]);let covered=0;
    for(const [start,end] of ranges){if(start>covered+EPS)break;covered=Math.max(covered,end);}
    if(covered<len-EPS)return {active:true,reason:'the roof footprint must follow a closed exterior wall outline'};
    if(walls.some(w=>Math.abs(wallHeightFor(view,w)-view.wallHeight)>EPS))return {active:true,reason:'shaped roof fitting needs full-height exterior walls'};
    const descriptors=walls.map(w=>{const raw={x:-(w.b.z-w.a.z)/Math.hypot(w.b.x-w.a.x,w.b.z-w.a.z),z:(w.b.x-w.a.x)/Math.hypot(w.b.x-w.a.x,w.b.z-w.a.z)},sign=w.inwardSide==='left'?-dot(edge.n,raw):w.inwardSide==='right'?dot(edge.n,raw):-1;return {wall:w,type:wallTypeFor(view,w),sign};});
    const levels=[0,1,...descriptors.flatMap(d=>(d.type?.stations||[]).map(p=>p.height))];
    const offset=(d,y)=>{const p=sampleWallType(d.type,y,view.wallThickness);return d.sign*p.offset+p.thickness/2-.002;};
    if(levels.some(y=>descriptors.some(d=>Math.abs(offset(d,y)-offset(descriptors[0],y))>EPS)))return {active:true,reason:'collinear exterior sections need the same outside profile for roof fitting'};
    sides.push({...edge,...descriptors[0],wallIds:walls.map(w=>w.id)});
  }
  const levels=[0,1,...sides.flatMap(s=>(s.type?.stations||[]).map(p=>p.height))];
  if(levels.some(y=>sides.some(s=>Math.abs(sampleWallType(s.type,y,view.wallThickness).thickness-sampleWallType(sides[0].type,y,view.wallThickness).thickness)>EPS)))return {active:true,reason:'roof fitting needs matching wall thickness at exterior corners'};
  return {active:true,area:areas[0],sides};
}
export function profileRoomSolids(view,elevation=0,originY=0){
  const plan=profileEnvelopePlan(view);if(!plan.active||plan.reason)return {...plan,solids:[]};
  if(plan.general)return concaveRoomSolids(view,plan,elevation,originY);
  const height=view.wallHeight,levels=[-view.floorThickness,0,height,...plan.sides.flatMap(s=>(s.type?.stations||[]).map(p=>p.height*height))].sort((a,b)=>a-b).filter((v,i,a)=>!i||v-a[i-1]>EPS);
  const radius=1+4*Math.max(view.wallThickness,...plan.sides.flatMap(s=>(s.type?.stations||[]).map(p=>Math.abs(p.offset)+p.thickness)));
  const bounds={minX:plan.area.minX-radius,maxX:plan.area.maxX+radius,minZ:plan.area.minZ-radius,maxZ:plan.area.maxZ+radius},solids=[];
  for(let i=1;i<levels.length;i++){
    const low=levels[i-1],high=levels[i],bottom=low+elevation-originY,top=high+elevation-originY;let solid=polygonPrism(bounds,top,bottom);
    for(const side of plan.sides){
      const offset=y=>{const p=sampleWallType(side.type,y/height,view.wallThickness);return side.sign*p.offset+p.thickness/2-.002;},a=offset(low),b=offset(high),slope=(b-a)/(high-low),length=Math.hypot(1,slope);
      solid=clippedSolid(solid,{n:{x:side.n.x/length,y:-slope/length,z:side.n.z/length},d:(side.d+a-slope*bottom)/length});
    }
    if(!solid.faces.length)return {...plan,reason:'the shaped room envelope collapses at a profile level',solids:[]};
    solids.push(solid);
  }
  return {...plan,solids};
}
export function excludeRoofFootprint(solid,roof){
  let remaining=solid;const out=[];
  for(const edge of edgePlanes(areaPoints(roof))){
    const n={x:edge.n.x,y:0,z:edge.n.z},d=edge.d;
    const outside=clippedSolid(remaining,{n:{x:-n.x,y:0,z:-n.z},d:-d});if(outside.faces.length)out.push(outside);
    remaining=clippedSolid(remaining,{n,d});if(!remaining.faces.length)break;
  }
  return out;
}
export function boundedSolid(solid){const p=solid.faces.flatMap(f=>f.points);return {solid,...Object.fromEntries(['x','y','z'].flatMap(k=>[[`min${k.toUpperCase()}`,Math.min(...p.map(v=>v[k]))],[`max${k.toUpperCase()}`,Math.max(...p.map(v=>v[k]))]]))};}
