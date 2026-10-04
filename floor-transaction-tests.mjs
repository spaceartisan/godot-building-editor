import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { applyTransaction } from './src/transactions.js';
import { prepareDocument, resolvedFloorDimensions } from './src/diagnostics.js';
import { floorView, makeFloor } from './src/model.js';
import { buildStairMeshData, exportGodotFiles } from './src/exporter.js';
import { createEditorHarness } from './qa/editor-harness.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const sourceFile=path.join(root,'examples/twostory.building.json'),recipeFile=path.join(root,'examples/transactions/twostory-levels.edit.json');
const sourceBytes=fs.readFileSync(sourceFile),recipeBytes=fs.readFileSync(recipeFile);
const source=prepareDocument(JSON.parse(sourceBytes)).building,recipe=JSON.parse(recipeBytes);
const [lower,upper]=source.floors.map(f=>f.id);
const op=(id,value)=>({op:'floor.update',id,value});
const edit=(operations,input=source,options={})=>applyTransaction(input,{version:1,operations},options);
const reject=(operations,pattern,input=source)=>{
  const before=structuredClone(input),result=edit(operations,input);
  assert.equal(result.ok,false);assert.equal(result.building,null);assert.match(JSON.stringify(result.errors),pattern);assert.deepEqual(input,before);return result;
};
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'building-floor-edit-'));let calls=0;
function run(args,expected=0){
  const r=spawnSync(process.execPath,[path.join(root,'cli.mjs'),...args,'--json'],{cwd:temp,encoding:'utf8',timeout:30000,maxBuffer:16000000});calls++;
  assert.equal(r.status,expected,r.stdout+r.stderr);assert.equal(r.stderr,'');return JSON.parse(r.stdout);
}
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-10,`${actual} != ${expected}`);
try{
  const result=applyTransaction(source,recipe);assert.equal(result.ok,true,JSON.stringify(result));assert.deepEqual(result.warnings,[]);
  const changed=result.building;
  assert.deepEqual(changed.floors.map(f=>f.id),[lower,upper]);
  for(const [i,f] of source.floors.entries())for(const key of ['walls','openings','stairs','lights','slabs','regions','platforms','railings'])assert.deepEqual(changed.floors[i][key],f[key]);
  assert.equal(changed.floors[0].label,'Ground floor');assert.equal(changed.floors[1].label,'Upper floor');
  assert.equal(Object.hasOwn(changed.floors[1],'elevation'),false);
  near(resolvedFloorDimensions(changed,1).elevation,4.14);
  near(resolvedFloorDimensions(changed,1).wallTop,7.74);
  assert.equal(result.structuralChanges.floors.length,2);assert.equal(result.structuralChanges.stairs.length,1);
  const flight=result.structuralChanges.stairs[0];assert.equal(flight.id,source.floors[0].stairs[0].id);assert.equal(flight.upperFloorId,upper);
  near(flight.before.rise,4.18);near(flight.after.rise,4.64);
  for(const style of ['ramp','steps']){
    const data=buildStairMeshData(floorView(changed,0),{...changed.floors[0].stairs[0],style});near(data.rise,4.64);
    assert.ok(data.mesh.vertices.length>0);assert.ok(data.slope>data.run);
  }
  assert.deepEqual(prepareDocument(changed).building,changed);
  assert.deepEqual(applyTransaction(source,recipe),result);
  const reset=edit([op(lower,{elevation:null,wallHeight:null,floorThickness:null}),op(upper,{elevation:null,wallHeight:null,floorThickness:null})],changed);
  assert.equal(reset.ok,true);for(let i=0;i<2;i++)assert.deepEqual(resolvedFloorDimensions(reset.building,i),resolvedFloorDimensions(source,i));
  for(const f of reset.building.floors)for(const key of ['elevation','wallHeight','floorThickness'])assert.equal(Object.hasOwn(f,key),false);
  const noChange=edit([op(lower,{wallHeight:4})]);assert.equal(noChange.structuralChanges.floors.length,0);
  const metadata=structuredClone(source);metadata.floors[0].notes={custom:'keep'};assert.deepEqual(edit(recipe.operations,metadata).building.floors[0].notes,metadata.floors[0].notes);
  console.log('PASS floor overrides/reset: resolved levels, unchanged IDs/entities, deterministic reload, metadata, ramp and stepped-stair rise');

  for(const [value,pattern] of [[{label:''},/nonempty/],[{label:' '},/nonempty/],[{label:null},/text/],[{},/at least/],[{wallHeight:'4'},/finite/],[{wallHeight:.19},/finite/],[{wallHeight:1001},/finite/],[{floorThickness:0},/finite/],[{floorThickness:101},/finite/],[{elevation:Infinity},/finite/],[{elevation:1000001},/finite/],[{autoFloor:'no'},/boolean/],[{autoCeiling:null},/boolean/],[{boundaryMode:'open'},/one of/],[{id:'new'},/Unknown field/],[{stairs:[]},/Unknown field/]])reject([op(lower,value)],pattern);
  reject([op('missing',{label:'No'})],/Unknown floor/);
  // floor.remove (any floor) is supported since 1.4.0; see parity-transaction-tests.mjs.
  for(const action of ['add','move-endpoint'])reject([{op:`floor.${action}`,id:lower}],/Unknown operation/);
  reject([{...op(lower,{label:'No'}),floorId:lower}],/Unknown field/);
  reject([op(upper,{elevation:0})],/above the preceding/);
  reject([op(lower,{wallHeight:1})],/exceeds|out.of.bounds|fit/i);
  const customWall=structuredClone(source);customWall.floors[0].walls[0].height=3.9;
  reject([op(lower,{wallHeight:3.8})],/Wall height exceeds/,customWall);
  const repaired=edit([op(lower,{wallHeight:3.8}),{op:'wall.update',id:customWall.floors[0].walls[0].id,floorId:lower,value:{height:null}}],customWall);
  assert.equal(repaired.ok,true,JSON.stringify(repaired.errors));
  const fixedOpening=edit([op(lower,{wallHeight:2}),...source.floors[0].openings.filter(o=>o.type==='door').map(o=>({op:'opening.update',id:o.id,floorId:lower,value:{height:1.9}}))]);
  assert.equal(fixedOpening.ok,true,JSON.stringify(fixedOpening.errors));
  const gap=edit([op(upper,{elevation:5})]);assert.equal(gap.ok,true);assert.ok(gap.warnings.some(w=>/vertical wall gap/.test(w.message)));
  assert.equal(edit([op(upper,{elevation:5})],source,{warningsAsErrors:true}).ok,false);
  const overlap=edit([op(upper,{elevation:3.8})]);assert.ok(overlap.warnings.some(w=>/overlaps the preceding/.test(w.message)));
  const steep=edit([op(lower,{wallHeight:7})]);assert.ok(steep.warnings.some(w=>/incline exceeds/.test(w.message)));
  assert.equal(edit([op(upper,{elevation:0}),op(upper,{elevation:null})],source,{warningsAsErrors:true}).ok,true,'Final-state validation allows a later repair');
  const anchored=structuredClone(source);anchored.floors[1].elevation=4.18;anchored.floors.push({...makeFloor('Third'),id:'third'});
  const anchorEdit=edit([op(lower,{elevation:-1})],anchored);assert.equal(anchorEdit.ok,true);
  assert.equal(anchorEdit.structuralChanges.floors.length,1,'Absolute level stops automatic propagation above it');
  delete anchored.floors[1].elevation;
  const automatic=edit([op(lower,{elevation:-1})],anchored);assert.equal(automatic.structuralChanges.floors.length,3,'Automatic elevations propagate through later floors');
  const independent=structuredClone(source);independent.manualFloors=[{id:'manual',kind:'floor',label:'Independent',minX:30,maxX:32,minZ:0,maxZ:2,topY:0,thickness:.18}];
  const kept=edit(recipe.operations,independent);assert.equal(kept.ok,true);assert.deepEqual(kept.building.manualFloors,independent.manualFloors);
  assert.ok(kept.warnings.some(w=>/absolute heights/.test(w.message)));assert.equal(kept.structuralChanges.independentSurfaces[0].id,'manual');
  assert.equal(edit(recipe.operations,independent,{warningsAsErrors:true}).ok,false);
  assert.equal(edit([op(lower,{label:'Rename only'})],independent).structuralChanges.independentSurfaces.length,0);
  assert.equal(edit([op(lower,{wallHeight:5}),op(lower,{wallHeight:null})],independent).structuralChanges.independentSurfaces.length,0);
  // Feedback: a recipe that changes the story height and adds (or moves) a manual
  // ceiling in the same transaction authored it against the new stack; no warning.
  const fresh=edit([op(lower,{wallHeight:4.4}),{op:'manualCeiling.add',id:'mc',value:{minX:0,maxX:4,minZ:0,maxZ:4,topY:3.42,thickness:.12}}],source,{warningsAsErrors:true});
  assert.equal(fresh.ok,true,JSON.stringify(fresh.errors));assert.equal(fresh.structuralChanges.independentSurfaces.length,0);
  const moved=edit([op(lower,{wallHeight:4.4}),{op:'manualFloor.update',id:'manual',value:{topY:.2}}],independent);
  assert.equal(moved.structuralChanges.independentSurfaces.length,0,'a surface moved in the same transaction is not flagged');
  const roofs=prepareDocument(JSON.parse(fs.readFileSync(path.join(root,'examples/roof_attachment.building.json')))).building;
  const roofsKept=edit([op(roofs.floors[0].id,{wallHeight:3.6})],roofs);assert.equal(roofsKept.ok,true);
  assert.deepEqual(roofsKept.building.roofSections,roofs.roofSections);assert.ok(roofsKept.warnings.some(w=>/absolute heights/.test(w.message)));
  console.log('PASS invalid floors/fields, atomic repairs, no implicit opening/wall resize, spacing/slope warnings and absolute-surface review');

  const editor=await createEditorHarness();editor.loadBuildingData(source);
  const change=async(selector,value)=>{editor.$(selector).value=value;await editor.$(selector).dispatch('change');};
  for(const [i,operation] of recipe.operations.entries()){
    await change('#floor-select',i);
    for(const [key,value] of Object.entries(operation.value))await change({'label':'#floor-label','elevation':'#floor-elevation','wallHeight':'#floor-wall-height','floorThickness':'#floor-slab-thickness'}[key],value??'');
  }
  assert.deepEqual(editor.snapshot(),changed,'CLI and actual web floor handlers produce the same blueprint');
  await editor.$('#undo-btn').click();assert.notDeepEqual(editor.snapshot(),changed);await editor.$('#redo-btn').click();assert.deepEqual(editor.snapshot(),changed);
  await change('#floor-elevation',-100);assert.deepEqual(editor.snapshot(),changed,'Web structural guard rejects inverted levels');
  assert.deepEqual(editor.errors,[]);
  const args=['edit',sourceFile,'--ops',recipeFile];
  const dry=run([...args,'--dry-run','--warnings-as-errors']);assert.deepEqual(fs.readdirSync(temp),[]);
  const output=path.join(temp,'levels.building.json'),saved=run([...args,'--out',output,'--warnings-as-errors']);
  assert.equal(dry.resultSha256,saved.resultSha256);assert.deepEqual(dry.structuralChanges,saved.structuralChanges);assert.deepEqual(JSON.parse(fs.readFileSync(output)),changed);
  const inventory=run(['inspect',output,'--entities']).results[0];
  assert.equal(inventory.entities.floors[1].overrides.elevation,null);assert.equal(inventory.entities.floors[0].overrides.elevation,-.5);
  near(inventory.inspection.floors[1].elevation,4.14);near(inventory.inspection.floors[1].floorThickness,.24);
  const dest=path.join(temp,'scenes');run(['export',output,'--out',dest,'--warnings-as-errors']);
  editor.loadBuildingData(JSON.parse(fs.readFileSync(output)));assert.deepEqual(editor.snapshot(),changed);
  const files=exportGodotFiles(editor.snapshot());assert.equal(fs.readFileSync(path.join(dest,files.tscnName),'utf8'),files.tscn);
  for(const door of files.doors)assert.equal(fs.readFileSync(path.join(dest,door.filename),'utf8'),door.tscn);
  for(const shell of ['OutsideFaces','InsideFaces','SideAFaces','SideBFaces'])assert.match(files.tscn,new RegExp(`name="${shell}"`));assert.doesNotMatch(files.tscn,/type="StandardMaterial3D"/);
  run([...args,'--out',output],3);
  const badOps=path.join(temp,'bad.edit.json');fs.writeFileSync(badOps,JSON.stringify({version:1,operations:[op(lower,{label:'Not committed'}),op(upper,{elevation:0})]}));
  const refused=path.join(temp,'no-folder','bad.json');run(['edit',sourceFile,'--ops',badOps,'--out',refused],1);assert.equal(fs.existsSync(path.dirname(refused)),false);
  fs.writeFileSync(badOps,JSON.stringify({version:1,operations:[op(upper,{elevation:5})]}));
  run(['edit',sourceFile,'--ops',badOps,'--out',refused,'--warnings-as-errors'],1);assert.equal(fs.existsSync(refused),false);
  assert.deepEqual(fs.readFileSync(sourceFile),sourceBytes);assert.deepEqual(fs.readFileSync(recipeFile),recipeBytes);
  console.log(`PASS ${calls} floor CLI calls: dry-run/save effects, override inventory, rejection/no overwrite, web handlers/undo/reload and exact building/door export parity`);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
