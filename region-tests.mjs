import assert from 'node:assert/strict';
import fs from 'node:fs';
import {polygonRegion,regionPolygonProblem,regionAreaCells,pointInRegion,wallOutlinePoints} from './src/regions.js';
import {areaSize} from './src/polygon-areas.js';
import {polygonRegionFixture} from './qa/polygon-region-fixture.mjs';
import {prepareDocument,inspectFloorCoverage} from './src/diagnostics.js';
import {floorView,footprintInfo,structuralFloorRectangles} from './src/model.js';
import {validateBuilding} from './src/validation.js';
import {exportGodotFiles} from './src/exporter.js';
import {rectanglePick} from './src/selection.js';
import {proposeGroupMove} from './src/group-edit.js';
import {previewOverlay} from './src/preview-overlays.js';
import {createEditorHarness} from './qa/editor-harness.mjs';
import {applyTransaction} from './src/transactions.js';
const base=()=>JSON.parse(fs.readFileSync(new URL('examples/round_bounding.building.json',import.meta.url)));
const clone=structuredClone,close=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
const round=polygonRegionFixture(),[solid,cut,label]=round.floors[0].regions;
assert.equal(validateBuilding(round).errors.length,0);close(footprintInfo(floorView(round,0)).area,50);close(inspectFloorCoverage(round,0).area,50);
close(regionAreaCells(label).reduce((n,r)=>n+areaSize(r),0),areaSize(label));
assert.ok(!pointInRegion(label,{x:-1.5,z:.5}));assert.equal(rectanglePick(label,{x:-1.5,z:.5},80),null);assert.ok(rectanglePick(label,{x:-2.5,z:0},80));
assert.equal(rectanglePick(solid,{x:3.8,z:3.8},80),null);
for(const poly of [[],[{x:0,z:0},{x:1,z:0}], [{x:0,z:0},{x:1,z:1},{x:0,z:1},{x:1,z:0}], [{x:0,z:0},{x:1,z:0},{x:1,z:0},{x:0,z:1}], [{x:0,z:0},{x:1,z:0},{x:NaN,z:1}]])assert.ok(regionPolygonProblem(poly));
const clockwise=clone(solid);clockwise.polygon.reverse();assert.equal(regionPolygonProblem(clockwise.polygon),null);close(regionAreaCells(clockwise).reduce((n,r)=>n+areaSize(r),0),52);
const invalid=clone(round);invalid.floors[0].regions[0].minX=-5;assert.ok(validateBuilding(invalid).errors.some(e=>/bounds/.test(e.message)));
assert.deepEqual(prepareDocument(round).building,round);
const original=JSON.stringify(round),files=exportGodotFiles(round);assert.equal(JSON.stringify(round),original);assert.match(files.tscn,/"polygon":\[/);
const lines=previewOverlay(round,{overlay:'footprint'}).lines.filter(l=>l.kind==='void');assert.equal(lines.length,4);assert.ok(lines.every(l=>Math.abs(l.a.x-l.b.x)===1&&Math.abs(l.a.z-l.b.z)===1));
const moved=proposeGroupMove(round,0,[{type:'region',id:solid.id},{type:'region',id:cut.id},{type:'region',id:label.id}],{x:7,z:-3});assert.ok(moved.ok,moved.reason);close(footprintInfo(floorView(moved.building,0)).area,50);assert.deepEqual(moved.building.floors[0].regions[0].polygon,solid.polygon.map(p=>({x:p.x+7,z:p.z-3})));assert.equal(JSON.stringify(round),original);
console.log('PASS polygon regions: concave decomposition, exact solid/void coverage, picking, validation, winding independence, guides, metadata and group movement');

const e=await createEditorHarness();e.loadBuildingData(base());await e.$('#region-from-walls-btn').click();let b=e.snapshot();assert.equal(b.floors[0].regions[0].polygon.length,12);assert.equal(b.floors[0].regions[0].effect,'label');assert.match(e.$('#region-list').textContent,/52.0 m²/);assert.deepEqual(b.floors[0].walls,base().floors[0].walls);
await e.$('#undo-btn').click();assert.equal(e.snapshot().floors[0].regions.length,0);await e.$('#redo-btn').click();assert.equal(e.snapshot().floors[0].regions.length,1);
e.chooseSelection({type:'region',id:e.snapshot().floors[0].regions[0].id});
const elements=(root,out=[])=>{out.push(root);for(const c of root.children)elements(c,out);return out;};
const field=name=>elements(e.$('#selection-form')).find(c=>c.tagName==='LABEL'&&c.textContent.startsWith(name))?.querySelector('input,select');
field('Region name').value='Round region';await field('Region name').dispatch('change');assert.equal(e.snapshot().floors[0].regions[0].label,'Round region');
const before=e.snapshot();field('Corner 1 X').value=100;await field('Corner 1 X').dispatch('change');assert.deepEqual(e.snapshot(),before,'Crossing corner edit is rejected atomically');
const row=e.$('#selection-form').children.find(c=>c.className==='region-corner-row');await row.children.find(c=>c.textContent==='Insert after').click();assert.equal(e.snapshot().floors[0].regions[0].polygon.length,13);await e.$('#undo-btn').click();assert.equal(e.snapshot().floors[0].regions[0].polygon.length,12);
// Actual polygon clicks, corner undo and keyboard completion.
e.loadBuildingData(base());await e.document.querySelector('[data-tool="region"]').click();e.$('#new-region-shape').value='polygon';await e.$('#new-region-shape').dispatch('change');
const click=async(x,z)=>{const p=e.coordinates({x,z});await e.$('#plan-canvas').dispatch('pointerdown',{clientX:p.x,clientY:p.y});await e.$('#plan-canvas').dispatch('pointerup',{clientX:p.x,clientY:p.y});};
for(const p of [[-2,-2],[2,-2],[2,2],[-2,2]])await click(...p);assert.equal(e.pending().regionPoints.length,4);assert.equal(e.snapshot().floors[0].regions.length,0);
await e.window.dispatch('keydown',{key:'Backspace'});assert.equal(e.pending().regionPoints.length,3);await click(-2,2);await e.window.dispatch('keydown',{key:'Enter'});assert.equal(e.snapshot().floors[0].regions.length,1);assert.equal(e.pending().regionPoints.length,0);
await e.$('#undo-btn').click();assert.equal(e.snapshot().floors[0].regions.length,0);
for(const p of [[-2,-2],[2,2],[-2,2],[2,-2]])await click(...p);await e.$('#finish-region-btn').click();assert.equal(e.snapshot().floors[0].regions.length,0);assert.equal(e.pending().regionPoints.length,4);await e.window.dispatch('keydown',{key:'Escape'});assert.equal(e.pending().regionPoints.length,0);
const open=base();open.floors[0].walls.pop();e.loadBuildingData(open);await e.$('#region-from-walls-btn').click();assert.equal(e.snapshot().floors[0].regions.length,0);assert.match(e.$('#status-text').textContent,/closed/);assert.equal(e.errors.length,0);
console.log('PASS web regions: wall-outline copy, name, corner insertion/rejection, undo/redo, polygon clicks, Backspace/Enter, invalid finish retention and Escape cancellation');

const transaction=applyTransaction(base(),{version:1,operations:[{op:'region.add',floorId:base().floors[0].id,id:'cli_polygon',value:{label:'CLI polygon',kind:'room',effect:'solid',polygon:solid.polygon}}]});
assert.ok(transaction.ok,JSON.stringify(transaction));close(inspectFloorCoverage(transaction.building,0).area,52);
const changed=applyTransaction(transaction.building,{version:1,operations:[{op:'region.update',floorId:base().floors[0].id,id:'cli_polygon',value:{polygon:cut.polygon,effect:'void'}}]});assert.ok(changed.ok,JSON.stringify(changed));close(inspectFloorCoverage(changed.building,0).area,50);
const blocked=applyTransaction(transaction.building,{version:1,operations:[{op:'region.update',floorId:base().floors[0].id,id:'cli_polygon',value:{minX:1}}]});assert.equal(blocked.ok,false);
const onlyLabel=base();onlyLabel.floors[0].regions=[label];assert.equal(exportGodotFiles(onlyLabel).tscn.replace(/^metadata\/building_regions = .*\n/gm,''),exportGodotFiles(base()).tscn);
console.log('PASS CLI region transactions: polygon creation/replacement, derived bounds and unsafe bounds edit rejection; label-only preserves geometry exactly');
{
  // Halcyon H2: the independent-surface review warning only fires when a
  // manual roof/floor/ceiling or platform overlaps a void in plan (roof eaves
  // included) within the void's story, not for any such surface anywhere.
  const b=prepareDocument({...JSON.parse(JSON.stringify(base())),roof:{type:'none'}}).building,fid=b.floors[0].id;
  const cut=r=>validateBuilding(r).warnings.filter(w=>/region cutouts affect automatic surfaces only/.test(w.message||w)).length;
  const withVoid=applyTransaction(b,{version:1,operations:[{op:'region.add',floorId:fid,id:'void_probe',value:{minX:-1,maxX:1,minZ:-1,maxZ:1,effect:'void'}}]});assert.ok(withVoid.ok,JSON.stringify(withVoid.errors));
  const roof=value=>{const r=applyTransaction(withVoid.building,{version:1,operations:[{op:'roof.add',id:'r_probe',value:{type:'flat',baseY:2,...value}}]});assert.ok(r.ok,JSON.stringify(r.errors));return r.building;};
  assert.equal(cut(roof({minX:20,maxX:24,minZ:20,maxZ:24,overhang:0})),0,'a roof far from the void is not flagged');
  assert.equal(cut(roof({minX:1.2,maxX:4,minZ:-1,maxZ:1,overhang:0.35})),1,'eaves reaching over the void are flagged');
  assert.equal(cut(roof({minX:-0.5,maxX:0.5,minZ:-0.5,maxZ:0.5,overhang:0,baseY:2})),1,'a roof over the void within its story is flagged');
  assert.equal(cut(roof({minX:-0.5,maxX:0.5,minZ:-0.5,maxZ:0.5,overhang:0,baseY:40})),0,'a roof far above the void\'s story is not flagged');
  console.log('PASS void review warning: only independent surfaces overlapping a void in plan are flagged');
}
