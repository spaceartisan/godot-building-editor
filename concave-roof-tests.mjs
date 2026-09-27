import assert from 'node:assert/strict';
import {concaveRoofFixture,concaveRoofExample} from './qa/concave-roof-fixture.mjs';
import {floorView} from './src/model.js';
import {profileRoomSolids} from './src/profile-roof-envelope.js';
import {roofBoxParts,roofInteriorBlockers,trimRoofBox} from './src/roof-geometry.js';
import {sampleWallType} from './src/wall-types.js';
import {regionAreaCells} from './src/regions.js';
import {areaSize} from './src/polygon-areas.js';
import {roofWallDiagnostics} from './src/roof-wall-diagnostics.js';
import {exportGodotFiles} from './src/exporter.js';
import {validateBuilding} from './src/validation.js';
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const inside=(solids,p)=>solids.some(s=>s.planes.every(q=>dot(q.n,p)<=q.d+1e-7));
// Independent even/odd oracle: offset the authored loops, then query a dense
// horizontal slice. This also checks empty courtyards and disconnected rooms.
function oracle(plan,view,y,p){
 let hit=false;
 for(const loop of plan.loops){const corners=loop.map((side,i)=>{
  const previous=loop[(i+loop.length-1)%loop.length],distance=s=>{if(s.fixed)return s.d;const q=sampleWallType(s.type,y/view.wallHeight,view.wallThickness);return s.d+s.sign*q.offset+q.thickness/2-.002;};
  const a=distance(previous),b=distance(side),det=previous.n.x*side.n.z-previous.n.z*side.n.x;
  if(Math.abs(det)<1e-8)return {x:side.a.x+side.n.x*(b-side.d),z:side.a.z+side.n.z*(b-side.d)};
  return {x:(a*side.n.z-previous.n.z*b)/det,z:(previous.n.x*b-a*side.n.x)/det};
 });for(let i=0,j=corners.length-1;i<corners.length;j=i++){const a=corners[i],b=corners[j];if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)hit=!hit;}}
 return hit;
}
let samples=0;
assert.equal(regionAreaCells(concaveRoofFixture('diamond').floors[0].regions[0]).reduce((sum,r)=>sum+areaSize(r),0),8,'Diamond uses polygon geometry, not its rectangular bounds');
for(const shape of ['u','l','courtyard','islands','void','diamond'])for(const kind of ['recessed','flared'])for(const angle of [0,.37]){
 const b=concaveRoofFixture(shape,kind),c=Math.cos(angle),s=Math.sin(angle),rotate=p=>({x:p.x*c-p.z*s,z:p.x*s+p.z*c});
 for(const w of b.floors[0].walls){w.a=rotate(w.a);w.b=rotate(w.b);}for(const r of b.floors[0].regions||[]){r.polygon=(r.polygon||[{x:r.minX,z:r.minZ},{x:r.maxX,z:r.minZ},{x:r.maxX,z:r.maxZ},{x:r.minX,z:r.maxZ}]).map(rotate);r.minX=Math.min(...r.polygon.map(p=>p.x));r.maxX=Math.max(...r.polygon.map(p=>p.x));r.minZ=Math.min(...r.polygon.map(p=>p.z));r.maxZ=Math.max(...r.polygon.map(p=>p.z));}
 const view=floorView(b,0),plan=profileRoomSolids(view);assert.ok(!plan.reason,`${shape}/${kind}/${angle}: ${plan.reason}`);assert.ok(plan.solids.length);
 for(const y of [-.09,.11,.43,1.46,2.49,2.73])for(let x=-7.013;x<7;x+=.431)for(let z=-6.021;z<6;z+=.473){const p={x,y,z};assert.equal(inside(plan.solids,p),oracle(plan,view,y,p),`${shape}/${kind}/${angle}: ${JSON.stringify(p)}`);samples++;}
 // Every clipped polyhedron has outward planes and vertices on or inside them.
 for(const solid of plan.solids)for(const f of solid.faces)for(const p of f.points)for(const q of solid.planes)assert.ok(dot(q.n,p)<=q.d+1e-6);
 const shifted=profileRoomSolids(view,7,2);for(const p of [{x:3,y:1.46,z:0},{x:0,y:.43,z:0}])assert.equal(inside(shifted.solids,{...p,y:p.y+5}),inside(plan.solids,p));
}
for(const shape of ['u','courtyard','islands','void']){
 const b=concaveRoofFixture(shape),r=b.roofSections[0],faces=roofBoxParts(r,b.roof,r.baseY,0,true).flatMap(p=>trimRoofBox(p,roofInteriorBlockers(b,r,r.baseY))||[]),maxX=Math.max(...faces.flatMap(f=>f.points.map(p=>p.x)));
 assert.ok(Math.abs(maxX-(shape==='void'?2:2.262))<1e-6,`${shape}: cut at ${maxX}`);
 assert.ok(faces.some(f=>f.points.some(p=>p.x===0)),'opening canopy remains');
}
const collapsed=concaveRoofFixture('islands','flared');for(const w of collapsed.floors[0].walls)for(const p of [w.a,w.b])p.x+=p.x<0?1.7:-1.7;
assert.match(profileRoomSolids(floorView(collapsed,0)).reason,/collapses|cross|touch/);
assert.ok(validateBuilding(collapsed).warnings.some(w=>/reduce the offset/.test(w.message)));
const example=concaveRoofExample(),before=JSON.stringify(example),files=exportGodotFiles(example);assert.equal(JSON.stringify(example),before);assert.deepEqual(validateBuilding(example).warnings,[]);for(const shell of ['OutsideFaces','InsideFaces','EdgeFaces'])assert.ok(files.tscn.includes(shell));assert.doesNotMatch(files.tscn,/StandardMaterial3D/);
const edgeCut=concaveRoofFixture('void');Object.assign(edgeCut.floors[0].regions[0],{minX:0,maxX:8,minZ:-8,maxZ:8});const edgePlan=profileRoomSolids(floorView(edgeCut,0));assert.ok(!edgePlan.reason,edgePlan.reason);assert.equal(inside(edgePlan.solids,{x:1,y:1.4,z:0}),false);assert.equal(inside(edgePlan.solids,{x:-1,y:1.4,z:0}),true);
edgeCut.roofSections[0].minX=5;edgeCut.roofSections[0].maxX=7;const notice=roofWallDiagnostics(edgeCut);assert.ok(notice.some(w=>w.message.includes('does not bound')));assert.ok(notice.every(w=>!w.message.includes('undefined')));
console.log(`PASS concave roof envelopes: ${samples} slice checks over 24 shape/profile/rotation cases, exact canopy limits, elevation, collapse guidance and separate lighting shells`);
