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
{
  // Non-right-angle junctions (Standard walls): ends are mitered against their
  // angular neighbours. Before, each end was extended by half the thickness
  // along its axis, which left nubs whose end caps showed as EdgeFaces strips
  // at obtuse corners and three-way junctions (found in interior surface-colour
  // renders of editable_junctions and on the octagon outline examples).
  const vertical=t=>{const u={x:t[1].x-t[0].x,y:t[1].y-t[0].y,z:t[1].z-t[0].z},v={x:t[2].x-t[0].x,y:t[2].y-t[0].y,z:t[2].z-t[0].z};const c={x:u.y*v.z-u.z*v.y,y:u.z*v.x-u.x*v.z,z:u.x*v.y-u.y*v.x};return Math.abs(c.y)<1e-9*Math.hypot(c.x,c.y,c.z)+1e-12;};
  const nearJ=(x,z,r)=>t=>t.every(p=>Math.hypot(p.x-x,p.z-z)<r);
  // Octagon outline: every corner turns 45 degrees.
  const oct=[[-4,1],[-4,-1],[-1,-4],[1,-4],[4,-1],[4,1],[1,4],[-1,4]];
  const o=building([oct.map((p,i)=>wall(`o${i}`,p,oct[(i+1)%oct.length]))],.18),om=buildExteriorMeshData(floorView(o,0));
  assert.equal(sum(om.edges,t=>vertical(t)&&oct.some(([x,z])=>nearJ(x,z,.3)(t))),0,'no end caps at octagon corners');
  const perimeter=oct.reduce((s,p,i)=>{const q=oct[(i+1)%oct.length];return s+Math.hypot(q[0]-p[0],q[1]-p[1]);},0);
  // Outer face length of a regular-angle polygon: centreline + 2*(t/2)*tan(22.5deg) per corner.
  const outer=perimeter+oct.length*2*.09*Math.tan(Math.PI/8);
  assert.ok(near(sum(om.outside),outer*2.8,1e-6),`octagon siding closes exactly: ${sum(om.outside)} vs ${outer*2.8}`);
  // Y junction of three interior walls inside a room.
  const {buildInteriorSplitMeshData}=await import('./src/exporter.js');
  const y=building([[...loop('r',-5,-5,5,5),wall('w6',[-4,0],[1,0],{role:'interior'}),wall('w7',[1,0],[0,4],{role:'interior'}),wall('w8',[1,0],[0,-3],{role:'interior'})]],.18),ym=buildInteriorSplitMeshData(floorView(y,0));
  assert.equal(sum(ym.edges,t=>vertical(t)&&nearJ(1,0,.4)(t)),0,'no end caps at the Y junction');
  console.log('PASS junction miters: no nubs at obtuse corners or three-way junctions; siding closes');
}
{
  // Halcyon H5: sharp exterior corners get a miter limit. The outer apex of a
  // θ corner lies ht/sin(θ/2) behind the junction; beyond 4 half-thicknesses
  // it is bevelled, so a 1° corner no longer grows a 10 m wall-top sheet.
  const ht=.25,limit=4*ht;
  const hitX=(meshes,y,z)=>{let best=Infinity;for(const m of Object.values(meshes))for(const t of triangles(m)){
    // Ray from x = -50 along +X at height y, depth z.
    const [a,b,c]=t,e1={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},e2={x:c.x-a.x,y:c.y-a.y,z:c.z-a.z},p={x:0,y:-e2.z,z:e2.y},det=e1.x*p.x+e1.y*p.y+e1.z*p.z;if(Math.abs(det)<1e-12)continue;
    const s={x:-50-a.x,y:y-a.y,z:z-a.z},u=(s.x*p.x+s.y*p.y+s.z*p.z)/det;if(u<-1e-9||u>1+1e-9)continue;const q={x:s.y*e1.z-s.z*e1.y,y:s.z*e1.x-s.x*e1.z,z:s.x*e1.y-s.y*e1.x},v=q.x/det;if(v<-1e-9||u+v>1+1e-9)continue;
    const d=(e2.x*q.x+e2.y*q.y+e2.z*q.z)/det;if(d>0)best=Math.min(best,d-50);}return best;};
  for(const deg of [1,5,10,30]){
    const t=deg*Math.PI/180,C=[20*Math.cos(t),20*Math.sin(t)];
    const b=building([[wall('a',[0,0],[20,0]),wall('b',[20,0],C),wall('c',C,[0,0])]]),meshes=buildExteriorMeshData(floorView(b,0));
    const minX=Math.min(...Object.values(meshes).flatMap(m=>m.vertices.map(p=>p.x)));
    const apex=-ht/Math.sin(t/2)*Math.cos(t/2);
    if(ht/Math.sin(t/2)>limit){
      // Every vertex lies within the limit along the apex direction w.
      const w={x:-Math.cos(t/2),z:-Math.sin(t/2)},reach=Math.max(...Object.values(meshes).flatMap(m=>m.vertices.map(p=>p.x*w.x+p.z*w.z)));
      assert.ok(reach<=limit+1e-6,`${deg}°: shell stays within the miter limit (${reach.toFixed(4)} m)`);
      // The bevel face closes the apex: a ray along +X at z = 0 meets the
      // bevel plane (normal along the apex direction) at -limit/cos(θ/2).
      const x=hitX(meshes,1.4,0);assert.ok(near(x,-limit/Math.cos(t/2),1e-6),`${deg}°: bevelled apex is closed (${x})`);
    }else assert.ok(near(minX,apex,1e-4),`${deg}°: blunter corners keep the sharp miter (${minX} vs ${apex})`);
  }
  console.log('PASS miter limit: corners sharper than about 29° are bevelled within 4 half-thicknesses and stay closed');
}
