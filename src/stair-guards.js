import { floorView, stairOpeningFootprint, wallLength } from './model.js';

// Railings around the opening a stair cuts in the floor above: both long
// sides and the entry end, on the model's opening footprint (0.06 m outside
// the flight, flush at the top landing, which stays open). Sides already
// closed by a wall or railing along them are skipped. Shared by the web
// stair panel's Guard opening and the stair.guard transaction.
export const GUARD_DEFAULTS={height:1.0,style:'two_rail'};
const SIDE_NAMES={minX:'west',maxX:'east',minZ:'north',maxZ:'south'};
function closedBy(segment,lines,reach){
  const len=Math.hypot(segment.b.x-segment.a.x,segment.b.z-segment.a.z),d={x:(segment.b.x-segment.a.x)/len,z:(segment.b.z-segment.a.z)/len};
  return lines.some(l=>{
    const ll=Math.hypot(l.b.x-l.a.x,l.b.z-l.a.z);if(ll<1e-6)return false;
    if(Math.abs(((l.b.x-l.a.x)*d.z-(l.b.z-l.a.z)*d.x)/ll)>1e-3)return false; // not parallel
    const off=Math.abs((l.a.x-segment.a.x)*d.z-(l.a.z-segment.a.z)*d.x);if(off>reach)return false;
    const t=p=>(p.x-segment.a.x)*d.x+(p.z-segment.a.z)*d.z,lo=Math.max(0,Math.min(t(l.a),t(l.b))),hi=Math.min(len,Math.max(t(l.a),t(l.b)));
    return hi-lo>=.8*len;
  });
}
export function stairGuardRailings(building,floorIndex,stairId,{idPrefix,height=GUARD_DEFAULTS.height,style=GUARD_DEFAULTS.style,label}={}){
  const floor=building.floors?.[floorIndex],upper=building.floors?.[floorIndex+1];
  const stair=floor?.stairs?.find(s=>s.id===stairId);
  if(!stair)return {ok:false,reason:`Unknown stair: ${stairId}`};
  if(!upper)return {ok:false,reason:'The stair has no floor above to guard'};
  if(!Number.isFinite(height)||height<.4)return {ok:false,reason:'Guard height must be at least 0.4 m'};
  if(!['two_rail','picket','cross_brace'].includes(style))return {ok:false,reason:'Guard style must be two_rail, picket or cross_brace'};
  const r=stairOpeningFootprint(stair),top={north:'minZ',south:'maxZ',east:'maxX',west:'minX'}[stair.direction]||'minZ';
  const sides={minX:{a:{x:r.minX,z:r.minZ},b:{x:r.minX,z:r.maxZ}},maxX:{a:{x:r.maxX,z:r.minZ},b:{x:r.maxX,z:r.maxZ}},minZ:{a:{x:r.minX,z:r.minZ},b:{x:r.maxX,z:r.minZ}},maxZ:{a:{x:r.minX,z:r.maxZ},b:{x:r.maxX,z:r.maxZ}}};
  const upperView=floorView(building,upper,floorIndex+1===building.floors.length-1),walls=(upper.walls||[]).filter(w=>wallLength(w)>1e-6);
  const wallReach=(Number(upperView.wallThickness)||.18)/2+.25;
  const prefix=idPrefix||`${stair.id}-guard`,base=label||`${stair.label||'Stair'} guard`,railings=[],skipped=[];
  for(const key of ['minX','maxX','minZ','maxZ']){
    if(key===top)continue;
    const seg=sides[key];
    if(closedBy(seg,walls,wallReach)){skipped.push({side:SIDE_NAMES[key],by:'wall'});continue;}
    if(closedBy(seg,upper.railings||[],.05)){skipped.push({side:SIDE_NAMES[key],by:'railing'});continue;}
    railings.push({id:`${prefix}-${SIDE_NAMES[key]}`,label:`${base} ${SIDE_NAMES[key]}`,a:{...seg.a},b:{...seg.b},height,style});
  }
  const taken=new Set(['walls','openings','lights','markers','stairs','regions','slabs','platforms','railings'].flatMap(k=>(upper[k]||[]).map(o=>o.id)));
  const clash=railings.find(q=>taken.has(q.id));
  if(clash)return {ok:false,reason:`ID already exists on ${upper.id}: ${clash.id}`};
  return {ok:true,floorId:upper.id,railings,skipped};
}
