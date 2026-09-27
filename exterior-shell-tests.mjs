import assert from 'node:assert/strict';
import { buildExteriorMeshData, buildProfileMeshData } from './src/exporter.js';
import { floorView, makeEmptyBuilding, makeFloor } from './src/model.js';
import { prepareDocument } from './src/diagnostics.js';

// Exterior shell regressions found in Godot renders of the Ravenhold castle:
// corner siding replaced by end caps (EdgeFaces strips), holes in the story
// skirt at corners, and open parapet chains flipping outside/inside faces.
const wall=(id,a,b,extra={})=>({id,a:{x:a[0],z:a[1]},b:{x:b[0],z:b[1]},role:'exterior',height:null,label:'',...extra});
const loop=(p,x0,z0,x1,z1)=>[[x0,z0,x1,z0],[x1,z0,x1,z1],[x1,z1,x0,z1],[x0,z1,x0,z0]].map(([a,c,d,e],i)=>wall(`${p}${i}`,[a,c],[d,e]));
function building(floors,thickness=.5,extra={}){
  const b={...makeEmptyBuilding(),...extra};b.wallThickness=thickness;b.roof={...b.roof,type:'none'};
  b.floors=floors.map((walls,i)=>({...makeFloor(`F${i+1}`),id:`f${i+1}`,walls}));
  return prepareDocument(b).building;
}
const triangles=writer=>{const out=[];for(let i=0;i<writer.vertices.length;i+=3)out.push(writer.vertices.slice(i,i+3));return out;};
const area=t=>{const u={x:t[1].x-t[0].x,y:t[1].y-t[0].y,z:t[1].z-t[0].z},v={x:t[2].x-t[0].x,y:t[2].y-t[0].y,z:t[2].z-t[0].z};return Math.hypot(u.y*v.z-u.z*v.y,u.z*v.x-u.x*v.z,u.x*v.y-u.y*v.x)/2;};
const sum=(writer,keep=()=>true)=>triangles(writer).filter(keep).reduce((n,t)=>n+area(t),0);
const near=(a,b,tol=1e-6)=>Math.abs(a-b)<=tol;

{
  // 8 x 6 m room, 0.5 m walls, 2.8 m story: the outer siding must wrap every corner.
  const b=building([loop('w',-4,-3,4,3)]),m=buildExteriorMeshData(floorView(b,0));
  const outerPerimeter=2*(8.5+6.5);
  assert.ok(near(sum(m.outside),outerPerimeter*2.8,1e-6),`outside area ${sum(m.outside)} != ${outerPerimeter*2.8}`);
  const onOuterBoundary=t=>[4.25,-4.25].some(x=>t.every(p=>near(p.x,x)))||[3.25,-3.25].some(z=>t.every(p=>near(p.z,z)));
  assert.equal(sum(m.edges,onOuterBoundary),0,'no end caps on the outer faces at corners');
  console.log('PASS exterior corners: siding wraps convex corners of thick walls; no EdgeFaces strips');
}
{
  // Upper story: the slab-edge skirt must also wrap the corners (no seam holes).
  const b=building([loop('a',-4,-3,4,3),loop('b',-4,-3,4,3)]),v=floorView(b,1),m=buildExteriorMeshData(v);
  const skirt=v.storyFloorSkirt;assert.ok(skirt>0);
  assert.ok(near(sum(m.outside),2*(8.5+6.5)*(2.8+skirt),1e-6),`upper outside area ${sum(m.outside)}`);
  console.log('PASS story skirt: corner bands are covered on upper floors');
}
{
  // A closed room plus an open parapet chain beside it. The parapet must not
  // flip which side of the room walls is outside.
  const b=building([[...loop('r',0,0,4,4),wall('p',[6,-2],[6,6],{height:1})]]),m=buildExteriorMeshData(floorView(b,0));
  const westOutside=triangles(m.outside).filter(t=>t.every(p=>near(p.x,-.25))),westInside=triangles(m.inside).filter(t=>t.every(p=>near(p.x,.25)));
  assert.ok(westOutside.length>0,'west wall siding faces away from the room (x = -0.25)');
  assert.ok(westInside.length>0,'west wall plaster faces into the room (x = +0.25)');
  assert.equal(triangles(m.inside).filter(t=>t.every(p=>near(p.x,-.25))).length,0,'no plaster on the outer face');
  console.log('PASS outside side: open parapet chains do not flip closed-loop walls');
}
{
  // Shaped-wall path (Kestrel starship): the story-seam skirt underside lies on
  // the lower story's ceiling plane and z-fought with it in Godot. Neither the
  // exterior nor an interior partition may emit it; the skirt sides remain.
  const flare={id:'flare',label:'Flare',stations:[{height:0,offset:0,thickness:.25},{height:.2,offset:-.3,thickness:.25},{height:.8,offset:-.3,thickness:.25},{height:1,offset:0,thickness:.25}]};
  const upper=[...loop('u',-4,-3,4,3).map(w=>({...w,wallTypeId:'flare'})),wall('p',[0,-3],[0,3],{role:'interior'})];
  const b=building([loop('l',-5,-4,5,4),upper],.25,{wallTypes:[flare]}),v=floorView(b,1),skirt=v.storyFloorSkirt,m=buildProfileMeshData(v);
  assert.ok(skirt>0);
  const underside=t=>t.every(p=>near(p.y,-skirt));
  for(const key of ['exteriorEdges','interiorEdges'])assert.equal(sum(m[key],underside),0,`${key}: no skirt underside at y = -${skirt}`);
  assert.ok(sum(m.outside,t=>t.every(p=>p.y<=1e-9))>0,'skirt band siding is still emitted');
  console.log('PASS shaped story skirt: no underside coplanar with the lower ceiling');
}
