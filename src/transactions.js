import { regionPolygonProblem, regionBounds } from './regions.js';
import { prepareDocument, resolvedFloorDimensions, inspectStair, inspectPlatform, inspectFloorCoverage } from './diagnostics.js';
import { validateBuilding } from './validation.js';
import { makeOmniLight, makeManualSurface, makeRectArea, floorView, makeRegion, makeRoofSection, makeStair, makePlatform, makeRailing, wallLength, rectValid, REGION_KINDS, REGION_EFFECTS, validateOpeningLayout, addRoom } from './model.js';
import { proposeEndpointMove, proposeWallSplit } from './wall-edit.js';
import { stairGuardRailings } from './stair-guards.js';
import { wallSegmentProblem, proposePlatformUpdate, proposeCrenellation } from './authoring.js';
import {proposeFloorStackEdit} from './floor-stack.js';
import {markerProblem} from './markers.js';
import {proposeGroupMove} from './group-edit.js';
import {wallTypeProblem,followWallThickness} from './wall-types.js';
import {openingShapeProblem,doorLeavesProblem} from './opening-shapes.js';
import {MANUAL_ROOF_TYPES,manualRoofOutlineProblem} from './roof-outline.js';

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
const GROUP_TYPES=['wall','opening','light','marker','stair','railing','region','slab','platform','manualFloor','manualCeiling','roofSection'];
const fields={
  building:['name','exportProfile','wallHeight','wallThickness','floorThickness','gridSize','roof','ceiling','doorMesh','windowMesh'],
  floor:['label','elevation','wallHeight','floorThickness','autoFloor','autoCeiling','boundaryMode'],
  platform:['label',...rectKeys,'kind','height','covered'],
  stair:['label','x','z','width','run','direction','style','steps','blockBelow'],
  wall:['label','role','height','a','b','wallTypeId','inwardSide','inwardToward'],
  // Building-level shared definitions (no floorId), as in the web dialogs.
  wallType:['label','stations'],
  openingShape:['label','points'],
  railing:['label','a','b','height','style'],
  // Omni lights, as placed by the web Light tool; position.y is the height above the floor.
  light:['label','position','color','energy','range','shadows'],
  // Named reference points (web Marker tool); position.y is height above the floor.
  marker:['label','details','position'],
  // Floor Footprints (web Floor Footprint tool) override the automatic slab outline.
  slab:['label',...rectKeys],
  // Independent building-level slabs with absolute top heights (web Manual Floor/Ceiling).
  manualFloor:['label',...rectKeys,'topY','thickness'],
  manualCeiling:['label',...rectKeys,'topY','thickness'],
  opening:['label','type','wallId','t','at','width','height','sill','doorStyle','windowStyle','shapeId','leaves'],
  roof:['label',...rectKeys,'polygon','type','direction','baseY','pitch','overhang','gableEnds','hostRoofId','edgeModes'],
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
      else if(key==='doorMesh'||key==='windowMesh'){
        // Minimums match the web Door/Window mesh settings.
        const limits=key==='doorMesh'?{frameWidth:.03,frameDepth:.03,panelThickness:.02,detailDepth:.005}:{frameWidth:.02,frameDepth:.02,glassThickness:.005};
        keys(v,['enabled',...Object.keys(limits)],p);if(!Object.keys(v).length)fail(`Provide at least one ${key} field`,p);
        for(const [field,value] of Object.entries(v)){if(field==='enabled'){if(typeof value!=='boolean')fail('Expected a boolean',`${p}/${field}`);}else number(value,`${p}/${field}`,limits[field],100);}
      }
      else number(v,p,key==='wallHeight'?.2:key==='wallThickness'?.02:.001,key==='wallHeight'||key==='gridSize'?1000:100);
    }
    else if(kind==='floor'){
      if(['autoFloor','autoCeiling'].includes(key)){if(typeof v!=='boolean')fail('Expected a boolean',p);}
      else if(key==='boundaryMode')choice(v,['closed','intentional_open'],p);
      else if(v!==null)number(v,p,key==='elevation'?-1e6:key==='wallHeight'?.2:.001,key==='elevation'?1e6:key==='wallHeight'?1000:100);
    }
    else if(kind==='wallType'&&key==='stations'){if(!Array.isArray(v))fail('Expected an array of {height, offset, thickness} levels',p);}
    else if(kind==='openingShape'&&key==='points'){if(!Array.isArray(v))fail('Expected an array of {x, y} outline corners',p);}
    else if(kind==='wall'&&key==='wallTypeId'){if(v!==null)text(v,p);}
    else if(kind==='wall'&&key==='inwardSide')choice(v,['auto','left','right'],p);
    else if(kind==='wall'&&key==='inwardToward')point(v,p);
    else if(kind==='marker'){
      if(key==='details'){if(v!==null&&typeof v!=='string')fail('Expected text',p);}
      else if(key==='position'){keys(v,['x','y','z'],p);for(const axis of ['x','y','z']){if(!Object.hasOwn(v,axis))fail(`Missing required field: ${axis}`,p);number(v[axis],`${p}/${axis}`);}}
    }
    else if(kind==='manualFloor'||kind==='manualCeiling'){number(v,p,key==='thickness'?.01:-1e6,key==='thickness'?10000:1e6);}
    else if(kind==='light'){
      if(key==='position'){keys(v,['x','y','z'],p);for(const axis of ['x','y','z']){if(!Object.hasOwn(v,axis))fail(`Missing required field: ${axis}`,p);number(v[axis],`${p}/${axis}`);}}
      else if(key==='color'){keys(v,['r','g','b','a'],p);for(const c of ['r','g','b']){if(!Object.hasOwn(v,c))fail(`Missing required field: ${c}`,p);number(v[c],`${p}/${c}`,0,1);}if(v.a!==undefined)number(v.a,`${p}/a`,0,1);}
      else if(key==='shadows'){if(typeof v!=='boolean')fail('Expected a boolean',p);}
      else number(v,p,key==='range'?.1:0,1e6);
    }
    else if(kind==='railing'&&key==='height')number(v,p,.4,100);
    else if(kind==='railing'&&key==='style')choice(v,['two_rail','picket','cross_brace'],p);
    else if(kind==='crenellation'){
      if(key==='idPrefix'){text(v,p);if(!/^[A-Za-z0-9_-]{1,48}$/.test(v))fail('idPrefix must be 1–48 letters, digits, - or _',p);}
      else number(v,p,key==='depth'?.1:.2,key==='depth'?100:1000);
    }
    else if(key==='polygon'){if(kind==='roof'&&v===null)continue;const problem=regionPolygonProblem(v);if(problem)fail(kind==='roof'?problem.replace('A polygon region','A polygon roof').replace('Region corners','Roof corners').replace('Region width','Roof width'):problem,p);}
    else if(key==='a'||key==='b'||key==='at')point(v,p);
    else if(key==='role')choice(v,['exterior','interior'],p);
    else if(key==='type')choice(v,kind==='roof'?MANUAL_ROOF_TYPES:['door','window'],p);
    else if(key==='direction')choice(v,['x','z'],p);
    else if(key==='gableEnds')choice(v,['both','min','max','none'],p);
    else if(key==='kind')choice(v,REGION_KINDS,p);
    else if(key==='effect')choice(v,REGION_EFFECTS,p);
    else if(key==='doorStyle')choice(v,['exterior','room','closet','empty'],p);
    else if(key==='leaves')choice(v,[1,2],p);
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
  if(kind==='wall'&&Object.hasOwn(value,'inwardSide')&&Object.hasOwn(value,'inwardToward'))fail('Use either inwardSide or inwardToward, not both',where);
  if(action==='add'&&(kind==='wallType'||kind==='openingShape'))for(const required of ['label',kind==='wallType'?'stations':'points'])if(!Object.hasOwn(value,required))fail(`Missing required field: ${required}`,where);
  if(kind==='crenellation')for(const required of ['crenelWidth','merlonWidth','depth'])if(!Object.hasOwn(value,required))fail(`Missing required field: ${required}`,where);
  if(action==='add'&&kind==='light'&&!Object.hasOwn(value,'position'))fail('Missing required field: position',where);
  if(action==='add'&&kind==='marker'&&!Object.hasOwn(value,'position'))fail('Missing required field: position',where);
  if(action==='add'&&(kind==='manualFloor'||kind==='manualCeiling'))for(const required of [...rectKeys,'topY'])if(!Object.hasOwn(value,required))fail(`Missing required field: ${required}`,where);
  if(action==='add'&&!['wallType','openingShape','light','marker','manualFloor','manualCeiling'].includes(kind))for(const required of kind==='stair'?['x','z','width','run','direction']:kind==='wall'||kind==='railing'?['a','b']:kind==='opening'?['type','wallId',Object.hasOwn(value,'at')?'at':'t','width','height']:(kind==='region'||kind==='roof')&&value.polygon?['polygon']:rectKeys)
    if(!Object.hasOwn(value,required))fail(`Missing required field: ${required}`,where);
}

// Named points (recipe convenience): transaction.points maps names to {x, z};
// any point field (a, b, at, point, polygon corners) may give a name instead.
const POINT_FIELDS=['a','b','at','point'];
export function resolveNamedPoints(transaction){
  if(transaction?.points===undefined)return transaction;
  const points=transaction.points;
  if(!object(points))fail('points must be an object of {x, z} by name','transaction/points');
  for(const [name,value] of Object.entries(points)){if(!/^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/.test(name))fail('Point names must start with a letter or _ and use letters, digits, _ . or - (up to 64)',`transaction/points/${name}`);point(value,`transaction/points/${name}`);}
  const lookup=(name,where)=>{if(!Object.hasOwn(points,name))fail(`Unknown point name: ${name}`,where);return {x:points[name].x,z:points[name].z};};
  const resolve=(value,where)=>{
    if(Array.isArray(value))return value.map((v,i)=>resolve(v,`${where}/${i}`));
    if(!object(value))return value;
    return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,
      POINT_FIELDS.includes(k)&&typeof v==='string'?lookup(v,`${where}/${k}`):
      k==='polygon'&&Array.isArray(v)?v.map((c,i)=>typeof c==='string'?lookup(c,`${where}/${k}/${i}`):c):resolve(v,`${where}/${k}`)]));
  };
  const {points:_,...rest}=transaction;
  return {...rest,operations:Array.isArray(rest.operations)?rest.operations.map((op,i)=>resolve(op,`operations/${i}`)):rest.operations};
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
    if(kind==='room'){
      // room.add: the web Room tool, a closed rectangle of four walls.
      if(action!=='add'||extra.length)fail(`Unknown operation: ${op.op}`,p);
      keys(op,['op','id','floorId','value'],p);text(op.id,`${p}/id`);text(op.floorId,`${p}/floorId`);
      keys(op.value,[...rectKeys,'role','height','wallTypeId','label'],`${p}/value`);
      for(const k of rectKeys){if(!Object.hasOwn(op.value,k))fail(`Missing required field: ${k}`,`${p}/value`);number(op.value[k],`${p}/value/${k}`);}
      if(op.value.role!==undefined)choice(op.value.role,['exterior','interior'],`${p}/value/role`);
      if(op.value.height!==undefined&&op.value.height!==null)number(op.value.height,`${p}/value/height`,.1,1000);
      for(const k of ['wallTypeId','label'])if(op.value[k]!==undefined)text(op.value[k],`${p}/value/${k}`);
      return;
    }
    const actions=kind==='floor'?['update','add-top','remove-top','insert','duplicate','move','remove']:kind==='building'?['update']:kind==='group'?['move']:['add','update','remove',...(kind==='wall'?['move-endpoint','crenellate','split']:kind==='stair'?['guard']:[])];
    if(extra.length||!(Object.hasOwn(fields,kind)||kind==='group')||!actions.includes(action))fail(`Unknown operation: ${op.op}`,p);
    if(kind==='group'){
      // group.move: the web Move selection / group drag, on one floor.
      keys(op,['op','floorId','items','delta','connected'],p);text(op.floorId,`${p}/floorId`);
      if(!Array.isArray(op.items)||!op.items.length||op.items.length>10000)fail('items must be a nonempty array of {type, id}',`${p}/items`);
      op.items.forEach((item,i)=>{keys(item,['type','id'],`${p}/items/${i}`);choice(item.type,GROUP_TYPES,`${p}/items/${i}/type`);text(item.id,`${p}/items/${i}/id`);});
      point(op.delta,`${p}/delta`);if(op.connected!==undefined&&typeof op.connected!=='boolean')fail('connected must be boolean',`${p}/connected`);
      return;
    }
    if(kind==='stair'&&action==='guard'){
      // stair.guard: the web stair panel's Guard opening above.
      keys(op,['op','id','floorId','value'],p);text(op.id,`${p}/id`);text(op.floorId,`${p}/floorId`);
      if(op.value!==undefined){
        keys(op.value,['idPrefix','height','style','label'],`${p}/value`);
        for(const k of ['idPrefix','label'])if(op.value[k]!==undefined)text(op.value[k],`${p}/value/${k}`);
        if(op.value.height!==undefined&&(typeof op.value.height!=='number'||!Number.isFinite(op.value.height)))fail('height must be a finite number',`${p}/value/height`);
        if(op.value.style!==undefined)choice(op.value.style,['two_rail','picket','cross_brace'],`${p}/value/style`);
      }
      return;
    }
    if(kind==='wall'&&action==='split'){
      // wall.split: the web wall panel's Split wall, at a plan point or a distance from end A.
      keys(op,['op','id','floorId','newId','at','distance'],p);text(op.id,`${p}/id`);text(op.floorId,`${p}/floorId`);text(op.newId,`${p}/newId`);
      if((op.at===undefined)===(op.distance===undefined))fail('Give exactly one of at {x, z} or distance (metres from end A)',p);
      if(op.at!==undefined)point(op.at,`${p}/at`);else if(typeof op.distance!=='number'||!Number.isFinite(op.distance))fail('distance must be a finite number of metres',`${p}/distance`);
      return;
    }
    if(kind==='wall'&&action==='crenellate'){
      keys(op,['op','id','floorId','value'],p);text(op.id,`${p}/id`);text(op.floorId,`${p}/floorId`);
      checkValue('crenellation',op.value,'crenellate',`${p}/value`);return;
    }
    if(kind==='building'){keys(op,['op','value'],p);checkValue(kind,op.value,action,`${p}/value`);return;}
    if(kind==='floor'&&action!=='update'){
      const allowed={'add-top':['aboveFloorId','value'],'remove-top':['removeContents','removeAffectedStairs'],remove:['removeContents','removeAffectedStairs'],
        insert:['aboveFloorId','belowFloorId','value','removeAffectedStairs'],duplicate:['sourceFloorId','value','removeAffectedStairs'],move:['direction','removeAffectedStairs']}[action];
      keys(op,['op','id',...allowed],p);text(op.id,`${p}/id`);
      if(action==='add-top'){text(op.aboveFloorId,`${p}/aboveFloorId`);if(op.value!==undefined)checkValue(kind,op.value,action,`${p}/value`);}
      if(action==='insert'){
        if(Object.hasOwn(op,'aboveFloorId')===Object.hasOwn(op,'belowFloorId'))fail('Give exactly one of aboveFloorId or belowFloorId',p);
        text(op.aboveFloorId??op.belowFloorId,`${p}/${Object.hasOwn(op,'aboveFloorId')?'aboveFloorId':'belowFloorId'}`);
        if(op.value!==undefined)checkValue(kind,op.value,'add-top',`${p}/value`);
      }
      if(action==='duplicate'){text(op.sourceFloorId,`${p}/sourceFloorId`);if(op.value!==undefined)checkValue(kind,op.value,'add-top',`${p}/value`);}
      if(action==='move')choice(op.direction,['up','down'],`${p}/direction`);
      for(const key of ['removeContents','removeAffectedStairs'])if(op[key]!==undefined&&typeof op[key]!=='boolean')fail('Expected a boolean',`${p}/${key}`);
      return;
    }
    const scoped=!['roof','floor','wallType','openingShape','manualFloor','manualCeiling'].includes(kind);
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
  if(kind==='room'){
    // Corners from the web Room tool's addRoom; each side goes through wall.add
    // (IDs <id>-north/-east/-south/-west, north being -Z).
    const v=op.value;if(v.maxX-v.minX<.2||v.maxZ-v.minZ<.2)fail('A room needs at least 0.2 m in both directions',`${p}/value`);
    const sides=addRoom({walls:[]},{x:v.minX,z:v.minZ},{x:v.maxX,z:v.maxZ},v.role||'exterior',v.height??null);
    ['north','east','south','west'].forEach((side,i)=>{const w=sides[i];applyOperation(building,{op:'wall.add',floorId:op.floorId,id:`${op.id}-${side}`,value:{a:w.a,b:w.b,role:w.role,height:w.height,label:v.label?`${v.label} ${side}`:'',...(v.wallTypeId?{wallTypeId:v.wallTypeId}:{})}},index);});
    return;
  }
  if(kind==='building'){
    // Nested settings merge field by field; numeric changes are checked by
    // final validation (opening fit, stair rise, junction clearance).
    for(const [key,value] of Object.entries(op.value)){
      if(['roof','ceiling','doorMesh','windowMesh'].includes(key))building[key]={...(building[key]||{}),...value};
      else{
        // Profile stations at the old wall thickness follow the new one (shared with the web setting).
        if(key==='wallThickness')followWallThickness(building,building.wallThickness,value);
        building[key]=value;
      }
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
    if(['insert','duplicate','move','remove'].includes(action))return applyFloorStack(building,op,action,p);
    const floor=building.floors.find(f=>f.id===op.id);
    if(!floor)fail(`Unknown floor ID: ${op.id}`,p);
    for(const [key,value] of Object.entries(op.value)){
      if(['autoFloor','autoCeiling','boundaryMode'].includes(key)&&value===null)fail(`${key} does not accept null`,`${p}/value/${key}`);
      if(value===null||(key==='boundaryMode'&&value==='closed'))delete floor[key];else floor[key]=value;
    }
    return;
  }
  if(kind==='wallType'||kind==='openingShape')return applySharedDefinition(building,op,kind,action,p);
  if(kind==='group'){
    const fi=building.floors.findIndex(f=>f.id===op.floorId);if(fi<0)fail(`Unknown floor ID: ${op.floorId}`,p);
    // Same proposal as the web Move selection; validated again with the final building.
    const result=proposeGroupMove(building,fi,op.items,op.delta,{connected:op.connected!==false});
    if(!result.ok)fail(result.reason,p);
    Object.assign(building,result.building);return;
  }
  if(kind==='manualFloor'||kind==='manualCeiling'){
    const key=kind==='manualFloor'?'manualFloors':'manualCeilings',list=building[key] ||= [],item=list.find(v=>v.id===op.id);
    if(action==='add'&&item)fail(`ID already exists: ${op.id}`,p);
    if(action!=='add'&&!item)fail(`Unknown ${kind} ID: ${op.id}`,p);
    if(action==='remove'){list.splice(list.indexOf(item),1);return;}
    const v=op.value,isCeiling=kind==='manualCeiling';
    if(action==='add'){
      // Defaults match the web tools: building floor / ceiling thickness.
      const thickness=v.thickness??(isCeiling?Number(building.ceiling?.thickness)||.12:Number(building.floorThickness)||.18);
      const made=makeManualSurface({x:v.minX,z:v.minZ},{x:v.maxX,z:v.maxZ},isCeiling?'ceiling':'floor',v.topY,thickness,v.label||'');
      list.push({...made,minX:v.minX,maxX:v.maxX,minZ:v.minZ,maxZ:v.maxZ,id:op.id});
    }else Object.assign(item,structuredClone(v));
    const updated=list.find(q=>q.id===op.id);
    if(!rectValid(updated)||updated.minX>updated.maxX||updated.minZ>updated.maxZ)fail('Rectangle needs minX < maxX and minZ < maxZ, at least 0.1 m each',p);
    return;
  }
  const fi=kind==='roof'?-1:building.floors.findIndex(f=>f.id===op.floorId);
  if(kind!=='roof'&&fi<0)fail(`Unknown floor ID: ${op.floorId}`,p);
  const floor=building.floors[fi],collection={marker:'markers',slab:'slabs',light:'lights',wall:'walls',railing:'railings',opening:'openings',roof:'roofSections',region:'regions',stair:'stairs',platform:'platforms'}[kind];
  const list=kind==='roof'?building.roofSections:(floor[collection] ||= []),item=list.find(v=>v.id===op.id);
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
  if(action==='guard'){
    const result=stairGuardRailings(building,fi,op.id,op.value||{});
    if(!result.ok)fail(result.reason,p);
    const upper=building.floors[fi+1];(upper.railings ||= []).push(...result.railings);return;
  }
  if(action==='split'){
    if(['walls','openings','lights','markers','stairs','regions','slabs','platforms','railings'].some(k=>(floor[k]||[]).some(o=>o.id===op.newId)))fail(`ID already exists: ${op.newId}`,`${p}/newId`);
    const result=proposeWallSplit(building,fi,op.id,{at:op.at,distance:op.distance},op.newId);
    if(!result.ok)fail(result.reason,p);building.floors[fi]=result.floor;return;
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
  if(kind==='wall'&&value.inwardToward){
    // Resolve a world point to the side (relative to A -> B) it lies on.
    const a=value.a??item.a,b=value.b??item.b,cross=(b.x-a.x)*(value.inwardToward.z-a.z)-(b.z-a.z)*(value.inwardToward.x-a.x);
    if(Math.abs(cross)<1e-9)fail('inwardToward lies on the wall line; choose a point on the inward side',`${p}/value/inwardToward`);
    // In the X/Z plan, "left of A -> B" is the negative-cross side (see profileWallState).
    value.inwardSide=cross<0?'left':'right';delete value.inwardToward;
  }
  if((kind==='region'||kind==='roof')&&item?.polygon&&!value.polygon&&value.polygon!==null&&rectKeys.some(k=>Object.hasOwn(value,k)))fail('Edit polygon corners instead of rectangular bounds.',p);
  if(action==='add'){
    let defaults;
    if(kind==='wall')defaults={label:'',role:'interior',height:null};
    else if(kind==='light'){const l=makeOmniLight(0,0,2.2,`Light ${list.length+1}`);delete l.id;defaults=l;if(value.color)value.color={a:1,...value.color};}
    else if(kind==='marker')defaults={label:`Marker ${list.length+1}`,details:''};
    else if(kind==='slab'){const r=makeRectArea({x:value.minX,z:value.minZ},{x:value.maxX,z:value.maxZ},`Floor Footprint ${list.length+1}`);delete r.id;defaults=r;}
    else if(kind==='railing'){const r=makeRailing(value.a,value.b,value.label||'Railing',value.height??1,value.style||'two_rail');delete r.id;defaults=r;}
    else if(kind==='stair')defaults=makeStair({x:0,z:0},{x:0,z:-value.run},value.width,value.style||'ramp',value.steps??12,value.label||'');
    else if(kind==='opening')defaults={label:value.type==='door'?'Door':'Window',...(value.type==='window'?{sill:.9,windowStyle:'plain'}:{doorStyle:'room'})};
    else {
      const bounds=(kind==='region'||kind==='roof')&&value.polygon?regionBounds(value.polygon):value;
      const a={x:bounds.minX,z:bounds.minZ},b={x:bounds.maxX,z:bounds.maxZ};
      defaults=kind==='roof'?makeRoofSection(a,b):makeRegion(a,b);
    }
    list.push({...defaults,...value,id:op.id});
  }else Object.assign(item,value);
  const updated=list.find(v=>v.id===op.id);
  if((kind==='region'||kind==='roof')&&updated.polygon)Object.assign(updated,regionBounds(updated.polygon));
  if(kind==='roof'&&updated.polygon===null)delete updated.polygon;
  if(kind==='roof'){const problem=manualRoofOutlineProblem(updated,building.roofSections,building.roof);if(problem)fail(problem,p);}
  if(kind==='roof'&&updated.hostRoofId===null)delete updated.hostRoofId;
  if(kind==='roof'||kind==='region')if(!rectValid(updated))fail('Rectangle must have positive width and depth of at least 0.1 m each',p);
  if(kind==='slab'&&(!rectValid(updated)||updated.minX>updated.maxX||updated.minZ>updated.maxZ))fail('Rectangle needs minX < maxX and minZ < maxZ, at least 0.1 m each',p);
  if(kind==='marker'){if(updated.details===null)updated.details='';const problem=markerProblem(updated);if(problem)fail(problem,p);}
  if(kind==='railing'){
    if(wallLength(updated)<=.15)fail('Railing segments must be longer than 0.15 m',p);
    if(updated.height>floorView(building,fi).wallHeight)fail('Railing height exceeds the story height',p);
  }
  if(kind==='wall'){
    const problem=wallSegmentProblem(updated.a,updated.b,list.filter(v=>v!==updated));
    if(problem)fail(problem,p);
    if(updated.wallTypeId===null)delete updated.wallTypeId;
    else if(updated.wallTypeId!==undefined&&!(building.wallTypes||[]).some(t=>t.id===updated.wallTypeId))fail(`Unknown wall type ID: ${updated.wallTypeId}`,`${p}/value/wallTypeId`);
    if(updated.inwardSide==='auto')delete updated.inwardSide;
    if(updated.height!==null&&updated.height>floorView(building,fi).wallHeight)fail('Wall height exceeds the story height',p);
  }
  if(kind==='light'&&action==='update'&&value.color)updated.color={a:1,...value.color};
  if(kind==='opening'){
    if(updated.shapeId===null)delete updated.shapeId;
    if(updated.type==='door'&&('sill' in value||'windowStyle' in value))fail('Door edits cannot set window fields',p);
    if(updated.type==='window'&&('doorStyle' in value||'leaves' in value))fail('Window edits cannot set door fields',p);
    {const problem=doorLeavesProblem(updated);if(problem)fail(problem,p);}
    if(updated.leaves===1)delete updated.leaves;
  }
}

// Floor stack edits use the web's proposeFloorStackEdit (Add above/below,
// Duplicate, Move up/down, Delete). New floors take the operation's id; a
// duplicate's copied contents get deterministic IDs "<new floor id>-<old id>"
// (the web assigns random IDs) so recipes stay reproducible.
// The shared proposal names the web checkbox; the CLI equivalent is a flag.
const cliReason=reason=>reason.replace('Enable Remove affected stairs','Set removeAffectedStairs: true');
function applyFloorStack(building,op,action,p){
  const indexOf=id=>building.floors.findIndex(f=>f.id===id);
  const removeAffectedStairs=op.removeAffectedStairs===true;
  if(action==='insert'||action==='duplicate'){
    if(indexOf(op.id)>=0)fail(`Floor ID already exists: ${op.id}`,p);
    const anchorId=action==='duplicate'?op.sourceFloorId:op.aboveFloorId??op.belowFloorId,anchor=indexOf(anchorId);
    if(anchor<0)fail(`Unknown floor ID: ${anchorId}`,p);
    const stackAction=action==='duplicate'?'duplicate':Object.hasOwn(op,'aboveFloorId')?'above':'below';
    const result=proposeFloorStackEdit(building,anchor,stackAction,{removeAffectedStairs,validateResult:false});if(!result.ok)fail(cliReason(result.reason),p);
    const added=result.building.floors[result.activeIndex];added.id=op.id;
    if(action==='duplicate'){
      // A copy of a copy replaces the source floor's prefix instead of
      // stacking it ("l5-x", not "l5-l4-x"), unless that would collide.
      const source=building.floors[anchor],keys=['walls','openings','lights','markers','regions','slabs','platforms','railings'];
      const prefix=`${source.id}-`,all=keys.flatMap(k=>(source[k]||[]).map(e=>e.id)),strip=id=>id.startsWith(prefix)?id.slice(prefix.length):id;
      const canStrip=new Set(all.map(strip)).size===all.length,newId=id=>`${op.id}-${canStrip?strip(id):id}`;
      for(const key of keys)(added[key]||[]).forEach((e,i)=>{e.id=newId(source[key][i].id);});
      added.openings.forEach((o,i)=>{o.wallId=newId(source.openings[i].wallId);});
    }
    for(const [key,value] of Object.entries(op.value||{}))if(value!==null)added[key]=value;
    if(added.boundaryMode==='closed')delete added.boundaryMode;
    building.floors=result.building.floors;
    return {action:action==='duplicate'?'duplicated':'inserted',floorId:op.id,anchorFloorId:anchorId,position:stackAction,removedEntities:[],removedIncomingStairs:result.affectedStairs};
  }
  const index=indexOf(op.id);if(index<0)fail(`Unknown floor ID: ${op.id}`,p);
  if(action==='remove'){
    const floor=building.floors[index];
    const contents=['walls','openings','lights','markers','stairs','regions','slabs','platforms','railings','roofSections'].flatMap(kind=>(floor[kind]||[]).map(item=>({kind,id:item.id,label:item.label||item.id})));
    if(contents.length&&!op.removeContents)fail(`Floor contains ${contents.length} entities; set removeContents: true to remove them, or remove its contents explicitly first`,p);
  }
  const result=proposeFloorStackEdit(building,index,action==='move'?op.direction:'remove',{removeAffectedStairs,validateResult:false});if(!result.ok)fail(cliReason(result.reason),p);
  const removedEntities=action==='remove'?['walls','openings','lights','markers','stairs','regions','slabs','platforms','railings','roofSections'].flatMap(kind=>(building.floors[index][kind]||[]).map(item=>({kind,id:item.id,label:item.label||item.id}))):[];
  building.floors=result.building.floors;
  return {action:action==='move'?`moved-${op.direction}`:'removed',floorId:op.id,removedEntities,removedIncomingStairs:result.affectedStairs};
}

// Shared wall types and doorway shapes: the same records and removal rules as
// the web dialogs (removing a type returns its walls to Standard; removing a
// shape makes its openings rectangular). Doorway shapes are schema 10.
function applySharedDefinition(building,op,kind,action,p){
  const key=kind==='wallType'?'wallTypes':'openingShapes',list=building[key] ||= [],item=list.find(v=>v.id===op.id);
  if(action==='add'&&item)fail(`${kind} ID already exists: ${op.id}`,p);
  if(action!=='add'&&!item)fail(`Unknown ${kind} ID: ${op.id}`,p);
  if(action==='remove'){
    list.splice(list.indexOf(item),1);
    const refKey=kind==='wallType'?'wallTypeId':'shapeId';
    for(const f of building.floors)for(const e of (kind==='wallType'?f.walls:f.openings)||[])if(e[refKey]===op.id)delete e[refKey];
    if(!list.length){delete building[key];if(kind==='openingShape'&&building.version===10)building.version=9;}
    return;
  }
  const next={...(item||{}),...structuredClone(op.value),id:op.id};
  const problem=kind==='wallType'?wallTypeProblem(next):openingShapeProblem(next);
  if(problem)fail(problem,`${p}/value`);
  if(item)Object.assign(item,next);else list.push(next);
  if(kind==='openingShape'&&(building.version??0)<10)building.version=10;
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
  // Only surfaces authored before this transaction and left at their height can
  // be stranded; ones added or moved in it were placed against the new stack.
  const heightOf=(kind,s)=>kind==='roofSections'?s.baseY:s.topY;
  const independentSurfaces=floors.length?['roofSections','manualFloors','manualCeilings'].flatMap(kind=>after[kind].filter(s=>{const old=(before[kind]||[]).find(o=>o.id===s.id);return old&&heightOf(kind,old)===heightOf(kind,s);}).map(s=>({kind,id:s.id,height:heightOf(kind,s)}))):[];
  return {floors,stairs,independentSurfaces};
}

export function applyTransaction(source,transaction,{warningsAsErrors=false,sourceSha256}={}){
  const report={ok:false,building:null,errors:[],warnings:[],normalizationChanges:[],changes:[],operations:[],floorStackChanges:[],stairChanges:[],platformChanges:[],floorCoverageChanges:[],structuralChanges:{floors:[],stairs:[],independentSurfaces:[]}};
  try{
    transaction=resolveNamedPoints(transaction);
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
