import { regionPolygonProblem, regionBounds } from './regions.js';
import { prepareDocument, resolvedFloorDimensions, inspectStair, inspectPlatform, inspectFloorCoverage } from './diagnostics.js';
import { validateBuilding } from './validation.js';
import { floorView, makeRegion, makeRoofSection, makeStair, makePlatform, makeRailing, wallLength, rectValid, REGION_KINDS, REGION_EFFECTS, validateOpeningLayout } from './model.js';
import { proposeEndpointMove } from './wall-edit.js';
import { wallSegmentProblem, proposePlatformUpdate, proposeCrenellation } from './authoring.js';
import {proposeFloorStackEdit} from './floor-stack.js';

// Versioned authoring commands, not arbitrary JSON patches. All work is done on
// a private clone; callers only receive a building when the entire edit passes.
export class TransactionError extends Error {
  constructor(message,path='transaction'){super(message);this.path=path;}
}
const fail=(message,path)=>{throw new TransactionError(message,path);};
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function keys(value,allowed,where){
  if(!object(value))fail('Expected an object',where);
  for(const key of Object.keys(value))if(!allowed.includes(key))fail(`Unknown field: ${key}`,`${where}/${key}`);
}
function text(value,where,empty=false){if(typeof value!=='string'||(!empty&&!value.trim())||value.length>1024)fail('Expected text of at most 1024 characters'+(empty?'':' (nonempty)'),where);}
function number(value,where,min=-1e6,max=1e6){if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail(`Expected a finite number in [${min}, ${max}]`,where);}
function choice(value,allowed,where){if(!allowed.includes(value))fail(`Expected one of: ${allowed.join(', ')}`,where);}
function point(value,where){keys(value,['x','z'],where);number(value.x,`${where}/x`);number(value.z,`${where}/z`);}
const rectKeys=['minX','maxX','minZ','maxZ'];
const fields={
  building:['name','exportProfile','wallHeight','wallThickness','floorThickness','gridSize','roof','ceiling'],
  floor:['label','elevation','wallHeight','floorThickness','autoFloor','autoCeiling','boundaryMode'],
  platform:['label',...rectKeys,'kind','height','covered'],
  stair:['label','x','z','width','run','direction','style','steps','blockBelow'],
  wall:['label','role','height','a','b'],
  railing:['label','a','b','height','style'],
  opening:['label','type','wallId','t','at','width','height','sill','doorStyle','windowStyle','shapeId'],
  roof:['label',...rectKeys,'type','direction','baseY','pitch','overhang','gableEnds','hostRoofId','edgeModes'],
  region:['label',...rectKeys,'kind','effect','polygon'],
  // Not an operation family: wall.crenellate value fields.
  crenellation:['crenelWidth','merlonWidth','depth','idPrefix']
};
function checkValue(kind,value,action,where){
  let allowed=fields[kind];
  if(action==='update')allowed=allowed.filter(k=>!(kind==='wall'&&['a','b'].includes(k))&&!(kind==='opening'&&k==='type'));
  keys(value,allowed,where);
  if(!Object.keys(value).length&&action!=='add-top')fail('Provide at least one field',where);
  for(const [key,v] of Object.entries(value)){
    const p=`${where}/${key}`;
    if(key==='label')text(v,p,kind==='wall'||kind==='opening');
    else if(kind==='platform'){
      if(key==='kind')choice(v,['porch','deck'],p);
      else if(key==='covered'){if(typeof v!=='boolean')fail('Expected a boolean',p);}
      else number(v,p,key==='height'?-10000:-1e6,key==='height'?10000:1e6);
    }
    else if(kind==='stair'){
      if(key==='direction')choice(v,['north','south','east','west'],p);
      else if(key==='style')choice(v,['ramp','steps'],p);
      else if(key==='blockBelow'){if(typeof v!=='boolean')fail('Expected a boolean',p);}
      else if(key==='steps'){number(v,p,2,512);if(!Number.isInteger(v))fail('Step count must be an integer',p);}
      else number(v,p,key==='width'?.5:key==='run'?1:-1e6,['width','run'].includes(key)?10000:1e6);
    }
    else if(kind==='building'){
      // Ranges match the web building settings and the shared validator.
      if(key==='name')text(v,p);
      else if(key==='exportProfile')choice(v,['generic','get_probed'],p);
      else if(key==='roof'){
        keys(v,['type','pitch','overhang'],p);if(!Object.keys(v).length)fail('Provide at least one roof field',p);
        if(v.type!==undefined)choice(v.type,['gable','hip','flat','none'],`${p}/type`);
        if(v.pitch!==undefined)number(v.pitch,`${p}/pitch`,5,70);
        if(v.overhang!==undefined)number(v.overhang,`${p}/overhang`,0,100);
      }else if(key==='ceiling'){keys(v,['thickness'],p);if(v.thickness===undefined)fail('Provide ceiling thickness',p);number(v.thickness,`${p}/thickness`,.02,100);}
      else number(v,p,key==='wallHeight'?.2:key==='wallThickness'?.02:.001,key==='wallHeight'||key==='gridSize'?1000:100);
    }
    else if(kind==='floor'){
      if(['autoFloor','autoCeiling'].includes(key)){if(typeof v!=='boolean')fail('Expected a boolean',p);}
      else if(key==='boundaryMode')choice(v,['closed','intentional_open'],p);
      else if(v!==null)number(v,p,key==='elevation'?-1e6:key==='wallHeight'?.2:.001,key==='elevation'?1e6:key==='wallHeight'?1000:100);
    }
    else if(kind==='railing'&&key==='height')number(v,p,.4,100);
    else if(kind==='railing'&&key==='style')choice(v,['two_rail','picket','cross_brace'],p);
    else if(kind==='crenellation'){
      if(key==='idPrefix'){text(v,p);if(!/^[A-Za-z0-9_-]{1,48}$/.test(v))fail('idPrefix must be 1–48 letters, digits, - or _',p);}
      else number(v,p,key==='depth'?.1:.2,key==='depth'?100:1000);
    }
    else if(key==='polygon'){const problem=regionPolygonProblem(v);if(problem)fail(problem,p);}
    else if(key==='a'||key==='b'||key==='at')point(v,p);
    else if(key==='role')choice(v,['exterior','interior'],p);
    else if(key==='type')choice(v,kind==='roof'?['gable','shed','flat']:['door','window'],p);
    else if(key==='direction')choice(v,['x','z'],p);
    else if(key==='gableEnds')choice(v,['both','min','max','none'],p);
    else if(key==='kind')choice(v,REGION_KINDS,p);
    else if(key==='effect')choice(v,REGION_EFFECTS,p);
    else if(key==='doorStyle')choice(v,['exterior','room','closet','empty'],p);
    else if(key==='windowStyle')choice(v,['plain','double_hung','four_pane','empty'],p);
    else if(key==='wallId')text(v,p);
    else if(key==='hostRoofId'||key==='shapeId'){if(v!==null)text(v,p);}
    else if(key==='edgeModes'){
      keys(v,rectKeys,p);for(const [edge,mode] of Object.entries(v))choice(mode,['overhang','flush'],`${p}/${edge}`);
    }else if(key==='height'&&kind==='wall'){if(v!==null)number(v,p,.1,1000);}
    else if(key==='width'||key==='height')number(v,p,.001,10000);
    else if(key==='sill')number(v,p,0);
    else if(key==='t')number(v,p,0,1);
    else if(key==='pitch')number(v,p,5,70);
    else if(key==='overhang')number(v,p,0,100);
    else number(v,p);
  }
  if(kind==='opening'&&Object.hasOwn(value,'t')&&Object.hasOwn(value,'at'))fail('Use either t or at, not both',where);
  if(kind==='crenellation')for(const required of ['crenelWidth','merlonWidth','depth'])if(!Object.hasOwn(value,required))fail(`Missing required field: ${required}`,where);
  if(action==='add')for(const required of kind==='stair'?['x','z','width','run','direction']:kind==='wall'||kind==='railing'?['a','b']:kind==='opening'?['type','wallId',Object.hasOwn(value,'at')?'at':'t','width','height']:kind==='region'&&value.polygon?['polygon']:rectKeys)
    if(!Object.hasOwn(value,required))fail(`Missing required field: ${required}`,where);
}

export function validateTransaction(transaction){
  keys(transaction,['version','expectedSourceSha256','operations'],'transaction');
  if(transaction.version!==1)fail('Unsupported transaction version; expected 1');
  if(transaction.expectedSourceSha256!==undefined&&(typeof transaction.expectedSourceSha256!=='string'||!/^[a-f0-9]{64}$/.test(transaction.expectedSourceSha256)))fail('expectedSourceSha256 must be 64 lowercase hexadecimal characters');
  if(!Array.isArray(transaction.operations)||transaction.operations.length>1000)fail('operations must be an array with at most 1000 entries');
  transaction.operations.forEach((op,index)=>{
    const p=`operations/${index}`;
    if(!object(op)||typeof op.op!=='string')fail('Expected an operation object with an op name',p);
    const [kind,action,...extra]=op.op.split('.');
    if(extra.length||!Object.hasOwn(fields,kind)||!(kind==='floor'?['update','add-top','remove-top']:kind==='building'?['update']:['add','update','remove',...(kind==='wall'?['move-endpoint','crenellate']:[])]).includes(action))fail(`Unknown operation: ${op.op}`,p);
    if(kind==='wall'&&action==='crenellate'){
      keys(op,['op','id','floorId','value'],p);text(op.id,`${p}/id`);text(op.floorId,`${p}/floorId`);
      checkValue('crenellation',op.value,'crenellate',`${p}/value`);return;
    }
    if(kind==='building'){keys(op,['op','value'],p);checkValue(kind,op.value,action,`${p}/value`);return;}
    if(kind==='floor'&&action!=='update'){
      keys(op,['op','id',...(action==='add-top'?['aboveFloorId','value']:['removeContents','removeAffectedStairs'])],p);text(op.id,`${p}/id`);
      if(action==='add-top'){text(op.aboveFloorId,`${p}/aboveFloorId`);if(op.value!==undefined)checkValue(kind,op.value,action,`${p}/value`);}
      else for(const key of ['removeContents','removeAffectedStairs'])if(op[key]!==undefined&&typeof op[key]!=='boolean')fail('Expected a boolean',`${p}/${key}`);
      return;
    }
    const scoped=!['roof','floor'].includes(kind);
    keys(op,['op','id',...(scoped?['floorId']:[]),...(['add','update'].includes(action)?['value']:action==='move-endpoint'?['end','point','connected']:[])],p);
    text(op.id,`${p}/id`);if(scoped)text(op.floorId,`${p}/floorId`);
    if(['add','update'].includes(action))checkValue(kind,op.value,action,`${p}/value`);
    if(action==='move-endpoint'){
      choice(op.end,['a','b'],`${p}/end`);point(op.point,`${p}/point`);
      if(op.connected!==undefined&&typeof op.connected!=='boolean')fail('connected must be boolean',p);
    }
  });
}

// Report-only JSON Pointer paths. Arrays of uniquely ID'd objects report
// membership changes per ID ({path: array, op: add|remove, id, index}) and
// recurse into retained objects at their resulting index, so adding one wall
// does not restate every other wall. Other arrays with changed membership or
// reordered IDs remain a single replacement, so removals never masquerade as
// edits to the identity of subsequent objects.
const uniquelyKeyed=list=>list.every(v=>object(v)&&typeof v.id==='string'&&v.id)&&new Set(list.map(v=>v.id)).size===list.length;
export function documentDiff(before,after,path=''){
  if(JSON.stringify(before)===JSON.stringify(after))return [];
  const entry={path};
  if(before===undefined)return [{...entry,op:'add',after:structuredClone(after)}];
  if(after===undefined)return [{...entry,op:'remove',before:structuredClone(before)}];
  if(Array.isArray(before)&&Array.isArray(after)){
    if(before.length===after.length&&before.every((v,i)=>!object(v)||v.id===after[i]?.id))
      return before.flatMap((v,i)=>documentDiff(v,after[i],`${path}/${i}`));
    if(uniquelyKeyed(before)&&uniquelyKeyed(after)){
      const afterIds=new Set(after.map(v=>v.id)),beforeById=new Map(before.map((v,i)=>[v.id,{v,i}]));
      const retainedBefore=before.filter(v=>afterIds.has(v.id)).map(v=>v.id),retainedAfter=after.filter(v=>beforeById.has(v.id)).map(v=>v.id);
      if(retainedBefore.every((id,i)=>id===retainedAfter[i]))return [
        ...before.flatMap((v,i)=>afterIds.has(v.id)?[]:[{...entry,op:'remove',id:v.id,index:i,before:structuredClone(v)}]),
        ...after.flatMap((v,i)=>beforeById.has(v.id)?documentDiff(beforeById.get(v.id).v,v,`${path}/${i}`):[{...entry,op:'add',id:v.id,index:i,after:structuredClone(v)}])
      ];
    }
  }else if(object(before)&&object(after)){
    return [...new Set([...Object.keys(before),...Object.keys(after)])].sort().flatMap(key=>documentDiff(
      Object.hasOwn(before,key)?before[key]:undefined,Object.hasOwn(after,key)?after[key]:undefined,`${path}/${key.replaceAll('~','~0').replaceAll('/','~1')}`));
  }
  return [{...entry,op:'replace',before:structuredClone(before),after:structuredClone(after)}];
}

function applyOperation(building,op,index){
  const p=`operations/${index}`,[kind,action]=op.op.split('.');
  if(kind==='building'){
    // Nested settings merge field by field; numeric changes are checked by
    // final validation (opening fit, stair rise, junction clearance).
    for(const [key,value] of Object.entries(op.value)){
      if(key==='roof'||key==='ceiling')building[key]={...(building[key]||{}),...value};
      else building[key]=value;
    }
    return;
  }
  if(kind==='floor'){
    if(action==='add-top'||action==='remove-top'){
      const top=building.floors.at(-1),topIndex=building.floors.length-1;
      if(action==='add-top'){
        if(building.floors.some(f=>f.id===op.id))fail(`Floor ID already exists: ${op.id}`,p);
        if(top.id!==op.aboveFloorId)fail('aboveFloorId must name the current top floor; middle/basement insertion is not supported by this operation',p);
        const result=proposeFloorStackEdit(building,topIndex,'above',{validateResult:false});if(!result.ok)fail(result.reason,p);
        const added=result.building.floors.at(-1);added.id=op.id;
        for(const [key,value] of Object.entries(op.value||{}))if(value!==null)added[key]=value;
        if(added.boundaryMode==='closed')delete added.boundaryMode;
        building.floors=result.building.floors;
        return {action:'added',floorId:op.id,aboveFloorId:top.id,removedEntities:[],removedIncomingStairs:[]};
      }
      if(top.id!==op.id)fail('floor.remove-top must name the current top floor',p);
      if(building.floors.length===1)fail('Keep at least one floor',p);
      const contents=['walls','openings','lights','markers','stairs','regions','slabs','platforms','railings','roofSections'].flatMap(kind=>(top[kind]||[]).map(item=>({kind,id:item.id,label:item.label||item.id})));
      if(contents.length&&!op.removeContents)fail(`Top floor contains ${contents.length} entities; set removeContents: true to remove them, or remove its contents explicitly first`,p);
      const incoming=building.floors[topIndex-1].stairs||[];
      if(incoming.length&&!op.removeAffectedStairs)fail(`${incoming.length} incoming stair connection(s) would lose their upper floor; set removeAffectedStairs: true, or remove those stairs explicitly first`,p);
      const result=proposeFloorStackEdit(building,topIndex,'remove',{removeAffectedStairs:op.removeAffectedStairs===true,validateResult:false});if(!result.ok)fail(result.reason,p);
      building.floors=result.building.floors;
      return {action:'removed',floorId:op.id,aboveFloorId:building.floors.at(-1).id,removedEntities:contents,removedIncomingStairs:result.affectedStairs};
    }
    const floor=building.floors.find(f=>f.id===op.id);
    if(!floor)fail(`Unknown floor ID: ${op.id}`,p);
    for(const [key,value] of Object.entries(op.value)){
      if(['autoFloor','autoCeiling','boundaryMode'].includes(key)&&value===null)fail(`${key} does not accept null`,`${p}/value/${key}`);
      if(value===null||(key==='boundaryMode'&&value==='closed'))delete floor[key];else floor[key]=value;
    }
    return;
  }
  const fi=kind==='roof'?-1:building.floors.findIndex(f=>f.id===op.floorId);
  if(kind!=='roof'&&fi<0)fail(`Unknown floor ID: ${op.floorId}`,p);
  const floor=building.floors[fi],collection={wall:'walls',railing:'railings',opening:'openings',roof:'roofSections',region:'regions',stair:'stairs',platform:'platforms'}[kind];
  const list=kind==='roof'?building.roofSections:floor[collection],item=list.find(v=>v.id===op.id);
  if(action==='add'&&item)fail(`ID already exists: ${op.id}`,p);
  if(action!=='add'&&!item)fail(`Unknown ${kind} ID: ${op.id}`,p);
  if(kind==='platform'){
    if(action==='remove'){list.splice(list.indexOf(item),1);return;}
    const value=op.value;
    const initial=action==='add'?{...makePlatform({x:value.minX,z:value.minZ},{x:value.maxX,z:value.maxZ},value.kind||'porch',value.height??0,value.label||''),id:op.id}:item;
    const result=proposePlatformUpdate(initial,value);
    if(!result.ok)fail(result.reason,p);
    if(action==='add')list.push(result.platform);else Object.assign(item,result.platform);
    return;
  }
  if(kind==='stair'&&action!=='remove'&&!building.floors[fi+1])fail('Stair add/update requires an adjacent upper floor',p);
  if(action==='remove'){list.splice(list.indexOf(item),1);return;}
  if(action==='crenellate'){
    const result=proposeCrenellation(item,item.height??floorView(building,fi).wallHeight,floor.openings,op.value);
    if(!result.ok)fail(result.reason,`${p}/value`);
    floor.openings.push(...result.openings);return;
  }
  if(action==='move-endpoint'){
    const result=proposeEndpointMove(building,fi,op.id,op.end,op.point,{connected:op.connected!==false});
    if(!result.ok)fail(result.reason,p);building.floors[fi]=result.floor;return;
  }
  const value=structuredClone(op.value);
  if(kind==='opening'&&value.at){
    // World-point placement: project onto the host wall centreline. Points on
    // either wall face are accepted; anything farther away is rejected.
    const host=floor.walls.find(w=>w.id===(value.wallId??item?.wallId));
    if(!host)fail(`Unknown host wall: ${value.wallId??item?.wallId}`,`${p}/value/wallId`);
    const dx=host.b.x-host.a.x,dz=host.b.z-host.a.z,length=Math.hypot(dx,dz);
    const t=((value.at.x-host.a.x)*dx+(value.at.z-host.a.z)*dz)/(length*length);
    const offset=Math.abs((value.at.z-host.a.z)*dx-(value.at.x-host.a.x)*dz)/length;
    const tolerance=floorView(building,fi).wallThickness/2+1e-6;
    if(offset>tolerance)fail(`Point is ${Number(offset.toFixed(4))} m from wall ${host.id}; place it within ${Number(tolerance.toFixed(4))} m of the centreline`,`${p}/value/at`);
    if(t<=0||t>=1)fail(`Point projects outside wall ${host.id} (t = ${Number(t.toFixed(4))})`,`${p}/value/at`);
    value.t=Math.round(t*1e9)/1e9;delete value.at;
  }
  if(kind==='region'&&item?.polygon&&!value.polygon&&rectKeys.some(k=>Object.hasOwn(value,k)))fail('Edit polygon corners instead of rectangular bounds.',p);
  if(action==='add'){
    let defaults;
    if(kind==='wall')defaults={label:'',role:'interior',height:null};
    else if(kind==='railing'){const r=makeRailing(value.a,value.b,value.label||'Railing',value.height??1,value.style||'two_rail');delete r.id;defaults=r;}
    else if(kind==='stair')defaults=makeStair({x:0,z:0},{x:0,z:-value.run},value.width,value.style||'ramp',value.steps??12,value.label||'');
    else if(kind==='opening')defaults={label:value.type==='door'?'Door':'Window',...(value.type==='window'?{sill:.9,windowStyle:'plain'}:{doorStyle:'room'})};
    else {
      const bounds=kind==='region'&&value.polygon?regionBounds(value.polygon):value;
      const a={x:bounds.minX,z:bounds.minZ},b={x:bounds.maxX,z:bounds.maxZ};
      defaults=kind==='roof'?makeRoofSection(a,b):makeRegion(a,b);
    }
    list.push({...defaults,...value,id:op.id});
  }else Object.assign(item,value);
  const updated=list.find(v=>v.id===op.id);
  if(kind==='region'&&updated.polygon)Object.assign(updated,regionBounds(updated.polygon));
  if(kind==='roof'&&updated.hostRoofId===null)delete updated.hostRoofId;
  if(kind==='roof'||kind==='region')if(!rectValid(updated))fail('Rectangle must have positive width and depth of at least 0.1 m each',p);
  if(kind==='railing'){
    if(wallLength(updated)<=.15)fail('Railing segments must be longer than 0.15 m',p);
    if(updated.height>floorView(building,fi).wallHeight)fail('Railing height exceeds the story height',p);
  }
  if(kind==='wall'){
    const problem=wallSegmentProblem(updated.a,updated.b,list.filter(v=>v!==updated));
    if(problem)fail(problem,p);
    if(updated.height!==null&&updated.height>floorView(building,fi).wallHeight)fail('Wall height exceeds the story height',p);
  }
  if(kind==='opening'){
    if(updated.shapeId===null)delete updated.shapeId;
    if(updated.type==='door'&&('sill' in value||'windowStyle' in value))fail('Door edits cannot set window fields',p);
    if(updated.type==='window'&&'doorStyle' in value)fail('Window edits cannot set doorStyle',p);
  }
}

// Derived effects are keyed by authored identity, including absent floors.
// Resolved elevations and stair rises come from the shared model.
function structuralChanges(before,after){
  const oldIndex=new Map(before.floors.map((f,i)=>[f.id,i])),newIndex=new Map(after.floors.map((f,i)=>[f.id,i]));
  const floors=[],stairs=[];
  for(const id of new Set([...oldIndex.keys(),...newIndex.keys()])){
    const oi=oldIndex.get(id),ni=newIndex.get(id),previous=oi===undefined?null:resolvedFloorDimensions(before,oi),current=ni===undefined?null:resolvedFloorDimensions(after,ni);
    if(JSON.stringify(previous)!==JSON.stringify(current))floors.push({id,index:(ni??oi)+1,before:previous,after:current});
    if(ni===undefined||oi===undefined)continue;
    const flight=(building,i)=>building.floors[i+1]?{bottomY:resolvedFloorDimensions(building,i).elevation,topY:resolvedFloorDimensions(building,i+1).elevation,rise:resolvedFloorDimensions(building,i+1).elevation-resolvedFloorDimensions(building,i).elevation}:null;
    const oldFlight=flight(before,oi),newFlight=flight(after,ni);
    if(JSON.stringify(oldFlight)!==JSON.stringify(newFlight))for(const stair of after.floors[ni].stairs.filter(s=>before.floors[oi].stairs.some(old=>old.id===s.id)))stairs.push({id:stair.id,floorId:id,upperFloorId:after.floors[ni+1]?.id??null,before:oldFlight,after:newFlight});
  }
  const independentSurfaces=floors.length?['roofSections','manualFloors','manualCeilings'].flatMap(kind=>after[kind].map(s=>({kind,id:s.id,height:kind==='roofSections'?s.baseY:s.topY}))):[];
  return {floors,stairs,independentSurfaces};
}

export function applyTransaction(source,transaction,{warningsAsErrors=false,sourceSha256}={}){
  const report={ok:false,building:null,errors:[],warnings:[],normalizationChanges:[],changes:[],operations:[],floorStackChanges:[],stairChanges:[],platformChanges:[],floorCoverageChanges:[],structuralChanges:{floors:[],stairs:[],independentSurfaces:[]}};
  try{
    validateTransaction(transaction);
    if(transaction.expectedSourceSha256&&transaction.expectedSourceSha256!==sourceSha256)fail('Source SHA-256 mismatch; inspect the current source and review the transaction again');
    const prepared=prepareDocument(source);
    report.errors=prepared.errors;report.warnings=prepared.warnings;
    if(report.errors.length)return report;
    report.normalizationChanges=documentDiff(source,prepared.building);
    let building=structuredClone(prepared.building);
    transaction.operations.forEach((op,index)=>{
      const stackChange=applyOperation(building,op,index);if(stackChange)report.floorStackChanges.push({operationIndex:index,...stackChange});report.operations.push({index,op:op.op,id:op.id,...(op.floorId?{floorId:op.floorId}:{})});
    });
    const validation=validateBuilding(building,{roofDiagnostics:true});
    report.errors=validation.errors;
    // Out-of-bounds openings are intentionally tolerated by legacy import, but
    // explicit authoring must not silently resize the user's requested opening.
    if(!report.errors.length)building.floors.forEach((f,i)=>{
      for(const issue of validateOpeningLayout(floorView(building,i)))if(issue.type==='out_of_bounds')report.errors.push({path:`floors/${i}/openings/${f.openings.indexOf(issue.opening)}`,message:issue.message});
      // Do not silently cap an existing custom-height wall after lowering its
      // story. Allow an explicit wall repair later in the same transaction.
      const oldIndex=prepared.building.floors.findIndex(q=>q.id===f.id);
      if(oldIndex<0||floorView(building,i).wallHeight!==floorView(prepared.building,oldIndex).wallHeight)for(const [j,w] of f.walls.entries())
        if(w.height!=null&&w.height>floorView(building,i).wallHeight)report.errors.push({path:`floors/${i}/walls/${j}/height`,message:'Wall height exceeds the story height; update the wall explicitly'});
    });
    report.warnings=validation.warnings;
    report.structuralChanges=structuralChanges(prepared.building,building);
    const oldIndices=new Map(prepared.building.floors.map((f,i)=>[f.id,i])),newIndices=new Map(building.floors.map((f,i)=>[f.id,i]));
    for(const floorId of new Set([...oldIndices.keys(),...newIndices.keys()])){
      const oi=oldIndices.get(floorId),ni=newIndices.get(floorId),oldFloor=oi===undefined?null:prepared.building.floors[oi],nextFloor=ni===undefined?null:building.floors[ni];
      const oldPlatforms=oldFloor?.platforms||[],newPlatforms=nextFloor?.platforms||[];
      for(const id of new Set([...oldPlatforms,...newPlatforms].map(p=>p.id))){
        const old=oldPlatforms.find(p=>p.id===id),platform=newPlatforms.find(p=>p.id===id);
        const previous=old?inspectPlatform(prepared.building,oi,old):null,next=platform?inspectPlatform(building,ni,platform):null;
        if(JSON.stringify(previous)===JSON.stringify(next))continue;
        // Conservative context inventory, not inferred ownership. These pieces
        // are retained, and may need a separate alignment edit after a change.
        const geometryChanged=!previous||!next||['minX','maxX','minZ','maxZ','topY','bottomY','kind','covered'].some(k=>previous[k]!==next[k]);
        const independentPieces=geometryChanged?[
          ...(nextFloor?.railings||[]).map(r=>({kind:'railing',id:r.id,floorId})),
          ...['manualFloors','manualCeilings','roofSections'].flatMap(kind=>building[kind].map(r=>({kind,id:r.id})))
        ]:[];
        report.platformChanges.push({id,floorId,before:previous,after:next,independentReview:independentPieces.length?{
          pieces:independentPieces,note:'Context inventory: railings on this floor and building-wide manual surfaces/roofs. They remain independently authored; inclusion does not establish attachment or prove misalignment.'
        }:null});
      }
      const previousCoverage=oi===undefined?null:inspectFloorCoverage(prepared.building,oi),nextCoverage=ni===undefined?null:inspectFloorCoverage(building,ni);
      if(JSON.stringify(previousCoverage)!==JSON.stringify(nextCoverage))report.floorCoverageChanges.push({floorId,before:previousCoverage,after:nextCoverage});
      const oldStairs=oldFloor?.stairs||[],newStairs=nextFloor?.stairs||[];
      for(const id of new Set([...oldStairs,...newStairs].map(s=>s.id))){
        const old=oldStairs.find(s=>s.id===id),current=newStairs.find(s=>s.id===id);
        const previous=old?inspectStair(prepared.building,oi,old):null,next=current?inspectStair(building,ni,current):null;
        if(JSON.stringify(previous)!==JSON.stringify(next))report.stairChanges.push({id,floorId,before:previous,after:next});
      }
    }
    const independent=report.structuralChanges.independentSurfaces.length;
    if(independent)report.warnings.push({path:'floors',message:`${independent} independent surfaces retain their authored absolute heights after floor dimension or stack changes; review alignment`});
    report.changes=documentDiff(prepared.building,building);
    if(report.errors.length)return report;
    // Normalize harmless binary roundoff (e.g. t * wallLength / wallLength).
    // Other coercions still fail. Save a stable result that reloads identically.
    for(let pass=0;pass<4;pass++){
      const reloaded=prepareDocument(building);
      if(reloaded.errors.length){report.errors=reloaded.errors;return report;}
      const adjustments=documentDiff(building,reloaded.building);
      if(!adjustments.length)break;
      const unsafe=adjustments.find(d=>typeof d.before!=='number'||typeof d.after!=='number'||Math.abs(d.before-d.after)>Number.EPSILON*16*Math.max(1,Math.abs(d.before),Math.abs(d.after)));
      if(unsafe)fail(`Edit would change during web normalization at ${unsafe.path}; use explicit supported values`,unsafe.path);
      if(pass===3)fail('Numeric normalization did not stabilize');
      building=reloaded.building;
    }
    report.changes=documentDiff(prepared.building,building);
    if(warningsAsErrors&&report.warnings.length)return report;
    report.ok=true;report.building=building;return report;
  }catch(e){
    if(!(e instanceof TransactionError))throw e;
    report.errors.push({path:e.path,message:e.message});return report;
  }
}
