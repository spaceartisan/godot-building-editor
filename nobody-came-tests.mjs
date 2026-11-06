// NOBODY CAME report: collision layers by part in the game layer (Godot bodies
// and Unreal carriers), door filters on nodeMaterials and doorChildren, the
// route check's walker radius and per-floor unreachableOk, in the CLI and the
// web editor. game-layer-engine-tests.mjs loads the layered scenes in Godot.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {applyTransaction} from './src/transactions.js';
import {prepareDocument} from './src/diagnostics.js';
import {makeEmptyBuilding} from './src/model.js';
import {exportGodotFiles,collisionParts} from './src/exporter.js';
import {exportGltfFiles} from './src/gltf-export.js';
import {parseGameLayer} from './src/game-layer.js';
import {analyzeReachability,reachabilityWarnings,parseWalkerRadius} from './src/reachability.js';
import {createCheckReport} from './src/check-report.js';
import {readGlb} from './qa/glb-reader.mjs';
import {createEditorHarness} from './qa/editor-harness.mjs';
import {nobodyCameRecipe,collisionLayerSpec} from './qa/nobody-came-fixture.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const blank=()=>{const b=makeEmptyBuilding();b.floors[0].id='floor_1';return prepareDocument(b).building;};
const build=(ops,input=blank())=>{const r=applyTransaction(input,{version:1,operations:ops});assert.equal(r.ok,true,JSON.stringify(r.errors));return r.building;};
const house=build(nobodyCameRecipe);
const nodes=text=>text.split('\n\n').flatMap(b=>{const h=/^\[node name="([^"]+)"(?: type="([^"]+)")?(?: parent="([^"]+)")?/.exec(b);return h?[{name:h[1],type:h[2],parent:h[3],block:b,path:h[3]===undefined?'.':h[3]==='.'?h[1]:`${h[3]}/${h[1]}`}]:[];});
{
  // Every collision shape in a shared body, and every other collision body, has a part, across the examples and this house.
  const dir=path.join(root,'examples'),texts=[...fs.readdirSync(dir).filter(f=>f.endsWith('.tscn')).map(f=>path.join(dir,f)),...fs.readdirSync(path.join(dir,'doors')).map(f=>path.join(dir,'doors',f))].map(f=>fs.readFileSync(f,'utf8'));
  const files=exportGodotFiles(house);texts.push(files.tscn,...files.doors.map(d=>d.tscn));
  let count=0;for(const t of texts)for(const [p,part] of Object.entries(collisionParts(t))){count++;assert.ok(part,`${p} has a part`);}
  const parts=collisionParts(files.tscn);
  assert.equal(parts['Floor_01/Collision/ExteriorCollision_001'],'exterior_wall');assert.equal(parts['Floor_01/Collision/WallCollision_001'],'interior_wall');assert.equal(parts['Floor_01/Collision/FloorCollision_001'],'floor');
  assert.equal(parts['Floor_01/Geometry/Stairs/Staircase_001_Ramp/WalkableRamp'],'stair');assert.equal(parts['Floor_01/Geometry/Stairs/Staircase_001_Ramp/UnderStairBlocker'],'stair_blocker');
  console.log(`PASS collision parts: ${count} collision shapes and bodies in ${texts.length} scenes each name their part`);
}
{
  // Godot: one body per layer beside each shared body; stair and door bodies take their layer in place.
  const layer=parseGameLayer(collisionLayerSpec),plain=exportGodotFiles(house),layered=exportGodotFiles(house,{gameLayer:layer});
  const before=nodes(plain.tscn),after=nodes(layered.tscn),seen=new Set();
  for(const n of after){if(n.parent!==undefined)assert.ok(seen.has(n.parent),`${n.path}: parent declared first`);seen.add(n.path);}
  assert.equal(after.filter(n=>n.type==='CollisionShape3D').length,before.filter(n=>n.type==='CollisionShape3D').length,'no shape lost or added');
  for(const f of ['Floor_01','Floor_02']){
    const body=name=>after.find(n=>n.path===`${f}/${name}`);
    assert.match(body('Collision_Layer2').block,/\ncollision_layer = 2$/);assert.match(body('Collision_Layer1').block,/\ncollision_layer = 1\ncollision_mask = 3$/);
    const shapes=parent=>after.filter(n=>n.type==='CollisionShape3D'&&n.parent===`${f}/${parent}`).map(n=>n.name);
    assert.ok(shapes('Collision_Layer2').length&&shapes('Collision_Layer2').every(n=>/^(Exterior|Wall)Collision_/.test(n)),'walls on layer 2');
    assert.ok(shapes('Collision_Layer1').length&&shapes('Collision_Layer1').every(n=>/^FloorCollision_/.test(n)),'floors on layer 1, mask 3');
    assert.equal(shapes('Collision').some(n=>/^(Exterior|Wall|Floor)Collision_/.test(n)),false,'nothing matched stays in Collision');
  }
  assert.match(after.find(n=>n.name==='WalkableRamp').block,/\ncollision_layer = 8\ncollision_mask = 1$/);
  assert.match(after.find(n=>n.name==='UnderStairBlocker').block,/\ncollision_layer = 1\n/,'stair_blocker is not stair');
  for(const d of layered.doors){
    const leaves=nodes(d.tscn).filter(n=>n.type==='AnimatableBody3D');assert.ok(leaves.length);
    for(const n of leaves){const mask=/collision_mask = (\d+)/.exec(nodes(plain.doors.find(p=>p.filename===d.filename).tscn).find(q=>q.path===n.path).block)[1];assert.match(n.block,new RegExp(`\\ncollision_layer = 16\\n(?:[^\\n]*\\n)*?collision_mask = ${mask}`),'leaf layer set, mask kept');}
  }
  assert.equal(nodes(layered.doors[1].tscn).filter(n=>n.type==='AnimatableBody3D').length,2,'both closet leaves');
  assert.deepEqual(exportGodotFiles(house,{gameLayer:parseGameLayer({version:1})}),{...plain,gameLayer:true},'an empty layer changes nothing');
  for(const [spec,pattern] of [[{collision:[{layer:2}]},/give part/],[{collision:[{part:'floor',layer:0}]},/layer must be/],[{collision:[{part:'floor',layer:2,mask:-1}]},/mask must be/],[{collision:[{part:'floor',match:'*',layer:2}]},/unknown field match/],[{collision:[{part:'wall',layer:2}]},/part must be one of/]])
    assert.throws(()=>parseGameLayer({version:1,...spec}),pattern);
  console.log('PASS game layer collision: walls and floors in separate bodies per floor, stair and door bodies set in place, parents first, validation');
}
{
  // glTF: wall, floor and ceiling pieces ride on a mesh of their own part, so Unreal collisionProfiles can tell them apart.
  const g=readGlb(exportGltfFiles(house,{}).glb).json,byName=new Map(g.nodes.map(n=>[n.name,n]));
  const pieces=name=>(byName.get(name).children||[]).filter(c=>/^U(BX|CX)_/.test(g.nodes[c].name)).length;
  const plain=nodes(exportGodotFiles(house).tscn).filter(n=>n.parent==='Floor_01/Collision');
  assert.equal(pieces('OutsideFaces'),plain.filter(n=>/^ExteriorCollision_/.test(n.name)).length,'exterior wall boxes on OutsideFaces');
  assert.equal(pieces('SideAFaces'),plain.filter(n=>/^WallCollision_/.test(n.name)).length,'partition boxes on SideAFaces');
  assert.equal(byName.get('OutsideFaces').extras.building_part,'exterior_wall');assert.equal(byName.get('FloorSlab').extras.building_part,'floor');
  assert.ok(pieces('FloorSlab')>=1);
  console.log('PASS glTF collision carriers by part: walls on wall meshes, floor on the slab');
}
{
  // Door filters: a single- and a double-door child of one name; a door material by width; Unreal rules validated alike.
  const layer=parseGameLayer({version:1,doorChildren:[{name:'Parts',scene:'res://door_parts_double.tscn',door:{leaves:2}},{name:'Parts',scene:'res://door_parts.tscn'}],
    nodeMaterials:[{part:'door_leaf',material:'res://m/door_wide.tres',door:{minWidth:1.2}},{part:'door_leaf',material:'res://m/door.tres'}],
    unreal:{doorChildren:[{name:'Parts',actor:'/Game/BP_Double.BP_Double_C',door:{leaves:2}},{name:'Parts',actor:'/Game/BP_Single.BP_Single_C'}],nodeMaterials:[{part:'door_leaf',material:'/Game/M_Wide',door:{style:['closet','room'],minWidth:1.2}}]}});
  const files=exportGodotFiles(house,{gameLayer:layer}),[front,closet]=files.doors.map(d=>d.tscn);
  assert.match(front,/path="res:\/\/door_parts.tscn"/);assert.doesNotMatch(front,/door_parts_double/);assert.match(front,/res:\/\/m\/door.tres/);assert.doesNotMatch(front,/door_wide/);
  assert.match(closet,/path="res:\/\/door_parts_double.tscn"/);assert.doesNotMatch(closet,/door_parts.tscn"/);assert.match(closet,/res:\/\/m\/door_wide.tres/);
  assert.equal((closet.match(/^\[node name="Parts"/gm)||[]).length,1,'one Parts child per door');
  assert.doesNotMatch(files.tscn,/door_parts|door_wide/,'door filters never reach the building scene');
  for(const [spec,pattern] of [[{doorChildren:[{name:'A',scene:'res://a.tscn'},{name:'A',scene:'res://b.tscn',door:{leaves:2}}]},/unique node name/],[{doorChildren:[{name:'A',scene:'res://a.tscn',door:{leaves:3}}]},/leaves must be 1 or 2/],
    [{nodeMaterials:[{part:'door_leaf',material:'res://a.tres',door:{style:'garage'}}]},/style must be one of/],[{nodeMaterials:[{part:'door_leaf',material:'res://a.tres',door:{}}]},/at least one/],[{unreal:{doorChildren:[{name:'A',actor:'/Game/A.A_C',door:{width:1}}]}},/unknown field width/]])
    assert.throws(()=>parseGameLayer({version:1,...spec}),pattern);
  console.log('PASS game layer door filters: double-door children and wide-door materials, Godot and Unreal rules validated alike');
}
{
  // Route check: walker radius and unreachableOk, in the shared code, the CLI and the web editor.
  assert.equal(parseWalkerRadius(''),.25);assert.equal(parseWalkerRadius(' 0.32 '),.32);assert.throws(()=>parseWalkerRadius('0.05'),/0.1 to 1/);assert.throws(()=>parseWalkerRadius('x'),/expected metres/);
  // A bedroom behind a 0.8 m door: a 0.25 m walker passes it, a 0.45 m one does not.
  const narrow=build([{op:'room.add',floorId:'floor_1',id:'g',value:{minX:-5,maxX:5,minZ:-4,maxZ:4}},{op:'wall.add',floorId:'floor_1',id:'w_part',value:{a:{x:1,z:-4},b:{x:1,z:4}}},
    {op:'opening.add',floorId:'floor_1',id:'front',value:{type:'door',wallId:'g-north',at:{x:-2,z:-4},width:1.2,height:2.1,doorStyle:'exterior'}},
    {op:'opening.add',floorId:'floor_1',id:'bed',value:{type:'door',wallId:'w_part',at:{x:1,z:2},width:.8,height:2.1}}]);
  assert.equal(analyzeReachability(narrow).unreachable.length,0);
  const wide=analyzeReachability(narrow,{radius:.45});assert.equal(wide.unreachable.length,1);assert.equal(wide.settings.radius,.45);
  // A parapet: the roof slab floor is unreachable by design and marked so.
  const parapet=build([{op:'room.add',floorId:'floor_1',id:'g',value:{minX:-5,maxX:5,minZ:-4,maxZ:4}},{op:'opening.add',floorId:'floor_1',id:'front',value:{type:'door',wallId:'g-north',at:{x:0,z:-4},width:1.2,height:2.1,doorStyle:'exterior'}},
    {op:'building.update',value:{roof:{type:'flat'}}},{op:'floor.add-top',aboveFloorId:'floor_1',id:'roof',value:{label:'Parapet',wallHeight:.9}},{op:'room.add',floorId:'roof',id:'p',value:{minX:-5,maxX:5,minZ:-4,maxZ:4}}]);
  const warned=reachabilityWarnings(parapet,{});assert.equal(warned.result.unreachable.length,1);assert.equal(warned.warnings.length,1);assert.equal(warned.result.ok,false);
  const marked=build([{op:'floor.update',id:'roof',value:{unreachableOk:true}}],parapet),quiet=reachabilityWarnings(marked,{});
  assert.equal(marked.floors[1].unreachableOk,true);assert.deepEqual(quiet.warnings,[]);assert.equal(quiet.result.ok,true);assert.equal(quiet.result.unreachable[0].expected,true);
  const summary=createCheckReport([{building:marked,errors:[],warnings:[],reachability:quiet.result}]).results[0].routeCheck;
  assert.equal(summary.unreachableAreas,0);assert.equal(summary.expectedUnreachableAreas,1);
  assert.equal('unreachableOk' in build([{op:'floor.update',id:'roof',value:{unreachableOk:false}}],marked).floors[1],false,'false removes it');
  assert.equal('unreachableOk' in build([{op:'floor.update',id:'roof',value:{unreachableOk:null}}],marked).floors[1],false,'null removes it');
  assert.equal(applyTransaction(parapet,{version:1,operations:[{op:'floor.update',id:'roof',value:{unreachableOk:'yes'}}]}).ok,false);
  // CLI
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'nobody-came-'));
  try{
    const run=args=>spawnSync(process.execPath,[path.join(root,'cli.mjs'),...args],{cwd:temp,encoding:'utf8'});
    fs.writeFileSync(path.join(temp,'narrow.json'),JSON.stringify(narrow));fs.writeFileSync(path.join(temp,'marked.json'),JSON.stringify(marked));
    let r=run(['validate','narrow.json','--reachability','--warnings-as-errors']);assert.equal(r.status,0,r.stdout+r.stderr);
    r=run(['validate','narrow.json','--reachability','--walker-radius','0.45','--warnings-as-errors','--json']);assert.equal(r.status,1,r.stdout+r.stderr);
    assert.deepEqual(JSON.parse(r.stdout).results[0].warnings.map(w=>w.message),reachabilityWarnings(narrow,{radius:.45}).warnings.map(w=>w.message));
    r=run(['validate','narrow.json','--walker-radius','0.45']);assert.equal(r.status,2);assert.match(r.stdout+r.stderr,/--walker-radius requires --reachability/);
    r=run(['validate','narrow.json','--reachability','--walker-radius','3']);assert.equal(r.status,2);assert.match(r.stdout+r.stderr,/expected metres from 0.1 to 1/);
    r=run(['validate','marked.json','--reachability','--warnings-as-errors','--json']);assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(JSON.parse(r.stdout).results[0].reachability.unreachable[0].expected,true);
    // Web: Walker radius field and the floor's Unreachable areas expected checkbox give the same warnings and blueprint.
    const w=await createEditorHarness(),$w=w.$,messages=()=>$w('#validation-results').children.map(li=>li.children[0].textContent).filter(m=>/reached|Walker/.test(m));
    await w.loadBuildingData(structuredClone(narrow));const toggle=$w('#route-check-toggle');toggle.checked=true;await toggle.dispatch('change');
    assert.deepEqual(messages(),[]);
    const radius=$w('#route-radius');radius.value='0.45';await radius.dispatch('change');
    assert.deepEqual(messages(),reachabilityWarnings(narrow,{radius:.45}).warnings.map(x=>x.message),'web Walker radius equals --walker-radius');
    assert.match($w('#status-text').textContent,/0.45 m walker radius: 1 unreachable areas/);
    radius.value='5';await radius.dispatch('change');assert.ok(messages().some(m=>/Walker radius "5": expected metres/.test(m)),'parse errors appear as warnings');
    radius.value='';await radius.dispatch('change');
    await w.loadBuildingData(structuredClone(parapet));{const pick=$w('#floor-select');pick.value='1';await pick.dispatch('change');}
    assert.equal(messages().length,1);
    const ok=$w('#unreachable-ok-toggle');assert.equal(ok.checked,false);ok.checked=true;await ok.dispatch('change');
    assert.deepEqual(w.snapshot(),marked,'web checkbox equals floor.update unreachableOk');assert.deepEqual(messages(),[]);
    assert.deepEqual(w.errors,[]);
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
  console.log('PASS route check: walker radius (shared parser, CLI --walker-radius, web Walker radius) and unreachableOk (floor.update, web checkbox, check report)');
}
{
  // Web: the Godot Export panel's game layer reports and applies collision rules as the CLI does.
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'nobody-came-layer-'));
  try{
    fs.writeFileSync(path.join(temp,'house.json'),JSON.stringify(house));fs.writeFileSync(path.join(temp,'layer.json'),JSON.stringify(collisionLayerSpec));
    const r=spawnSync(process.execPath,[path.join(root,'cli.mjs'),'export','house.json','--out','out','--game-layer','layer.json'],{cwd:temp,encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);
    const expected=exportGodotFiles(house,{collision:true,markers:true,placeholderMaterials:false,shareDoorScenes:false,gameLayer:parseGameLayer(collisionLayerSpec)});
    assert.equal(fs.readFileSync(path.join(temp,'out',expected.tscnName),'utf8'),expected.tscn,'CLI --game-layer writes the collision bodies');
    const g=await createEditorHarness();await g.loadBuildingData(structuredClone(house));
    const input=g.$('#game-layer-input');input.files=[{name:'layer.json',text:async()=>JSON.stringify(collisionLayerSpec)}];await input.dispatch('change');
    assert.match(g.$('#game-layer-status').textContent,/5 collision rules/);assert.deepEqual(g.errors,[]);
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
  console.log('PASS web and CLI game layer: collision rules counted in the export panel and written by --game-layer');
}
{
  // Authoring traps from the report: each rejection now says what to do.
  const fails=(ops,pattern)=>{const r=applyTransaction(blank(),{version:1,operations:ops});assert.equal(r.ok,false);assert.match(JSON.stringify(r.errors),pattern);};
  const room={op:'room.add',floorId:'floor_1',id:'g',value:{minX:-5,maxX:5,minZ:-4,maxZ:4}};
  fails([room,{op:'marker.add',floorId:'floor_1',id:'g-north',value:{label:'m',position:{x:0,y:1,z:0}}}],/duplicate ID g-north \(already used in walls; walls, openings, [^)]*markers[^)]* share one set of IDs here\)/);
  fails([room,{op:'stair.add',floorId:'floor_1',id:'s',value:{x:-3,z:0,width:1.2,run:4,direction:'north'}}],/add the floor above first \(floor.add-top or floor.insert\)/);
  fails([...nobodyCameRecipe,{op:'stair.guard',floorId:'f2',id:'s'}],/Unknown stair ID on floor f2: s \(it is on floor floor_1; a stair belongs to its lower floor\)/);
  console.log('PASS authoring traps: shared ID namespace, stair before its upper floor and stair.guard on the upper floor name the fix');
}
assert.throws(()=>parseGameLayer({version:1,unreal:{doorChildren:[{name:'A',actor:'/Game/A.A_C'},{name:'A',actor:'/Game/B.B_C'}]}}),/unique/,'unreal door children: same rule as Godot');
