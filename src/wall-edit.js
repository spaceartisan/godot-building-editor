import { applyOpeningConstraints, floorView, projectToWall, validateOpeningLayout } from './model.js';
import { samePoint, wallSegmentProblem } from './authoring.js';

// A proposed edit is isolated from the document until pointer-up/field commit.
export function endpointMoveTargets(floor,wallId,end,connected=true){
  const wall=floor.walls.find(w=>w.id===wallId);
  if(!wall||!['a','b'].includes(end))return [];
  const targets=[{wallId,end}];
  if(connected)for(const w of floor.walls)for(const key of ['a','b'])
    if(!(w.id===wallId&&key===end)&&samePoint(w[key],wall[end]))targets.push({wallId:w.id,end:key});
  return targets;
}
function properCross(a,b){
  const dx=a.b.x-a.a.x,dz=a.b.z-a.a.z,ex=b.b.x-b.a.x,ez=b.b.z-b.a.z,den=dx*ez-dz*ex;
  if(Math.abs(den)<1e-8)return false;
  const x=b.a.x-a.a.x,z=b.a.z-a.a.z,t=(x*ez-z*ex)/den,u=(x*dz-z*dx)/den;
  return t>1e-5&&t<1-1e-5&&u>1e-5&&u<1-1e-5;
}
export function proposeEndpointMove(building,floorIndex,wallId,end,point,{connected=true}={}){
  const source=building.floors[floorIndex];
  if(!source)return {ok:false,reason:'Floor no longer exists'};
  const targets=endpointMoveTargets(source,wallId,end,connected),next=structuredClone(source);
  const ids=new Set(targets.map(t=>t.wallId));
  const result={floor:next,targets,wallIds:[...ids],adjustedOpenings:0};
  const reject=reason=>({...result,ok:false,reason});
  if(!targets.length)return reject('Wall endpoint no longer exists');
  if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.z)||Math.abs(point.x)>1e6||Math.abs(point.z)>1e6)return reject('Enter finite coordinates within ±1,000,000 m');
  for(const t of targets)next.walls.find(w=>w.id===t.wallId)[t.end]={...point};
  const changed=targets.some(t=>!samePoint(source.walls.find(w=>w.id===t.wallId)[t.end],point));
  if(!changed)return {...result,ok:true,changed:false};
  for(const w of next.walls.filter(w=>ids.has(w.id))){
    const problem=wallSegmentProblem(w.a,w.b,next.walls.filter(o=>o.id!==w.id));
    if(problem)return reject(problem);
  }
  // Preserve existing endpoint-on-host contacts; moving along a T host is safe.
  // Detach mode may remove contacts of the explicitly moved endpoint only.
  for(const w of source.walls)for(const key of ['a','b'])for(const host of source.walls){
    if(host.id===w.id||(!ids.has(w.id)&&!ids.has(host.id)))continue;
    if(!connected&&targets.some(t=>(t.wallId===w.id&&t.end===key)||(t.wallId===host.id&&samePoint(host[t.end],w[key]))))continue;
    const hit=projectToWall(host,w[key]);
    if(hit.distance>1e-5)continue;
    const nw=next.walls.find(q=>q.id===w.id),nh=next.walls.find(q=>q.id===host.id);
    if(projectToWall(nh,nw[key]).distance>1e-5)return reject('This would break a wall junction. Move the branch endpoint along its host wall, or detach that branch endpoint explicitly.');
  }
  for(let i=0;i<next.walls.length;i++)for(let j=i+1;j<next.walls.length;j++){
    const a=next.walls[i],b=next.walls[j];
    if((ids.has(a.id)||ids.has(b.id))&&properCross(a,b)&&!properCross(source.walls[i],source.walls[j]))return reject('This move would cross another wall. Join its endpoint or wall centerline instead.');
  }
  const view={...floorView(building,floorIndex),walls:next.walls,openings:next.openings};
  for(const o of next.openings.filter(o=>ids.has(o.wallId))){
    const before={...o};applyOpeningConstraints(view,o);
    for(const key of ['width','height','sill'])if(Math.abs((o[key]||0)-(before[key]||0))>1e-5)return reject(`${o.label||o.type} would no longer fit. Enlarge the wall or resize the opening explicitly.`);
    if(Math.abs(o.t-before.t)>1e-5)result.adjustedOpenings++;
  }
  const issue=validateOpeningLayout(view).find(i=>ids.has(i.opening?.wallId));
  if(issue)return reject(issue.message);
  return {...result,ok:true,changed:true};
}
