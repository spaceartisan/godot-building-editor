import assert from 'node:assert/strict';
import { applyTransaction } from './src/transactions.js';
import { prepareDocument } from './src/diagnostics.js';
import { makeEmptyBuilding, DEFAULT_OMNI_LIGHT } from './src/model.js';
import { exportGodotFiles } from './src/exporter.js';

// light.add/update/remove: the omni lights the web Light tool places (Kestrel K3).
const blank=(()=>{const b=makeEmptyBuilding();b.floors[0].id='floor_1';return prepareDocument(b).building;})();
const run=(ops,base=blank)=>applyTransaction(base,{version:1,operations:ops});
const ok=(ops,base)=>{const r=run(ops,base);assert.equal(r.ok,true,JSON.stringify(r.errors));return r.building;};
const rejects=(ops,pattern,base)=>{const r=run(ops,base);assert.equal(r.ok,false);assert.match(JSON.stringify(r.errors),pattern);};
{
  const b=ok([{op:'light.add',floorId:'floor_1',id:'lamp',value:{position:{x:1,y:2.4,z:-2}}}]);
  const l=b.floors[0].lights[0];
  assert.deepEqual(l,{id:'lamp',label:'Light 1',position:{x:1,y:2.4,z:-2},color:DEFAULT_OMNI_LIGHT.color,energy:DEFAULT_OMNI_LIGHT.energy,range:DEFAULT_OMNI_LIGHT.range,shadows:DEFAULT_OMNI_LIGHT.shadows,group:DEFAULT_OMNI_LIGHT.group},'web Light tool defaults');
  const u=ok([{op:'light.update',floorId:'floor_1',id:'lamp',value:{label:'Corridor',energy:1.2,range:6,shadows:false,color:{r:.7,g:.85,b:1}}}],b).floors[0].lights[0];
  assert.deepEqual([u.label,u.energy,u.range,u.shadows,u.color],['Corridor',1.2,6,false,{a:1,r:.7,g:.85,b:1}]);
  assert.equal(ok([{op:'light.remove',floorId:'floor_1',id:'lamp'}],b).floors[0].lights.length,0);
  rejects([{op:'light.add',floorId:'floor_1',id:'x',value:{label:'No position'}}],/Missing required field: position/);
  rejects([{op:'light.add',floorId:'floor_1',id:'x',value:{position:{x:0,z:0}}}],/Missing required field: y/);
  rejects([{op:'light.update',floorId:'floor_1',id:'lamp',value:{range:0}}],/0.1/,b);
  rejects([{op:'light.update',floorId:'floor_1',id:'lamp',value:{color:{r:2,g:0,b:0}}}],/\[0, 1\]/,b);
  rejects([{op:'light.add',floorId:'floor_1',id:'lamp',value:{position:{x:0,y:1,z:0}}}],/ID already exists/,b);
  // The exported scene carries the light.
  const scene=exportGodotFiles(b).tscn;
  assert.match(scene,/OmniLight3D/);assert.match(scene,/omni_range = 8/);
  console.log('PASS lights: add with web defaults, update, remove, validation, exported OmniLight3D');
}
