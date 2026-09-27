import {prepareDocument} from './src/diagnostics.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {profileRoofFixture,profileRoofExample} from './qa/profile-roof-fixture.mjs';
import {floorView} from './src/model.js';
import {profileRoomSolids} from './src/profile-roof-envelope.js';
import {roofBoxParts,roofInteriorBlockers,roofAttachmentBlockers,trimRoofBox,trimmedGableEnds} from './src/roof-geometry.js';
import {roofWallDiagnostics} from './src/roof-wall-diagnostics.js';
import {validateBuilding} from './src/validation.js';
import {exportGodotFiles} from './src/exporter.js';
import {Preview3D} from './src/preview.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
for(const [kind,expected] of [['standard',3.088],['recessed',2.738],['flared',3.438]]){
 const b=profileRoofFixture(kind),r=b.roofSections[0],before=JSON.stringify(b),blockers=roofInteriorBlockers(b,r,r.baseY),faces=roofBoxParts(r,b.roof,r.baseY,0,true).flatMap(p=>trimRoofBox(p,blockers));
 close(Math.min(...faces.flatMap(f=>f.points.map(p=>p.x))),expected);assert.deepEqual(roofWallDiagnostics(b),[]);
 const p=Object.create(Preview3D.prototype);p.building=b;p.activeFloor=0;const roof=p.objects().find(o=>o.roofId==='canopy');assert.deepEqual(roof.mesh.vertices,faces.flatMap(f=>f.points));exportGodotFiles(b);assert.equal(JSON.stringify(b),before);
}
// Roof clipping must use the tilted profile face, rather than one constant offset.
for(const kind of ['recessed','flared'])for(const type of ['flat','gable','shed'])for(const baseY of [.2,1.4,2.5]){
 const b=profileRoofFixture(kind,type),r=b.roofSections[0];r.baseY=baseY;
 const solids=profileRoomSolids(floorView(b,0)).solids,faces=roofBoxParts(r,b.roof,r.baseY,0,true).flatMap(p=>trimRoofBox(p,roofInteriorBlockers(b,r,r.baseY))||[]);
 for(const face of faces)for(let i=1;i<face.points.length-1;i++)for(const weights of [[.2,.3,.5],[.6,.2,.2]]){const triangle=[face.points[0],face.points[i],face.points[i+1]],p=Object.fromEntries(['x','y','z'].map(k=>[k,triangle.reduce((n,v,i)=>n+v[k]*weights[i],0)]));assert.ok(!solids.some(s=>s.planes.every(q=>dot(q.n,p)<q.d-1e-6)),'roof surface enters shaped room envelope');}
}
const g=profileRoofFixture('standard','gable'),r=g.roofSections[0],clipped=trimmedGableEnds(r,r.baseY,.18,roofInteriorBlockers(g,r,r.baseY));assert.ok(clipped);assert.equal(clipped[0].faces.length,0);assert.ok(clipped[1].faces.length);
const exported=exportGodotFiles(g).tscn;assert.match(exported,/ManualGableCollision_001_Trimmed/);assert.doesNotMatch(exported,/StandardMaterial3D/);
const gap=profileRoofFixture();gap.roofSections[0].minX=3;const diagnostic=roofWallDiagnostics(gap);assert.equal(diagnostic.length,1);assert.equal(diagnostic[0].wallId,'wall_1');close(diagnostic[0].gap,.26);assert.match(validateBuilding(gap).warnings[0].message,/26.0 cm/);
gap.roofSections[0].minX=20;gap.roofSections[0].maxX=22;assert.deepEqual(roofWallDiagnostics(gap),[]);
const round=JSON.parse(fs.readFileSync('examples/round_bounding.building.json'));round.wallTypes=profileRoofFixture().wallTypes;round.floors[0].openings=[];for(const w of round.floors[0].walls)w.wallTypeId='hull';assert.ok(!profileRoomSolids(floorView(round,0)).reason);
const cutout=profileRoofFixture();cutout.floors[0].regions=[{id:'cut',label:'Cut',kind:'courtyard',effect:'void',minX:-1,maxX:1,minZ:-1,maxZ:1}];assert.ok(!profileRoomSolids(floorView(cutout,0)).reason);assert.deepEqual(roofWallDiagnostics(cutout),[]);
const unsupported=profileRoofFixture();unsupported.floors[0].walls[1].height=1;assert.match(profileRoomSolids(floorView(unsupported,0)).reason,/full-height/);assert.ok(roofWallDiagnostics(unsupported).some(r=>r.status==='unsupported'));
assert.deepEqual(validateBuilding(profileRoofExample()).warnings,[]);
console.log('PASS profile roof cuts: exact contact, preview parity, bend heights across three roof types, gable removal, material defaults, measured gap warnings, detached roofs, round envelopes, cutouts and unsupported height guidance');

const width=profileRoofFixture();for(const q of width.wallTypes[0].stations)q.thickness=q.height===0?.36:.18;assert.ok(!profileRoomSolids(floorView(width,0)).reason);delete width.floors[0].walls[0].wallTypeId;assert.match(profileRoomSolids(floorView(width,0)).reason,/matching wall thickness/);
console.log('PASS shared variable thickness envelope and explicit mixed-corner thickness guard');

const raw=profileRoofFixture();delete raw.roof;delete raw.wallThickness;assert.deepEqual(prepareDocument(raw).errors,[]);console.log('PASS shaped legacy input receives defaults before roof-contact diagnostics');
