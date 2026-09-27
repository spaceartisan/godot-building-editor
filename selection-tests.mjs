import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeEmptyBuilding, makeFloor, makeStair, makeOmniLight } from './src/model.js';
import { areaSelectionCandidates, stairPickDistance } from './src/selection.js';
import { createEditorHarness } from './qa/editor-harness.mjs';

const rect=(id,label,min=-3,max=3)=>({id,label,minX:min,maxX:max,minZ:min,maxZ:max});
const b=makeEmptyBuilding();b.name='Overlapping area selection';b.roof.type='none';
b.floors[0].slabs=[rect('slab','Building footprint',-4,4)];
b.floors[0].platforms=[{...rect('platform','Entry porch',-2.5,2.5),kind:'porch',height:0,covered:false}];
b.floors[0].regions=[{...rect('region','Lobby',-2,2),kind:'room',effect:'label'}];
b.roofSections=['roof-b','roof-a'].map((id,i)=>({...rect(id,i?'Lower canopy':'Upper canopy'),type:'flat',direction:'x',baseY:2.8,pitch:35,overhang:0,gableEnds:'none'}));
b.manualFloors=[{...rect('manual','Lobby floor',-3.5,3.5),topY:0,thickness:.18}];
const groups=[['roofSection',b.roofSections],['platform',b.floors[0].platforms],['slab',b.floors[0].slabs],['region',b.floors[0].regions]];
assert.equal(areaSelectionCandidates(groups,{x:0,z:0},55).length,5);
assert.deepEqual(areaSelectionCandidates(groups,{x:0,z:0},55).map(x=>x.id),areaSelectionCandidates(groups.map(([t,l])=>[t,[...l].reverse()]),{x:0,z:0},55).map(x=>x.id));
for(const scale of [18,55,90]){
  assert.equal(areaSelectionCandidates(groups,{x:2+4/scale,z:0},scale)[0].id,'region','Nearby outline beats a filled roof');
  assert.equal(areaSelectionCandidates(groups,{x:4+9/scale,z:0},scale).length,0,'No hit beyond screen-pixel tolerance');
}
const upper={...b.roofSections[0],id:'upper',baseY:5.78};
assert.equal(areaSelectionCandidates([['roofSection',[upper,b.roofSections[1]]]],{x:0,z:0},55,{roofSection:2.8})[0].id,'roof-a');
console.log('PASS all overlapping areas included, stable ordering, edge priority, story preference and zoom tolerance');

const long=makeStair({x:0,z:5},{x:0,z:-5},2,'steps',20),short=makeStair({x:.4,z:4},{x:.4,z:2},2,'steps',8);
assert.ok(stairPickDistance(long,{x:0,z:3.5},55)<stairPickDistance(short,{x:0,z:3.5},55));
assert.equal(stairPickDistance(long,{x:3,z:0},55),null);
console.log('PASS overlapping flights use run centerlines instead of center points');

const e=await createEditorHarness(),{$}=e;
const click=async(x,z)=>{const p=e.coordinates({x,z});for(const type of ['pointerdown','pointerup'])await $('#plan-canvas').dispatch(type,{clientX:p.x,clientY:p.y});};
const preLoad=e.snapshot();e.loadBuildingData(b);await $('[data-tool="select"]').click();
const before=e.snapshot();
const seen=[];for(let i=0;i<6;i++){await click(0,0);seen.push(e.selection().id);}
assert.equal(new Set(seen).size,6,'Same-type overlaps must all be reachable');
await click(0,0);assert.equal(e.selection().id,seen[0],'Cycle wraps');
const choices=$('#selection-candidates').querySelectorAll('button');assert.equal(choices.length,6);
await choices[1].click();assert.equal(e.selection().id,'roof-b');
assert.equal($('#selection-candidates').querySelectorAll('[aria-pressed="true"]').length,1);
await click(0,0);assert.equal(e.selection().type,'platform','Canvas cycle continues after explicit choice');
await click(8,8);assert.equal(e.selection(),null);assert.equal($('#selection-candidates').hidden,true);
await click(0,0);assert.equal(e.selection().id,'roof-a','Empty click resets cycle');
await $('[data-tool="wall"]').click();await $('[data-tool="select"]').click();await click(0,0);assert.equal(e.selection().id,'roof-a');
await $('#plan-canvas').dispatch('wheel',{clientX:550,clientY:380,deltaY:-100});await click(0,0);assert.equal(e.selection().id,'roof-a','Zoom resets cycle');
assert.deepEqual(e.snapshot(),before,'Selection changes must not alter authored geometry');
await $('#undo-btn').click();assert.deepEqual(e.snapshot(),preLoad,'One undo still undoes loading; selection creates no history');
console.log('PASS real handlers: complete cycling, direct choice, empty/tool/zoom reset and no document/history edits');

const precise=makeEmptyBuilding();precise.roof.type='none';
precise.floors[0].slabs=[rect('foot','Footprint',-6,6)];
precise.floors[0].walls=[{id:'wall',role:'interior',a:{x:-4,z:0},b:{x:4,z:0}}];
precise.floors[0].openings=[{id:'door',wallId:'wall',type:'door',doorStyle:'empty',t:.5,width:3,height:2.1}];
precise.floors[0].stairs=[long,short];
e.loadBuildingData(precise);await click(1.2,0);assert.equal(e.selection().id,'door','Opening is selectable away from its center');
await click(3,0);assert.equal(e.selection().id,'wall','Wall wins over footprint');
await click(0,3.5);assert.equal(e.selection().id,long.id);assert.match($('#status-text').textContent,/Stair/);
precise.floors[0].lights=[makeOmniLight(1.2,0)];e.loadBuildingData(precise);await click(1.2,0);assert.equal(e.selection().type,'light');
console.log('PASS full-span openings, point/line precedence and nearest stair via actual handlers');

b.floors.push(makeFloor('Upper'));e.loadBuildingData(b);await click(0,0);await click(0,0);
$('#floor-select').value='1';await $('#floor-select').dispatch('change');await click(0,0);assert.equal(e.selection().id,'roof-a','Floor navigation resets overlap cycling');
assert.deepEqual(e.errors,[]);
if(process.env.SELECTION_SCREENSHOT){
  e.loadBuildingData(b);await click(0,0);e.drawPlan();
  fs.writeFileSync(process.env.SELECTION_SCREENSHOT,$('#plan-canvas').native.toBuffer('image/png'));
}
console.log('PASS floor navigation clears stale picking context');
