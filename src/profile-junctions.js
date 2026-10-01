import {projectToWall,wallLength,wallHeightFor} from './model.js';
import {wallTypeFor,sampleWallType} from './wall-types.js';
const EPS=1e-5,near=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)<EPS;
const extent=(view,w)=>Math.max(...(wallTypeFor(view,w)?.stations||[{offset:0,thickness:view.wallThickness}]).map(p=>Math.abs(p.offset)+p.thickness/2));
// Shared eligibility for validation and geometry. A Standard branch may meet
// the middle of one shaped host or the seam of two matching collinear hosts.
// stateFor supplies the same physical inward direction used by the mesh builder.
export function standardProfileJunction(view,branch,end,stateFor){
 if(!(view.wallTypes||[]).length||wallTypeFor(view,branch))return null; // no shaped hosts without wall types
 const origin=branch[end],shaped=view.walls.filter(w=>w!==branch&&wallTypeFor(view,w));
 const middle=shaped.filter(w=>{const p=projectToWall(w,origin);return p.distance<EPS&&p.t>EPS&&p.t<1-EPS;});
 const touching=shaped.filter(w=>[w.a,w.b].some(p=>near(p,origin))),split=!middle.length&&touching.length>1,hosts=split?touching:middle;
 if(!hosts.length)return null;
 const host=hosts[0],fail=reason=>({host,hosts,split,reason});
 if(split){
  if(hosts.length!==2)return fail('a split host needs exactly two shaped wall sections');
  const directions=hosts.map(w=>{const p=near(w.a,origin)?w.b:w.a,length=wallLength(w);return {x:(p.x-origin.x)/length,z:(p.z-origin.z)/length};});
  if(Math.hypot(directions[0].x+directions[1].x,directions[0].z+directions[1].z)>EPS)return fail('split host sections must continue in opposite directions along one straight line');
  const states=hosts.map(w=>stateFor?.(w));
  if(states.some(s=>!s)||Math.abs(states[0].height-states[1].height)>EPS)return fail('split host sections need matching heights');
  const levels=[0,states[0].height,...states.flatMap(s=>s.type.stations.map(p=>p.height*s.height))];
  if(levels.some(y=>{const [a,b]=states.map(s=>sampleWallType(s.type,y/s.height,view.wallThickness));return Math.abs(a.thickness-b.thickness)>EPS||Math.hypot(a.offset*states[0].n.x-b.offset*states[1].n.x,a.offset*states[0].n.z-b.offset*states[1].n.z)>EPS;}))return fail('split host sections need matching physical offsets and thickness at every height; check profiles and inward directions');
 }else if(hosts.length!==1)return fail('use one shaped host at each Standard wall end');
 const length=wallLength(branch),dx=branch.b.x-branch.a.x,dz=branch.b.z-branch.a.z;
 if(hosts.some(w=>Math.abs((dx*(w.b.x-w.a.x)+dz*(w.b.z-w.a.z))/(length*wallLength(w)))>Math.sqrt(3)/2+EPS))return fail('Standard walls need an angle of at least 30 degrees to a shaped host');
 if(view.walls.some(w=>w!==branch&&!hosts.includes(w)&&[w.a,w.b].some(p=>near(p,origin))))return fail('keep the fitted Standard wall end free of additional branches');
 const height=wallHeightFor(view,branch);
 if(hosts.some(w=>wallHeightFor(view,w)<height-EPS))return fail('the shaped host must be at least as tall as the Standard wall');
 for(const host of hosts){
 const hostLength=wallLength(host);
 const along=projectToWall(host,origin).t*hostLength,cosine=Math.abs((dx*(host.b.x-host.a.x)+dz*(host.b.z-host.a.z))/(length*hostLength));
 const sine=Math.sqrt(Math.max(0,1-cosine*cosine)),angled=cosine>EPS,wallHalf=view.wallThickness/2;
 // The oblique partition sweeps sideways along the host as its profile bends.
 // Include the whole host thickness in this conservative clearance envelope.
 const half=angled?(wallHalf+extent(view,host)*cosine)/sine:wallHalf;
 const branchClearance=angled?(extent(view,host)+wallHalf*cosine)/sine:extent(view,host);
 for(const end of ['a','b']){
  const p=host[end],other=host[end==='a'?'b':'a'];if(split&&near(p,origin))continue;let clearance=half;
  for(const q of view.walls.filter(w=>w!==host&&[w.a,w.b].some(v=>near(v,p)))){
   const v=[q.a,q.b].find(v=>!near(v,p));if(!v)continue;
   const cosine=Math.max(-1,Math.min(1,((other.x-p.x)*(v.x-p.x)+(other.z-p.z)*(v.z-p.z))/(hostLength*wallLength(q))));
   clearance=Math.max(clearance,half+Math.max(extent(view,host),extent(view,q))/Math.max(.001,Math.tan(Math.acos(cosine)/2)));
  }
  if((end==='a'?along:hostLength-along)<clearance-EPS)return fail(`move the junction at least ${clearance.toFixed(2)} m from the shaped host's ${end.toUpperCase()} end`);
 }
 for(const o of view.openings||[]){
  const bottom=o.type==='window'?(o.sill||0):0;
  const settings=o.type==='window'?view.windowMesh:view.doorMesh,frame=settings?.enabled===false||o.windowStyle==='empty'||o.doorStyle==='empty'?0:(settings?.frameWidth||.09);if(bottom-frame>=height-EPS)continue;
  const depthReach=angled&&frame>0?(settings?.frameDepth||(o.type==='window'?.12:.14))*cosine/sine:0;
  if(o.wallId===host.id&&Math.abs(o.t*hostLength-along)<o.width/2+half+frame+depthReach+EPS)return fail('move the junction clear of the shaped host opening and its frame');
  if(o.wallId===branch.id&&length*(end==='a'?o.t:1-o.t)-o.width/2<branchClearance+frame+depthReach+EPS)return fail('move the Standard wall opening farther from its fitted end');
 }
 }
 return {host,hosts,split};
}
