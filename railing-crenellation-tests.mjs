import assert from 'node:assert/strict';
import { applyTransaction } from './src/transactions.js';
import { prepareDocument } from './src/diagnostics.js';
import { makeEmptyBuilding } from './src/model.js';
import { exportGodotFiles } from './src/exporter.js';
import { analyzeReachability } from './src/reachability.js';

// Railings are transaction-editable guards; wall.crenellate lays out a
// parapet's crenels as ordinary empty window openings in one operation.
const blank=(()=>{const b=makeEmptyBuilding();b.floors[0].id='floor_1';return prepareDocument(b).building;})();
const edit=(ops,base)=>applyTransaction(base,{version:1,operations:ops});
const ok=(ops,base=blank)=>{const r=edit(ops,base);assert.equal(r.ok,true,JSON.stringify(r.errors));return r;};
const reject=(ops,pattern,base=blank)=>{const before=structuredClone(base),r=edit(ops,base);assert.equal(r.ok,false);assert.match(JSON.stringify(r.errors),pattern);assert.deepEqual(base,before);};
const deck=ok([{op:'building.update',value:{wallThickness:.5,roof:{type:'none'}}},
  {op:'floor.update',id:'floor_1',value:{autoCeiling:false,boundaryMode:'intentional_open'}},
  {op:'region.add',floorId:'floor_1',id:'deck',value:{minX:-6,maxX:6,minZ:-3,maxZ:3,effect:'solid'}},
  {op:'wall.add',floorId:'floor_1',id:'par',value:{a:{x:-6,z:-3},b:{x:6,z:-3},role:'exterior',height:1.7}}]).building;

{
  const r=ok([{op:'railing.add',floorId:'floor_1',id:'rail',value:{a:{x:-2,z:1},b:{x:2,z:1}}},
    {op:'railing.add',floorId:'floor_1',id:'rail2',value:{a:{x:-2,z:2},b:{x:2,z:2},height:1.1,style:'picket',label:'Guard'}}],deck);
  const [a,b]=r.building.floors[0].railings;
  assert.deepEqual({id:a.id,label:a.label,height:a.height,style:a.style},{id:'rail',label:'Railing',height:1,style:'two_rail'});
  assert.deepEqual({id:b.id,label:b.label,height:b.height,style:b.style},{id:'rail2',label:'Guard',height:1.1,style:'picket'});
  assert.deepEqual(r.changes.filter(c=>c.op==='add').map(c=>c.id),['rail','rail2'],'per-ID membership diff');
  const updated=ok([{op:'railing.update',floorId:'floor_1',id:'rail',value:{height:1.2,b:{x:3,z:1}}}],r.building).building.floors[0].railings[0];
  assert.deepEqual([updated.height,updated.b],[1.2,{x:3,z:1}]);
  const removed=ok([{op:'railing.remove',floorId:'floor_1',id:'rail'}],r.building).building.floors[0].railings.map(q=>q.id);
  assert.deepEqual(removed,['rail2']);
  const tscn=exportGodotFiles(r.building).tscn;
  assert.match(tscn,/Railing_001_Railing_Collision/);assert.match(tscn,/Railing_002_Guard/);
  // Railings block routes like walls do.
  const fence=ok([{op:'railing.add',floorId:'floor_1',id:'fence',value:{a:{x:-6,z:0},b:{x:6,z:0}}}],deck).building;
  assert.equal(analyzeReachability(fence).ok,true,'both halves open to the ground outside');
  console.log('PASS railings: add defaults/options, update, remove, per-ID diff, exported mesh and collision');
}
reject([{op:'railing.add',floorId:'floor_1',id:'r',value:{a:{x:0,z:0},b:{x:.1,z:0}}}],/longer than 0.15/,deck);
reject([{op:'railing.add',floorId:'floor_1',id:'r',value:{a:{x:0,z:0},b:{x:1,z:0},height:.3}}],/finite number/,deck);
reject([{op:'railing.add',floorId:'floor_1',id:'r',value:{a:{x:0,z:0},b:{x:1,z:0},height:5}}],/exceeds the story height/,deck);
reject([{op:'railing.add',floorId:'floor_1',id:'r',value:{a:{x:0,z:0},b:{x:1,z:0},style:'glass'}}],/one of/,deck);
reject([{op:'railing.add',floorId:'floor_1',id:'r',value:{a:{x:0,z:0}}}],/Missing required field: b/,deck);
reject([{op:'railing.update',floorId:'floor_1',id:'missing',value:{height:1}}],/Unknown railing ID/,deck);
{
  const r=ok([{op:'wall.crenellate',floorId:'floor_1',id:'par',value:{crenelWidth:.8,merlonWidth:1,depth:.7}}],deck);
  const crenels=r.building.floors[0].openings;
  // 12 m wall: floor((12-1)/1.8)=6 crenels, centred with merlons at both ends.
  assert.deepEqual(crenels.map(o=>o.id),['par-crenel-1','par-crenel-2','par-crenel-3','par-crenel-4','par-crenel-5','par-crenel-6']);
  for(const o of crenels)assert.deepEqual({type:o.type,style:o.windowStyle,sill:Math.round(o.sill*1e9)/1e9,height:o.height,width:o.width},{type:'window',style:'empty',sill:1,height:.7,width:.8});
  const centres=crenels.map(o=>o.t*12-6);
  assert.ok(Math.abs(centres[0]+centres.at(-1))<1e-6,'symmetric layout');
  assert.ok(centres.slice(1).every((c,i)=>Math.abs(c-centres[i]-1.8)<1e-6),'constant pitch');
  assert.ok(centres[0]-.4+6>=1-1e-6,'end merlons are at least merlonWidth');
  const custom=ok([{op:'wall.crenellate',floorId:'floor_1',id:'par',value:{crenelWidth:.6,merlonWidth:.6,depth:.5,idPrefix:'north'}}],deck).building.floors[0].openings;
  assert.equal(custom[0].id,'north-1');
  assert.ok(exportGodotFiles(r.building).tscn.length>0);
  console.log('PASS wall.crenellate: centred evenly spaced empty-window crenels with deterministic IDs and custom prefix');
}
reject([{op:'wall.crenellate',floorId:'floor_1',id:'par',value:{crenelWidth:.8,merlonWidth:1,depth:1.7}}],/less than the wall height/,deck);
reject([{op:'wall.crenellate',floorId:'floor_1',id:'par',value:{crenelWidth:8,merlonWidth:4,depth:.5}}],/too short/,deck);
reject([{op:'wall.crenellate',floorId:'floor_1',id:'par',value:{crenelWidth:.8,merlonWidth:1}}],/Missing required field: depth/,deck);
reject([{op:'wall.crenellate',floorId:'floor_1',id:'par',value:{crenelWidth:.8,merlonWidth:1,depth:.5,idPrefix:'a b'}}],/idPrefix/,deck);
reject([{op:'wall.crenellate',floorId:'floor_1',id:'nope',value:{crenelWidth:.8,merlonWidth:1,depth:.5}}],/Unknown wall ID/,deck);
{
  const once=ok([{op:'wall.crenellate',floorId:'floor_1',id:'par',value:{crenelWidth:.8,merlonWidth:1,depth:.7}}],deck).building;
  reject([{op:'wall.crenellate',floorId:'floor_1',id:'par',value:{crenelWidth:.8,merlonWidth:1,depth:.7}}],/ID already exists/,once);
  reject([{op:'wall.crenellate',floorId:'floor_1',id:'par',value:{crenelWidth:.8,merlonWidth:1,depth:.7,idPrefix:'again'}}],/overlap/i,once);
}
console.log('PASS railing/crenellation rejections: short, height, style, missing fields, deep crenels, short walls, IDs and overlaps');
