import { rectValid } from './model.js';

// Shared by explicit platform edits in the web editor and CLI. Never mutate a
// live entity before validating: normalization discards invalid rectangles.
export function proposePlatformUpdate(platform,patch){
  const next={...platform,...patch};
  if(Object.hasOwn(patch,'kind')&&!Object.hasOwn(patch,'covered'))next.covered=patch.kind==='porch';
  if(typeof next.label!=='string'||!next.label.trim()||next.label.length>1024)return {ok:false,reason:'Platform name must be nonempty text of at most 1024 characters'};
  if(!['porch','deck'].includes(next.kind))return {ok:false,reason:'Platform kind must be porch or deck'};
  if(typeof next.covered!=='boolean')return {ok:false,reason:'Platform roof coverage must be boolean'};
  for(const key of ['minX','maxX','minZ','maxZ','height']){
    const limit=key==='height'?10000:1e6;
    if(typeof next[key]!=='number'||!Number.isFinite(next[key])||Math.abs(next[key])>limit)return {ok:false,reason:`Platform ${key} must be a finite number within ±${limit} m`};
  }
  if(!rectValid(next))return {ok:false,reason:'Platform width and depth must each be at least 0.1 m'};
  return {ok:true,platform:next};
}

// Screen-space magnet snapping. No authored walls are split or re-ID'd.
const EPS = 1e-5;
export const samePoint = (a,b) => !!a && !!b && Math.hypot(a.x-b.x,a.z-b.z)<EPS;
function projection(p,w) {
  const dx=w.b.x-w.a.x,dz=w.b.z-w.a.z,L2=dx*dx+dz*dz;
  const t=L2?Math.max(0,Math.min(1,((p.x-w.a.x)*dx+(p.z-w.a.z)*dz)/L2)):0;
  return {point:{x:w.a.x+t*dx,z:w.a.z+t*dz},t};
}
export function snapPlanPoint(p,walls=[],{enabled=true,grid=.5,scale=55,radius=10,bypass=false,origin=null,segments=0,start=null,excludedEndpoints=[],excludedProjections=[]}={}) {
  if(!enabled||bypass)return {point:{...p},kind:'free'};
  const distance=q=>Math.hypot(p.x-q.x,p.z-q.z)*scale;
  if(origin&&segments>=2&&!samePoint(start,origin)&&distance(origin)<=radius)
    return {point:{...origin},kind:'close'};
  let best=null;
  // Endpoints take priority over wall projections, and both beat the grid.
  for(const w of walls)for(const end of ['a','b']) {
    if(excludedEndpoints.some(t=>t.wallId===w.id&&t.end===end))continue;
    const point=w[end],d=distance(point);
    if(d<=radius&&(!best||d<best.d))best={point:{...point},kind:'endpoint',wallId:w.id,end,d};
  }
  if(best)return best;
  for(const w of walls) {
    if(excludedProjections.includes(w.id))continue;
    const hit=projection(p,w),d=distance(hit.point);
    if(hit.t>EPS&&hit.t<1-EPS&&d<=radius&&(!best||d<best.d))
      best={point:hit.point,kind:'wall',wallId:w.id,d};
  }
  if(best)return best;
  const g=Number.isFinite(grid)&&grid>0?grid:.5;
  return {point:{x:Math.round(p.x/g)*g,z:Math.round(p.z/g)*g},kind:'grid'};
}
export function wallSegmentProblem(a,b,walls=[]) {
  if(Math.hypot(b.x-a.x,b.z-a.z)<=.15)return 'Choose an endpoint more than 0.15 m away';
  const dx=b.x-a.x,dz=b.z-a.z,L=Math.hypot(dx,dz);
  for(const w of walls) {
    const cross=p=>dx*(p.z-a.z)-dz*(p.x-a.x);
    if(Math.abs(cross(w.a))>EPS*L||Math.abs(cross(w.b))>EPS*L)continue;
    const along=p=>((p.x-a.x)*dx+(p.z-a.z)*dz)/L;
    if(Math.min(L,Math.max(along(w.a),along(w.b)))-Math.max(0,Math.min(along(w.a),along(w.b)))>EPS)
      return 'This segment overlaps an existing wall';
  }
  return null;
}
export function wallJunctions(walls=[]) {
  const points=[];
  for(const w of walls)for(const point of [w.a,w.b])
    if(!points.some(p=>samePoint(p.point,point)))points.push({point:{...point}});
  for(let i=0;i<walls.length;i++)for(let j=i+1;j<walls.length;j++){
    const a=walls[i],b=walls[j],dx=a.b.x-a.a.x,dz=a.b.z-a.a.z,ex=b.b.x-b.a.x,ez=b.b.z-b.a.z;
    const cross=dx*ez-dz*ex;if(Math.abs(cross)<EPS)continue;
    const qx=b.a.x-a.a.x,qz=b.a.z-a.a.z,t=(qx*ez-qz*ex)/cross,u=(qx*dz-qz*dx)/cross;
    if(t<=0||t>=1||u<=0||u>=1)continue;
    const point={x:a.a.x+t*dx,z:a.a.z+t*dz};
    if(!points.some(p=>samePoint(p.point,point)))points.push({point});
  }
  return points.map(({point})=>{
    let degree=0;
    for(const w of walls) {
      const hit=projection(point,w);
      if(!samePoint(point,hit.point))continue;
      degree+=samePoint(point,w.a)||samePoint(point,w.b)?1:2;
    }
    return {point,degree,kind:degree===1?'open':degree===2?'joined':'junction'};
  });
}
