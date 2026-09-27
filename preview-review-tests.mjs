import assert from 'node:assert/strict';
import fs from 'node:fs';
import { reviewScene, fitReviewCamera } from './src/preview-review.js';
import { Preview3D, previewObjectVertices } from './src/preview.js';
import { prepareDocument } from './src/diagnostics.js';
import { EXAMPLE_CATALOG } from './src/examples.js';
import { floorElevation, makeEmptyBuilding } from './src/model.js';

let floorCount=0;
for(const entry of EXAMPLE_CATALOG){
  const original=JSON.parse(fs.readFileSync(new URL(entry.file,import.meta.url),'utf8'));
  const b=prepareDocument(original).building,before=structuredClone(b);
  const full=reviewScene(b),roof=reviewScene(b,{view:'roofs'});
  assert.deepEqual(roof.objects,full.objects.filter(o=>o.category==='roof'),'Roof filtering retains clipped meshes and gable fills');
  for(let floor=1;floor<=b.floors.length;floor++){
    const scene=reviewScene(b,{view:'floor',floor});floorCount++;
    assert.ok(scene.objects.every(o=>o.category==='story'&&o.floorIndex===floor-1||o.category==='manual-floor'));
    assert.ok(scene.objects.every(o=>!['ceiling','roof','manual-ceiling'].includes(o.category)));
    const renderer=Object.assign(Object.create(Preview3D.prototype),{building:b,activeFloor:floor-1});
    // Exact object comparison includes floor holes and stairs generated with
    // the lower/upper stories present; source document slicing is forbidden.
    assert.deepEqual(scene.objects.filter(o=>o.category==='story'),renderer.objects().filter(o=>o.category==='story'&&o.floorIndex===floor-1));
    assert.equal(scene.summary.objectCount+scene.summary.hiddenObjectCount,renderer.objects().length);
    const fitted=fitReviewCamera([scene],{pitch:-1.1}),p=Object.assign(Object.create(Preview3D.prototype),fitted);
    for(const v of scene.objects.flatMap(previewObjectVertices)){
      const q=p.project(v,p.camera(),1100,760);assert.ok(q&&q.x>=131.9&&q.x<=968.1&&q.y>=91.1&&q.y<=668.9,'Fit retains 12% margins');
    }
  }
  assert.deepEqual(b,before,'Filtering/framing never changes source geometry or authorship');
}
console.log(`PASS ${EXAMPLE_CATALOG.length} examples and ${floorCount} floor cutaways: context, clipping, exact object filtering, framing and immutability`);

const empty=makeEmptyBuilding();empty.roof.type='none';
assert.equal(reviewScene(empty,{view:'roofs'}).summary.empty,true);
assert.ok(Number.isFinite(fitReviewCamera([reviewScene(empty)]).distance));
assert.throws(()=>reviewScene(empty,{floor:2}),/floor/);assert.throws(()=>reviewScene(empty,{view:'unknown'}),/view/);
const b=prepareDocument(JSON.parse(fs.readFileSync(new URL('examples/manual_upper_stairwell.building.json',import.meta.url),'utf8'))).building;
const y=floorElevation(b,1);
b.manualFloors.push({id:'offset-test',minX:50,maxX:53,minZ:20,maxZ:24,topY:y,thickness:.2});
b.manualFloors.push({id:'floating-test',minX:50,maxX:53,minZ:20,maxZ:24,topY:y+1,thickness:.2});
const upper=reviewScene(b,{view:'floor',floor:2});
assert.ok(upper.objects.some(o=>o.surfaceId==='offset-test'));assert.ok(!upper.objects.some(o=>o.surfaceId==='floating-test'));
const shifted=structuredClone(b);shifted.manualFloors[shifted.manualFloors.length-2].maxX=80;
const scenes=[upper,reviewScene(shifted,{view:'floor',floor:2})],camera=fitReviewCamera(scenes);
assert.ok(camera.bounds.max.x>=80,'Union framing includes independent surfaces in both versions');
assert.deepEqual(fitReviewCamera([...scenes].reverse()),camera,'Camera does not depend on panel order');
assert.equal(fitReviewCamera(scenes,{distance:42}).distance,42);
assert.equal(fitReviewCamera(scenes,{distance:42}).automaticDistance,false);
console.log('PASS empty views, invalid selectors, absolute manual floors, union framing and explicit distance override');
