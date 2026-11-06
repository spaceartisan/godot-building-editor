// Optional engine-unreal suite (needs UNREAL_BIN: Unreal Engine 5): the Unreal
// counterpart of the Godot engine suites. unreal-check passes on good exports
// (import, slots, collision, metadata, lights, no translucent Nanite meshes,
// elevator probes) and fails on a
// broken one; building_studio_setup.py applies a full game-layer unreal block
// (qa/validate-unreal-setup.py); unreal-import places a building in a saved
// level and --replace swaps it (qa/unreal-import-level.py); unreal-check
// --render writes every view.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {elevatorRecipe} from './qa/elevator-fixture.mjs';
import {resolveUnreal,autoViews} from './unreal-check.mjs';
import {readGlb} from './qa/glb-reader.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
if(!process.env.UNREAL_BIN)throw new Error('Set UNREAL_BIN for the Unreal engine suite');
const unreal=resolveUnreal(process.env.UNREAL_BIN);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'unreal-engine-'));
const cli=(args,expected=0)=>{const r=spawnSync(process.execPath,[path.join(root,'cli.mjs'),...args,'--json'],{cwd:temp,encoding:'utf8',timeout:1800000,maxBuffer:64*1024*1024});assert.equal(r.status,expected,r.stdout+r.stderr);return JSON.parse(r.stdout);};
try{
  fs.writeFileSync(path.join(temp,'lift.edit.json'),JSON.stringify({version:1,operations:elevatorRecipe}));
  cli(['new','--ops','lift.edit.json','--out','lift.json']);
  cli(['export',path.join(root,'examples/farmhouse.building.json'),'--format','glb','--profile','get_probed','--out','good/farmhouse']);
  cli(['export',path.join(root,'examples/stair_ramp_north.building.json'),'--format','glb','--out','good/ramp']);
  cli(['export',path.join(root,'examples/shaped_walls.building.json'),'--format','glb','--out','good/shaped']);
  cli(['export','lift.json','--format','glb','--out','good/lift']);
  // 2.2 m landing doors: a probe along the seam between the leaves missed them (MegaCorp).
  fs.writeFileSync(path.join(temp,'lift22.edit.json'),JSON.stringify({version:1,operations:elevatorRecipe.map(o=>o.op==='elevator.add'?{...o,value:{...o.value,doorHeight:2.2}}:o)}));
  cli(['new','--ops','lift22.edit.json','--out','lift22.json']);cli(['export','lift22.json','--format','glb','--out','good/lift22']);
  const ok=cli(['unreal-check','--assets','good','--require-collision']);
  const c=ok.unrealChecks;
  assert.equal(ok.ok,true,JSON.stringify(ok.failures));assert.equal(c.files,5);assert.equal(c.elevators,2);assert.ok(c.elevatorStops>=2&&c.physicsRays===c.elevatorStops*4,'four probes per stop: car floor, each closed landing leaf, the open doorway');
  assert.ok(c.collisionPieces>100&&c.lights>0&&c.meshes>50);
  assert.ok(c.naniteOff>0,'window glass meshes have Nanite off (Nanite cannot draw translucent materials)');
  console.log(`PASS unreal-check (Unreal Engine ${ok.unrealVersion}): ${c.files} buildings, ${c.meshes} meshes, ${c.collisionPieces} collision pieces, ${c.lights} lights, ${c.naniteOff} glass meshes without Nanite, ${c.elevatorStops} elevator stops / ${c.physicsRays} probes, 0 failures`);
  cli(['export','lift.json','--format','glb','--no-collision','--out','broken']);
  const bad=cli(['unreal-check','--assets','broken','--render','--out','broken-renders'],1);
  assert.equal(bad.render.skipped,'checks failed; nothing was rendered or written');assert.equal(fs.existsSync(path.join(temp,'broken-renders')),false);
  assert.ok(bad.failures.some(f=>/car floor not found/.test(f))&&bad.failures.some(f=>/closed landing door \w+ does not block/.test(f)),'a collision-less elevator fails its probes');
  // One folder, a good and a broken copy of the same building (same root name, both at the origin):
  // each is probed against its own import, so the broken one still fails and the good one passes.
  fs.mkdirSync(path.join(temp,'mixed'));
  fs.copyFileSync(path.join(temp,'good','lift','new_building.glb'),path.join(temp,'mixed','a_good.glb'));
  fs.copyFileSync(path.join(temp,'broken','new_building.glb'),path.join(temp,'mixed','b_broken.glb'));
  const mixed=cli(['unreal-check','--assets','mixed'],1);
  assert.ok(mixed.failures.length>0&&mixed.failures.every(f=>f.startsWith('b_broken.glb:')),JSON.stringify(mixed.failures));
  console.log(`PASS unreal-check fails a broken export (${bad.failures.length} probe failures without collision), also beside a good copy of the same building`);

  // building_studio_setup.py with a full unreal block, run twice.
  // The top-level collision rules (NOBODY CAME) put exterior walls on layer 2 and floors on layer 8, which the
  // collisionProfiles layer rules then see; a door filter adds a Pair child to double doors only.
  const layer={version:1,collision:[{part:'exterior_wall',layer:2},{part:'floor',layer:8}],unreal:{materials:{OutsideFaces:'/Engine/BasicShapes/BasicShapeMaterial'},nodeMaterials:[{part:'door_leaf',material:'/Engine/EngineMaterials/WorldGridMaterial'}],tags:[{part:'roof',tags:['roofs']}],
    collisionProfiles:[{layer:4,profile:'BlockAllDynamic'},{layer:2,profile:'InvisibleWall'},{layer:8,profile:'OverlapAllDynamic'}],scripts:{door:'/Script/Engine.ArrowComponent',elevator:'/Script/Engine.BillboardComponent'},
    doorChildren:[{name:'Use',actor:'/Script/Engine.TargetPoint'},{name:'Pair',actor:'/Script/Engine.TargetPoint',door:{leaves:2}}]}};
  fs.writeFileSync(path.join(temp,'layer.json'),JSON.stringify(layer));
  cli(['export',path.join(root,'examples/farmhouse.building.json'),'--out','layer-check','--game-layer',path.join(temp,'layer.json')]);// the same file is valid for Godot too
  const work=path.join(temp,'setup');fs.mkdirSync(work);
  const files=['good/farmhouse/farmhouse.glb','good/ramp/stair_ramp_north.glb','good/lift/new_building.glb'].map(f=>path.join(temp,f));
  const uproject=path.join(work,'SetupCheck.uproject');
  fs.writeFileSync(uproject,JSON.stringify({FileVersion:3,Plugins:[{Name:'PythonScriptPlugin',Enabled:true},{Name:'Interchange',Enabled:true},{Name:'InterchangeEditor',Enabled:true}]}));
  fs.writeFileSync(path.join(work,'job.json'),JSON.stringify({files,layer,setup:path.join(root,'unreal','building_studio_setup.py')}));
  const report=path.join(work,'report.json');
  const r=spawnSync(unreal.cmd,[uproject,'-run=pythonscript',`-script=${path.join(root,'qa','validate-unreal-setup.py')}`,'-unattended','-nop4','-nosplash','-stdout'],{env:{...process.env,BUILDING_UNREAL_JOB:path.join(work,'job.json'),BUILDING_UNREAL_REPORT:report},encoding:'utf8',timeout:1800000,maxBuffer:256*1024*1024});
  assert.ok(fs.existsSync(report),(r.stdout||'').split('\n').filter(l=>/LogPython: Error/.test(l)).join('\n'));
  const b=JSON.parse(fs.readFileSync(report,'utf8')).buildings;
  const farm=b['farmhouse.glb'],ramp=b['stair_ramp_north.glb'],lift=b['new_building.glb'];
  for(const [name,x] of Object.entries(b)){
    assert.equal(x.moving_static,0,`${name}: moving parts Movable`);assert.equal(x.group_tagged,x.group_nodes,`${name}: groups become tags`);
    assert.equal(x.outside_bound,x.outside_slots,`${name}: slot materials`);assert.equal(x.door_leaves_bound,x.door_leaves,`${name}: part materials`);
    assert.equal(x.roof_tagged,x.roofs,`${name}: tag rules`);assert.equal(x.door_components,x.door_roots,`${name}: door components`);assert.equal(x.door_children,x.door_roots,`${name}: door children`);
    assert.equal(x.elevator_components,x.elevator_roots,`${name}: elevator components`);assert.equal(x.triggers,x.trigger_nodes,`${name}: trigger boxes`);
    assert.equal(x.layer4_profiled,x.layer4_carriers,`${name}: collision profiles by layer`);
    assert.equal(x.wall_profiled,x.wall_carriers,`${name}: exterior wall carriers profiled through the collision rules`);assert.equal(x.floor_profiled,x.floor_carriers,`${name}: floor carriers too`);
    assert.equal(x.pair_children,x.double_roots,`${name}: double doors get the Pair child`);assert.equal(x.pair_on_single,0,`${name}: single doors do not`);
    assert.deepEqual([x.second.movable,x.second.tags,x.second.triggers,x.second.components,x.second.children],[0,0,0,0,0],`${name}: running again adds nothing`);
  }
  assert.ok(farm.group_nodes>=10&&farm.trigger_nodes>0&&farm.layer4_carriers>0&&farm.door_roots>0,'GET PROBED farmhouse: window groups, door triggers, door-layer carriers');
  assert.ok(farm.wall_carriers>0&&farm.floor_carriers>0&&farm.double_roots>0,'the farmhouse has wall and floor carriers and a double door');
  assert.ok(ramp.first.lights>0&&lift.elevator_roots===1&&lift.moving>10);
  console.log(`PASS building_studio_setup.py: tags, Movable parts, ${farm.triggers} trigger boxes, slot/part materials, collision profiles (also through the collision rules), ${farm.door_components} door components and children (Pair on ${farm.double_roots} double doors only), elevator component; idempotent`);

  // unreal-import into an existing project and saved level, then again with --replace.
  const town=path.join(temp,'town');fs.mkdirSync(town);
  const townProject=path.join(town,'Town.uproject');fs.copyFileSync(uproject,townProject);
  const levelScript=path.join(root,'qa','unreal-import-level.py').split(path.sep).join('/');
  const glbFile=path.join(temp,'good','farmhouse','farmhouse.glb'),gltf=readGlb(fs.readFileSync(glbFile)).json,rootName=gltf.nodes[gltf.scenes[0].nodes[0]].name;
  const levelStep=(mode,report)=>{const s=spawnSync(unreal.cmd,[townProject,'-run=pythonscript',`-script=${levelScript}`,'-unattended','-nop4','-nosplash','-stdout'],{env:{...process.env,BUILDING_UNREAL_LEVEL_MODE:mode,BUILDING_UNREAL_LEVEL:'/Game/Maps/Town',BUILDING_UNREAL_ROOT:rootName,BUILDING_UNREAL_CONTENT:'/Game/Buildings/farmhouse',BUILDING_UNREAL_REPORT:report||''},encoding:'utf8',timeout:1800000,maxBuffer:256*1024*1024});
    if(report)assert.ok(fs.existsSync(report),(s.stdout||'').split('\n').filter(l=>/LogPython: Error/.test(l)).join('\n'));};
  levelStep('make');
  const importArgs=['unreal-import',glbFile,'--project',townProject,'--content','/Game/Buildings/farmhouse','--level','/Game/Maps/Town','--location','5000,2000,0','--yaw','90'];
  const first=cli(importArgs).unrealImport;
  assert.equal(first.removed,0);assert.ok(first.actors>20&&first.saved);assert.ok(first.setup.nanite_off>0,'glass meshes set to non-Nanite');
  const again=cli([...importArgs,'--replace','--game-layer',path.join(temp,'layer.json')]).unrealImport;
  assert.ok(again.removed>=first.actors-1,'--replace removes the earlier copy');
  const levelReport=path.join(town,'level.json');levelStep('inspect',levelReport);
  const placed=JSON.parse(fs.readFileSync(levelReport,'utf8'));
  assert.equal(placed.roots.length,1,'one copy after --replace');assert.equal(placed.scene_actors,1);assert.equal(placed.existing,true,'the level keeps its own actors');
  assert.deepEqual(placed.roots[0].location.map(Math.round),[5000,2000,0]);assert.ok(Math.abs(placed.roots[0].yaw-90)<1e-3);
  assert.ok(placed.assets>0&&placed.hinges>0&&placed.hinges_movable,'saved meshes and Movable door hinges');
  console.log(`PASS unreal-import: into a saved level at (5000, 2000, 0) cm, yaw 90; --replace leaves one copy (${again.removed} actors removed), keeps the level's actors, ${placed.assets} assets saved`);

  // unreal-check --render: every default view of a building with labelled rooms.
  cli(['export',path.join(root,'examples/courtyard_regions.building.json'),'--format','glb','--out','render-in']);
  const expected=autoViews(readGlb(fs.readFileSync(path.join(temp,'render-in','courtyard_regions.glb'))).json).length;
  fs.writeFileSync(path.join(temp,'one-view.json'),JSON.stringify({views:[{name:'aerial',eye:[20,25,20],look:[0,0,0]}]}));
  const rendered=cli(['unreal-check','--assets','render-in','--render','--out','render-out']);
  assert.equal(rendered.render.images,expected);assert.ok(fs.readdirSync(path.join(temp,'render-out')).filter(f=>f.endsWith('.png')).length===expected);
  const rerun=cli(['unreal-check','--assets','render-in','--render','--out','render-out','--replace','--views',path.join(temp,'one-view.json')]);
  assert.equal(rerun.render.images,1);assert.equal(fs.readdirSync(path.join(temp,'render-out')).filter(f=>f.endsWith('.png')).length,1,'--replace swaps the whole folder');
  console.log(`PASS unreal-check --render: ${expected} views (exterior diagonals, aerial, labelled regions); --replace re-renders into the folder`);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
