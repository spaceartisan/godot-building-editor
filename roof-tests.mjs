import assert from 'node:assert/strict';
import fs from 'node:fs';
import { roofBoxParts, roofInteriorBlockers, trimRoofBox } from './src/roof-geometry.js';
import { floorElevation, floorView, roofSectionsForFloor, makeEmptyBuilding, addRoom, makeFloor } from './src/model.js';
import { exportGodotFiles } from './src/exporter.js';
import { Preview3D } from './src/preview.js';

const close=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
function volume(faces){let v=0;for(const f of faces)for(let i=1;i<f.points.length-1;i++)v+=dot(f.points[0],cross(f.points[i],f.points[i+1]))/6;return v;}
const box={name:'Test',size:{x:2,y:2,z:2},pos:{x:0,y:0,z:0},rot:{}};
const block={minX:0,maxX:2,minY:-2,maxY:2,minZ:-2,maxZ:2};
close(volume(trimRoofBox(box,[block])),4);
close(volume(trimRoofBox(box,[{...block,minY:0,minZ:0}])),7);
close(volume(trimRoofBox(box,[block,{...block,minX:-2,maxX:2,minZ:0}])),2);
assert.equal(trimRoofBox(box,[{...block,minX:1}]),null,'Touching boundaries must not change the solid');
assert.deepEqual(trimRoofBox(box,[{...block,minX:-2}]),[]);
assert.equal(trimRoofBox(box,[]),null);
// Overlapping subtractors must not duplicate caps, and coincident roof faces
// must not leave an inverted duplicate skin.
close(volume(trimRoofBox(box,[block,{...block,minX:.5}])),4);
close(volume(trimRoofBox(box,[{...block,maxY:1}])),4);
console.log('PASS analytic solid subtraction, overlapping cuts, cap winding and tangencies');

for(const axis of ['x','z'])for(const angle of [-1.1,-.61,0,.61,1.1]){
  const part={...box,rot:{[axis]:angle}};
  // A centered plane bisects a centrally symmetric rotated box.
  close(volume(trimRoofBox(part,[block])),4);
}
console.log('PASS rotated solid clipping preserves the expected half-volume');

for(const name of ['farmhouse','twostory']){
  const b=JSON.parse(fs.readFileSync(`examples/${name}.building.json`)),before=structuredClone(b);
  const preview=Object.create(Preview3D.prototype);preview.building=b;preview.activeFloor=0;
  const objects=preview.objects();let changed=0;
  for(let i=0;i<b.floors.length;i++){
    const e=floorElevation(b,i),view=floorView(b,i);
    for(const [j,rs] of roofSectionsForFloor(b,i).entries()){
      const blockers=roofInteriorBlockers(b,rs,e+view.wallHeight);
      for(const part of roofBoxParts(rs,b.roof,e+view.wallHeight,j)){
        const faces=trimRoofBox(part,blockers),shown=objects.find(o=>o.roofFloor===i&&o.roofPart===part.name);
        if(faces===null){assert.deepEqual(shown.size,part.size);assert.deepEqual(shown.pos,part.pos);continue;}
        changed++;
        assert.ok(volume(faces)>0,'Trimmed roof must keep a closed outward boundary');
        assert.deepEqual(shown.mesh.vertices,faces.flatMap(f=>f.points),'Preview must use the same clipped solid');
        for(const f of faces){
          // Check vertices and dense barycentric samples, including cut edges.
          for(let k=1;k<f.points.length-1;k++)for(let a=0;a<=8;a++)for(let c=0;c<=8-a;c++){
            const weights=[a/8,c/8,1-(a+c)/8],tri=[f.points[0],f.points[k],f.points[k+1]];
            const p=Object.fromEntries(['x','y','z'].map(axis=>[axis,tri.reduce((s,v,n)=>s+v[axis]*weights[n],0)]));
            assert.ok(!blockers.some(r=>p.x>r.minX+1e-6&&p.x<r.maxX-1e-6&&p.z>r.minZ+1e-6&&p.z<r.maxZ-1e-6&&p.y>r.minY+1e-6&&p.y<r.maxY-1e-6),'Roof face remains inside a room volume');
          }
        }
      }
    }
  }
  assert.ok(changed>0,`${name} must exercise trimming`);
  const files=exportGodotFiles(b);assert.match(files.tscn,/ConcavePolygonShape3D/);
  assert.doesNotMatch(files.tscn,/StandardMaterial3D/);
  assert.doesNotMatch(exportGodotFiles(b,{collision:false}).tscn,/ConcavePolygonShape3D/);
  assert.deepEqual(b,before,'Export and preview must not rewrite authored data');
}
console.log('PASS supplied houses: interior clearance, preview parity, materials, collision toggle and immutable shells');

// Rotate the attached footprint around all four walls, using a tall host so
// flat, shed and gable roofs all intersect an actual room volume.
for(const type of ['flat','shed','gable'])for(const side of [-1,1])for(const axis of ['x','z']){
  const b=makeEmptyBuilding();b.wallHeight=3;b.floors.push(makeFloor('Upper'));
  for(const floor of b.floors)addRoom(floor,{x:-5,z:-5},{x:5,z:5});
  const rs={minX:-2,maxX:2,minZ:5,maxZ:7,type,direction:'x',baseY:3,pitch:35,overhang:.35};
  if(side<0){rs.minZ=-7;rs.maxZ=-5;}
  if(axis==='x'){[rs.minX,rs.minZ]=[rs.minZ,rs.minX];[rs.maxX,rs.maxZ]=[rs.maxZ,rs.maxX];rs.direction='z';}
  const blockers=roofInteriorBlockers(b,rs,3);let cuts=0;
  for(const part of roofBoxParts(rs,b.roof,3,0,true)){
    const faces=trimRoofBox(part,blockers);if(faces===null)continue;cuts++;
    for(const f of faces)for(const p of f.points){
      if(Math.abs(p[axis==='x'?'z':'x'])<4.9&&p.y<6.18-1e-6)assert.ok(side*p[axis]>=5.087999,'Attached roof must stop within outer wall thickness');
    }
  }
  assert.ok(cuts>0,`${type} ${axis} ${side} did not trim`);
}
console.log('PASS flat, shed and gable attachments on all four sides of a taller host');

const detached={minX:20,maxX:24,minZ:20,maxZ:22,type:'gable',direction:'x',pitch:35,overhang:.35};
const b=makeEmptyBuilding();addRoom(b.floors[0],{x:-5,z:-5},{x:5,z:5});
for(const part of roofBoxParts(detached,b.roof,3))assert.equal(trimRoofBox(part,roofInteriorBlockers(b,detached,3)),null);
console.log('PASS detached roofs and exposed overhangs stay unchanged');
