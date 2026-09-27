import assert from 'node:assert/strict';
import {wallProfileFixture} from './qa/wall-profile-fixture.mjs';
import {wallTypeProblem,sampleWallType,wallTypePreset} from './src/wall-types.js';
import {floorView,makeEmptyBuilding} from './src/model.js';
import {buildProfileMeshData,exportGodotFiles,openingAnchor} from './src/exporter.js';
import {validateBuilding} from './src/validation.js';
import {createEditorHarness} from './qa/editor-harness.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z,sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z}),cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
function hit(meshes,start,direction){let nearest=Infinity;for(const mesh of Object.values(meshes))for(let i=0;i<mesh.vertices.length;i+=3){const [a,b,c]=mesh.vertices.slice(i,i+3),e1=sub(b,a),e2=sub(c,a),p=cross(direction,e2),det=dot(e1,p);if(Math.abs(det)<1e-9)continue;const t=sub(start,a),u=dot(t,p)/det;if(u< -1e-7||u>1+1e-7)continue;const q=cross(t,e1),v=dot(direction,q)/det;if(v< -1e-7||u+v>1+1e-7)continue;const distance=dot(e2,q)/det;if(distance>1e-6)nearest=Math.min(nearest,distance);}return nearest;}
const b=wallProfileFixture({allShaped:true,openings:false});assert.deepEqual(validateBuilding(b).errors,[]);
const meshes=buildProfileMeshData(floorView(b,0));
for(const mesh of Object.values(meshes))for(let i=0;i<mesh.vertices.length;i+=3){const [a,b,c]=mesh.vertices.slice(i,i+3);assert.ok([...Object.values(a),...Object.values(b),...Object.values(c)].every(Number.isFinite));assert.ok(dot(cross(sub(b,a),sub(c,a)),mesh.normals[i])< -1e-10,'Godot clockwise triangle');}
for(const y of [.001,.12,.447,.448,.7,1.4,2.24,2.5,2.799]){
 const {offset,thickness}=sampleWallType(b.wallTypes[0],y/2.8),outer=3-offset+thickness/2,inner=3-offset-thickness/2;
 for(const d of [{x:1,y:0,z:0},{x:-1,y:0,z:0},{x:0,y:0,z:1},{x:0,y:0,z:-1},{x:1,y:0,z:1},{x:-1,y:0,z:1}]){
  close(hit(meshes,{x:d.x*4,y,z:d.z*4},{x:-d.x,y:0,z:-d.z}),4-outer);close(hit(meshes,{x:0,y,z:0},d),inner);
 }
}
const reverse=structuredClone(b);reverse.floors[0].walls.reverse();for(const w of reverse.floors[0].walls)[w.a,w.b]=[w.b,w.a];const reversed=buildProfileMeshData(floorView(reverse,0));close(hit(reversed,{x:4,y:1.4,z:0},{x:-1,y:0,z:0}),1.26);
const mixed=wallProfileFixture();assert.deepEqual(validateBuilding(mixed).errors,[]);close(openingAnchor(floorView(mixed,0),mixed.floors[0].openings[1]).x,2.65);const before=JSON.stringify(mixed),files=exportGodotFiles(mixed);assert.equal(JSON.stringify(mixed),before);assert.match(files.tscn,/ShapedWallCollision/);assert.equal(files.doors.length,1);
for(const bad of [null,{id:'t',label:'T',stations:[]},{id:'t',label:'T',stations:[{height:0,offset:0,thickness:.1},{height:0,offset:1,thickness:.1}]}])assert.ok(wallTypeProblem(bad));
const bend=structuredClone(mixed);bend.floors[0].walls[0].wallTypeId='hull';assert.ok(validateBuilding(bend).errors.some(e=>/frames need/.test(e.message)));bend.floors[0].openings[0].doorStyle='empty';assert.deepEqual(validateBuilding(bend).errors,[]);
const corner=structuredClone(mixed);corner.floors[0].openings[1].t=.15;corner.floors[0].openings[1].width=1.2;assert.ok(validateBuilding(corner).errors.some(e=>/too close to a shaped/.test(e.message)));
const t=structuredClone(b);t.floors[0].walls.push({id:'branch',role:'interior',a:{x:0,z:-3},b:{x:0,z:0}});assert.deepEqual(validateBuilding(t).errors,[]);t.floors[0].walls.at(-1).b={x:2,z:-2.8};assert.ok(validateBuilding(t).errors.some(e=>/at least 30 degrees/.test(e.message)));
const gap=structuredClone(b),w=gap.floors[0].walls[0];w.b={x:0,z:-3};gap.floors[0].walls.push({id:'straight',role:'exterior',a:{x:0,z:-3},b:{x:3,z:-3}});assert.ok(validateBuilding(gap).errors.some(e=>/do not meet/.test(e.message)));gap.floors[0].walls.at(-1).wallTypeId='hull';assert.deepEqual(validateBuilding(gap).errors,[]);
console.log('PASS profile cross-sections: clockwise shells, nine heights, inward/outward rays, sealed corners, reversed endpoints, mixed Standard joins, shifted windows, opening and junction guards');
const e=await createEditorHarness();e.loadBuildingData(mixed);
const click=async id=>e.$(id).click(),change=async(id,value)=>{e.$(id).value=value;await e.$(id).dispatch('change');};
await change('#new-wall-type','hull');await click('#wall-types-btn');assert.equal(e.$('#wall-type-dialog').open,true);
const snapshot=e.snapshot();await change('#wall-type-preset','flare');await click('#wall-type-cancel');assert.deepEqual(e.snapshot(),snapshot);
await click('#wall-types-btn');await change('#wall-type-preset','flare');await click('#wall-type-save');assert.equal(e.$('#wall-type-dialog').open,false);close(e.snapshot().wallTypes[0].stations[1].offset,-.35);
await click('#undo-btn');assert.deepEqual(e.snapshot(),snapshot);
await click('#wall-types-btn');await click('#wall-type-delete');assert.equal(e.snapshot().floors[0].walls.some(w=>w.wallTypeId==='hull'),false);await click('#undo-btn');assert.deepEqual(e.snapshot(),snapshot);
await click('#wall-types-btn');await change('#wall-type-choice','');e.$('#wall-type-name').value='New taper';await e.$('#wall-type-name').dispatch('input');await change('#wall-type-preset','taper');await click('#wall-type-save');assert.equal(e.snapshot().wallTypes.length,3);assert.equal(e.snapshot().wallTypes[2].label,'New taper');assert.notEqual(e.snapshot().wallTypes[2].id,'new');
await click('#wall-types-btn');const undoBefore=e.snapshot();await e.window.dispatch('keydown',{key:'z',ctrlKey:true});assert.deepEqual(e.snapshot(),undoBefore);await click('#wall-type-cancel');
e.loadBuildingData(makeEmptyBuilding());await click('#wall-types-btn');await change('#wall-type-preset','hull');await click('#wall-type-save');const id=e.snapshot().wallTypes[0].id;
await e.$('[data-tool="room"]').click();const plan=e.$('#plan-canvas'),a=e.coordinates({x:-3,z:-3}),c=e.coordinates({x:3,z:3});await plan.dispatch('pointerdown',{clientX:a.x,clientY:a.y});await plan.dispatch('pointerup',{clientX:c.x,clientY:c.y});assert.equal(e.snapshot().floors[0].walls.length,4);assert.ok(e.snapshot().floors[0].walls.every(w=>w.wallTypeId===id));assert.equal(e.errors.length,0);
console.log('PASS wall dialog handlers: cancel, shared edits, presets, delete/reset, undo, new IDs, modal keyboard isolation and typed room drawing (DOM adapter, not browser layout)');

// Group assignment and per-wall direction use real selection events.
e.loadBuildingData(wallProfileFixture({allShaped:true,openings:false}));await e.$('[data-tool="select"]').click();
const pick=async(x,z,extra={})=>{const p=e.coordinates({x,z});for(const event of ['pointerdown','pointerup'])await plan.dispatch(event,{clientX:p.x,clientY:p.y,...extra});};
await pick(0,-3);await pick(3,0,{shiftKey:true});assert.equal(e.selections().length,2);await change('#new-wall-type','');await click('#apply-wall-type-btn');assert.equal(e.snapshot().floors[0].walls.filter(w=>!w.wallTypeId).length,2);await click('#undo-btn');assert.equal(e.snapshot().floors[0].walls.filter(w=>!w.wallTypeId).length,0);
e.chooseSelection({type:'wall',id:'wall_1'});let direction=e.$('#selection-form').children.find(n=>n.textContent.startsWith('Inward direction')).querySelector('select');direction.value='left';await direction.dispatch('change');assert.equal(e.snapshot().floors[0].walls[1].inwardSide,'left');await click('#undo-btn');
await change('#new-wall-type','hull');await click('#wall-types-btn');const original=e.snapshot();const offset=e.$('#wall-type-levels').querySelectorAll('input')[4];offset.value='oops';await offset.dispatch('change');await click('#wall-type-save');assert.equal(e.$('#wall-type-dialog').open,true);assert.deepEqual(e.snapshot(),original);await click('#wall-type-cancel');
await click('#wall-types-btn');const plot=e.$('#wall-type-preview'),level={clientX:(50+(.35+.45)*500/1.04)*1100/600,clientY:(44+.84*286)*2};await plot.dispatch('pointerdown',level);await plot.dispatch('pointermove',{...level,clientX:level.clientX+50,pointerId:2});await plot.dispatch('pointerup',{...level,pointerId:2});await plot.dispatch('pointermove',{...level,clientX:level.clientX+50});await plot.dispatch('pointerup',level);await click('#wall-type-save');assert.ok(e.snapshot().wallTypes[0].stations[1].offset>.39);await click('#undo-btn');assert.deepEqual(e.snapshot(),original);
assert.equal(e.errors.length,0);console.log('PASS grouped type application, inward flip/undo, invalid draft isolation and profile pointer ownership');
