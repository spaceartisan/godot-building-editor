// Dirtscape field notes: floor.insert spaces the stack with its own wall height
// and slab, Floor_NN nodes carry their floor ID, sceneName fixes the export
// file name, every mesh node names its part (and game-layer rules can select
// by part), and exterior doors carry an outward normal and a Threshold marker.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {applyTransaction} from './src/transactions.js';
import {prepareDocument} from './src/diagnostics.js';
import {floorElevation,makeEmptyBuilding} from './src/model.js';
import {exportGodotFiles} from './src/exporter.js';
import {validateBuilding} from './src/validation.js';
import {parseGameLayer,BUILDING_PARTS} from './src/game-layer.js';
import {createEditorHarness} from './qa/editor-harness.mjs';
import {elevatorRecipe} from './qa/elevator-fixture.mjs';
import {contractRecipe} from './qa/export-contract-fixture.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const near=(a,b,tol=1e-6)=>assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}`);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'dirtscape-'));
const run=(args,expected=0)=>{const r=spawnSync(process.execPath,[path.join(root,'cli.mjs'),...args,'--json'],{cwd:temp,encoding:'utf8',timeout:30000,maxBuffer:16000000});assert.equal(r.status,expected,r.stdout+r.stderr);return JSON.parse(r.stdout);};
const blank=()=>{const b=makeEmptyBuilding();b.floors[0].id='floor_1';return prepareDocument(b).building;};
const edit=(ops,input=blank())=>applyTransaction(input,{version:1,operations:ops},{warningsAsErrors:true});
const build=ops=>{const r=edit(ops);assert.equal(r.ok,true,JSON.stringify(r.errors||r.warnings));return r.building;};
const room=(floorId,id)=>({op:'room.add',floorId,id,value:{minX:-4,maxX:4,minZ:-3,maxZ:3}});
// A smithy with a porch, a front door and an interior door.
const smithy=[
  {op:'building.update',value:{name:'Smithy',wallThickness:.3,roof:{type:'gable',pitch:38,overhang:.45}}},
  room('floor_1','shop'),
  {op:'wall.add',floorId:'floor_1',id:'part',value:{a:{x:1,z:-3},b:{x:1,z:3},role:'interior'}},
  {op:'opening.add',floorId:'floor_1',id:'front',value:{type:'door',wallId:'shop-south',at:{x:-2,z:3},width:1.2,height:2.2,doorStyle:'exterior',label:'Front'}},
  {op:'opening.add',floorId:'floor_1',id:'inner',value:{type:'door',wallId:'part',at:{x:1,z:0},width:.9,height:2.1,label:'Store'}},
  {op:'platform.add',floorId:'floor_1',id:'porch',value:{label:'Forge porch',kind:'porch',minX:-4,maxX:4,minZ:3,maxZ:5,height:0}}];
const meshNodes=text=>[...text.matchAll(/\[node name="([^"]+)" type="MeshInstance3D" parent="([^"]+)"\]([\s\S]*?)(?=\n\n|\n$|$)/g)].map(m=>({name:m[1],parent:m[2],part:/metadata\/building_part = "([^"]+)"/.exec(m[3])?.[1],body:m[3]}));
try{
  // 1. floor.insert below the ground floor: the value's wall height and slab space the stack.
  const ground=[{op:'floor.update',id:'floor_1',value:{wallHeight:3.2}},room('floor_1','hall')];
  const cellar=build([...ground,{op:'floor.insert',id:'cellar',belowFloorId:'floor_1',value:{label:'Cellar',wallHeight:2.4,floorThickness:.25}},room('cellar','vault')]);
  assert.equal(cellar.floors[0].id,'cellar');near(floorElevation(cellar,0),-2.4-.18);near(floorElevation(cellar,1),0);
  assert.deepEqual(validateBuilding(cellar).warnings,[]);
  // Inserting above shifts the explicitly anchored floors by the new floor's own height and slab.
  const anchored=build([...ground,{op:'floor.add-top',id:'loft',aboveFloorId:'floor_1',value:{elevation:3.38}},room('loft','attic'),{op:'floor.insert',id:'mid',aboveFloorId:'floor_1',value:{wallHeight:4,floorThickness:.3}},room('mid','gallery')]);
  near(floorElevation(anchored,1),3.2+.3);near(floorElevation(anchored,2),3.38+4+.3);assert.deepEqual(validateBuilding(anchored).warnings,[]);
  fs.writeFileSync(path.join(temp,'cellar.edit.json'),JSON.stringify({version:1,operations:[...ground,{op:'floor.insert',id:'cellar',belowFloorId:'floor_1',value:{label:'Cellar',wallHeight:2.4,floorThickness:.25}},room('cellar','vault')]}));
  run(['new','--ops','cellar.edit.json','--out','cellar.json','--warnings-as-errors']);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(temp,'cellar.json'))),cellar);

  // 2. Floor_NN carries its floor ID and label; numbering still follows the stack.
  const floors=exportGodotFiles(cellar).tscn;
  assert.match(floors,/\[node name="Floor_01" type="Node3D" parent="\."\]\nposition = Vector3\(0, -2\.58, 0\)\neditor_description = "[^"]*"\nmetadata\/building_floor_id = "cellar"\nmetadata\/building_floor_label = "Cellar"/);
  assert.match(floors,/\[node name="Floor_02" type="Node3D" parent="\."\]\neditor_description = "[^"]*"\nmetadata\/building_floor_id = "floor_1"/);
  console.log('PASS floor.insert spacing from its own value; Floor_NN floor ID metadata');

  // 3. sceneName fixes the scene file and root node; renaming the building no longer moves it.
  const named=build([...smithy,{op:'building.update',value:{sceneName:'dirtscape_smithy'}}]),files=exportGodotFiles(named);
  assert.equal(files.tscnName,'dirtscape_smithy.tscn');assert.match(files.tscn,/\n\[node name="dirtscape_smithy" type="Node3D"\]\n/);
  assert.ok(files.doors.length&&files.doors.every(d=>d.filename.startsWith('doors/dirtscape_smithy_')));
  assert.match(files.tscn,/path="doors\/dirtscape_smithy_f01_door_/);
  const renamed=exportGodotFiles(build([...smithy,{op:'building.update',value:{sceneName:'dirtscape_smithy'}},{op:'building.update',value:{name:'The Old Forge'}}]));
  assert.equal(renamed.tscnName,files.tscnName);assert.deepEqual(renamed.doors.map(d=>d.filename),files.doors.map(d=>d.filename));
  assert.equal(exportGodotFiles(build(smithy)).tscnName,'smithy.tscn');
  const cleared=build([...smithy,{op:'building.update',value:{sceneName:'x'}},{op:'building.update',value:{sceneName:null}}]);assert.equal(cleared.sceneName,undefined);assert.deepEqual(cleared,build(smithy));
  for(const sceneName of ['','-x','a b','smithy.tscn','../x','x'.repeat(101),7])assert.equal(edit([{op:'building.update',value:{sceneName}}]).ok,false,JSON.stringify(sceneName));
  const invalid=structuredClone(named);invalid.sceneName='a/b';assert.match(JSON.stringify(validateBuilding(invalid).errors),/Scene name/);

  // 4. building_part on every mesh node; game-layer rules select by part.
  const leanTo=build([...smithy,{op:'platform.update',floorId:'floor_1',id:'porch',value:{roofStyle:'lean-to'}}]);
  // Plus a lift and the HAUNT contract fixture (roll-up, closet and double doors, stairs, railings, manual surfaces).
  for(const b of [named,leanTo,cellar,build(elevatorRecipe),build(contractRecipe),JSON.parse(fs.readFileSync(path.join(root,'manual_surface_demo.building.json'),'utf8')),JSON.parse(fs.readFileSync(path.join(root,'examples/twostory.building.json'),'utf8'))]){
    const f=exportGodotFiles(b);
    for(const text of [f.tscn,...f.doors.map(d=>d.tscn)])for(const node of meshNodes(text))assert.ok(BUILDING_PARTS.includes(node.part),`${node.parent}/${node.name}: ${node.part}`);
  }
  const nodes=meshNodes(files.tscn),partOf=name=>nodes.find(n=>n.name===name)?.part;
  assert.equal(partOf('OutsideFaces'),'exterior_wall');assert.equal(partOf('Roof_001_North'),'roof');assert.equal(partOf('RidgeCap_001'),'ridge');
  assert.equal(partOf('Porch_001_Forge_porch'),'platform');assert.equal(partOf('Porch_001_Forge_porch_Post_001'),'post');assert.equal(partOf('Porch_001_Forge_porch_Beam_001'),'beam');
  assert.ok(nodes.some(n=>n.name.startsWith('FloorSlab')&&n.part==='floor'));assert.ok(nodes.some(n=>n.name.startsWith('Ceiling')&&n.part==='ceiling'));
  assert.equal(meshNodes(exportGodotFiles(leanTo).tscn).find(n=>n.name==='Porch_001_Forge_porch_Roof').part,'roof');
  const rollup=build([...smithy,{op:'opening.add',floorId:'floor_1',id:'roll',value:{type:'door',wallId:'shop-north',at:{x:-2,z:-3},width:2.4,height:2.4,doorStyle:'rollup'}}]);
  const twostory=JSON.parse(fs.readFileSync(path.join(root,'examples/twostory.building.json'),'utf8'));
  const seen=new Set([named,leanTo,rollup,twostory,build(elevatorRecipe),build(contractRecipe)].flatMap(b=>{const f=exportGodotFiles(b);return [f.tscn,...f.doors.map(d=>d.tscn)].flatMap(t=>meshNodes(t).map(n=>n.part));}));
  for(const part of ['elevator_shaft','elevator_car','elevator_door','door_housing','stair','railing','window','interior_wall'])assert.ok(seen.has(part),part);
  const doorParts=new Set(files.doors.flatMap(d=>meshNodes(d.tscn).map(n=>n.part)));assert.deepEqual([...doorParts].sort(),['door_frame','door_leaf']);
  const spec={version:1,nodeMaterials:[{part:'post',material:'res://m/oak.tres'},{part:'beam',match:'Floor_01/*',material:'res://m/oak.tres'},{part:'roof',match:'*North',material:'res://m/thatch.tres'}],layers:[{part:'ridge',layers:2}]};
  const layered=exportGodotFiles(named,{gameLayer:parseGameLayer(spec)}),layeredNodes=meshNodes(layered.tscn);
  for(const n of layeredNodes){
    const override=/material_override = ExtResource\("([^"]+)"\)/.exec(n.body);
    const expected=['post','beam'].includes(n.part)||(n.part==='roof'&&n.name.endsWith('North'));
    assert.equal(!!override,expected,`${n.name} (${n.part})`);
    assert.equal(/\nlayers = 2/.test(n.body),n.part==='ridge',n.name);
  }
  for(const bad of [{nodeMaterials:[{material:'res://m.tres'}]},{nodeMaterials:[{part:'roofs',material:'res://m.tres'}]},{layers:[{part:'Post',layers:1}]}])assert.throws(()=>parseGameLayer({version:1,...bad}),/part/);
  console.log('PASS sceneName (export file, root, door scenes, rename-stable, invalid values); building_part on every mesh; part rules');

  // 5. Exterior doors: outward normal and a Threshold marker on the outer face.
  const markers=files.tscn;
  assert.match(markers,/\[node name="Door_001_Front" type="Marker3D" parent="Floor_01\/Openings"\][^\[]*metadata\/outward_normal = Vector3\(0, 0, 1\)/);
  assert.match(markers,/\[node name="Threshold" type="Marker3D" parent="Floor_01\/Openings\/Door_001_Front"\]\nposition = Vector3\(0, -1\.1, -0\.15\)\nrotation = Vector3\(0, 0, 0\)/);
  assert.doesNotMatch(markers,/Door_002_Store"\][^\[]*outward_normal/);assert.doesNotMatch(markers,/parent="Floor_01\/Openings\/Door_002_Store"/);
  assert.doesNotMatch(exportGodotFiles(named,{markers:false}).tscn,/Threshold/);
  console.log('PASS exterior door outward normal and Threshold marker; none on interior doors');

  // CLI route: recipe with sceneName and part rules, export file names.
  fs.writeFileSync(path.join(temp,'smithy.edit.json'),JSON.stringify({version:1,operations:[...smithy,{op:'building.update',value:{sceneName:'dirtscape_smithy'}}]}));
  run(['new','--ops','smithy.edit.json','--out','smithy.json','--warnings-as-errors']);
  fs.writeFileSync(path.join(temp,'layer.json'),JSON.stringify(spec));
  run(['export','smithy.json','--out','assets','--game-layer','layer.json','--warnings-as-errors']);
  assert.equal(fs.readFileSync(path.join(temp,'assets/dirtscape_smithy.tscn'),'utf8'),layered.tscn);
  for(const d of layered.doors)assert.equal(fs.readFileSync(path.join(temp,'assets',d.filename),'utf8'),d.tscn);
  fs.writeFileSync(path.join(temp,'bad.edit.json'),JSON.stringify({version:1,operations:[{op:'building.update',value:{sceneName:'bad name'}}]}));
  run(['edit','smithy.json','--ops','bad.edit.json','--out','bad.json'],1);assert.equal(fs.existsSync(path.join(temp,'bad.json')),false);

  // Web route: the Scene name field makes the same edit; invalid names are refused.
  const editor=await createEditorHarness(),$=editor.$;editor.loadBuildingData(build(smithy));
  const field=$('#scene-name');assert.equal(field.value,'');
  field.value='bad name';await field.dispatch('change');assert.equal(editor.snapshot().sceneName,undefined);assert.match($('#status-text').textContent,/Scene name must be/);
  field.value='dirtscape_smithy';await field.dispatch('change');assert.deepEqual(editor.snapshot(),named);
  assert.equal(exportGodotFiles(editor.snapshot()).tscn,files.tscn);
  await $('#undo-btn').click();assert.equal($('#scene-name').value,'');await $('#redo-btn').click();assert.equal($('#scene-name').value,'dirtscape_smithy');
  const again=$('#scene-name');again.value='';await again.dispatch('change');assert.deepEqual(editor.snapshot(),build(smithy));
  assert.deepEqual(editor.errors,[]);
  console.log('PASS Dirtscape CLI recipe/export with part rules and web Scene name parity');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
