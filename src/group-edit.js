import {floorView,projectToWall,pointOnWall,stairFootprint,validateOpeningLayout} from './model.js';
import {wallSegmentProblem} from './authoring.js';
import {validateBuilding} from './validation.js';

const collections={wall:'walls',opening:'openings',light:'lights',marker:'markers',stair:'stairs',railing:'railings',region:'regions',slab:'slabs',platform:'platforms',manualFloor:'manualFloors',manualCeiling:'manualCeilings',roofSection:'roofSections'};
const independent=new Set(['manualFloor','manualCeiling','roofSection']);
export const selectionKey=s=>s.type+':'+s.id;
export function groupEntity(building,index,s){return (independent.has(s.type)?building:building.floors[index])?.[collections[s.type]]?.find(o=>o.id===s.id);}
export function selectableItems(building,index,filter='all'){
  return Object.keys(collections).filter(type=>filter==='all'||filter===type||filter==='areas'&&['region','slab','platform',...independent].includes(type))
    .flatMap(type=>((independent.has(type)?building:building.floors[index])?.[collections[type]]||[]).map(o=>({type,id:o.id})));
}
export function selectionBounds(building,index,s){
  const o=groupEntity(building,index,s);if(!o)return null;
  if(s.type==='wall'||s.type==='railing')return {minX:Math.min(o.a.x,o.b.x),maxX:Math.max(o.a.x,o.b.x),minZ:Math.min(o.a.z,o.b.z),maxZ:Math.max(o.a.z,o.b.z)};
  if(s.type==='stair')return stairFootprint(o);
  if((s.type==='light'||s.type==='marker'))return {minX:o.position.x,maxX:o.position.x,minZ:o.position.z,maxZ:o.position.z};
  if(s.type==='opening'){
    const wall=building.floors[index].walls.find(w=>w.id===o.wallId);if(!wall)return null;
    const length=Math.hypot(wall.b.x-wall.a.x,wall.b.z-wall.a.z),a=pointOnWall(wall,o.t-o.width/2/length),b=pointOnWall(wall,o.t+o.width/2/length);
    return {minX:Math.min(a.x,b.x),maxX:Math.max(a.x,b.x),minZ:Math.min(a.z,b.z),maxZ:Math.max(a.z,b.z)};
  }
  return {minX:o.minX,maxX:o.maxX,minZ:o.minZ,maxZ:o.maxZ};
}
export function selectionInBox(building,index,rect,filter='all'){
  return selectableItems(building,index,filter).filter(s=>{const r=selectionBounds(building,index,s);return r&&r.minX>=rect.minX-1e-6&&r.maxX<=rect.maxX+1e-6&&r.minZ>=rect.minZ-1e-6&&r.maxZ<=rect.maxZ+1e-6;});
}
function crosses(a,b){
  const dx=a.b.x-a.a.x,dz=a.b.z-a.a.z,ex=b.b.x-b.a.x,ez=b.b.z-b.a.z,den=dx*ez-dz*ex;
  if(Math.abs(den)<1e-8)return false;
  const x=b.a.x-a.a.x,z=b.a.z-a.a.z,t=(x*ez-z*ex)/den,u=(x*dz-z*dx)/den;
  return t>1e-5&&t<1-1e-5&&u>1e-5&&u<1-1e-5;
}
export function proposeGroupMove(source,index,selection,delta,{connected=true}={}){
  const reject=reason=>({ok:false,reason});
  if(!source.floors[index])return reject('Floor no longer exists');
  if(!delta||![delta.x,delta.z].every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e6))return reject('Enter finite movement within ±1,000,000 m');
  const items=[...new Map(selection.map(s=>[selectionKey(s),s])).values()];
  if(!items.length||items.some(s=>!groupEntity(source,index,s)))return reject('Select existing objects to move');
  const building=structuredClone(source),before=source.floors[index],after=building.floors[index];
  const wallIds=new Set(items.filter(s=>s.type==='wall').map(s=>s.id)),changedWalls=new Set(wallIds);
  const afterWalls=new Map(after.walls.map(w=>[w.id,w])),selectedWalls=before.walls.filter(w=>wallIds.has(w.id));
  if(!delta.x&&!delta.z)return {ok:true,building,wallIds:[],changed:false};
  const shift=p=>{p.x+=delta.x;p.z+=delta.z;};
  for(const s of items){
    const o=groupEntity(building,index,s);
    if(s.type==='opening')continue;
    if(s.type==='wall'||s.type==='railing'){shift(o.a);shift(o.b);}
    else if((s.type==='light'||s.type==='marker'))shift(o.position);
    else if(s.type==='stair')shift(o);
    else {if(o.polygon)for(const p of o.polygon)shift(p);o.minX+=delta.x;o.maxX+=delta.x;o.minZ+=delta.z;o.maxZ+=delta.z;}
  }
  if(connected)for(const wall of before.walls){
    if(wallIds.has(wall.id))continue;
    for(const end of ['a','b'])if(selectedWalls.some(host=>projectToWall(host,wall[end]).distance<1e-5)){
      shift(afterWalls.get(wall.id)[end]);changedWalls.add(wall.id);
    }
  }
  for(const w of after.walls.filter(w=>changedWalls.has(w.id))){const problem=wallSegmentProblem(w.a,w.b,after.walls.filter(o=>o.id!==w.id));if(problem)return reject(problem);}
  if(connected)for(const wall of before.walls)for(const end of ['a','b'])for(const host of before.walls){
    if(host.id===wall.id||!changedWalls.has(wall.id)&&!changedWalls.has(host.id))continue;
    if(projectToWall(host,wall[end]).distance<1e-5&&projectToWall(afterWalls.get(host.id),afterWalls.get(wall.id)[end]).distance>1e-5)return reject('This would break a wall junction. Include its host wall or turn off Keep wall joints.');
  }
  for(let a=0;a<after.walls.length;a++)for(let b=a+1;b<after.walls.length;b++)if((changedWalls.has(after.walls[a].id)||changedWalls.has(after.walls[b].id))&&crosses(after.walls[a],after.walls[b])&&!crosses(before.walls[a],before.walls[b]))return reject('This move would cross another wall');
  for(const s of items.filter(s=>s.type==='opening')){
    const o=groupEntity(building,index,s);if(wallIds.has(o.wallId))continue; // host already carries the opening
    const old=groupEntity(source,index,s),oldWall=before.walls.find(w=>w.id===old.wallId),wall=after.walls.find(w=>w.id===o.wallId);
    const center=pointOnWall(oldWall,old.t);shift(center);const hit=projectToWall(wall,center);
    if(hit.distance>1e-5)return reject('Doors and windows move along their host wall. Select the wall to move it with them.');o.t=hit.t;
  }
  const openingIssue=validateOpeningLayout(floorView(building,index)).find(i=>changedWalls.has(i.opening?.wallId)||items.some(s=>s.type==='opening'&&s.id===i.opening?.id));
  if(openingIssue)return reject(openingIssue.message);
  const validation=validateBuilding(building);
  if(validation.errors.length)return reject(validation.errors[0].message);
  return {ok:true,building,wallIds:[...changedWalls],changed:delta.x!==0||delta.z!==0};
}
export function removeGroupSelection(source,index,selection){
  const building=structuredClone(source),floor=building.floors[index];
  const walls=new Set(selection.filter(s=>s.type==='wall').map(s=>s.id)),roofs=new Set(selection.filter(s=>s.type==='roofSection').map(s=>s.id));
  for(const s of selection){const owner=independent.has(s.type)?building:floor,key=collections[s.type];if(key)owner[key]=owner[key].filter(o=>o.id!==s.id);}
  floor.openings=floor.openings.filter(o=>!walls.has(o.wallId));
  for(const roof of building.roofSections)if(roofs.has(roof.hostRoofId))delete roof.hostRoofId;
  return building;
}
