import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {applyTransaction} from './src/transactions.js';
import {prepareDocument,inspectStair} from './src/diagnostics.js';
import {exportGodotFiles,buildStairMeshData} from './src/exporter.js';
import {floorView,stairFootprint} from './src/model.js';
import {createEditorHarness} from './qa/editor-harness.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),sourceFile=path.join(root,'examples/stair_ramp_north.building.json'),recipeFile=path.join(root,'examples/transactions/stair-refresh.edit.json');
const bytes=fs.readFileSync(sourceFile),source=prepareDocument(JSON.parse(bytes)).building,recipe=JSON.parse(fs.readFileSync(recipeFile));
const op=value=>({op:'stair.update',floorId:'floor_1',id:'stairs_8',value});
const edit=(operations,input=source,options={})=>applyTransaction(input,{version:1,operations},options);
const reject=(ops,pattern,input=source)=>{const original=structuredClone(input),r=edit(ops,input);assert.equal(r.ok,false);assert.equal(r.building,null);assert.match(JSON.stringify(r.errors),pattern);assert.deepEqual(input,original);};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'stair-transactions-'));let calls=0;
const run=(args,expected=0)=>{const r=spawnSync(process.execPath,[path.join(root,'cli.mjs'),...args,'--json'],{cwd:temp,encoding:'utf8',timeout:30000,maxBuffer:16000000});calls++;assert.equal(r.status,expected,r.stdout+r.stderr);return JSON.parse(r.stdout);};
try{
  const result=applyTransaction(source,recipe);assert.equal(result.ok,true,JSON.stringify(result));assert.deepEqual(result.warnings,[]);
  assert.equal(result.stairChanges.length,1);assert.equal(result.stairChanges[0].after.upperFloorId,'floor_9');
  assert.deepEqual(result.structuralChanges.floors,[]);assert.deepEqual(prepareDocument(result.building).building,result.building);
  const expected=structuredClone(source);Object.assign(expected.floors[0].stairs[0],recipe.operations[0].value);assert.deepEqual(result.building,expected);
  assert.deepEqual(result,applyTransaction(source,recipe));assert.deepEqual(edit([op({run:5.2}),op({run:4})]).stairChanges,[]);
  const metadata=structuredClone(source);metadata.floors[0].stairs[0].notes={keep:true};assert.deepEqual(edit(recipe.operations,metadata).building.floors[0].stairs[0].notes,{keep:true});
  for(const direction of ['north','south','east','west'])for(const style of ['steps','ramp'])for(const blockBelow of [true,false]){
    const r=edit([op({...recipe.operations[0].value,direction,style,blockBelow})]);assert.equal(r.ok,true);assert.deepEqual(r.warnings,[]);
    const stair=r.building.floors[0].stairs[0],data=buildStairMeshData(floorView(r.building,0),stair),review=inspectStair(r.building,0,stair);
    near(data.rise,2.98);near(review.slopeDegrees,Math.atan2(2.98,5.2)*180/Math.PI);assert.deepEqual(review.footprint,stairFootprint(stair));
    assert.equal(!!data.blockerMesh,blockBelow);assert.equal(review.stepRise,style==='steps'?2.98/16:null);
    const scene=exportGodotFiles(r.building).tscn;
    assert.equal(scene.includes('name="UnderStairBlocker"'),blockBelow);assert.equal(scene.includes('name="UnderStairBlockerMesh"'),blockBelow);assert.match(scene,/name="WalkableRamp"/);
    assert.match(scene,new RegExp(`name="${style==='steps'?'Steps':'RampMesh'}"`));assert.doesNotMatch(scene,/type="StandardMaterial3D"/);
  }
  for(const value of [{width:.49},{run:.99},{width:10001},{run:10001},{x:Infinity},{z:1000001},{steps:2.5},{steps:513},{steps:1},{steps:'16'},{style:'spiral'},{direction:'up'},{blockBelow:1},{blockBelow:null},{label:''},{label:' '},{x:null},{width:'2'},{height:3},{floorId:'floor_9'},{}])reject([op(value)],/Expected|finite|integer|Unknown|at least/);
  reject([{...op({label:'x'}),id:'missing'}],/Unknown stair/);reject([{...op({label:'x'}),floorId:'missing'}],/Unknown floor/);
  reject([{...op({label:'x'}),floorId:'floor_9'}],/Unknown stair/);
  reject([{...op({label:'x'}),op:'stair.add'}],/Missing required field/);
  reject([{...op({label:'x'}),op:'stair.remove'}],/Unknown field/);
  const orphan=structuredClone(source);orphan.floors.pop();reject([op({label:'x'})],/adjacent upper floor/,orphan);assert.equal(inspectStair(orphan,0,orphan.floors[0].stairs[0]).rise,null);
  for(const [value,pattern] of [[{run:1},/incline exceeds/],[{x:20},/floor support/],[{x:-2},/wall intersects/]]){
    const r=edit([op(value)]);assert.equal(r.ok,true);assert.ok(r.warnings.some(w=>pattern.test(w.message)));assert.equal(edit([op(value)],source,{warningsAsErrors:true}).ok,false);
  }
  assert.equal(edit([op({run:1}),op({run:5.2})],source,{warningsAsErrors:true}).ok,true);
  const mixed=edit([{op:'floor.update',id:'floor_1',value:{wallHeight:3.2}},op({run:5.2})]);near(mixed.stairChanges[0].after.rise,3.38);
  console.log('PASS 16 stair combinations, stable IDs/metadata, unchanged surroundings, mixed floor edits, invalid updates and final slope/landing/wall warnings');

  const editor=await createEditorHarness();editor.loadBuildingData(source);editor.chooseSelection({type:'stair',id:'stairs_8'});
  const labels={label:'Name',x:'Center X',z:'Center Z',width:'Width',run:'Run',direction:'Ascent direction',style:'Style',steps:'Step count',blockBelow:'Block space below'};
  for(const [key,value] of Object.entries(recipe.operations[0].value)){
    const row=editor.$('#selection-form').children.find(e=>e.textContent.startsWith(labels[key]));assert.ok(row,labels[key]);
    const input=row.querySelector('input, select');if(key==='blockBelow')input.checked=value;else input.value=value;await input.dispatch('change');
  }
  assert.deepEqual(editor.snapshot(),result.building);await editor.$('#undo-btn').click();assert.notDeepEqual(editor.snapshot(),result.building);await editor.$('#redo-btn').click();assert.deepEqual(editor.snapshot(),result.building);assert.deepEqual(editor.errors,[]);
  const args=['edit',sourceFile,'--ops',recipeFile],dry=run([...args,'--dry-run','--warnings-as-errors']);assert.deepEqual(fs.readdirSync(temp),[]);
  const output=path.join(temp,'edited.json'),saved=run([...args,'--out',output,'--warnings-as-errors']);assert.equal(saved.resultSha256,dry.resultSha256);assert.deepEqual(saved.stairChanges,dry.stairChanges);
  const inventory=run(['inspect',output,'--entities']).results[0];assert.deepEqual(inventory.entities.floors[0].stairs,result.building.floors[0].stairs);assert.deepEqual(inventory.inspection.floors[0].stairs[0],result.stairChanges[0].after);
  editor.loadBuildingData(JSON.parse(fs.readFileSync(output)));assert.deepEqual(editor.snapshot(),result.building);
  const assets=path.join(temp,'assets');run(['export',output,'--out',assets,'--warnings-as-errors']);const files=exportGodotFiles(editor.snapshot());assert.equal(fs.readFileSync(path.join(assets,files.tscnName),'utf8'),files.tscn);
  run([...args,'--out',output],3);
  const bad=path.join(temp,'bad.edit.json'),refused=path.join(temp,'absent','bad.json');fs.writeFileSync(bad,JSON.stringify({version:1,operations:[op({run:1})]}));run(['edit',sourceFile,'--ops',bad,'--out',refused,'--warnings-as-errors'],1);assert.equal(fs.existsSync(path.dirname(refused)),false);
  fs.writeFileSync(bad,JSON.stringify({version:1,operations:[op({label:'rollback'}),op({steps:3.5})]}));run(['edit',sourceFile,'--ops',bad,'--out',refused],1);assert.equal(fs.existsSync(refused),false);
  assert.deepEqual(fs.readFileSync(sourceFile),bytes);
  console.log(`PASS ${calls} stair CLI calls: dry-run/save/review, no partial output, entity inspection, actual web handlers/undo/reload and exact export parity`);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
