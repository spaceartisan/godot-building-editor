import {floorView,floorElevation,roofSectionsForFloor,wallLength} from './model.js';
import {wallTypeFor,sampleWallType} from './wall-types.js';
import {profileRoomSolids} from './profile-roof-envelope.js';
import {roofBoxParts,roofInteriorBlockers,roofAttachmentBlockers,trimRoofBox} from './roof-geometry.js';
const dot=(a,b)=>a.x*b.x+a.z*b.z;
export function roofWallDiagnostics(building){
  const results=[];if(!Array.isArray(building.floors)||!building.wallTypes?.length||!building.roof||!Number.isFinite(building.wallThickness))return results;
  for(let fi=0;fi<building.floors.length;fi++){
    const view=floorView(building,fi),plan=profileRoomSolids(view);if(!plan.active)continue;
    const e=floorElevation(building,fi),walls=view.walls.filter(w=>wallTypeFor(view,w)&&w.role!=='interior');
    const roofs=[...(building.roofSections||[]).map(r=>({...r,manual:true})),...roofSectionsForFloor(building,fi).map((r,i)=>({...r,id:`automatic_${fi}_${i}`,label:r.label||`Automatic roof ${i+1}`,baseY:e+view.wallHeight,manual:false}))];
    for(const roof of roofs){
      const corners=[{x:roof.minX,z:roof.minZ},{x:roof.maxX,z:roof.minZ},{x:roof.maxX,z:roof.maxZ},{x:roof.minX,z:roof.maxZ}],center={x:(roof.minX+roof.maxX)/2,z:(roof.minZ+roof.maxZ)/2};
      if(roof.baseY>e+view.wallHeight+.1||roof.baseY<e-view.floorThickness-5)continue;
      for(const wall of walls){
        const side=!plan.reason&&plan.sides?.find(s=>s.wallIds.includes(wall.id)),length=wallLength(wall),tangent={x:(wall.b.x-wall.a.x)/length,z:(wall.b.z-wall.a.z)/length},ts=corners.map(p=>dot(tangent,{x:p.x-wall.a.x,z:p.z-wall.a.z}));
        if(Math.min(...ts)>=length-.001||Math.max(...ts)<=.001)continue;
        if(!side){
          const reach=1+Math.max(...wallTypeFor(view,wall).stations.map(p=>Math.abs(p.offset)+p.thickness));
          if(roof.maxX<Math.min(wall.a.x,wall.b.x)-reach||roof.minX>Math.max(wall.a.x,wall.b.x)+reach||roof.maxZ<Math.min(wall.a.z,wall.b.z)-reach||roof.minZ>Math.max(wall.a.z,wall.b.z)+reach)continue;
          results.push({status:'unsupported',roofId:roof.id,wallId:wall.id,floorIndex:fi,message:`${roof.label||roof.id} / ${wall.label||wall.id}: ${plan.reason||'this wall does not bound the remaining roof-cutting footprint'}; ${plan.reason?'roof cuts use the plan footprint':'roof cuts follow the remaining footprint'}. Review this junction.`});continue;
        }
        if(dot(side.n,center)<=side.d+.01)continue; // Only an exterior attachment, not the main roof.
        const projection=corners.map(p=>dot(side.n,p)),reach=Math.max(.5,Number(roof.overhang)||0)+Math.max(...wallTypeFor(view,wall).stations.map(p=>Math.abs(p.offset)+p.thickness));
        if(Math.min(...projection)>side.d+reach||Math.max(...projection)<side.d-reach)continue;
        const blockers=[...roofInteriorBlockers(building,roof,roof.baseY),...(roof.manual?roofAttachmentBlockers(building,roof):[])];
        let gap=Infinity;
        for(const part of roofBoxParts(roof,building.roof,roof.baseY,0,roof.manual)){
          const faces=trimRoofBox(part,blockers),points=faces===null?roofPartVertices(part):faces.flatMap(f=>f.points);
          for(const p of points){if(p.y<e-.001||p.y>e+view.wallHeight+.001)continue;const along=dot(tangent,{x:p.x-wall.a.x,z:p.z-wall.a.z});if(along<-.001||along>length+.001)continue;
            const shape=sampleWallType(side.type,(p.y-e)/view.wallHeight,view.wallThickness),distance=dot(side.n,p)-side.d-side.sign*shape.offset-shape.thickness/2;gap=Math.min(gap,distance);
          }
        }
        if(Number.isFinite(gap)&&gap>.005)results.push({status:'gap',roofId:roof.id,wallId:wall.id,floorIndex:fi,gap,message:`${roof.label||roof.id} / ${wall.label||wall.id}: roof remains ${(gap*100).toFixed(1)} cm outside the shaped wall. Extend its footprint or overhang toward the wall; trimming cannot fill missing roof geometry.`});
      }
    }
  }
  return results;
}
function roofPartVertices(part){
  if(part.solid)return part.solid.faces.flatMap(f=>f.points);
  const out=[];for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]){
    let p={x:x*part.size.x/2,y:y*part.size.y/2,z:z*part.size.z/2};
    for(const axis of ['x','y','z']){const a=part.rot?.[axis]||0,c=Math.cos(a),s=Math.sin(a),q={...p};if(axis==='x'){p.y=q.y*c-q.z*s;p.z=q.y*s+q.z*c;}if(axis==='y'){p.x=q.x*c+q.z*s;p.z=-q.x*s+q.z*c;}if(axis==='z'){p.x=q.x*c-q.y*s;p.y=q.x*s+q.y*c;}}
    out.push({x:p.x+part.pos.x,y:p.y+part.pos.y,z:p.z+part.pos.z});
  }return out;
}
