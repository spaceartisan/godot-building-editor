// Optional engine integration suite: all temporary exports are produced and
// checked via the CLI. Deliberately broken copies never reach bundled examples.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url)),cli=path.join(root,'cli.mjs');
if(!process.env.GODOT_BIN)throw new Error('Set GODOT_BIN for the engine-assets suite');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'building-asset-engine-'));
let calls=0;
function run(args,expected=0){const r=spawnSync(process.execPath,[cli,...args,'--json'],{cwd:temp,env:process.env,encoding:'utf8',timeout:90000,maxBuffer:16000000});calls++;assert.equal(r.status,expected,r.stdout+r.stderr);return JSON.parse(r.stdout);}
const check=(dir,expected=0,flags=[])=>run(['godot-check','--assets',dir,...flags],expected);
const exportTo=(name,flags=[])=>{const dir=path.join(temp,name);run(['export',path.join(root,'examples/roof_attachment.building.json'),'--out',dir,...flags]);return dir;};
try{
  const normal=exportTo('normal'),scene=path.join(normal,'explicit_roof_attachment.tscn'),before=fs.readFileSync(scene);
  fs.writeFileSync(path.join(normal,'project.godot'),'INVALID FOREIGN CONFIG MUST NOT BE USED');
  const good=check(normal,0,['--require-collision']);assert.equal(good.checks.physicsRays,0);assert.equal(good.checks.trimmedMeshComparisons,3);assert.ok(good.checks.meshInstances>0);assert.ok(good.checks.collisionShapes>0);
  assert.deepEqual(fs.readFileSync(scene),before);assert.equal(fs.readFileSync(path.join(normal,'project.godot'),'utf8'),'INVALID FOREIGN CONFIG MUST NOT BE USED');
  assert.ok(!fs.existsSync(path.join(normal,'.godot')),'Original asset folder must not receive engine imports');
  fs.writeFileSync(path.join(normal,'assembly.tscn'),'[gd_scene load_steps=2 format=3]\n\n[ext_resource type="PackedScene" path="explicit_roof_attachment.tscn" id="House"]\n\n[node name="Assembly" type="Node3D"]\n\n[node name="HouseA" parent="." instance=ExtResource("House")]\n\n[node name="HouseB" parent="." instance=ExtResource("House")]\nposition = Vector3(20, 0, 0)\n');
  const assembled=check(normal);assert.equal(assembled.checks.scenes,2);assert.equal(assembled.checks.trimmedMeshComparisons,9,'Repeated roof names must resolve within each building instance');
  const colored=exportTo('colored',['--placeholders']);check(colored,1);assert.ok(check(colored,0,['--allow-materials']).checks.materialSurfaces>0);
  const noCollision=exportTo('no-collision',['--no-collision']);assert.equal(check(noCollision).checks.collisionShapes,0);check(noCollision,1,['--require-collision']);
  const missing=exportTo('missing-shape'),missingFile=path.join(missing,'explicit_roof_attachment.tscn');
  const originalMissing=fs.readFileSync(missingFile,'utf8');const modifiedMissing=originalMissing.replace(/^shape = SubResource\("[^"\n]+"\)\n/m,'');assert.notEqual(originalMissing,modifiedMissing);fs.writeFileSync(missingFile,modifiedMissing);
  assert.match(JSON.stringify(check(missing,1)),/Missing collision resource/);
  const mismatch=exportTo('roof-mismatch'),mismatchFile=path.join(mismatch,'explicit_roof_attachment.tscn');
  const originalMismatch=fs.readFileSync(mismatchFile,'utf8');const modifiedMismatch=originalMismatch.replace(/(\[sub_resource type="ConcavePolygonShape3D"[^\n]*\]\ndata = PackedVector3Array\()([-\d.]+)/,(m,p,n)=>p+(Number(n)+.5));assert.notEqual(originalMismatch,modifiedMismatch);fs.writeFileSync(mismatchFile,modifiedMismatch);
  assert.match(JSON.stringify(check(mismatch,1)),/mesh\/collision mismatch/);
  const offset=exportTo('roof-offset'),offsetFile=path.join(offset,'explicit_roof_attachment.tscn');
  const originalOffset=fs.readFileSync(offsetFile,'utf8');const modifiedOffset=originalOffset.replace(/(\[node name="ManualRoof_002_West_Collision"[^\n]*\]\n)/,'$1position = Vector3(0, 1, 0)\n');assert.notEqual(originalOffset,modifiedOffset);fs.writeFileSync(offsetFile,modifiedOffset);
  assert.match(JSON.stringify(check(offset,1)),/mesh\/collision mismatch/);
  const authored=path.join(temp,'authored.building.json');
  run(['edit',path.join(root,'examples/roof_attachment.building.json'),'--ops',path.join(root,'examples/transactions/porch-entry.edit.json'),'--out',authored,'--warnings-as-errors']);
  const authoredAssets=path.join(temp,'authored-scenes');run(['export',authored,'--out',authoredAssets,'--warnings-as-errors']);
  const authoredChecks=check(authoredAssets,0,['--require-collision']);
  assert.equal(authoredChecks.checks.scenes,3);assert.equal(authoredChecks.checks.trimmedMeshComparisons,3);assert.equal(authoredChecks.checks.materialSurfaces,0);
  assert.ok(authoredChecks.checks.collisionShapes>0);
  // Polygon (flat, hip, concave flat), rectangular hip and mansard manual roofs export with collision.
  const roofOps=path.join(temp,'roofs.edit.json'),roofBase=path.join(temp,'roof-base.json'),roofed=path.join(temp,'roofed.json');
  run(['new','--out',roofBase,'--name','Roof shapes']);
  fs.writeFileSync(roofOps,JSON.stringify({version:1,operations:[{op:'building.update',value:{roof:{type:'none'}}},
    {op:'roof.add',id:'bay',value:{type:'flat',polygon:[{x:-10,z:20},{x:10,z:20},{x:4,z:26},{x:-4,z:26}],baseY:3,overhang:.2}},
    {op:'roof.add',id:'hex',value:{type:'hip',polygon:[{x:40,z:0},{x:44,z:-2},{x:48,z:0},{x:48,z:4},{x:44,z:6},{x:40,z:4}],baseY:3,pitch:30}},
    {op:'roof.add',id:'hip',value:{type:'hip',minX:20,maxX:26,minZ:0,maxZ:4,baseY:3}},
    {op:'roof.add',id:'ell',value:{type:'flat',polygon:[{x:60,z:0},{x:70,z:0},{x:70,z:4},{x:64,z:4},{x:64,z:10},{x:60,z:10}],baseY:3,overhang:.5}},
    {op:'roof.add',id:'mansard',value:{type:'hip',minX:80,maxX:92,minZ:0,maxZ:8,baseY:3,pitch:60,flatTopHeight:1.2}}]}));
  run(['edit',roofBase,'--ops',roofOps,'--out',roofed]);const roofAssets=path.join(temp,'roof-assets');run(['export',roofed,'--out',roofAssets]);
  const roofChecks=check(roofAssets,0,['--require-collision']);assert.ok(roofChecks.checks.collisionShapes>=17,'one collision shape per roof part');
  // Double-leaf exterior and room doors (leaves: 2) load with both hinges' collision.
  const doubleOps=path.join(temp,'double.edit.json'),doubled=path.join(temp,'double.json'),doubleAssets=path.join(temp,'double-assets');
  const corners=[[-4,-3],[4,-3],[4,3],[-4,3]];
  fs.writeFileSync(doubleOps,JSON.stringify({version:1,operations:[...corners.map((c,i)=>({op:'wall.add',floorId:'floor_1',id:`w${i}`,value:{a:{x:c[0],z:c[1]},b:{x:corners[(i+1)%4][0],z:corners[(i+1)%4][1]},role:'exterior'}})),
    {op:'opening.add',floorId:'floor_1',id:'front',value:{type:'door',wallId:'w0',t:.5,width:1.8,height:2.2,doorStyle:'exterior',leaves:2}},
    {op:'opening.add',floorId:'floor_1',id:'back',value:{type:'door',wallId:'w2',t:.5,width:1.6,height:2.1,doorStyle:'room',leaves:2}}]}));
  run(['edit',roofBase,'--ops',doubleOps,'--out',doubled]);run(['export',doubled,'--out',doubleAssets]);
  const doubleChecks=check(doubleAssets,0,['--require-collision']);assert.equal(doubleChecks.checks.scenes,3);
  for(const name of fs.readdirSync(path.join(doubleAssets,'doors')))assert.match(fs.readFileSync(path.join(doubleAssets,'doors',name),'utf8'),/parent="Hinge2\/AnimatableBody3D"/);
  // Shared door scenes (--share-door-scenes) load and instance in Godot.
  const sharedDir=path.join(temp,'shared-doors');run(['export',path.join(root,'examples/farmhouse.building.json'),'--out',sharedDir,'--share-door-scenes']);
  const sharedFiles=fs.readdirSync(path.join(sharedDir,'doors')),perDoor=path.join(temp,'per-door');run(['export',path.join(root,'examples/farmhouse.building.json'),'--out',perDoor]);
  assert.ok(sharedFiles.length<fs.readdirSync(path.join(perDoor,'doors')).length,'identical farmhouse doors share scenes');
  assert.equal(check(sharedDir,0,['--require-collision']).checks.scenes,1+sharedFiles.length);
  console.log('PASS authored demo: CLI transaction → fresh JSON → scene/door export → Godot resource and roof collision checks');
  const levels=path.join(temp,'levels.building.json');
  run(['edit',path.join(root,'examples/twostory.building.json'),'--ops',path.join(root,'examples/transactions/twostory-levels.edit.json'),'--out',levels,'--warnings-as-errors']);
  const levelAssets=path.join(temp,'level-scenes');run(['export',levels,'--out',levelAssets,'--warnings-as-errors']);
  const levelChecks=check(levelAssets,0,['--require-collision']);
  assert.equal(levelChecks.checks.materialSurfaces,0);assert.ok(levelChecks.checks.scenes>1);assert.ok(levelChecks.checks.collisionShapes>0);
  console.log('PASS floor-level demo: CLI overrides → scene/door export → Godot resources and collision presence (no walking/headroom probes)');
  console.log(`PASS ${calls} CLI engine integration calls: resources, repeated instances, collision opt-out/requirement, placeholder policy, missing shape, roof data/transform mismatch and input isolation`);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
