// Navigation uses structured scope/IDs and exact validator paths, never names
// extracted from human-readable messages. Resolve again when a button is used.
const local={walls:'wall',openings:'opening',stairs:'stair',lights:'light',markers:'marker',slabs:'slab',regions:'region',platforms:'platform',railings:'railing'};
const global={roofSections:'roofSection',manualFloors:'manualFloor',manualCeilings:'manualCeiling'};
const names={wall:'wall',opening:'opening',stair:'stair',light:'light',marker:'marker',slab:'footprint',region:'region',platform:'platform',railing:'railing',roofSection:'roof',manualFloor:'manual floor',manualCeiling:'manual ceiling'};
const unique=(list,id)=>{const matches=(Array.isArray(list)?list:[]).filter(x=>x&&typeof id==='string'&&id&&x.id===id);return matches.length===1?matches[0]:null;};

export function resolveDiagnosticTarget(building,target){
  if(!target||typeof target!=='object')return null;
  const floor=target.floorId?unique(building.floors,target.floorId):null;
  if(target.type==='floor')return floor?{type:'floor',floorId:floor.id,label:`Show floor · ${floor.label||floor.id}`} :null;
  const collection=Object.keys(target.floorId?local:global).find(k=>(target.floorId?local:global)[k]===target.type);
  if(!collection||target.floorId&&!floor)return null;
  const entity=unique((floor||building)[collection],target.id);if(!entity)return null;
  return {type:target.type,id:entity.id,...(floor?{floorId:floor.id}:{}),label:`Show ${names[target.type]} · ${entity.label||entity.id}${floor?' — '+(floor.label||floor.id):''}`};
}

export function diagnosticTargets(building,issue){
  let candidates=[];
  if(Array.isArray(issue.targets))candidates=issue.targets;
  else {
    const path=typeof issue.path==='string'?issue.path:'',floorMatch=/^Floor ([1-9]\d*)(?:\.|$)/.exec(path);
    if(floorMatch){
      const floor=building.floors?.[Number(floorMatch[1])-1];
      if(floor){
        const entityMatch=/^Floor [1-9]\d*\.([A-Za-z]+)\[(\d+)\](?:\.|$)/.exec(path),type=entityMatch&&local[entityMatch[1]],entity=type&&floor[entityMatch[1]]?.[Number(entityMatch[2])];
        candidates=[type&&entity?{type,id:entity.id,floorId:floor.id}:{type:'floor',floorId:floor.id}];
      }
    }else{
      const match=/^building\.(roofSections|manualFloors|manualCeilings)\[(\d+)\](?:\.|$)/.exec(path);
      if(match){const entity=building[match[1]]?.[Number(match[2])];if(entity)candidates.push({type:global[match[1]],id:entity.id});}
    }
    if(issue.code?.startsWith('roof-attachment-')&&issue.hostRoofId)candidates.push({type:'roofSection',id:issue.hostRoofId});
  }
  const seen=new Set();
  return candidates.map(t=>resolveDiagnosticTarget(building,t)).filter(t=>{if(!t)return false;const key=JSON.stringify([t.floorId,t.type,t.id]);if(seen.has(key))return false;seen.add(key);return true;});
}
