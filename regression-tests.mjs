import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeEmptyBuilding, makeFarmhousePreset, makeFloor, addRoom, floorView, floorElevation, makeStair, stairFootprint, stairOpeningFootprint, makeManualSurface, exposedStructuralFloorRectangles, makeOmniLight } from './src/model.js';
import { buildSlabFaceMeshData, slabRectangles, buildExteriorMeshData, buildInteriorSplitMeshData, floorRectanglesForView, exportGodotFiles } from './src/exporter.js';
import { validateBuilding } from './src/validation.js';
import * as model from './src/model.js';
import { isExteriorWall } from './src/exporter.js';
import { normalizeBuilding as normalize } from './src/document.js';

let checks=0;
function test(name,fn){fn();checks++;console.log(`PASS ${name}`);}
const area=mesh=>{let total=0;for(let i=0;i<mesh.vertices.length;i+=3){const [a,b,c]=mesh.vertices.slice(i,i+3),u={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},v={x:c.x-a.x,y:c.y-a.y,z:c.z-a.z};total+=Math.hypot(u.y*v.z-u.z*v.y,u.z*v.x-u.x*v.z,u.x*v.y-u.y*v.x)/2;}return total;};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function twoStory(){const b=makeEmptyBuilding();b.roof.type='none';for(const f of [b.floors[0],makeFloor('Upper')]){if(!b.floors.includes(f))b.floors.push(f);addRoom(f,{x:-5,z:-5},{x:5,z:5});f.walls.push({id:`partition_${b.floors.indexOf(f)}`,role:'interior',a:{x:0,z:-5},b:{x:0,z:5}});}return b;}

test('crossing wall union has the analytic surface area, including rotated walls',()=>{
  for(const angle of [0,Math.PI/4,.31]){
    const b=makeEmptyBuilding();b.roof.type='none';b.wallHeight=3;b.wallThickness=.2;
    const rotate=(x,z)=>({x:x*Math.cos(angle)-z*Math.sin(angle),z:x*Math.sin(angle)+z*Math.cos(angle)});
    b.floors[0].walls=[{id:'a',role:'interior',a:rotate(-2,0),b:rotate(2,0)},{id:'b',role:'interior',a:rotate(0,-2),b:rotate(0,2)}];
    const before=structuredClone(b);
    const mesh=buildInteriorSplitMeshData(floorView(b,0));
    close(area(mesh.sideA)+area(mesh.sideB)+area(mesh.edges),51.12);
    assert.deepEqual(b,before,'logical wall identity is preserved');
    b.floors[0].walls.reverse();
    close(Object.values(buildInteriorSplitMeshData(floorView(b,0))).reduce((n,m)=>n+area(m),0),51.12);
  }
});
test('duplicate wall surfaces have one owner and T junction caps remain above half walls',()=>{
  const b=makeEmptyBuilding();b.roof.type='none';b.wallThickness=.2;b.wallHeight=3;
  const w={id:'a',role:'interior',a:{x:-2,z:0},b:{x:2,z:0}};
  b.floors[0].walls=[w,{...structuredClone(w),id:'b'}];
  close(Object.values(buildInteriorSplitMeshData(floorView(b,0))).reduce((n,m)=>n+area(m),0),26.8);
  b.floors[0].walls=[{...w,height:1},{id:'stem',role:'interior',a:{x:0,z:-2},b:{x:0,z:0}}];
  const edges=buildInteriorSplitMeshData(floorView(b,0)).edges;
  const cap={vertices:[]};
  for(let i=0;i<edges.vertices.length;i+=3){const tri=edges.vertices.slice(i,i+3);if(tri.every(p=>Math.abs(p.z)<1e-6&&p.y>=1-1e-6))cap.vertices.push(...tri);}
  close(area(cap),.4);
});
test('per-floor elevations, wall heights and slabs drive stair rise and export consistently',()=>{
  const b=twoStory();b.floors[0].elevation=-1;b.floors[0].wallHeight=3.5;b.floors[1].floorThickness=.3;b.floors[1].wallHeight=2.4;
  close(floorElevation(b,1),2.8);close(model.storyHeight(floorView(b,0)),3.8);
  close(floorView(b,1).wallHeight,2.4);close(floorView(b,1).storyFloorSkirt,.3);
  const t=exportGodotFiles(b).tscn;assert.match(t,/position = Vector3\(0, -1, 0\)/);assert.match(t,/position = Vector3\(0, 2.8, 0\)/);
  b.floors[1].elevation=2;assert.ok(validateBuilding(b).warnings.some(w=>/overlaps the preceding/.test(w.message)));
  b.floors[1].elevation=-1;assert.throws(()=>exportGodotFiles(b),/above the preceding/);
  b.floors[1].elevation='3';assert.throws(()=>exportGodotFiles(b),/finite number/);
});
test('deleting a top floor removes its incoming flight and preserves independent surfaces',()=>{
  const b=twoStory();b.floors[0].stairs.push(makeStair({x:2,z:3},{x:2,z:-3}));
  b.manualFloors.push(makeManualSurface({x:-5,z:-5},{x:5,z:5},'floor',floorElevation(b,1),.3));
  const surfaces=structuredClone(b.manualFloors),impact=model.removeTopFloor(b);
  assert.equal(impact.stairs,1);assert.equal(impact.surfaces,1);assert.equal(b.floors[0].stairs.length,0);assert.deepEqual(b.manualFloors,surfaces);
  assert.equal(model.removeTopFloor(b).removed,false);
});
test('open boundary intent suppresses only access warnings and never adds a wall',()=>{
  const b=twoStory();b.floors[0].walls.splice(0,1);
  assert.ok(validateBuilding(b).warnings.some(w=>/open ends/.test(w.message)));
  b.floors[0].boundaryMode='intentional_open';
  assert.ok(!validateBuilding(b).warnings.some(w=>/open ends/.test(w.message)));
  assert.ok(validateBuilding(b).warnings.some(w=>/rectangular bounds/.test(w.message)));
  b.floors[0].slabs.push({id:'explicit',minX:-5,maxX:5,minZ:-5,maxZ:5});
  assert.ok(!validateBuilding(b).warnings.some(w=>/rectangular bounds/.test(w.message)));
  const before=structuredClone(b);exportGodotFiles(b);assert.deepEqual(b,before);
});
test('empty named material slots are default; generic doors omit game interaction areas',()=>{
  const b=makeFarmhousePreset(),files=exportGodotFiles(b,{profile:'generic'});
  for(const t of [files.tscn,...files.doors.map(d=>d.tscn)]){
    assert.doesNotMatch(t,/StandardMaterial3D|"material":|material = SubResource|InteractionArea|DoorInteractionShape_GP|collision_layer = 4|collision_mask = 2/);
    assert.match(t,/"name":/);
  }
  assert.match(exportGodotFiles(b,{placeholderMaterials:true}).tscn,/StandardMaterial3D/);
  assert.match(exportGodotFiles(b,{profile:'get_probed'}).doors[0].tscn,/DoorInteractionShape_GP/);
});

test('union slabs omit internal edges and preserve hole boundary',()=>{
  const rects=slabRectangles({minX:-5,maxX:5,minZ:-5,maxZ:5,width:10,depth:10},[{minX:-1,maxX:1,minZ:-3,maxZ:3}]);
  const mesh=buildSlabFaceMeshData(rects,.2);
  close(area(mesh.top),88);close(area(mesh.bottom),88);close(area(mesh.edges),(40+16)*.2);
  const overlap=buildSlabFaceMeshData([{minX:0,maxX:2,minZ:0,maxZ:2},{minX:1,maxX:3,minZ:0,maxZ:2}],.2);
  close(area(overlap.top),6);close(area(overlap.edges),10*.2);
});
test('partial shared slab edges and L-shaped outlines',()=>{
  const m=buildSlabFaceMeshData([{minX:0,maxX:4,minZ:0,maxZ:2},{minX:1,maxX:3,minZ:2,maxZ:4}],.3);
  close(area(m.top),12);close(area(m.edges),16*.3);
});
test('all stair orientations meet landing while retaining side clearance',()=>{
  const b=twoStory(),upper=floorView(b,1);
  for(const [direction,x,z] of [['north',0,-3],['south',0,3],['east',3,0],['west',-3,0]]){
    const s=makeStair({x:0,z:0},{x,z},1.2),raw=stairFootprint(s),hole=stairOpeningFootprint(s);
    assert.equal(s.direction,direction);
    const key={north:'minZ',south:'maxZ',east:'maxX',west:'minX'}[direction];close(hole[key],raw[key]);
    const horizontal=['east','west'].includes(direction);close(horizontal?hole.minZ:hole.minX,(horizontal?raw.minZ:raw.minX)-.06);
    const landing={x:x+(direction==='east'?.001:direction==='west'?-.001:0),z:z+(direction==='south'?.001:direction==='north'?-.001:0)};
    assert.ok(floorRectanglesForView(upper,[s]).some(r=>landing.x>r.minX&&landing.x<r.maxX&&landing.z>r.minZ&&landing.z<r.maxZ));
  }
});
test('cardinal stair drag keeps the clicked lower centerline',()=>{const s=makeStair({x:1,z:2},{x:4,z:-4});close(s.x,1);close(s.z,-1);});
test('dual shells cover story band with stairs and auto floor disabled',()=>{
  const b=twoStory();b.floors[1].autoFloor=false;b.floors[0].stairs.push(makeStair({x:2,z:3},{x:2,z:-3}));
  const upper=floorView(b,1),ext=buildExteriorMeshData(upper),inside=buildInteriorSplitMeshData(upper);
  for(const mesh of [ext.outside,ext.inside,inside.sideA,inside.sideB])close(Math.min(...mesh.vertices.map(v=>v.y)),-b.floorThickness);
  const t=exportGodotFiles(b).tscn;
  for(const name of ['OutsideFaces','InsideFaces','SideAFaces','SideBFaces'])assert.match(t,new RegExp(`name="${name}" type="MeshInstance3D"`));
  assert.equal((t.match(/name="OutsideFaces"/g)||[]).length,2,'do not merge lighting instances across floors');
});
test('wall UVs are continuous across the story strip',()=>{
  const b=twoStory(),upper=buildExteriorMeshData(floorView(b,1));
  for(const mesh of [upper.outside,upper.inside])mesh.vertices.forEach((v,i)=>close(mesh.uvs[i].v,v.y+floorElevation(b,1)));
});
test('manual upper floor suppresses lower auto ceiling',()=>{
  const b=twoStory();b.floors.pop();b.manualFloors.push(makeManualSurface({x:-5,z:-5},{x:5,z:5},'floor',floorElevation(b,1),b.floorThickness));
  assert.equal(exposedStructuralFloorRectangles(b,0).length,0);
  assert.doesNotMatch(exportGodotFiles(b).tscn,/name="Ceiling" type="MeshInstance3D" parent="Floor_01\/Geometry"/);
});
test('generic profile and legacy override preserve custom light groups',()=>{
  const b=makeFarmhousePreset();b.floors[0].lights.push(makeOmniLight());
  const generic=exportGodotFiles(b,{profile:'generic',collision:true}).tscn;
  assert.match(generic,/groups=\["building_lights"\]/);assert.match(generic,/groups=\["sight_transparent"\]/);
  assert.doesNotMatch(generic,/paranormal_lights|scare_sight_transparent/);
  b.floors[0].lights[0].group='my_custom_lights';assert.match(exportGodotFiles(b,{profile:'generic'}).tscn,/my_custom_lights/);
  delete b.exportProfile;assert.match(exportGodotFiles(b).tscn,/scare_sight_transparent/);
  assert.equal(makeEmptyBuilding().exportProfile,'generic');
});
test('collision toggle includes separate door files',()=>{
  const f=exportGodotFiles(makeFarmhousePreset(),{collision:false,markers:false});
  for(const t of [f.tscn,...f.doors.map(d=>d.tscn)])assert.doesNotMatch(t,/type="(?:StaticBody3D|AnimatableBody3D|Area3D|CollisionShape3D)"/);
});
test('invalid dimensions, references and IDs are rejected without mutation',()=>{
  for(const mutate of [b=>b.wallThickness=-1,b=>b.wallHeight=Infinity,b=>b.floors[0].walls[0].a.x=NaN,b=>b.floors[0].openings[0].wallId='missing',b=>b.floors[0].walls[1].id=b.floors[0].walls[0].id,b=>b.roof.pitch=90,b=>b.floors[0].walls=null,b=>b.name=7]){
    const b=makeFarmhousePreset();mutate(b);const before=structuredClone(b);assert.throws(()=>exportGodotFiles(b));assert.deepEqual(b,before);
  }
});
test('topology and missing landing warnings do not forbid incomplete buildings',()=>{
  const b=twoStory();b.floors[0].walls.push({...structuredClone(b.floors[0].walls[0]),id:'duplicate_geometry'});
  b.floors[1].stairs.push(makeStair({x:20,z:0},{x:20,z:5}));
  const r=validateBuilding(b);assert.equal(r.errors.length,0);assert.ok(r.warnings.some(w=>w.message.includes('overlap')));assert.ok(r.warnings.some(w=>w.message.includes('no upper floor')));assert.ok(exportGodotFiles(b).warnings.length);
});

test('actual editor normalization preserves legacy surfaces, wall roles and profile',()=>{
  const b=makeFarmhousePreset(),f=b.floors[0];
  const legacy={...b,walls:f.walls,openings:f.openings,stairs:[],slabs:[{id:'legacy_slab',minX:-4,maxX:4,minZ:-4,maxZ:4}],platforms:[],railings:[],lights:[]};
  delete legacy.floors;delete legacy.exportProfile;
  for(const wall of legacy.walls)delete wall.role;
  for(const opening of legacy.openings)delete opening.id;
  const result=normalize(legacy);
  assert.equal(result.exportProfile,'get_probed');assert.equal(result.floors[0].slabs.length,1);
  assert.equal(result.floors[0].walls.filter(w=>w.role==='exterior').length,4);
  assert.ok(result.floors[0].openings.every(o=>typeof o.id==='string'));
  assert.equal(validateBuilding(result).errors.length,0);
  const minimal=normalize({walls:[],openings:[]});assert.equal(minimal.wallHeight,2.8);assert.equal(minimal.name,'New Building');
});

function verifyScene(filename){
  const t=fs.readFileSync(filename,'utf8');
  const subs=[...t.matchAll(/\[sub_resource [^\n]*id="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(subs.length,new Set(subs).size,`duplicate resources: ${filename}`);
  for(const m of t.matchAll(/SubResource\("([^"]+)"\)/g))assert.ok(subs.includes(m[1]),`missing ${m[1]}: ${filename}`);
  const ext=[...t.matchAll(/\[ext_resource [^\n]*path="([^"]+)"[^\n]*id="([^"]+)"/g)];
  for(const m of ext)assert.ok(fs.existsSync(path.resolve(path.dirname(filename),m[1])),`unresolved ${m[1]}`);
  for(const m of t.matchAll(/ExtResource\("([^"]+)"\)/g))assert.ok(ext.some(e=>e[2]===m[1]));
  const nodes=new Set();
  for(const m of t.matchAll(/\[node name="([^"]+)"[^\n]*\]/g)){
    const parent=/parent="([^"]+)"/.exec(m[0])?.[1];
    if(parent==null){assert.equal(nodes.size,0);nodes.add('.');continue;}
    assert.ok(nodes.has(parent),`missing node parent ${parent}: ${filename}`);
    const node=parent==='.'?m[1]:`${parent}/${m[1]}`;assert.ok(!nodes.has(node),`duplicate node ${node}`);nodes.add(node);
  }
  assert.doesNotMatch(t,/\b(?:NaN|Infinity)\b/);
}
test('all bundled TSCN resources and node parents resolve',()=>{
  const visit=dir=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory()&&!entry.name.startsWith('.'))visit(p);else if(p.endsWith('.tscn'))verifyScene(p);}};
  visit('.');
});
console.log(`${checks} regression groups passed.`);
