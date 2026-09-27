import assert from 'node:assert/strict';
import { applyTransaction } from './src/transactions.js';
import { prepareDocument } from './src/diagnostics.js';
import { makeEmptyBuilding } from './src/model.js';
import { validateBuilding } from './src/validation.js';

// Exterior-boundary topology warnings on floors with explicit coverage only
// report genuinely free-standing ends; wall-loop floors keep the original rules.
const blank=(()=>{const b=makeEmptyBuilding();b.floors[0].id='floor_1';return prepareDocument(b).building;})();
const build=(ops,base=blank)=>{const r=applyTransaction(base,{version:1,operations:ops});assert.equal(r.errors.length,0,JSON.stringify(r.errors));return r.building;};
const wall=(id,a,b,extra={})=>({op:'wall.add',floorId:'floor_1',id,value:{a:{x:a[0],z:a[1]},b:{x:b[0],z:b[1]},role:'exterior',...extra}});
const messages=b=>validateBuilding(b).warnings.map(w=>w.message);
const loop=(p,x0,z0,x1,z1)=>[[x0,z0,x1,z0],[x1,z0,x1,z1],[x1,z1,x0,z1],[x0,z1,x0,z0]].map(([ax,az,bx,bz],i)=>wall(`${p}${i}`,[ax,az],[bx,bz]));
const solid=(id,minX,maxX,minZ,maxZ)=>({op:'region.add',floorId:'floor_1',id,value:{minX,maxX,minZ,maxZ,effect:'solid'}});

// A tower loop sharing a corner and a T-junction with a range room (branched graph).
const towerAndRange=[...loop('t',-4,-4,4,4),wall('r0',[4,-4],[14,-4]),wall('r1',[14,-4],[14,0]),wall('r2',[14,0],[4,0])];
{
  const wallsOnly=build(towerAndRange);
  assert.ok(messages(wallsOnly).some(m=>/branched/.test(m)),'wall-loop floors keep the branched warning');
  const withRegions=build([...towerAndRange,solid('c1',-4,4,-4,4),solid('c2',4,14,-4,0)]);
  assert.deepEqual(messages(withRegions).filter(m=>/branched|open ends|free-standing/.test(m)),[],'branches are expected with explicit coverage');
  console.log('PASS explicit coverage: tower/range branches no longer warn; wall-loop floors unchanged');
}
{
  // A parapet whose ends meet a wall midspan or stop at its face is joined; a free end is not.
  const base=[...loop('t',-4,-4,4,4),solid('c',-4,14,-4,4)];
  const midspan=build([...base,wall('p',[4,2],[12,2],{height:1})]);
  const face=build([...base,wall('p',[4.09,2],[12,2],{height:1})]);
  for(const b of [midspan,face])assert.ok(messages(b).some(m=>/free-standing ends \(p\)/.test(m)),'the far end at x=12 is still free');
  const joined=build([...base,wall('p',[4,2],[12,2],{height:1}),wall('q',[12,2],[12,-4],{height:1}),wall('s',[12,-4],[4.09,-4],{height:1})]);
  assert.deepEqual(messages(joined).filter(m=>/free-standing|open ends|branched/.test(m)),[],'midspan and face contacts count as joined');
  const warning=validateBuilding(midspan).warnings.find(w=>/free-standing/.test(w.message));
  assert.deepEqual(warning.targets,[{type:'wall',id:'p',floorId:'floor_1'}],'free walls are navigation targets');
  const intentional=build([{op:'floor.update',id:'floor_1',value:{boundaryMode:'intentional_open'}}],midspan);
  assert.deepEqual(messages(intentional).filter(m=>/free-standing/.test(m)),[],'intentional_open suppresses the warning');
  console.log('PASS free ends: midspan/face contacts join; free ends warn with wall targets; intentional_open accepted');
}
