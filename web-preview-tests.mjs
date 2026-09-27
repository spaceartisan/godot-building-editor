import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createEditorHarness } from './qa/editor-harness.mjs';
import { EXAMPLE_CATALOG } from './src/examples.js';
import { reviewScene, fitReviewCamera } from './src/preview-review.js';
import { exportGodotFiles } from './src/exporter.js';
import { makeEmptyBuilding } from './src/model.js';
import {markerReviewGuides} from './src/markers.js';

const e=await createEditorHarness(),{$,preview}=e;
const change=async(id,value)=>{const el=$(id);el.value=value;await el.dispatch('change');};
const load=file=>e.loadBuildingData(JSON.parse(fs.readFileSync(file,'utf8')));
const compare=()=>assert.deepEqual(preview.scene,reviewScene(e.snapshot(),{...preview.review,floor:preview.activeFloor+1}),'web scene and guides equal shared CLI geometry');
let floors=0;
for(const entry of EXAMPLE_CATALOG){
  load(entry.file);const before=e.snapshot();
  await $('[data-view="preview"]').click();
  assert.equal($('#preview-view').parentElement.classList.contains('review-active'),true);
  await change('#preview-mode','floor');await change('#preview-overlay','footprint');
  for(let i=0;i<before.floors.length;i++){
    await change(i%2?'#preview-floor':'#floor-select',String(i));compare();floors++;
    assert.equal($('#preview-floor').value,String(i));assert.equal($('#floor-select').value,String(i));
    assert.equal(preview.scene.summary.floorId,before.floors[i].id);
    assert.ok($('#preview-status').textContent.includes(preview.scene.summary.overlay.area.toFixed(2)));
    assert.match($('#preview-status').textContent,/before stair\/platform cutouts/);
    const markerGuides=markerReviewGuides(before,preview.review.view,i);
    assert.deepEqual(preview.markerGuides,markerGuides,'Web marker guides follow the active floor');
    const expected=fitReviewCamera([preview.scene,{objects:[],overlay:markerGuides}],{yaw:preview.yaw,pitch:preview.pitch});
    assert.deepEqual(preview.target,expected.target);
  }
  await change('#preview-mode','roofs');await change('#preview-overlay','attachments');compare();
  assert.equal($('#preview-roof-field').hidden,false);
  assert.equal($('#preview-roof').disabled,before.roofSections.length===0);
  assert.equal($('#preview-guide-scope').hidden,false);
  assert.deepEqual(e.snapshot(),before,'review controls must not author changes');
  await $('[data-view="plan"]').click();assert.equal($('#preview-view').parentElement.classList.contains('review-active'),false);
}
console.log(`PASS web handlers: ${EXAMPLE_CATALOG.length} examples, ${floors} floor cutaways, exact shared scenes/guides and immutable blueprints`);

load('examples/roof_attachment.building.json');
await change('#preview-roof','roofSections_8');
assert.match($('#preview-notes').textContent,/Attached canopy → Main host roof/);
e.chooseSelection({type:'roofSection',id:'roofSections_8'});
const beforeDelete=e.snapshot();
await e.window.dispatch('keydown',{key:'Delete'});
assert.equal($('#preview-roof').value,'','deleted guide selection resets');compare();
await $('#undo-btn').click();assert.deepEqual(e.snapshot(),beforeDelete);compare();
await change('#preview-roof','roofSections_8');
e.chooseSelection({type:'roofSection',id:'roofSections_7'});
await e.window.dispatch('keydown',{key:'Delete'});
assert.match($('#preview-notes').textContent,/no host/);compare();
await $('#undo-btn').click();compare();
await change('#preview-overlay','none');assert.equal($('#preview-roof-field').hidden,true);assert.equal(preview.review.roof,undefined);
assert.equal($('#preview-legend').hidden,true);assert.equal($('#preview-guide-scope').hidden,true);
console.log('PASS roof selection, child/host deletion, detach/undo and guide visibility');

load('examples/twostory.building.json');const beforeFloorDelete=e.snapshot();
await change('#preview-mode','floor');await change('#preview-floor','1');
await $('#delete-floor-btn').click();assert.equal($('#preview-floor').value,'0');assert.equal($('#preview-floor').children.length,1);compare();
await $('#undo-btn').click();assert.deepEqual(e.snapshot(),beforeFloorDelete);assert.equal($('#preview-floor').children.length,2);compare();

for(const file of ['barn_v2','farmhouse','twostory']){
  load(`examples/${file}.building.json`);const before=e.snapshot(),assets=exportGodotFiles(before);
  await change('#preview-mode','floor');await change('#preview-overlay','footprint');
  await change('#preview-mode','roofs');await change('#preview-overlay','attachments');
  await $('#preview-frame').click();
  assert.deepEqual(exportGodotFiles(e.snapshot()),assets,'review cannot change exported shells/resources');
  await change('#building-name','Temporary review test');
  await change('#preview-mode','building');await change('#preview-overlay','none');
  await $('#undo-btn').click();assert.deepEqual(e.snapshot(),before,'view changes must not enter authoring undo');
}
const empty=makeEmptyBuilding();empty.roof.type='none';
e.loadBuildingData(empty);await change('#preview-mode','roofs');await change('#preview-overlay','attachments');
assert.match($('#preview-status').textContent,/No geometry in this view.*No manual roof attachments/);
assert.equal($('#preview-roof').disabled,true);
assert.ok(Number.isFinite(preview.distance));
const state=structuredClone(preview.review);
assert.throws(()=>preview.setReview({view:'bogus'}));assert.deepEqual(preview.review,state);
assert.throws(()=>preview.setReview({roof:'missing'}));assert.deepEqual(preview.review,state);
assert.deepEqual(e.errors,[]);
console.log('PASS supplied-plan export parity, undo isolation, empty states and atomic selector rejection');
