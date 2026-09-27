import { floorView, floorElevation, stairFootprint, rectValid } from './model.js';
import { inspectFloorCoverage } from './diagnostics.js';
import { areaPoints } from './polygon-areas.js';
import { wallTypeFor, sampleWallType } from './wall-types.js';
import { profileWallState } from './wall-profile-geometry.js';
import { exteriorWallOutsideSign, isExteriorWall } from './exporter.js';

// Static route check on the authored model: can a person walk from open ground
// outside the building to every walkable floor area through doors, empty
// passages and stairs? Each floor's walkable surface (automatic slab after
// stair/platform cutouts, level platforms and level manual floors; open
// terrain around and beneath the ground floor) is rasterized, walls and
// railings are inflated by the walker radius, doors reopen their clear span,
// and stairs link their lower entrance to their upper arrival. A connectivity
// approximation for review, not a physics or headroom simulation.
export const REACHABILITY_DEFAULTS={cell:.1,radius:.25,minArea:1,margin:2,bodyHeight:1.8};

// Route start points for interiors with no opening to the outside (a sealed
// ship, a bunker): "x,z" or "x,z,floorId", several separated by ";". The
// floor defaults to the ground floor. Shared by the CLI --from option and the
// web route-start field. Empty text means no start points.
export function parseRouteStarts(text,building){
  const items=String(text??'').split(';').map(v=>v.trim()).filter(Boolean);
  if(items.length>32)throw new Error('Route start: use at most 32 points');
  return items.map(item=>{
    const parts=item.split(',').map(v=>v.trim());
    if(parts.length<2||parts.length>3||parts.slice(0,2).some(v=>v===''||!Number.isFinite(Number(v))))throw new Error(`Route start "${item}": expected x,z or x,z,floorId`);
    const floorId=parts[2]||building.floors?.[groundIndex(building)]?.id;
    if(!(building.floors||[]).some(f=>f.id===floorId))throw new Error(`Route start "${item}": unknown floor ID ${parts[2]}`);
    return {x:Number(parts[0]),z:Number(parts[1]),floorId};
  });
}

// How far a wall's material reaches on each side of its plan centreline
// (along the profile's inward normal n) between the floor and body height.
// Standard walls reach half the thickness both ways.
function wallReach(view,wall,bodyHeight){
  const half=Math.max(.02,Number(view.wallThickness)||.18)/2,type=wallTypeFor(view,wall);
  if(!type)return {n:null,pos:half,neg:half};
  const state=profileWallState(view,wall,exteriorWallOutsideSign,isExteriorWall),top=Math.min(state.height,bodyHeight);
  const heights=[0,top,...type.stations.map(q=>q.height*state.height).filter(y=>y<top)];
  let pos=-Infinity,neg=-Infinity;
  for(const y of heights){const q=sampleWallType(type,y/state.height,view.wallThickness);pos=Math.max(pos,q.offset+q.thickness/2);neg=Math.max(neg,-q.offset+q.thickness/2);}
  return {n:state.n,pos,neg};
}

function inside(r,p){
  if(!r.polygon)return p.x>=r.minX&&p.x<=r.maxX&&p.z>=r.minZ&&p.z<=r.maxZ;
  const pts=areaPoints(r);let hit=false;
  for(let i=0,j=pts.length-1;i<pts.length;j=i++){
    const a=pts[i],b=pts[j];
    if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)hit=!hit;
  }
  return hit;
}
const bounds=r=>{const pts=areaPoints(r);return {minX:Math.min(...pts.map(p=>p.x)),maxX:Math.max(...pts.map(p=>p.x)),minZ:Math.min(...pts.map(p=>p.z)),maxZ:Math.max(...pts.map(p=>p.z))};};

// Lowest floor at or above grade (or the lowest floor) sits on open terrain.
function groundIndex(building){
  const elevations=building.floors.map((f,i)=>floorElevation(building,i));
  let best=0;for(let i=1;i<elevations.length;i++)if(Math.abs(elevations[i])<Math.abs(elevations[best])-1e-6)best=i;
  return best;
}

export function analyzeReachability(building,options={}){
  const {cell,radius,minArea,margin,bodyHeight,starts=[]}={...REACHABILITY_DEFAULTS,...options};
  const floors=building.floors||[];
  if(!floors.length)return {ok:true,settings:{cell,radius,minArea},floors:[],unreachable:[],stairIssues:[]};
  const ground=groundIndex(building);
  const views=floors.map((f,i)=>floorView(building,i));
  // Shared grid over everything authored, plus terrain margin.
  const extent={minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity};
  const grow=(x,z)=>{extent.minX=Math.min(extent.minX,x);extent.maxX=Math.max(extent.maxX,x);extent.minZ=Math.min(extent.minZ,z);extent.maxZ=Math.max(extent.maxZ,z);};
  const surfaces=floors.map((f,i)=>{
    const view=views[i],topY=floorElevation(building,i),coverage=inspectFloorCoverage(building,i).rectangles.slice();
    for(const p of view.platforms||[])if(rectValid(p)&&Math.abs(Number(p.height)||0)<.02)coverage.push(p);
    for(const m of building.manualFloors||[])if(rectValid(m)&&Math.abs((Number(m.topY)||0)-topY)<.05)coverage.push(m);
    for(const r of coverage){const b=bounds(r);grow(b.minX,b.minZ);grow(b.maxX,b.maxZ);}
    for(const w of view.walls)for(const p of [w.a,w.b])grow(p.x,p.z);
    return coverage;
  });
  if(!Number.isFinite(extent.minX))return {ok:true,settings:{cell,radius,minArea},floors:[],unreachable:[],stairIssues:[]};
  const x0=extent.minX-margin,z0=extent.minZ-margin,nx=Math.ceil((extent.maxX+margin-x0)/cell),nz=Math.ceil((extent.maxZ+margin-z0)/cell),n=nx*nz;
  const centre=(i,j)=>({x:x0+(i+.5)*cell,z:z0+(j+.5)*cell});
  const cellOf=p=>{const i=Math.floor((p.x-x0)/cell),j=Math.floor((p.z-z0)/cell);return i<0||j<0||i>=nx||j>=nz?-1:j*nx+i;};
  const forCells=(b,fn)=>{
    const i0=Math.max(0,Math.floor((b.minX-x0)/cell)),i1=Math.min(nx-1,Math.floor((b.maxX-x0)/cell)),j0=Math.max(0,Math.floor((b.minZ-z0)/cell)),j1=Math.min(nz-1,Math.floor((b.maxZ-z0)/cell));
    for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++)fn(j*nx+i,centre(i,j));
  };

  const walkable=floors.map((f,fi)=>{
    const grid=new Uint8Array(n),view=views[fi];
    for(const r of surfaces[fi])forCells(bounds(r),(k,p)=>{if(inside(r,p))grid[k]=1;});
    if(fi===ground){
      // Open terrain outside the ground floor's slab, and in unslabbed courtyards.
      const covered=new Uint8Array(n);
      for(const r of surfaces[fi])forCells(bounds(r),(k,p)=>{if(inside(r,p))covered[k]=1;});
      const below=fi>0?floors[fi-1].stairs:[];
      for(let k=0;k<n;k++)if(!covered[k])grid[k]=1;
      // Openings for stairs arriving from a basement are holes, not terrain.
      for(const s of below)forCells(stairFootprint(s,.06),k=>{grid[k]=0;});
    }
    // Stair flights occupy their footprint on their own floor.
    for(const s of view.stairs)forCells(stairFootprint(s),k=>{grid[k]=0;});
    // Walls and railings block, inflated by the walker radius; doors and
    // empty passages reopen their clear span.
    // Shaped walls use their profile's reach on each side up to body height,
    // so a profile leaning into a corridor narrows it here too.
    const barriers=[...view.walls.map(w=>({w,...wallReach(view,w,bodyHeight),doors:view.openings.filter(o=>o.type==='door'&&o.wallId===w.id)})),...(view.railings||[]).map(w=>({w,n:null,pos:.04,neg:.04,doors:[]}))];
    for(const {w,n:normal,pos,neg,doors} of barriers){
      const dx=w.b.x-w.a.x,dz=w.b.z-w.a.z,length=Math.hypot(dx,dz);if(length<1e-6)continue;
      const reach=Math.max(pos,neg)+radius,spans=doors.map(o=>{const c=o.t*length,h=Math.max(0,(Number(o.width)||0)/2-radius);return [c-h,c+h];});
      forCells({minX:Math.min(w.a.x,w.b.x)-reach,maxX:Math.max(w.a.x,w.b.x)+reach,minZ:Math.min(w.a.z,w.b.z)-reach,maxZ:Math.max(w.a.z,w.b.z)+reach},(k,p)=>{
        const s=((p.x-w.a.x)*dx+(p.z-w.a.z)*dz)/length,sc=Math.max(0,Math.min(length,s));
        const qx=w.a.x+dx*sc/length,qz=w.a.z+dz*sc/length;
        if(normal){
          // Signed offset across the wall along its inward normal; ends stay round.
          const across=(p.x-qx)*normal.x+(p.z-qz)*normal.z,along=Math.hypot(p.x-qx-across*normal.x,p.z-qz-across*normal.z);
          const side=across>=0?pos:neg,beyond=Math.max(0,Math.abs(across)-side);
          if(Math.hypot(beyond,along)>=radius)return;
        }else if(Math.hypot(p.x-qx,p.z-qz)>=reach)return;
        if(spans.some(([a,b])=>s>a&&s<b))return;
        grid[k]=0;
      });
    }
    return grid;
  });

  // Stair links: sample across the width just beyond each end (a walker can
  // stand at the foot or head of a flight, which meets the floor there).
  const links=new Map(),stairIssues=[];
  const link=(a,b)=>{for(const [u,v] of [[a,b],[b,a]]){if(!links.has(u))links.set(u,[]);links.get(u).push(v);}};
  floors.forEach((f,fi)=>{
    for(const s of views[fi].stairs){
      if(!floors[fi+1]){stairIssues.push({floorId:f.id,stairId:s.id,label:s.label||s.id,issue:'no-upper-floor'});continue;}
      const horizontal=['east','west'].includes(s.direction),positive=['east','south'].includes(s.direction),half=Math.max(.05,Number(s.width)/2-radius);
      const end=(top,offset)=>{const sign=(top===positive)?1:-1,d=Number(s.run)/2+cell*1.5;return {x:s.x+(horizontal?sign*d:offset),z:s.z+(horizontal?offset:sign*d)};};
      const lower=[],upper=[];
      for(const offset of [-half,0,half]){
        const lo=cellOf(end(false,offset)),up=cellOf(end(true,offset));
        if(lo>=0&&walkable[fi][lo])lower.push(fi*n+lo);
        if(up>=0&&walkable[fi+1][up])upper.push((fi+1)*n+up);
      }
      if(!lower.length)stairIssues.push({floorId:f.id,stairId:s.id,label:s.label||s.id,issue:'lower-entrance-blocked'});
      if(!upper.length)stairIssues.push({floorId:f.id,stairId:s.id,label:s.label||s.id,issue:'upper-arrival-blocked'});
      for(const a of lower)for(const b of upper)link(a,b);
    }
  });

  // Flood from the terrain margin of the ground floor.
  const reached=new Uint8Array(n*floors.length),queue=new Int32Array(n*floors.length);let head=0,tail=0;
  const push=g=>{if(!reached[g]&&walkable[Math.floor(g/n)][g%n]){reached[g]=1;queue[tail++]=g;}};
  for(let i=0;i<nx;i++){push(ground*n+i);push(ground*n+(nz-1)*nx+i);}
  for(let j=0;j<nz;j++){push(ground*n+j*nx);push(ground*n+j*nx+nx-1);}
  // Optional interior start points; one that is not on walkable floor is reported.
  const startReport=starts.map(s=>{const fi=floors.findIndex(f=>f.id===s.floorId),k=fi<0?-1:cellOf(s);const ok=k>=0&&!!walkable[fi][k];if(ok)push(fi*n+k);return {...s,ok};});
  while(head<tail){
    const g=queue[head++],fi=Math.floor(g/n),k=g%n,i=k%nx,j=(k-i)/nx;
    if(i>0)push(g-1);if(i<nx-1)push(g+1);if(j>0)push(g-nx);if(j<nz-1)push(g+nx);
    for(const t of links.get(g)||[])push(t);
  }

  // Group unreached walkable cells into components and name them by region labels.
  const cellArea=cell*cell,report=[],unreachable=[];
  floors.forEach((f,fi)=>{
    const grid=walkable[fi],seen=new Uint8Array(n);let walkableCells=0,reachedCells=0;
    const terrain=fi===ground?new Uint8Array(n):null;
    if(terrain){for(let k=0;k<n;k++)terrain[k]=1;for(const r of surfaces[fi])forCells(bounds(r),(k,p)=>{if(inside(r,p))terrain[k]=0;});}
    for(let k=0;k<n;k++){
      if(!grid[k]||terrain?.[k])continue;walkableCells++;if(reached[fi*n+k]){reachedCells++;continue;}
      if(seen[k])continue;
      const stack=[k],cells=[];seen[k]=1;let count=0,sx=0,sz=0;const box={minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity};
      while(stack.length){
        const c=stack.pop(),i=c%nx,j=(c-i)/nx,p=centre(i,j);count++;sx+=p.x;sz+=p.z;cells.push(p);
        box.minX=Math.min(box.minX,p.x-cell/2);box.maxX=Math.max(box.maxX,p.x+cell/2);box.minZ=Math.min(box.minZ,p.z-cell/2);box.maxZ=Math.max(box.maxZ,p.z+cell/2);
        for(const q of [i>0?c-1:-1,i<nx-1?c+1:-1,j>0?c-nx:-1,j<nz-1?c+nx:-1])if(q>=0&&!seen[q]&&grid[q]&&!reached[fi*n+q]&&!terrain?.[q]){seen[q]=1;stack.push(q);}
      }
      const area=count*cellArea;if(area<minArea)continue;
      const centroid={x:sx/count,z:sz/count};
      // Name the area by the labelled regions it mostly covers (at least half
      // of the region, or at least half of the area), largest overlap first.
      const labels=[...new Set((f.regions||[]).filter(r=>r.label).map(r=>{
        const b=bounds(r),overlap=cells.filter(p=>p.x>=b.minX&&p.x<=b.maxX&&p.z>=b.minZ&&p.z<=b.maxZ&&inside(r,p)).length*cellArea;
        const regionArea=Math.max(cellArea,(b.maxX-b.minX)*(b.maxZ-b.minZ));
        return {label:r.label,overlap,share:Math.max(overlap/regionArea,overlap/area)};
      }).filter(q=>q.share>=.5).sort((a,b)=>b.overlap-a.overlap).map(q=>q.label))].slice(0,6);
      unreachable.push({floorId:f.id,floorLabel:f.label||`Floor ${fi+1}`,floorIndex:fi+1,area:Math.round(area*100)/100,
        centroid:{x:Math.round(centroid.x*100)/100,z:Math.round(centroid.z*100)/100},
        bounds:Object.fromEntries(Object.entries(box).map(([key,v])=>[key,Math.round(v*100)/100])),regionLabels:labels});
    }
    report.push({floorId:f.id,label:f.label||`Floor ${fi+1}`,index:fi+1,ground:fi===ground,walkableArea:Math.round(walkableCells*cellArea*100)/100,reachedArea:Math.round(reachedCells*cellArea*100)/100});
  });
  return {ok:!unreachable.length&&startReport.every(s=>s.ok),settings:{cell,radius,minArea,bodyHeight},starts:startReport,floors:report,unreachable,stairIssues,
    note:'Static connectivity from open ground (and any route start points) through doors, empty passages and stairs; walls/railings are inflated by the walker radius, shaped walls by their profile up to body height. Not a physics, headroom or door-swing check.'};
}

// Validation-style warnings for callers that opt in (CLI validate --reachability).
export function reachabilityWarnings(building,options){
  const result=analyzeReachability(building,options),warnings=[];
  const from=result.starts.length?' or the route start':'';
  for(const s of result.starts.filter(s=>!s.ok))warnings.push({path:`Floor ${floorIndexOf(building,s.floorId)}`,message:`Floor ${floorIndexOf(building,s.floorId)}: route start (${s.x}, ${s.z}) is not on walkable floor (inside a wall, stair or railing clearance, or off the floor)`,targets:[{type:'floor',floorId:s.floorId}]});
  for(const u of result.unreachable){
    const where=u.regionLabels.length?` (${u.regionLabels.join(', ')})`:'';
    warnings.push({path:`Floor ${u.floorIndex}`,message:`Floor ${u.floorIndex}: ${u.area.toFixed(1)} m² of floor near (${u.centroid.x}, ${u.centroid.z})${where} cannot be reached from outside${from} through doors, passages and stairs`,targets:[{type:'floor',floorId:u.floorId}]});
  }
  for(const s of result.stairIssues){
    const text={'no-upper-floor':'has no upper floor','lower-entrance-blocked':'lower entrance is blocked or has no floor','upper-arrival-blocked':'upper arrival is blocked or has no floor'}[s.issue];
    warnings.push({path:`Floor ${floorIndexOf(building,s.floorId)}`,message:`Floor ${floorIndexOf(building,s.floorId)}: ${s.label} ${text}`,targets:[{type:'stair',id:s.stairId,floorId:s.floorId}]});
  }
  return {result,warnings};
}
const floorIndexOf=(building,id)=>building.floors.findIndex(f=>f.id===id)+1;
