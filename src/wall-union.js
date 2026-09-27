// Subtract other wall solids from each authored face. This is an export-time
// union boundary, not a rewrite of wall IDs or their opening references.
const EPS=1e-7;
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const mix=(a,b,t)=>Object.fromEntries(Object.keys(a).map(k=>[k,a[k]+(b[k]-a[k])*t]));

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

export function unionFaceWriter(writer,ownerIndex,solids){
  return {face(points,uvs,normal,kind){
    let pieces=[points.map((p,i)=>({...p,u:uvs[i].u,v:uvs[i].v}))];
    for(const solid of solids){
      if(solid.ownerIndex===ownerIndex)continue;
      pieces=pieces.flatMap(p=>subtract(p,solid.planes,normal,solid.ownerIndex<ownerIndex,kind));
      if(!pieces.length)break;
    }
    for(const poly of pieces)writer.face(poly.map(({x,y,z})=>({x,y,z})),poly.map(({u,v})=>({u,v})),normal);
  }};
}
