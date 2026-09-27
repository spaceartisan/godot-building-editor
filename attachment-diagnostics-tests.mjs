import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeEmptyBuilding } from './src/model.js';
import { roofAttachmentDiagnostics } from './src/roof-diagnostics.js';
import { prepareDocument, inspectBuilding } from './src/diagnostics.js';
import { validateBuilding } from './src/validation.js';
import { createEditorHarness } from './qa/editor-harness.mjs';
import { EXAMPLE_CATALOG } from './src/examples.js';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const roof=(id,fields={})=>({id,label:id,type:'flat',direction:'x',minX:0,maxX:2,minZ:0,maxZ:2,baseY:10,pitch:35,overhang:0,gableEnds:'none',...fields});
function scene(child={},host={}){const b=makeEmptyBuilding();b.roof.type='none';b.roofSections=[roof('host',host),roof('child',{minX:1,maxX:3,hostRoofId:'host',...child})];return b;}
const result=b=>roofAttachmentDiagnostics(b)[0];
let b=scene(),r=result(b);
assert.equal(r.status,'effective');close(r.baselineVolume,.48);close(r.remainingVolume,.24);close(r.removedVolume,.24);
assert.equal(result(scene({minX:2,maxX:4})).status,'no-additional-cut','touching faces do not remove volume');
assert.equal(result(scene({minX:2-1e-10,maxX:4})).status,'no-additional-cut','sub-tolerance overlap is not an effective cut');
r=result(scene({minX:2-1e-4,maxX:4}));assert.equal(r.status,'effective');close(r.removedVolume,2.4e-5);
assert.equal(result(scene({baseY:11})).status,'no-additional-cut');
r=result(scene({minX:.5,maxX:1.5,minZ:.5,maxZ:1.5}));assert.equal(r.status,'fully-removed');close(r.remainingVolume,0);close(r.removedVolume,.12);
assert.equal(result(scene({minX:0,maxX:.02})).status,'no-roof-parts');
assert.equal(result(scene({}, {minX:0,maxX:.02})).status,'no-host-envelope');
b=scene({baseY:1},{baseY:1});b.floors[0].slabs=[{id:'slab',minX:-10,maxX:10,minZ:-10,maxZ:10}];
r=result(b);assert.equal(r.status,'already-removed');close(r.baselineVolume,0);
b=scene({overhang:1,edgeModes:{minX:'flush'}},{minX:-1,maxX:1,minZ:-1,maxZ:3});
assert.equal(result(b).status,'no-additional-cut','child flush cut must not be credited to host');
delete b.roofSections[1].edgeModes;assert.equal(result(b).status,'effective');
b=scene();for(const r of b.roofSections)for(const k of ['minX','maxX','minZ','maxZ'])r[k]+=100000;
r=result(b);assert.equal(r.status,'effective');close(r.removedVolume,.24);
console.log('PASS analytic host contributions: partial/full/no cuts, tangency, tolerance, missing parts/envelope, prior story/flush removal and translated coordinates');

for(const hostType of ['gable','shed','flat'])for(const hostAxis of ['x','z'])for(const childType of ['gable','shed','flat'])for(const childAxis of ['x','z']){
  b=scene({type:childType,direction:childAxis,minX:-4,maxX:4,minZ:-4,maxZ:4,overhang:.4},{type:hostType,direction:hostAxis,minX:-3,maxX:3,minZ:-3,maxZ:3,overhang:.3,edgeModes:{maxX:'flush'}});
  const before=JSON.stringify(b);r=result(b);
  assert.notEqual(r.status,'unverified',`${hostType}/${hostAxis} to ${childType}/${childAxis}`);
  assert.equal(r.parts.length,childType==='gable'?3:1,'ridge cap is included');
  assert.equal(JSON.stringify(b),before);
  for(const p of r.parts)assert.ok(p.remainingVolume<=p.baselineVolume+p.tolerance);
}
b=scene({hostRoofId:'missing'});assert.equal(result(b).status,'unverified');
b=scene();delete b.roofSections[1].pitch;assert.equal(result(b).status,'unverified');
assert.notEqual(result(prepareDocument(b).building).status,'unverified','prepared geometry resolves legacy defaults');
b=scene({type:'gable',gableEnds:'both'});assert.equal(result(b).gableReview,true);
assert.ok(validateBuilding(b,{roofDiagnostics:true}).warnings.some(w=>w.message.includes('review gable end fills separately')),'gable review is independent of slab effectiveness');
for(const entry of EXAMPLE_CATALOG){const b=prepareDocument(JSON.parse(fs.readFileSync(entry.file))).building,before=JSON.stringify(b);roofAttachmentDiagnostics(b);assert.equal(JSON.stringify(b),before);}
console.log('PASS 36 host/child type-axis combinations, ridge inclusion, invalid/default states and catalog immutability');

const source=JSON.parse(fs.readFileSync('examples/roof_attachment.building.json'));
const unused=structuredClone(source);unused.roofSections.find(r=>r.hostRoofId).baseY=30;
const prepared=prepareDocument(unused),measurement=result(prepared.building);
assert.equal(measurement.status,'no-additional-cut');
assert.equal(prepared.errors.length,0,'ineffective attachment is editable');
assert.ok(prepared.warnings.some(w=>w.code==='roof-attachment-no-additional-cut'));
assert.deepEqual(inspectBuilding(prepared.building).roofs.attachments,[measurement]);
assert.deepEqual(validateBuilding(prepared.building,{roofDiagnostics:true}).roofAttachments,[measurement]);
const e=await createEditorHarness();e.loadBuildingData(unused);
assert.ok(e.$('#validation-results').textContent.includes(measurement.message));
for(const [id,value] of [['#preview-mode','roofs'],['#preview-overlay','attachments']]){const el=e.$(id);el.value=value;await el.dispatch('change');}
assert.match(e.$('#preview-status').textContent,/1 attachment needs review/);
assert.ok(e.$('#preview-notes').textContent.includes(measurement.message));
assert.deepEqual(e.preview.scene.overlay.summary.relationships[0].attachment,measurement);
await e.$('#undo-btn').click();assert.doesNotMatch(e.$('#validation-results').textContent,/no additional slab/);
await e.$('#redo-btn').click();assert.ok(e.$('#validation-results').textContent.includes(measurement.message));
assert.deepEqual(e.errors,[]);

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'building-attachment-diagnostics-'));
let calls=0;
function run(args,code=0){const r=spawnSync(process.execPath,['cli.mjs',...args,'--json'],{encoding:'utf8',timeout:60000});calls++;assert.equal(r.status,code,r.stdout+r.stderr);return JSON.parse(r.stdout);}
try{
  const input=path.join(temp,'unused.building.json'),ops=path.join(temp,'ops.json');fs.writeFileSync(input,JSON.stringify(unused));
  const bytes=fs.readFileSync(input);
  const demo=path.join(temp,'demo.building.json');run(['edit','examples/roof_attachment.building.json','--ops','examples/transactions/ineffective-attachment.edit.json','--out',demo]);
  assert.deepEqual(prepareDocument(JSON.parse(fs.readFileSync(demo))).building,prepared.building,'bundled diagnostic exercise produces the tested warning');
  const validated=run(['validate',input]);assert.ok(validated.results[0].warnings.some(w=>w.code==='roof-attachment-no-additional-cut'));
  run(['validate',input,'--warnings-as-errors'],1);
  const inspected=run(['inspect',input]);assert.deepEqual(inspected.results[0].inspection.roofs.attachments,[measurement]);
  const out=path.join(temp,'blocked');run(['export',input,'--out',out,'--warnings-as-errors'],1);assert.equal(fs.existsSync(out),false);
  run(['export',input,'--out',path.join(temp,'allowed')]);
  fs.writeFileSync(ops,JSON.stringify({version:1,operations:[]}));
  const blockedEdit=path.join(temp,'blocked.building.json');run(['edit',input,'--ops',ops,'--out',blockedEdit,'--warnings-as-errors'],1);assert.equal(fs.existsSync(blockedEdit),false);
  fs.writeFileSync(ops,JSON.stringify({version:1,operations:[{op:'roof.update',id:'roofSections_8',value:{baseY:source.roofSections.find(r=>r.hostRoofId).baseY}}]}));
  const fixed=path.join(temp,'fixed.building.json');run(['edit',input,'--ops',ops,'--out',fixed,'--warnings-as-errors']);
  const checked=run(['validate',fixed]);assert.equal(checked.results[0].warnings.length,0,'repair removes stale input warning');
  assert.deepEqual(fs.readFileSync(input),bytes);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
console.log(`PASS shared validation/inspect/web guides and undo; ${calls} CLI calls for warnings, export/edit strictness, repair and source preservation`);
