import assert from 'node:assert/strict';
import { storyCeilingRectangles, exportGodotFiles } from './src/exporter.js';
import { applyTransaction } from './src/transactions.js';
import { prepareDocument } from './src/diagnostics.js';
import { makeEmptyBuilding } from './src/model.js';
import { areaSize } from './src/polygon-areas.js';

// Kestrel K2: automatic ceilings hang inside the story over the whole footprint,
// including under the next floor's slab, so a room's ceiling height does not
// step 0.12 m where an upper story is smaller. Stair openings stay open.
const blank=(()=>{const b=makeEmptyBuilding();b.floors[0].id='floor_1';return prepareDocument(b).building;})();
const tx=(ops,base=blank)=>{const r=applyTransaction(base,{version:1,operations:ops});assert.equal(r.ok,true,JSON.stringify(r.errors));return r.building;};
const loop=(floorId,p,x0,z0,x1,z1)=>[[x0,z0,x1,z0],[x1,z0,x1,z1],[x1,z1,x0,z1],[x0,z1,x0,z0]].map(([a,b,c,d],i)=>({op:'wall.add',floorId,id:`${p}${i}`,value:{a:{x:a,z:b},b:{x:c,z:d},role:'exterior'}}));
const area=rects=>rects.reduce((s,r)=>s+areaSize(r),0);
// 12 x 8 lower story; the upper story covers only its west 6 x 8 half.
const base=tx([{op:'building.update',value:{roof:{type:'flat'}}},...loop('floor_1','l',-6,-4,6,4),{op:'floor.add-top',id:'up',aboveFloorId:'floor_1'},...loop('up','u',-6,-4,0,4)]);
{
  assert.ok(Math.abs(area(storyCeilingRectangles(base,0))-96)<1e-6,'whole lower footprint gets a ceiling, covered half included');
  // The exported ceiling mesh spans the full footprint at wall top − thickness.
  const scene=exportGodotFiles(base).tscn,mesh=/\[sub_resource type="ArrayMesh" id="F01_CeilingMesh"\][\s\S]*?"aabb": AABB\(([^)]*)\)/.exec(scene)[1].split(',').map(Number);
  assert.deepEqual(mesh.map(v=>Math.round(v*1000)/1000),[-6,2.68,-4,12,0,8],'one flat ceiling underside at 2.68 m (2.8 − 0.12) across both halves');
  console.log('PASS uniform ceiling: covered and exposed areas share one ceiling height');
}
{
  // A stair from the lower story cuts both the upper slab and the hung ceiling.
  const withStair=tx([{op:'stair.add',floorId:'floor_1',id:'s',value:{x:-3,z:0,width:1.2,run:4,direction:'north'}}],base);
  const hole=96-area(storyCeilingRectangles(withStair,0));
  assert.ok(hole>4.8&&hole<6,`stair opening stays open through the ceiling (${hole.toFixed(2)} m²)`);
  // A void region upstairs removes that floor's slab; as before, the story
  // below treats the spot as exposed and closes it with its ceiling (and roof).
  const withVoid=tx([{op:'region.add',floorId:'up',id:'v',value:{minX:-5,maxX:-3,minZ:-3,maxZ:-1,effect:'void'}}],base);
  assert.ok(Math.abs(area(storyCeilingRectangles(withVoid,0))-96)<1e-6,'void region above keeps the established exposed-area ceiling');
  // An upper floor with its automatic floor switched off leaves the story open to it.
  const noFloor=tx([{op:'floor.update',id:'up',value:{autoFloor:false}}],base);
  assert.ok(Math.abs(area(storyCeilingRectangles(noFloor,0))-48)<1e-6,'only the uncovered half gets a ceiling when the upper floor has no slab');
  console.log('PASS ceiling openings: stair openings and slab-less upper floors stay open; voids above keep their ceiling');
}
