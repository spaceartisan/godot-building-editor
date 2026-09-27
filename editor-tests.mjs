import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createEditorHarness } from './qa/editor-harness.mjs';
const e=await createEditorHarness(),{$}=e;
const tool=name=>$('[data-tool="'+name+'"]').click();
const point=async(type,x,z,extra={})=>{const p=e.coordinates({x,z});await $('#plan-canvas').dispatch(type,{clientX:p.x,clientY:p.y,...extra});};
const click=async(x,z)=>{await point('pointerdown',x,z);await point('pointerup',x,z);};
const drag=async(x,z,X,Z)=>{await point('pointerdown',x,z);await point('pointermove',X,Z);await point('pointerup',X,Z);};
const change=async(element,value)=>{element.value=value;await element.dispatch('change');};
const property=label=>$('#selection-form').children.find(c=>c.textContent.startsWith(label))?.children[0];
await $('#new-btn').click();await tool('wall');
for(const [x,z] of [[-3,-3],[3,-3],[3,3],[-3,3],[-2.97,-2.98]])await click(x,z);
assert.equal(e.snapshot().floors[0].walls.length,4);
assert.equal(e.pending().wallStart,null,'closing a loop ends the run');
assert.equal(property('Full story height').type,'checkbox','full-height checkbox must render');
assert.equal(property('Move connected endpoints').checked,true,'connected movement must be the default');
assert.deepEqual(e.errors,[]);
await tool('wall');await click(-3,-3);await click(3,-3);
assert.equal(e.snapshot().floors[0].walls.length,4,'duplicate wall rejected');
assert.match($('#status-text').textContent,/overlaps/);
await e.window.dispatch('keydown',{key:'Escape'});
await tool('region');await drag(-2,-2,2,2);
assert.equal(e.snapshot().floors[0].regions.length,1);
assert.equal(e.snapshot().floors[0].regions[0].effect,'label');
assert.equal(e.snapshot().floors[0].walls.length,4);
await change(property('Region name'),'Workshop "A"');
assert.equal($('#region-list').children.length,1);
await change(property('Min X'),8);
assert.equal(e.snapshot().floors[0].regions[0].minX,-2,'invalid rectangle edit rolls back');
await change(property('Footprint effect'),'void');
assert.equal(e.snapshot().floors[0].regions[0].effect,'void');
await $('#undo-btn').click();assert.equal(e.snapshot().floors[0].regions[0].effect,'label');
await $('#redo-btn').click();assert.equal(e.snapshot().floors[0].regions[0].effect,'void');
await $('#region-list').children[0].click();
assert.equal(e.selection().type,'region');
await e.window.dispatch('keydown',{key:'Delete'});
assert.equal(e.snapshot().floors[0].regions.length,0);
await $('#undo-btn').click();
const source=e.snapshot().floors[0].regions[0];
await $('#duplicate-floor-btn').click();
const copy=e.snapshot().floors[1].regions[0];
assert.equal(copy.label,source.label);assert.notEqual(copy.id,source.id);
await tool('wall');await click(6,6);
await change($('#floor-select'),'0');
assert.equal(e.pending().wallStart,null,'floor switch cancels in-flight drawing');
await tool('region');await point('pointerdown',1,1);await $('#plan-canvas').dispatch('pointercancel');
await point('pointerup',2,2);assert.equal(e.snapshot().floors[0].regions.length,1,'cancel must not create a region');
await $('#region-list').children[0].click();
const before=e.snapshot();
await e.window.dispatch('keydown',{key:'z',ctrlKey:true,target:property('Region name')});
assert.deepEqual(e.snapshot(),before,'typing undo must not undo the building');
for(const name of ['barn_v2','farmhouse','twostory','variable_levels','courtyard_regions']){
  e.loadBuildingData(JSON.parse(fs.readFileSync('examples/'+name+'.building.json','utf8')));
  for(const f of e.snapshot().floors){
    for(const type of ['wall','stair','light']){
      const obj=f[type==='wall'?'walls':type==='stair'?'stairs':'lights']?.[0];
      if(obj)e.chooseSelection({type,id:obj.id});
    }
  }
}
assert.deepEqual(e.errors,[],'all selection forms must render without exceptions');
if(process.env.PLAN_SCREENSHOT){
  e.chooseSelection({type:'region',id:e.snapshot().floors[0].regions[1].id});e.drawPlan();
  fs.writeFileSync(process.env.PLAN_SCREENSHOT,$('#plan-canvas').native.toBuffer('image/png'));
}
console.log('PASS editor handler integration: loop closure, duplicate rejection, region CRUD/undo, floor isolation, cancel, form rendering and text undo.');
console.log('DOM adapter only; not a browser layout test.');
