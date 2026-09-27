import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {applyTransaction} from './src/transactions.js';
import {prepareDocument,inspectFloorCoverage,inspectPlatform} from './src/diagnostics.js';
import {makeManualSurface,makeFloor,makeStair} from './src/model.js';
import {exportGodotFiles} from './src/exporter.js';
import {validateBuilding} from './src/validation.js';
import {reviewScene} from './src/preview-review.js';
import {platformFixture} from './qa/platform-fixture.mjs';
import {createEditorHarness} from './qa/editor-harness.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),source=platformFixture();
const op=value=>({op:'platform.update',floorId:'ground',id:'porch',value});
const edit=(ops,input=source,options={})=>applyTransaction(input,{version:1,operations:ops},options);
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const reject=(ops,pattern,input=source)=>{const original=structuredClone(input),result=edit(ops,input);assert.equal(result.ok,false);assert.equal(result.building,null);assert.match(JSON.stringify(result.errors),pattern);assert.deepEqual(input,original);};
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'platform-transactions-'));let calls=0;
const run=(args,expected=0)=>{const r=spawnSync(process.execPath,[path.join(root,'cli.mjs'),...args,'--json'],{cwd:temp,encoding:'utf8',timeout:30000,maxBuffer:16000000});calls++;assert.equal(r.status,expected,r.stdout+r.stderr);return JSON.parse(r.stdout);};
try{
  const values={label:'Lower deck',kind:'deck',height:-.3,minX:-1,maxX:3,minZ:2,maxZ:5};
  const result=edit([op(values)]);assert.equal(result.ok,true,JSON.stringify(result));assert.deepEqual(result.warnings,[]);
  const expected=structuredClone(source);Object.assign(expected.floors[0].platforms[0],values,{covered:false});assert.deepEqual(result.building,expected);
  assert.deepEqual(prepareDocument(result.building).building,result.building);assert.deepEqual(result,edit([op(values)]));
  near(result.platformChanges[0].after.topY,-.3);near(result.platformChanges[0].after.bottomY,-.48);
  near(result.floorCoverageChanges[0].before.area,60);near(result.floorCoverageChanges[0].after.area,56);near(result.floorCoverageChanges[0].after.platformCutoutArea,8);
  for(const kind of ['porch','deck'])for(const covered of [true,false]){
    const r=edit([op({kind,covered})]);assert.equal(r.ok,true);assert.equal(r.building.floors[0].platforms[0].covered,covered);
  }
  assert.equal(edit([op({kind:'deck'})]).building.floors[0].platforms[0].covered,false);
  assert.equal(edit([op({kind:'deck'}),op({kind:'porch'})]).building.floors[0].platforms[0].covered,true);
  assert.deepEqual(edit([op({height:-.3}),op({height:0})]).platformChanges,[]);
  assert.deepEqual(edit([op({label:'Rename'})]).floorCoverageChanges,[]);
  const moved=edit([op({minX:0,maxX:4})]);near(moved.floorCoverageChanges[0].after.area,60);assert.notDeepEqual(moved.floorCoverageChanges[0].before.rectangles,moved.floorCoverageChanges[0].after.rectangles);
  for(const value of [{kind:'balcony'},{covered:1},{covered:null},{height:'1'},{height:null},{height:10001},{minX:Infinity},{maxX:1000001},{minX:2},{maxZ:3.01},{label:''},{label:' '},{id:'other'},{thickness:.4},{}])reject([op(value)],/Expected|finite|Unknown|least|nonempty/);
  reject([{...op({height:1}),id:'missing'}],/Unknown platform/);reject([{...op({height:1}),floorId:'missing'}],/Unknown floor/);
  reject([{...op({height:1}),op:'platform.add'}],/Missing required field/);
  reject([{...op({height:1}),op:'platform.remove'}],/Unknown field/);
  const extra=structuredClone(source);extra.floors[0].platforms[0].notes={keep:true};assert.deepEqual(edit([op({label:'Rename'})],extra).building.floors[0].platforms[0].notes,{keep:true});
  const invalid=structuredClone(source);invalid.floors[0].platforms[0].kind='balcony';assert.ok(validateBuilding(invalid).errors.length);
  invalid.floors[0].platforms[0].kind='deck';invalid.floors[0].platforms[0].covered=1;assert.ok(validateBuilding(invalid).errors.length);

  const overlap=structuredClone(source);overlap.floors[0].platforms.push({...overlap.floors[0].platforms[0],id:'other',minX:0,maxX:3});
  near(inspectFloorCoverage(overlap,0).platformCutoutArea,5); // union, not 4 + 3
  const manual=structuredClone(source);manual.manualFloors.push({...makeManualSurface({x:-2,z:3},{x:0,z:4},'floor',0,.18),id:'manual'});
  near(inspectFloorCoverage(manual,0).platformCutoutArea,2);near(inspectFloorCoverage(manual,0).area,60);
  assert.deepEqual(edit([op({height:.4})],manual).building.manualFloors,manual.manualFloors);
  manual.floors[0].autoFloor=false;near(inspectFloorCoverage(manual,0).area,0);near(inspectFloorCoverage(manual,0).platformCutoutArea,0);
  const levels=structuredClone(source),upper={...makeFloor('Upper'),id:'upper',elevation:2.98};levels.floors.push(upper);
  upper.slabs=[{id:'upper-slab',minX:-4,maxX:4,minZ:-4,maxZ:4}];upper.platforms=[{...source.floors[0].platforms[0],id:'upper-platform',height:.5}];
  levels.floors[0].stairs=[{...makeStair({x:0,z:2},{x:0,z:-2},1.2),id:'stair'}];
  const beforeWithout=inspectFloorCoverage({...levels,floors:[levels.floors[0],{...upper,platforms:[]}]},1);
  const afterWith=inspectFloorCoverage(levels,1);assert.ok(afterWith.area<=beforeWithout.area);
  const mixed=edit([{op:'floor.update',id:'ground',value:{elevation:1,floorThickness:.3}}],levels);assert.equal(mixed.ok,true);near(mixed.platformChanges.find(p=>p.id==='porch').after.topY,1);near(mixed.platformChanges.find(p=>p.id==='porch').after.bottomY,.7);
  near(inspectPlatform(levels,1,upper.platforms[0]).topY,3.48);
  const rails=structuredClone(source);rails.floors[0].railings=[{id:'rail',label:'Railing',a:{x:-2,z:6},b:{x:2,z:6},height:1,style:'two_rail'}];rails.roofSections=[{id:'roof',label:'Independent',minX:10,maxX:12,minZ:0,maxZ:2,type:'flat',baseY:3,pitch:35,overhang:.2,direction:'x',gableEnds:'none'}];
  const retained=edit([op(values)],rails);assert.equal(retained.ok,true);assert.deepEqual(retained.building.roofSections,rails.roofSections);assert.deepEqual(retained.building.floors[0].railings,rails.floors[0].railings);
  for(const b of [source,result.building,overlap,manual]){
    const boxes=reviewScene(b,{view:'floor',floor:1}).objects.filter(o=>o.category==='story'&&o.size&&Math.abs(o.size.y-.18)<1e-9);
    const floor=inspectFloorCoverage(b,0),platforms=b.floors[0].platforms;
    near(boxes.reduce((sum,o)=>sum+o.size.x*o.size.z,0),floor.area+platforms.reduce((sum,p)=>sum+(p.maxX-p.minX)*(p.maxZ-p.minZ),0));
    for(const p of platforms)assert.ok(boxes.some(o=>Math.abs(o.pos.x-(p.minX+p.maxX)/2)<1e-9&&Math.abs(o.pos.z-(p.minZ+p.maxZ)/2)<1e-9&&Math.abs(o.pos.y-(p.height-.09))<1e-9&&o.size.x===p.maxX-p.minX&&o.size.z===p.maxZ-p.minZ));
  }
  console.log('PASS platform identity/type/coverage semantics, invalid edits, union cuts, manual overrides, upper levels and independent pieces');

  const editor=await createEditorHarness();editor.loadBuildingData(structuredClone(source));editor.chooseSelection({type:'platform',id:'porch'});
  const labels={label:'Name',kind:'Type',covered:'Covered by roof',height:'Height offset',minX:'Min X',maxX:'Max X',minZ:'Min Z',maxZ:'Max Z'};
  const change=async(key,value)=>{const row=editor.$('#selection-form').children.find(e=>e.textContent.startsWith(labels[key]));assert.ok(row,labels[key]);const input=row.querySelector('input, select');if(key==='covered')input.checked=value;else input.value=value;await input.dispatch('change');};
  for(const [key,value] of Object.entries(values))await change(key,value);
  assert.deepEqual(editor.snapshot(),result.building);
  for(const [key,value] of [['minX',3],['maxZ',2.01],['height',10001],['minZ','']]){await change(key,value);assert.deepEqual(editor.snapshot(),result.building);assert.equal(editor.selection().id,'porch');}
  await editor.$('#undo-btn').click();assert.equal(editor.snapshot().floors[0].platforms[0].maxZ,6);await editor.$('#redo-btn').click();assert.deepEqual(editor.snapshot(),result.building);
  editor.chooseSelection({type:'platform',id:'porch'});await change('covered',true);assert.equal(editor.snapshot().floors[0].platforms[0].covered,true);await editor.$('#undo-btn').click();assert.deepEqual(editor.snapshot(),result.building);assert.deepEqual(editor.errors,[]);

  const sourceFile=path.join(root,'examples/roof_junctions.building.json'),recipeFile=path.join(root,'examples/transactions/east-deck.edit.json'),bytes=fs.readFileSync(sourceFile);
  const args=['edit',sourceFile,'--ops',recipeFile],dry=run([...args,'--dry-run','--warnings-as-errors']);assert.deepEqual(fs.readdirSync(temp),[]);
  const out=path.join(temp,'edited.json'),saved=run([...args,'--out',out,'--warnings-as-errors']);assert.equal(saved.resultSha256,dry.resultSha256);assert.deepEqual(saved.platformChanges,dry.platformChanges);
  const inventory=run(['inspect',out,'--entities']).results[0],doc=JSON.parse(fs.readFileSync(out));assert.deepEqual(inventory.entities.floors[0].platforms,doc.floors[0].platforms);assert.deepEqual(inventory.inspection.floors[0].platforms.find(p=>p.id==='platforms_8'),saved.platformChanges[0].after);
  editor.loadBuildingData(structuredClone(doc));assert.deepEqual(editor.snapshot(),doc);
  const assets=path.join(temp,'assets');run(['export',out,'--out',assets,'--warnings-as-errors']);const exported=exportGodotFiles(editor.snapshot());assert.equal(fs.readFileSync(path.join(assets,exported.tscnName),'utf8'),exported.tscn);assert.doesNotMatch(exported.tscn,/type="StandardMaterial3D"/);
  run([...args,'--out',out],3);
  const bad=path.join(temp,'bad.json'),refused=path.join(temp,'absent/out.json');fs.writeFileSync(bad,JSON.stringify({version:1,operations:[{op:'platform.update',floorId:'floor_1',id:'platforms_8',value:{label:'Rollback'}},{op:'platform.update',floorId:'floor_1',id:'platforms_8',value:{maxX:5}}]}));run(['edit',sourceFile,'--ops',bad,'--out',refused],1);assert.equal(fs.existsSync(path.dirname(refused)),false);
  const human=spawnSync(process.execPath,[path.join(root,'cli.mjs'),...args,'--dry-run'],{encoding:'utf8',timeout:30000});calls++;assert.equal(human.status,0);assert.match(human.stdout,/Platform platforms_8: deck/);
  assert.deepEqual(fs.readFileSync(sourceFile),bytes);
  console.log(`PASS ${calls} platform CLI calls, actual web edits/rejection/undo/reload and exact exported scene parity`);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
