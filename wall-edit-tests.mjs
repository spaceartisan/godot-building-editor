import assert from 'node:assert/strict';
import { makeEmptyBuilding, makeFloor, addRoom, floorView, pointOnWall, validateOpeningLayout } from './src/model.js';
import { endpointMoveTargets, proposeEndpointMove } from './src/wall-edit.js';
import { snapPlanPoint } from './src/authoring.js';
import { validateBuilding } from './src/validation.js';
import { createEditorHarness } from './qa/editor-harness.mjs';
import fs from 'node:fs';

const wall=(id,ax,az,bx,bz)=>({id,role:'interior',a:{x:ax,z:az},b:{x:bx,z:bz},height:null});
const base=()=>{const b=makeEmptyBuilding();b.roof.type='none';b.floors[0].walls=[wall('one',-4,0,0,0),wall('two',0,0,0,4)];return b;};
let groups=0;
const test=(name,fn)=>{fn();groups++;console.log('PASS '+name);};
test('connected corner proposals preserve IDs and isolate floors, surfaces, and source data',()=>{
  const b=base();b.floors.push(makeFloor('Upper'));b.floors[1].walls=structuredClone(b.floors[0].walls);
  b.manualFloors.push({id:'manual',minX:-5,maxX:5,minZ:-5,maxZ:5,topY:0,thickness:.18});
  const before=structuredClone(b),r=proposeEndpointMove(b,0,'one','b',{x:1,z:1});
  assert.ok(r.ok,r.reason);assert.equal(r.wallIds.length,2);
  assert.deepEqual(r.floor.walls.map(w=>w.id),['one','two']);
  assert.deepEqual(r.floor.walls[0].b,r.floor.walls[1].a);
  assert.deepEqual(b,before,'proposing a drag must not mutate the document');
  assert.deepEqual(endpointMoveTargets(b.floors[0],'one','b',false),[{wallId:'one',end:'b'}]);
});
test('explicit detachment works on either wall orientation without moving neighbors',()=>{
  for(const [id,end] of [['one','b'],['two','a']]){
    const b=base(),r=proposeEndpointMove(b,0,id,end,{x:-1,z:1},{connected:false});
    assert.ok(r.ok,r.reason);assert.equal(r.wallIds.length,1);
    const other=id==='one'?1:0;assert.deepEqual(r.floor.walls[other],b.floors[0].walls[other]);
  }
});
test('T contacts can slide along their host, but cannot be silently broken',()=>{
  const b=base();b.floors[0].walls=[wall('host',-4,0,4,0),wall('branch',0,0,0,3)];
  assert.ok(proposeEndpointMove(b,0,'branch','a',{x:1,z:0}).ok);
  assert.match(proposeEndpointMove(b,0,'branch','a',{x:1,z:1}).reason,/junction/);
  assert.ok(proposeEndpointMove(b,0,'branch','a',{x:1,z:1},{connected:false}).ok);
  assert.match(proposeEndpointMove(b,0,'host','b',{x:4,z:1}).reason,/junction/);
});
test('wall collapse, overlap, new crossings and invalid coordinates are rejected',()=>{
  const b=base();
  assert.ok(!proposeEndpointMove(b,0,'one','b',{x:-4,z:0}).ok);
  const overlap=base();overlap.floors[0].walls=[wall('moving',0,0,2,0),wall('fixed',3,0,5,0)];
  assert.match(proposeEndpointMove(overlap,0,'moving','b',{x:4,z:0}).reason,/overlap/);
  assert.ok(!proposeEndpointMove(b,0,'one','b',{x:NaN,z:0}).ok);
  const c=base();c.floors[0].walls=[wall('moving',0,0,4,0),wall('fixed',2,1,2,4)];
  assert.match(proposeEndpointMove(c,0,'moving','b',{x:4,z:4}).reason,/cross/);
});
test('openings retain dimensions, clamp centers only when needed, and never overlap',()=>{
  const b=base();b.floors[0].walls=[wall('one',0,0,10,0)];
  const o={id:'door',type:'door',wallId:'one',t:.8,width:1,height:2.1,doorStyle:'empty'};
  b.floors[0].openings=[o];
  const r=proposeEndpointMove(b,0,'one','b',{x:2,z:0});
  assert.ok(r.ok,r.reason);assert.equal(r.adjustedOpenings,1);assert.equal(r.floor.openings[0].width,1);
  assert.equal(r.floor.openings[0].wallId,'one');assert.equal(r.floor.openings[0].id,'door');
  const v={...floorView(b,0),...r.floor};assert.deepEqual(validateOpeningLayout(v),[]);
  assert.ok(pointOnWall(r.floor.walls[0],r.floor.openings[0].t).x<1.5);
  assert.match(proposeEndpointMove(b,0,'one','b',{x:.8,z:0}).reason,/no longer fit/);
  b.floors[0].openings.push({...o,id:'door2',t:.3});
  assert.match(proposeEndpointMove(b,0,'one','b',{x:2,z:0}).reason,/overlaps/);
});
test('drag snapping ignores moving endpoints and their old supporting lines',()=>{
  const b=base(),targets=endpointMoveTargets(b.floors[0],'one','b');
  const r=snapPlanPoint({x:.04,z:.05},b.floors[0].walls,{excludedEndpoints:targets,excludedProjections:targets.map(t=>t.wallId)});
  assert.equal(r.kind,'grid');
  assert.equal(snapPlanPoint({x:-4.02,z:.01},b.floors[0].walls,{excludedEndpoints:targets,excludedProjections:targets.map(t=>t.wallId)}).kind,'endpoint');
});
test('closed angled boundaries use polygon floors and flag rectangular gable roofs',()=>{
  const b=makeEmptyBuilding();addRoom(b.floors[0],{x:-4,z:-4},{x:4,z:4});
  const w=b.floors[0].walls[0],r=proposeEndpointMove(b,0,w.id,'b',{x:5,z:-4});
  assert.ok(r.ok,r.reason);b.floors[0]=r.floor;
  assert.ok(!validateBuilding(b).warnings.some(w=>/rectangular bounds/.test(w.message)));
  assert.ok(validateBuilding(b).warnings.some(w=>/choose Hip/.test(w.message))); 
});

const e=await createEditorHarness(),{$}=e;
const select=id=>e.chooseSelection({type:'wall',id});
const pointer=async(type,x,z,extra={})=>{const p=e.coordinates({x,z});await $('#plan-canvas').dispatch(type,{clientX:p.x,clientY:p.y,...extra});};
const prop=label=>$('#selection-form').children.find(c=>c.textContent.startsWith(label))?.children[0];
const b=base();e.loadBuildingData(b);select('one');
const before=e.snapshot();
await pointer('pointerdown',0,0);await pointer('pointermove',1,0);await pointer('pointermove',1,1);
assert.deepEqual(e.snapshot(),before,'drag previews are not document edits');
await pointer('pointerup',1,1);
const after=e.snapshot();assert.deepEqual(after.floors[0].walls[0].b,{x:1,z:1});
assert.deepEqual(after.floors[0].walls[1].a,{x:1,z:1});
await $('#undo-btn').click();assert.deepEqual(e.snapshot(),before,'one undo restores all dragged endpoints');
await $('#redo-btn').click();assert.deepEqual(e.snapshot(),after);
for(const event of ['pointercancel','lostpointercapture','Escape','blur']){
  select('one');await pointer('pointerdown',1,1);await pointer('pointermove',2,1);
  if(event==='Escape')await e.window.dispatch('keydown',{key:'Escape'});
  else if(event==='blur')await e.window.dispatch('blur');
  else await $('#plan-canvas').dispatch(event,{pointerId:1});
  assert.equal(e.pending().endpointDrag,null);assert.deepEqual(e.snapshot(),after);
  await pointer('pointerup',2,1);assert.deepEqual(e.snapshot(),after,'late pointer-up after cancellation must not commit');
}
select('one');await pointer('pointerdown',1,1);await pointer('pointermove',-4,0);await pointer('pointerup',-4,0);
assert.deepEqual(e.snapshot(),after,'invalid drop restores the unchanged document');
assert.match($('#status-text').textContent,/blocked/i);
await $('#undo-btn').click();assert.deepEqual(e.snapshot(),before,'invalid/cancelled edits must add no undo step');
await $('#redo-btn').click();select('one');
prop('End X').value='2';await prop('End X').dispatch('change');
assert.deepEqual(e.snapshot().floors[0].walls[1].a,{x:2,z:1},'numeric edits share connected movement');
await $('#undo-btn').click();select('one');
prop('Move connected endpoints').checked=false;await prop('Move connected endpoints').dispatch('change');
await pointer('pointerdown',1,1);await pointer('pointermove',2,0);await pointer('pointerup',2,0);
assert.deepEqual(e.snapshot().floors[0].walls[1].a,{x:1,z:1},'explicit detach leaves neighbor behind');
await $('#undo-btn').click();select('one');
const stable=e.snapshot();
await pointer('pointerdown',1,1);await pointer('pointerup',1,1);
assert.deepEqual(e.snapshot(),stable,'click without dragging must be a no-op');
assert.deepEqual(e.errors,[]);
console.log('PASS actual endpoint handlers: previews, one-step undo/redo, numeric edits, detach, blocked drops and cancellation');
if(process.env.ENDPOINT_SCREENSHOT){
  e.loadBuildingData(JSON.parse(fs.readFileSync('examples/editable_junctions.building.json','utf8')));
  const f=e.snapshot().floors[0],w=f.walls.find(w=>w.label==='Editable west arm');select(w.id);
  prop('Move connected endpoints').checked=true;await prop('Move connected endpoints').dispatch('change');
  await pointer('pointerdown',w.b.x,w.b.z);await pointer('pointermove',w.b.x+.5,w.b.z+.5);
  fs.writeFileSync(process.env.ENDPOINT_SCREENSHOT,$('#plan-canvas').native.toBuffer('image/png'));
  await e.window.dispatch('keydown',{key:'Escape'});
}
console.log(groups+' endpoint model groups and editor integration passed.');
