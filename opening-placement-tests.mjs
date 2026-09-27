import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyTransaction } from './src/transactions.js';
import { prepareDocument } from './src/diagnostics.js';

// Openings can be placed by world point instead of a direction-dependent t.
const root=path.dirname(fileURLToPath(import.meta.url));
const source=prepareDocument(JSON.parse(fs.readFileSync(path.join(root,'examples/courtyard_regions.building.json'),'utf8'))).building;
const edit=operations=>applyTransaction(source,{version:1,operations});
const add=(id,wallId,at,extra={})=>({op:'opening.add',floorId:'floor_1',id,value:{type:'door',wallId,at,width:1,height:2.1,...extra}});
const reject=(operations,pattern)=>{const before=structuredClone(source),r=edit(operations);assert.equal(r.ok,false);assert.equal(r.building,null);assert.match(JSON.stringify(r.errors),pattern);assert.deepEqual(source,before);};

{
  // wall_2 runs west->east (-7,-6)->(7,-6); wall_4 runs east->west (7,6)->(-7,6).
  const r=edit([add('d_north','wall_2',{x:3.5,z:-6}),add('d_south','wall_4',{x:3.5,z:6}),add('d_face','wall_2',{x:-3.5,z:-6.09})]);
  assert.equal(r.ok,true,JSON.stringify(r.errors));
  const o=Object.fromEntries(r.building.floors[0].openings.map(q=>[q.id,q]));
  assert.equal(o.d_north.t,.75);assert.equal(o.d_south.t,.25,'same world X on a reversed wall gives the mirrored t');
  assert.equal(o.d_face.t,.25,'a point on the wall face projects to the centreline');
  for(const q of Object.values(o))assert.equal(Object.hasOwn(q,'at'),false,'at is not stored');
  // Identical to authoring the equivalent t directly.
  const direct=edit([{op:'opening.add',floorId:'floor_1',id:'d_north',value:{type:'door',wallId:'wall_2',t:.75,width:1,height:2.1}}]);
  assert.deepEqual(direct.building.floors[0].openings[0],o.d_north);
  console.log('PASS opening.add at: projects onto the host wall, independent of wall direction, matches explicit t');
}
{
  const placed=edit([add('d','wall_2',{x:0,z:-6})]).building;
  const moved=applyTransaction(placed,{version:1,operations:[{op:'opening.update',floorId:'floor_1',id:'d',value:{at:{x:-2,z:-6}}}]});
  assert.equal(moved.ok,true,JSON.stringify(moved.errors));assert.ok(Math.abs(moved.building.floors[0].openings[0].t-5/14)<1e-9,"t is rounded to 1e-9");
  const rehosted=applyTransaction(placed,{version:1,operations:[{op:'opening.update',floorId:'floor_1',id:'d',value:{wallId:'wall_3',at:{x:7,z:3}}}]});
  assert.equal(rehosted.ok,true,JSON.stringify(rehosted.errors));assert.deepEqual([rehosted.building.floors[0].openings[0].wallId,rehosted.building.floors[0].openings[0].t],['wall_3',.75]);
  console.log('PASS opening.update at: moves along the current host or a newly named host');
}
reject([add('d','wall_2',{x:0,z:-5})],/1 m from wall wall_2/);
reject([add('d','wall_2',{x:8,z:-6})],/projects outside wall wall_2/);
reject([add('d','wall_2',{x:0,z:-6},{t:.5})],/either t or at/);
reject([add('d','missing',{x:0,z:-6})],/Unknown host wall/);
reject([add('d','wall_2',{x:0})],/Unknown field|finite/);
reject([{op:'opening.add',floorId:'floor_1',id:'d',value:{type:'door',wallId:'wall_2',width:1,height:2}}],/Missing required field: t/);
console.log('PASS opening at rejections: off-wall, beyond ends, t+at, unknown host, malformed point, missing placement');
