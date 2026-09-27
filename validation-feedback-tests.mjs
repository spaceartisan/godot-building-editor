import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createEditorHarness} from './qa/editor-harness.mjs';
import {validateBuilding} from './src/validation.js';

const editor=await createEditorHarness(),{$}=editor;
const change=async(id,value)=>{$(id).value=String(value);await $(id).dispatch('change');};
const original=editor.snapshot();
// Invalid placement preferences restore the most recent valid value.
for(const [id,min,max,valid] of [
  ['light-height',0,1e6,3],['stair-width',.5,10000,3],['stair-steps',2,512,16],
  ['platform-height',-10000,10000,-1],['railing-height',.4,10000,1.2],
  ['roof-base-y',-1e6,1e6,-2],['roof-pitch',5,70,40],['roof-overhang',0,100,.5],
  ['manual-floor-y',-1e6,1e6,-3],['manual-floor-thickness',.01,10000,.2],
  ['manual-ceiling-y',-1e6,1e6,-1],['manual-ceiling-thickness',.01,10000,.15],
]){
  const selector='#new-'+id;
  for(const value of [min,max,valid]){await change(selector,value);assert.equal($(selector).value,String(value));}
  for(const value of ['', ' ', 'NaN', 'Infinity',min-1,max+1,...(id==='stair-steps'?[2.5]:[])]){
    await change(selector,value);assert.equal($(selector).value,String(valid),`${id}: reject ${JSON.stringify(value)}`);
    assert.match($('#status-text').textContent,/Placement setting unchanged/);
    assert.deepEqual(editor.snapshot(),original);
  }
}
await $('#undo-btn').click();assert.deepEqual(editor.snapshot(),original,'Placement preferences do not add history');
await change('#grid-size',1001);assert.deepEqual(editor.snapshot(),original);assert.match($('#status-text').textContent,/Setting unchanged: gridSize/);
assert.equal($('#grid-size').value,String(original.gridSize));
await change('#wall-thickness',101);assert.deepEqual(editor.snapshot(),original);assert.match($('#status-text').textContent,/wallThickness/);
await change('#grid-size',.75);assert.equal(editor.snapshot().gridSize,.75);
await change('#grid-size',1001);assert.equal(editor.snapshot().gridSize,.75);
await $('#undo-btn').click();assert.deepEqual(editor.snapshot(),original,'Rejected edit must not enter undo history');
await $('#redo-btn').click();assert.equal(editor.snapshot().gridSize,.75);
assert.equal($('#review-checks-btn').dataset.state,'clear');
const control=$('#building-name');control.focus();await change('#building-name','Validation review');
assert.equal(editor.document.activeElement,control,'Background checks must not steal focus');
await $('#review-checks-btn').click();assert.equal(editor.document.activeElement,$('#validation-summary'));
assert.deepEqual($('#validation-summary').lastScrollOptions,{block:'nearest'});
assert.match($('#validation-summary').textContent,/No issues found by the current checks/);
assert.equal($('#validation-results').children.length,0);

const warningPlan=JSON.parse(fs.readFileSync(new URL('./farmhouse_example.building.json',import.meta.url)));
editor.loadBuildingData(warningPlan);
const warnings=validateBuilding(editor.snapshot(),{roofDiagnostics:true}).warnings;
assert.ok(warnings.length);assert.equal($('#review-checks-btn').dataset.state,'warning');
assert.match($('#review-checks-btn').getAttribute('aria-label'),new RegExp(`0 errors, ${warnings.length} warnings`));
assert.match($('#validation-summary').textContent,/Export is allowed/);
assert.deepEqual($('#validation-results').children.map(li=>li.querySelector('.validation-message').textContent),warnings.map(w=>w.message));
// Capture the real browser download boundary while retaining the actual ZIP exporter.
const previousDocument=globalThis.document,previousCreate=URL.createObjectURL;const downloads=[];
globalThis.document={createElement:()=>({click(){}})};URL.createObjectURL=blob=>{downloads.push(blob);return previousCreate(blob);};
try{
  const before=editor.snapshot();await $('#export-btn').click();assert.equal(downloads.length,1);assert.ok(downloads[0].size>100);
  assert.deepEqual(editor.snapshot(),before);assert.equal(editor.document.activeElement,$('#validation-summary'));
  assert.match($('#status-text').textContent,/Godot package exported/);
  // Corrupt the loaded in-memory object to exercise the export safety net.
  // Normal numeric edits above can no longer leave the document invalid.
  warningPlan.gridSize=1001;await $('#validate-btn').click();
  assert.ok(validateBuilding(editor.snapshot()).errors.length);assert.equal($('#review-checks-btn').dataset.state,'error');
  assert.match($('#validation-summary').textContent,/Resolve errors before exporting/);
  await $('#export-btn').click();assert.equal(downloads.length,1,'Validation errors must block the download');assert.match($('#status-text').textContent,/Export blocked/);
  assert.equal(editor.document.activeElement,$('#validation-summary'));
  editor.loadBuildingData(before);assert.equal($('#review-checks-btn').dataset.state,'warning');
  URL.createObjectURL=()=>{throw new Error('Download unavailable');};await $('#export-btn').click();assert.match($('#status-text').textContent,/Export blocked: Download unavailable/);
  assert.equal(editor.document.activeElement,$('#validation-summary'));
}finally{globalThis.document=previousDocument;URL.createObjectURL=previousCreate;}
await $('#new-btn').click();assert.equal($('#review-checks-btn').dataset.state,'clear');await $('#validate-btn').click();assert.equal(editor.document.activeElement,$('#validation-summary'));
assert.deepEqual(editor.errors,[]);

// Save/report/export share the browser download boundary. Verify cleanup on
// both successful handoff and throwing DOM calls, without waiting for timers.
const savedGlobals={document:globalThis.document,create:URL.createObjectURL,revoke:URL.revokeObjectURL,timer:globalThis.setTimeout};
const blobs=[],anchors=[],revoked=[],timers=[];
let failure='';
try{
  URL.createObjectURL=blob=>{if(failure==='url')throw new Error('URL unavailable');blobs.push(blob);return 'blob:test-'+blobs.length;};
  URL.revokeObjectURL=url=>{if(url.startsWith('blob:test-'))revoked.push(url);else savedGlobals.revoke(url);};
  globalThis.setTimeout=(callback,delay)=>{timers.push({callback,delay});return timers.length;};
  globalThis.document={createElement:()=>{if(failure==='element')throw new Error('Element unavailable');const a={click(){if(failure==='click')throw new Error('Click unavailable');}};anchors.push(a);return a;}};
  const before=editor.snapshot(),undo=$('#undo-btn').disabled,redo=$('#redo-btn').disabled;
  await $('#save-json-btn').click();assert.deepEqual(JSON.parse(await blobs[0].text()),before);
  assert.equal(blobs[0].type,'application/json');assert.match(anchors[0].download,/\.building\.json$/);
  assert.match($('#status-text').textContent,/download requested/);
  for(const id of ['#save-json-btn','#download-check-report-btn','#export-btn']){
    for(const mode of ['element','click']){
      failure=mode;await $(id).click();assert.match($('#status-text').textContent,/failed|blocked/i);
    }
  }
  failure='';await $('#download-check-report-btn').click();await $('#export-btn').click();
  assert.equal(blobs.at(-1).type,'application/zip');assert.ok(blobs.at(-1).size>100);
  assert.equal(revoked.length,0,'Successful downloads retain their handoff delay');
  assert.equal(timers.length,blobs.length,'Every created URL needs cleanup even after a failed DOM call');
  for(const timer of timers){assert.ok([500,1000].includes(timer.delay));timer.callback();}
  assert.deepEqual(revoked,blobs.map((_,i)=>'blob:test-'+(i+1)));
  failure='url';const count=timers.length;await $('#save-json-btn').click();assert.match($('#status-text').textContent,/download failed: URL unavailable/);assert.equal(timers.length,count);
  assert.deepEqual(editor.snapshot(),before);assert.equal($('#undo-btn').disabled,undo);assert.equal($('#redo-btn').disabled,redo);
}finally{
  globalThis.document=savedGlobals.document;URL.createObjectURL=savedGlobals.create;URL.revokeObjectURL=savedGlobals.revoke;globalThis.setTimeout=savedGlobals.timer;
}
console.log('PASS numeric rollback/history, live check counts, focus/scroll intent, warning export, error blocking and download failure feedback (DOM adapter, not browser layout)');
console.log('PASS Save JSON feedback, exact serialized blueprint, shared download resource cleanup on success/failure and unchanged history');
