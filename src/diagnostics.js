import {roofWallDiagnostics} from './roof-wall-diagnostics.js';
import { areaSize } from './polygon-areas.js';
import { normalizeBuilding } from './document.js';
import { validateBuilding } from './validation.js';
import { floorView, floorElevation, footprintInfo, stairFootprint, stairOpeningFootprint, manualFloorRectanglesAtLevel, subtractRectAreas } from './model.js';
import { exportGodotFiles, isExteriorWall, floorRectanglesForView } from './exporter.js';
import { roofAttachmentDiagnostics } from './roof-diagnostics.js';

// Browser-safe, non-mutating document preparation. Missing imported IDs are
// deterministic and collision-free; newly drawn UI objects still use uid().
export function prepareDocument(source){
  const before=validateBuilding(source);
  if(before.errors.length)return {...before,building:null,normalized:false};
  const data=structuredClone(source),ids=new Set();
  function collect(value){if(!value||typeof value!=='object')return;if(typeof value.id==='string')ids.add(value.id);for(const child of Object.values(value))collect(child);}
  collect(data);let n=0;
  const idFactory=kind=>{let id;do{id=`import_${kind}_${++n}`;}while(ids.has(id));ids.add(id);return id;};
  const building=normalizeBuilding(data,{idFactory}),after=validateBuilding(building,{roofDiagnostics:true});
  const warnings=[...new Map([...before.warnings,...after.warnings].map(w=>[w.message,w])).values()];
  return {building,errors:after.errors,warnings,normalized:JSON.stringify(source)!==JSON.stringify(building)};
}

export function resolvedFloorDimensions(building,index){
  const view=floorView(building,index),elevation=floorElevation(building,index);
  return {elevation,wallHeight:view.wallHeight,floorThickness:view.floorThickness,wallTop:elevation+view.wallHeight};
}

export function inspectStair(building,index,stair){
  const lower=building.floors[index],upper=building.floors[index+1];
  const bottomY=floorElevation(building,index),topY=upper?floorElevation(building,index+1):null;
  const rise=topY===null?null:topY-bottomY;
  return {id:stair.id,floorId:lower.id,upperFloorId:upper?.id??null,label:stair.label,
    x:stair.x,z:stair.z,width:stair.width,run:stair.run,direction:stair.direction,style:stair.style,steps:stair.steps,blockBelow:stair.blockBelow,
    bottomY,topY,rise,slopeDegrees:rise===null?null:Math.atan2(rise,stair.run)*180/Math.PI,
    stepRise:stair.style==='steps'&&rise!==null?rise/stair.steps:null,treadDepth:stair.style==='steps'?stair.run/stair.steps:null,
    footprint:stairFootprint(stair),openingFootprint:stairOpeningFootprint(stair),
    verification:'Derived geometry only; landing/slope warnings are separate and do not certify character clearance.'};
}

export function inspectPlatform(building,index,platform){
  const view=floorView(building,index),topY=floorElevation(building,index)+platform.height;
  const {id,label,kind,covered,height,minX,maxX,minZ,maxZ}=platform;
  return {id,floorId:building.floors[index].id,label,kind,covered,height,minX,maxX,minZ,maxZ,
    width:maxX-minX,depth:maxZ-minZ,area:(maxX-minX)*(maxZ-minZ),topY,bottomY:topY-view.floorThickness};
}

// Actual automatic slab coverage, using export cuts and the same manual-floor
// tolerance. Platform contribution is a union difference, never a sum of hits.
export function inspectFloorCoverage(building,index){
  const view=floorView(building,index),topY=floorElevation(building,index),enabled=view.autoFloor!==false;
  const below=index>0?building.floors[index-1].stairs:[];
  const overrides=manualFloorRectanglesAtLevel(building,topY,Math.max(.05,view.floorThickness*.6));
  const rectangles=enabled?subtractRectAreas(floorRectanglesForView(view,below),overrides):[];
  const withoutPlatforms=enabled?subtractRectAreas(floorRectanglesForView({...view,platforms:[]},below),overrides):[];
  const area=rects=>rects.reduce((sum,r)=>sum+areaSize(r),0);
  return {enabled,topY,area:area(rectangles),rectangles,platformCutoutArea:Math.max(0,area(withoutPlatforms)-area(rectangles)),
    verification:'Automatic floor slab only, after stairs, platform cutouts and manual-floor overrides; excludes platform/manual surfaces and is not a walkability check.'};
}

export function inspectBuilding(building,options={}){
  const files=exportGodotFiles(building,options),scenes=[files.tscn,...files.doors.map(d=>d.tscn)];
  const floors=building.floors.map((f,i)=>{
    const view=floorView(building,i),walls=f.walls||[];
    return {id:f.id,label:f.label,index:i+1,...resolvedFloorDimensions(building,i),footprint:footprintInfo(view),stairs:f.stairs.map(s=>inspectStair(building,i,s)),platforms:f.platforms.map(p=>inspectPlatform(building,i,p)),floorCoverage:inspectFloorCoverage(building,i),
      counts:{walls:walls.length,exteriorWalls:walls.filter(w=>isExteriorWall(view,w)).length,interiorWalls:walls.filter(w=>!isExteriorWall(view,w)).length,
        doors:f.openings.filter(o=>o.type==='door').length,windows:f.openings.filter(o=>o.type==='window').length,stairs:f.stairs.length,lights:f.lights.length,markers:(f.markers||[]).length,platforms:f.platforms.length,regions:f.regions.length}};
  });
  const counts=Object.fromEntries(Object.keys(floors[0].counts).map(k=>[k,floors.reduce((n,f)=>n+f.counts[k],0)]));
  const count=pattern=>scenes.reduce((n,s)=>n+[...s.matchAll(pattern)].length,0);
  const shellNames=['OutsideFaces','InsideFaces','SideAFaces','SideBFaces','EdgeFaces'];
  const shells=Object.fromEntries(shellNames.map(name=>[name,[...files.tscn.matchAll(new RegExp(`\\[node name="${name}" type="MeshInstance3D" parent="([^"]+)"`,'g'))].map(m=>m[1]+'/'+name)]));
  return {name:building.name,schemaVersion:building.version,profile:options.profile||building.exportProfile,floors,counts,
    manualFloors:building.manualFloors.length,manualCeilings:building.manualCeilings.length,
    roofs:{automaticType:building.roof.type,...(building.wallTypes?.length?{wallContacts:roofWallDiagnostics(building)}:{}),attachments:roofAttachmentDiagnostics(building),manual:building.roofSections.map(r=>({id:r.id,label:r.label,type:r.type,baseY:r.baseY,hostRoofId:r.hostRoofId||null,flushEdges:Object.entries(r.edgeModes||{}).filter(([,v])=>v==='flush').map(([k])=>k)}))},
    export:{buildingFile:files.tscnName,doorScenes:files.doors.length,collisionEnabled:options.collision!==false,
      meshInstances:count(/\[node [^\n]*type="MeshInstance3D"/g),collisionShapes:count(/\[node [^\n]*type="CollisionShape3D"/g),
      placeholderMaterialResources:count(/\[sub_resource type="StandardMaterial3D"/g),shells,
      verification:'Generated inventory only; use godot-check --assets on exports for engine resource checks, or godot-check for bundled physics regressions.'}};
}
