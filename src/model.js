import { regionAreaCells } from './regions.js';
import { areaSize, wallPolygonAreas, unionPolygonAreas, subtractPolygonAreas, mergeConvexAreas } from './polygon-areas.js';
export const DEFAULT_OMNI_LIGHT = Object.freeze({
  color: { r: 1.0, g: 0.65, b: 0.34, a: 1.0 },
  energy: 2.35,
  range: 8.0,
  shadows: true,
  group: 'building_lights'
});


export const OPENING_EDGE_MARGIN = 0.02;
export const OPENING_MIN_GAP = 0.02;

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

export function makeFloor(label = 'Floor 1') {
  return {
    id: uid('floor'),
    label,
    walls: [],
    openings: [],
    lights: [],
    stairs: [],
    slabs: [],
    regions: [],
    platforms: [],
    railings: [],
    roofSections: [],
    autoFloor: true,
    autoCeiling: true
  };
}

export function floorView(building, floorOrIndex = 0, includeRoof = true) {
  const floors = Array.isArray(building.floors) && building.floors.length ? building.floors : [];
  const floor = typeof floorOrIndex === 'number' ? floors[floorOrIndex] : floorOrIndex;
  if (!floor) return { ...building, walls: [], openings: [], lights: [], stairs: [], roof: includeRoof ? building.roof : { ...(building.roof || {}), type: 'none' } };
  const index=Math.max(0,floors.indexOf(floor));
  return {
    ...building,
    wallHeight: floorWallHeight(building, index),
    floorThickness: floorSlabThickness(building, index),
    resolvedStoryHeight: floorElevation(building, index+1)-floorElevation(building, index),
    walls: floor.walls || [],
    openings: floor.openings || [],
    lights: floor.lights || [],
    stairs: floor.stairs || [],
    slabs: floor.slabs || [],
    regions: floor.regions || [],
    platforms: floor.platforms || [],
    railings: floor.railings || [],
    roofSections: floor.roofSections || [],
    autoFloor: floor.autoFloor !== false,
    autoCeiling: floor.autoCeiling !== false,
    // Wall continuity is tied to story spacing, not to whether a slab exists.
    storyFloorSkirt: floors.indexOf(floor)>0 ? floorSlabThickness(building, floors.indexOf(floor)) : 0,
    boundaryMode: floor.boundaryMode || 'closed',
    wallUvElevation: floorElevation(building, Math.max(0, floors.indexOf(floor))),
    roof: includeRoof ? building.roof : { ...(building.roof || {}), type: 'none' }
  };
}

export function storyHeight(building) {
  if (Number.isFinite(building?.resolvedStoryHeight)) return building.resolvedStoryHeight;
  const wall = Math.max(0.2, Number(building?.wallHeight) || 2.8);
  const floor = Math.max(0.01, Number(building?.floorThickness) || 0.18);
  return wall + floor;
}

export function floorElevation(building, index) {
  const floors=building.floors||[];
  let elevation=Number.isFinite(floors[0]?.elevation)?floors[0].elevation:0;
  for(let i=1;i<=Math.max(0,index);i++) {
    elevation=Number.isFinite(floors[i]?.elevation)?floors[i].elevation:elevation+floorWallHeight(building,i-1)+floorSlabThickness(building,i);
  }
  return elevation;
}

export function floorWallHeight(building,index=0) {
  return building.floors?.[index]?.wallHeight ?? building.wallHeight ?? 2.8;
}

export function floorSlabThickness(building,index=0) {
  return building.floors?.[index]?.floorThickness ?? building.floorThickness ?? .18;
}

// Independent surfaces retain absolute heights. Editing levels never silently
// moves or deletes them; the editor warns and offers undo for the whole edit.
export function structuralEditImpact(building) {
  return ['roofSections','manualFloors','manualCeilings'].reduce((n,k)=>n+(building[k]?.length||0),0);
}

export function removeTopFloor(building) {
  if(building.floors.length<=1)return {removed:false,stairs:0,surfaces:0};
  building.floors.pop();
  const lower=building.floors.at(-1),stairs=lower.stairs?.length||0;
  lower.stairs=[];
  return {removed:true,stairs,surfaces:structuralEditImpact(building)};
}

export function makeStair(bottom, top, width = 2.4, styleOrLegacySteps = 'ramp', stepsOrLabel = 12, labelArg = 'Staircase') {
  // Supports both the current style-aware signature and the original legacy
  // stepped signature: makeStair(..., width, steps, label).
  let style='ramp', steps=12, label=labelArg;
  if (typeof styleOrLegacySteps === 'number') {
    style='steps';
    steps=Math.max(2,Math.round(Number(styleOrLegacySteps)||12));
    label=typeof stepsOrLabel==='string'?stepsOrLabel:'Staircase';
  } else if (styleOrLegacySteps === 'ramp' || styleOrLegacySteps === 'steps') {
    style=styleOrLegacySteps;
    if (typeof stepsOrLabel === 'number') steps=Math.max(2,Math.round(Number(stepsOrLabel)||12));
    else if (typeof stepsOrLabel === 'string') label=stepsOrLabel;
  } else if (typeof styleOrLegacySteps === 'string') {
    // Backwards compatibility with the short-lived ramp-only API where the
    // fourth argument was a label.
    style='ramp';
    label=styleOrLegacySteps || 'Ramp';
  }
  const dx = Number(top.x) - Number(bottom.x);
  const dz = Number(top.z) - Number(bottom.z);
  let direction, run;
  if (Math.abs(dx) >= Math.abs(dz)) {
    direction = dx >= 0 ? 'east' : 'west';
    run = Math.abs(dx);
  } else {
    direction = dz >= 0 ? 'south' : 'north';
    run = Math.abs(dz);
  }
  return {
    id: uid('stair'),
    label: label || (style==='steps'?'Staircase':'Ramp'),
    x: Math.abs(dx)>=Math.abs(dz) ? (Number(bottom.x)+Number(top.x))/2 : Number(bottom.x),
    z: Math.abs(dx)>=Math.abs(dz) ? Number(bottom.z) : (Number(bottom.z)+Number(top.z))/2,
    width: Math.max(0.5, Number(width) || 2.4),
    run: Math.max(1.0, run || 1.0),
    direction,
    style,
    steps,
    blockBelow: true
  };
}

export function stairFootprint(stair, margin = 0) {
  const width = Math.max(0.1, Number(stair.width) || 2.4) + margin * 2;
  const run = Math.max(0.1, Number(stair.run) || 6.5) + margin * 2;
  const horizontal = stair.direction === 'east' || stair.direction === 'west';
  return {
    minX: Number(stair.x) - (horizontal ? run : width) / 2,
    maxX: Number(stair.x) + (horizontal ? run : width) / 2,
    minZ: Number(stair.z) - (horizontal ? width : run) / 2,
    maxZ: Number(stair.z) + (horizontal ? width : run) / 2
  };
}

// Clearance beside a stair must not separate its top edge from the landing.
export function stairOpeningFootprint(stair, margin=.06) {
  const r=stairFootprint(stair,margin),end=stairFootprint(stair,0);
  if(stair.direction==='east')r.maxX=end.maxX;
  else if(stair.direction==='west')r.minX=end.minX;
  else if(stair.direction==='south')r.maxZ=end.maxZ;
  else r.minZ=end.minZ;
  return r;
}

export function makeEmptyBuilding() {
  return {
    version: 9,
    name: 'New Building',
    exportProfile: 'generic',
    wallHeight: 2.8,
    wallThickness: 0.18,
    floorThickness: 0.18,
    gridSize: 0.5,
    roof: { type: 'gable', pitch: 35, overhang: 0.35 },
    roofSections: [],
    manualFloors: [],
    manualCeilings: [],
    ceiling: { thickness: 0.12 },
    windowMesh: { enabled: true, frameWidth: 0.08, frameDepth: 0.12, glassThickness: 0.018 },
    doorMesh: { enabled: true, frameWidth: 0.09, frameDepth: 0.14, panelThickness: 0.045, detailDepth: 0.018 },
    floors: [makeFloor('Floor 1')]
  };
}


export function makeOmniLight(x = 0, z = 0, y = 2.2, label = 'Light') {
  return {
    id: uid('light'),
    label,
    position: { x, y, z },
    color: { ...DEFAULT_OMNI_LIGHT.color },
    energy: DEFAULT_OMNI_LIGHT.energy,
    range: DEFAULT_OMNI_LIGHT.range,
    shadows: DEFAULT_OMNI_LIGHT.shadows,
    group: DEFAULT_OMNI_LIGHT.group
  };
}


export function makeRectArea(a, b, label = 'Area') {
  return {
    id: uid('rect'),
    label,
    minX: Math.min(Number(a.x), Number(b.x)),
    maxX: Math.max(Number(a.x), Number(b.x)),
    minZ: Math.min(Number(a.z), Number(b.z)),
    maxZ: Math.max(Number(a.z), Number(b.z))
  };
}

export function makeManualSurface(a, b, kind = 'floor', topY = 0, thickness = 0.18, label = '') {
  const r=makeRectArea(a,b,label || (kind==='ceiling'?'Manual Ceiling':'Manual Floor'));
  r.id=uid(kind==='ceiling'?'mceil':'mfloor');
  r.kind=kind==='ceiling'?'ceiling':'floor';
  r.topY=Number.isFinite(Number(topY))?Number(topY):0;
  r.thickness=Math.max(0.01,Number(thickness)||0.18);
  return r;
}

export function rectValid(r) {
  return !!r && Number(r.maxX) - Number(r.minX) >= 0.1 && Number(r.maxZ) - Number(r.minZ) >= 0.1;
}

export function makePlatform(a, b, kind = 'porch', height = 0, label = '') {
  const normalizedKind = kind === 'deck' ? 'deck' : 'porch';
  const r = makeRectArea(a, b, label || (normalizedKind === 'deck' ? 'Deck' : 'Porch'));
  return { ...r, kind: normalizedKind, height: Number(height) || 0, covered: normalizedKind === 'porch' };
}

export function makeRailing(a, b, label = 'Railing', height = 1.0, style = 'two_rail') {
  return {
    id: uid('rail'),
    label,
    a: { x: Number(a.x), z: Number(a.z) },
    b: { x: Number(b.x), z: Number(b.z) },
    height: Math.max(0.4, Number(height) || 1.0),
    style: ['two_rail','picket','cross_brace'].includes(style) ? style : 'two_rail'
  };
}

export function makeRoofSection(a, b, type = 'gable', direction = 'x', label = 'Roof Section', baseY = 2.8, pitch = 35, overhang = 0.35) {
  const r = makeRectArea(a, b, label);
  return {
    ...r,
    type: ['gable','shed','flat','hip'].includes(type) ? type : 'gable',
    direction: direction === 'z' ? 'z' : 'x',
    baseY: Number.isFinite(Number(baseY)) ? Number(baseY) : 2.8,
    pitch: Math.max(5, Math.min(70, Number(pitch) || 35)),
    overhang: Math.max(0, Number(overhang) || 0),
    gableEnds: 'both'
  };
}

function W(x1, z1, x2, z2, label = '', role = 'interior', height = null) {
  return { id: uid('wall'), a: {x:x1,z:z1}, b:{x:x2,z:z2}, label, role, height };
}
function O(type, wall, t, width, height, sill = 0, label = '', doorStyle = 'room') {
  const o = { id: uid(type), type, wallId: wall.id, t, width, height, label };
  if (type === 'door') o.doorStyle = doorStyle;
  else { o.sill = sill; o.windowStyle = 'plain'; }
  return o;
}

export function makeFarmhousePreset() {
  const b = makeEmptyBuilding();
  b.name = 'Miller Farmhouse';
  b.exportProfile = 'get_probed';
  b.wallHeight = 2.8;
  b.wallThickness = 0.18;
  b.floorThickness = 0.18;
  b.roof = { type:'gable', pitch:35, overhang:0.4 };
  b.ceiling = { enabled:true, thickness:0.12 };
  b.windowMesh = { enabled:true, frameWidth:0.08, frameDepth:0.12, glassThickness:0.018 };
  b.doorMesh = { enabled:true, frameWidth:0.09, frameDepth:0.14, panelThickness:0.045, detailDepth:0.018 };

  const floor = b.floors[0];

  // 12m x 9m outer shell. Interior partitions make the farmhouse intentionally
  // more cumbersome than a single open room while staying easy to remix.
  const n = W(-6,-4.5, 6,-4.5, 'North Exterior', 'exterior');
  const e = W( 6,-4.5, 6, 4.5, 'East Exterior', 'exterior');
  const s = W( 6, 4.5,-6, 4.5, 'South Exterior', 'exterior');
  const w = W(-6, 4.5,-6,-4.5, 'West Exterior', 'exterior');
  const hallL = W(-1.0,-4.5,-1.0, 4.5, 'Hall West');
  const hallR = W( 1.0,-4.5, 1.0, 4.5, 'Hall East');
  const leftA = W(-6,-0.8,-1.0,-0.8, 'Living / Kitchen');
  const leftB = W(-6, 2.0,-1.0, 2.0, 'Kitchen / Utility');
  const rightA = W(1.0,-1.2,6,-1.2, 'Bedroom / Bath');
  const rightB = W(1.0, 1.8,6, 1.8, 'Bath / Rest Room');
  floor.walls.push(n,e,s,w,hallL,hallR,leftA,leftB,rightA,rightB);

  floor.openings.push(
    O('door', s, 0.50, 1.15, 2.15, 0, 'Front Door', 'exterior'),
    O('door', hallL, 0.18, 0.9, 2.1, 0, 'Living Door', 'room'),
    O('door', hallL, 0.53, 0.9, 2.1, 0, 'Kitchen Door', 'room'),
    O('door', hallL, 0.82, 0.9, 2.1, 0, 'Utility Door', 'room'),
    O('door', hallR, 0.18, 0.9, 2.1, 0, 'Bedroom Door', 'room'),
    O('door', hallR, 0.52, 0.9, 2.1, 0, 'Bathroom Door', 'room'),
    O('door', hallR, 0.82, 0.9, 2.1, 0, 'Rest Room Door', 'room'),
    O('window', n, 0.20, 1.5, 1.15, 0.85, 'Living Window'),
    O('window', n, 0.80, 1.5, 1.15, 0.85, 'Bedroom Window'),
    O('window', w, 0.28, 1.4, 1.0, 0.95, 'Living Side Window'),
    O('window', e, 0.30, 1.2, 1.0, 0.95, 'Bedroom Side Window'),
    O('window', e, 0.76, 1.0, 0.9, 1.05, 'Rest Side Window')
  );
  return b;
}


function scopeWalls(building) {
  return Array.isArray(building.walls) ? building.walls : (building.floors?.[0]?.walls || []);
}
function scopeOpenings(building) {
  return Array.isArray(building.openings) ? building.openings : (building.floors?.[0]?.openings || []);
}

export function wallLength(w) {
  return Math.hypot(w.b.x-w.a.x, w.b.z-w.a.z);
}

export function wallHeightFor(building, wall) {
  const storyHeight=Math.max(.2,Number(building.wallHeight)||2.8);
  if(wall && wall.height != null && Number.isFinite(Number(wall.height))) return clamp(Number(wall.height),.1,storyHeight);
  return storyHeight;
}


export function pointOnWall(w, t) {
  return { x: w.a.x + (w.b.x-w.a.x)*t, z: w.a.z + (w.b.z-w.a.z)*t };
}

export function projectToWall(w, p) {
  const vx = w.b.x-w.a.x, vz = w.b.z-w.a.z;
  const len2 = vx*vx+vz*vz || 1;
  const t = Math.max(0, Math.min(1, ((p.x-w.a.x)*vx+(p.z-w.a.z)*vz)/len2));
  const q = pointOnWall(w,t);
  return {t, q, distance: Math.hypot(p.x-q.x,p.z-q.z)};
}

export function findWall(building, id) { return scopeWalls(building).find(w => w.id === id); }
export function openingsForWall(building, wallId) { return scopeOpenings(building).filter(o => o.wallId === wallId); }


export function constrainedOpening(building, opening) {
  const copy={...opening};
  const wall=findWall(building,copy.wallId);
  if(!wall) return copy;
  const L=wallLength(wall);
  if(L < 1e-6) return copy;

  const margin=Math.min(OPENING_EDGE_MARGIN,L*.1);
  const maxWidth=Math.max(.02,L-margin*2);
  const minWidth=Math.min(.1,maxWidth);
  copy.width=clamp(Number(copy.width)||minWidth,minWidth,maxWidth);

  const half=copy.width/2;
  const minCenter=margin+half;
  const maxCenter=L-margin-half;
  const center=clamp((Number(copy.t)||0)*L,Math.min(minCenter,L/2),Math.max(maxCenter,L/2));
  copy.t=L>0 ? center/L : .5;

  const wallHeight=Math.max(.02,wallHeightFor(building,wall));
  if(copy.type==='door'){
    delete copy.sill;
    copy.height=clamp(Number(copy.height)||Math.min(2.1,wallHeight),Math.min(.1,wallHeight),wallHeight);
  }else{
    copy.sill=clamp(Number(copy.sill)||0,0,Math.max(0,wallHeight-.02));
    const available=Math.max(.02,wallHeight-copy.sill);
    copy.height=clamp(Number(copy.height)||Math.min(1.05,available),Math.min(.1,available),available);
  }
  return copy;
}

export function applyOpeningConstraints(building, opening) {
  Object.assign(opening,constrainedOpening(building,opening));
  if(opening.type==='door') delete opening.sill;
  return opening;
}

export function openingInterval(building, opening) {
  const wall=findWall(building,opening.wallId);
  if(!wall) return null;
  const L=wallLength(wall);
  if(L<1e-6) return null;
  const o=constrainedOpening(building,opening);
  const center=o.t*L;
  return {start:center-o.width/2,end:center+o.width/2,width:o.width,t:o.t};
}

export function findOpeningConflict(building, opening, ignoreId=opening.id) {
  const a=openingInterval(building,opening);
  if(!a) return null;
  for(const other of openingsForWall(building,opening.wallId)){
    if(other.id===ignoreId) continue;
    const b=openingInterval(building,other);
    if(!b) continue;
    if(a.start < b.end + OPENING_MIN_GAP && a.end > b.start - OPENING_MIN_GAP) return other;
  }
  return null;
}

export function validateOpeningLayout(building) {
  const issues=[];
  for(const o of scopeOpenings(building)){
    const wall=findWall(building,o.wallId);
    if(!wall){issues.push({type:'missing_wall',opening:o,message:`${o.label||o.type} references a missing wall.`});continue;}
    const c=constrainedOpening(building,o);
    if(Math.abs((Number(o.width)||0)-c.width)>1e-5 || Math.abs((Number(o.height)||0)-c.height)>1e-5 || Math.abs((Number(o.t)||0)-c.t)>1e-5 || (o.type==='window'&&Math.abs((Number(o.sill)||0)-c.sill)>1e-5)){
      issues.push({type:'out_of_bounds',opening:o,message:`${o.label||o.type} exceeds its host wall bounds.`});
    }
    const conflict=findOpeningConflict(building,o,o.id);
    if(conflict && String(o.id)<String(conflict.id)) issues.push({type:'overlap',opening:o,other:conflict,message:`${o.label||o.type} overlaps ${conflict.label||conflict.type}.`});
  }
  return issues;
}

export function splitWallIntoSolidSegments(building, wall) {
  const L = wallLength(wall);
  if (L < 1e-6) return [];
  const openings = openingsForWall(building, wall.id).map(o => {
    const c=constrainedOpening(building,o);
    const center = c.t * L;
    return {...c, start:center-c.width/2, end:center+c.width/2};
  });
  const breaks = [0, L];
  for (const o of openings) breaks.push(o.start, o.end);
  breaks.sort((a,b)=>a-b);
  const unique = breaks.filter((v,i,a)=>i===0 || Math.abs(v-a[i-1])>1e-6);
  const out = [];
  for (let i=0;i<unique.length-1;i++) {
    const x0=unique[i], x1=unique[i+1];
    if (x1-x0 < 1e-5) continue;
    const mid=(x0+x1)/2;
    const o = openings.find(q => mid > q.start+1e-6 && mid < q.end-1e-6);
    if (!o) {
      out.push({start:x0,end:x1,bottom:0,top:wallHeightFor(building,wall)});
    } else if (o.type === 'door') {
      const wallHeight=wallHeightFor(building,wall);
      if (o.height < wallHeight) out.push({start:x0,end:x1,bottom:o.height,top:wallHeight});
    } else {
      if (o.sill > 0) out.push({start:x0,end:x1,bottom:0,top:o.sill});
      const topStart = o.sill + o.height;
      const wallHeight=wallHeightFor(building,wall);
      if (topStart < wallHeight) out.push({start:x0,end:x1,bottom:topStart,top:wallHeight});
    }
  }
  return out;
}



const FOOTPRINT_EPS = 1e-5;

function exteriorWallsOf(building) {
  return scopeWalls(building).filter(w => w.role === 'exterior' || /\bexterior\b/i.test(w.label || ''));
}

export function hasClosedOrthogonalExteriorFootprint(building) {
  return exteriorFootprintIssue(building)===null && exteriorWallsOf(building).every(w=>Math.abs(w.a.x-w.b.x)<FOOTPRINT_EPS||Math.abs(w.a.z-w.b.z)<FOOTPRINT_EPS);
}

export function exteriorFootprintIssue(building) {
  const walls=exteriorWallsOf(building).filter(w=>wallLength(w)>FOOTPRINT_EPS);
  if(walls.length<3) return 'The exterior outline needs a closed wall loop.';
  const key=p=>`${Math.round(Number(p.x)/FOOTPRINT_EPS)}:${Math.round(Number(p.z)/FOOTPRINT_EPS)}`;
  const degree=new Map();
  for(const w of walls){
    const dx=w.b.x-w.a.x,dz=w.b.z-w.a.z;
    for(const p of [w.a,w.b]) degree.set(key(p),(degree.get(key(p))||0)+1);
  }
  if(![...degree.values()].every(v=>v===2))return 'The exterior outline has open ends or branches.';
  const near=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)<FOOTPRINT_EPS;
  for(let i=0;i<walls.length;i++)for(let j=i+1;j<walls.length;j++){
    const a=walls[i],b=walls[j],dx=a.b.x-a.a.x,dz=a.b.z-a.a.z,ex=b.b.x-b.a.x,ez=b.b.z-b.a.z;
    const det=dx*ez-dz*ex,qx=b.a.x-a.a.x,qz=b.a.z-a.a.z;
    if(Math.abs(det)<FOOTPRINT_EPS){
      if(Math.abs(qx*dz-qz*dx)>FOOTPRINT_EPS)continue;
      const l=dx*dx+dz*dz,t0=(qx*dx+qz*dz)/l,t1=t0+(ex*dx+ez*dz)/l;
      if(Math.min(1,Math.max(t0,t1))-Math.max(0,Math.min(t0,t1))>FOOTPRINT_EPS)return 'Exterior walls overlap; remove redundant segments.';
    }else{
      const t=(qx*ez-qz*ex)/det,u=(qx*dz-qz*dx)/det;
      if(t>=-FOOTPRINT_EPS&&t<=1+FOOTPRINT_EPS&&u>=-FOOTPRINT_EPS&&u<=1+FOOTPRINT_EPS){
        const p={x:a.a.x+t*dx,z:a.a.z+t*dz};
        if(!([a.a,a.b].some(q=>near(p,q))&&[b.a,b.b].some(q=>near(p,q))))return 'Exterior walls cross away from a shared corner.';
      }
    }
  }
  return null;
}

export function pointInExteriorFootprint(building, point) {
  let inside=false;
  for(const edge of exteriorWallsOf(building)){
    const a=edge.a,b=edge.b;
    if(Math.abs(a.z-b.z)<FOOTPRINT_EPS) continue;
    if((a.z>point.z)===(b.z>point.z)) continue;
    const x=a.x+(point.z-a.z)*(b.x-a.x)/(b.z-a.z);
    if(x>point.x) inside=!inside;
  }
  return inside;
}

function mergeRectCells(cells=[]) {
  if(!cells.length) return [];
  let rows=[];
  cells=[...cells].sort((a,b)=>a.minZ-b.minZ||a.maxZ-b.maxZ||a.minX-b.minX);
  for(const c of cells){
    const last=rows[rows.length-1];
    if(last&&Math.abs(last.minZ-c.minZ)<FOOTPRINT_EPS&&Math.abs(last.maxZ-c.maxZ)<FOOTPRINT_EPS&&Math.abs(last.maxX-c.minX)<FOOTPRINT_EPS) last.maxX=c.maxX;
    else rows.push({...c});
  }
  const merged=[];
  rows.sort((a,b)=>a.minX-b.minX||a.maxX-b.maxX||a.minZ-b.minZ);
  for(const r of rows){
    const last=merged[merged.length-1];
    if(last&&Math.abs(last.minX-r.minX)<FOOTPRINT_EPS&&Math.abs(last.maxX-r.maxX)<FOOTPRINT_EPS&&Math.abs(last.maxZ-r.minZ)<FOOTPRINT_EPS) last.maxZ=r.maxZ;
    else merged.push({...r});
  }
  return merged;
}

export function unionRectAreas(rects=[]) {
  const valid=(rects||[]).filter(r=>r?.polygon?areaSize(r)>1e-7:rectValid(r));
  if(valid.some(r=>r.polygon))return unionPolygonAreas(valid);
  if(!valid.length) return [];
  const xs=[...new Set(valid.flatMap(r=>[Number(r.minX),Number(r.maxX)]))].sort((a,b)=>a-b);
  const zs=[...new Set(valid.flatMap(r=>[Number(r.minZ),Number(r.maxZ)]))].sort((a,b)=>a-b);
  const cells=[];
  for(let xi=0;xi<xs.length-1;xi++)for(let zi=0;zi<zs.length-1;zi++){
    const minX=xs[xi],maxX=xs[xi+1],minZ=zs[zi],maxZ=zs[zi+1];
    if(maxX-minX<=FOOTPRINT_EPS||maxZ-minZ<=FOOTPRINT_EPS)continue;
    const cx=(minX+maxX)/2,cz=(minZ+maxZ)/2;
    if(valid.some(r=>cx>r.minX-FOOTPRINT_EPS&&cx<r.maxX+FOOTPRINT_EPS&&cz>r.minZ-FOOTPRINT_EPS&&cz<r.maxZ+FOOTPRINT_EPS)) cells.push({minX,maxX,minZ,maxZ});
  }
  return mergeRectCells(cells);
}

export function subtractRectAreas(baseRects=[], blockerRects=[]) {
  if([...baseRects,...blockerRects].some(r=>r.polygon))return subtractPolygonAreas(unionPolygonAreas(baseRects),unionPolygonAreas(blockerRects));
  const bases=unionRectAreas(baseRects);
  const blockers=unionRectAreas(blockerRects);
  if(!bases.length) return [];
  if(!blockers.length) return bases;
  const xs=[...new Set([...bases,...blockers].flatMap(r=>[Number(r.minX),Number(r.maxX)]))].sort((a,b)=>a-b);
  const zs=[...new Set([...bases,...blockers].flatMap(r=>[Number(r.minZ),Number(r.maxZ)]))].sort((a,b)=>a-b);
  const cells=[];
  for(let xi=0;xi<xs.length-1;xi++)for(let zi=0;zi<zs.length-1;zi++){
    const minX=xs[xi],maxX=xs[xi+1],minZ=zs[zi],maxZ=zs[zi+1];
    if(maxX-minX<=FOOTPRINT_EPS||maxZ-minZ<=FOOTPRINT_EPS)continue;
    const cx=(minX+maxX)/2,cz=(minZ+maxZ)/2;
    const inBase=bases.some(r=>cx>r.minX-FOOTPRINT_EPS&&cx<r.maxX+FOOTPRINT_EPS&&cz>r.minZ-FOOTPRINT_EPS&&cz<r.maxZ+FOOTPRINT_EPS);
    const blocked=blockers.some(r=>cx>r.minX-FOOTPRINT_EPS&&cx<r.maxX+FOOTPRINT_EPS&&cz>r.minZ-FOOTPRINT_EPS&&cz<r.maxZ+FOOTPRINT_EPS);
    if(inBase&&!blocked) cells.push({minX,maxX,minZ,maxZ});
  }
  return mergeRectCells(cells);
}

export function manualSurfaceRectanglesAtLevel(building, kind, topY, tolerance = 0.05) {
  const list=kind==='ceiling'?(building.manualCeilings||[]):(building.manualFloors||[]);
  const target=Number(topY)||0;
  return unionRectAreas(list.filter(r=>rectValid(r)&&Math.abs((Number(r.topY)||0)-target)<=tolerance)// Polygon roofs (flat/hip) override their exact outline.
  .map(r=>({minX:r.minX,maxX:r.maxX,minZ:r.minZ,maxZ:r.maxZ,...(r.polygon?{polygon:r.polygon}:{})})));
}

export function manualFloorRectanglesAtLevel(building, topY, tolerance = 0.05) {
  return manualSurfaceRectanglesAtLevel(building,'floor',topY,tolerance);
}

export function manualCeilingRectanglesAtLevel(building, topY, tolerance = 0.05) {
  return manualSurfaceRectanglesAtLevel(building,'ceiling',topY,tolerance);
}

export function exteriorFootprintRectangles(building) {
  if(exteriorFootprintIssue(building)!==null)return [];
  if(!hasClosedOrthogonalExteriorFootprint(building))return wallPolygonAreas(exteriorWallsOf(building));
  const walls=exteriorWallsOf(building);
  const xs=[...new Set(walls.flatMap(w=>[Number(w.a.x),Number(w.b.x)]))].sort((a,b)=>a-b);
  const zs=[...new Set(walls.flatMap(w=>[Number(w.a.z),Number(w.b.z)]))].sort((a,b)=>a-b);
  const cells=[];
  for(let xi=0;xi<xs.length-1;xi++)for(let zi=0;zi<zs.length-1;zi++){
    const minX=xs[xi],maxX=xs[xi+1],minZ=zs[zi],maxZ=zs[zi+1];
    if(maxX-minX<=FOOTPRINT_EPS||maxZ-minZ<=FOOTPRINT_EPS)continue;
    const center={x:(minX+maxX)/2,z:(minZ+maxZ)/2};
    if(pointInExteriorFootprint(building,center)) cells.push({minX,maxX,minZ,maxZ});
  }
  return mergeRectCells(cells);
}

export const REGION_KINDS = ['room','bay','wing','garage','porch','courtyard'];
export const REGION_EFFECTS = ['label','solid','void'];
export function makeRegion(a,b,label='Region',kind='room',effect='label') {
  return {...makeRectArea(a,b,label),id:uid('region'),kind,effect};
}
export function regionVoids(building) {
  return (building.regions||[]).filter(r=>r.effect==='void'&&rectValid(r)).flatMap(regionAreaCells);
}
export function structuralFloorRectangles(building) {
  return subtractRectAreas(baseFloorRectangles(building),regionVoids(building));
}

export function footprintInfo(building){
  const source=building.slabs?.some(rectValid)?'Floor footprints':building.regions?.some(r=>r.effect==='solid'&&rectValid(r))?'Solid regions':exteriorFootprintIssue(building)===null?'Closed wall outline':scopeWalls(building).length?'Rectangular fallback':'Empty';
  const rects=structuralFloorRectangles(building);
  return {source,area:rects.reduce((a,r)=>a+areaSize(r),0),rectangles:rects.length,reason:source==='Rectangular fallback'?exteriorFootprintIssue(building):null};
}
function baseFloorRectangles(building) {
  const slabs=(building.slabs||[]).filter(rectValid);
  if(slabs.length) return unionRectAreas(slabs);
  const solids=(building.regions||[]).filter(r=>r.effect==='solid'&&rectValid(r));
  if(solids.length) return unionRectAreas(solids.flatMap(regionAreaCells));
  const auto=exteriorFootprintRectangles(building);
  if(auto.length) return auto;
  const walls=scopeWalls(building);
  if(!walls.length) return [];
  const xs=[],zs=[];for(const w of walls){xs.push(w.a.x,w.b.x);zs.push(w.a.z,w.b.z);}
  return [{minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs)}];
}

export function automaticRoofRectangles(building) {
  const bases=[...structuralFloorRectangles(building)];
  for(const p of (building.platforms||[])) if(rectValid(p)&&p.covered!==false) bases.push({minX:p.minX,maxX:p.maxX,minZ:p.minZ,maxZ:p.maxZ});
  return subtractRectAreas(unionRectAreas(bases),regionVoids(building));
}


function roofSectionsFromRectangles(building, sourceRects=[]) {
  const coverage=unionRectAreas(sourceRects);
  const bases=(building.roof?.type==='hip'||building.roof?.type==='flat')&&coverage.some(r=>r.polygon)?mergeConvexAreas(coverage):coverage;
  const rects=bases.map((r,i)=>({
    ...r,
    type: building.roof?.type || 'gable',
    direction: (r.maxX-r.minX) >= (r.maxZ-r.minZ) ? 'x' : 'z',
    label: `Auto Roof ${i+1}`,
    suppressMin: false,
    suppressMax: false
  }));
  const ridgeLength=r=>r.direction==='x'?(r.maxX-r.minX):(r.maxZ-r.minZ);
  const roofSpan=r=>r.direction==='x'?(r.maxZ-r.minZ):(r.maxX-r.minX);
  const overlap=(a0,a1,b0,b1)=>Math.min(a1,b1)-Math.max(a0,b0)>FOOTPRINT_EPS;
  const centerX=r=>(r.minX+r.maxX)/2, centerZ=r=>(r.minZ+r.maxZ)/2;
  const globalPitch=Math.max(5,Math.min(70,Number(building.roof?.pitch)||35));
  const matchedPitch=(branch,host)=>{
    const hp=(Number(host.pitch)||globalPitch)*Math.PI/180;
    const hostRise=(roofSpan(host)/2)*Math.tan(hp);
    const half=Math.max(FOOTPRINT_EPS,roofSpan(branch)/2);
    return Math.max(5,Math.min(70,Math.atan2(hostRise,half)*180/Math.PI));
  };

  // Do not extend roof branches back over an authored courtyard cutout.
  if(regionVoids(building).length) return rects;

  // Cross-gable joins: when a shorter perpendicular roof branch terminates
  // against a longer roof, extend the branch to the host roof's ridge.
  for(let i=0;i<rects.length;i++)for(let j=0;j<rects.length;j++){
    if(i===j)continue;
    const a=rects[i], b=rects[j];
    if(a.type!=='gable'||b.type!=='gable'||a.direction===b.direction)continue;
    if(ridgeLength(a)>=ridgeLength(b)-FOOTPRINT_EPS)continue;

    if(a.direction==='z'){
      if(Math.abs(a.minZ-b.maxZ)<FOOTPRINT_EPS && overlap(a.minX,a.maxX,b.minX,b.maxX)){
        a.minZ=Math.min(a.minZ,centerZ(b)); a.suppressMin=true; a.pitch=matchedPitch(a,b);
      }else if(Math.abs(a.maxZ-b.minZ)<FOOTPRINT_EPS && overlap(a.minX,a.maxX,b.minX,b.maxX)){
        a.maxZ=Math.max(a.maxZ,centerZ(b)); a.suppressMax=true; a.pitch=matchedPitch(a,b);
      }
    }else{
      if(Math.abs(a.minX-b.maxX)<FOOTPRINT_EPS && overlap(a.minZ,a.maxZ,b.minZ,b.maxZ)){
        a.minX=Math.min(a.minX,centerX(b)); a.suppressMin=true; a.pitch=matchedPitch(a,b);
      }else if(Math.abs(a.maxX-b.minX)<FOOTPRINT_EPS && overlap(a.minZ,a.maxZ,b.minZ,b.maxZ)){
        a.maxX=Math.max(a.maxX,centerX(b)); a.suppressMax=true; a.pitch=matchedPitch(a,b);
      }
    }
  }
  return rects;
}

export function automaticRoofSections(building) {
  return roofSectionsFromRectangles(building, automaticRoofRectangles(building));
}

export function higherFloorBlockerRectangles(building, floorIndex) {
  const blockers=[];
  const floors=Array.isArray(building.floors)?building.floors:[];
  for(let i=floorIndex+1;i<floors.length;i++){
    const view=floorView(building,floors[i],i===floors.length-1);
    blockers.push(...structuralFloorRectangles(view));
    for(const p of view.platforms||[]) if(rectValid(p)) blockers.push({minX:p.minX,maxX:p.maxX,minZ:p.minZ,maxZ:p.maxZ});
  }
  const storyTop=floorElevation(building,floorIndex)+floorWallHeight(building,floorIndex);
  for(const r of building.manualFloors||[]){
    if(rectValid(r) && r.topY>storyTop+1e-5) blockers.push(r);
  }
  return unionRectAreas(blockers);
}

export function exposedStructuralFloorRectangles(building, floorIndex) {
  const floors=Array.isArray(building.floors)?building.floors:[];
  const floor=floors[floorIndex];
  if(!floor) return [];
  const view=floorView(building,floor,floorIndex===floors.length-1);
  return subtractRectAreas(structuralFloorRectangles(view),higherFloorBlockerRectangles(building,floorIndex));
}

export function exposedRoofRectangles(building, floorIndex) {
  const floors=Array.isArray(building.floors)?building.floors:[];
  const floor=floors[floorIndex];
  if(!floor) return [];
  const view=floorView(building,floor,true);
  return subtractRectAreas(automaticRoofRectangles(view),higherFloorBlockerRectangles(building,floorIndex));
}

function applyHigherBlockerRoofSuppressions(sections, blockers) {
  const overlap=(a0,a1,b0,b1)=>Math.min(a1,b1)-Math.max(a0,b0)>FOOTPRINT_EPS;
  for(const rs of sections){
    if((rs.type||'gable')!=='gable') continue;
    if((rs.direction||'x')==='x'){
      if(blockers.some(b=>Math.abs(rs.minX-b.maxX)<FOOTPRINT_EPS && overlap(rs.minZ,rs.maxZ,b.minZ,b.maxZ))) rs.suppressMin=true;
      if(blockers.some(b=>Math.abs(rs.maxX-b.minX)<FOOTPRINT_EPS && overlap(rs.minZ,rs.maxZ,b.minZ,b.maxZ))) rs.suppressMax=true;
    } else {
      if(blockers.some(b=>Math.abs(rs.minZ-b.maxZ)<FOOTPRINT_EPS && overlap(rs.minX,rs.maxX,b.minX,b.maxX))) rs.suppressMin=true;
      if(blockers.some(b=>Math.abs(rs.maxZ-b.minZ)<FOOTPRINT_EPS && overlap(rs.minX,rs.maxX,b.minX,b.maxX))) rs.suppressMax=true;
    }
  }
  return sections;
}

export function manualRoofRectanglesAtLevel(building, baseY, tolerance = 0.05) {
  const target=Number(baseY)||0;
  return unionRectAreas((building.roofSections||[]).filter(r=>rectValid(r)&&Math.abs((Number(r.baseY)||0)-target)<=tolerance).map(r=>({minX:r.minX,maxX:r.maxX,minZ:r.minZ,maxZ:r.maxZ})));
}

export function roofSectionsForFloor(building, floorIndex) {
  const floors=Array.isArray(building.floors)?building.floors:[];
  const floor=floors[floorIndex];
  if(!floor || building.roof?.type==='none') return [];
  const view=floorView(building,floor,true);
  const blockers=higherFloorBlockerRectangles(building,floorIndex);
  const baseY=floorElevation(building,floorIndex)+floorWallHeight(building,floorIndex);
  const manualOverrides=manualRoofRectanglesAtLevel(building,baseY,Math.max(.05,(Number(building.floorThickness)||.18)*.6));
  const exposed=subtractRectAreas(exposedRoofRectangles(building,floorIndex),manualOverrides);
  if(!exposed.length) return [];
  return applyHigherBlockerRoofSuppressions(roofSectionsFromRectangles(view,exposed), blockers);
}

export function boundsOfStructuralFloor(building) {
  const rects=structuralFloorRectangles(building);
  if(!rects.length)return {minX:-2,maxX:2,minZ:-2,maxZ:2,width:4,depth:4};
  const minX=Math.min(...rects.map(r=>r.minX)),maxX=Math.max(...rects.map(r=>r.maxX)),minZ=Math.min(...rects.map(r=>r.minZ)),maxZ=Math.max(...rects.map(r=>r.maxZ));
  return {minX,maxX,minZ,maxZ,width:maxX-minX,depth:maxZ-minZ};
}

export function boundsOfAutomaticRoof(building) {
  const rects=automaticRoofRectangles(building);
  if(!rects.length)return {minX:-2,maxX:2,minZ:-2,maxZ:2,width:4,depth:4};
  const minX=Math.min(...rects.map(r=>r.minX)),maxX=Math.max(...rects.map(r=>r.maxX)),minZ=Math.min(...rects.map(r=>r.minZ)),maxZ=Math.max(...rects.map(r=>r.maxZ));
  return {minX,maxX,minZ,maxZ,width:maxX-minX,depth:maxZ-minZ};
}

export function boundsOfBuilding(building) {
  const xs=[], zs=[];
  const walls=scopeWalls(building);
  for (const w of walls) { xs.push(w.a.x,w.b.x); zs.push(w.a.z,w.b.z); }
  for (const r of (building.regions||[])) if (r.effect==='solid'&&rectValid(r)) { xs.push(r.minX, r.maxX); zs.push(r.minZ, r.maxZ); }
  for (const r of (building.slabs||[])) if (rectValid(r)) { xs.push(r.minX, r.maxX); zs.push(r.minZ, r.maxZ); }
  for (const r of (building.platforms||[])) if (rectValid(r)) { xs.push(r.minX, r.maxX); zs.push(r.minZ, r.maxZ); }
  for (const r of (building.roofSections||[])) if (rectValid(r)) { xs.push(r.minX, r.maxX); zs.push(r.minZ, r.maxZ); }
  for (const r of (building.railings||[])) { xs.push(r.a.x, r.b.x); zs.push(r.a.z, r.b.z); }
  if (!xs.length || !zs.length) return {minX:-2,maxX:2,minZ:-2,maxZ:2,width:4,depth:4};
  const minX=Math.min(...xs), maxX=Math.max(...xs), minZ=Math.min(...zs), maxZ=Math.max(...zs);
  return {minX,maxX,minZ,maxZ,width:maxX-minX,depth:maxZ-minZ};
}

export function addRoom(building, a, b, role = 'exterior', height = null) {
  const x0=Math.min(a.x,b.x), x1=Math.max(a.x,b.x), z0=Math.min(a.z,b.z), z1=Math.max(a.z,b.z);
  if (x1-x0 < 0.2 || z1-z0 < 0.2) return [];
  const walls=[W(x0,z0,x1,z0,'',role,height),W(x1,z0,x1,z1,'',role,height),W(x1,z1,x0,z1,'',role,height),W(x0,z1,x0,z0,'',role,height)];
  scopeWalls(building).push(...walls);
  return walls;
}
