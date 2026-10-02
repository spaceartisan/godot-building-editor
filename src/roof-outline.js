import { regionPolygonProblem, regionBounds, regionAreaCells } from './regions.js';
import { mergeConvexAreas, polygonArea } from './polygon-areas.js';
import { offsetConvexArea } from './polygon-geometry.js';

// Manual roof footprints: a rectangle (minX..maxZ), a convex polygon for flat
// and hip roofs, or a concave polygon for flat roofs. Shared by validation, transactions and the web roof panel.
export const MANUAL_ROOF_TYPES=['gable','shed','flat','hip'];
export const POLYGON_ROOF_TYPES=['flat','hip'];
export const roofPolygonBounds=regionBounds;
export function convexOutline(points){
  let sign=0;
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],c=points[(i+2)%points.length];
    const cross=(b.x-a.x)*(c.z-b.z)-(b.z-a.z)*(c.x-b.x);
    if(Math.abs(cross)<1e-9)continue;
    if(!sign)sign=Math.sign(cross);else if(Math.sign(cross)!==sign)return false;
  }
  return true;
}
// A manual roof's own overhang, else the building roof's (as geometry uses).
export function manualRoofOverhang(roof,buildingRoof){
  return Math.max(0,Number.isFinite(Number(roof?.overhang))?Number(roof.overhang):Number(buildingRoof?.overhang)||0);
}
export function manualRoofOutlineProblem(roof,roofs=[],buildingRoof=null){
  // Host attachment trims rectangular gable/shed/flat slabs only.
  const hosted=roofs.some(r=>r!==roof&&r?.hostRoofId!=null&&r.hostRoofId===roof?.id);
  if(roof?.type==='hip'&&roof.polygon==null){
    if(roof.hostRoofId)return 'A hip roof cannot attach to a host roof.';
    if(hosted)return 'Other roofs cannot attach to a hip roof.';
    return null;
  }
  if(roof?.polygon==null)return null;
  const problem=regionPolygonProblem(roof.polygon);
  if(problem)return problem.replace('A polygon region','A polygon roof').replace('Region corners','Roof corners').replace('Region width','Roof width');
  if(!POLYGON_ROOF_TYPES.includes(roof.type))return 'A polygon roof must be flat or hip; gable and shed roofs use rectangular footprints.';
  const isConvex=convexOutline(roof.polygon);
  if(!isConvex&&roof.type==='hip')return 'A hip roof needs a convex outline; concave outlines can be flat roofs.';
  const overhang=manualRoofOverhang(roof,buildingRoof);
  if(!isConvex&&overhang>0&&!offsetOutline(roof.polygon,overhang))return `A ${overhang} m overhang makes this concave outline cross itself; reduce the overhang.`;
  if(roof.hostRoofId)return 'A polygon roof cannot attach to a host roof.';
  if(roof.edgeModes&&Object.keys(roof.edgeModes).length)return 'A polygon roof has no edge modes; its overhang applies to every edge.';
  if(hosted)return 'Other roofs cannot attach to a polygon roof.';
  return null;
}

// Grows a simple polygon outward by distance (mitered corners); null if the
// result would cross itself.
export function offsetOutline(points,distance){
  if(!(distance>0))return points.map(p=>({x:p.x,z:p.z}));
  let signed=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];signed+=a.x*b.z-b.x*a.z;}
  const side=signed>0?1:-1,n=points.length,lines=points.map((a,i)=>{const b=points[(i+1)%n],l=Math.hypot(b.x-a.x,b.z-a.z),nx=side*(b.z-a.z)/l,nz=-side*(b.x-a.x)/l;return {nx,nz,d:nx*a.x+nz*a.z+distance};});
  const out=[];
  for(let i=0;i<n;i++){
    const p=lines[(i+n-1)%n],q=lines[i],det=p.nx*q.nz-p.nz*q.nx;
    if(Math.abs(det)<1e-9){out.push({x:points[i].x+q.nx*distance,z:points[i].z+q.nz*distance});continue;}
    out.push({x:(p.d*q.nz-p.nz*q.d)/det,z:(p.nx*q.d-p.d*q.nx)/det});
  }
  // Too large an offset at a reflex corner reverses an edge; reject that too.
  for(let i=0;i<n;i++){const a=points[i],b=points[(i+1)%n],c=out[i],d=out[(i+1)%n];if((b.x-a.x)*(d.x-c.x)+(b.z-a.z)*(d.z-c.z)<=0)return null;}
  return regionPolygonProblem(out)?null:out;
}
// Convex pieces covering a manual roof's footprint grown by overhang: the
// rectangle, the convex polygon, or a concave polygon split into convex
// parts. Polygon subtraction and roof solids need convex pieces.
export function roofFootprintAreas(roof,overhang=0){
  const o=Math.max(0,Number(overhang)||0);
  if(!roof.polygon)return [{minX:roof.minX-o,maxX:roof.maxX+o,minZ:roof.minZ-o,maxZ:roof.maxZ+o}];
  if(convexOutline(roof.polygon))return [o>0?offsetConvexArea(roof,o):polygonArea(roof.polygon.map(p=>({x:p.x,z:p.z})))].filter(Boolean);
  const grown=offsetOutline(roof.polygon,o);if(!grown)return [];
  return mergeConvexAreas(regionAreaCells({polygon:grown,...regionBounds(grown)}));
}
