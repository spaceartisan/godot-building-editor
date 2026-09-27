import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {applyTransaction} from './src/transactions.js';
import {prepareDocument, resolvedFloorDimensions} from './src/diagnostics.js';
import {proposeFloorStackEdit} from './src/floor-stack.js';
import {exportGodotFiles} from './src/exporter.js';
import {createEditorHarness} from './qa/editor-harness.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const sourcePath=path.join(root,'examples/stair_ramp_north.building.json');
const bytes=fs.readFileSync(sourcePath),source=prepareDocument(JSON.parse(bytes)).building;
const recipePath=path.join(root,'examples/transactions/add-third-floor.edit.json');
const removalPath=path.join(root,'examples/transactions/remove-third-floor.edit.json');
const recipe=JSON.parse(fs.readFileSync(recipePath)),removal=JSON.parse(fs.readFileSync(removalPath));
const add={op:'floor.add-top',id:'third',aboveFloorId:'floor_9'},remove={op:'floor.remove-top',id:'third'};
const edit=(operations,input=source,options={})=>applyTransaction(input,{version:1,operations},options);
const reject=(operations,pattern,input=source)=>{
  const copy=structuredClone(input),result=edit(operations,input);
  assert.equal(result.ok,false);assert.equal(result.building,null);assert.match(JSON.stringify(result.errors),pattern);assert.deepEqual(input,copy);return result;
};
const valid=result=>{assert.equal(result.ok,true,JSON.stringify(result.errors));return result.building;};
const empty=edit([add]),added=valid(empty);
assert.deepEqual(edit([add]),empty,'Explicit floor IDs yield deterministic reports and output');
assert.deepEqual(added.floors.slice(0,2),source.floors);assert.equal(added.floors[2].autoFloor,true);assert.equal(added.floors[2].autoCeiling,true);
assert.deepEqual(empty.structuralChanges.floors,[{id:'third',index:3,before:null,after:resolvedFloorDimensions(added,2)}]);
assert.equal(empty.floorCoverageChanges.at(-1).before,null);assert.equal(empty.floorCoverageChanges.at(-1).floorId,'third');
assert.deepEqual(valid(edit([remove],added)),source);
assert.deepEqual(edit([add,remove]).changes,[],'A complete reversal is a net-zero document edit');
const webAdded=proposeFloorStackEdit(source,1,'above');assert.equal(webAdded.ok,true);webAdded.building.floors[2].id='third';assert.deepEqual(added,webAdded.building);
const overrides=valid(edit([{...add,value:{label:'Loft',elevation:6.5,wallHeight:2.4,floorThickness:.22,autoFloor:false,autoCeiling:false}}]));
assert.equal(overrides.floors[2].elevation,6.5);assert.equal(overrides.floors[2].wallHeight,2.4);assert.equal(overrides.floors[2].floorThickness,.22);assert.equal(overrides.floors[2].autoFloor,false);
const defaults=valid(edit([{...add,value:{elevation:null,wallHeight:null,floorThickness:null}}]));assert.deepEqual(defaults,added);
assert.deepEqual(valid(edit([{...add,value:{}}])),added);
const repaired=valid(edit([{...add,value:{elevation:0}},{op:'floor.update',id:'third',value:{elevation:null}}]));assert.deepEqual(repaired,added);

const result=applyTransaction(source,recipe),three=valid(result);assert.deepEqual(result.warnings,[]);
assert.deepEqual(prepareDocument(three).building,three);
assert.equal(result.stairChanges.length,1);assert.equal(result.stairChanges[0].before,null);assert.equal(result.stairChanges[0].after.upperFloorId,'third');
assert.deepEqual(three.floors[0],source.floors[0]);assert.deepEqual(three.floors[1].walls,source.floors[1].walls);
reject([remove],/removeContents/,three);reject([{...remove,removeContents:true}],/removeAffectedStairs/,three);
const removed=applyTransaction(three,removal),restored=valid(removed);assert.deepEqual(restored,source);
assert.equal(removed.floorStackChanges[0].removedEntities.length,7);
assert.deepEqual(removed.floorStackChanges[0].removedIncomingStairs.map(s=>[s.floorId,s.id]),[['floor_9','third-stair']]);
assert.equal(removed.stairChanges[0].after,null);assert.equal(removed.structuralChanges.floors[0].after,null);
assert.equal(removed.floorCoverageChanges.at(-1).after,null);
assert.deepEqual(proposeFloorStackEdit(three,2,'remove',{removeAffectedStairs:true}).building,restored);
assert.deepEqual(exportGodotFiles(restored),exportGodotFiles(source),'Removal exactly restores the prior exported scene');
const explicit=valid(edit([{op:'stair.remove',floorId:'floor_9',id:'third-stair'},...three.floors[2].openings.map(o=>({op:'opening.remove',floorId:'third',id:o.id})),...three.floors[2].walls.map(w=>({op:'wall.remove',floorId:'third',id:w.id})),{op:'region.remove',floorId:'third',id:'third-room'},remove],three));
assert.deepEqual(explicit,source,'Explicit entity deletion needs no blanket flags');

for(const [op,pattern] of [
  [{...add,id:'floor_1'},/already exists/],[{...add,aboveFloorId:'floor_1'},/current top/],[{...add,aboveFloorId:undefined},/text/],
  [{...add,floorId:'floor_9'},/Unknown field/],[{...add,value:{walls:[]}},/Unknown field/],[{...add,value:null},/object/],
  [{...add,value:{autoFloor:1}},/boolean/],[{...add,value:{autoCeiling:null}},/boolean/],[{...add,value:{label:''}},/nonempty/],
  [{...add,value:{elevation:-1}},/above the preceding/],[{...add,value:{floorThickness:0}},/finite/],[{...add,value:{wallHeight:1001}},/finite/],
  [{...remove,id:'floor_1',removeContents:true,removeAffectedStairs:true},/current top/],
  [{...remove,removeContents:'yes'},/boolean/],[{...remove,removeAffectedStairs:1},/boolean/],[{...remove,value:{}},/Unknown field/]
])reject([op],pattern);
const one=structuredClone(source);one.floors.pop();one.floors[0].stairs=[];
reject([{op:'floor.remove-top',id:'floor_1',removeContents:true}],/at least one/,one);
reject([add,{op:'wall.add',floorId:'third',id:'oversize',value:{a:{x:0,z:0},b:{x:5,z:0},height:9}}],/height exceeds/);
reject([add,{op:'wall.add',floorId:'third',id:'w',value:{a:{x:0,z:0},b:{x:5,z:0}}},{op:'opening.add',floorId:'third',id:'o',value:{type:'door',wallId:'w',t:.5,width:1,height:9}}],/exceeds|out.of.bounds|fit/i);
reject([add,{op:'wall.update',floorId:'third',id:'missing',value:{label:'No'}}],/Unknown wall/);

const orphan=structuredClone(source);orphan.floors[1].stairs=[{...source.floors[0].stairs[0],id:'orphan'}];
const connected=edit([add],orphan);valid(connected);assert.equal(connected.structuralChanges.stairs[0].before,null);assert.ok(Math.abs(connected.structuralChanges.stairs[0].after.rise-2.98)<1e-10);
assert.equal(connected.stairChanges[0].before.upperFloorId,null);assert.equal(connected.stairChanges[0].after.upperFloorId,'third');
const populated=structuredClone(three);populated.floors[2].stairs=[{...source.floors[0].stairs[0],id:'top-orphan'}];
populated.floors[2].platforms=[{id:'top-deck',label:'Deck',minX:6,maxX:8,minZ:0,maxZ:2,kind:'deck',height:0,covered:false}];
const gone=applyTransaction(populated,removal);valid(gone);assert.equal(gone.platformChanges[0].after,null);assert.equal(gone.stairChanges.find(s=>s.id==='top-orphan').after,null);
assert.ok(gone.floorStackChanges[0].removedEntities.some(e=>e.id==='top-deck'));
const manual=structuredClone(source);manual.manualFloors=[{id:'independent',kind:'floor',label:'Independent',minX:30,maxX:32,minZ:0,maxZ:2,topY:8,thickness:.18}];
const kept=edit([add],manual);valid(kept);assert.deepEqual(kept.building.manualFloors,manual.manualFloors);assert.ok(kept.warnings.some(w=>/absolute heights/.test(w.message)));
const strict=edit([add],manual,{warningsAsErrors:true});assert.equal(strict.ok,false);assert.equal(strict.building,null);assert.equal(strict.floorStackChanges[0].action,'added');
assert.equal(edit([add,remove],manual,{warningsAsErrors:true}).ok,true,'Net-zero stack change needs no independent-height warning');
console.log('PASS floor stack: shared web defaults/removal, identities, atomic validation, explicit content/stair guards, nullable reports, orphans and independent surfaces');

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'floor-lifecycle-'));let calls=0;
const run=(args,status=0,json=true)=>{const r=spawnSync(process.execPath,[path.join(root,'cli.mjs'),...args,...(json?['--json']:[])],{cwd:temp,encoding:'utf8',timeout:30000,maxBuffer:16000000});calls++;assert.equal(r.status,status,r.stdout+r.stderr);assert.equal(r.stderr,'');return json?JSON.parse(r.stdout):r.stdout;};
try{
  const args=['edit',sourcePath,'--ops',recipePath],out=path.join(temp,'third.json');
  const dry=run([...args,'--dry-run','--warnings-as-errors']);assert.deepEqual(fs.readdirSync(temp),[]);
  const saved=run([...args,'--out',out,'--warnings-as-errors']);assert.equal(saved.resultSha256,dry.resultSha256);assert.deepEqual(saved.floorStackChanges,dry.floorStackChanges);
  const text=run([...args,'--dry-run'],0,false);assert.match(text,/Top floor added: third/);assert.match(text,/\(absent\)/);
  const inventory=run(['inspect',out,'--entities']);assert.equal(inventory.results[0].inspection.floors.length,3);
  const editor=await createEditorHarness();editor.loadBuildingData(JSON.parse(fs.readFileSync(out)));assert.deepEqual(editor.snapshot(),three);assert.deepEqual(editor.errors,[]);
  const exportDir=path.join(temp,'assets');run(['export',out,'--out',exportDir,'--warnings-as-errors']);
  const files=exportGodotFiles(editor.snapshot());assert.equal(fs.readFileSync(path.join(exportDir,files.tscnName),'utf8'),files.tscn);
  for(const shell of ['OutsideFaces','InsideFaces','SideAFaces','SideBFaces'])assert.match(files.tscn,new RegExp(`name="${shell}"`));assert.doesNotMatch(files.tscn,/type="StandardMaterial3D"/);
  const restoredPath=path.join(temp,'restored.json');run(['edit',out,'--ops',removalPath,'--out',restoredPath,'--warnings-as-errors']);assert.deepEqual(JSON.parse(fs.readFileSync(restoredPath)),source);
  assert.match(run(['edit',out,'--ops',removalPath,'--dry-run'],0,false),/Top floor removed: third; removed 7 owned entities and 1 incoming stairs/);
  run([...args,'--out',out],3);
  const bad=path.join(temp,'bad.edit.json'),dest=path.join(temp,'missing','rejected.json');
  fs.writeFileSync(bad,JSON.stringify({version:1,operations:[remove]}));run(['edit',out,'--ops',bad,'--out',dest],1);assert.equal(fs.existsSync(path.dirname(dest)),false);
  fs.writeFileSync(bad,JSON.stringify({version:1,operations:[add,{op:'floor.update',id:'third',value:{elevation:0}}]}));run(['edit',sourcePath,'--ops',bad,'--out',dest],1);assert.equal(fs.existsSync(dest),false);
  fs.writeFileSync(bad,JSON.stringify({version:1,operations:[add]}));const manualPath=path.join(temp,'manual.json');fs.writeFileSync(manualPath,JSON.stringify(manual));
  run(['edit',manualPath,'--ops',bad,'--out',dest,'--warnings-as-errors'],1);assert.equal(fs.existsSync(dest),false);
  assert.deepEqual(fs.readFileSync(sourcePath),bytes);
  console.log(`PASS ${calls} floor lifecycle CLI calls: recipes, dry-run/save, text/null reports, web reload/export parity, exact restoration and rejected writes`);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
