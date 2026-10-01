// Subtract other wall solids from each authored face. This is an export-time
// union boundary, not a rewrite of wall IDs or their opening references.
const EPS=1e-7;
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const mix=(a,b,t)=>Object.fromEntries(Object.keys(a).map(k=>[k,a[k]+(b[k]-a[k])*t]));

function polyArea(poly){
  let x=0,y=0,z=0;
  for(let i=1;i+1<poly.length;i++){const a=poly[0],b=poly[i],c=poly[i+1],u={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},v={x:c.x-a.x,y:c.y-a.y,z:c.z-a.z};x+=u.y*v.z-u.z*v.y;y+=u.z*v.x-u.x*v.z;z+=u.x*v.y-u.y*v.x;}
  return Math.hypot(x,y,z)/2;
}
function split(poly,plane){
  const inside=[],outside=[];
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length],da=dot(a,plane.n)-plane.d,db=dot(b,plane.n)-plane.d;
    (da<=EPS?inside:outside).push(a);
    if((da>EPS)!==(db>EPS)){
      const p=mix(a,b,da/(da-db));inside.push(p);outside.push(p);
    }
  }
  return {inside,outside};
}

function subtract(poly,planes,normal,priority,kind){
  // On a shared boundary, remove inward-facing contact faces; retain an
  // outward-facing face unless a higher-priority coplanar face owns it.
  // Face kinds break coplanar ties independently of wall order: a wall's side
  // face (siding/plaster) always wins over a neighbour's end cap in the same
  // plane, as at an exterior corner where both boxes extend to the outer
  // corner. Without this, the end cap (EdgeFaces) could replace the siding
  // and leave a strip, and the slab skirt (which has no caps) a hole.
  for(const plane of planes){
    if(poly.every(p=>Math.abs(dot(p,plane.n)-plane.d)<EPS)){
      const facing=dot(normal,plane.n);
      if(facing>EPS&&kind==='side'&&plane.kind==='end')return [poly];
      if(facing>EPS&&kind==='end'&&plane.kind==='side')continue;
      if(facing>EPS&&!priority)return [poly];
    }
    if(poly.every(p=>dot(p,plane.n)-plane.d>EPS))return [poly];
  }
  const result=[];
  let remaining=poly;
  for(const plane of planes){
    if(remaining.length<3)break;
    const cut=split(remaining,plane);
    if(cut.outside.length>=3)result.push(cut.outside);
    remaining=cut.inside;
  }
  return result;
}

export function wallSolidPlanes(wall,seg,thickness){
  const length=Math.hypot(wall.b.x-wall.a.x,wall.b.z-wall.a.z);
  const d={x:(wall.b.x-wall.a.x)/length,y:0,z:(wall.b.z-wall.a.z)/length};
  const n={x:-d.z,y:0,z:d.x},origin={x:wall.a.x,y:0,z:wall.a.z};
  const along=dot(origin,d),across=dot(origin,n),neg=p=>({x:-p.x,y:-p.y,z:-p.z});
  return [{n:d,d:along+seg.end,kind:'end'},{n:neg(d),d:-along-seg.start,kind:'end'},
    {n,d:across+thickness/2,kind:'side'},{n:neg(n),d:-across+thickness/2,kind:'side'},
    {n:{x:0,y:1,z:0},d:seg.top,kind:'cap'},{n:{x:0,y:-1,z:0},d:-seg.bottom,kind:'cap'}];
}

// Plan bounds of a solid whose x and z extents are set by its own
// axis-aligned planes (walls along X or Z), else null. A face lying more than
// EPS beyond one of those planes is returned unchanged by subtract(), so the
// solid can be skipped without changing the output.
function axisBounds(planes){
  const b={minX:-Infinity,maxX:Infinity,minZ:-Infinity,maxZ:Infinity};
  for(const {n,d} of planes){
    if(n.y!==0)continue;
    if(n.x===1&&n.z===0)b.maxX=Math.min(b.maxX,d);else if(n.x===-1&&n.z===0)b.minX=Math.max(b.minX,-d);
    else if(n.z===1&&n.x===0)b.maxZ=Math.min(b.maxZ,d);else if(n.z===-1&&n.x===0)b.minZ=Math.max(b.minZ,-d);
  }
  return Object.values(b).every(Number.isFinite)?b:null;
}
// Grid of axis-aligned solids by plan bounds; other solids are always checked.
const CELL=4,solidIndexes=new WeakMap();
function solidIndex(solids){
  let index=solidIndexes.get(solids);if(index)return index;
  index={cells:new Map(),always:[]};
  solids.forEach((solid,i)=>{
    const b=axisBounds(solid.planes),cells=b&&(Math.floor(b.maxX/CELL)-Math.floor(b.minX/CELL)+1)*(Math.floor(b.maxZ/CELL)-Math.floor(b.minZ/CELL)+1);
    if(!b||!(cells<=64)){index.always.push(i);return;}
    for(let cx=Math.floor(b.minX/CELL);cx<=Math.floor(b.maxX/CELL);cx++)for(let cz=Math.floor(b.minZ/CELL);cz<=Math.floor(b.maxZ/CELL);cz++){
      const key=`${cx}:${cz}`;if(!index.cells.has(key))index.cells.set(key,[]);index.cells.get(key).push(i);
    }
  });
  solidIndexes.set(solids,index);return index;
}
// Solids that may touch a face, in their original order.
function candidateSolids(solids,points){
  const index=solidIndex(solids),M=1e-3,seen=new Set(index.always);
  const xs=points.map(p=>p.x),zs=points.map(p=>p.z);
  const minX=Math.min(...xs)-M,maxX=Math.max(...xs)+M,minZ=Math.min(...zs)-M,maxZ=Math.max(...zs)+M;
  if((Math.floor(maxX/CELL)-Math.floor(minX/CELL)+1)*(Math.floor(maxZ/CELL)-Math.floor(minZ/CELL)+1)>index.cells.size)return solids;
  for(let cx=Math.floor(minX/CELL);cx<=Math.floor(maxX/CELL);cx++)for(let cz=Math.floor(minZ/CELL);cz<=Math.floor(maxZ/CELL);cz++)for(const i of index.cells.get(`${cx}:${cz}`)||[])seen.add(i);
  return [...seen].sort((a,b)=>a-b).map(i=>solids[i]);
}

// ownPlanes clip the wall's own faces first (junction miters).
export function unionFaceWriter(writer,ownerIndex,solids,ownPlanes=[]){
  return {face(points,uvs,normal,kind){
    let pieces=[points.map((p,i)=>({...p,u:uvs[i].u,v:uvs[i].v}))];
    if(ownPlanes.length){pieces=pieces.map(p=>clipToPlanes(p,ownPlanes)).filter(p=>polyArea(p)>1e-10);if(!pieces.length)return;}
    // Clipping only shrinks the face, so solids beyond the original face's
    // plan bounds stay irrelevant to every piece.
    for(const solid of candidateSolids(solids,points)){
      if(solid.ownerIndex===ownerIndex)continue;
      pieces=pieces.flatMap(p=>subtract(p,solid.planes,normal,solid.ownerIndex<ownerIndex,kind));
      if(!pieces.length)break;
    }
    for(const poly of pieces)writer.face(poly.map(({x,y,z})=>({x,y,z})),poly.map(({u,v})=>({u,v})),normal);
  }};
}

// Keep only the part of a polygon inside every plane (dot(p,n) <= d).
export function clipToPlanes(poly,planes){
  let remaining=poly;
  for(const plane of planes){if(remaining.length<3)return [];remaining=split(remaining,plane).inside;}
  return remaining.length>=3?remaining:[];
}

// Endpoint junctions whose angles are not all multiples of 90 degrees: each
// wall end is mitered against its angular neighbours (the bisector planes
// through the junction point), so wall boxes neither leave a nub nor a notch
// at the outer apex. Right-angle junctions keep the established box
// extension. Junctions where another wall passes through (T) are unchanged.
// Returns {a, b}, each null or {ext, planes, sides:[{plane, from, to}]}.
export function junctionMiters(walls,wall,thickness,joinEps=1e-4){
  const out={a:null,b:null},L=Math.hypot(wall.b.x-wall.a.x,wall.b.z-wall.a.z);
  if(L<1e-9)return out;
  const ht=thickness/2,TAU=2*Math.PI,near=(p,q)=>Math.hypot(p.x-q.x,p.z-q.z)<=joinEps;
  for(const end of ['a','b']){
    const J=wall[end],far=wall[end==='a'?'b':'a'],u={x:(far.x-J.x)/L,z:(far.z-J.z)/L};
    const dirs=[];let passes=false;
    for(const q of walls){
      if(q===wall||q.id===wall.id)continue;
      const qL=Math.hypot(q.b.x-q.a.x,q.b.z-q.a.z);if(qL<1e-9)continue;
      const other=near(q.a,J)?q.b:near(q.b,J)?q.a:null;
      if(other){dirs.push({x:(other.x-J.x)/qL,z:(other.z-J.z)/qL});continue;}
      const t=((J.x-q.a.x)*(q.b.x-q.a.x)+(J.z-q.a.z)*(q.b.z-q.a.z))/(qL*qL);
      if(t>0&&t<1&&Math.hypot(q.a.x+(q.b.x-q.a.x)*t-J.x,q.a.z+(q.b.z-q.a.z)*t-J.z)<=joinEps)passes=true;
    }
    if(passes||!dirs.length)continue;
    const base=Math.atan2(u.z,u.x),rel=v=>((Math.atan2(v.z,v.x)-base)%TAU+TAU)%TAU;
    const angles=dirs.map(rel).filter(r=>r>1e-6&&r<TAU-1e-6).sort((x,y)=>x-y);
    if(angles.length!==dirs.length)continue; // overlapping collinear walls: leave to validation
    const all=[0,...angles,TAU],gaps=all.slice(1).map((r,i)=>r-all[i]);
    if(gaps.every(g=>Math.abs(g/(Math.PI/2)-Math.round(g/(Math.PI/2)))<1e-6))continue;
    const rot=(v,a)=>({x:v.x*Math.cos(a)-v.z*Math.sin(a),z:v.x*Math.sin(a)+v.z*Math.cos(a)});
    const sides=[],planes=[];let ext=0;
    for(const [s,phi] of [[1,angles[0]],[-1,TAU-angles[angles.length-1]]]){
      const b=rot(u,s*phi/2),m=rot(b,s*Math.PI/2),ns=rot(u,s*Math.PI/2);
      const t=-ht*(ns.x*m.x+ns.z*m.z)/(u.x*m.x+u.z*m.z);
      const X={x:J.x+ns.x*ht+u.x*t,z:J.z+ns.z*ht+u.z*t};
      ext=Math.max(ext,-t);
      const plane={n:{x:m.x,y:0,z:m.z},d:m.x*J.x+m.z*J.z,kind:'end'};
      planes.push(plane);sides.push({plane,from:X,to:{x:J.x,z:J.z},side:s});
    }
    out[end]={ext:Math.min(Math.max(0,ext),20*ht)+1e-6,planes,sides};
  }
  return out;
}
