import {wallTypeFor,sampleWallType} from './wall-types.js';
import {splitWallIntoSolidSegments,wallLength,wallHeightFor} from './model.js';
import {clippedSolid} from './roof-geometry.js';
import {standardProfileJunction} from './profile-junctions.js';
import {openingShapeFor,openingCutters} from './opening-shapes.js';
import {constrainedOpening} from './model.js';
const EPS=1e-7,dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const minus=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const unit=n=>{const l=Math.hypot(n.x,n.y,n.z);return {x:n.x/l,y:n.y/l,z:n.z/l};};
const near=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)<1e-5;
function subtractCutter(solid,planes){
  if(planes.some(p=>solid.faces.every(f=>f.points.every(q=>dot(p.n,q)>=p.d-EPS))))return [solid];
  const out=[];let remaining=solid;
  for(const plane of planes){
    const outside=clippedSolid(remaining,{n:{x:-plane.n.x,y:-plane.n.y,z:-plane.n.z},d:-plane.d});
    if(outside.faces.length)out.push(outside);
    remaining=clippedSolid(remaining,plane);if(!remaining.faces.length)break;
  }
  return out;
}
function shapeSolid(vertices,indices,tags){
  const center=vertices.reduce((a,p)=>({x:a.x+p.x/vertices.length,y:a.y+p.y/vertices.length,z:a.z+p.z/vertices.length}),{x:0,y:0,z:0});
  const faces=indices.map((ids,i)=>{
    let points=ids.map(j=>vertices[j]),normal=unit(cross(minus(points[1],points[0]),minus(points[2],points[0])));
    if(dot(normal,minus(points[0],center))<0){points.reverse();normal={x:-normal.x,y:-normal.y,z:-normal.z};}
    return {points,normal,tag:tags[i],uvs:points.map(p=>({u:p.x,v:p.y}))};
  });return {faces,planes:faces.map(f=>({n:f.normal,d:dot(f.normal,f.points[0])}))};
}
export function profileWallState(building,wall,outsideSign,isExterior){
  const length=wallLength(wall),d={x:(wall.b.x-wall.a.x)/length,z:(wall.b.z-wall.a.z)/length},raw={x:-d.z,z:d.x};
  // In the X/Z plan, left of A->B is -raw. Interior auto uses Side A.
  const sign=wall.inwardSide==='left'?-1:wall.inwardSide==='right'?1:isExterior(building,wall)?-outsideSign(building,wall):-1;
  return {wall,length,d,n:{x:raw.x*sign,z:raw.z*sign},height:wallHeightFor(building,wall),type:wallTypeFor(building,wall)};
}
export function profileWallSolids(building,outsideSign,isExterior){
  const states=building.walls.map(w=>profileWallState(building,w,outsideSign,isExterior));
  const sample=(s,y)=>sampleWallType(s.type,y/s.height,building.wallThickness);
  const joints=(s,end)=>states.filter(q=>q!==s&&(near(s.wall[end],q.wall.a)||near(s.wall[end],q.wall.b)));
  const result=[];
  for(const [ownerIndex,s] of states.entries()){
    const fitted=Object.fromEntries(['a','b'].map(end=>{const link=standardProfileJunction(building,s.wall,end,w=>states.find(q=>q.wall===w));return [end,link&&!link.reason?states.find(q=>q.wall===link.host):null];}));
    const neighbors=[...new Set([...joints(s,'a'),...joints(s,'b'),...Object.values(fitted).filter(Boolean)])];
    const levels=[0,s.height,...neighbors.map(q=>q.height),...[s,...neighbors].flatMap(q=>(q.type?.stations||[]).map(p=>p.height*q.height))];
    const shaped=(building.openings||[]).filter(o=>o.wallId===s.wall.id&&openingShapeFor(building,o));
    const cutters=shaped.flatMap(o=>openingCutters(building,constrainedOpening(building,o),s.length,s.d,s.wall.a));
    const segments=splitWallIntoSolidSegments(shaped.length?{...building,openings:building.openings.filter(o=>!shaped.includes(o))}:building,s.wall),skirt=Number(building.storyFloorSkirt??building.exteriorFloorSkirt)||0;
    if(skirt>0)segments.push({start:0,end:s.length,bottom:-skirt,top:0});
    for(const seg of segments){
      const cuts=[seg.bottom,...levels.filter(y=>y>seg.bottom+EPS&&y<seg.top-EPS),seg.top].sort((a,b)=>a-b).filter((v,i,a)=>!i||v-a[i-1]>EPS);
      for(let k=0;k<cuts.length-1;k++){
        const y0=cuts[k],y1=cuts[k+1],lo=sample(s,y0),hi=sample(s,y1);
        const extension=4*Math.max(...[s,...neighbors].flatMap(q=>(q.type?.stations||[{offset:0,thickness:building.wallThickness}]).map(p=>Math.abs(p.offset)+p.thickness)))+1;
        const ends={a:seg.start,b:seg.end},planes=[];
        for(const end of ['a','b']){
          if(end==='a'&&seg.start>EPS||end==='b'&&seg.end<s.length-EPS)continue;
          if(fitted[end]){
            const q=fitted[end],ss=end==='a'?1:-1,origin=s.wall[end],alignment=q.n.x*s.d.x+q.n.z*s.d.z;
            if(Math.abs(q.n.x*s.n.x+q.n.z*s.n.z)<1e-5){
              // Preserve the established right-angle path and its scene bytes.
              const a=sample(q,y0).offset/alignment,b=sample(q,y1).offset/alignment,slope=(b-a)/(y1-y0),l=Math.hypot(1,slope);
              planes.push({n:{x:-ss*s.d.x/l,y:ss*slope/l,z:-ss*s.d.z/l},d:(-ss*(s.d.x*origin.x+s.d.z*origin.z+a)+ss*slope*y0)/l});
            }else{
              // The end plane follows the HOST, including its vertical bends;
              // a plane perpendicular to the branch would leave a wedge.
              const a=sample(q,y0).offset,b=sample(q,y1).offset,slope=(b-a)/(y1-y0),sign=ss*Math.sign(alignment),l=Math.hypot(1,slope);
              planes.push({n:{x:-sign*q.n.x/l,y:sign*slope/l,z:-sign*q.n.z/l},d:(-sign*(q.n.x*origin.x+q.n.z*origin.z+a)+sign*slope*y0)/l});
            }
            ends[end]+=ss===1?-extension:extension;continue;
          }
          const matching=joints(s,end);if(matching.length!==1)continue;
          const q=matching[0];if(y0>=q.height-EPS)continue;const origin=s.wall[end],qs=near(origin,q.wall.a)?1:-1,ss=end==='a'?1:-1,da={x:s.d.x*ss,z:s.d.z*ss},db={x:q.d.x*qs,z:q.d.z*qs},nx=da.x-db.x,nz=da.z-db.z;
          if(Math.hypot(nx,nz)<EPS)continue;
          const centerAt=y=>{const a=sample(s,y).offset,b=sample(q,y).offset,det=s.n.x*q.n.z-s.n.z*q.n.x;if(Math.abs(det)<1e-5)return {x:origin.x,z:origin.z};return {x:origin.x+(a*q.n.z-s.n.z*b)/det,z:origin.z+(s.n.x*b-a*q.n.x)/det};};
          const c0=centerAt(y0),c1=centerAt(y1),slope=(nx*(c1.x-c0.x)+nz*(c1.z-c0.z))/(y1-y0),n={x:-nx,y:slope,z:-nz},l=Math.hypot(n.x,n.y,n.z);
          planes.push({n:{x:n.x/l,y:n.y/l,z:n.z/l},d:(-nx*c0.x-nz*c0.z+slope*y0)/l});
          ends[end]+=ss===1?-extension:extension;
        }
        const vertices=[];
        for(const [y,p] of [[y0,lo],[y1,hi]])for(const along of [ends.a,ends.b])for(const side of [-1,1]){const offset=p.offset+side*p.thickness/2;vertices.push({x:s.wall.a.x+s.d.x*along+s.n.x*offset,y,z:s.wall.a.z+s.d.z*along+s.n.z*offset});}
        let solid=shapeSolid(vertices,[[0,2,6,4],[1,5,7,3],[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6]],['outside','inside','edge','edge','edge','edge']);
        for(const plane of planes)solid=clippedSolid(solid,plane);
        let pieces=[solid];for(const cutter of cutters)pieces=pieces.flatMap(piece=>subtractCutter(piece,cutter));
        for(const piece of pieces){
          for(const f of piece.faces){f.tag ||= 'edge';f.uvs=f.points.map(p=>({u:(p.x-s.wall.a.x)*s.d.x+(p.z-s.wall.a.z)*s.d.z,v:p.y}));}
          if(piece.faces.length)result.push({...piece,wallIndex:ownerIndex,ownerIndex:result.length,wallId:s.wall.id,exterior:isExterior(building,s.wall),inward:s.n});
        }
      }
    }
  }
  return result;
}
