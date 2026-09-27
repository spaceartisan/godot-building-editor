import assert from 'node:assert/strict';
import {angledProfileJunctionFixture,angledProfileJunctionExample} from './qa/angled-junction-fixture.mjs';
import {floorView} from './src/model.js';
import {sampleWallType} from './src/wall-types.js';
import {buildProfileMeshData,exportGodotFiles} from './src/exporter.js';
import {validateBuilding} from './src/validation.js';
import {createEditorHarness} from './qa/editor-harness.mjs';
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z,sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z}),cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
function hit(meshes,start,direction){let nearest=Infinity;for(const mesh of Object.values(meshes))for(let i=0;i<mesh.vertices.length;i+=3){const [a,b,c]=mesh.vertices.slice(i,i+3),e1=sub(b,a),e2=sub(c,a),p=cross(direction,e2),det=dot(e1,p);if(Math.abs(det)<1e-9)continue;const t=sub(start,a),u=dot(t,p)/det;if(u< -1e-7||u>1+1e-7)continue;const q=cross(t,e1),v=dot(direction,q)/det;if(v< -1e-7||u+v>1+1e-7)continue;const distance=dot(e2,q)/det;if(distance>1e-6)nearest=Math.min(nearest,distance);}return nearest;}
let count=0;
for(const angle of [30,45,60])for(const split of [false,true])for(const rotation of [0,.61]){
 const b=angledProfileJunctionFixture(angle,split),theta=angle*Math.PI/180,d={x:Math.sin(theta),y:0,z:Math.cos(theta)},m={x:-d.z,y:0,z:d.x},cot=d.z/d.x,c=Math.cos(rotation),s=Math.sin(rotation),rotate=p=>({x:p.x*c-p.z*s,y:p.y||0,z:p.x*s+p.z*c});
 for(const w of b.floors[0].walls){w.a=rotate(w.a);w.b=rotate(w.b);if(rotation)[w.a,w.b]=[w.b,w.a];}if(rotation)b.floors[0].walls.reverse();assert.deepEqual(validateBuilding(b).errors,[]);
 const meshes=buildProfileMeshData(floorView(b,0)),check=(p,d,expected)=>{const result=hit(meshes,rotate(p),rotate(d));if(expected===Infinity)assert.equal(result,Infinity);else close(result,expected);count++;};
 for(const y of [.02,.3,.448,.56,1.4,2.24,2.5,2.78]){
  const east=3-sampleWallType(b.wallTypes[0],y/2.8).offset,west=-3+sampleWallType(b.wallTypes[1],y/2.8).offset;
  check({x:0,y,z:0},d,(east+.09)/d.x);check({x:0,y,z:0},{x:-d.x,y:0,z:-d.z},(-west+.09)/d.x);
  const a={x:east-.3,y,z:(east-.3)*cot},z={x:west+.3,y,z:(west+.3)*cot};
  check({x:a.x+m.x,y,z:a.z+m.z},{x:-m.x,y:0,z:-m.z},.91);check({x:z.x-m.x,y,z:z.z-m.z},m,.91);
  check({x:east+.2,y,z:0},{x:0,y:0,z:1},Infinity);
 }
 check({x:0,y:.1,z:0},{x:0,y:1,z:0},2.7);
 for(const mesh of Object.values(meshes))for(let i=0;i<mesh.vertices.length;i+=3){const [a,b,c]=mesh.vertices.slice(i,i+3);assert.ok([a,b,c].every(p=>Object.values(p).every(Number.isFinite)));assert.ok(dot(cross(sub(b,a),sub(c,a)),mesh.normals[i])< -1e-10);}
}
const bad=angledProfileJunctionFixture(29);assert.ok(validateBuilding(bad).errors.some(e=>/at least 30/.test(e.message)));
for(const split of [false,true]){
 const b=angledProfileJunctionFixture(30,split),host=b.floors[0].walls.find(w=>w.id===(split?'wall_1_tail':'wall_1')),target=b.floors[0].walls.find(w=>w.id==='partition').b.z+.8;
 b.floors[0].openings.push({id:'near',wallId:host.id,type:'door',t:(target-host.a.z)/(host.b.z-host.a.z),width:.3,height:2,doorStyle:'empty'});assert.ok(validateBuilding(b).errors.some(e=>/host opening/.test(e.message)));
}
const opening=angledProfileJunctionFixture(30),branch=opening.floors[0].walls.at(-1),length=Math.hypot(branch.b.x-branch.a.x,branch.b.z-branch.a.z);opening.floors[0].openings.push({id:'near',wallId:'partition',type:'door',t:1.3/length,width:1,height:2,doorStyle:'empty'});assert.ok(validateBuilding(opening).errors.some(e=>/fitted end/.test(e.message)));
const frame=angledProfileJunctionFixture(45);frame.floors[0].walls.at(-1).height=1.2;frame.floors[0].openings.push({id:'above',wallId:'wall_1',type:'window',t:2/3,width:.5,height:.5,sill:1.25,windowStyle:'plain'});assert.ok(validateBuilding(frame).errors.some(e=>/host opening and its frame/.test(e.message)));frame.floors[0].openings[0].sill=1.4;assert.deepEqual(validateBuilding(frame).errors,[]);
const collapse=angledProfileJunctionFixture();for(const t of collapse.wallTypes)for(const p of t.stations){p.offset=0;p.thickness=.02;}const dx=3*Math.sqrt(3)/2,dz=1.5;collapse.floors[0].walls=[{id:'a',role:'interior',wallTypeId:'hull',a:{x:-dx,z:-dz},b:{x:dx,z:dz}},{id:'b',role:'interior',wallTypeId:'hull',a:{x:.2-dx,z:dz},b:{x:.2+dx,z:-dz}},{id:'short',role:'interior',a:{x:0,z:0},b:{x:.2,z:0}}];assert.ok(validateBuilding(collapse).errors.some(e=>/fitted ends collapse/.test(e.message)));
const example=angledProfileJunctionExample(),before=JSON.stringify(example);assert.deepEqual(validateBuilding(example),{errors:[],warnings:[]});const files=exportGodotFiles(example);assert.equal(JSON.stringify(example),before);for(const name of ['OutsideFaces','InsideFaces','SideAFaces','SideBFaces','EdgeFaces'])assert.ok(files.tscn.includes(name));
const e=await createEditorHarness(),drawing=angledProfileJunctionFixture(45,true),endpoints=drawing.floors[0].walls.at(-1);drawing.floors[0].walls.pop();e.loadBuildingData(structuredClone(drawing));
for(const [id,value] of [['#new-wall-type',''],['#new-wall-role','interior']]){e.$(id).value=value;await e.$(id).dispatch('change');}await e.$('[data-tool="wall"]').click();for(const point of [endpoints.a,endpoints.b]){const p=e.coordinates(point);for(const event of ['pointerdown','pointerup'])await e.$('#plan-canvas').dispatch(event,{clientX:p.x,clientY:p.y});}await e.window.dispatch('keydown',{key:'Escape'});assert.equal(e.snapshot().floors[0].walls.length,7);assert.deepEqual(validateBuilding(e.snapshot()).errors,[]);await e.$('#undo-btn').click();assert.deepEqual(e.snapshot(),drawing);assert.deepEqual(e.errors,[]);
console.log(`PASS angled junctions: ${count} rays across 30/45/60-degree continuous/split/rotated/reversed variants, winding, swept clearance, full-width collapse, shells and web drawing/undo`);
