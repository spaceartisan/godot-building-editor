import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createCheckReport,checkReportFilename} from './src/check-report.js';
import {prepareDocument} from './src/diagnostics.js';
import {validateBuilding} from './src/validation.js';
import {exportGodotFiles} from './src/exporter.js';
import {createEditorHarness} from './qa/editor-harness.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const source=JSON.parse(fs.readFileSync(path.join(root,'farmhouse_example.building.json'),'utf8'));
const prepared=prepareDocument(source),building=prepared.building,validation=validateBuilding(building,{roofDiagnostics:true});
const before=JSON.stringify(building),scene=exportGodotFiles(building);
const report=createCheckReport([{building,...validation}]);
assert.equal(report.ok,true);assert.ok(report.counts.warnings>0);assert.equal(report.verification.godot,'not-run');
assert.equal(report.verification.collisionClearance,'not-verified');
const stair=report.results[0].warnings.find(w=>/wall intersects stair footprint/.test(w.message));
assert.equal(stair.resolvedTargets[0].type,'stair');assert.equal(stair.resolvedTargets[0].floorId,building.floors[0].id);
const strict=createCheckReport([{building,...validation}],{warningsAsErrors:true});
assert.equal(strict.ok,false);assert.deepEqual(strict.results[0].warnings,report.results[0].warnings);assert.equal(strict.counts.errors,0,'Strict mode must not relabel warnings');
report.results[0].warnings[0].message='Edited report';assert.equal(JSON.stringify(building),before);assert.notEqual(validation.warnings[0].message,'Edited report');
assert.match(checkReportFilename('../../Unsafe\\: name'),/^[a-z0-9_-]+\.checks\.json$/);
assert.equal(checkReportFilename('✨'),'building.checks.json');
assert.equal(checkReportFilename('a'.repeat(200)).length,92);

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'building-check-report-'));
try{
  const input=path.join(temp,'warning plan.building.json');fs.writeFileSync(input,JSON.stringify(building));
  const bytes=fs.readFileSync(input);
  const cli=args=>{const r=spawnSync(process.execPath,[path.join(root,'cli.mjs'),...args,'--json'],{cwd:temp,encoding:'utf8',timeout:20000});assert.equal(r.error,undefined);return {...r,result:JSON.parse(r.stdout)};};
  let run=cli(['validate',input,'--out','reports/check.json']);assert.equal(run.status,0);
  const saved=JSON.parse(fs.readFileSync(path.join(temp,'reports/check.json')));
  assert.equal(saved.kind,'building-check-report');assert.equal(saved.results[0].file,'../warning plan.building.json','saved reports use paths relative to the report directory');
  assert.equal(JSON.stringify(saved).includes(temp),false,'no absolute machine paths in the saved report');
  assert.equal(saved.results[0].validationStage,'prepared-document');
  assert.deepEqual(saved.results[0].warnings,createCheckReport([{building,...validation}]).results[0].warnings);
  assert.deepEqual(saved.results[0].errors,[]);
  const savedBytes=fs.readFileSync(run.result.output);
  assert.equal(cli(['validate',input,'--out','reports/check.json']).status,3);
  assert.deepEqual(fs.readFileSync(run.result.output),savedBytes);
  assert.equal(cli(['validate',input,'--out',input]).status,3);assert.deepEqual(fs.readFileSync(input),bytes);
  run=cli(['validate',input,'--warnings-as-errors','--out','strict.json']);assert.equal(run.status,1);
  const strictSaved=JSON.parse(fs.readFileSync(path.join(temp,'strict.json')));assert.equal(strictSaved.ok,false);assert.equal(strictSaved.counts.errors,0);
  const invalid=structuredClone(building);invalid.gridSize=1001;
  fs.writeFileSync(path.join(temp,'invalid.json'),JSON.stringify(invalid));fs.writeFileSync(path.join(temp,'broken.json'),'{');
  run=cli(['validate',input,'invalid.json','broken.json','missing.json','--out','batch.json']);assert.equal(run.status,3);
  const batch=JSON.parse(fs.readFileSync(path.join(temp,'batch.json')));
  assert.equal(batch.counts.documents,4);assert.equal(batch.ok,false);assert.ok(batch.counts.errors>=3);
  assert.deepEqual(batch.results.map(r=>r.validationStage),['prepared-document','raw-document','unreadable-input','unreadable-input']);
  assert.equal(cli(['validate','missing.json','--out','missing.json']).status,3);assert.equal(fs.existsSync(path.join(temp,'missing.json')),false);
  fs.symlinkSync(temp,path.join(temp,'alias'),'dir');
  assert.equal(cli(['validate','missing.json','--out','alias/missing.json']).status,3);assert.equal(fs.existsSync(path.join(temp,'missing.json')),false);
  assert.equal(cli(['validate',input,'--out','foo','--out','bar']).status,2);
  fs.symlinkSync('not-created.json',path.join(temp,'dangling.json'));
  assert.equal(cli(['validate',input,'--out','dangling.json']).status,3);assert.equal(fs.existsSync(path.join(temp,'not-created.json')),false);
  fs.writeFileSync(path.join(temp,'not-a-directory'),'keep');assert.equal(cli(['validate',input,'--out','not-a-directory/report.json']).status,3);

  const editor=await createEditorHarness(),{$}=editor;editor.loadBuildingData(structuredClone(building));
  const snapshot=editor.snapshot();const undo=$('#undo-btn').disabled,selection=editor.selection();
  await $('[data-tool="wall"]').click();const point=editor.coordinates({x:0,z:0});
  await $('#plan-canvas').dispatch('pointerdown',{clientX:point.x,clientY:point.y});await $('#plan-canvas').dispatch('pointerup',{clientX:point.x,clientY:point.y});
  assert.ok(editor.pending().wallStart);const pending=structuredClone(editor.pending());
  // Capture the actual exporter download boundary, not a replacement report handler.
  const originalDocument=globalThis.document,originalCreate=URL.createObjectURL;const downloads=[];
  globalThis.document={createElement:()=>({click(){}})};
  URL.createObjectURL=blob=>{downloads.push(blob);return originalCreate(blob);};
  try{
    await $('#download-check-report-btn').click();assert.equal(downloads.length,1);
    const web=JSON.parse(await downloads[0].text());assert.equal(downloads[0].type,'application/json');
    assert.deepEqual(web.results[0].warnings,saved.results[0].warnings);assert.deepEqual(web.results[0].counts,saved.results[0].counts);
    assert.equal(web.results[0].validationStage,'current-document');assert.equal('file' in web.results[0],false);
    assert.deepEqual(editor.snapshot(),snapshot);assert.deepEqual(exportGodotFiles(editor.snapshot()),scene);
    assert.equal($('#undo-btn').disabled,undo);assert.deepEqual(editor.selection(),selection);
    assert.deepEqual(editor.pending(),pending,'Report downloads must not discard unfinished drawing');
    $('#building-name').value='Fresh report name';await $('#building-name').dispatch('change');
    await $('#download-check-report-btn').click();assert.equal(JSON.parse(await downloads[1].text()).results[0].building.name,'Fresh report name');
    await $('#undo-btn').click();assert.deepEqual(editor.snapshot(),snapshot,'Downloading must not add undo entries');
    // Invalid live documents still need a useful downloadable report.
    const corrupt=structuredClone(building);editor.loadBuildingData(corrupt);corrupt.gridSize=1001;
    await $('#download-check-report-btn').click();assert.equal(JSON.parse(await downloads[2].text()).ok,false);
    assert.match($('#status-text').textContent,/Check report downloaded/);
    URL.createObjectURL=()=>{throw new Error('Download unavailable');};await $('#download-check-report-btn').click();
    assert.match($('#status-text').textContent,/Check report download failed: Download unavailable/);
  }finally{globalThis.document=originalDocument;URL.createObjectURL=originalCreate;}
  assert.deepEqual(editor.errors,[]);assert.deepEqual(fs.readFileSync(input),bytes);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
console.log('PASS web/CLI check report parity, structured targets, strict warnings, invalid/missing inputs, fresh snapshots, unchanged geometry/history and protected output paths');
