import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeEmptyBuilding,makeFloor,addRoom,makeStair,makeManualSurface} from './src/model.js';
import {normalizeBuilding} from './src/document.js';
import {validateBuilding} from './src/validation.js';
import {diagnosticTargets,resolveDiagnosticTarget} from './src/diagnostic-targets.js';
import {createEditorHarness} from './qa/editor-harness.mjs';
import {exportGodotFiles} from './src/exporter.js';

const plan=makeEmptyBuilding();plan.name='Diagnostic navigation';plan.roof.type='none';
plan.floors=[makeFloor('Lower'),makeFloor('Upper')];
for(const [i,f] of plan.floors.entries()){
  f.id='story-'+i;addRoom(f,{x:-5,z:-5},{x:5,z:5});f.walls.forEach((w,n)=>w.id='wall-'+n);
  f.stairs=[{...makeStair({x:1,z:2},{x:1,z:-2},1.2,'ramp',12,'Identical label'),id:'shared-id'}];
}
plan.floors[1].elevation=4;
plan.manualFloors=[{...makeManualSurface({x:30,z:0},{x:34,z:4},'floor',0,.18),id:'manual-a',label:'Remote floor'}, {...makeManualSurface({x:32,z:0},{x:36,z:4},'floor',0,.18),id:'manual-b'}];
normalizeBuilding(plan);
const before=structuredClone(plan),validation=validateBuilding(plan,{roofDiagnostics:true});assert.deepEqual(validation.errors,[]);
const orphan=validation.warnings.find(w=>/no upper floor/.test(w.message));
assert.deepEqual(diagnosticTargets(plan,orphan).map(t=>[t.type,t.floorId,t.id]),[['stair','story-1','shared-id']]);
const gap=validation.warnings.find(w=>/vertical wall gap/.test(w.message));assert.equal(diagnosticTargets(plan,gap)[0].floorId,'story-1');
const overlap=validation.warnings.find(w=>/manualFloors:.*overlap/.test(w.message));assert.deepEqual(diagnosticTargets(plan,overlap).map(t=>t.id),['manual-a','manual-b']);
assert.equal(diagnosticTargets(plan,{path:'Floor 2.walls[1].a.x',message:'unrelated words'})[0].id,'wall-1');
assert.equal(diagnosticTargets(plan,{path:'building.manualFloors[0].topY'})[0].id,'manual-a');
assert.deepEqual(diagnosticTargets(plan,{message:'Floor 2 shared-id manual-a'}),[],'Never infer targets from message wording');
assert.deepEqual(diagnosticTargets(plan,{path:'Floor 200.walls[0]'}),[]);
assert.deepEqual(diagnosticTargets(plan,{path:'constructor.prototype'}),[]);
assert.deepEqual(diagnosticTargets(plan,{path:'Floor 2',targets:[{type:'stair',id:'missing',floorId:'story-1'}]}),[],'Missing explicit target must not fall back to another object');
const target=diagnosticTargets(plan,orphan)[0],reordered=structuredClone(plan);reordered.floors.reverse();assert.equal(resolveDiagnosticTarget(reordered,target).floorId,'story-1');
reordered.floors[0].stairs=[];assert.equal(resolveDiagnosticTarget(reordered,target),null);
const duplicate=structuredClone(plan);duplicate.floors[1].stairs.push({...duplicate.floors[1].stairs[0]});assert.equal(resolveDiagnosticTarget(duplicate,target),null);
duplicate.floors.push({...duplicate.floors[0]});assert.equal(resolveDiagnosticTarget(duplicate,{type:'floor',floorId:'story-0'}),null);
assert.deepEqual(plan,before,'Target resolution must be read-only');

const editor=await createEditorHarness(),{$}=editor;editor.loadBuildingData(structuredClone(plan));
const original=editor.snapshot(),scene=exportGodotFiles(original),undoState=$('#undo-btn').disabled;
const row=pattern=>$('#validation-results').children.find(li=>pattern.test(li.querySelector('.validation-message').textContent));
const button=(pattern,n=0)=>row(pattern).querySelectorAll('button')[n];
await $('[data-view="preview"]').click();$('#selection-filter').value='wall';await $('#selection-filter').dispatch('change');
await button(/no upper floor/).click();
assert.equal($('#floor-select').value,'1');assert.deepEqual(editor.selection(),{type:'stair',id:'shared-id'});assert.equal($('#selection-filter').value,'all');
assert.equal($('#plan-view').classList.contains('active'),true);assert.equal(editor.document.activeElement,$('#selection-form'));
const middle=editor.coordinates({x:1,z:0});assert.ok(Math.abs(middle.x-550)<1e-8&&Math.abs(middle.y-380)<1e-8,'Navigation centers the selected object');
assert.deepEqual(editor.snapshot(),original);assert.deepEqual(exportGodotFiles(editor.snapshot()),scene);assert.equal($('#undo-btn').disabled,undoState);
const snapshotButton=button(/no upper floor/);
await button(/manualFloors:.*overlap/,1).click();assert.deepEqual(editor.selection(),{type:'manualFloor',id:'manual-b'});assert.equal($('#floor-select').value,'1','Independent surface navigation retains the active story');
const remote=editor.coordinates({x:34,z:2});assert.ok(Math.abs(remote.x-550)<1e-8&&Math.abs(remote.y-380)<1e-8);
await button(/vertical wall gap/).click();assert.equal(editor.selection(),null);assert.equal(editor.document.activeElement,$('#floor-label'));assert.equal($('details[data-section="floors"]').open,true);
await $('[data-tool="wall"]').click();const point=editor.coordinates({x:0,z:0});await $('#plan-canvas').dispatch('pointerdown',{clientX:point.x,clientY:point.y});await $('#plan-canvas').dispatch('pointerup',{clientX:point.x,clientY:point.y});assert.ok(editor.pending().wallStart);
await button(/no upper floor/).click();assert.equal(editor.pending().wallStart,null);assert.deepEqual(editor.snapshot(),original);
// Renaming followed by navigation still undoes the rename, not the inspection.
$('#building-name').value='Renamed';await $('#building-name').dispatch('change');await button(/no upper floor/).click();await $('#undo-btn').click();assert.equal(editor.snapshot().name,original.name);
// A detached old button must not select a different object after replacement.
await $('#new-btn').click();const fresh=editor.snapshot();await snapshotButton.click();assert.deepEqual(editor.snapshot(),fresh);assert.equal(editor.selection(),null);assert.match($('#status-text').textContent,/no longer exists/);

const roof=JSON.parse(fs.readFileSync(new URL('./examples/roof_attachment.building.json',import.meta.url)));roof.roofSections[1].baseY=30;editor.loadBuildingData(roof);
const roofBefore=editor.snapshot(),roofWarning=validateBuilding(roofBefore,{roofDiagnostics:true}).warnings.find(w=>w.code==='roof-attachment-no-additional-cut');
const roofTargets=diagnosticTargets(roofBefore,roofWarning);assert.equal(roofTargets.length,2);
const roofRow=row(/no additional slab/);await roofRow.querySelectorAll('button')[1].click();assert.deepEqual(editor.selection(),{type:'roofSection',id:roofWarning.hostRoofId});assert.deepEqual(editor.snapshot(),roofBefore);
assert.deepEqual(editor.errors,[]);
if(process.env.DIAGNOSTIC_SCREENSHOT){
  editor.loadBuildingData(JSON.parse(fs.readFileSync(new URL('./farmhouse_example.building.json',import.meta.url))));await button(/wall intersects stair footprint/).click();
  const canvas=$('#plan-canvas').native;if(!canvas)throw new Error('CANVAS_MODULE is needed for the diagnostic screenshot');fs.writeFileSync(process.env.DIAGNOSTIC_SCREENSHOT,canvas.toBuffer('image/png'));
}
console.log('PASS scoped diagnostic IDs, strict path fallback, ambiguous/stale guards, floor/object navigation, remote framing, pending-draw cancellation, unchanged history/scene and attached-roof host selection');
