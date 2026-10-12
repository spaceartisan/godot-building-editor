// Elevators (hotel stress test): a building-level shaft serving a contiguous
// range of floors. Shared by validation, transactions, export, preview and the
// web panel. The tool exports the static assembly (shaft with landing
// openings, a movable car, sliding landing doors, stop markers); moving the car
// and doors is the game's job, as with door scripts.
import { floorElevation, floorWallHeight, wallLength, stairOpeningFootprint } from './model.js';

export const ELEVATOR_DOOR_SIDES=['minX','maxX','minZ','maxZ'];
export const ELEVATOR_DEFAULTS=Object.freeze({width:2.4,depth:2.2,doorWidth:0.9,doorHeight:2.1,doorSide:'minZ'});
// Landing door leaves overlap the jambs so no light leaks at the edges, and
// each slides into a pocket beside the opening, inside the shaft walls. They
// also reach 2 cm below the landing floor so no seam shows at the sill.
const SHAFT_WALL=.2,CAR_GAP=.05,LEAF_OVERLAP=.05,LEAF_SINK=.02;
// Widest door whose leaves can slide fully open without entering the side walls.
export const elevatorMaxDoorWidth=width=>width/2-SHAFT_WALL-LEAF_OVERLAP;

const num=(v,fallback)=>Number.isFinite(Number(v))?Number(v):fallback;
export function elevatorSize(e){
  return {width:num(e.width,ELEVATOR_DEFAULTS.width),depth:num(e.depth,ELEVATOR_DEFAULTS.depth),doorWidth:num(e.doorWidth,ELEVATOR_DEFAULTS.doorWidth),doorHeight:num(e.doorHeight,ELEVATOR_DEFAULTS.doorHeight),doorSide:e.doorSide||ELEVATOR_DEFAULTS.doorSide};
}
// World footprint: width runs along the door wall, depth away from it.
export function elevatorFootprint(e){
  const {width,depth,doorSide}=elevatorSize(e),alongX=doorSide.endsWith('Z'),hx=(alongX?width:depth)/2,hz=(alongX?depth:width)/2;
  return {minX:e.x-hx,maxX:e.x+hx,minZ:e.z-hz,maxZ:e.z+hz};
}
// Rotation about Y that turns the elevator scene's local +Z toward the door side.
export function elevatorYaw(e){
  return {maxZ:0,minZ:Math.PI,maxX:Math.PI/2,minX:-Math.PI/2}[elevatorSize(e).doorSide];
}
export function elevatorFloorRange(building,e){
  const ids=(building.floors||[]).map(f=>f.id),bottom=ids.indexOf(e.bottomFloorId),top=ids.indexOf(e.topFloorId);
  return {bottom,top};
}
// Floors above the bottom stop get a hole in their automatic floor at the shaft.
export function elevatorFloorHoles(building,floorIndex){
  return (building.elevators||[]).filter(e=>{const {bottom,top}=elevatorFloorRange(building,e);return bottom>=0&&top>bottom&&floorIndex>bottom&&floorIndex<=top;}).map(elevatorFootprint);
}

export function elevatorProblem(building,e){
  if(!e||typeof e!=='object')return 'Elevator must be an object.';
  for(const k of ['x','z'])if(!Number.isFinite(e[k])||Math.abs(e[k])>1e6)return `Elevator ${k} must be a finite number.`;
  const s=elevatorSize(e);
  if(!ELEVATOR_DOOR_SIDES.includes(s.doorSide))return 'Elevator doorSide must be minX, maxX, minZ or maxZ.';
  if(!(s.width>=1.4&&s.width<=12)||!(s.depth>=1.4&&s.depth<=12))return 'Elevator width and depth must be 1.4–12 m (outer shaft size).';
  const maxDoor=elevatorMaxDoorWidth(s.width);
  if(!(s.doorWidth>=.7&&s.doorWidth<=maxDoor+1e-9))return `Elevator doors must be at least 0.7 m wide and leave room for each leaf to slide open inside the shaft: at most ${maxDoor.toFixed(2)} m for a ${s.width} m wide shaft (width/2 − 0.25).`;
  const {bottom,top}=elevatorFloorRange(building,e);
  if(bottom<0)return `Elevator bottomFloorId ${e.bottomFloorId} is not a floor.`;
  if(top<0)return `Elevator topFloorId ${e.topFloorId} is not a floor.`;
  if(top<=bottom)return 'Elevator topFloorId must be above bottomFloorId.';
  for(let i=bottom;i<=top;i++)if(!(s.doorHeight>=1.8&&s.doorHeight<=floorWallHeight(building,i)-.2))return `Elevator doors must be 1.8 m tall or more and leave 0.2 m of wall on floor ${i+1}.`;
  const fp=elevatorFootprint(e),name=e.label||e.id;
  for(let i=bottom;i<=top;i++){
    const floor=building.floors[i];
    for(const w of floor.walls||[])if(segmentCrossesInterior(w,fp))return `Wall ${w.label||w.id} on floor ${i+1} runs through elevator ${name}; walls may touch the shaft but not cross it.`;
    for(const r of floor.railings||[])if(segmentCrossesInterior(r,fp))return `Railing ${r.label||r.id} on floor ${i+1} runs through elevator ${name}.`;
    for(const p of floor.platforms||[])if(overlaps(p,fp))return `Porch/deck ${p.label||p.id} on floor ${i+1} overlaps elevator ${name}.`;
    for(const st of [...(floor.stairs||[]),...(building.floors[i-1]?.stairs||[])])if(overlaps(stairOpeningFootprint(st,0),fp))return `Stair ${st.label||st.id} overlaps elevator ${e.label||e.id} on floor ${i+1}.`;
  }
  // Building-level surfaces inside the shaft's height would block the car. A
  // manual floor at the bottom stop (the pit floor) and roofs at or above the
  // shaft top (capping it) are fine.
  const base=floorElevation(building,bottom),shaftTop=floorElevation(building,top)+floorWallHeight(building,top),inShaft=(lo,hi)=>hi>base+.05&&lo<shaftTop-.05;
  for(const [list,kind] of [[building.manualFloors,'Manual floor'],[building.manualCeilings,'Manual ceiling']])for(const m of list||[]){
    const topY=Number(m.topY),thick=Number.isFinite(Number(m.thickness))?Number(m.thickness):0;
    if(Number.isFinite(topY)&&overlaps(m,fp)&&inShaft(topY-thick,topY))return `${kind} ${m.label||m.id} at ${topY.toFixed(2)} m crosses elevator ${name}; it may only sit at the bottom stop or above the shaft.`;
  }
  for(const r of building.roofSections||[]){const y=Number(r.baseY);if(Number.isFinite(y)&&overlaps(r,fp)&&y<shaftTop-.05)return `Roof ${r.label||r.id} (base ${y.toFixed(2)} m) is below the top of elevator ${name} (${shaftTop.toFixed(2)} m); a roof may cap the shaft but not cross it.`;}
  for(const other of building.elevators||[])if(other!==e&&other.id!==e.id&&overlaps(elevatorFootprint(other),fp)){const r=elevatorFloorRange(building,other);if(Math.max(r.bottom,bottom)<=Math.min(r.top,top))return `Elevators ${e.label||e.id} and ${other.label||other.id} overlap.`;}
  return null;
}
const overlaps=(a,b)=>[a.minX,a.maxX,a.minZ,a.maxZ].every(Number.isFinite)&&Math.min(a.maxX,b.maxX)-Math.max(a.minX,b.minX)>1e-4&&Math.min(a.maxZ,b.maxZ)-Math.max(a.minZ,b.minZ)>1e-4;
// A wall crosses the shaft when part of its centreline lies strictly inside.
function segmentCrossesInterior(w,fp){
  const e=1e-3,inside=p=>p.x>fp.minX+e&&p.x<fp.maxX-e&&p.z>fp.minZ+e&&p.z<fp.maxZ-e,L=wallLength(w);if(!(L>0))return false;
  const steps=Math.max(2,Math.ceil(L/.05));
  for(let i=0;i<=steps;i++){const t=i/steps;if(inside({x:w.a.x+(w.b.x-w.a.x)*t,z:w.a.z+(w.b.z-w.a.z)*t}))return true;}
  return false;
}

// Geometry in the elevator scene's local frame: origin at the shaft centre on
// the bottom floor, +Z toward the door side, +X along the door wall. Boxes are
// {size, pos}. Shared by the exporter and the 3D preview.
export function elevatorLayout(building,e){
  const s=elevatorSize(e),{bottom,top}=elevatorFloorRange(building,e),base=floorElevation(building,bottom);
  const hw=s.width/2,hd=s.depth/2,t=SHAFT_WALL,topY=floorElevation(building,top)+floorWallHeight(building,top)-base;
  const shaft=[
    {size:{x:s.width,y:topY,z:t},pos:{x:0,y:topY/2,z:-hd+t/2}},
    {size:{x:t,y:topY,z:s.depth-2*t},pos:{x:-hw+t/2,y:topY/2,z:0}},
    {size:{x:t,y:topY,z:s.depth-2*t},pos:{x:hw-t/2,y:topY/2,z:0}}
  ];
  const stops=[],landings=[],side=(s.width-s.doorWidth)/2;
  // Front wall: full jambs beside the doors up the whole shaft, and a header
  // above each landing opening up to the next floor's door bottom.
  shaft.push({size:{x:side,y:topY,z:t},pos:{x:-hw+side/2,y:topY/2,z:hd-t/2}},{size:{x:side,y:topY,z:t},pos:{x:hw-side/2,y:topY/2,z:hd-t/2}});
  for(let i=bottom;i<=top;i++){
    const y=floorElevation(building,i)-base,next=i<top?floorElevation(building,i+1)-base:topY,label=building.floors[i].label||`Floor ${i+1}`;
    stops.push({name:`Stop_${String(i-bottom+1).padStart(2,'0')}`,label,floorId:building.floors[i].id,y});
    if(next-(y+s.doorHeight)>1e-3)shaft.push({size:{x:s.doorWidth,y:next-(y+s.doorHeight),z:t},pos:{x:0,y:(y+s.doorHeight+next)/2,z:hd-t/2}});
    const leaf=s.doorWidth/2+LEAF_OVERLAP,thick=.04;
    landings.push({name:`Landing_${String(i-bottom+1).padStart(2,'0')}`,label,y,leafTravel:s.doorWidth/2+LEAF_OVERLAP,leaves:[-1,1].map(sx=>({side:sx<0?'Left':'Right',size:{x:leaf,y:s.doorHeight+LEAF_OVERLAP+LEAF_SINK,z:thick},pos:{x:sx*leaf/2,y:(s.doorHeight+LEAF_OVERLAP-LEAF_SINK)/2,z:hd-t-thick/2-.01}}))});
  }
  const innerW=s.width-2*t-2*CAR_GAP,innerD=s.depth-2*t-2*CAR_GAP-.06,carH=Math.min(s.doorHeight+.35,Math.min(...stops.map((st,k)=>(stops[k+1]?.y??topY)-st.y))-.1),wall=.05,floorT=.1;
  const car=[
    {name:'Floor',size:{x:innerW,y:floorT,z:innerD},pos:{x:0,y:-floorT/2,z:-.03}},
    {name:'Ceiling',size:{x:innerW,y:wall,z:innerD},pos:{x:0,y:carH-wall/2,z:-.03}},
    {name:'Back',size:{x:innerW,y:carH,z:wall},pos:{x:0,y:carH/2,z:-.03-innerD/2+wall/2}},
    {name:'Left',size:{x:wall,y:carH,z:innerD},pos:{x:-innerW/2+wall/2,y:carH/2,z:-.03}},
    {name:'Right',size:{x:wall,y:carH,z:innerD},pos:{x:innerW/2-wall/2,y:carH/2,z:-.03}}
  ];
  return {base,topY,shaft,car,carHeight:carH,stops,landings,size:s};
}
