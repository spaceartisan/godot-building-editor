// Elevators (hotel test): transactions, validation, floor holes, route links,
// export scenes, game-layer scripts and the CLI. elevator-engine-tests.mjs
// moves the car in Godot.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { applyTransaction } from './src/transactions.js';
import { makeEmptyBuilding, floorView } from './src/model.js';
import { prepareDocument } from './src/diagnostics.js';
import { validateBuilding } from './src/validation.js';
import { analyzeReachability, reachabilityWarnings } from './src/reachability.js';
import { exportGodotFiles } from './src/exporter.js';
import { parseGameLayer } from './src/game-layer.js';
import { diagnosticTargets } from './src/diagnostic-targets.js';
import { elevatorLayout, elevatorFloorHoles, ELEVATOR_DEFAULTS } from './src/elevators.js';
import { elevatorRecipe } from './qa/elevator-fixture.mjs';
import { selectableItems, selectionBounds } from './src/group-edit.js';
const root=path.dirname(fileURLToPath(import.meta.url));
const blank=(()=>{const b=makeEmptyBuilding();b.floors[0].id='floor_1';return prepareDocument(b).building;})();
const apply=(ops,base=blank)=>applyTransaction(base,{version:1,operations:ops});
const tx=(ops,base)=>{const r=apply(ops,base);assert.equal(r.ok,true,JSON.stringify(r.errors));return r.building;};
const fails=(ops,base,pattern)=>{const r=apply(ops,base);assert.equal(r.ok,false,'expected failure: '+JSON.stringify(ops));assert.match(JSON.stringify(r.errors),pattern);};
const shell=tx(elevatorRecipe.slice(0,-1),blank),lifted=tx(elevatorRecipe.slice(-1),shell);
{
  assert.deepEqual(lifted.elevators,[{id:'lift',label:'Main lift',...ELEVATOR_DEFAULTS,x:3,z:2.5,width:2.4,depth:2.4,doorSide:'minZ',bottomFloorId:'floor_1',topFloorId:'f3'}]);
  const moved=tx([{op:'elevator.update',id:'lift',value:{x:-3,doorSide:'maxX'}}],lifted);assert.equal(moved.elevators[0].x,-3);assert.equal(moved.elevators[0].doorSide,'maxX');
  assert.equal('elevators' in tx([{op:'elevator.remove',id:'lift'}],lifted),false,'removing the last elevator removes the list');
  const add=value=>[{op:'elevator.add',id:'e2',value:{x:-3,z:-2,bottomFloorId:'floor_1',topFloorId:'f2',...value}}];
  fails([{op:'elevator.add',id:'e2',value:{x:0,z:0,bottomFloorId:'floor_1'}}],shell,/Missing required field: topFloorId/);
  fails(add({colour:'red'}),shell,/colour/);
  fails(add({doorSide:'up'}),shell,/doorSide/);
  fails(add({topFloorId:'nope'}),shell,/topFloorId nope is not a floor/);
  fails(add({bottomFloorId:'f2'}),shell,/must be above bottomFloorId/);
  fails(add({x:5.5}),shell,/runs through elevator/);
  fails(add({doorWidth:2}),shell,/slide open inside the shaft/);
  fails(add({width:2.4,doorWidth:1.0}),shell,/at most 0.95 m/);
  fails(add({doorHeight:2.8}),shell,/leave 0.2 m of wall/);
  fails(add({width:1}),shell,/1.4–12 m/);
  fails(add({x:3,z:2}),lifted,/overlap/);
  fails([{op:'stair.add',floorId:'floor_1',id:'s',value:{x:3,z:0,width:1.2,run:4,direction:'north'}},...add({x:3,z:-1})],shell,/Stair .* overlaps elevator/);
  fails([{op:'elevator.update',id:'missing',value:{x:0}}],lifted,/Unknown elevator ID/);
  fails([{op:'elevator.add',id:'lift',value:{x:-3,z:-2,bottomFloorId:'floor_1',topFloorId:'f2'}}],lifted,/ID already exists/);
  // Removing a served floor leaves the elevator invalid, so the operation is refused.
  fails([{op:'floor.remove',id:'f3',removeContents:true}],lifted,/topFloorId f3 is not a floor|elevator/i);
  console.log('PASS elevator.add/update/remove: defaults, required fields, floor range, walls, stairs, door size and overlap checks');
}
{
  // Other objects in the shaft: railings, porches/decks, manual floors and ceilings, roofs.
  // The shaft (lifted) is x 1.8..4.2, z 1.3..3.7, from 0 m to the top floor's wall top (8.76 m).
  fails([{op:'railing.add',floorId:'f2',id:'r',value:{a:{x:1,z:2.5},b:{x:5,z:2.5}}}],lifted,/Railing .* runs through elevator Main lift/);
  fails([{op:'platform.add',floorId:'floor_1',id:'p',value:{minX:3,maxX:5,minZ:2,maxZ:4}}],lifted,/Porch\/deck .* overlaps elevator Main lift/);
  fails([{op:'manualFloor.add',id:'m',value:{minX:2,maxX:4,minZ:2,maxZ:3,topY:1.5}}],lifted,/Manual floor .* crosses elevator Main lift/);
  fails([{op:'manualCeiling.add',id:'c',value:{minX:2,maxX:4,minZ:2,maxZ:3,topY:5}}],lifted,/Manual ceiling .* crosses elevator Main lift/);
  fails([{op:'roof.add',id:'rf',value:{type:'flat',minX:2,maxX:4,minZ:2,maxZ:3,baseY:4}}],lifted,/Roof .* is below the top of elevator Main lift/);
  // Allowed: a pit-level manual floor, a roof capping the shaft, objects that only touch it.
  tx([{op:'manualFloor.add',id:'pit',value:{minX:2,maxX:4,minZ:2,maxZ:3,topY:0,thickness:.18}},{op:'roof.add',id:'cap',value:{type:'flat',minX:1.5,maxX:4.5,minZ:1,maxZ:4,baseY:8.9}},
    {op:'railing.add',floorId:'f2',id:'edge',value:{a:{x:1.8,z:0},b:{x:1.8,z:4}}},{op:'platform.add',floorId:'floor_1',id:'beside',value:{minX:4.2,maxX:5.5,minZ:2,maxZ:3}}],lifted);
  // The check runs on the final building, so the elevator side of the edit is caught too.
  fails([{op:'platform.add',floorId:'floor_1',id:'p',value:{minX:-5,maxX:-3,minZ:2,maxZ:4}},{op:'elevator.update',id:'lift',value:{x:-3.5}}],lifted,/overlaps elevator Main lift/);
  console.log('PASS railings, porches, manual floors/ceilings and roofs may not cross a shaft; pit floors, capping roofs and touching objects may');
}
{
  // group.move (web drag / Move selection) moves elevators on floors they serve, with the same checks.
  const moved=tx([{op:'group.move',floorId:'f2',items:[{type:'elevator',id:'lift'}],delta:{x:-6,z:0}}],lifted);
  assert.deepEqual([moved.elevators[0].x,moved.elevators[0].z],[-3,2.5]);
  fails([{op:'group.move',floorId:'floor_1',items:[{type:'elevator',id:'lift'}],delta:{x:2.5,z:0}}],lifted,/runs through elevator/);
  const four=tx([{op:'floor.add-top',aboveFloorId:'f3',id:'f4'},{op:'room.add',floorId:'f4',id:'v',value:{minX:-6,maxX:6,minZ:-5,maxZ:5}}],lifted);
  fails([{op:'group.move',floorId:'f4',items:[{type:'elevator',id:'lift'}],delta:{x:1,z:0}}],four,/does not serve this floor/);
  assert.ok(selectableItems(four,2).some(s=>s.type==='elevator')&&!selectableItems(four,3).some(s=>s.type==='elevator'),'selectable only on served floors');
  assert.deepEqual(selectionBounds(lifted,0,{type:'elevator',id:'lift'}),{minX:1.8,maxX:4.2,minZ:1.3,maxZ:3.7});
  console.log('PASS group.move moves elevators on served floors with the shared checks; selection only on served floors');
}
{
  const hand=structuredClone(lifted);hand.elevators.push({...hand.elevators[0]});
  assert.match(validateBuilding(hand).errors.map(e=>e.message).join('\n'),/duplicate or missing elevator ID: lift/);
  hand.elevators=[{...lifted.elevators[0],topFloorId:'floor_1'}];
  assert.match(validateBuilding(hand).errors.map(e=>e.message).join('\n'),/must be above bottomFloorId/);
  assert.deepEqual(validateBuilding(lifted).errors,[]);
  console.log('PASS validation reports hand-edited elevator problems');
}
{
  assert.deepEqual(elevatorFloorHoles(lifted,0),[],'the bottom stop keeps its floor');
  for(const i of [1,2])assert.deepEqual(floorView(lifted,i).elevatorHoles,[{minX:1.8,maxX:4.2,minZ:1.3,maxZ:3.7}]);
  const layout=elevatorLayout(lifted,lifted.elevators[0]);
  assert.deepEqual(layout.stops.map(s=>[s.name,s.floorId,Math.round(s.y*100)/100]),[['Stop_01','floor_1',0],['Stop_02','f2',2.98],['Stop_03','f3',5.96]]);
  assert.ok(layout.carHeight<2.98-.05&&layout.carHeight>2.1,'the car fits between stops and clears the doors');
  // Leaves overlap the opening's jambs, and slid open by leafTravel they clear
  // the opening without entering the shaft's side walls.
  const {size}=layout,[left,right]=layout.landings[0].leaves,travel=layout.landings[0].leafTravel,inner=size.width/2-.2;
  assert.ok(right.pos.x+right.size.x/2>size.doorWidth/2,'closed leaves overlap the jambs');
  assert.ok(right.pos.x-right.size.x/2+travel>=size.doorWidth/2-1e-9&&right.pos.x+right.size.x/2+travel<=inner+1e-9,'open leaves clear the opening and stay inside the shaft');
  assert.equal(left.pos.x,-right.pos.x);
  console.log('PASS floor holes above the bottom stop; stops at each served floor');
}
{
  const ok=analyzeReachability(lifted);assert.equal(ok.ok,true,JSON.stringify(ok.unreachable));assert.deepEqual(ok.stairIssues,[]);
  const without=analyzeReachability(shell);assert.deepEqual(without.unreachable.map(u=>u.floorId),['f2','f3'],'upper floors need the elevator');
  // A wall in front of the floor-2 landing blocks it.
  const blocked=tx([{op:'wall.add',floorId:'f2',id:'block',value:{a:{x:1.5,z:1.1},b:{x:4.5,z:1.1}}}],lifted);
  const r=analyzeReachability(blocked);assert.deepEqual(r.stairIssues.map(s=>[s.floorId,s.issue]),[['f2','elevator-landing-blocked']]);
  const w=reachabilityWarnings(blocked).warnings;
  assert.deepEqual(diagnosticTargets(blocked,w.find(x=>/landing/.test(x.message))).map(t=>t.label),['Show elevator · Main lift'],'the warning resolves to a Show elevator target');assert.ok(w.some(x=>/Main lift landing/.test(x.message)&&x.targets?.[0]?.type==='elevator'),JSON.stringify(w));
  console.log('PASS route check links elevator landings and reports a blocked landing');
}
{
  const plain=exportGodotFiles(shell),files=exportGodotFiles(lifted),elev=files.doors.filter(d=>d.kind==='elevator');
  assert.doesNotMatch(plain.tscn,/Elevators|ElevatorScene/,'buildings without elevators export unchanged');
  assert.deepEqual(elev.map(d=>d.filename),['elevators/new_building_elevator_001_main_lift.tscn']);
  assert.match(files.tscn,/\[ext_resource type="PackedScene" path="elevators\/new_building_elevator_001_main_lift.tscn" id="ElevatorScene_001"\]/);
  assert.match(files.tscn,/\[node name="Elevator_001_Main_lift" parent="Elevators" instance=ExtResource\("ElevatorScene_001"\)\]\nposition = Vector3\(3, 0, 2.5\)\nrotation = Vector3\(0, 3.14159, 0\)/);
  const t=elev[0].tscn;
  for(const name of ['Shaft','ShaftBody','Car','CarMesh','Stops','Stop_01','Stop_02','Stop_03','Landings','Landing_01','Landing_03','DoorLeft','DoorRight'])assert.match(t,new RegExp(`\\[node name="${name}"`));
  assert.match(t,/\[node name="Car" type="AnimatableBody3D" parent="\."\]/,'the car is the moving body');
  assert.match(t,/\[node name="DoorLeft" type="AnimatableBody3D" parent="Landings\/Landing_01"\]/,'door leaves are moving bodies');
  assert.match(t,/\[node name="CollisionShape_\d+" type="CollisionShape3D" parent="Car"\]/);
  const bare=exportGodotFiles(lifted,{collision:false}).doors.find(d=>d.kind==='elevator').tscn;
  assert.match(bare,/\[node name="Car" type="Node3D" parent="\."\]/);assert.doesNotMatch(bare,/CollisionShape3D|BoxShape3D|StaticBody3D|AnimatableBody3D|collision_layer/,'no collision when collision is off');
  assert.match(t,/\nmetadata\/leaf_travel = 0.5\n/);
  assert.doesNotMatch(t,/^script = /m,'no scripts by default');
  assert.doesNotMatch(t,/"material": /,'materials stay empty');
  const layered=exportGodotFiles(lifted,{gameLayer:parseGameLayer({version:1,scripts:{elevator:'res://s/elevator.gd',door:'res://s/door.gd'},doorChildren:[{name:'Extra',scene:'res://x.tscn'}]})});
  const le=layered.doors.find(d=>d.kind==='elevator').tscn;
  assert.match(le,/^\[node name="Elevator" type="Node3D"\]\n(?:[^\n[]*\n)*?script = ExtResource\("GL_Script_\d+"\)/m);assert.match(le,/elevator.gd/);
  assert.doesNotMatch(le,/door.gd|"Extra"/,'door scripts and door children stay on doors');
  console.log('PASS export: one elevator scene per shaft, instanced under Elevators; game layer scripts.elevator');
}
{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'building-elevator-cli-'));
  try{
    const run=args=>spawnSync(process.execPath,[path.join(root,'cli.mjs'),...args],{cwd:temp,encoding:'utf8'});
    fs.writeFileSync(path.join(temp,'lift.edit.json'),JSON.stringify({version:1,operations:elevatorRecipe}));
    let r=run(['new','--ops','lift.edit.json','--out','lift.json','--warnings-as-errors']);assert.equal(r.status,0,r.stdout+r.stderr);
    r=run(['validate','lift.json','--reachability','--warnings-as-errors']);assert.equal(r.status,0,r.stdout+r.stderr);
    r=run(['inspect','lift.json','--entities','--json']);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).results[0].entities.elevators[0].id,'lift','inspect --entities lists elevators');
    r=run(['export','lift.json','--out','out']);assert.equal(r.status,0,r.stdout+r.stderr);
    const expected=exportGodotFiles(JSON.parse(fs.readFileSync(path.join(temp,'lift.json'),'utf8')),{collision:true,markers:true,placeholderMaterials:false,shareDoorScenes:false});
    for(const d of expected.doors)assert.equal(fs.readFileSync(path.join(temp,'out',d.filename),'utf8'),d.tscn,d.filename);
    fs.writeFileSync(path.join(temp,'bad.edit.json'),JSON.stringify({version:1,operations:[{op:'elevator.update',id:'lift',value:{x:5.5}}]}));
    r=run(['edit','lift.json','--ops','bad.edit.json','--out','bad.json']);assert.equal(r.status,1,r.stdout+r.stderr);assert.match(r.stdout+r.stderr,/runs through elevator/);assert.equal(fs.existsSync(path.join(temp,'bad.json')),false);
    console.log('PASS CLI: new --ops with an elevator validates, routes and exports the elevator scene; invalid edits are rejected');
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
