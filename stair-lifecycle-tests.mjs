import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {applyTransaction} from './src/transactions.js';
import {prepareDocument} from './src/diagnostics.js';
import {floorView} from './src/model.js';
import {floorRectanglesForView,exportGodotFiles} from './src/exporter.js';
import {createEditorHarness} from './qa/editor-harness.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),sourceFile=path.join(root,'examples/stair_ramp_north.building.json');
const bytes=fs.readFileSync(sourceFile),source=prepareDocument(JSON.parse(bytes)).building;
const addFile=path.join(root,'examples/transactions/add-second-stair.edit.json'),removeFile=path.join(root,'examples/transactions/remove-second-stair.edit.json');
const addRecipe=JSON.parse(fs.readFileSync(addFile)),removeRecipe=JSON.parse(fs.readFileSync(removeFile));
const add=addRecipe.operations[0],remove=removeRecipe.operations[0];
const edit=(ops,input=source,options={})=>applyTransaction(input,{version:1,operations:ops},options);
const reject=(ops,pattern,input=source)=>{const before=structuredClone(input),r=edit(ops,input);assert.equal(r.ok,false);assert.equal(r.building,null);assert.match(JSON.stringify(r.errors),pattern);assert.deepEqual(input,before);};
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'stair-lifecycle-'));let calls=0;
function run(args,expected=0,json=true){const r=spawnSync(process.execPath,[path.join(root,'cli.mjs'),...args,...(json?['--json']:[])],{cwd:temp,encoding:'utf8',timeout:30000,maxBuffer:16000000});calls++;assert.equal(r.status,expected,r.stdout+r.stderr);return json?JSON.parse(r.stdout):r.stdout;}
const hasFloor=(b,x,z)=>floorRectanglesForView(floorView(b,1),b.floors[0].stairs).some(r=>x>r.minX&&x<r.maxX&&z>r.minZ&&z<r.maxZ);
try{
  const added=edit([add],source,{warningsAsErrors:true});assert.equal(added.ok,true,JSON.stringify(added));
  assert.equal(added.stairChanges.length,1);assert.equal(added.stairChanges[0].before,null);assert.equal(added.stairChanges[0].after.id,'second_stair');
  assert.equal(hasFloor(source,3,0),true);assert.equal(hasFloor(added.building,3,0),false);assert.equal(hasFloor(added.building,1,0),false);
  assert.deepEqual(added.building.floors[0].stairs[0],source.floors[0].stairs[0]);
  const removed=edit([remove],added.building,{warningsAsErrors:true});assert.equal(removed.ok,true);assert.equal(removed.stairChanges[0].after,null);assert.deepEqual(removed.building,source);
  assert.equal(hasFloor(removed.building,3,0),true);assert.equal(hasFloor(removed.building,1,0),false);
  assert.deepEqual(exportGodotFiles(removed.building),exportGodotFiles(source));
  const empty=edit([{op:'stair.remove',floorId:'floor_1',id:'stairs_8'}]);assert.equal(empty.ok,true);assert.equal(hasFloor(empty.building,1,0),true);
  const noChange=edit([add,remove]);assert.equal(noChange.ok,true);assert.deepEqual(noChange.changes,[]);assert.deepEqual(noChange.stairChanges,[]);
  const minimal={...add,id:'minimal',value:{x:3,z:0,width:1,run:4,direction:'north'}};
  const defaults=edit([minimal]);assert.equal(defaults.ok,true);assert.deepEqual(defaults.building.floors[0].stairs[1],{id:'minimal',label:'Ramp',x:3,z:0,width:1,run:4,direction:'north',style:'ramp',steps:12,blockBelow:true});
  assert.deepEqual(defaults,edit([minimal]));
  for(const key of ['x','z','width','run','direction']){const bad=structuredClone(add);delete bad.value[key];reject([bad],/Missing required/);}
  reject([add,add],/already exists/);reject([{...add,id:'wall_2'}],/duplicate ID/);reject([remove],/Unknown stair/);
  reject([{...add,floorId:'floor_9'}],/adjacent upper/);reject([{...remove,value:{}}],/Unknown field/);
  const orphan=structuredClone(source);orphan.floors.pop();assert.equal(edit([{...remove,id:'stairs_8'}],orphan).ok,true,'Removal can repair an imported orphan');
  const overlapping={...add,value:{...add.value,x:1}};const overlap=edit([overlapping]);assert.equal(overlap.ok,true);assert.ok(overlap.warnings.some(w=>/stairs .* overlap/.test(w.message)));assert.equal(edit([overlapping],source,{warningsAsErrors:true}).ok,false);
  const landing={...add,value:{...add.value,x:1,z:-4.05,run:4,direction:'south'}};const crossed=edit([landing]);assert.ok(crossed.warnings.some(w=>/upper landing enters/.test(w.message)));
  const repaired=edit([overlapping,{op:'stair.update',floorId:'floor_1',id:'second_stair',value:{x:3}}],source,{warningsAsErrors:true});assert.equal(repaired.ok,true);
  const mixed=edit([add,{op:'floor.update',id:'floor_1',value:{wallHeight:3}}]);assert.equal(mixed.ok,true);assert.equal(mixed.structuralChanges.stairs.length,1,'New stairs must not receive invented before-levels');assert.equal(mixed.stairChanges.length,2);
  const manual=structuredClone(source);manual.manualFloors=[{id:'independent',kind:'floor',label:'Keep',minX:10,maxX:12,minZ:10,maxZ:12,topY:2.98,thickness:.18}];assert.deepEqual(edit([add],manual).building.manualFloors,manual.manualFloors);
  console.log('PASS add/remove/defaults, net-change reports, two independent holes, exact surface restoration, orphan repair and multiple-stair warnings');

  const editor=await createEditorHarness();editor.loadBuildingData(structuredClone(added.building));assert.deepEqual(editor.snapshot(),added.building);editor.chooseSelection({type:'stair',id:'second_stair'});await editor.window.dispatch('keydown',{key:'Delete'});assert.deepEqual(editor.snapshot(),source);
  await editor.$('#undo-btn').click();assert.deepEqual(editor.snapshot(),added.building);await editor.$('#redo-btn').click();assert.deepEqual(editor.snapshot(),source);assert.deepEqual(editor.errors,[]);
  const args=['edit',sourceFile,'--ops',addFile],dry=run([...args,'--dry-run','--warnings-as-errors']);assert.deepEqual(fs.readdirSync(temp),[]);
  const addedFile=path.join(temp,'two.json'),saved=run([...args,'--out',addedFile,'--warnings-as-errors']);assert.equal(saved.resultSha256,dry.resultSha256);
  const restoredFile=path.join(temp,'restored.json'),savedRemoval=run(['edit',addedFile,'--ops',removeFile,'--out',restoredFile,'--warnings-as-errors']);assert.equal(savedRemoval.stairChanges[0].after,null);assert.deepEqual(JSON.parse(fs.readFileSync(restoredFile)),source);
  assert.match(run(['edit',addedFile,'--ops',removeFile,'--dry-run'],0,false),/Stair removed second_stair/);
  const dest=path.join(temp,'scenes');run(['export',addedFile,'--out',dest,'--warnings-as-errors']);const expected=exportGodotFiles(added.building);assert.equal(fs.readFileSync(path.join(dest,expected.tscnName),'utf8'),expected.tscn);
  const badFile=path.join(temp,'bad.json');fs.writeFileSync(badFile,JSON.stringify({version:1,operations:[add,{...remove,id:'missing'}]}));const refused=path.join(temp,'absent','bad.json');run(['edit',sourceFile,'--ops',badFile,'--out',refused],1);assert.equal(fs.existsSync(path.dirname(refused)),false);
  fs.writeFileSync(badFile,JSON.stringify({version:1,operations:[overlapping]}));run(['edit',sourceFile,'--ops',badFile,'--out',refused,'--warnings-as-errors'],1);assert.equal(fs.existsSync(refused),false);
  assert.deepEqual(fs.readFileSync(sourceFile),bytes);console.log(`PASS ${calls} lifecycle CLI calls, web-load/delete/undo/redo parity, source preservation and no partial publication`);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
