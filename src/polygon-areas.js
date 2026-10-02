// Internal coverage cells are convex polygons with rectangular bounds. Authored
// rectangle JSON remains unchanged; polygon cells are derived from wall loops.
const EPS=1e-7;
export const areaPoints=r=>r.polygon||[{x:r.minX,z:r.minZ},{x:r.maxX,z:r.minZ},{x:r.maxX,z:r.maxZ},{x:r.minX,z:r.maxZ}];
export const signedArea=p=>p.reduce((n,a,i)=>{const b=p[(i+1)%p.length];return n+a.x*b.z-b.x*a.z;},0)/2;
export const areaSize=r=>Math.abs(signedArea(areaPoints(r)));
const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
export function cleanPolygon(points){
  let p=points.map(q=>({x:q.x,z:q.z}));
  for(let i=p.length-1;i>=0&&p.length>=3;i--)if(Math.abs(cross(p[(i+p.length-1)%p.length],p[i],p[(i+1)%p.length]))<EPS)p.splice(i,1);
  if(p.length<3||Math.abs(signedArea(p))<EPS)return [];
  if(signedArea(p)<0)p.reverse();return p;
}
export function polygonArea(points){
  const polygon=cleanPolygon(points);if(!polygon.length)return null;
  return {minX:Math.min(...polygon.map(p=>p.x)),maxX:Math.max(...polygon.map(p=>p.x)),minZ:Math.min(...polygon.map(p=>p.z)),maxZ:Math.max(...polygon.map(p=>p.z)),polygon};
}
export function containsArea(r,p,tolerance=EPS){
  const points=areaPoints(r);return points.every((a,i)=>cross(a,points[(i+1)%points.length],p)>=-tolerance*Math.hypot(points[(i+1)%points.length].x-a.x,points[(i+1)%points.length].z-a.z));
}
// Keep n dot p <= d. Every cell stays convex, including cuts through corners.
export function clipPolygon(points,n,d){
  const out=[];
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],da=n.x*a.x+n.z*a.z-d,db=n.x*b.x+n.z*b.z-d;
    if(da<=EPS)out.push(a);
    if((da>EPS)!==(db>EPS)){const t=da/(da-db);out.push({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});}
  }
  return cleanPolygon(out);
}
export function edgePlanes(points){return points.map((a,i)=>{const b=points[(i+1)%points.length],l=Math.hypot(b.x-a.x,b.z-a.z),n={x:(b.z-a.z)/l,z:(a.x-b.x)/l};return {n,d:n.x*a.x+n.z*a.z};});}
export function subtractPolygon(base,blocker){
  if(Math.min(base.maxX,blocker.maxX)-Math.max(base.minX,blocker.minX)<=EPS||Math.min(base.maxZ,blocker.maxZ)-Math.max(base.minZ,blocker.minZ)<=EPS)return [base];
  let remaining=areaPoints(base);const out=[];
  for(const {n,d} of edgePlanes(areaPoints(blocker))){
    const outside=polygonArea(clipPolygon(remaining,{x:-n.x,z:-n.z},-d));if(outside)out.push(outside);
    remaining=clipPolygon(remaining,n,d);if(!remaining.length)break;
  }
  return out;
}
export function subtractPolygonAreas(bases,blockers){
  let out=bases;for(const b of blockers)out=out.flatMap(a=>subtractPolygon(a,b));return out;
}
export function unionPolygonAreas(areas){
  const out=[];for(const r of areas){const a=polygonArea(areaPoints(r));if(a)out.push(...subtractPolygonAreas([a],out));}return out;
}
function hull(points){
  const sorted=[...new Map(points.map(p=>[`${p.x}:${p.z}`,p])).values()].sort((a,b)=>a.x-b.x||a.z-b.z);
  const half=list=>{const out=[];for(const p of list){while(out.length>1&&cross(out.at(-2),out.at(-1),p)<=EPS)out.pop();out.push(p);}return out;};
  return cleanPolygon([...half(sorted).slice(0,-1),...half([...sorted].reverse()).slice(0,-1)]);
}
export function mergeConvexAreas(areas){
  const out=unionPolygonAreas(areas);
  // Two cells whose bounds are apart cannot form a convex union, and a pair
  // already rejected stays rejected until one cell changes; skipping both
  // keeps many-cornered outlines from taking seconds.
  const apart=(r,q)=>r.minX>q.maxX+1e-3||q.minX>r.maxX+1e-3||r.minZ>q.maxZ+1e-3||q.minZ>r.maxZ+1e-3;
  const rejected=new WeakMap();
  for(let i=0;i<out.length;i++)for(let j=i+1;j<out.length;j++){
    if(apart(out[i],out[j])||rejected.get(out[i])?.has(out[j]))continue;
    const h=polygonArea(hull([...areaPoints(out[i]),...areaPoints(out[j])]));
    if(h&&Math.abs(areaSize(h)-areaSize(out[i])-areaSize(out[j]))<EPS){out[i]=h;out.splice(j,1);i=-1;break;}
    if(!rejected.has(out[i]))rejected.set(out[i],new Set());rejected.get(out[i]).add(out[j]);
  }
  return out;
}
// Even/odd scan bands support concave outlines, disconnected buildings and
// enclosed courtyards. Validated non-crossing wall edges bound trapezoids.
export function wallPolygonAreas(walls){
  const zs=[...new Set(walls.flatMap(w=>[w.a.z,w.b.z]))].sort((a,b)=>a-b),out=[];
  const xAt=(w,z)=>w.a.x+(z-w.a.z)*(w.b.x-w.a.x)/(w.b.z-w.a.z);
  for(let i=0;i<zs.length-1;i++){
    const z0=zs[i],z1=zs[i+1],mid=(z0+z1)/2;
    const edges=walls.filter(w=>Math.min(w.a.z,w.b.z)<mid&&Math.max(w.a.z,w.b.z)>mid).sort((a,b)=>xAt(a,mid)-xAt(b,mid));
    for(let j=0;j<edges.length;j+=2){const l=edges[j],r=edges[j+1];if(!r)continue;const a=polygonArea([{x:xAt(l,z0),z:z0},{x:xAt(r,z0),z:z0},{x:xAt(r,z1),z:z1},{x:xAt(l,z1),z:z1}]);if(a)out.push(a);}
  }
  return mergeConvexAreas(out);
}
// Only exposed segments; cancel shared partial edges after boolean cuts.
export function polygonBoundary(areas){
  const out=[];
  for(const [i,r] of areas.entries())for(const [k,a] of areaPoints(r).entries()){
    const b=areaPoints(r)[(k+1)%areaPoints(r).length],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);let spans=[[0,1]];
    for(const [j,s] of areas.entries())if(i!==j)for(const [n,c] of areaPoints(s).entries()){
      const d=areaPoints(s)[(n+1)%areaPoints(s).length];
      if(Math.abs(cross(a,b,c))>EPS*len||Math.abs(cross(a,b,d))>EPS*len||dx*(d.x-c.x)+dz*(d.z-c.z)>=0)continue;
      const t=p=>((p.x-a.x)*dx+(p.z-a.z)*dz)/(len*len),lo=Math.min(t(c),t(d)),hi=Math.max(t(c),t(d));
      spans=spans.flatMap(([l,h])=>hi<=l||lo>=h?[[l,h]]:[[l,Math.min(h,lo)],[Math.max(l,hi),h]].filter(([u,v])=>v-u>EPS));
    }
    for(const [lo,hi] of spans)out.push({a:{x:a.x+dx*lo,z:a.z+dz*lo},b:{x:a.x+dx*hi,z:a.z+dz*hi}});
  }
  return out;
}
