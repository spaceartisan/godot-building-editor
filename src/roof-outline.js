import { regionPolygonProblem, regionBounds } from './regions.js';

// Manual roof footprints: a rectangle (minX..maxZ), or a convex polygon for
// flat and hip roofs. Shared by validation, transactions and the web roof panel.
export const MANUAL_ROOF_TYPES=['gable','shed','flat','hip'];
export const POLYGON_ROOF_TYPES=['flat','hip'];
export const roofPolygonBounds=regionBounds;
function convex(points){
  let sign=0;
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],c=points[(i+2)%points.length];
    const cross=(b.x-a.x)*(c.z-b.z)-(b.z-a.z)*(c.x-b.x);
    if(Math.abs(cross)<1e-9)continue;
    if(!sign)sign=Math.sign(cross);else if(Math.sign(cross)!==sign)return false;
  }
  return true;
}
export function manualRoofOutlineProblem(roof,roofs=[]){
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
  if(!convex(roof.polygon))return 'A polygon roof must be convex; split a concave outline into several roofs.';
  if(!POLYGON_ROOF_TYPES.includes(roof.type))return 'A polygon roof must be flat or hip; gable and shed roofs use rectangular footprints.';
  if(roof.hostRoofId)return 'A polygon roof cannot attach to a host roof.';
  if(roof.edgeModes&&Object.keys(roof.edgeModes).length)return 'A polygon roof has no edge modes; its overhang applies to every edge.';
  if(hosted)return 'Other roofs cannot attach to a polygon roof.';
  return null;
}
