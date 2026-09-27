import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeEmptyBuilding,makeFloor,makeStair,floorElevation} from './src/model.js';
import {normalizeBuilding} from './src/document.js';
import {proposeFloorStackEdit} from './src/floor-stack.js';
import {markerProblem,markerReviewGuides} from './src/markers.js';
import {validateBuilding} from './src/validation.js';
import {exportGodotFiles} from './src/exporter.js';
import {prepareDocument,inspectBuilding} from './src/diagnostics.js';
import {proposeGroupMove} from './src/group-edit.js';
import {createEditorHarness} from './qa/editor-harness.mjs';
import {floorMarkerFixture} from './qa/floor-marker-fixture.mjs';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const edit=(source,index,action,options)=>{const r=proposeFloorStackEdit(source,index,action,options);assert.equal(r.ok,true,r.reason);return r;};
const levels=b=>b.floors.map((_,i)=>floorElevation(b,i));
const sameBuilding=(actual,expected)=>{const copy=structuredClone(actual);for(let i=0;i<copy.floors.length;i++)if(Number.isFinite(expected.floors[i].elevation)){near(copy.floors[i].elevation,expected.floors[i].elevation);copy.floors[i].elevation=expected.floors[i].elevation;}assert.deepEqual(copy,expected);};
const b=makeEmptyBuilding();b.floors=[{...makeFloor('Ground'),id:'ground'},{...makeFloor('Upper'),id:'upper',wallHeight:3.2},{...makeFloor('Attic'),id:'attic',elevation:6.36}];
const original=structuredClone(b),under=edit(b,0,'below');
near(levels(under.building)[0],-2.98);assert.deepEqual(levels(under.building).slice(1),levels(b));assert.deepEqual(b,original);
assert.equal(under.building.floors[1].elevation,0,'Former ground stays anchored when a basement height is later edited');
under.building.floors[0].wallHeight=3.5;near(floorElevation(under.building,1),0);
const belowAgain=edit(edit(b,0,'below').building,0,'below').building;near(levels(belowAgain)[0],-5.96);near(levels(belowAgain)[2],0);
const above=edit(b,0,'above');assert.deepEqual(levels(above.building).map(x=>Number(x.toFixed(2))),[0,2.98,5.96,9.34]);
const middleBelow=edit(b,1,'below');assert.deepEqual(levels(middleBelow.building),levels(above.building));
const top=edit(b,2,'above');near(levels(top.building)[3],9.34);
const recovered=edit(above.building,1,'remove').building;sameBuilding(recovered,b);
const noBasement=edit(edit(b,0,'below').building,0,'remove').building;assert.deepEqual(levels(noBasement),levels(b));
const changed=edit(b,0,'up').building;assert.deepEqual(changed.floors.map(f=>f.id),['upper','ground','attic']);near(levels(changed)[1],3.38);near(levels(changed)[2],6.36);
assert.equal(changed.floors[0].wallHeight,3.2);assert.equal(Object.hasOwn(changed.floors[1],'elevation'),false);
sameBuilding(edit(changed,1,'down').building,b);
for(const [index,action] of [[0,'down'],[2,'up'],[9,'above'],[.5,'above'],[0,'unknown']])assert.equal(proposeFloorStackEdit(b,index,action).ok,false);
assert.equal(proposeFloorStackEdit(makeEmptyBuilding(),0,'remove').ok,false);
const tooLow=structuredClone(b);tooLow.floors[0].elevation=-1e6;assert.equal(proposeFloorStackEdit(tooLow,0,'below').ok,false);
console.log('PASS basement anchors, repeated basements, middle/top insertion, deletion inverses, variable-height swaps and bounds');

const example=floorMarkerFixture(),saved=structuredClone(example);
assert.deepEqual(validateBuilding(example).errors,[]);assert.deepEqual(validateBuilding(example).warnings,[]);
for(const action of ['above','duplicate','up']){
  const rejected=proposeFloorStackEdit(example,0,action);assert.equal(rejected.ok,false);assert.equal(rejected.affectedStairs.length,1);assert.match(rejected.reason,/Basement stairs/);
  const allowed=edit(example,0,action,{removeAffectedStairs:true});assert.equal(allowed.affectedStairs.length,1);assert.ok(allowed.building.floors.every(f=>f.stairs.length===0));
}
const basement=edit(example,0,'below').building;assert.deepEqual(basement.floors[1].stairs,example.floors[0].stairs);near(floorElevation(basement,2),0);
assert.equal(proposeFloorStackEdit(example,1,'remove').ok,false);
const topRemoved=edit(example,1,'remove',{removeAffectedStairs:true});assert.equal(topRemoved.building.floors[0].stairs.length,0);
const dup=edit(example,1,'duplicate').building,copy=dup.floors[2],source=example.floors[1];
assert.notEqual(copy.id,source.id);assert.notEqual(copy.walls[0].id,source.walls[0].id);assert.notEqual(copy.markers[0].id,source.markers[0].id);assert.equal(copy.markers[0].details,source.markers[0].details);
assert.equal(copy.openings[0].wallId,copy.walls[4].id);assert.equal(copy.stairs.length,0);assert.deepEqual(example,saved);
const independent=structuredClone(example);independent.manualFloors=[{id:'manual',minX:10,maxX:12,minZ:0,maxZ:2,topY:0,thickness:.18}];
const retained=edit(independent,0,'below');assert.equal(retained.independentSurfaces,1);assert.deepEqual(retained.building.manualFloors,independent.manualFloors);
console.log('PASS stair identity guards/explicit removal, duplication remapping, marker notes and independent-surface preservation');

const markers=example.floors[0].markers;
assert.equal(markerProblem(markers[0]),null);
for(const value of [{label:''},{label:'a\nb'},{label:'a'.repeat(121)},{details:'a'.repeat(2001)},{details:3},{position:{x:NaN,y:0,z:0}}])assert.ok(markerProblem({...markers[0],...value}));
for(const invalid of [{markers:{}},{markers:[{...markers[0],id:example.floors[0].walls[0].id}]},{markers:[{...markers[0],position:{x:0,y:Infinity,z:0}}]}]){
  const candidate=structuredClone(example);Object.assign(candidate.floors[0],invalid);assert.equal(prepareDocument(candidate).building,null);
}
const missing=structuredClone(example);delete missing.floors[0].markers[0].id;
assert.deepEqual(prepareDocument(missing).building,prepareDocument(missing).building);
assert.equal(Object.hasOwn(normalizeBuilding(makeEmptyBuilding()).floors[0],'markers'),false);
const exports=exportGodotFiles(example,{markers:false});assert.equal((exports.tscn.match(/type="Marker3D"/g)||[]).length,3);assert.doesNotMatch(exports.tscn,/JSON note:|leave this bay|Notes/);assert.doesNotMatch(exports.tscn,/type="StandardMaterial3D"/);
const quoted=structuredClone(example);quoted.floors[1].markers[0].label='Entry "west" / путь';quoted.floors[1].markers[1].label=quoted.floors[1].markers[0].label;
const quotedScene=exportGodotFiles(quoted,{markers:false}).tscn;assert.match(quotedScene,/Marker_001_Entry_west/);assert.match(quotedScene,/Marker_002_Entry_west/);assert.ok(quotedScene.includes(JSON.stringify(quoted.floors[1].markers[0].label)));
assert.equal(inspectBuilding(example).counts.markers,3);assert.equal(markerReviewGuides(example,'floor',0).labels.length,1);assert.equal(markerReviewGuides(example,'roofs',0).labels.length,0);near(markerReviewGuides(example,'floor',0).labels[0].point.y,-2.78);
const grouped=proposeGroupMove(example,0,[{type:'marker',id:'storage_reference'}],{x:1,z:2});assert.equal(grouped.ok,true);assert.deepEqual(grouped.building.floors[0].markers[0].position,{x:-2,y:.2,z:3});assert.equal(grouped.building.floors[0].markers[0].details,markers[0].details);
console.log('PASS marker validation/import, notes excluded from TSCN, duplicate/escaped names, per-floor world positions and group translation');

const e=await createEditorHarness(),{$}=e;
const field=label=>$('#selection-form').children.find(c=>c.textContent.startsWith(label))?.querySelector('input,textarea');
const change=async(selector,value)=>{$(selector).value=value;await $(selector).dispatch('change');};
const pointer=async(type,x,z,extra={})=>{const p=e.coordinates({x,z});await $('#plan-canvas').dispatch(type,{clientX:p.x,clientY:p.y,...extra});};
e.loadBuildingData(structuredClone(example));await $('#add-floor-below-btn').click();assert.equal(e.snapshot().floors.length,3);near(floorElevation(e.snapshot(),2),0);assert.equal($('#floor-label').value,'Basement');
await $('#undo-btn').click();assert.deepEqual(e.snapshot(),example);await $('#redo-btn').click();assert.equal(e.snapshot().floors.length,3);
await $('#undo-btn').click();await $('#add-floor-btn').click();assert.deepEqual(e.snapshot(),example);assert.match($('#status-text').textContent,/stair connection/);
$('#floor-remove-stairs').checked=true;await $('#add-floor-btn').click();assert.equal(e.snapshot().floors.length,3);assert.equal(e.snapshot().floors[0].stairs.length,0);assert.equal($('#floor-remove-stairs').checked,false);
await $('#undo-btn').click();assert.deepEqual(e.snapshot(),example);
await change('#floor-select',1);await $('#duplicate-floor-btn').click();assert.equal(e.snapshot().floors.length,3);assert.equal(e.snapshot().floors[2].markers.length,2);assert.notEqual(e.snapshot().floors[2].markers[0].id,source.markers[0].id);await $('#undo-btn').click();
await change('#floor-select',1);await $('#delete-floor-btn').click();assert.equal(e.snapshot().floors.length,1);assert.equal(e.snapshot().floors[0].stairs.length,0);await $('#undo-btn').click();assert.deepEqual(e.snapshot(),example);
e.loadBuildingData(structuredClone(b));await change('#floor-select',0);await $('#move-floor-up-btn').click();assert.deepEqual(e.snapshot().floors.map(f=>f.id),['upper','ground','attic']);assert.equal($('#floor-label').value,'Ground');await $('#undo-btn').click();assert.deepEqual(e.snapshot(),normalizeBuilding(structuredClone(b)));
console.log('PASS actual floor controls: add below/above, blocked edits, explicit stair removal, duplicate/delete/reorder and undo/redo');

e.loadBuildingData(structuredClone(example));await $('[data-tool="marker"]').click();await change('#new-marker-height',.5);await pointer('pointerdown',2,1);await pointer('pointerup',2,1);
let marker=e.snapshot().floors[0].markers.at(-1);assert.deepEqual(marker.position,{x:2,y:.5,z:1});assert.equal(e.selection().type,'marker');
field('Marker name').value='Pump reference';await field('Marker name').dispatch('change');field('Notes (JSON only)').value='Future utility location.\nJSON_PRIVATE_NOTE';await field('Notes (JSON only)').dispatch('change');
const noted=e.snapshot();assert.equal(noted.floors[0].markers.at(-1).details,'Future utility location.\nJSON_PRIVATE_NOTE');assert.equal($('#marker-list').children.at(-1).textContent,'Pump reference');assert.doesNotMatch(exportGodotFiles(noted).tscn,/JSON_PRIVATE_NOTE/);
field('Marker name').value='';await field('Marker name').dispatch('change');assert.deepEqual(e.snapshot(),noted);assert.equal(field('Marker name').value,'Pump reference');
await e.window.dispatch('keydown',{key:'z',ctrlKey:true,target:field('Notes (JSON only)')});assert.deepEqual(e.snapshot(),noted,'Text undo remains native');
await $('#marker-list').children.at(-1).click();await pointer('pointerdown',2,1);await pointer('pointermove',3,2);await pointer('pointerup',3,2);assert.deepEqual(e.snapshot().floors[0].markers.at(-1).position,{x:3,y:.5,z:2});await $('#undo-btn').click();assert.deepEqual(e.snapshot(),noted);
await change('#selection-filter','marker');await $('#select-all-btn').click();assert.equal(e.selections().length,2);await $('#delete-group-btn').click();assert.equal(e.snapshot().floors[0].markers.length,0);await $('#undo-btn').click();assert.deepEqual(e.snapshot(),noted);
await change('#floor-select',1);assert.equal($('#marker-list').children.length,2);await $('#marker-list').children[0].click();await $('#marker-list').children[1].dispatch('click',{shiftKey:true});assert.equal(e.selections().length,2);
assert.deepEqual(e.errors,[]);
if(process.env.FLOOR_MARKER_SCREENSHOT&&$('#plan-canvas').native){
  e.loadBuildingData(structuredClone(example));await change('#floor-select',1);e.drawPlan();fs.writeFileSync(process.env.FLOOR_MARKER_SCREENSHOT,$('#plan-canvas').native.toBuffer('image/png'));
  e.preview.setReview({view:'floor'});e.preview.frame(e.snapshot(),1);e.preview.draw();fs.writeFileSync(process.env.FLOOR_MARKER_SCREENSHOT.replace('.png','_3d.png'),$('#preview-canvas').native.toBuffer('image/png'));
}
console.log('PASS actual marker controls: placement, name/notes, invalid rollback, text undo, list/Shift/group selection, move/delete and floor isolation');
