import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepareDocument,inspectFloorCoverage} from './src/diagnostics.js';
import {floorView,footprintInfo,roofSectionsForFloor,structuralFloorRectangles,exteriorFootprintIssue,subtractRectAreas,makeFloor,makeStair} from './src/model.js';
import {areaPoints,areaSize,containsArea,polygonArea,polygonBoundary} from './src/polygon-areas.js';
import {polygonSlabFaces,polygonRoofParts} from './src/polygon-geometry.js';
import {roofInteriorBlockers,roofBoxParts,trimRoofBox} from './src/roof-geometry.js';
import {buildSlabFaceMeshData,exportGodotFiles,floorRectanglesForView} from './src/exporter.js';
import {validateBuilding} from './src/validation.js';
import {createEditorHarness} from './qa/editor-harness.mjs';
const load=()=>prepareDocument(JSON.parse(fs.readFileSync(new URL('examples/round_bounding.building.json',import.meta.url)))).building;
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
function volume(faces){let v=0;for(const f of faces)for(let i=1;i<f.points.length-1;i++){const n=cross(sub(f.points[i],f.points[0]),sub(f.points[i+1],f.points[0]));assert.ok(dot(n,f.normal)>1e-9);v+=dot(f.points[0],cross(f.points[i],f.points[i+1]))/6;}return v;}
const b=load(),view=floorView(b,0),area=structuralFloorRectangles(view);
assert.equal(exteriorFootprintIssue(view),null);close(footprintInfo(view).area,52);close(inspectFloorCoverage(b,0).area,52);
assert.equal(area.length,1);assert.equal(areaPoints(area[0]).length,12);assert.ok(!containsArea(area[0],{x:3.8,z:3.8}));
for(const t of [.02,.18,.7]){const faces=polygonSlabFaces(area,t,2.8);close(volume(Object.values(faces).flat()),52*t);const meshes=buildSlabFaceMeshData(area,t,2.8);for(const mesh of Object.values(meshes))assert.ok(mesh.vertices.every(p=>containsArea(area[0],p)));}
// Input order and wall direction do not determine coverage.
const shuffled=structuredClone(view);shuffled.walls.reverse();for(const w of shuffled.walls)[w.a,w.b]=[w.b,w.a];assert.deepEqual(structuralFloorRectangles(shuffled),area);
const crossing=structuredClone(view),bow=[{x:-1,z:-1},{x:1,z:1},{x:-1,z:1},{x:1,z:-1}];crossing.walls=bow.map((a,i)=>({a,b:bow[(i+1)%4],role:'exterior'}));assert.match(exteriorFootprintIssue(crossing),/cross/);
const original=JSON.stringify(b);exportGodotFiles(b);assert.equal(JSON.stringify(b),original);
console.log('PASS round coverage: 52 square metres, 12 edges, correct slab volume/winding, no square corners, order invariance and immutable export');

const cut={minX:-1,maxX:1,minZ:-1,maxZ:1},holed=subtractRectAreas(area,[cut]);close(holed.reduce((n,r)=>n+areaSize(r),0),48);
assert.ok(!holed.some(r=>containsArea(r,{x:0,z:0})));close(volume(Object.values(polygonSlabFaces(holed,.18)).flat()),48*.18);
for(const {a,b:end} of polygonBoundary(holed)){const dx=end.x-a.x,dz=end.z-a.z,l=Math.hypot(dx,dz),p={x:(a.x+end.x)/2,z:(a.z+end.z)/2};assert.notEqual(holed.some(r=>containsArea(r,{x:p.x+dz/l*1e-4,z:p.z-dx/l*1e-4})),holed.some(r=>containsArea(r,{x:p.x-dz/l*1e-4,z:p.z+dx/l*1e-4})));}
// A thin surviving strip must not disappear because of authored rectangle limits.
const strip=subtractRectAreas(area,[{minX:-5,maxX:3.99,minZ:-5,maxZ:5}]);assert.ok(strip.reduce((n,r)=>n+areaSize(r),0)>0);assert.ok(structuralFloorRectangles({...view,regions:[{...cut,effect:'void'}]}).length>1);
const concave=structuredClone(view),points=[{x:0,z:0},{x:6,z:0},{x:5,z:2},{x:2,z:2},{x:2,z:5},{x:0,z:6}];concave.walls=points.map((a,i)=>({id:'c'+i,a,b:points[(i+1)%points.length],role:'exterior'}));
close(footprintInfo(concave).area,areaSize(polygonArea(points)));assert.ok(!structuralFloorRectangles(concave).some(r=>containsArea(r,{x:4,z:4})));
const courtyard=structuredClone(view),inner=[{x:-1,z:0},{x:0,z:1},{x:1,z:0},{x:0,z:-1}];
courtyard.walls.push(...inner.map((a,i)=>({id:'hole'+i,a,b:inner[(i+1)%4],role:'exterior'})));
close(footprintInfo(courtyard).area,50);assert.ok(!structuralFloorRectangles(courtyard).some(r=>containsArea(r,{x:0,z:0})));
const rectangle={minX:-5,maxX:5,minZ:-2,maxZ:2,type:'hip'};
const rectangularHip=polygonRoofParts(rectangle,{pitch:35,overhang:0},2.8);assert.equal(rectangularHip.length,4);
const ridge=rectangularHip.flatMap(p=>p.solid.faces.flatMap(f=>f.points)).filter(p=>Math.abs(p.y-(2.92+2*Math.tan(35*Math.PI/180)))<1e-5);
assert.ok(ridge.some(p=>Math.abs(p.x-3)<1e-5)&&ridge.some(p=>Math.abs(p.x+3)<1e-5));
const upper=structuredClone(b.floors[0]);upper.id='upper';for(const w of upper.walls)w.id+='up';upper.openings=[];b.floors.push(upper);b.floors[0].stairs=[makeStair({x:0,z:1.5},{x:0,z:-1.5},1,'ramp',12,'Stair')];
const upperAreas=floorRectanglesForView(floorView(b,1),b.floors[0].stairs);assert.ok(!upperAreas.some(r=>containsArea(r,{x:0,z:0})));assert.equal(roofSectionsForFloor(b,0).length,0);
console.log('PASS cutouts and concave outlines: boolean areas, exposed boundaries, narrow remnants, stair opening and stacked roof suppression');

for(const type of ['hip','flat'])for(const pitch of [5,35,70])for(const overhang of [0,.35,1]){
 const roof={type,pitch,overhang},section={...area[0],type},parts=polygonRoofParts(section,roof,2.8);assert.ok(parts.length);let total=0;
 for(const part of parts){total+=volume(part.solid.faces);for(const f of part.solid.faces)for(const p of f.points)assert.ok(part.solid.planes.every(q=>dot(p,q.n)<=q.d+1e-5));}
 assert.ok(total>52*.1199);
 const trimmed=parts.flatMap(p=>trimRoofBox(p,[{minX:-.5,maxX:.5,minZ:-6,maxZ:6,minY:-1,maxY:20}]));
 assert.ok(volume(trimmed)>0);for(const f of trimmed)for(const p of f.points)assert.ok(Math.abs(p.x)>=.5-1e-5||Math.abs(p.z)>=6-1e-5);
}
const host=load(),child={type:'flat',direction:'x',minX:3,maxX:6,minZ:-1,maxZ:1,baseY:1.8,overhang:0};
const blockers=roofInteriorBlockers(host,child,1.8),parts=roofBoxParts(child,{type:'flat',overhang:0},1.8,0,true),faces=parts.flatMap(p=>trimRoofBox(p,blockers));assert.ok(volume(faces)>0);for(const f of faces)for(const p of f.points)assert.ok(p.x>=4.08);
console.log('PASS hip/flat geometry: all pitches/overhangs, outward normals, positive closed volumes, capped solid cuts and roof-to-polygon-wall clipping');

const e=await createEditorHarness();e.loadBuildingData(load());assert.match(e.$('#footprint-status').textContent,/52.0 m²/);
e.$('#roof-type').value='flat';await e.$('#roof-type').dispatch('change');assert.equal(e.snapshot().roof.type,'flat');assert.deepEqual(exportGodotFiles(e.snapshot()).tscn,exportGodotFiles({...load(),roof:{...load().roof,type:'flat'}}).tscn);
await e.$('#undo-btn').click();assert.equal(e.snapshot().roof.type,'hip');assert.equal(e.errors.length,0);
const old=load();old.roof.type='gable';assert.ok(validateBuilding(old).warnings.some(w=>/choose Hip/.test(w.message)));assert.ok(!validateBuilding(load()).warnings.length);
console.log('PASS real web roof selector, outline feedback, undo, export parity and legacy gable guidance');
{
  // Many-cornered concave outlines (a 256-corner star) split into convex cells
  // quickly and exactly; the cell merge used to take about 45 s here.
  const {wallPolygonAreas}=await import('./src/polygon-areas.js');
  const n=256,star=Array.from({length:n},(_,i)=>{const a=-i/n*Math.PI*2,r=i%2?9:10;return {x:+(Math.cos(a)*r).toFixed(3),z:+(Math.sin(a)*r).toFixed(3)};});
  const started=performance.now(),cells=wallPolygonAreas(star.map((a,i)=>({a,b:star[(i+1)%n]})));
  assert.ok(performance.now()-started<8000,`star split took ${performance.now()-started} ms`);
  const exact=Math.abs(star.reduce((s,a,i)=>{const b=star[(i+1)%n];return s+a.x*b.z-b.x*a.z;},0))/2;
  close(cells.reduce((s,c)=>s+areaSize(c),0),exact);
  console.log('PASS 256-corner concave outline: fast convex cell split with exact area');
}
