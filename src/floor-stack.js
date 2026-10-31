import {makeFloor,uid,floorElevation,floorWallHeight,floorSlabThickness,structuralEditImpact} from './model.js';
import {validateBuilding} from './validation.js';

function duplicateFloor(source,label){
  const copy=structuredClone(source),wallMap=new Map();copy.id=uid('floor');copy.label=label;delete copy.elevation;
  for(const wall of copy.walls){const id=uid('wall');wallMap.set(wall.id,id);wall.id=id;}
  for(const opening of copy.openings){opening.id=uid(opening.type);opening.wallId=wallMap.get(opening.wallId);}
  for(const key of ['lights','markers','regions','slabs','platforms','railings'])for(const entity of copy[key]||[])entity.id=uid(key.slice(0,-1));
  copy.stairs=[];copy.roofSections=[];return copy;
}

// After a wall-height or slab change (floor or building defaults; not an
// elevation edit), floors that touched before keep touching. Touching floors
// form a chain; its highest floor with an explicit elevation stays put (a
// basement insertion pins the old ground floor), floors below it move to keep
// meeting the floor above, and floors above follow. A chain with no explicit
// elevation keeps its bottom in place, as automatic spacing always did.
// Edits `after` in place; `before` is the building before the change.
export function keepFloorContacts(before,after){
  const n=after.floors.length;if(n!==before.floors.length||n<2)return after;
  const old=before.floors.map((_,i)=>floorElevation(before,i)),spacing=(b,j)=>floorWallHeight(b,j-1)+floorSlabThickness(b,j);
  const touching=j=>Math.abs(old[j]-old[j-1]-spacing(before,j))<1e-6;
  const pinned=j=>Number.isFinite(after.floors[j].elevation),target=old.slice();
  for(let start=0;start<n;){
    let end=start;while(end+1<n&&touching(end+1))end++;
    let anchor=start;for(let j=start;j<=end;j++)if(pinned(j))anchor=j;
    for(let j=anchor-1;j>=start;j--)target[j]=target[j+1]-spacing(after,j+1);
    for(let j=anchor+1;j<=end;j++)target[j]=target[j-1]+spacing(after,j);
    start=end+1;
  }
  // Explicit elevations take their new level; an automatic ground floor that
  // has to move gets one. Other automatic floors already follow the floor below.
  const round=v=>Math.round(v*1e9)/1e9;
  after.floors.forEach((f,j)=>{if(pinned(j)||(j===0&&Math.abs(target[0]-old[0])>1e-9))f.elevation=round(target[j]);});
  return after;
}

// Floors carry their authored contents and dimensions. Independent surfaces do
// not have inferred floor ownership. Candidate edits never mutate the source.
// fields: initial settings for an added floor (the CLI's floor.insert value),
// applied before the stack is spaced so its wall height and slab count.
export function proposeFloorStackEdit(source,index,action,{removeAffectedStairs=false,validateResult=true,fields={}}={}){
  const reject=reason=>({ok:false,reason});
  if(!Number.isInteger(index)||!source.floors?.[index])return reject('Choose an existing floor');
  if(!['above','below','duplicate','up','down','remove'].includes(action))return reject('Unknown floor operation');
  const n=source.floors.length;
  if(action==='remove'&&n===1)return reject('Keep at least one floor');
  if(action==='up'&&index===n-1||action==='down'&&index===0)return reject('This floor is already at the end of the stack');
  const building=structuredClone(source),floors=building.floors;
  const heights=source.floors.map((_,i)=>floorElevation(source,i));
  let activeIndex=index;
  if(['above','below','duplicate'].includes(action)){
    const at=index+(action==='below'?0:1),label=action==='duplicate'?`${floors[index].label} copy`:at===0?'Basement':`New floor ${n+1}`;
    const added=action==='duplicate'?duplicateFloor(floors[index],label):makeFloor(label);
    for(const [key,value] of Object.entries(fields||{}))if(value!==null&&key!=='elevation')added[key]=value;
    const height=added.wallHeight??building.wallHeight,slab=added.floorThickness??building.floorThickness;
    if(at===0){added.elevation=heights[0]-height-floorSlabThickness(source,0);floors[0].elevation=heights[0];}
    else for(let i=at;i<n;i++)if(Number.isFinite(floors[i].elevation))floors[i].elevation+=height+slab;
    floors.splice(at,0,added);activeIndex=at;
  }else if(action==='up'||action==='down'){
    const target=index+(action==='up'?1:-1);[floors[index],floors[target]]=[floors[target],floors[index]];activeIndex=target;
    // Preserve vertical gaps/overlaps at their level slots, including explicit
    // anchors, without freezing automatic levels into absolute overrides.
    let elevation=heights[0];
    for(let i=0;i<n;i++){
      if(i>0){const gap=heights[i]-heights[i-1]-floorWallHeight(source,i-1)-floorSlabThickness(source,i);elevation+=floorWallHeight(building,i-1)+floorSlabThickness(building,i)+gap;}
      if(Number.isFinite(source.floors[i].elevation))floors[i].elevation=elevation;else delete floors[i].elevation;
    }
  }else{
    const distance=floorWallHeight(source,index)+floorSlabThickness(source,index);
    const gone=floors[index].id;
    floors.splice(index,1);activeIndex=Math.min(index,floors.length-1);
    // A lift has no stop on a floor it skips, so the floor leaves the skip list with it.
    for(const e of building.elevators||[])if(Array.isArray(e.skipFloorIds)&&e.skipFloorIds.includes(gone)){e.skipFloorIds=e.skipFloorIds.filter(id=>id!==gone);if(!e.skipFloorIds.length)delete e.skipFloorIds;}
    if(index===0)floors[0].elevation=heights[1];
    else for(let i=index;i<floors.length;i++)if(Number.isFinite(floors[i].elevation))floors[i].elevation-=distance;
  }
  // Shifted explicit elevations are rounded like other edits (no 6.540000000000001).
  for(const f of floors)if(Number.isFinite(f.elevation))f.elevation=Math.round(f.elevation*1e9)/1e9;
  const afterNext=new Map(floors.map((f,i)=>[f.id,floors[i+1]?.id??null]));
  const affected=[];
  for(let i=0;i<n;i++){
    const f=source.floors[i],oldNext=source.floors[i+1]?.id??null;
    if(!afterNext.has(f.id)||afterNext.get(f.id)===oldNext)continue;
    // An orphan on the former top floor can acquire a newly added upper floor.
    if(oldNext===null&&['above','below','duplicate'].includes(action))continue;
    for(const stair of f.stairs||[])affected.push({floorId:f.id,floorLabel:f.label,id:stair.id,label:stair.label||stair.id});
  }
  if(affected.length&&!removeAffectedStairs)return {ok:false,reason:`${affected.length} stair connection(s) would change: ${affected.map(s=>`${s.floorLabel} / ${s.label}`).join(', ')}. Enable Remove affected stairs to continue, or edit those stairs first.`,affectedStairs:affected};
  const removedIds=new Set(affected.map(s=>s.floorId+':'+s.id));
  for(const f of floors)f.stairs=f.stairs.filter(s=>!removedIds.has(f.id+':'+s.id));
  // CLI transactions validate the complete final candidate after later edits
  // have authored the new floor. Web callers retain immediate validation.
  const validation=validateResult?validateBuilding(building):{errors:[],warnings:[]};if(validation.errors.length)return reject(validation.errors[0].message);
  return {ok:true,building,activeIndex,affectedStairs:affected,independentSurfaces:structuralEditImpact(source),warnings:validation.warnings};
}
