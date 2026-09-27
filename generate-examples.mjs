import {customDoorwayExample} from './qa/opening-shape-fixture.mjs';
import {profileRoofExample} from './qa/profile-roof-fixture.mjs';
import {concaveRoofExample} from './qa/concave-roof-fixture.mjs';
import {profileJunctionExample,splitProfileJunctionExample} from './qa/profile-junction-fixture.mjs';
import {angledProfileJunctionExample} from './qa/angled-junction-fixture.mjs';
import {wallProfileFixture} from './qa/wall-profile-fixture.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { makeEmptyBuilding, makeFarmhousePreset, makeFloor, addRoom, makeStair, makeOmniLight, makeManualSurface, floorElevation, makeRegion } from './src/model.js';
import { proposeEndpointMove } from './src/wall-edit.js';
import { exportGodotFiles } from './src/exporter.js';
import {polygonRegionFixture} from './qa/polygon-region-fixture.mjs';
import {floorMarkerFixture} from './qa/floor-marker-fixture.mjs';

// Explicit fixture generation, never a side effect of npm test.
function stableIds(b){let n=0;for(const f of b.floors){f.id=`floor_${++n}`;const wallIds=new Map();for(const w of f.walls){const id=`wall_${++n}`;wallIds.set(w.id,id);w.id=id;}for(const key of ['openings','lights','stairs','slabs','regions','platforms','railings'])for(const o of f[key]||[]){o.id=`${key}_${++n}`;if(o.wallId)o.wallId=wallIds.get(o.wallId)||o.wallId;}}const roofIds=new Map();for(const k of ['manualFloors','manualCeilings','roofSections'])for(const o of b[k]||[]){const id=`${k}_${++n}`;if(k==='roofSections')roofIds.set(o.id,id);o.id=id;}for(const r of b.roofSections||[])if(r.hostRoofId)r.hostRoofId=roofIds.get(r.hostRoofId)||r.hostRoofId;return b;}
function write(base,b,canonicalize=false){
  b.version=b.openingShapes?.length?10:9;for(const f of b.floors)f.regions ||= [];
  if(canonicalize)stableIds(b);const files=exportGodotFiles(b);
  fs.mkdirSync(path.dirname(base),{recursive:true});
  fs.writeFileSync(`${base}.building.json`,JSON.stringify(b,null,2)+'\n');
  fs.writeFileSync(`${base}.tscn`,files.tscn);
  for(const d of files.doors){const target=path.join(path.dirname(base),d.filename);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,d.tscn);}
  console.log(`${base}: ${files.doors.length} doors, ${files.warnings.length} warnings`);
}
for(const base of ['farmhouse_example','manual_surface_demo','independent_roof_demo'])write(base,JSON.parse(fs.readFileSync(`${base}.building.json`,'utf8')));
write('examples/basement_markers',floorMarkerFixture());
write('examples/polygon_regions',polygonRegionFixture());
write('examples/shaped_walls',wallProfileFixture());
write('examples/profile_roof_joins',profileRoofExample());
write('examples/concave_roof_joins',concaveRoofExample());
write('examples/fitted_partitions',profileJunctionExample());
write('examples/split_host_junctions',splitProfileJunctionExample());
write('examples/custom_doorways',customDoorwayExample());
write('examples/angled_partitions',angledProfileJunctionExample());
for(const name of ['barn_v2','farmhouse','twostory','round_bounding']){
  const b=JSON.parse(fs.readFileSync(`examples/${name}.building.json`,'utf8'));
  if(name==='barn_v2'){
    // Confirmed authoring intent: the ground-floor 6m gap is the barn entrance.
    b.version=b.openingShapes?.length?10:9;b.floors[0].boundaryMode='intentional_open';
    if(!b.floors[0].slabs.length)b.floors[0].slabs.push({id:'barn_entrance_footprint',label:'Barn footprint with open entrance',minX:-9,maxX:9,minZ:-10,maxZ:10});
  }
  write(`examples/${name}`,b);
}
{
  const b=makeEmptyBuilding();b.name='Variable story heights';b.roof.type='none';
  b.floors.push(makeFloor('Upper'),makeFloor('Top'));
  b.floors[0].elevation=-1;b.floors[0].wallHeight=3.5;
  b.floors[1].floorThickness=.3;b.floors[1].wallHeight=2.4;
  b.floors[2].floorThickness=.22;b.floors[2].elevation=5.42;
  for(const f of b.floors){addRoom(f,{x:-5,z:-5},{x:5,z:5});f.autoCeiling=false;}
  b.floors[0].stairs.push(makeStair({x:-2,z:3},{x:-2,z:-3},1.2,'steps',18,'Lower flight'));
  b.floors[1].stairs.push(makeStair({x:2,z:-3},{x:2,z:3},1.2,'ramp',12,'Upper flight'));
  write('examples/variable_levels',b,true);
}
{
  const b=makeEmptyBuilding();b.name='Roof wall junctions';b.wallHeight=3;b.roof={type:'gable',pitch:35,overhang:.35};
  b.floors.push(makeFloor('Upper'));
  for(const f of b.floors)addRoom(f,{x:-5,z:-4},{x:5,z:4});
  // Automatic gables on two sides, independent shed/flat roofs on the others.
  // Asymmetric attachment also exercises a partially shared roof edge.
  b.floors[0].platforms.push(
    {id:'north',label:'North porch',kind:'porch',minX:-3,maxX:3,minZ:-6,maxZ:-4,height:0,covered:true},
    {id:'south',label:'South porch',kind:'porch',minX:-3,maxX:6,minZ:4,maxZ:6,height:0,covered:true},
    {id:'east',label:'East porch',kind:'porch',minX:5,maxX:7,minZ:-2,maxZ:2,height:0,covered:false},
    {id:'west',label:'West porch',kind:'porch',minX:-7,maxX:-5,minZ:-2,maxZ:2,height:0,covered:false}
  );
  b.roofSections.push(
    {id:'shed',label:'East shed canopy',minX:5,maxX:7,minZ:-2,maxZ:2,type:'shed',direction:'x',baseY:3,pitch:20,overhang:.35,gableEnds:'none'},
    {id:'flat',label:'West flat canopy',minX:-7,maxX:-5,minZ:-2,maxZ:2,type:'flat',direction:'x',baseY:3,pitch:35,overhang:.35,gableEnds:'none'}
  );
  write('examples/roof_junctions',b,true);
}
for(const [name,points,hole] of [
  ['l_shaped_outline',[[-6,-4],[6,-4],[6,0],[0,0],[0,6],[-6,6]],null],
  ['u_shaped_outline',[[-6,-5],[6,-5],[6,5],[2,5],[2,-1],[-2,-1],[-2,5],[-6,5]],null],
  ['courtyard_outline',[[-6,-5],[6,-5],[6,5],[-6,5]],[[-2,-2],[2,-2],[2,2],[-2,2]]]
]){
  const b=makeEmptyBuilding();b.name=({'l_shaped_outline':'L-shaped outline','u_shaped_outline':'U-shaped outline','courtyard_outline':'Courtyard outline'})[name];b.roof={type:'flat',pitch:35,overhang:0};
  const loop=pts=>pts.forEach((p,i)=>b.floors[0].walls.push({id:`outline_${b.floors[0].walls.length}`,role:'exterior',a:{x:p[0],z:p[1]},b:{x:pts[(i+1)%pts.length][0],z:pts[(i+1)%pts.length][1]}}));
  loop(points);if(hole)loop(hole);
  write(`examples/${name}`,b,true);
}
{
  const b=makeEmptyBuilding();b.name='Explicit roof attachment';b.roof.type='none';b.wallHeight=3;
  addRoom(b.floors[0],{x:-6,z:-4},{x:6,z:4});
  b.floors[0].platforms.push({id:'porch',label:'Porch',minX:-2,maxX:2,minZ:4,maxZ:7,kind:'porch',height:0,covered:true});
  b.roofSections=[
    {id:'host',label:'Main host roof',minX:-6,maxX:6,minZ:-4,maxZ:4,type:'gable',direction:'x',baseY:3,pitch:35,overhang:.3,gableEnds:'both'},
    {id:'branch',label:'Attached canopy',minX:-2,maxX:2,minZ:-1,maxZ:7,type:'gable',direction:'z',baseY:3,pitch:35,overhang:.3,gableEnds:'none',hostRoofId:'host',edgeModes:{maxZ:'flush'}}
  ];
  write('examples/roof_attachment',b,true);
}
for(const style of ['ramp','steps'])for(const direction of ['north','south','east','west']){
  const b=makeEmptyBuilding();b.name=`Stair ${style} ${direction}`;b.roof.type='none';b.floors.push(makeFloor('Upper'));
  for(const f of b.floors){addRoom(f,{x:-5,z:-5},{x:5,z:5});f.walls.push({id:`partition_${f.id}`,role:'interior',a:{x:-2,z:-5},b:{x:-2,z:5}});f.autoCeiling=false;f.lights.push(makeOmniLight(0,0));}
  const dx=direction==='east'?1:direction==='west'?-1:0,dz=direction==='south'?1:direction==='north'?-1:0;
  // Keep stair clear of the interior partition and test each rotation.
  const s=makeStair({x:1-dx*2,z:-dz*2},{x:1+dx*2,z:dz*2},1.2,style,12);b.floors[0].stairs.push(s);
  write(`examples/stair_${style}_${direction}`,b,true);
  if(style==='ramp'&&direction==='north'){
    const m=structuredClone(b);m.name='Manual upper floor stairwell';m.floors[1].autoFloor=false;
    const hole={minX:.34,maxX:1.66,minZ:-2,maxZ:2.06};
    for(const r of [{minX:-5,maxX:hole.minX,minZ:-5,maxZ:5},{minX:hole.maxX,maxX:5,minZ:-5,maxZ:5},{minX:hole.minX,maxX:hole.maxX,minZ:-5,maxZ:hole.minZ},{minX:hole.minX,maxX:hole.maxX,minZ:hole.maxZ,maxZ:5}])m.manualFloors.push(makeManualSurface({x:r.minX,z:r.minZ},{x:r.maxX,z:r.maxZ},'floor',floorElevation(m,1),m.floorThickness));
    write('examples/manual_upper_stairwell',m,true);
  }
}

{
  const b=makeEmptyBuilding();b.name='Courtyard regions';b.roof={type:'flat',pitch:35,overhang:0};
  const f=b.floors[0];f.label='Courtyard level';
  addRoom(f,{x:-7,z:-6},{x:7,z:6});
  addRoom(f,{x:-2,z:-2},{x:2,z:2});
  f.regions.push(
    makeRegion({x:-7,z:-6},{x:7,z:6},'Building envelope','wing','solid'),
    makeRegion({x:-2,z:-2},{x:2,z:2},'Open courtyard','courtyard','void'),
    makeRegion({x:-7,z:-6},{x:-2,z:6},'West workshop','bay'),
    makeRegion({x:2,z:-6},{x:7,z:6},'East rooms','wing'));
  write('examples/courtyard_regions',b,true);
}

{
  const b=makeEmptyBuilding();b.name='Editable wall junctions';b.roof.type='none';
  b.floors.push(makeFloor('Upper'));
  for(let i=0;i<b.floors.length;i++){
    const f=b.floors[i];addRoom(f,{x:-5,z:-5},{x:5,z:5});f.autoCeiling=false;
    f.walls.push(
      {id:'west_arm',label:'Editable west arm',role:'interior',a:{x:-4,z:0},b:{x:0,z:0},height:null},
      {id:'south_arm',label:'South arm',role:'interior',a:{x:0,z:0},b:{x:0,z:4},height:null},
      {id:'north_arm',label:'North arm',role:'interior',a:{x:0,z:0},b:{x:0,z:-3},height:null});
    f.openings.push({id:'passage',label:'West passage',type:'door',wallId:'west_arm',t:.35,width:1,height:2.1,doorStyle:'empty'});
    const edited=proposeEndpointMove(b,i,'west_arm','b',{x:1,z:0});
    if(!edited.ok)throw new Error(edited.reason);
    b.floors[i]=edited.floor;
  }
  b.floors[0].stairs.push(makeStair({x:3,z:3},{x:3,z:-3},1.2,'steps',16,'East stair'));
  write('examples/editable_junctions',b,true);
}
