import {polygonBoundary,unionPolygonAreas} from './polygon-areas.js';
import {polygonPrism} from './polygon-geometry.js';
import {regionAreaCells} from './regions.js';
import {exteriorFootprintIssue,wallHeightFor} from './model.js';
import {wallTypeFor,sampleWallType} from './wall-types.js';
import {clippedSolid} from './roof-geometry.js';
// A changing concave polygon cannot be represented by the intersection of all
// its wall planes. Sweep even/odd interior spans instead, leaving holes empty.
// Wall edges move with their outside profile; authored void edges stay fixed.
// Within each profile band the boundary normals are constant and their plane
// distances are linear in Y, so corner trajectories are linear as well.
const EPS=1e-6,dot=(a,b)=>a.x*b.x+a.z*b.z,near=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)<EPS;
const reject=reason=>({active:true,reason});
const at=(p,t)=>({x:p.a.x+(p.b.x-p.a.x)*t,z:p.a.z+(p.b.z-p.a.z)*t});
function sideOffset(side,y,view){if(side.fixed)return 0;const p=sampleWallType(side.type,y/view.wallHeight,view.wallThickness);return side.sign*p.offset+p.thickness/2-.002;}
export function concaveEnvelopePlan(view,areas){
  if(exteriorFootprintIssue(view))return reject('shaped roof fitting needs closed exterior wall loops');
  const boundary=polygonBoundary(areas);if(!boundary.length)return reject('the shaped room has no remaining footprint');
  if(boundary.length>128)return reject('this footprint is too complex for shaped roof fitting; simplify its boundary');
  const voidEdges=polygonBoundary(unionPolygonAreas((view.regions||[]).filter(r=>r.effect==='void').flatMap(regionAreaCells))),sides=[];
  for(const segment of boundary){
    const {a,b}=segment,dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz),tangent={x:dx/length,z:dz/length},n={x:dz/length,z:-dx/length},d=dot(n,a),along=p=>dot(tangent,{x:p.x-a.x,z:p.z-a.z});
    const walls=view.walls.filter(w=>w.role!=='interior'&&[w.a,w.b].every(p=>Math.abs(dot(n,p)-d)<EPS)&&Math.min(along(w.a),along(w.b))<length-EPS&&Math.max(along(w.a),along(w.b))>EPS);
    const covers=list=>{let covered=0;for(const [start,end] of list.map(w=>[Math.min(along(w.a),along(w.b)),Math.max(along(w.a),along(w.b))]).sort((a,b)=>a[0]-b[0])){if(start>covered+EPS)break;covered=Math.max(covered,end);}return covered>=length-EPS;};
    if(!covers(walls)){
      const cuts=voidEdges.filter(w=>[w.a,w.b].every(p=>Math.abs(dot(n,p)-d)<EPS));
      if(!covers(cuts))return reject('the roof footprint must follow exterior walls or authored void edges');
      sides.push({...segment,n,d,tangent,fixed:true,wallIds:[],type:null,sign:0});continue;
    }
    if(walls.some(w=>Math.abs(wallHeightFor(view,w)-view.wallHeight)>EPS))return reject('shaped roof fitting needs full-height exterior walls');
    const descriptors=walls.map(w=>{const l=Math.hypot(w.b.x-w.a.x,w.b.z-w.a.z),raw={x:-(w.b.z-w.a.z)/l,z:(w.b.x-w.a.x)/l};return {wall:w,type:wallTypeFor(view,w),sign:w.inwardSide==='left'?-dot(n,raw):w.inwardSide==='right'?dot(n,raw):-1};});
    const levels=[0,view.wallHeight,...descriptors.flatMap(s=>(s.type?.stations||[]).map(p=>p.height*view.wallHeight))];
    if(levels.some(y=>descriptors.some(s=>Math.abs(sideOffset(s,y,view)-sideOffset(descriptors[0],y,view))>EPS)))return reject('collinear exterior sections need the same outside profile for roof fitting');
    sides.push({...segment,n,d,tangent,...descriptors[0],wallIds:walls.map(w=>w.id)});
  }
  const loops=[],pending=new Set(sides);
  while(pending.size){const first=pending.values().next().value,loop=[first];pending.delete(first);let end=first.b;
    while(!near(end,first.a)){const next=[...pending].filter(s=>near(s.a,end));if(next.length!==1)return reject('the shaped footprint boundary touches or branches');loop.push(next[0]);pending.delete(next[0]);end=next[0].b;}
    if(loop.length<3)return reject('the shaped footprint boundary is incomplete');loops.push(loop);
  }
  const wallSides=sides.filter(s=>!s.fixed),levels=[0,view.wallHeight,...wallSides.flatMap(s=>(s.type?.stations||[]).map(p=>p.height*view.wallHeight))];
  if(levels.some(y=>wallSides.some(s=>Math.abs(sampleWallType(s.type,y/view.wallHeight,view.wallThickness).thickness-sampleWallType(wallSides[0].type,y/view.wallHeight,view.wallThickness).thickness)>EPS)))return reject('roof fitting needs matching wall thickness at exterior corners');
  const points=boundary.flatMap(s=>[s.a,s.b]),area={minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minZ:Math.min(...points.map(p=>p.z)),maxZ:Math.max(...points.map(p=>p.z))};
  return {active:true,general:true,loops,sides,area};
}
function vertexAt(previous,side,y,view){
  const a=previous.d+sideOffset(previous,y,view),b=side.d+sideOffset(side,y,view),det=previous.n.x*side.n.z-previous.n.z*side.n.x;
  if(Math.abs(det)<1e-8){if(dot(previous.n,side.n)<.99||Math.abs(a-b)>EPS)return null;const delta=b-side.d;return {x:side.a.x+side.n.x*delta,z:side.a.z+side.n.z*delta};}
  return {x:(a*side.n.z-previous.n.z*b)/det,z:(previous.n.x*b-a*side.n.x)/det};
}
// Intersect linear inequalities f(t)>=0 over a vertical band. This checks
// moving segment contacts exactly, including crossings between sampled heights.
function feasible(values,lo=0,hi=1){
  for(const [a,b] of values){const slope=b-a;if(Math.abs(slope)<1e-10){if(a< -EPS)return null;continue;}const t=(-EPS-a)/slope;if(slope>0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi+1e-9)return null;}
  return [lo,hi];
}
function movingEdgesCross(a,b){
  const det=a.side.n.x*b.side.n.z-a.side.n.z*b.side.n.x;
  if(Math.abs(det)>1e-8){
    const points=[0,1].map(t=>{const ad=dot(a.side.n,at(a.a,t)),bd=dot(b.side.n,at(b.a,t));return {x:(ad*b.side.n.z-a.side.n.z*bd)/det,z:(a.side.n.x*bd-ad*b.side.n.x)/det};});
    const values=[];for(const edge of [a,b]){values.push([0,1].map(t=>dot(edge.side.tangent,{x:points[t].x-at(edge.a,t).x,z:points[t].z-at(edge.a,t).z})),[0,1].map(t=>dot(edge.side.tangent,{x:at(edge.b,t).x-points[t].x,z:at(edge.b,t).z-points[t].z})));}return !!feasible(values);
  }
  const distance=[0,1].map(t=>dot(a.side.n,{x:at(b.a,t).x-at(a.a,t).x,z:at(b.a,t).z-at(a.a,t).z}));
  const difference=distance[1]-distance[0];let lo=0,hi=1;
  if(Math.abs(difference)<1e-10){if(Math.abs(distance[0])>EPS)return false;}
  else{lo=hi=-distance[0]/difference;if(lo< -EPS||lo>1+EPS)return false;lo=hi=Math.max(0,Math.min(1,lo));}
  const projected=t=>{const av=[at(a.a,t),at(a.b,t)].map(p=>dot(a.side.tangent,p)),bv=[at(b.a,t),at(b.b,t)].map(p=>dot(a.side.tangent,p));return [Math.max(...av)-Math.min(...bv),Math.max(...bv)-Math.min(...av)];};
  const first=projected(0),last=projected(1);return !!feasible([[first[0],last[0]],[first[1],last[1]]],lo,hi);
}
const plane=(n,d)=>{const l=Math.hypot(n.x,n.y,n.z);return {n:{x:n.x/l,y:n.y/l,z:n.z/l},d:d/l};};
export function concaveRoomSolids(view,plan,elevation,originY){
  const fail=reason=>({...plan,reason,solids:[]}),height=view.wallHeight,levels=[-view.floorThickness,0,height,...plan.sides.flatMap(s=>(s.type?.stations||[]).map(p=>p.height*height))].sort((a,b)=>a-b).filter((v,i,a)=>!i||v-a[i-1]>EPS),solids=[];
  for(let band=1;band<levels.length;band++){
    const low=levels[band-1],high=levels[band],edges=[],vertices=[];
    for(const loop of plan.loops){const tracks=loop.map((s,i)=>({a:vertexAt(loop[(i+loop.length-1)%loop.length],s,low,view),b:vertexAt(loop[(i+loop.length-1)%loop.length],s,high,view)}));if(tracks.some(t=>!t.a||!t.b))return fail('the profile creates a discontinuity at a straight boundary');vertices.push(...tracks);
      for(let i=0;i<loop.length;i++){const a=tracks[i],b=tracks[(i+1)%loop.length],side=loop[i];if([0,1].some(t=>dot(side.tangent,{x:at(b,t).x-at(a,t).x,z:at(b,t).z-at(a,t).z})<EPS))return fail('the profile collapses a footprint edge; reduce the offset or thickness');edges.push({a,b,side});}}
    for(let i=0;i<edges.length;i++)for(let j=i+1;j<edges.length;j++){const a=edges[i],b=edges[j];if(a.a===b.b||a.b===b.a)continue;if(movingEdgesCross(a,b))return fail('profiled footprint boundaries cross or touch between height levels; reduce the offset or thickness');}
    // Split at every corner Z-order event. Each resulting span is bounded by
    // two moving horizontal scan lines and two original wall/void planes.
    // Their intersection is convex and has planar caps; directly connecting
    // triangulated slices would introduce twisted faces at concave corners.
    const events=[0,1];for(let i=0;i<vertices.length;i++)for(let j=i+1;j<vertices.length;j++){const a=vertices[i],b=vertices[j],speed=(a.b.z-a.a.z)-(b.b.z-b.a.z);if(Math.abs(speed)>1e-10){const t=(b.a.z-a.a.z)/speed;if(t>EPS&&t<1-EPS)events.push(t);}}
    events.sort((a,b)=>a-b);const cuts=events.filter((t,i,a)=>!i||t-a[i-1]>1e-8);
    const points=vertices.flatMap(t=>[t.a,t.b]),bounds={minX:Math.min(...points.map(p=>p.x))-1,maxX:Math.max(...points.map(p=>p.x))+1,minZ:Math.min(...points.map(p=>p.z))-1,maxZ:Math.max(...points.map(p=>p.z))+1};
    for(let k=1;k<cuts.length;k++){
      const t0=cuts[k-1],t1=cuts[k],tm=(t0+t1)/2,y0=low+(high-low)*t0,y1=low+(high-low)*t1,bottom=y0+elevation-originY,top=y1+elevation-originY;
      const sorted=[...vertices].sort((a,b)=>at(a,tm).z-at(b,tm).z),zs=sorted.filter((v,i,a)=>!i||Math.abs(at(v,tm).z-at(a[i-1],tm).z)>EPS);
      for(let z=1;z<zs.length;z++){
        const lower=zs[z-1],upper=zs[z],midZ=(at(lower,tm).z+at(upper,tm).z)/2,active=edges.filter(s=>Math.min(at(s.a,tm).z,at(s.b,tm).z)<midZ&&Math.max(at(s.a,tm).z,at(s.b,tm).z)>midZ);
        const x=edge=>(dot(edge.side.n,at(edge.a,tm))-edge.side.n.z*midZ)/edge.side.n.x;active.sort((a,b)=>x(a)-x(b));if(active.length%2)return fail('the shaped footprint cannot be paired into closed spans');
        for(let i=0;i<active.length;i+=2){const pair=[active[i],active[i+1]];if(pair[0].side.n.x>=0||pair[1].side.n.x<=0)return fail('the shaped footprint has inconsistent boundary orientation');let solid=polygonPrism(bounds,top,bottom);
          for(const [track,sign] of [[lower,-1],[upper,1]]){const z0=at(track,t0).z,z1=at(track,t1).z,slope=(z1-z0)/(y1-y0);solid=clippedSolid(solid,plane({x:0,y:-sign*slope,z:sign},sign*(z0-slope*bottom)));}
          for(const edge of pair){const side=edge.side,a=side.d+sideOffset(side,y0,view),b=side.d+sideOffset(side,y1,view),slope=(b-a)/(y1-y0);solid=clippedSolid(solid,plane({x:side.n.x,y:-slope,z:side.n.z},a-slope*bottom));}
          if(solid.faces.length)solids.push(solid);if(solids.length>512)return fail('this footprint is too complex for shaped roof fitting; simplify its boundary or profile');
        }
      }
    }
  }
  return {...plan,solids};
}
