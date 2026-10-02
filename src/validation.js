import {roofWallDiagnostics} from './roof-wall-diagnostics.js';
import {profileWallState} from './wall-profile-geometry.js';
import {standardProfileJunction} from './profile-junctions.js';
import {exteriorWallOutsideSign,isExteriorWall} from './exporter.js';
import {wallTypeProblem,wallTypeFor,wallTypeOpeningProblem,sampleWallType} from './wall-types.js';
import { regionPolygonProblem, regionBounds } from './regions.js';
import { containsArea } from './polygon-areas.js';
import { manualRoofOutlineProblem, roofPolygonBounds } from './roof-outline.js';
import { REGION_KINDS, REGION_EFFECTS, floorElevation, floorWallHeight, floorSlabThickness, floorView, structuralFloorRectangles, exteriorFootprintIssue, stairFootprint, stairOpeningFootprint, wallLength, wallHeightFor, projectToWall, validateOpeningLayout, rectValid } from './model.js';
import { roofAttachmentDiagnostics, attachmentWarnings } from './roof-diagnostics.js';
import {markerProblem} from './markers.js';
import {openingShapeProblem,shapedOpeningProblem} from './opening-shapes.js';

// Non-mutating validation shared by JSON import, the editor and direct export.
// Warnings leave incomplete/custom architecture editable; errors protect output.
export function validateBuilding(building,{roofDiagnostics=false}={}){
  const errors=[],warnings=[];
  const error=(path,message,targets)=>errors.push({path,message:`${path}: ${message}`,...(targets?{targets}: {})});
  const warn=(path,message,targets)=>warnings.push({path,message:`${path}: ${message}`,...(targets?{targets}: {})});
  if(!building||typeof building!=='object'||Array.isArray(building))return {errors:[{message:'Expected a building object'}],warnings};
  const number=(value,path,min=-Infinity,max=Infinity,required=false)=>{
    if(value==null&&!required)return;
    if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)error(path,`expected a finite number in [${min}, ${max}]`);
  };
  // Catch non-finite numbers anywhere, including optional authored metadata.
  const scan=(value,path)=>{
    if(typeof value==='number'&&!Number.isFinite(value))error(path,'non-finite value');
    else if(value&&typeof value==='object')Object.entries(value).forEach(([k,v])=>scan(v,`${path}.${k}`));
  };
  scan(building,'building');
  if(building.version!=null&&(!Number.isInteger(building.version)||building.version<0||building.version>10))error('version','unsupported schema version; expected an integer from 0 through 10 or an unversioned legacy document');
  for(const [k,min,max] of [['wallHeight',.2,1000],['wallThickness',.001,100],['floorThickness',.001,100],['gridSize',.001,1000]])number(building[k],k,min,max);
  if(building.name!=null&&typeof building.name!=='string')error('name','must be text');
  if(building.exportProfile!=null&&!['generic','get_probed'].includes(building.exportProfile))error('exportProfile','unknown profile');
  for(const k of ['roof','ceiling','windowMesh','doorMesh']){
    const cfg=building[k];if(cfg==null)continue;
    if(typeof cfg!=='object'||Array.isArray(cfg)){error(k,'must be an object');continue;}
    for(const dim of ['thickness','frameWidth','frameDepth','glassThickness','panelThickness','detailDepth'])number(cfg[dim],`${k}.${dim}`,.001,100);
    number(cfg.pitch,`${k}.pitch`,0,80);number(cfg.overhang,`${k}.overhang`,0,100);
  }
  if(building.wallTypes!==undefined){
    if(!Array.isArray(building.wallTypes)||building.wallTypes.length>64)error('wallTypes','Use an array of at most 64 wall types.');
    else {const ids=new Set();for(const type of building.wallTypes){const problem=wallTypeProblem(type);if(problem)error('wallTypes',problem);else if(ids.has(type.id))error('wallTypes','Duplicate wall type ID');else ids.add(type.id);}}
  }
  if(building.openingShapes!==undefined){
    if(!Array.isArray(building.openingShapes)||building.openingShapes.length>64)error('openingShapes','Use an array of at most 64 doorway shapes.');
    else {const ids=new Set();for(const shape of building.openingShapes){const problem=openingShapeProblem(shape);if(problem)error('openingShapes',problem);else if(ids.has(shape.id))error('openingShapes','Duplicate doorway shape ID');else ids.add(shape.id);}}
  }
  const collections=(owner,names,path)=>{
    const seen=new Set();
    for(const name of names){
      const list=owner[name];if(list==null)continue;
      if(!Array.isArray(list)){error(`${path}.${name}`,'must be an array');continue;}
      list.forEach((obj,i)=>{
        const p=`${path}.${name}[${i}]`;
        if(!obj||typeof obj!=='object'||Array.isArray(obj)){error(p,'must be an object');return;}
        // Missing IDs are migrated on import; export does not invent identity.
        if(obj.id!=null){if(typeof obj.id!=='string'||!obj.id)error(p,'invalid ID');else if(seen.has(obj.id))error(p,`duplicate ID ${obj.id}`);seen.add(obj.id);}
        else warn(p,'missing ID; JSON import will assign one');
        if(obj.label!=null&&typeof obj.label!=='string')error(p,'label must be text');
        if(name==='markers'){const problem=markerProblem(obj);if(problem)error(p,problem);}
        if(name==='walls'){
          if(obj.wallTypeId!==undefined&&(typeof obj.wallTypeId!=='string'||!(Array.isArray(building.wallTypes)&&building.wallTypes.some(t=>t?.id===obj.wallTypeId))))error(p,'Wall references a missing wall type.');
          if(obj.inwardSide!==undefined&&!['auto','left','right'].includes(obj.inwardSide))error(p,'Unknown wall inward side.');
        }
        if(['walls','railings'].includes(name)){
          for(const end of ['a','b'])for(const axis of ['x','z'])number(obj[end]?.[axis],`${p}.${end}.${axis}`,-1e6,1e6,true);
          if(obj.a&&obj.b&&wallLength(obj)<.001)error(p,'zero-length segment');
        }
        if(['slabs','regions','platforms','roofSections','manualFloors','manualCeilings'].includes(name)){
          if(name==='regions'&&obj.polygon!==undefined){
            const problem=regionPolygonProblem(obj.polygon);if(problem)error(p,problem);
            else {const bounds=regionBounds(obj.polygon);for(const k of Object.keys(bounds))if(obj[k]!==undefined&&Math.abs(obj[k]-bounds[k])>1e-5)error(p,'Polygon bounds must match its corners.');}
          }else if(obj.polygon!==undefined&&name!=='roofSections')error(p,'Authored polygons are supported for regions and manual roofs only.');
          for(const axis of ['minX','maxX','minZ','maxZ'])number(obj[axis],`${p}.${axis}`,-1e6,1e6,true);
          if(obj.maxX<=obj.minX||obj.maxZ<=obj.minZ)error(p,'rectangle must have positive area');
        }
        for(const axis of ['x','z','topY','baseY','sill'])number(obj[axis],`${p}.${axis}`,-1e6,1e6);
        for(const dim of ['width','run','thickness'])number(obj[dim],`${p}.${dim}`,.001,10000);
        number(obj.height,`${p}.height`,name==='platforms'?-10000:.001,10000);
        number(obj.pitch,`${p}.pitch`,0,80);number(obj.overhang,`${p}.overhang`,0,100);
        if(name==='platforms'){
          if(obj.kind!=null&&!['porch','deck'].includes(obj.kind))error(p,'unknown platform kind');
          if(obj.covered!=null&&typeof obj.covered!=='boolean')error(p,'platform roof coverage must be boolean');
        }
        if(name==='regions'){
          if(obj.kind!=null&&!REGION_KINDS.includes(obj.kind))error(p,'unknown region kind');
          if(obj.effect!=null&&!REGION_EFFECTS.includes(obj.effect))error(p,'unknown region effect');
        }
        if(name==='roofSections'){
          if(obj.hostRoofId!=null&&(typeof obj.hostRoofId!=='string'||!obj.hostRoofId))error(p,'host roof ID must be nonempty text');
          if(obj.edgeModes!=null){
            if(typeof obj.edgeModes!=='object'||Array.isArray(obj.edgeModes))error(p,'roof edge modes must be an object');
            else for(const [edge,mode] of Object.entries(obj.edgeModes))if(!['minX','maxX','minZ','maxZ'].includes(edge)||!['overhang','flush'].includes(mode))error(p,'unknown roof edge or edge mode');
          }
        }
        if(name==='stairs'){
          number(obj.width,`${p}.width`,.5,10000,true);number(obj.run,`${p}.run`,1,10000,true);
          number(obj.steps,`${p}.steps`,2,512);
          if(!['north','south','east','west'].includes(obj.direction))error(p,'invalid stair direction');
        }
        if(name==='openings'){
          if(obj.shapeId!==undefined){
            if(typeof obj.shapeId!=='string'||!obj.shapeId||!Array.isArray(building.openingShapes)||!building.openingShapes.some(s=>s?.id===obj.shapeId))error(p,'Opening references a missing doorway shape.');
            if(obj.type!=='door')error(p,'Custom doorway shapes are supported for doors and empty passages only.');
          }
          if(!['door','window'].includes(obj.type))error(p,'unknown opening type');
          number(obj.t,`${p}.t`,0,1,true);
          if(typeof obj.wallId!=='string')error(p,'missing wall reference');
        }
        if(name==='lights'){
          for(const axis of ['x','y','z'])number(obj.position?.[axis],`${p}.position.${axis}`,-1e6,1e6,true);
          number(obj.energy,`${p}.energy`,0,1e6);number(obj.range,`${p}.range`,.1,1e6);
          if(obj.color!==undefined&&(obj.color===null||typeof obj.color!=='object'||Array.isArray(obj.color)))error(`${p}.color`,'expected an object {r, g, b, a} with channels from 0 to 1');
          else for(const c of ['r','g','b','a'])number(obj.color?.[c],`${p}.color.${c}`,0,1);
          if(obj.group!=null&&typeof obj.group!=='string')error(p,'light group must be text');
        }
      });
    }
  };
  collections(building,['manualFloors','manualCeilings','roofSections'],'building');
  if(Array.isArray(building.roofSections))for(const roof of building.roofSections){
    // Polygon and hip footprints (Halcyon): shared outline rules; polygon bounds must match.
    {const problem=manualRoofOutlineProblem(roof,building.roofSections,building.roof);if(problem)error('roofSections',`${roof?.label||roof?.id}: ${problem}`,[{type:'roofSection',id:roof?.id}]);
     if(!problem&&roof?.polygon){const b=roofPolygonBounds(roof.polygon);if(['minX','maxX','minZ','maxZ'].some(k=>Math.abs(b[k]-roof[k])>1e-6))error('roofSections',`${roof.label||roof.id}: roof bounds must match its polygon corners`,[{type:'roofSection',id:roof.id}]);}}
    if(!roof?.hostRoofId)continue;
    const host=building.roofSections.find(r=>r?.id===roof.hostRoofId);
    const targets=[{type:'roofSection',id:roof.id},...(host?[{type:'roofSection',id:host.id}]:[])];
    if(!host)error('roofSections','attached roof references a missing host',targets);
    else if(host===roof||host.hostRoofId)error('roofSections','choose an independent host roof; self references, chains and cycles are not supported',targets);
    if((roof.type||'gable')==='gable'&&(roof.gableEnds||'both')!=='none')warn('roofSections',`${roof.label||roof.id}: attachment trims roof slabs and gable panels; review gable end fills separately`,targets);
  }
  // Independent pieces may be intentional, so warn rather than deleting them.
  for(const name of ['manualFloors','manualCeilings','roofSections']){
    const list=Array.isArray(building[name])?building[name]:[];
    for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){
      const a=list[i],b=list[j];if(!a||!b)continue;
      if(name==='roofSections'&&(a.hostRoofId===b.id||b.hostRoofId===a.id))continue;
      const y=name==='roofSections'?'baseY':'topY';
      if(Math.abs(a[y]-b[y])<.001&&Math.min(a.maxX,b.maxX)-Math.max(a.minX,b.minX)>.001&&Math.min(a.maxZ,b.maxZ)-Math.max(a.minZ,b.minZ)>.001)warn(name,`${a.id} / ${b.id} overlap at the same height; check duplicate surfaces`,[a,b].map(q=>({type:{roofSections:'roofSection',manualFloors:'manualFloor',manualCeilings:'manualCeiling'}[name],id:q.id})));
    }
  }
  if(building.floors!=null&&!Array.isArray(building.floors))error('floors','must be an array');
  const floors=Array.isArray(building.floors)&&building.floors.length?building.floors:[building];
  const floorIds=new Set();
  floors.forEach((f,i)=>{
    if(!f||typeof f!=='object'){error(`Floor ${i+1}`,'invalid floor');return;}
    if(f.id){if(floorIds.has(f.id))error(`Floor ${i+1}`,'duplicate floor ID');floorIds.add(f.id);}
    number(f.elevation,`Floor ${i+1}.elevation`,-1e6,1e6);
    number(f.wallHeight,`Floor ${i+1}.wallHeight`,.2,1000);
    number(f.floorThickness,`Floor ${i+1}.floorThickness`,.001,100);
    if(f.boundaryMode!=null&&!['closed','intentional_open'].includes(f.boundaryMode))error(`Floor ${i+1}`,'invalid boundary mode');
    collections(f,['walls','openings','stairs','lights','markers','slabs','regions','platforms','railings','roofSections'],`Floor ${i+1}`);
  });
  if(errors.length)return {errors,warnings};
  for(const f of floors)for(const o of f.openings||[]){const problem=shapedOpeningProblem(building,o);if(problem)error(o.id||'opening',problem,[{type:'opening',id:o.id,floorId:f.id}]);}
  if(errors.length)return {errors,warnings};
  floors.forEach((f,i)=>{
    const p=`Floor ${i+1}`;
    if(i>0){
      const rise=floorElevation(building,i)-floorElevation(building,i-1);
      if(rise<=.01)error(p,'elevation must be above the preceding floor');
      const gap=rise-floorWallHeight(building,i-1)-floorSlabThickness(building,i);
      if(Math.abs(gap)>.001)warn(p,gap>0?'level spacing leaves a vertical wall gap below this slab; adjust the lower wall height':'level spacing overlaps the preceding story; check walls and ceilings');
    }
    const view=floorView(building,f,i===floors.length-1);
    const junction=(wall,end)=>standardProfileJunction(view,wall,end,w=>profileWallState(view,w,exteriorWallOutsideSign,isExteriorWall));
    const splitBranch=(wall,end,neighbors)=>neighbors.some(q=>['a','b'].some(e=>{if(Math.hypot(q[e].x-wall[end].x,q[e].z-wall[end].z)>=1e-5)return false;const link=junction(q,e);return link?.split&&!link.reason&&link.hosts.includes(wall);}));
    if(['gable','shed'].includes(building.roof?.type)&&structuralFloorRectangles(view).some(r=>r.polygon))warn(p,'angled outline: choose Hip / polygon or Flat for an outline-following automatic roof; gable and shed roofs use rectangular sections');
    for(const wall of view.walls){
      const type=wallTypeFor(building,wall);if(!type)continue;
      for(const o of view.openings.filter(o=>o.wallId===wall.id)){const problem=wallTypeOpeningProblem(type,wallHeightFor(view,wall),o,view.wallThickness,view);if(problem)error(p,`${wall.label||wall.id}: ${problem}`);}
      // Each end's fitting may cut back up to the profile's reach. A plain join
      // to one other shaped wall only cuts reach x tan(turn/2), so smooth curves
      // built from short sections are allowed (Halcyon H12); every other end
      // keeps the full reach. Both cuts must fit in 90% of the wall.
      {
        const reach=Math.max(...type.stations.map(q=>Math.abs(q.offset)+q.thickness/2)),length=wallLength(wall);
        const setback=end=>{
          const J=wall[end],far=wall[end==='a'?'b':'a'],joined=view.walls.filter(q=>q!==wall&&[q.a,q.b].some(v=>Math.hypot(v.x-J.x,v.z-J.z)<1e-5));
          const passes=view.walls.some(q=>q!==wall&&!joined.includes(q)&&projectToWall(q,J).distance<1e-5);
          if(joined.length!==1||passes||!wallTypeFor(building,joined[0]))return reach;
          const q=joined[0],other=Math.hypot(q.a.x-J.x,q.a.z-J.z)<1e-5?q.b:q.a;
          const u={x:J.x-far.x,z:J.z-far.z},v={x:other.x-J.x,z:other.z-J.z},cos=(u.x*v.x+u.z*v.z)/(Math.hypot(u.x,u.z)*Math.hypot(v.x,v.z));
          const turn=Math.acos(Math.max(-1,Math.min(1,cos)));
          return reach*Math.min(1,Math.tan(turn/2));
        };
        if(setback('a')+setback('b')>length*.9)error(p,`${wall.label||wall.id}: profile is too wide for this short wall; reduce the offset/thickness or lengthen the section.`);
      }
      for(const end of ['a','b']){
        const neighbors=view.walls.filter(q=>q!==wall&&[q.a,q.b].some(v=>Math.hypot(v.x-wall[end].x,v.z-wall[end].z)<1e-5));
        if(neighbors.length>1&&!splitBranch(wall,end,neighbors))error(p,'Shaped walls currently need unbranched endpoint joins; use a Standard section at a T junction.');
        for(const q of neighbors){
          if(splitBranch(wall,end,[q]))continue;
          const dx=wall.b.x-wall.a.x,dz=wall.b.z-wall.a.z,qx=q.b.x-q.a.x,qz=q.b.z-q.a.z;
          if(Math.abs(dx*qz-dz*qx)<1e-6){
            const ownState=profileWallState(view,wall,exteriorWallOutsideSign,isExteriorWall),otherState=profileWallState(view,q,exteriorWallOutsideSign,isExteriorWall),height=Math.min(ownState.height,otherState.height);
            const levels=[0,height,...type.stations.map(p=>p.height*ownState.height),...(otherState.type?.stations||[]).map(p=>p.height*otherState.height)].filter(y=>y<=height);
            if(levels.some(y=>{const a=sampleWallType(type,y/ownState.height),c=sampleWallType(otherState.type,y/otherState.height,view.wallThickness),offset=c.offset*(ownState.n.x*otherState.n.x+ownState.n.z*otherState.n.z);return Math.abs(a.offset-offset)>=(a.thickness+c.thickness)/2-1e-5;}))error(p,'Straight adjoining wall profiles do not meet at every height. A transition across this gap is not yet supported; use matching profiles, a corner or separate walls.');
          }
          const v=wall[end],other=[q.a,q.b].find(a=>Math.hypot(a.x-v.x,a.z-v.z)>1e-5),own=wall[end==='a'?'b':'a'];if(other&&((other.x-v.x)*(own.x-v.x)+(other.z-v.z)*(own.z-v.z))/(wallLength(wall)*wallLength(q))>.866)error(p,'Shaped wall corner is too acute; use an angle of at least 30 degrees.');}
        for(const q of view.walls.filter(q=>q!==wall)){const hit=projectToWall(q,wall[end]);if(hit.distance<1e-5&&hit.t>1e-5&&hit.t<1-1e-5)error(p,'Shaped wall ends cannot terminate midway along another wall; use a Standard junction section.');}
      }
      for(const q of view.walls.filter(q=>q!==wall))for(const end of ['a','b']){const hit=projectToWall(wall,q[end]);if(hit.distance<1e-5&&hit.t>1e-5&&hit.t<1-1e-5){const link=junction(q,end);if(!link||link.reason)error(p,`${q.label||q.id}: ${link?.reason||'a shaped branch cannot terminate midway along another shaped wall; use a Standard wall meeting the host at 30 degrees or more'}.`);}}
      if(type.stations.filter(q=>q.height===0||q.height===1).some(q=>Math.abs(q.offset)>1e-5||Math.abs(q.thickness-view.wallThickness)>1e-5))warn(p,`${wall.label||wall.id}: profile changes the floor/top edge; review floor, ceiling, gable and story joins, which still use the plan footprint.`);
    }
    // Fitting both ends must not reverse or collapse a short partition.
    for(const wall of view.walls.filter(w=>!wallTypeFor(view,w))){
      const links=['a','b'].map(end=>junction(wall,end));for(const link of links)if(link?.split&&link.reason)error(p,`${wall.label||wall.id}: ${link.reason}.`);if(!links.some(Boolean)||links.some(q=>q?.reason))continue;
      const states=links.map(q=>q?profileWallState(view,q.host,exteriorWallOutsideSign,isExteriorWall):null),length=wallLength(wall),d={x:(wall.b.x-wall.a.x)/length,z:(wall.b.z-wall.a.z)/length},height=wallHeightFor(view,wall);
      const levels=[0,height,...states.flatMap(q=>(q?.type.stations||[]).map(p=>p.height*q.height))].filter(y=>y<=height);
      if(levels.some(y=>[-1,1].some(side=>{const across={x:-d.z*side*view.wallThickness/2,z:d.x*side*view.wallThickness/2};const ends=states.map((q,i)=>(i?length:0)+(q?(sampleWallType(q.type,y/q.height,view.wallThickness).offset-q.n.x*across.x-q.n.z*across.z)/(q.n.x*d.x+q.n.z*d.z):0));return ends[1]-ends[0]<.01;})))error(p,`${wall.label||wall.id}: fitted ends collapse this Standard wall; lengthen it or reduce the host offsets.`);
    }
    // A neighboring miter can occupy the plan space of a near-corner opening.
    // Only shaped walls are checked, so plans without wall types skip the scan.
    if((building.wallTypes||[]).length)for(const wall of view.walls)for(const end of ['a','b']){
      const origin=wall[end],own=wall[end==='a'?'b':'a'],type=wallTypeFor(building,wall);
      for(const q of view.walls.filter(q=>q!==wall&&[q.a,q.b].some(v=>Math.hypot(v.x-origin.x,v.z-origin.z)<1e-5))){
        const otherType=wallTypeFor(building,q);if(!type&&!otherType)continue;
        const link=junction(wall,end);if(link?.split&&!link.reason&&link.hosts.includes(q))continue;
        if(['a','b'].some(e=>{if(Math.hypot(q[e].x-origin.x,q[e].z-origin.z)>=1e-5)return false;const link=junction(q,e);return link?.split&&!link.reason&&link.hosts.includes(wall);}))continue;
        const other=[q.a,q.b].find(v=>Math.hypot(v.x-origin.x,v.z-origin.z)>1e-5);if(!other)continue;
        const cosine=Math.max(-1,Math.min(1,((own.x-origin.x)*(other.x-origin.x)+(own.z-origin.z)*(other.z-origin.z))/(wallLength(wall)*wallLength(q)))),angle=Math.acos(cosine);
        const extent=Math.max(...[type,otherType].flatMap(t=>(t?.stations||[{offset:0,thickness:view.wallThickness}]).map(s=>Math.abs(s.offset)+s.thickness/2))),clearance=extent/Math.tan(angle/2);
        for(const o of view.openings.filter(o=>o.wallId===wall.id)){const distance=wallLength(wall)*(end==='a'?o.t:1-o.t)-o.width/2;if(distance<clearance-1e-5)error(p,`${o.label||o.id}: opening is too close to a shaped wall corner; leave at least ${clearance.toFixed(2)} m from endpoint ${end.toUpperCase()}.`);}
      }
    }
    const platforms=Array.isArray(f.platforms)?f.platforms:[];
    for(let a=0;a<platforms.length;a++)for(let b=a+1;b<platforms.length;b++){
      const first=platforms[a],second=platforms[b];
      if(Math.abs((first.height||0)-(second.height||0))<.001&&Math.min(first.maxX,second.maxX)-Math.max(first.minX,second.minX)>.001&&Math.min(first.maxZ,second.maxZ)-Math.max(first.minZ,second.minZ)>.001)
        warn(p,`platforms ${first.id} / ${second.id} overlap at the same height; review duplicate slabs`,[first,second].map(q=>({type:'platform',id:q.id,floorId:f.id})));
    }
    for(const issue of validateOpeningLayout(view))if(['overlap','missing_wall'].includes(issue.type))error(p,issue.message,[issue.opening,issue.other].filter(Boolean).map(q=>({type:'opening',id:q.id,floorId:f.id})));
    const walls=f.walls||[];
    for(let a=0;a<walls.length;a++){
      const u=walls[a],dx=u.b.x-u.a.x,dz=u.b.z-u.a.z,L=wallLength(u);
      const cross=q=>dx*(q.z-u.a.z)-dz*(q.x-u.a.x);
      for(let b=a+1;b<walls.length;b++){
      const v=walls[b];
      if(Math.abs(cross(v.a))<1e-5*L&&Math.abs(cross(v.b))<1e-5*L){
        const t=q=>((q.x-u.a.x)*dx+(q.z-u.a.z)*dz)/L;
        if(Math.min(L,Math.max(t(v.a),t(v.b)))-Math.max(0,Math.min(t(v.a),t(v.b)))>1e-4)warn(p,`walls ${u.id} / ${v.id} overlap; remove redundant geometry`,[u,v].map(q=>({type:'wall',id:q.id,floorId:f.id})));
      }
      }
    }
    const exterior=walls.filter(w=>w.role==='exterior');
    const key=p=>`${p.x.toFixed(4)},${p.z.toFixed(4)}`,degree=new Map();
    exterior.forEach(w=>[w.a,w.b].forEach(p=>degree.set(key(p),(degree.get(key(p))||0)+1)));
    // With explicit coverage (solid regions or Floor Footprints) the wall
    // graph no longer drives the automatic footprint: branches such as towers
    // abutting ranges are expected, and an exterior end counts as joined when
    // it touches any other wall (centreline or face), e.g. a parapet ending
    // against a tower. Only genuinely free ends still warn.
    const explicitCoverage=!!(f.slabs?.some(rectValid)||f.regions?.some(r=>r.effect==='solid'));
    if(explicitCoverage){
      const reach=(Number(view.wallThickness)||.18)/2+1e-4;
      const free=exterior.filter(w=>['a','b'].some(end=>degree.get(key(w[end]))===1&&!walls.some(q=>q!==w&&projectToWall(q,w[end]).distance<=reach)));
      if(free.length&&f.boundaryMode!=='intentional_open')warn(p,`exterior walls have free-standing ends (${free.slice(0,6).map(w=>w.label||w.id).join(', ')}${free.length>6?', …':''}); join them to another wall, or mark intentional access openings in Floors`,free.map(w=>({type:'wall',id:w.id,floorId:f.id})));
    }
    else if(exterior.length&&[...degree.values()].some(n=>n>2))warn(p,'exterior boundary is branched; check wall layout and automatic footprint');
    else if(exterior.length&&[...degree.values()].some(n=>n===1)&&f.boundaryMode!=='intentional_open'){
      // An end that stops partway along another exterior wall (a T) closes
      // nothing: the outline needs that host split at the junction.
      const tees=exterior.flatMap(w=>['a','b'].filter(end=>degree.get(key(w[end]))===1).flatMap(end=>{const host=exterior.find(q=>q!==w&&(()=>{const r=projectToWall(q,w[end]);return r.distance<=1e-4&&r.t>1e-6&&r.t<1-1e-6;})());return host?[{wall:w,host,at:w[end]}]:[];}));
      const detail=tees.length?` ${tees.slice(0,3).map(t=>`${t.wall.label||t.wall.id} ends partway along ${t.host.label||t.host.id} at (${+t.at.x.toFixed(3)}, ${+t.at.z.toFixed(3)})`).join('; ')}${tees.length>3?'; …':''}: an outline only closes at shared endpoints, so split the host wall there (wall.split, or Split wall in the wall panel), or set Floor Footprints for the coverage.`:'';
      // Free ends that nearly meet (within 5 cm) are almost always a missed join.
      const ends=exterior.flatMap(w=>['a','b'].filter(end=>degree.get(key(w[end]))===1&&!tees.some(t=>t.wall===w&&t.at===w[end])).map(end=>({wall:w,end})));
      const near=[];for(let i=0;i<ends.length;i++)for(let j=i+1;j<ends.length;j++){const a=ends[i],b=ends[j],d=Math.hypot(a.wall[a.end].x-b.wall[b.end].x,a.wall[a.end].z-b.wall[b.end].z);if(d<=.05&&a.wall!==b.wall)near.push({a,b,d});}
      const nearDetail=near.length?` ${near.slice(0,3).map(q=>`${q.a.wall.label||q.a.wall.id} end ${q.a.end.toUpperCase()} is ${+q.d.toPrecision(2)} m from ${q.b.wall.label||q.b.wall.id} end ${q.b.end.toUpperCase()}`).join('; ')}${near.length>3?'; …':''}: move one endpoint onto the other (wall.move-endpoint, or drag it in the plan) to close the loop.`:'';
      warn(p,`exterior boundary has open ends; mark intentional access openings in Floors or close the wall loop.${detail}${nearDetail}`,[...new Set([...tees.flatMap(t=>[t.wall,t.host]),...near.flatMap(q=>[q.a.wall,q.b.wall])])].map(q=>({type:'wall',id:q.id,floorId:f.id})));
    }
    const footprintIssue=exteriorFootprintIssue(view);
    if(exterior.length&&footprintIssue&&!(f.slabs?.length)&&!f.regions?.some(r=>r.effect==='solid'))warn(p,`automatic footprint uses rectangular bounds here. ${f.boundaryMode==='intentional_open'?'The intentional opening needs explicit coverage.':footprintIssue} Use Floor Footprint to define the intended coverage.`);
    if(f.slabs?.length&&f.regions?.some(r=>r.effect==='solid'))warn(p,'Floor Footprints take precedence over solid regions; void regions still cut automatic surfaces');
    if(f.regions?.some(r=>r.effect==='void')){
      if(building.roof?.type!=='none'&&(building.roof?.overhang||0)>0)warn(p,'roof eaves can overhang region cutouts; use zero overhang to keep their exact outline clear');
      // Only independent pieces that overlap a void in plan, within this
      // story's height (its slab up to the next floor), can fill or cover it.
      const voids=f.regions.filter(r=>r.effect==='void'&&rectValid(r)),margin=r=>Math.max(0,Number(r.overhang)||0);
      const bottom=floorElevation(building,i)-floorSlabThickness(building,i),top=i+1<floors.length?floorElevation(building,i+1):floorElevation(building,i)+floorWallHeight(building,i)+floorSlabThickness(building,i);
      const inStory=y=>!Number.isFinite(Number(y))||(Number(y)>=bottom-1e-6&&Number(y)<=top+1e-6);
      const overlapsVoid=r=>rectValid(r)&&voids.some(v=>Math.min(r.maxX+margin(r),v.maxX)-Math.max(r.minX-margin(r),v.minX)>1e-6&&Math.min(r.maxZ+margin(r),v.maxZ)-Math.max(r.minZ-margin(r),v.minZ)>1e-6);
      const independent=[...[...(building.manualFloors||[]),...(building.manualCeilings||[])].filter(r=>inStory(r.topY)),...(building.roofSections||[]).filter(r=>inStory(r.baseY)),...(f.platforms||[])];
      if(independent.some(overlapsVoid))warn(p,'region cutouts affect automatic surfaces only; review independent floors, ceilings, roofs and platforms over the void');
    }
    const stairs=f.stairs||[];
    for(let a=0;a<stairs.length;a++)for(let b=a+1;b<stairs.length;b++){
      const u=stairFootprint(stairs[a]),v=stairFootprint(stairs[b]);
      if(Math.min(u.maxX,v.maxX)-Math.max(u.minX,v.minX)>1e-4&&Math.min(u.maxZ,v.maxZ)-Math.max(u.minZ,v.minZ)>1e-4)
        warn(p,`stairs ${stairs[a].id} / ${stairs[b].id} overlap; review shared openings and walking collision`,[stairs[a],stairs[b]].map(q=>({type:'stair',id:q.id,floorId:f.id})));
    }
    for(const s of stairs){
      const targets=[{type:'stair',id:s.id,floorId:f.id}];
      const h=stairFootprint(s),horizontal=['east','west'].includes(s.direction),positive=['east','south'].includes(s.direction);
      const point=(top)=>{const sign=(top===positive)?1:-1;return {x:s.x+(horizontal?sign*(s.run/2+.08):0),z:s.z+(!horizontal?sign*(s.run/2+.08):0)};};
      for(const [j,top] of [[i,false],[i+1,true]]){
        const target=floors[j];
        if(!target){warn(p,`${s.label||s.id}: no upper floor for landing`,targets);continue;}
        const tv=floorView(building,target),rects=tv.autoFloor!==false?structuralFloorRectangles(tv):[];
        const y=floorElevation(building,j);
        rects.push(...(building.manualFloors||[]).filter(r=>Math.abs(r.topY-y)<.02),...(target.platforms||[]).filter(r=>Math.abs(r.height||0)<.02));
        const pt=point(top),half=s.width/2-.01;
        const supported=[-half,0,half].every(offset=>{const x=pt.x+(horizontal?0:offset),z=pt.z+(horizontal?offset:0);return rects.some(r=>containsArea(r,{x,z}));});
        if(!supported)warn(p,`${s.label||s.id}: ${top?'upper landing':'lower entrance'} lacks full-width floor support`,targets);
        if(top&&tv.autoFloor!==false&&stairs.some(other=>{
          if(other===s)return false;const hole=stairOpeningFootprint(other);
          return [-half,0,half].some(offset=>{const x=pt.x+(horizontal?0:offset),z=pt.z+(horizontal?offset:0);return x>hole.minX+1e-4&&x<hole.maxX-1e-4&&z>hole.minZ+1e-4&&z<hole.maxZ-1e-4;});
        }))warn(p,`${s.label||s.id}: upper landing enters another stair opening; review landing surfaces`,targets);
      }
      const rise=i+1<floors.length?floorElevation(building,i+1)-floorElevation(building,i):0;
      if(rise>0&&Math.atan2(rise,s.run)*180/Math.PI>45)warn(p,`${s.label||s.id}: incline exceeds 45 degrees; check character slope limits`,targets);
      if(walls.some(w=>Math.max(w.a.x,w.b.x)>h.minX&&Math.min(w.a.x,w.b.x)<h.maxX&&Math.max(w.a.z,w.b.z)>h.minZ&&Math.min(w.a.z,w.b.z)<h.maxZ))warn(p,`${s.label||s.id}: wall intersects stair footprint; check clearance`,targets);
    }
  });
  // Godot stores vertices as 32-bit floats: far from the origin, exported
  // positions round to whole millimetres or worse (Halcyon H13).
  {
    let far=0;
    const reach=(x,z)=>{const r=Math.max(Math.abs(Number(x)||0),Math.abs(Number(z)||0));if(r>far)far=r;};
    for(const f of floors){
      for(const w of f.walls||[]){reach(w.a.x,w.a.z);reach(w.b.x,w.b.z);}
      for(const k of ['regions','slabs','platforms'])for(const r of f[k]||[]){reach(r.minX,r.minZ);reach(r.maxX,r.maxZ);}
      for(const r of f.railings||[]){reach(r.a.x,r.a.z);reach(r.b.x,r.b.z);}
      for(const s of f.stairs||[])reach(s.x,s.z);
    }
    for(const r of [...(building.roofSections||[]),...(building.manualFloors||[]),...(building.manualCeilings||[])]){reach(r.minX,r.minZ);reach(r.maxX,r.maxZ);}
    if(far>10000){const step=Math.pow(2,Math.floor(Math.log2(far))-23);warn('Building',`plan coordinates reach ${Math.round(far).toLocaleString('en-US')} m from the origin, where Godot's 32-bit vertex positions round to ${step>=.01?`${Number((step*100).toPrecision(2))} cm`:`${Number((step*1000).toPrecision(2))} mm`}; author the building near the origin and position the scene in Godot instead`);}
  }
  // Geometry diagnostics are opt-in for prepared documents. Raw import checks
  // run before normalization and must not retain warnings about missing defaults.
  if(!errors.length)for(const issue of roofWallDiagnostics(building))warnings.push({...issue,path:`Floor ${issue.floorIndex+1}`,message:`Floor ${issue.floorIndex+1}: ${issue.message}`,targets:[{type:'wall',id:issue.wallId,floorId:floors[issue.floorIndex]?.id}]});
  if(roofDiagnostics&&!errors.length){
    const roofAttachments=roofAttachmentDiagnostics(building);
    warnings.push(...attachmentWarnings(roofAttachments));return {errors,warnings,roofAttachments};
  }
  return {errors,warnings};
}

export function assertValidBuilding(building){
  const result=validateBuilding(building);
  if(result.errors.length)throw new Error(result.errors[0].message);
  return result;
}
