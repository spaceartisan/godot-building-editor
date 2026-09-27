import {makeFloor,uid,floorElevation,floorWallHeight,floorSlabThickness,structuralEditImpact} from './model.js';
import {validateBuilding} from './validation.js';

function duplicateFloor(source,label){
  const copy=structuredClone(source),wallMap=new Map();copy.id=uid('floor');copy.label=label;delete copy.elevation;
  for(const wall of copy.walls){const id=uid('wall');wallMap.set(wall.id,id);wall.id=id;}
  for(const opening of copy.openings){opening.id=uid(opening.type);opening.wallId=wallMap.get(opening.wallId);}
  for(const key of ['lights','markers','regions','slabs','platforms','railings'])for(const entity of copy[key]||[])entity.id=uid(key.slice(0,-1));
  copy.stairs=[];copy.roofSections=[];return copy;
}

// Floors carry their authored contents and dimensions. Independent surfaces do
// not have inferred floor ownership. Candidate edits never mutate the source.
export function proposeFloorStackEdit(source,index,action,{removeAffectedStairs=false,validateResult=true}={}){
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
    floors.splice(index,1);activeIndex=Math.min(index,floors.length-1);
    if(index===0)floors[0].elevation=heights[1];
    else for(let i=index;i<floors.length;i++)if(Number.isFinite(floors[i].elevation))floors[i].elevation-=distance;
  }
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
