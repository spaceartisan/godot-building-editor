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
{
  // Halcyon H1: two towers joined by bridge walls that end partway along the
  // towers' walls. The warning names each T and the host to split; following
  // that advice closes the outline with exact (not rectangular) coverage.
  const { inspectFloorCoverage } = await import('./src/diagnostics.js');
  const loop=(p,x0,z0,x1,z1)=>[[x0,z0,x1,z0],[x1,z0,x1,z1],[x1,z1,x0,z1],[x0,z1,x0,z0]].map(([a,b,c,d],i)=>wall(`${p}${i}`,[a,b],[c,d]));
  const bridged=build([...loop('west',-20,-6,-10,6),...loop('east',10,-6,20,6),wall('bridge_n',[-10,-1],[10,-1]),wall('bridge_s',[10,1],[-10,1])]);
  const open=validateBuilding(bridged).warnings.find(w=>/open ends/.test(w.message));
  assert.match(open.message,/bridge_n ends partway along west1 at \(-10, -1\); bridge_n ends partway along east3 at \(10, -1\)/);
  assert.match(open.message,/split the host wall there/);
  assert.deepEqual([...new Set(open.targets.map(t=>t.id))].sort(),open.targets.map(t=>t.id).sort(),'each wall is targeted once');
  assert.ok(Math.abs(inspectFloorCoverage(bridged,0).area-(40*12))<1e-6,'the unsplit plan falls back to the 40 x 12 m bounding rectangle');
  const interior=(id,a,b)=>wall(id,a,b,{role:'interior'});
  const split=build([wall('west0',[-20,-6],[-10,-6]),wall('w1a',[-10,-6],[-10,-1]),interior('w1m',[-10,-1],[-10,1]),wall('w1b',[-10,1],[-10,6]),wall('west2',[-10,6],[-20,6]),wall('west3',[-20,6],[-20,-6]),
    wall('east0',[10,-6],[20,-6]),wall('east1',[20,-6],[20,6]),wall('east2',[20,6],[10,6]),wall('e3a',[10,6],[10,1]),interior('e3m',[10,1],[10,-1]),wall('e3b',[10,-1],[10,-6]),wall('bridge_n',[-10,-1],[10,-1]),wall('bridge_s',[10,1],[-10,1])]);
  assert.deepEqual(messages(split),[]);assert.ok(Math.abs(inspectFloorCoverage(split,0).area-280)<1e-6,'split hosts give the dumbbell: 2 x 120 + 40 m²');
  console.log('PASS T-junction outlines: the open-ends warning names each T and its host; splitting the hosts closes the outline exactly');
}
{
  // Halcyon H13: far coordinates lose 32-bit float precision in Godot.
  const box=off=>build([wall('a',[off,0],[off+8,0]),wall('b',[off+8,0],[off+8,8]),wall('c',[off+8,8],[off,8]),wall('d',[off,8],[off,0])]);
  assert.deepEqual(messages(box(9000)).filter(m=>/32-bit/.test(m)),[],'within 10 km: no warning');
  assert.deepEqual(messages(box(100000)).filter(m=>/32-bit/.test(m)),["Building: plan coordinates reach 100,008 m from the origin, where Godot's 32-bit vertex positions round to 7.8 mm; author the building near the origin and position the scene in Godot instead"]);
  assert.match(messages(box(999000)).find(m=>/32-bit/.test(m)),/round to 6\.3 cm/);
  console.log('PASS far coordinates: a warning beyond 10 km gives the 32-bit float step');
}
{
  // Halcyon H14: a loop that stops just short of closing names the near miss.
  const gap=build([wall('a',[0,0],[8,0]),wall('b',[8,0],[8,8]),wall('c',[8,8],[0,8]),wall('d',[0,8],[0,0.001])]);
  const open=validateBuilding(gap).warnings.find(w=>/open ends/.test(w.message));
  assert.match(open.message,/a end A is 0\.001 m from d end B: move one endpoint onto the other/);
  assert.deepEqual(open.targets.map(t=>t.id).sort(),['a','d']);
  const fixed=build([{op:'wall.move-endpoint',floorId:'floor_1',id:'d',end:'b',point:{x:0,z:0}}],gap);
  assert.deepEqual(messages(fixed).filter(m=>/open ends/.test(m)),[],'following the advice closes the loop');
  console.log('PASS near-miss endpoints: the open-ends warning names ends within 5 cm and the fix');
}
