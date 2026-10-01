import assert from 'node:assert/strict';
import { snapPlanPoint, samePoint, wallSegmentProblem, wallJunctions } from './src/authoring.js';
import { makeEmptyBuilding, makeRegion, addRoom, floorView, structuralFloorRectangles, automaticRoofRectangles, automaticRoofSections, makeRectArea, makeFloor } from './src/model.js';
import { exportGodotFiles, floorRectanglesForView } from './src/exporter.js';
import { validateBuilding } from './src/validation.js';
import { Preview3D } from './src/preview.js';
let groups=0;
const test=(name,fn)=>{fn();groups++;console.log('PASS '+name);};
const wall=(a,b,id='wall')=>({id,a,b,role:'exterior'});
const area=rs=>rs.reduce((n,r)=>n+(r.maxX-r.minX)*(r.maxZ-r.minZ),0);
const includes=(rs,x,z)=>rs.some(r=>x>r.minX&&x<r.maxX&&z>r.minZ&&z<r.maxZ);
test('endpoint priority, wall projections, grid and zoom-invariant snapping',()=>{
  const walls=[wall({x:.13,z:.17},{x:4.13,z:.17})],before=structuredClone(walls);
  for(const scale of [12,55,180]){
    const hit=snapPlanPoint({x:.13+5/scale,z:.17+3/scale},walls,{scale});
    assert.equal(hit.kind,'endpoint');assert.deepEqual(hit.point,walls[0].a);
    const mid=snapPlanPoint({x:2,z:.17+4/scale},walls,{scale});
    assert.equal(mid.kind,'wall');assert.equal(mid.point.z,.17);
    assert.equal(snapPlanPoint({x:2,z:.17+11/scale},walls,{scale}).kind,'grid');
  }
  assert.deepEqual(snapPlanPoint({x:9.12,z:7.23},walls).point,{x:9,z:7});
  assert.deepEqual(snapPlanPoint({x:.2,z:.2},walls,{bypass:true}).point,{x:.2,z:.2});
  assert.equal(snapPlanPoint({x:0,z:0},walls,{enabled:false}).kind,'free');
  const diagonal=[wall({x:0,z:0},{x:4,z:4})];
  assert.ok(samePoint(snapPlanPoint({x:2.02,z:1.98},diagonal).point,{x:2,z:2}));
  assert.deepEqual(walls,before,'snapping must not split or mutate wall identity');
});
test('closure requires a real chain and rejects duplicate, partial overlap and zero segments',()=>{
  const origin={x:0,z:0},start={x:3,z:3};
  assert.equal(snapPlanPoint({x:.02,z:.03},[],{origin,start,segments:2}).kind,'close');
  assert.notEqual(snapPlanPoint({x:.02,z:.03},[],{origin,start,segments:1}).kind,'close');
  const walls=[wall({x:0,z:0},{x:3,z:0})];
  assert.ok(wallSegmentProblem(origin,origin,walls));
  assert.ok(wallSegmentProblem({x:3,z:0},origin,walls));
  assert.ok(wallSegmentProblem({x:1,z:0},{x:4,z:0},walls));
  assert.equal(wallSegmentProblem({x:3,z:0},{x:4,z:0},walls),null);
});
test('connection indicators distinguish open ends, joins and T junctions',()=>{
  const walls=[wall({x:0,z:0},{x:4,z:0}),wall({x:2,z:0},{x:2,z:3},'tee'),wall({x:4,z:0},{x:4,z:3},'corner')];
  const points=wallJunctions(walls);
  assert.equal(points.find(p=>samePoint(p.point,{x:2,z:0})).degree,3);
  assert.equal(points.find(p=>samePoint(p.point,{x:4,z:0})).kind,'joined');
  assert.equal(points.find(p=>samePoint(p.point,{x:0,z:0})).kind,'open');
  const crossing=wallJunctions([wall({x:-2,z:0},{x:2,z:0}),wall({x:0,z:-2},{x:0,z:2},'cross')]);
  assert.equal(crossing.find(p=>samePoint(p.point,{x:0,z:0})).degree,4);
});
test('label regions preserve exported geometry and retain safe metadata',()=>{
  const b=makeEmptyBuilding();addRoom(b.floors[0],{x:-5,z:-5},{x:5,z:5});
  const before=exportGodotFiles(b).tscn;
  b.floors[0].regions.push(makeRegion({x:40,z:40},{x:45,z:45},'Room "A"\\B\n日本語'));
  const after=exportGodotFiles(b).tscn;
  assert.equal(after.replace(/\nmetadata\/building_regions = [^\n]*/g,''),before);
  assert.match(after,/metadata\/building_regions/);
  assert.equal(area(structuralFloorRectangles(floorView(b,0))),100);
});
test('solid/void precedence, per-story isolation and full cutouts agree with preview/export',()=>{
  const b=makeEmptyBuilding(),f=b.floors[0];b.roof={type:'flat',overhang:0,pitch:35};
  f.regions.push(makeRegion({x:-5,z:-5},{x:5,z:5},'Envelope','wing','solid'),makeRegion({x:-1,z:-1},{x:1,z:1},'Court','courtyard','void'));
  let view=floorView(b,0);
  assert.equal(area(structuralFloorRectangles(view)),96);
  assert.equal(area(floorRectanglesForView(view)),96);
  assert.equal(area(automaticRoofRectangles(view)),96);
  assert.ok(!includes(automaticRoofSections(view),0,0));
  assert.match(exportGodotFiles(b).tscn,/name="FloorSlab"/,'wall-free solid regions must export');
  b.floors.push(makeFloor('Upper'));addRoom(b.floors[1],{x:-5,z:-5},{x:5,z:5});
  assert.equal(area(structuralFloorRectangles(floorView(b,1))),100,'cuts are not silently propagated');
  f.slabs.push(makeRectArea({x:-2,z:-2},{x:2,z:2}));
  assert.equal(area(structuralFloorRectangles(floorView(b,0))),12,'explicit footprint wins, then void applies');
  f.regions[1]=makeRegion({x:-10,z:-10},{x:10,z:10},'All void','courtyard','void');
  view=floorView(b,0);
  assert.deepEqual(floorRectanglesForView(view),[]);
  assert.deepEqual(automaticRoofSections(view),[]);
  b.floors.pop();
  assert.doesNotMatch(exportGodotFiles(b).tscn,/name="FloorSlab"|name="Ceiling"|name="Roof"/);
  const preview=Object.create(Preview3D.prototype);
  assert.deepEqual(preview.floorObjects(view,0,true,[],[],0),[]);
});
test('region validation rejects malformed data without mutation',()=>{
  for(const patch of [{minX:10,maxX:0},{kind:'invalid'},{effect:'invalid'},{minZ:'no'}]){
    const b=makeEmptyBuilding();b.floors[0].regions.push({...makeRegion({x:0,z:0},{x:2,z:2}),...patch});
    const before=structuredClone(b);assert.ok(validateBuilding(b).errors.length);assert.deepEqual(b,before);
  }
  const b=makeEmptyBuilding();b.floors[0].regions={};
  assert.ok(validateBuilding(b).errors.length);
});
console.log(groups+' authoring groups passed.');
{
  // Audit A5 (found via the browser suite): repeating the first click must close
  // a wall loop even when grid snapping moved the start farther than the pixel
  // radius. Grid 0.5 m at 40 px/m: the start (0, 0) came from a click at
  // (0.24, 0.24), about 13.6 px away, which snaps to the same grid point.
  const walls=[{id:'a',a:{x:0,z:0},b:{x:4,z:0}},{id:'b',a:{x:4,z:0},b:{x:4,z:4}},{id:'c',a:{x:4,z:4},b:{x:0,z:4}}];
  const opts={grid:.5,scale:40,radius:10,origin:{x:0,z:0},segments:3,start:{x:0,z:4}};
  assert.equal(snapPlanPoint({x:.24,z:.24},walls,opts).kind,'close','same grid point as the start closes the loop');
  assert.deepEqual(snapPlanPoint({x:.24,z:.24},walls,opts).point,{x:0,z:0});
  assert.notEqual(snapPlanPoint({x:.3,z:.3},walls,{...opts,segments:3}).kind,'close','a different grid point does not close');
  assert.equal(snapPlanPoint({x:.24,z:.24},walls,{...opts,segments:1}).kind==='close',false,'needs at least two segments first');
  console.log('PASS wall loop closing: the start grid point closes the loop beyond the pixel radius');
}
