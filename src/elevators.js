// Elevators (hotel stress test): a building-level shaft serving a range of
// floors, optionally skipping some. Shared by validation, transactions, export,
// preview and the web editor. The tool exports the static assembly (shaft with
// landing openings, a movable car with its own doors, sliding landing doors,
// stop markers and control anchors); moving the car and doors is the game's
// job, as with door scripts.
import { floorElevation, floorWallHeight, wallLength, stairOpeningFootprint } from './model.js';

export const ELEVATOR_DOOR_SIDES=['minX','maxX','minZ','maxZ'];
export const ELEVATOR_DEFAULTS=Object.freeze({width:2.6,depth:2.2,doorWidth:0.9,doorHeight:2.1,doorSide:'minZ'});
// Door leaves (landing and car) overlap the jambs so no light leaks at the
// edges, and each slides by half the door width into a pocket beside the
// opening. They also reach 2 cm below the floor so no seam shows at the sill.
const SHAFT_WALL=.2,CAR_GAP=.05,CAR_WALL=.05,LEAF_OVERLAP=.05,LEAF_SINK=.02,LEAF_THICK=.04;
// Widest door whose leaves can slide fully open: the car's pockets, inside its
// side walls, are the tighter fit (the landing pockets have 5 cm to spare).
export const elevatorMaxDoorWidth=width=>width/2-SHAFT_WALL-CAR_GAP-CAR_WALL-LEAF_OVERLAP;

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
// bottom/top are floor indices; served lists the floors with a stop (the
// range minus skipFloorIds). The shaft passes through skipped floors.
export function elevatorFloorRange(building,e){
  const ids=(building.floors||[]).map(f=>f.id),bottom=ids.indexOf(e.bottomFloorId),top=ids.indexOf(e.topFloorId);
  const skip=new Set(Array.isArray(e.skipFloorIds)?e.skipFloorIds:[]),served=[];
  if(bottom>=0&&top>bottom)for(let i=bottom;i<=top;i++)if(!skip.has(ids[i]))served.push(i);
  return {bottom,top,served};
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
  if(!(s.width>=2.1&&s.width<=12)||!(s.depth>=1.6&&s.depth<=12))return 'Elevator width must be 2.1–12 m and depth 1.6–12 m (outer shaft size).';
  const maxDoor=elevatorMaxDoorWidth(s.width);
  if(!(s.doorWidth>=.7&&s.doorWidth<=maxDoor+1e-9))return `Elevator doors must be at least 0.7 m wide and leave room for each leaf to slide open into its pocket in the car: at most ${maxDoor.toFixed(2)} m for a ${s.width} m wide shaft (width/2 − 0.35).`;
  const {bottom,top,served}=elevatorFloorRange(building,e);
  if(bottom<0)return `Elevator bottomFloorId ${e.bottomFloorId} is not a floor.`;
  if(top<0)return `Elevator topFloorId ${e.topFloorId} is not a floor.`;
  if(top<=bottom)return 'Elevator topFloorId must be above bottomFloorId.';
  if(e.skipFloorIds!==undefined){
    if(!Array.isArray(e.skipFloorIds))return 'Elevator skipFloorIds must be a list of floor IDs.';
    const ids=building.floors.map(f=>f.id),seen=new Set();
    for(const id of e.skipFloorIds){const i=ids.indexOf(id);if(typeof id!=='string'||i<=bottom||i>=top)return `Elevator skipFloorIds: ${id} is not a floor between the bottom and top stops (those always have a stop).`;if(seen.has(id))return `Elevator skipFloorIds lists ${id} twice.`;seen.add(id);}
  }
  for(const i of served)if(!(s.doorHeight>=1.8&&s.doorHeight<=floorWallHeight(building,i)-.2))return `Elevator doors must be 1.8 m tall or more and leave 0.2 m of wall on floor ${i+1}.`;
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
  const s=elevatorSize(e),{bottom,top,served}=elevatorFloorRange(building,e),base=floorElevation(building,bottom);
  const hw=s.width/2,hd=s.depth/2,t=SHAFT_WALL,topY=floorElevation(building,top)+floorWallHeight(building,top)-base;
  const shaft=[
    {size:{x:s.width,y:topY,z:t},pos:{x:0,y:topY/2,z:-hd+t/2}},
    {size:{x:t,y:topY,z:s.depth-2*t},pos:{x:-hw+t/2,y:topY/2,z:0}},
    {size:{x:t,y:topY,z:s.depth-2*t},pos:{x:hw-t/2,y:topY/2,z:0}}
  ];
  const stops=[],landings=[],side=(s.width-s.doorWidth)/2,leaf=s.doorWidth/2+LEAF_OVERLAP,leafH=s.doorHeight+LEAF_OVERLAP+LEAF_SINK,travel=s.doorWidth/2;
  const leaves=z=>[-1,1].map(sx=>({side:sx<0?'Left':'Right',size:{x:leaf,y:leafH,z:LEAF_THICK},pos:{x:sx*leaf/2,y:leafH/2-LEAF_SINK,z}}));
  // Front wall: full jambs beside the doors up the whole shaft, and a header
  // above each landing opening up to the next landing (solid past skipped floors).
  shaft.push({size:{x:side,y:topY,z:t},pos:{x:-hw+side/2,y:topY/2,z:hd-t/2}},{size:{x:side,y:topY,z:t},pos:{x:hw-side/2,y:topY/2,z:hd-t/2}});
  served.forEach((i,k)=>{
    const y=floorElevation(building,i)-base,next=k<served.length-1?floorElevation(building,served[k+1])-base:topY,label=building.floors[i].label||`Floor ${i+1}`,n=String(k+1).padStart(2,'0');
    stops.push({name:`Stop_${n}`,label,floorId:building.floors[i].id,y});
    if(next-(y+s.doorHeight)>1e-3)shaft.push({size:{x:s.doorWidth,y:next-(y+s.doorHeight),z:t},pos:{x:0,y:(y+s.doorHeight+next)/2,z:hd-t/2}});
    // Anchors on the landing face: a call button to the right of the doors
    // (seen from the landing) and an indicator above them.
    landings.push({name:`Landing_${n}`,label,floorId:building.floors[i].id,y,leafTravel:travel,leaves:leaves(hd-t-LEAF_THICK/2-.01),
      callButton:{x:s.doorWidth/2+.25,y:1.1,z:hd+.01},indicator:{x:0,y:s.doorHeight+.15,z:hd+.01}});
  });
  const carW=s.width-2*t-2*CAR_GAP,carD=s.depth-2*t-2*CAR_GAP-.06,cz=-.03,front=cz+carD/2,floorT=.1,w=CAR_WALL;
  const carH=Math.min(s.doorHeight+.35,Math.min(...stops.map((st,k)=>(stops[k+1]?.y??topY)-st.y))-.1),panel=(carW-s.doorWidth)/2;
  // Car parts carry their export surface: CarFloor, CarCeiling or CarWalls.
  const car=[
    {name:'Floor',surface:'CarFloor',size:{x:carW,y:floorT,z:carD},pos:{x:0,y:-floorT/2,z:cz}},
    {name:'Ceiling',surface:'CarCeiling',size:{x:carW,y:w,z:carD},pos:{x:0,y:carH-w/2,z:cz}},
    {name:'Back',surface:'CarWalls',size:{x:carW,y:carH,z:w},pos:{x:0,y:carH/2,z:cz-carD/2+w/2}},
    {name:'Left',surface:'CarWalls',size:{x:w,y:carH,z:carD},pos:{x:-carW/2+w/2,y:carH/2,z:cz}},
    {name:'Right',surface:'CarWalls',size:{x:w,y:carH,z:carD},pos:{x:carW/2-w/2,y:carH/2,z:cz}},
    {name:'FrontLeft',surface:'CarWalls',size:{x:panel,y:carH,z:w},pos:{x:-(s.doorWidth/2+panel/2),y:carH/2,z:front-w/2}},
    {name:'FrontRight',surface:'CarWalls',size:{x:panel,y:carH,z:w},pos:{x:s.doorWidth/2+panel/2,y:carH/2,z:front-w/2}}
  ];
  if(carH-s.doorHeight>1e-3)car.push({name:'FrontHeader',surface:'CarWalls',size:{x:s.doorWidth,y:carH-s.doorHeight,z:w},pos:{x:0,y:(carH+s.doorHeight)/2,z:front-w/2}});
  // Car doors slide inside the car front panels; the car panel anchor is on
  // the side wall to the right of the doors as seen from inside.
  const carDoors={leafTravel:travel,leaves:leaves(front-w-LEAF_THICK/2-.01)},carPanel={x:-(carW/2-w-.01),y:1.1,z:front-.4};
  return {base,topY,shaft,shaftWall:t,car,carDoors,carPanel,carHeight:carH,stops,landings,size:s};
}
