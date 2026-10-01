import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHistory } from './src/history.js';
import { normalizeBuilding } from './src/document.js';
import {
  DEFAULT_OMNI_LIGHT, applyOpeningConstraints, automaticRoofRectangles, automaticRoofSections, boundsOfAutomaticRoof, boundsOfBuilding, boundsOfStructuralFloor, constrainedOpening, exposedStructuralFloorRectangles, exteriorFootprintRectangles, findOpeningConflict, floorElevation, floorView, makeEmptyBuilding,
  makeFarmhousePreset, makeFloor, makeManualSurface, makeOmniLight, makePlatform, makeRectArea, makeRailing, makeRoofSection, makeStair, manualCeilingRectanglesAtLevel, manualFloorRectanglesAtLevel, roofSectionsForFloor, splitWallIntoSolidSegments, stairFootprint, subtractRectAreas, validateOpeningLayout, wallHeightFor, uid
} from './src/model.js';
import {
  buildClosetDoorLeafMeshData, buildDoorMeshData, buildExteriorMeshData, buildInteriorSplitMeshData, buildMergedWallCollisionBoxes,
  buildRailingMeshData, buildSlabFaceMeshData, buildStairMeshData, buildWindowMeshData, exportDoorTscn, exportGodotFiles, exteriorWallOutsideSign, floorRectanglesForView, isExteriorWall,
  decodeOctNormal, encodeOctNormal, makeStoredZip, packExteriorMesh, pointInExteriorFootprint, slabRectangles
} from './src/exporter.js';


// Packed normal regression: Godot Vector3::octahedron_encode uses X/Y with Z
// as the fold axis. Round-trip all principal directions so a Y/Z swap cannot
// silently return.
const axisNormals=[
  {x:1,y:0,z:0},{x:-1,y:0,z:0},{x:0,y:1,z:0},{x:0,y:-1,z:0},{x:0,y:0,z:1},{x:0,y:0,z:-1},
  {x:1/Math.sqrt(3),y:1/Math.sqrt(3),z:1/Math.sqrt(3)},
  {x:-1/Math.sqrt(3),y:1/Math.sqrt(3),z:-1/Math.sqrt(3)}
];
for(const n of axisNormals){
  const d=decodeOctNormal(encodeOctNormal(n));
  const dot=n.x*d.x+n.y*d.y+n.z*d.z;
  assert.ok(dot>.9999,`oct normal round-trip mismatch for ${JSON.stringify(n)} -> ${JSON.stringify(d)}`);
}

function finalClockwiseTriangleNormal(a,b,c){
  const u={x:c.x-a.x,y:c.y-a.y,z:c.z-a.z},v={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z};
  const n={x:u.y*v.z-u.z*v.y,y:u.z*v.x-u.x*v.z,z:u.x*v.y-u.y*v.x};
  const l=Math.hypot(n.x,n.y,n.z)||1;return{x:n.x/l,y:n.y/l,z:n.z/l};
}
function assertPackedNormalsFollowFinalTriangles(mesh,label){
  if(!mesh?.vertices?.length)return;
  const packed=packExteriorMesh(mesh),view=new DataView(packed.vertexBytes.buffer),base=packed.count*12;
  for(let i=0;i<packed.count;i+=3){
    const expected=finalClockwiseTriangleNormal(mesh.vertices[i],mesh.vertices[i+1],mesh.vertices[i+2]);
    for(let j=0;j<3;j++){
      const decoded=decodeOctNormal(view.getUint32(base+(i+j)*4,true));
      const dot=expected.x*decoded.x+expected.y*decoded.y+expected.z*decoded.z;
      assert.ok(dot>.999,`${label} packed normal diverges from final triangle geometry at triangle ${i/3}`);
    }
  }
}

// The serialization boundary must ignore any stale/precomputed normal array and
// derive hard-surface normals from the final Godot-space triangle positions.
const bogusNormalMesh={vertices:[{x:0,y:0,z:0},{x:0,y:1,z:0},{x:1,y:0,z:0}],normals:[{x:0,y:1,z:0},{x:0,y:1,z:0},{x:0,y:1,z:0}],uvs:[{u:0,v:0},{u:0,v:1},{u:1,v:0}]};
assertPackedNormalsFollowFinalTriangles(bogusNormalMesh,'bogus-normal probe');
const bogusPacked=packExteriorMesh(bogusNormalMesh),bogusView=new DataView(bogusPacked.vertexBytes.buffer),bogusDecoded=decodeOctNormal(bogusView.getUint32(bogusPacked.count*12,true));
assert.ok(bogusDecoded.z>.999&&Math.abs(bogusDecoded.y)<.001,'final +Z triangle must export a +Z normal, not +Y');

const historyProbe=createHistory({value:0},3);historyProbe.record({value:1},'one');historyProbe.record({value:2},'two');assert.equal(historyProbe.undo().state.value,1);assert.equal(historyProbe.redo().state.value,2);historyProbe.undo();historyProbe.record({value:7},'branch');assert.equal(historyProbe.canRedo(),false);

const mainSource=fs.readFileSync('./src/main.js','utf8'),indexSource=fs.readFileSync('./index.html','utf8'),previewSource=fs.readFileSync('./src/preview.js','utf8');
const selectorIds=new Set([...mainSource.matchAll(/\$\('#([^']+)'\)/g)].map(m=>m[1])),htmlIds=new Set([...indexSource.matchAll(/id="([^"]+)"/g)].map(m=>m[1]));
assert.deepEqual([...selectorIds].filter(id=>!htmlIds.has(id)),[],'main.js references missing DOM IDs');
assert.match(previewSource,/floor\.lights|floor\.stairs/,'3D preview should include per-floor markers/geometry');
assert.match(previewSource,/mode:pan\?'pan':'orbit'|pan\?'pan':'orbit'/,'3D preview should support a dedicated pan drag mode');
assert.match(previewSource,/e\.button===1\|\|e\.button===2/,'3D preview should support middle/right mouse panning');
assert.match(previewSource,/glassDepth/,'3D preview should render window glass rather than only frames');
assert.match(indexSource,/MMB\/RMB or Shift\+LMB pan/,'3D preview controls should advertise pan controls');
assert.match(indexSource,/data-tool="stair"/);assert.match(indexSource,/id="floor-select"/);
assert.match(indexSource,/data-tool="manual-floor"/);assert.match(indexSource,/data-tool="manual-ceiling"/);assert.match(indexSource,/id="auto-floor-toggle"/);assert.match(indexSource,/id="auto-ceiling-toggle"/);
// UI/options audit: destructive mode removed, creation defaults are contextual, and controls are categorized.
assert.doesNotMatch(indexSource,/data-tool="delete"/,'Delete is a selection action/key, not a persistent drawing tool');
assert.match(indexSource,/id="tool-defaults-section"/);assert.match(indexSource,/data-tools="wall room"/);assert.match(indexSource,/data-tools="stair"/);assert.match(indexSource,/data-tools="roof"/);
for(const category of ['Tools','Floors','Structure','Automatic Roof','Doors & Windows','Plan View']) assert.ok(indexSource.includes(`<h2>${category}`),`missing UI category ${category}`);
assert.match(mainSource,/e\.key==='Delete'/);assert.doesNotMatch(mainSource,/tool==='delete'|function deleteAt/);
assert.match(mainSource,/Selection priority is intentional/,'selection hit-test priority should be documented');
const selectStart=mainSource.indexOf('function selectAt(screen){'),selectEnd=mainSource.indexOf('function deleteSelectedEntity()',selectStart);
const selectAtSource=selectStart>=0&&selectEnd>selectStart?mainSource.slice(selectStart,selectEnd):'';
assert.ok(selectAtSource.indexOf('nearestOpening(screen)')>=0&&selectAtSource.indexOf('nearestOpening(screen)')<selectAtSource.indexOf("addArea('slab'"),'openings must win hit-testing over large floor-area entities');
assert.ok(selectAtSource.indexOf('nearestWall(screenToWorld(screen))')>=0&&selectAtSource.indexOf('nearestWall(screenToWorld(screen))')<selectAtSource.indexOf("addArea('slab'"),'walls must win hit-testing over large floor-area entities');
assert.ok(mainSource.includes('function nearestStair(screen){const p=screenToWorld(screen);let best=null;'),'stair hit-testing should choose a closest candidate instead of first array match');
assert.ok(mainSource.indexOf('drawPlan();',mainSource.indexOf('function renderSelection(')) < mainSource.indexOf('refreshSelection();',mainSource.indexOf('function renderSelection(')),'selection should redraw visibly before properties are refreshed');
assert.doesNotMatch(mainSource,/Wall added — click next point, Esc to finish',false/,'new chained walls should refresh their selection properties');
assert.match(mainSource,/if\(tool!=='select'\)\{setTool\('select'\)/,'Escape should return drawing tools to Select');


const b=makeFarmhousePreset(),f1=b.floors[0],v1=floorView(b,f1,true);
// Exercise the corrected packer against representative architectural mesh types.
{
  const ext=buildExteriorMeshData(v1);for(const [k,m] of Object.entries(ext))assertPackedNormalsFollowFinalTriangles(m,`exterior ${k}`);
  const int=buildInteriorSplitMeshData(v1);for(const [k,m] of Object.entries(int))assertPackedNormalsFollowFinalTriangles(m,`interior ${k}`);
  const slab=buildSlabFaceMeshData([{minX:-2,maxX:2,minZ:-2,maxZ:2}],b.floorThickness,0);for(const [k,m] of Object.entries(slab))assertPackedNormalsFollowFinalTriangles(m,`slab ${k}`);
  assertPackedNormalsFollowFinalTriangles(buildRailingMeshData(makeRailing({x:-1,z:0},{x:1,z:0},1,'Probe')),'railing');
  assertPackedNormalsFollowFinalTriangles(buildStairMeshData(b,makeStair({x:0,z:2},{x:0,z:-2},1.2,6,'Probe')).mesh,'ramp');
  const win=v1.openings.find(o=>o.type==='window');if(win){const wm=buildWindowMeshData(v1,win);assertPackedNormalsFollowFinalTriangles(wm.frame,'window frame');assertPackedNormalsFollowFinalTriangles(wm.glass,'window glass');}
}

assert.equal(b.version,9);assert.equal(b.floors.length,1);assert.equal(f1.walls.length,10);assert.equal(f1.walls.filter(w=>w.role==='exterior').length,4);assert.equal(f1.walls.filter(w=>isExteriorWall(v1,w)).length,4);
assert.ok(f1.openings.some(o=>o.type==='door'));assert.ok(f1.openings.some(o=>o.type==='window'));
const wallWithOpening=f1.walls.find(w=>f1.openings.some(o=>o.wallId===w.id));assert.ok(splitWallIntoSolidSegments(v1,wallWithOpening).length>=2);
// Per-wall height supports half/custom walls without changing the story height.
const halfWall={id:'half_wall',role:'interior',a:{x:-2,z:0},b:{x:2,z:0},label:'Half Wall',height:b.wallHeight/2};
f1.walls.push(halfWall);assert.equal(wallHeightFor(v1,halfWall),b.wallHeight/2);const halfSegs=splitWallIntoSolidSegments(v1,halfWall);assert.equal(halfSegs.length,1);assert.equal(halfSegs[0].top,b.wallHeight/2);const halfOnly={...v1,walls:[halfWall],openings:[]};const halfMesh=buildInteriorSplitMeshData(halfOnly);assert.ok(Math.max(...halfMesh.sideA.vertices.map(v=>v.y))<=b.wallHeight/2+1e-6);f1.walls.pop();


function validateMesh(mesh){assert.ok(mesh.vertices.length>0);assert.equal(mesh.vertices.length%3,0);assert.equal(mesh.normals.length,mesh.vertices.length);assert.equal(mesh.uvs.length,mesh.vertices.length);}

// Window and railing style variants are real exported geometry, not preview-only labels.
const styleProbe=makeEmptyBuilding(),styleF=styleProbe.floors[0];
styleF.walls=[{id:'style_wall',role:'exterior',a:{x:-4,z:0},b:{x:4,z:0},label:'Style Wall'}];
const plainWindow={id:'win_plain',type:'window',wallId:'style_wall',t:.2,width:1.2,height:1.1,sill:.8,label:'Plain',windowStyle:'plain'};
const doubleWindow={id:'win_double',type:'window',wallId:'style_wall',t:.5,width:1.2,height:1.1,sill:.8,label:'Double',windowStyle:'double_hung'};
const fourWindow={id:'win_four',type:'window',wallId:'style_wall',t:.8,width:1.2,height:1.1,sill:.8,label:'Four',windowStyle:'four_pane'};
styleF.openings.push(plainWindow,doubleWindow,fourWindow);
const styleV=floorView(styleProbe,styleF,true),plainMesh=buildWindowMeshData(styleV,plainWindow),doubleMesh=buildWindowMeshData(styleV,doubleWindow),fourMesh=buildWindowMeshData(styleV,fourWindow);
assert.equal(plainMesh.style,'plain');assert.equal(doubleMesh.style,'double_hung');assert.equal(fourMesh.style,'four_pane');
assert.ok(doubleMesh.frame.vertices.length>plainMesh.frame.vertices.length,'double-hung adds a horizontal sash');
assert.ok(fourMesh.frame.vertices.length>doubleMesh.frame.vertices.length,'four-pane adds a vertical muntin in addition to the sash');
// Empty window/door styles are true holes: wall segmentation remains, but no fixture mesh, fixture collision, or door PackedScene is exported.
const emptyProbe=makeEmptyBuilding(),emptyF=emptyProbe.floors[0];
emptyF.walls=[{id:'empty_wall',role:'exterior',a:{x:-4,z:0},b:{x:4,z:0},label:'Openings'}];
const emptyWindow={id:'empty_window',type:'window',wallId:'empty_wall',t:.25,width:1.2,height:1.1,sill:.8,label:'Empty Window',windowStyle:'empty'};
const emptyDoor={id:'empty_door',type:'door',wallId:'empty_wall',t:.75,width:1.1,height:2.1,label:'Empty Door',doorStyle:'empty'};
emptyF.openings.push(emptyWindow,emptyDoor);const emptyV=floorView(emptyProbe,emptyF,true);
assert.equal(buildWindowMeshData(emptyV,emptyWindow),null);assert.equal(buildDoorMeshData(emptyV,emptyDoor),null);
assert.ok(splitWallIntoSolidSegments(emptyV,emptyF.walls[0]).length>1,'empty fixtures must still cut holes in the host wall');
const emptyFiles=exportGodotFiles(emptyProbe,{collision:true,markers:false});assert.equal(emptyFiles.doors.length,0,'empty door must not emit a PackedScene');assert.doesNotMatch(emptyFiles.tscn,/parent="Floor_01\/Geometry\/Windows"/);assert.doesNotMatch(emptyFiles.tscn,/parent="Floor_01\/Geometry\/Doors"/);

for(const [style,label] of [['two_rail','Two Rail'],['picket','Picket'],['cross_brace','Cross Brace']]){
  const rd=buildRailingMeshData(makeRailing({x:0,z:0},{x:4,z:0},label,1,style));
  assert.equal(rd.style,style);validateMesh(rd.mesh);
}
const twoRailVerts=buildRailingMeshData(makeRailing({x:0,z:0},{x:4,z:0},'Two',1,'two_rail')).mesh.vertices.length;
const picketVerts=buildRailingMeshData(makeRailing({x:0,z:0},{x:4,z:0},'Picket',1,'picket')).mesh.vertices.length;
const crossVerts=buildRailingMeshData(makeRailing({x:0,z:0},{x:4,z:0},'Cross',1,'cross_brace')).mesh.vertices.length;
assert.notEqual(picketVerts,twoRailVerts);assert.notEqual(crossVerts,twoRailVerts);
assert.match(indexSource,/id="new-window-style"/);assert.match(indexSource,/id="new-railing-style"/);
assert.match(mainSource,/Window style updated/);assert.match(mainSource,/Railing style updated/);assert.match(indexSource,/id="new-stair-block-below"/);assert.match(mainSource,/Under-stair blocking updated/);
assert.match(indexSource,/value="empty">Empty opening<\/option>/,'empty opening must be available in door/window style controls');
const normalizedEmpty=normalizeBuilding(structuredClone(emptyProbe));
for(const o of normalizedEmpty.floors[0].openings)assert.equal(o.type==='door'?o.doorStyle:o.windowStyle,'empty','Shared import normalization preserves empty door/window styles');

const ex=buildExteriorMeshData(v1),ims=buildInteriorSplitMeshData(v1);validateMesh(ex.outside);validateMesh(ex.inside);validateMesh(ex.edges);validateMesh(ims.sideA);validateMesh(ims.sideB);validateMesh(ims.edges);
const windows=f1.openings.filter(o=>o.type==='window');for(const o of windows){const wm=buildWindowMeshData(v1,o);validateMesh(wm.frame);validateMesh(wm.glass);}
const windowGroupFiles=exportGodotFiles(b,{collision:true,markers:false});const windowCollisionNodes=[...windowGroupFiles.tscn.matchAll(/\[node name=\"Window_[^\"]*_Collision\" type=\"CollisionShape3D\" parent=\"[^\"]*\/Collision\" groups=\[\"scare_sight_transparent\"\]\]/g)];assert.equal(windowCollisionNodes.length,windows.length,'every exported non-empty window CollisionShape3D must belong to scare_sight_transparent');
const doors=f1.openings.filter(o=>o.type==='door');for(const o of doors){const dm=buildDoorMeshData(v1,o);validateMesh(dm.frame);validateMesh(dm.panel);validateMesh(dm.hardware);const d=exportDoorTscn(v1,o);assert.match(d,/name="Hinge"/);assert.doesNotMatch(d,/Script/);if(o.doorStyle==='closet')assert.match(d,/name="Hinge2"/);assert.match(d,/id="DoorInteractionShape_GP"/);assert.match(d,/name="InteractionArea" type="Area3D" parent="\."/);assert.match(d,/collision_layer = 4\ncollision_mask = 0/);assert.match(d,/parent="InteractionArea"/);}


// Door interaction target mirrors the in-game Get Probed doorway Area3D: clear leaf width + wall thickness,
// clear leaf height, fixed 0.42 m depth, centered at the leaf collider height.
const interactionProbeBuilding=makeEmptyBuilding();interactionProbeBuilding.exportProfile='get_probed';interactionProbeBuilding.wallThickness=.18;interactionProbeBuilding.doorMesh={enabled:true,frameWidth:.09,frameDepth:.14,panelThickness:.045,detailDepth:.018};
const interactionWall={id:'interaction_wall',role:'exterior',a:{x:0,z:0},b:{x:8,z:0},label:''};interactionProbeBuilding.floors[0].walls=[interactionWall];
const suppliedInteractionSizes={exterior:'0.973, 1.9965, 0.42',room:'1.018, 2.019, 0.42',closet:'1.0396, 2.0298, 0.42'};
const suppliedInteractionY={exterior:'0, 0.99825, 0',room:'0, 1.0095, 0',closet:'0, 1.0149, 0'};
for(const style of ['exterior','room','closet']){const opening={id:`interaction_${style}`,type:'door',wallId:'interaction_wall',t:.5,width:1,height:2.1,label:'Door',doorStyle:style};const view=floorView(interactionProbeBuilding,interactionProbeBuilding.floors[0],true);const dm=buildDoorMeshData(view,opening);const d=exportDoorTscn(view,opening);const expectedWidth=(dm.innerWidth+.18).toFixed(4).replace(/0+$/,'').replace(/\.$/,'');const expectedHeight=dm.innerHeight.toFixed(4).replace(/0+$/,'').replace(/\.$/,'');assert.ok(d.includes(`size = Vector3(${expectedWidth}, ${expectedHeight}, 0.42)`),`${style} interaction shape dimensions should follow doorway clear size`);assert.ok(d.includes(`size = Vector3(${suppliedInteractionSizes[style]})`),`${style} interaction shape should match supplied farmhouse door`);assert.ok(d.includes(`position = Vector3(${suppliedInteractionY[style]})\nshape = SubResource("DoorInteractionShape_GP")`),`${style} interaction position should match supplied farmhouse door`);}

// Opening hardening remains active per floor.
const clampB=makeEmptyBuilding(),clampF=clampB.floors[0];clampF.walls=[{id:'w',role:'exterior',a:{x:0,z:0},b:{x:2,z:0},label:''}];clampF.openings=[{id:'ow',type:'window',wallId:'w',t:.05,width:5,height:5,sill:1,label:'Wide'}];const clampV=floorView(clampB,clampF,true),safe=constrainedOpening(clampV,clampF.openings[0]);assert.ok(safe.width<2);applyOpeningConstraints(clampV,clampF.openings[0]);assert.equal(validateOpeningLayout(clampV).length,0);
const doorDataProbe={id:'door_data_probe',type:'door',wallId:'w',t:.5,width:.8,height:1.9,sill:.6,doorStyle:'room'};applyOpeningConstraints(clampV,doorDataProbe);assert.equal('sill' in doorDataProbe,false,'door sill is dead data and should be removed during normalization');
const overlapB=makeEmptyBuilding(),overlapF=overlapB.floors[0];overlapF.walls=[{id:'owall',role:'exterior',a:{x:0,z:0},b:{x:6,z:0},label:''}];overlapF.openings=[{id:'a',type:'door',wallId:'owall',t:.45,width:1.2,height:2.1,sill:0,doorStyle:'room'},{id:'b',type:'door',wallId:'owall',t:.55,width:1.2,height:2.1,sill:0,doorStyle:'room'}];const overlapV=floorView(overlapB,overlapF,true);assert.ok(findOpeningConflict(overlapV,overlapF.openings[0],overlapF.openings[0].id));assert.throws(()=>exportGodotFiles(overlapB),/overlaps/);

// Concave outside/inside material classification.
const concaveB=makeEmptyBuilding(),cf=concaveB.floors[0];cf.walls=[
{id:'c1',role:'exterior',a:{x:0,z:0},b:{x:4,z:0}},{id:'c2',role:'exterior',a:{x:4,z:0},b:{x:4,z:2}},
{id:'c3',role:'exterior',a:{x:4,z:2},b:{x:2,z:2}},{id:'c4',role:'exterior',a:{x:2,z:2},b:{x:2,z:4}},
{id:'c5',role:'exterior',a:{x:2,z:4},b:{x:0,z:4}},{id:'c6',role:'exterior',a:{x:0,z:4},b:{x:0,z:0}}];const cv=floorView(concaveB,cf,true);assert.equal(pointInExteriorFootprint(cv,{x:1,z:3}),true);assert.equal(pointInExteriorFootprint(cv,{x:3,z:3}),false);assert.equal(exteriorWallOutsideSign(cv,cf.walls[2]),-1);

// Primitive wall collision merging still works.
const mergeB=makeEmptyBuilding(),mf=mergeB.floors[0];mf.walls=[{id:'m1',role:'exterior',a:{x:0,z:0},b:{x:3,z:0}},{id:'m2',role:'exterior',a:{x:3,z:0},b:{x:6,z:0}}];assert.equal(buildMergedWallCollisionBoxes(floorView(mergeB,mf,true)).length,1);

// Multi-floor + straight staircase modeled after second_house WalkableRamp.
const multi=makeFarmhousePreset();multi.wallHeight=3.2;const upper=makeFloor('Floor 2');
// Duplicate the outer shell only for a clean second story.
const map=new Map();upper.walls=multi.floors[0].walls.filter(w=>w.role==='exterior').map(w=>{const c=structuredClone(w),id=uid('wall');map.set(w.id,id);c.id=id;return c;});upper.walls.push({id:uid('wall'),role:'interior',a:{x:0,z:-4},b:{x:0,z:4},label:'Upper partition',height:null});multi.floors.push(upper);
const upperFacadeView=floorView(multi,upper,true);upperFacadeView.storyFloorSkirt=multi.floorThickness;upperFacadeView.exteriorFloorSkirt=multi.floorThickness;const upperFacade=buildExteriorMeshData(upperFacadeView);assert.ok(Math.abs(Math.min(...upperFacade.outside.vertices.map(v=>v.y))+multi.floorThickness)<1e-6,'upper exterior facade must cover the exposed slab edge');assert.ok(Math.abs(Math.min(...upperFacade.inside.vertices.map(v=>v.y))+multi.floorThickness)<1e-6,'inside face of an upper exterior wall must also cover the slab-thickness band');const upperInterior=buildInteriorSplitMeshData(upperFacadeView);assert.ok(upperInterior.sideA.vertices.length>0,'upper test story should contain an interior partition');assert.ok(Math.abs(Math.min(...upperInterior.sideA.vertices.map(v=>v.y))+multi.floorThickness)<1e-6,'upper interior partitions must bridge downward across the supporting floor slab');assert.ok(Math.abs(Math.min(...upperInterior.sideB.vertices.map(v=>v.y))+multi.floorThickness)<1e-6,'both sides of an upper interior partition must bridge the floor slab');
const stair=makeStair({x:2.6,z:3.5},{x:2.6,z:-3.0},2.4,'ramp',12,'Main Ramp');multi.floors[0].stairs.push(stair);assert.equal(stair.style,'ramp');assert.equal(stair.steps,12);
const sf=stairFootprint(stair);assert.ok(Math.abs((sf.maxZ-sf.minZ)-6.5)<1e-6);const stairMesh=buildStairMeshData(multi,stair);validateMesh(stairMesh.mesh);assert.equal(stairMesh.style,'ramp');assert.equal(stairMesh.blockBelow,true);validateMesh(stairMesh.blockerMesh);assert.ok(stairMesh.mesh.vertices.length>=36,'ramp surface should export as a thin six-faced slab');assert.ok(Math.abs(stairMesh.rise-3.38)<1e-6);const openRamp=structuredClone(stair);openRamp.blockBelow=false;const openRampMesh=buildStairMeshData(multi,openRamp);assert.equal(openRampMesh.blockerMesh,null,'open ramp must not create an underside fill mesh');
const stepStair=makeStair({x:0,z:3.25},{x:0,z:-3.25},2.4,'steps',13,'Main Steps'),steppedMesh=buildStairMeshData(multi,stepStair);assert.equal(stepStair.style,'steps');assert.equal(stepStair.steps,13);assert.equal(steppedMesh.style,'steps');assert.equal(steppedMesh.steps,13);validateMesh(steppedMesh.mesh);assert.ok(steppedMesh.mesh.vertices.length>stairMesh.mesh.vertices.length,'step style should generate discrete tread geometry');
const legacyStepped=makeStair({x:0,z:3},{x:0,z:-3},2.2,10,'Legacy Steps');assert.equal(legacyStepped.style,'steps');assert.equal(legacyStepped.steps,10,'legacy stepped signature should remain stepped');
const upperBounds={minX:-6,maxX:6,minZ:-4.5,maxZ:4.5,width:12,depth:9};const floorPieces=slabRectangles(upperBounds,[sf]);assert.ok(floorPieces.length>=2,'upper floor should split around stairwell opening');
const slabFaces=buildSlabFaceMeshData(floorPieces,multi.floorThickness,0);validateMesh(slabFaces.top);validateMesh(slabFaces.bottom);validateMesh(slabFaces.edges);


multi.floors[0].lights.push(makeOmniLight(1.5,-.5,2.2,'HallLight'));
const files=exportGodotFiles(multi,{collision:true,markers:true}),t=files.tscn;
assert.match(t,/\[node name="Floor_01" type="Node3D" parent="\."\]/);assert.match(t,/\[node name="Floor_02" type="Node3D" parent="\."\]\nposition = Vector3\(0, 3\.38, 0\)/);
assert.match(t,/name="Staircase_001_Main_Ramp"/);assert.match(t,/name="RampMesh" type="MeshInstance3D"/);assert.match(t,/name="WalkableRamp" type="StaticBody3D"/);assert.match(t,/name="UnderStairBlockerMesh" type="MeshInstance3D"/);assert.match(t,/name="UnderStairBlocker" type="StaticBody3D"/);assert.match(t,/parent="Floor_01\/Geometry\/Stairs\/Staircase_001_Main_Ramp\/WalkableRamp"/);assert.match(t,/collision_layer = 1/);assert.match(t,/collision_mask = 2/);
assert.match(t,/StairRampShape/);assert.match(t,/UnderStairShape/);assert.match(t,/type="ConvexPolygonShape3D"/);assert.match(t,/F01_StairMesh_001/);assert.match(t,/"name": "Ramp"/);assert.match(t,/\[sub_resource type="ArrayMesh" id="F02_FloorMesh"\]/);assert.match(t,/"name": "TopFaces"/);assert.match(t,/"name": "BottomFaces"/);assert.match(t,/"name": "EdgeFaces"/);assert.match(t,/name="FloorSlab" type="MeshInstance3D" parent="Floor_02\/Geometry"/);assert.match(t,/mesh = SubResource\("F02_FloorMesh"\)/);assert.match(t,/name="InteriorWalls" type="Node3D" parent="Floor_01\/Geometry\/Walls"/);assert.match(t,/name="SideAFaces" type="MeshInstance3D" parent="Floor_01\/Geometry\/Walls\/InteriorWalls"/);assert.match(t,/name="SideBFaces" type="MeshInstance3D" parent="Floor_01\/Geometry\/Walls\/InteriorWalls"/);
assert.equal((t.match(/\[node name="Roof" type="Node3D"/g)||[]).length,1,'roof must only exist above top floor');assert.equal((t.match(/\[node name="Ceiling" type="MeshInstance3D"/g)||[]).length,2,'every story hangs its automatic ceiling, including under the upper slab (Kestrel K2)');assert.match(t,/name="Ceiling" type="MeshInstance3D" parent="Floor_01\/Geometry"/);assert.match(t,/\[sub_resource type="ArrayMesh" id="F02_CeilingMesh"\]/);assert.match(t,/"name": "RoomFaces"/);assert.match(t,/"name": "RoofSideFaces"/);assert.match(t,/name="Ceiling" type="MeshInstance3D" parent="Floor_02\/Geometry"/);
assert.match(t,/type="OmniLight3D" parent="Floor_01\/Lights"/);assert.doesNotMatch(t,/light\.tscn/i);assert.doesNotMatch(t,/CSG/);assert.doesNotMatch(t,/\.obj/);
assert.equal(files.doors.length,doors.length,'only floor 1 currently has doors');assert.ok(files.doors.every(d=>/f01_door_/.test(d.filename)));

// Both staircase styles export their appropriate visible mesh/collision paths.
const openRampExport=structuredClone(multi);const openRampStair=structuredClone(stair);openRampStair.blockBelow=false;openRampExport.floors[0].stairs=[openRampStair];const openRampT=exportGodotFiles(openRampExport,{collision:true,markers:false}).tscn;assert.match(openRampT,/name="RampMesh" type="MeshInstance3D"/);assert.match(openRampT,/name="WalkableRamp" type="StaticBody3D"/);assert.doesNotMatch(openRampT,/UnderStairBlockerMesh/);assert.doesNotMatch(openRampT,/name="UnderStairBlocker" type="StaticBody3D"/);assert.doesNotMatch(openRampT,/UnderStairShape/);
const stepExport=structuredClone(multi);stepExport.floors[0].stairs=[stepStair];const stepT=exportGodotFiles(stepExport,{collision:true,markers:false}).tscn;assert.match(stepT,/name="Steps" type="MeshInstance3D"/);assert.match(stepT,/"name": "Steps"/);assert.match(stepT,/StairRampShape/);assert.match(stepT,/name="WalkableRamp" type="StaticBody3D"/);assert.match(stepT,/name="UnderStairBlockerMesh" type="MeshInstance3D"/);assert.match(stepT,/name="UnderStairBlocker" type="StaticBody3D"/);assert.match(stepT,/UnderStairShape/);assert.doesNotMatch(stepT,/name="RampMesh" type="MeshInstance3D"/);


// Capability pass regression: custom floor footprint + roof sections + porch/deck + railing.
const cap=makeEmptyBuilding();cap.name='Capability Probe';const capF=cap.floors[0];
capF.slabs.push(makeRectArea({x:-4,z:-3},{x:2,z:3},'Main Slab'),makeRectArea({x:0,z:-1},{x:4,z:3},'L Wing'));
capF.platforms.push(makePlatform({x:-4,z:3},{x:1,z:4.5},'porch',0,'Front Porch'));
capF.railings.push(makeRailing({x:-4,z:4.5},{x:1,z:4.5},'Porch Rail',1.0));
cap.roofSections.push(makeRoofSection({x:-4,z:-3},{x:2,z:3},'gable','x','Main Roof',cap.wallHeight,40,.45),makeRoofSection({x:0,z:-1},{x:4,z:3},'shed','z','Wing Roof',cap.wallHeight,28,.2));
const capFiles=exportGodotFiles(cap,{collision:true,markers:true});
assert.match(capFiles.tscn,/name="FloorSlab" type="MeshInstance3D"/);
assert.match(capFiles.tscn,/name="Platforms" type="Node3D"/);
assert.match(capFiles.tscn,/Front_Porch/);
assert.match(capFiles.tscn,/name="Railings" type="Node3D"/);
assert.match(capFiles.tscn,/Porch_Rail/);
assert.match(capFiles.tscn,/RailingMesh_001/);
assert.match(capFiles.tscn,/name="ManualRoofs" type="Node3D"/);
assert.match(capFiles.tscn,/ManualRoof_002_Shed/);
assert.match(capFiles.tscn,/ManualRoof_001_GableFill/);
assert.doesNotMatch(capFiles.tscn,/NaN|null/);


// Porch/deck bounds must not enlarge the house floor; a platform owns any overlapping footprint.
const porchProbe=makeEmptyBuilding(),porchF=porchProbe.floors[0];
porchF.walls=[
  {id:'p1',role:'exterior',a:{x:-2,z:-2},b:{x:2,z:-2}},{id:'p2',role:'exterior',a:{x:2,z:-2},b:{x:2,z:2}},
  {id:'p3',role:'exterior',a:{x:2,z:2},b:{x:-2,z:2}},{id:'p4',role:'exterior',a:{x:-2,z:2},b:{x:-2,z:-2}}
];
porchF.platforms.push(makePlatform({x:-1,z:1.5},{x:1,z:4},'porch',0,'Overlap Porch'));
const porchV=floorView(porchProbe,porchF,true),overall=boundsOfBuilding(porchV),structural=boundsOfStructuralFloor(porchV);
assert.equal(structural.depth,4);assert.equal(structural.maxZ,2);assert.equal(overall.maxZ,4,'overall framing bounds should still include porch');
const porchFloorRects=floorRectanglesForView(porchV,[]);
assert.ok(porchFloorRects.every(r=>r.maxZ<=2+1e-6),'auto floor must never extend out under porch');
assert.ok(porchFloorRects.every(r=>!(((r.minX+r.maxX)/2>-1)&&((r.minX+r.maxX)/2<1)&&((r.minZ+r.maxZ)/2>1.5))), 'platform overlap should be cut out of the structural floor');
const porchExport=exportGodotFiles(porchProbe,{collision:true,markers:false}).tscn;
assert.match(porchExport,/Overlap_Porch/);assert.match(porchExport,/name="FloorSlab" type="MeshInstance3D"/);


// Platform roof semantics: porches are covered by default, decks are not, and either can be overridden.
const roofPlatformProbe=makeEmptyBuilding(),rpf=roofPlatformProbe.floors[0];
rpf.walls=[
  {id:'rp1',role:'exterior',a:{x:-2,z:-2},b:{x:2,z:-2}},{id:'rp2',role:'exterior',a:{x:2,z:-2},b:{x:2,z:2}},
  {id:'rp3',role:'exterior',a:{x:2,z:2},b:{x:-2,z:2}},{id:'rp4',role:'exterior',a:{x:-2,z:2},b:{x:-2,z:-2}}
];
const defaultDeck=makePlatform({x:-1,z:2},{x:1,z:4},'deck',0,'Back Deck');
const defaultPorch=makePlatform({x:-1,z:-4},{x:1,z:-2},'porch',0,'Front Porch');
assert.equal(defaultDeck.covered,false);assert.equal(defaultPorch.covered,true);
rpf.platforms.push(defaultDeck);let roofBounds=boundsOfAutomaticRoof(floorView(roofPlatformProbe,rpf,true));assert.equal(roofBounds.maxZ,2,'uncovered deck must not enlarge automatic roof');
rpf.platforms.push(defaultPorch);roofBounds=boundsOfAutomaticRoof(floorView(roofPlatformProbe,rpf,true));assert.equal(roofBounds.minZ,-4,'covered porch should enlarge automatic roof');
defaultDeck.covered=true;roofBounds=boundsOfAutomaticRoof(floorView(roofPlatformProbe,rpf,true));assert.equal(roofBounds.maxZ,4,'covered override should let a deck receive roof coverage');



// Closed concave exterior shells drive the automatic structural floor and roof regions.
const tShape=makeEmptyBuilding(),tf=tShape.floors[0];
tf.walls=[
  {id:'t1',role:'exterior',a:{x:-6,z:-4},b:{x:6,z:-4}},
  {id:'t2',role:'exterior',a:{x:6,z:-4},b:{x:6,z:-1}},
  {id:'t3',role:'exterior',a:{x:6,z:-1},b:{x:2,z:-1}},
  {id:'t4',role:'exterior',a:{x:2,z:-1},b:{x:2,z:4}},
  {id:'t5',role:'exterior',a:{x:2,z:4},b:{x:-2,z:4}},
  {id:'t6',role:'exterior',a:{x:-2,z:4},b:{x:-2,z:-1}},
  {id:'t7',role:'exterior',a:{x:-2,z:-1},b:{x:-6,z:-1}},
  {id:'t8',role:'exterior',a:{x:-6,z:-1},b:{x:-6,z:-4}}
];
const tv=floorView(tShape,tf,true),tRects=exteriorFootprintRectangles(tv),tFloor=floorRectanglesForView(tv,[]),tRoof=automaticRoofRectangles(tv);
const area=rs=>rs.reduce((n,r)=>n+(r.maxX-r.minX)*(r.maxZ-r.minZ),0);
assert.equal(area(tRects),56,'concave T footprint should use actual enclosed area, not its 96 m² bounding box');
assert.equal(area(tFloor),56,'automatic slab should exactly follow the closed exterior footprint');
assert.ok(tRoof.length>=2,'concave automatic roof should decompose into multiple roof rectangles');
const tSections=automaticRoofSections(tv),branch=tSections.find(r=>r.direction==='z'),host=tSections.find(r=>r.direction==='x');
assert.ok(branch&&host,'T roof should identify perpendicular main and branch gables');
assert.equal(branch.suppressMin,true,'branch gable end that enters the host roof should be suppressed');
assert.ok(branch.minZ < -1-1e-6,'branch roof should extend into the host roof instead of stopping at the wall junction');
assert.ok(Math.abs(branch.minZ-((host.minZ+host.maxZ)/2))<1e-6,'branch should extend to the host ridge');
assert.ok(Number(branch.pitch)<Number(tShape.roof.pitch),'wider branch span should auto-match host ridge height with a shallower pitch');
const tExport=exportGodotFiles(tShape,{collision:true,markers:false}).tscn;
assert.ok((tExport.match(/Roof_00/g)||[]).length>=2,'concave auto roof should export multiple roof sections');



// Roof exposure is spatial, not restricted to the numerically highest floor.
const stepped=makeEmptyBuilding();stepped.name='Stepped Roof Probe';
const low=stepped.floors[0],high=makeFloor('Floor 2');stepped.floors.push(high);
low.slabs.push(makeRectArea({x:-4,z:-4},{x:4,z:4},'Lower footprint'));
high.slabs.push(makeRectArea({x:0,z:-4},{x:4,z:4},'Upper half'));
const lowExposed=exposedStructuralFloorRectangles(stepped,0),highExposed=exposedStructuralFloorRectangles(stepped,1);
const rectArea=rs=>rs.reduce((n,r)=>n+(r.maxX-r.minX)*(r.maxZ-r.minZ),0);
assert.equal(rectArea(lowExposed),32,'lower story should remain exposed only where Floor 2 does not cover it');
assert.equal(rectArea(highExposed),32,'upper story should be fully exposed');
const lowRoof=roofSectionsForFloor(stepped,0),highRoof=roofSectionsForFloor(stepped,1);
assert.ok(lowRoof.length>=1,'lower exposed wing should receive an automatic roof');
assert.ok(highRoof.length>=1,'upper floor should receive an automatic roof');
const steppedTscn=exportGodotFiles(stepped,{collision:true,markers:false}).tscn;
assert.equal((steppedTscn.match(/\[node name="Roof" type="Node3D" parent="Floor_\d+\/Geometry"\]/g)||[]).length,2,'both exposed stories should export roof nodes');
assert.match(steppedTscn,/name="Roof" type="Node3D" parent="Floor_01\/Geometry"/);
assert.match(steppedTscn,/name="Roof" type="Node3D" parent="Floor_02\/Geometry"/);
assert.equal((steppedTscn.match(/\[node name="Ceiling" type="MeshInstance3D"/g)||[]).length,2,'each exposed story should receive ceiling only over its uncovered footprint');

// Independent roof objects are not owned by floors and continue to export even when automatic roofs are disabled.
const manual=makeEmptyBuilding();manual.name='Independent Roof Probe';manual.roof.type='none';
manual.floors[0].slabs.push(makeRectArea({x:-5,z:-4},{x:5,z:4},'Lower'));
const manualUpper=makeFloor('Upper');manualUpper.slabs.push(makeRectArea({x:-1,z:-2},{x:3,z:2},'Upper'));manual.floors.push(manualUpper);
const lowerManual=makeRoofSection({x:-5,z:-4},{x:-1,z:4},'gable','z','Lower Wing Roof',manual.wallHeight,42,.5);
lowerManual.gableEnds='min';
const upperBase=floorElevation(manual,1)+manual.wallHeight;
const upperManual=makeRoofSection({x:-1,z:-2},{x:3,z:2},'gable','x','Upper Roof',upperBase,35,.35);
manual.roofSections.push(lowerManual,upperManual);
assert.equal(roofSectionsForFloor(manual,0).length,0,'automatic roof type none must not remove or own manual roofs');
assert.equal(roofSectionsForFloor(manual,1).length,0,'manual roofs stay independent when automatic roofs are disabled');
const manualTscn=exportGodotFiles(manual,{collision:true,markers:false}).tscn;
assert.match(manualTscn,/name="ManualRoofs" type="Node3D" parent="\."/);
assert.match(manualTscn,/ManualRoof_001_North|ManualRoof_001_West/);
assert.match(manualTscn,/ManualRoof_002_North|ManualRoof_002_West/);
assert.match(manualTscn,/ManualRoof_001_GableFill/);
assert.match(manualTscn,/AABB\([^,]+, 5\.78,/,'upper manual gable fill should start at its absolute base height, independent of Floor_02 ownership');

// A manual roof at a story's roof height replaces automatic roof only in its own footprint.
const mixed=makeEmptyBuilding();const mixedF=mixed.floors[0];mixedF.slabs.push(makeRectArea({x:-4,z:-3},{x:4,z:3},'Base'));
const mixedBefore=roofSectionsForFloor(mixed,0);assert.ok(mixedBefore.length>=1);
mixed.roofSections.push(makeRoofSection({x:-4,z:-3},{x:0,z:3},'flat','x','Manual Half',mixed.wallHeight,35,0));
const mixedAfter=roofSectionsForFloor(mixed,0);
const mixedArea=rs=>rs.reduce((n,r)=>n+(r.maxX-r.minX)*(r.maxZ-r.minZ),0);
assert.ok(mixedArea(mixedAfter)<mixedArea(mixedBefore),'manual roof footprint should subtract from automatic roof at the same base height');

// Independent manual floors and ceilings mirror manual-roof ownership: absolute
// height, building-level objects, and same-level overlap suppresses automatic geometry.
const surfaces=makeEmptyBuilding();surfaces.name='Manual Surface Probe';const surfF=surfaces.floors[0];
surfF.slabs.push(makeRectArea({x:-4,z:-3},{x:4,z:3},'Auto Footprint'));
assert.equal(surfF.autoFloor,true);assert.equal(surfF.autoCeiling,true);
const manualFloorProbe=makeManualSurface({x:-4,z:-3},{x:0,z:3},'floor',0,.24,'Manual Left Floor');
const manualCeilingProbe=makeManualSurface({x:0,z:-3},{x:4,z:3},'ceiling',surfaces.wallHeight,.10,'Manual Right Ceiling');
surfaces.manualFloors.push(manualFloorProbe);surfaces.manualCeilings.push(manualCeilingProbe);
assert.equal(manualFloorRectanglesAtLevel(surfaces,0).length,1);assert.equal(manualCeilingRectanglesAtLevel(surfaces,surfaces.wallHeight).length,1);
const autoBase=[{minX:-4,maxX:4,minZ:-3,maxZ:3}],manualLeft=manualFloorRectanglesAtLevel(surfaces,0),remaining=subtractRectAreas(autoBase,manualLeft);
assert.equal(remaining.reduce((n,r)=>n+(r.maxX-r.minX)*(r.maxZ-r.minZ),0),24,'manual floor should replace only its same-height half of automatic floor');
const surfaceTscn=exportGodotFiles(surfaces,{collision:true,markers:false}).tscn;
assert.match(surfaceTscn,/name="ManualFloors" type="Node3D" parent="\."/);assert.match(surfaceTscn,/ManualFloor_001_Manual_Left_Floor/);assert.match(surfaceTscn,/name="ManualCeilings" type="Node3D" parent="\."/);assert.match(surfaceTscn,/ManualCeiling_001_Manual_Right_Ceiling/);assert.match(surfaceTscn,/ManualFloorCollision_001/);assert.match(surfaceTscn,/ManualCeilingCollision_001/);
// Per-story switches can turn auto surfaces off completely while manual objects remain.
surfF.autoFloor=false;surfF.autoCeiling=false;const manualOnlyTscn=exportGodotFiles(surfaces,{collision:false,markers:false}).tscn;
assert.doesNotMatch(manualOnlyTscn,/name="FloorSlab" type="MeshInstance3D" parent="Floor_01\/Geometry"/);assert.doesNotMatch(manualOnlyTscn,/name="Ceiling" type="MeshInstance3D" parent="Floor_01\/Geometry"/);assert.match(manualOnlyTscn,/name="ManualFloors"/);assert.match(manualOnlyTscn,/name="ManualCeilings"/);

// 3D preview custom geometry regression: the ramp conversion removed the old
// global `faces` symbol, so custom ramp objects must rasterize their own faces
// while ordinary boxes use `boxFaces`.
assert.doesNotMatch(previewSource,/\|\|faces\b/,'preview renderer must not reference the removed global faces constant');
assert.match(previewSource,/faceList=Array\.isArray\(o\.faces\)\?o\.faces:\[\]/,'custom ramp geometry must use its explicit face list');
assert.match(previewSource,/faceList=boxFaces/,'ordinary preview boxes must use boxFaces');

// ZIP integrity.
const zipBlob=makeStoredZip([{name:files.tscnName,data:files.tscn},...files.doors.map(d=>({name:d.filename,data:d.tscn}))]);const zipBytes=Buffer.from(await zipBlob.arrayBuffer());
const tempDir=fs.mkdtempSync(path.join(os.tmpdir(),'building-test-'));
try{const zipPath=path.join(tempDir,'package.zip');fs.writeFileSync(zipPath,zipBytes);execFileSync('unzip',['-t',zipPath],{stdio:'pipe'});}finally{fs.rmSync(tempDir,{recursive:true});}
console.log(`PASS: ${multi.floors.length} floors, ${doors.length} door scenes, ramp + stepped staircase styles, ${t.length} char TSCN`);
