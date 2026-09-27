import assert from 'node:assert/strict';
import {profileJunctionFixture,profileJunctionExample,splitProfileJunctionFixture} from './qa/profile-junction-fixture.mjs';
import {floorView} from './src/model.js';
import {sampleWallType} from './src/wall-types.js';
import {buildProfileMeshData,exportGodotFiles} from './src/exporter.js';
import {validateBuilding} from './src/validation.js';
import {Preview3D} from './src/preview.js';
import {createEditorHarness} from './qa/editor-harness.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`),dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z,sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z}),cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
function hit(meshes,start,direction){let nearest=Infinity;for(const mesh of Object.values(meshes))for(let i=0;i<mesh.vertices.length;i+=3){const [a,b,c]=mesh.vertices.slice(i,i+3),e1=sub(b,a),e2=sub(c,a),p=cross(direction,e2),det=dot(e1,p);if(Math.abs(det)<1e-9)continue;const t=sub(start,a),u=dot(t,p)/det;if(u< -1e-7||u>1+1e-7)continue;const q=cross(t,e1),v=dot(direction,q)/det;if(v< -1e-7||u+v>1+1e-7)continue;const distance=dot(e2,q)/det;if(distance>1e-6)nearest=Math.min(nearest,distance);}return nearest;}
let rays=0;
for(const split of [false,true])for(const angle of [0,.61])for(const reverse of [false,true]){
 const b=split?splitProfileJunctionFixture():profileJunctionFixture(),c=Math.cos(angle),s=Math.sin(angle),rotate=p=>({x:p.x*c-p.z*s,y:p.y||0,z:p.x*s+p.z*c});
 for(const w of b.floors[0].walls){w.a=rotate(w.a);w.b=rotate(w.b);if(reverse)[w.a,w.b]=[w.b,w.a];}if(reverse)b.floors[0].walls.reverse();
 assert.deepEqual(validateBuilding(b).errors,[]);const meshes=buildProfileMeshData(floorView(b,0));
 const check=(p,d,value)=>{close(hit(meshes,rotate(p),rotate(d)),value);rays++;};
 for(const y of [.02,.3,.448,.56,1.4,2.24,2.5,2.78]){
  const hull=sampleWallType(b.wallTypes[0],y/2.8),flare=sampleWallType(b.wallTypes[1],y/2.8),eastCenter=3-hull.offset,westCenter=-3+flare.offset;
  // Inside the union, the end caps and buried host faces must be absent.
  check({x:0,y,z:0},{x:1,y:0,z:0},eastCenter+.09);check({x:0,y,z:0},{x:-1,y:0,z:0},-westCenter+.09);
  check({x:eastCenter-.2,y,z:1},{x:0,y:0,z:-1},.91);check({x:westCenter+.2,y,z:-1},{x:0,y:0,z:1},.91);
  check({x:0,y,z:.3},{x:1,y:0,z:0},eastCenter-.09);check({x:0,y,z:.3},{x:-1,y:0,z:0},-westCenter-.09);
 }
 close(hit(meshes,rotate({x:0,y:.1,z:0}),{x:0,y:1,z:0}),2.7); // No internal band faces.
 for(const mesh of Object.values(meshes))for(let i=0;i<mesh.vertices.length;i+=3){const [a,b,c]=mesh.vertices.slice(i,i+3);assert.ok(dot(cross(sub(b,a),sub(c,a)),mesh.normals[i])< -1e-10,'Clockwise nondegenerate faces');}
}
const base=profileJunctionFixture(),expectError=(mutate,pattern)=>{const b=structuredClone(base);mutate(b);assert.ok(validateBuilding(b).errors.some(e=>pattern.test(e.message)),JSON.stringify(validateBuilding(b)));};
const splitBase=splitProfileJunctionFixture(),splitError=(mutate,pattern)=>{const b=structuredClone(splitBase);mutate(b);assert.ok(validateBuilding(b).errors.some(e=>pattern.test(e.message)),JSON.stringify(validateBuilding(b)));};
splitError(b=>b.floors[0].walls.find(w=>w.id==='wall_1_tail').wallTypeId='flare',/matching physical offsets/);
splitError(b=>b.floors[0].walls.find(w=>w.id==='wall_1_tail').height=2.7,/matching heights/);
splitError(b=>b.floors[0].walls.find(w=>w.id==='wall_1_tail').b.x+=.4,/opposite directions/);
splitError(b=>b.floors[0].walls.find(w=>w.id==='wall_1_tail').inwardSide='left',/matching physical offsets/);
splitError(b=>{const type=structuredClone(b.wallTypes[0]);type.id='wide';type.stations[1].thickness=.3;b.wallTypes.push(type);b.floors[0].walls.find(w=>w.id==='wall_1_tail').wallTypeId=type.id;},/matching physical offsets and thickness/);
splitError(b=>b.floors[0].walls.push({id:'extra',role:'interior',a:{x:3,z:0},b:{x:4,z:0}}),/additional branches/);
for(const [wallId,t] of [['wall_1',.9],['wall_1_tail',.1]])splitError(b=>b.floors[0].openings.push({id:'blocked',wallId,type:'door',t,width:.5,height:2,doorStyle:'room'}),/host opening/);
const alternate=structuredClone(splitBase),copy=structuredClone(alternate.wallTypes[0]);copy.id='equivalent';copy.stations.splice(2,0,{height:.5,offset:.35,thickness:.18});alternate.wallTypes.push(copy);alternate.floors[0].walls.find(w=>w.id==='wall_1_tail').wallTypeId=copy.id;assert.deepEqual(validateBuilding(alternate).errors,[]);
const oneReversed=structuredClone(splitBase),tail=oneReversed.floors[0].walls.find(w=>w.id==='wall_1_tail');[tail.a,tail.b]=[tail.b,tail.a];assert.deepEqual(validateBuilding(oneReversed).errors,[]);
const flipped=structuredClone(splitBase),mirror=structuredClone(flipped.wallTypes[0]);mirror.id='mirror';for(const p of mirror.stations)p.offset=-p.offset;flipped.wallTypes.push(mirror);Object.assign(flipped.floors[0].walls.find(w=>w.id==='wall_1_tail'),{wallTypeId:mirror.id,inwardSide:'left'});assert.deepEqual(validateBuilding(flipped).errors,[]);
const area=mesh=>{let total=0;for(let i=0;i<mesh.vertices.length;i+=3){const [a,b,c]=mesh.vertices.slice(i,i+3),n=cross(sub(b,a),sub(c,a));total+=Math.hypot(n.x,n.y,n.z)/2;}return total;};
const unsplitMeshes=buildProfileMeshData(floorView(base,0));for(const b of [splitBase,alternate,oneReversed,flipped])for(const [key,mesh] of Object.entries(buildProfileMeshData(floorView(b,0))))close(area(mesh),area(unsplitMeshes[key]));
expectError(b=>b.floors[0].walls.at(-1).b={x:-2.8,z:2},/at least 30 degrees/);
expectError(b=>b.floors[0].walls[1].height=1.5,/at least as tall/);
expectError(b=>b.floors[0].walls.at(-1).wallTypeId='hull',/shaped branch|Shaped wall ends/);
expectError(b=>b.floors[0].walls.at(-1).a.z=b.floors[0].walls.at(-1).b.z=2.8,/host's/);
expectError(b=>b.floors[0].openings.push({id:'blocked',wallId:'wall_1',type:'door',t:.5,width:1,height:2,doorStyle:'empty'}),/host opening/);
expectError(b=>b.floors[0].openings.push({id:'blocked',wallId:'partition',type:'door',t:.91,width:.8,height:2,doorStyle:'empty'}),/farther from its fitted end/);
const short=structuredClone(base);short.floors[0].walls.at(-1).height=1.2;assert.deepEqual(validateBuilding(short).errors,[]);
expectError(b=>{b.floors[0].walls=b.floors[0].walls.filter(w=>['wall_1','wall_3','partition'].includes(w.id));for(const w of b.floors[0].walls){for(const p of [w.a,w.b])p.x=Math.sign(p.x)*.2;if(w.id==='wall_3')w.wallTypeId='hull';}},/fitted ends collapse/);
const example=profileJunctionExample(),before=JSON.stringify(example);assert.deepEqual(validateBuilding(example),{errors:[],warnings:[]});const files=exportGodotFiles(example);assert.equal(JSON.stringify(example),before);for(const shell of ['OutsideFaces','InsideFaces','SideAFaces','SideBFaces','EdgeFaces'])assert.ok(files.tscn.includes(shell));assert.doesNotMatch(files.tscn,/StandardMaterial3D/);
const p=Object.create(Preview3D.prototype);p.building=base;p.activeFloor=0;assert.ok(p.objects().length);
// Web loads and exports through the same validator; a profile edit is one undo.
const e=await createEditorHarness();e.loadBuildingData(structuredClone(example));assert.equal(e.snapshot().floors[0].walls.length,6);assert.deepEqual(validateBuilding(e.snapshot()).errors,[]);
await e.$('#wall-types-btn').click();e.$('#wall-type-choice').value='hull';await e.$('#wall-type-choice').dispatch('change');e.$('#wall-type-preset').value='flare';await e.$('#wall-type-preset').dispatch('change');await e.$('#wall-type-save').click();assert.deepEqual(validateBuilding(e.snapshot()).errors,[]);await e.$('#undo-btn').click();assert.deepEqual(e.snapshot(),example);assert.deepEqual(e.errors,[]);
const drawing=splitProfileJunctionFixture();drawing.floors[0].walls.pop();e.loadBuildingData(structuredClone(drawing));
for(const [id,value] of [['#new-wall-type',''],['#new-wall-role','interior']]){e.$(id).value=value;await e.$(id).dispatch('change');}
await e.$('[data-tool="wall"]').click();const plan=e.$('#plan-canvas');for(const point of [{x:-3,z:0},{x:3,z:0}]){const p=e.coordinates(point);for(const event of ['pointerdown','pointerup'])await plan.dispatch(event,{clientX:p.x,clientY:p.y});}
await e.window.dispatch('keydown',{key:'Escape'});assert.equal(e.snapshot().floors[0].walls.length,7);assert.deepEqual(validateBuilding(e.snapshot()).errors,[]);await e.$('#undo-btn').click();assert.deepEqual(e.snapshot(),drawing);
console.log(`PASS fitted Standard junctions: ${rays} mesh rays, split/unsplit shell areas, eight heights, rotations and reversed endpoints, clean union bands, clearance/profile guards, passage example and web drawing/edit/undo`);
