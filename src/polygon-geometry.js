import { areaPoints, polygonBoundary, edgePlanes, clipPolygon, polygonArea } from './polygon-areas.js';
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
function face(points,normal){
  const a=points[0],b=points[1],c=points[2],u={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},v={x:c.x-a.x,y:c.y-a.y,z:c.z-a.z};
  const actual={x:u.y*v.z-u.z*v.y,y:u.z*v.x-u.x*v.z,z:u.x*v.y-u.y*v.x};
  if(dot(actual,normal)<0)points=[...points].reverse();
  return {points,normal,uvs:points.map(p=>Math.abs(normal.y)>.5?{u:p.x,v:p.z}:{u:p.x+p.z,v:p.y})};
}
export function polygonSlabFaces(areas,thickness,topY=0){
  const top=[],bottom=[],edges=[];
  for(const r of areas){const points=areaPoints(r);top.push(face(points.map(p=>({...p,y:topY})),{x:0,y:1,z:0}));bottom.push(face(points.map(p=>({...p,y:topY-thickness})),{x:0,y:-1,z:0}));}
  for(const {a,b} of polygonBoundary(areas)){const l=Math.hypot(b.x-a.x,b.z-a.z);edges.push(face([{...a,y:topY-thickness},{...b,y:topY-thickness},{...b,y:topY},{...a,y:topY}],{x:(b.z-a.z)/l,y:0,z:(a.x-b.x)/l}));}
  return {top,bottom,edges};
}
// A convex vertical prism, optionally with a sloped top and bottom. Outward
// face winding and planes serve both solid clipping and collision export.
export function polygonPrism(area,topY,bottomY,slope={x:0,z:0}){
  const p=areaPoints(area),y=(q,base)=>base+slope.x*q.x+slope.z*q.z,l=Math.hypot(slope.x,1,slope.z),normal={x:-slope.x/l,y:1/l,z:-slope.z/l};
  const faces=[face(p.map(q=>({...q,y:y(q,topY)})),normal),face(p.map(q=>({...q,y:y(q,bottomY)})),{x:-normal.x,y:-normal.y,z:-normal.z})];
  for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],n=edgePlanes(p)[i].n;faces.push(face([{...a,y:y(a,bottomY)},{...b,y:y(b,bottomY)},{...b,y:y(b,topY)},{...a,y:y(a,topY)}],{x:n.x,y:0,z:n.z}));}
  const planes=faces.map(f=>({n:f.normal,d:dot(f.normal,f.points[0])})),vertices=faces.flatMap(f=>f.points);
  const bounds=Object.fromEntries(['x','y','z'].flatMap(k=>[[`min${k.toUpperCase()}`,Math.min(...vertices.map(p=>p[k]))],[`max${k.toUpperCase()}`,Math.max(...vertices.map(p=>p[k]))]]));
  return {faces,planes,...bounds};
}
export function offsetConvexArea(area,distance){
  const p=areaPoints(area),planes=edgePlanes(p),out=[];
  for(let i=0;i<planes.length;i++){
    const a=planes[(i+planes.length-1)%planes.length],b=planes[i],ad=a.d+distance,bd=b.d+distance,det=a.n.x*b.n.z-a.n.z*b.n.x;
    if(Math.abs(det)<1e-9)continue;
    out.push({x:(ad*b.n.z-a.n.z*bd)/det,z:(a.n.x*bd-ad*b.n.x)/det});
  }
  return polygonArea(out);
}
// Equal-pitch hips are the lower envelope of inward-rising eave planes.
// This produces a ridge on a rectangle and a faceted peak on round outlines.
export function polygonRoofParts(section,roof,baseY,index=0){
  const overhang=Math.max(0,Number(roof.overhang)||0),expanded=offsetConvexArea(section,overhang);if(!expanded)return [];
  const name=`Roof_${String(index+1).padStart(3,'0')}`;
  if((section.type||roof.type)==='flat')return [{name:name+'_Flat',solid:polygonPrism(expanded,baseY+.12,baseY)}];
  const planes=edgePlanes(areaPoints(section)),pitch=Math.tan(Math.max(5,Math.min(70,Number(section.pitch)||Number(roof.pitch)||35))*Math.PI/180),out=[];
  planes.forEach((edge,i)=>{
    let points=areaPoints(expanded);
    for(const other of planes){points=clipPolygon(points,{x:other.n.x-edge.n.x,z:other.n.z-edge.n.z},other.d-edge.d);if(!points.length)break;}
    const area=polygonArea(points);if(!area)return;
    const slope={x:-edge.n.x*pitch,z:-edge.n.z*pitch};
    out.push({name:name+`_Hip_${String(i+1).padStart(2,'0')}`,solid:polygonPrism(area,baseY+edge.d*pitch+.12,baseY+edge.d*pitch,slope)});
  });
  return out;
}
