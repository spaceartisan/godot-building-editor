import {applyTransaction} from './src/transactions.js';
import assert from 'node:assert/strict';
import {openingShapeFixture,customDoorwayExample} from './qa/opening-shape-fixture.mjs';
import {openingShapePreset,openingShapeProblem,openingOutline,shapedDoorLayout} from './src/opening-shapes.js';
import {pointInRegion,regionInteriorClearance} from './src/regions.js';
import {floorView} from './src/model.js';
import {buildProfileMeshData,buildDoorMeshData,exportGodotFiles,exportDoorTscn} from './src/exporter.js';
import {validateBuilding} from './src/validation.js';
import {normalizeBuilding} from './src/document.js';
import {createEditorHarness} from './qa/editor-harness.mjs';
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z,sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z}),cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
function hit(meshes,start,direction){let nearest=Infinity;for(const mesh of Object.values(meshes))for(let i=0;i<mesh.vertices.length;i+=3){const [a,b,c]=mesh.vertices.slice(i,i+3),e1=sub(b,a),e2=sub(c,a),p=cross(direction,e2),det=dot(e1,p);if(Math.abs(det)<1e-9)continue;const t=sub(start,a),u=dot(t,p)/det;if(u< -1e-7||u>1+1e-7)continue;const q=cross(t,e1),v=dot(direction,q)/det;if(v< -1e-7||u+v>1+1e-7)continue;const distance=dot(e2,q)/det;if(distance>1e-6)nearest=Math.min(nearest,distance);}return nearest;}

let count=0;
const notched=[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:.7,y:1},{x:.7,y:.8},{x:.3,y:.8},{x:.3,y:1},{x:0,y:1}];
for(const preset of ['clipped','arch','notched'])for(const shaped of [false,true])for(const angle of [0,.63]){
  const b=openingShapeFixture({preset,shaped,angle,reversed:!!angle});if(preset==='notched')b.openingShapes[0].points=notched;
  assert.deepEqual(validateBuilding(b).errors,[]);const view=floorView(b,0),mesh=buildProfileMeshData(view),o=b.floors[0].openings[0],poly={polygon:openingOutline(b,o)};
  const rotate=p=>({x:p.x*Math.cos(angle)-p.z*Math.sin(angle),y:p.y,z:p.x*Math.sin(angle)+p.z*Math.cos(angle)});
  for(let x=-1.65;x<1.7;x+=.19)for(let y=.07;y<2.64;y+=.17){
    const localX=angle?-x:x;if(regionInteriorClearance(poly,{x:localX,z:y})<.015)continue;
    const expected=!(y<o.height&&pointInRegion(poly,{x:localX,z:y}));
    const distance=hit(mesh,rotate({x,y,z:-4}),rotate({x:0,y:0,z:1}));
    assert.equal(distance<2,expected,`${preset}/${shaped}/${angle} at ${x},${y}`);count++;
  }
  for(const m of Object.values(mesh))for(let i=0;i<m.vertices.length;i+=3){const [a,c,d]=m.vertices.slice(i,i+3);assert.ok(Object.values(a).every(Number.isFinite));assert.ok(dot(cross(sub(c,a),sub(d,a)),m.normals[i])< -1e-10);}
}
for(const preset of ['clipped','arch','notched']){
  const b=openingShapeFixture({preset,style:'room'});if(preset==='notched')b.openingShapes[0].points=notched;
  assert.deepEqual(validateBuilding(b).errors,[]);const o=b.floors[0].openings[0],m=buildDoorMeshData(floorView(b,0),o),layout=shapedDoorLayout(b,o),poly={polygon:layout.panel};
  for(let x=-1.5;x<1.51;x+=.13)for(let y=.03;y<2.5;y+=.13){if(regionInteriorClearance(poly,{x,z:y})<.015)continue;assert.equal(hit({panel:m.panel},{x,y:y-o.height/2,z:-1},{x:0,y:0,z:1})<2,pointInRegion(poly,{x,z:y}),`Panel ${preset} at ${x},${y}`);count++;}
  assert.equal(hit({frame:m.frame},{x:0,y:.01-o.height/2,z:-1},{x:0,y:0,z:1}),Infinity,'no threshold across passage');
  const scene=exportDoorTscn(floorView(b,0),o);assert.match(scene,/ConvexPolygonShape3D/);assert.match(scene,/name="Panel"/);assert.doesNotMatch(scene,/material = SubResource/);
  const visual=exportDoorTscn(floorView(b,0),o,{collision:false});assert.doesNotMatch(visual,/Shape3D|Body3D|Area3D/);
}
const bad=openingShapeFixture();bad.openingShapes[0].points=[{x:0,y:0},{x:1,y:1},{x:1,y:0},{x:0,y:1}];assert.match(openingShapeProblem(bad.openingShapes[0]),/cross|area/);assert.throws(()=>exportGodotFiles(bad));
const small=openingShapeFixture({style:'room'});small.doorMesh.frameWidth=1.2;assert.ok(validateBuilding(small).errors.length);small.floors[0].openings[0].doorStyle='empty';assert.deepEqual(validateBuilding(small).errors,[]);
const bent=openingShapeFixture({style:'room',shaped:true});assert.ok(validateBuilding(bent).errors.some(e=>/straight/.test(e.message)));
const closet=openingShapeFixture({style:'closet'});assert.ok(validateBuilding(closet).errors.some(e=>/single panel/.test(e.message)));
const missing=openingShapeFixture();missing.floors[0].openings[0].shapeId='missing';assert.ok(validateBuilding(missing).errors.some(e=>/missing doorway/.test(e.message)));
const example=customDoorwayExample(),before=JSON.stringify(example),files=exportGodotFiles(example);assert.deepEqual(validateBuilding(example),{errors:[],warnings:[]});assert.equal(files.doors.length,1);assert.equal(JSON.stringify(example),before);for(const shell of ['OutsideFaces','InsideFaces','SideAFaces','SideBFaces','EdgeFaces'])assert.ok(files.tscn.includes(shell));assert.equal(normalizeBuilding(JSON.parse(before)).version,10);
const e=await createEditorHarness();e.loadBuildingData(example);e.chooseSelection({type:'opening',id:'passage'});
let edit=e.$('#selection-form').children.find(q=>q.tagName==='BUTTON'&&q.textContent.includes('shared doorway'));assert.ok(edit);await edit.click();assert.equal(e.$('#opening-shape-dialog').open,true);
const saved=e.snapshot();await e.window.dispatch('keydown',{key:'Delete'});assert.deepEqual(e.snapshot(),saved,'dialog isolates editor shortcuts');
e.$('#opening-shape-preset').value='arch';await e.$('#opening-shape-preset').dispatch('change');await e.$('#opening-shape-cancel').click();assert.deepEqual(e.snapshot(),saved,'cancel does not change document');
await edit.click();e.$('#opening-shape-name').value='Shared airlock';await e.$('#opening-shape-save').click();assert.equal(e.snapshot().openingShapes[0].label,'Shared airlock');await e.$('#undo-btn').click();assert.deepEqual(e.snapshot(),saved);await e.$('#redo-btn').click();assert.equal(e.snapshot().openingShapes[0].label,'Shared airlock');
await e.$('#opening-shapes-btn').click();e.$('#opening-shape-choice').value='outline';await e.$('#opening-shape-choice').dispatch('change');await e.$('#opening-shape-delete').click();assert.ok(e.snapshot().floors[0].openings.every(o=>o.shapeId!=='outline'));await e.$('#undo-btn').click();assert.equal(e.snapshot().floors[0].openings[0].shapeId,'outline');
const state=e.snapshot();e.$('#door-frame-width').value='1.2';await e.$('#door-frame-width').dispatch('change');assert.deepEqual(e.snapshot(),state,'invalid frame size rolls back');assert.deepEqual(e.errors,[]);
// Drawing and pointer cancellation use the real front-elevation handlers.
await e.$('#opening-shapes-btn').click();e.$('#opening-shape-choice').value='';await e.$('#opening-shape-choice').dispatch('change');
await e.$('#opening-shape-draw').click();
const at=(x,y)=>({clientX:(112.5+375*x)*1100/600,clientY:(40+300*(1-y))*760/380});
for(const [x,y] of [[0,0],[1,0],[1,1],[0,1]])await e.$('#opening-shape-preview').dispatch('pointerdown',at(x,y));
await e.$('#opening-shape-finish').click();
const first=e.$('#opening-shape-points').querySelectorAll('input')[0].value;
await e.$('#opening-shape-preview').dispatch('pointerdown',at(0,0));await e.$('#opening-shape-preview').dispatch('pointermove',at(.1,.1));await e.$('#opening-shape-preview').dispatch('pointercancel');
assert.equal(e.$('#opening-shape-points').querySelectorAll('input')[0].value,first);
e.$('#opening-shape-name').value='Drawn rectangle';await e.$('#opening-shape-save').click();assert.equal(e.$('#opening-shape-dialog').hidden,true);assert.equal(e.snapshot().openingShapes.at(-1).points.length,4);
const transaction={version:1,operations:[{op:'opening.update',floorId:'floor',id:'passage',value:{shapeId:'arch'}}]};
const changed=applyTransaction(example,transaction);assert.equal(changed.building.floors[0].openings[1].shapeId,'arch');transaction.operations[0].value.shapeId=null;assert.equal(applyTransaction(example,transaction).building.floors[0].openings[1].shapeId,undefined);
// The dialog owns its draft history; copying changes only the selected door.
const ui=await createEditorHarness();ui.loadBuildingData(customDoorwayExample());ui.chooseSelection({type:'opening',id:'passage'});
const openShape=()=>ui.$('#selection-form').children.find(q=>q.tagName==='BUTTON'&&q.textContent.includes('shared doorway')).click();
await openShape();const unchanged=ui.snapshot(),points=()=>ui.$('#opening-shape-points').querySelectorAll('input').map(q=>q.value),initial=points();
assert.match(ui.$('#opening-shape-frame-status').textContent,/Frame fits the 3.6 × 2.5/);
assert.equal(ui.$('#opening-shape-undo').disabled,true);
ui.$('#opening-shape-preset').value='arch';await ui.$('#opening-shape-preset').dispatch('change');const arched=points();assert.notDeepEqual(arched,initial);
await ui.$('#opening-shape-dialog').dispatch('keydown',{key:'z',ctrlKey:true});assert.deepEqual(points(),initial);assert.deepEqual(ui.snapshot(),unchanged);
await ui.$('#opening-shape-dialog').dispatch('keydown',{key:'z',ctrlKey:true,shiftKey:true});assert.deepEqual(points(),arched);
// Text fields retain their own undo; they do not undo the geometry.
await ui.$('#opening-shape-dialog').dispatch('keydown',{key:'z',ctrlKey:true,target:ui.$('#opening-shape-name')});assert.deepEqual(points(),arched);
await ui.$('#opening-shape-undo').click();
let coordinate=ui.$('#opening-shape-points').querySelectorAll('input')[0];coordinate.value='20';await coordinate.dispatch('change');assert.equal(points()[0],'20');assert.equal(ui.$('#opening-shape-points').querySelectorAll('input')[0],coordinate,'numeric edit preserves the focused input');
await ui.$('#opening-shape-undo').click();assert.deepEqual(points(),initial);await ui.$('#opening-shape-redo').click();assert.equal(points()[0],'20');await ui.$('#opening-shape-undo').click();
// A click far outside the drawing bounds must not snap onto an edge handle.
const outside={clientX:0,clientY:(40+300*.8)*760/380};
await ui.$('#opening-shape-preview').dispatch('pointerdown',outside);await ui.$('#opening-shape-preview').dispatch('pointermove',{clientX:550,clientY:380});await ui.$('#opening-shape-preview').dispatch('pointerup');assert.deepEqual(points(),initial);
const selectedAt=(x,y)=>({clientX:(84+432*x)*1100/600,clientY:(40+300*(1-y))*760/380});
await ui.$('#opening-shape-preview').dispatch('pointerdown',selectedAt(.16,0));await ui.$('#opening-shape-preview').dispatch('pointermove',selectedAt(.2,0));await ui.$('#opening-shape-preview').dispatch('pointerup');assert.equal(points()[0],'20');
await ui.$('#opening-shape-undo').click();assert.deepEqual(points(),initial);
await ui.$('#opening-shape-preview').dispatch('pointerdown',selectedAt(.16,0));await ui.$('#opening-shape-preview').dispatch('pointermove',selectedAt(.22,0));await ui.$('#opening-shape-preview').dispatch('lostpointercapture');assert.deepEqual(points(),initial);
await ui.$('#opening-shape-draw').click();assert.equal(ui.$('#opening-shape-fit').disabled,true);assert.equal(ui.$('#opening-shape-save').disabled,true);assert.equal(ui.$('#opening-shape-copy').disabled,true);
for(const xy of [[0,0],[1,0],[1,1]])await ui.$('#opening-shape-preview').dispatch('pointerdown',selectedAt(...xy));
await ui.$('#opening-shape-finish').click();assert.equal(points().length,6);await ui.$('#opening-shape-undo').click();assert.equal(ui.$('#opening-shape-finish').hidden,false);
for(let i=0;i<4;i++)await ui.$('#opening-shape-undo').click();assert.deepEqual(points(),initial);assert.equal(ui.$('#opening-shape-finish').hidden,true);
ui.$('#opening-preview-width').value='.2';await ui.$('#opening-preview-width').dispatch('change');assert.match(ui.$('#opening-shape-frame-status').textContent,/Frame does not fit/);
ui.$('#opening-preview-width').value='';await ui.$('#opening-preview-width').dispatch('change');assert.match(ui.$('#opening-shape-frame-status').textContent,/Enter preview dimensions/);
ui.$('#opening-preview-width').value='3.6';await ui.$('#opening-preview-width').dispatch('change');
ui.$('#opening-shape-frame-preview').checked=false;await ui.$('#opening-shape-frame-preview').dispatch('change');assert.match(ui.$('#opening-shape-frame-status').textContent,/Outline only/);
ui.$('#opening-shape-frame-preview').checked=true;await ui.$('#opening-shape-frame-preview').dispatch('change');
ui.$('#opening-shape-preset').value='arch';await ui.$('#opening-shape-preset').dispatch('change');await ui.$('#opening-shape-copy').click();
const copied=ui.snapshot();assert.equal(copied.openingShapes.length,3);assert.deepEqual(copied.openingShapes[0],unchanged.openingShapes[0]);assert.equal(copied.floors[0].openings[0].shapeId,'outline');assert.equal(copied.floors[0].openings[1].shapeId,copied.openingShapes[2].id);assert.equal(copied.openingShapes[2].label,'Airlock outline copy');assert.equal(copied.openingShapes[2].points.length,15);
await ui.$('#undo-btn').click();assert.deepEqual(ui.snapshot(),unchanged);assert.deepEqual(ui.errors,[]);
console.log(`PASS custom doorways: ${count} wall/panel rays, concave/arched/clipped, profiled/rotated/reversed walls, shells, collision export, shared edits, cancel/delete/undo frame guards, local history, independent copies and live frame preview`);
