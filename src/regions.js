import {areaPoints,areaSize,wallPolygonAreas} from './polygon-areas.js';
const EPS=1e-7;
const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
export function regionBounds(points){return {minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minZ:Math.min(...points.map(p=>p.z)),maxZ:Math.max(...points.map(p=>p.z))};}
export function regionPolygonProblem(points){
  if(!Array.isArray(points)||points.length<3||points.length>256)return 'A polygon region needs 3–256 corners.';
  if(points.some(p=>!p||typeof p!=='object'||!['x','z'].every(k=>typeof p[k]==='number'&&Number.isFinite(p[k])&&Math.abs(p[k])<=1e6)))return 'Region corners need finite X/Z coordinates within ±1,000,000 m.';
  for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++)if(Math.hypot(points[i].x-points[j].x,points[i].z-points[j].z)<.001)return 'Region corners must be distinct; do not repeat the first corner at the end.';
  const on=(a,b,p)=>Math.abs(cross(a,b,p))<EPS&&p.x>=Math.min(a.x,b.x)-EPS&&p.x<=Math.max(a.x,b.x)+EPS&&p.z>=Math.min(a.z,b.z)-EPS&&p.z<=Math.max(a.z,b.z)+EPS;
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],previous=points[(i+points.length-1)%points.length];
    if(Math.abs(cross(previous,a,b))<EPS&&(previous.x-a.x)*(b.x-a.x)+(previous.z-a.z)*(b.z-a.z)>0)return 'Region edges cannot double back or overlap.';
    for(let j=i+1;j<points.length;j++){
      if(j===i+1||i===0&&j===points.length-1)continue;
      const c=points[j],d=points[(j+1)%points.length],u=cross(a,b,c),v=cross(a,b,d),s=cross(c,d,a),t=cross(c,d,b);
      if(u*v<0&&s*t<0||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b))return 'Region edges cannot cross, overlap or touch away from adjacent corners.';
    }
  }
  if(areaSize({polygon:points})<.01)return 'Region area must be at least 0.01 m².';
  const bounds=regionBounds(points);if(bounds.maxX-bounds.minX<.1||bounds.maxZ-bounds.minZ<.1)return 'Region width and depth must each be at least 0.1 m.';
  return null;
}
export function polygonRegion(points,metadata={}){
  const problem=regionPolygonProblem(points);if(problem)throw new Error(problem);
  return {...metadata,...regionBounds(points),polygon:points.map(p=>({x:p.x,z:p.z}))};
}
// Keyed by corner coordinates, so an edited polygon never reuses stale cells;
// callers get copies. One export asks for the same region's cells many times.
const cellCache=new Map();
export function regionAreaCells(region){
  if(!region.polygon)return [region];
  const key=region.polygon.map(p=>`${p.x},${p.z}`).join(';');
  let cells=cellCache.get(key);
  if(!cells){
    cells=wallPolygonAreas(region.polygon.map((a,i)=>({a,b:region.polygon[(i+1)%region.polygon.length]})));
    if(cellCache.size>=256)cellCache.delete(cellCache.keys().next().value);
    cellCache.set(key,cells);
  }
  return cells.map(c=>({...c,polygon:c.polygon.map(p=>({...p}))}));
}
export function pointInRegion(region,p){
  const points=areaPoints(region);let inside=false;
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],length=Math.hypot(b.x-a.x,b.z-a.z);
    if(Math.abs(cross(a,b,p))<EPS*length&&(p.x-a.x)*(p.x-b.x)+(p.z-a.z)*(p.z-b.z)<=EPS)return true;
    if((a.z>p.z)!==(b.z>p.z)&&a.x+(p.z-a.z)*(b.x-a.x)/(b.z-a.z)>p.x)inside=!inside;
  }
  return inside;
}
export function regionInteriorClearance(region,p){
  return Math.min(...areaPoints(region).map((a,i)=>{const b=areaPoints(region)[(i+1)%areaPoints(region).length],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz)));return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);}));
}
export function regionLabelPoint(region){
  const center={x:(region.minX+region.maxX)/2,z:(region.minZ+region.maxZ)/2};if(pointInRegion(region,center)&&regionInteriorClearance(region,center)>.01)return center;
  const largest=regionAreaCells(region).sort((a,b)=>areaSize(b)-areaSize(a))[0],points=areaPoints(largest);
  return points.reduce((p,q)=>({x:p.x+q.x/points.length,z:p.z+q.z/points.length}),{x:0,z:0});
}
export function wallOutlinePoints(walls){
  const near=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)<1e-5;
  if(walls.length<3)throw new Error('Use a single closed exterior wall loop.');
  const unused=new Set(walls),first=walls[0],points=[first.a];let next=first.b;unused.delete(first);
  while(!near(next,points[0])){
    points.push(next);const candidates=[...unused].filter(w=>near(w.a,next)||near(w.b,next));
    if(candidates.length!==1)throw new Error('The exterior outline must be closed and unbranched.');
    const wall=candidates[0];unused.delete(wall);next=near(wall.a,next)?wall.b:wall.a;
  }
  if(unused.size)throw new Error('More than one exterior loop found. Draw separate polygon regions for each outline.');
  const problem=regionPolygonProblem(points);if(problem)throw new Error(problem);
  return points.map(p=>({...p}));
}
