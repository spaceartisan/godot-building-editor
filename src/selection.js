import { pointInRegion } from './regions.js';
import { rectValid, stairFootprint } from './model.js';

const order={roofSection:0,platform:1,manualCeiling:2,manualFloor:3,slab:4,region:5};
const stable=(a,b)=>String(a.id)<String(b.id)?-1:String(a.id)>String(b.id)?1:0;

export function rectanglePick(r,p,scale,tolerance=8){
  if(!rectValid(r))return null;
  if(r.polygon){
    const edge=Math.min(...r.polygon.map((a,i)=>{const b=r.polygon[(i+1)%r.polygon.length],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz)));return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz)*scale;}));
    const inside=pointInRegion(r,p);return !inside&&edge>tolerance?null:{distance:inside?0:edge,edge,onEdge:edge<=tolerance};
  }
  const dx=Math.max(r.minX-p.x,0,p.x-r.maxX),dz=Math.max(r.minZ-p.z,0,p.z-r.maxZ);
  const distance=Math.hypot(dx,dz)*scale;
  if(distance>tolerance)return null;
  const edge=distance>0?distance:Math.min(p.x-r.minX,r.maxX-p.x,p.z-r.minZ,r.maxZ-p.z)*scale;
  return {distance,edge,onEdge:edge<=tolerance};
}

// Include every hit, including several roofs/platforms of the same type.
// A nearby visible edge beats filled interiors. Otherwise prefer surfaces
// at the active story, followed by a stable architectural type order.
export function areaSelectionCandidates(groups,p,scale,levels={}){
  const candidates=[];
  for(const [type,list] of groups)for(const entity of list||[]){
    const hit=rectanglePick(entity,p,scale);if(!hit)continue;
    const y=type==='roofSection'?entity.baseY:entity.topY,target=levels[type];
    const offLevel=Number.isFinite(target)&&Number.isFinite(y)&&Math.abs(y-target)>(levels.tolerance??.1)?1:0;
    candidates.push({type,id:entity.id,entity,...hit,offLevel});
  }
  return candidates.sort((a,b)=>Number(b.onEdge)-Number(a.onEdge)||(a.onEdge?a.edge-b.edge:0)||a.offLevel-b.offLevel||(order[a.type]-order[b.type])||stable(a,b));
}

export function stairPickDistance(stair,p,scale){
  if(!rectanglePick(stairFootprint(stair,0),p,scale,8))return null;
  const h=stairFootprint(stair,0),cx=(h.minX+h.maxX)/2,cz=(h.minZ+h.maxZ)/2;
  // Distance to the entire run centerline, including its two endpoints.
  // Center-point distance favors a short overlapping flight unfairly.
  const alongX=stair.direction==='east'||stair.direction==='west';
  return Math.hypot(alongX?Math.max(h.minX-p.x,0,p.x-h.maxX):p.x-cx,alongX?p.z-cz:Math.max(h.minZ-p.z,0,p.z-h.maxZ))*scale;
}
