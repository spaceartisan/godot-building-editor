import { wallTypeFor, sampleWallType } from './wall-types.js';
import { openingShapeFor, shapedDoorLayout } from './opening-shapes.js';
import { profileWallState, profileWallSolids } from './wall-profile-geometry.js';
import { polygonSlabFaces } from './polygon-geometry.js';
import { areaPoints, unionPolygonAreas, subtractPolygonAreas } from './polygon-areas.js';
import { roofBoxParts, roofInteriorBlockers, roofAttachmentBlockers, trimRoofBox, trimmedGableEnds } from './roof-geometry.js';
import { automaticRoofRectangles, automaticRoofSections, boundsOfAutomaticRoof, boundsOfBuilding, boundsOfStructuralFloor, constrainedOpening, exposedStructuralFloorRectangles, floorElevation, floorView, findWall, manualCeilingRectanglesAtLevel, manualFloorRectanglesAtLevel, pointOnWall, rectValid, roofSectionsForFloor, stairFootprint, storyHeight, structuralFloorRectangles, subtractRectAreas, splitWallIntoSolidSegments, validateOpeningLayout, wallLength } from './model.js';
import { wallSolidPlanes, unionFaceWriter } from './wall-union.js';
import { stairOpeningFootprint } from './model.js';
import { assertValidBuilding } from './validation.js';
import { exportProfile, lightGroupFor } from './profiles.js';

const EPS = 1e-5;
const JOIN_EPS = 1e-4;
const T_JUNCTION_OVERLAP = 0.002;

const fmt = n => {
  if(!Number.isFinite(n))throw new Error('Cannot export a non-finite scene value');
  const v = Math.abs(n) < 1e-8 ? 0 : n;
  return Number(v.toFixed(5)).toString();
};
const v3 = (x,y,z) => `Vector3(${fmt(x)}, ${fmt(y)}, ${fmt(z)})`;
const packedV3 = points => `PackedVector3Array(${points.flatMap(p => [fmt(p.x), fmt(p.y), fmt(p.z)]).join(', ')})`;
const clean = s => (s || 'Building').replace(/[^A-Za-z0-9_ -]/g,'').trim() || 'Building';
const nodeClean = s => clean(s).replace(/\s+/g,'_');
export const fileBase = name => (name || 'building').replace(/[^A-Za-z0-9]+/g,'_').replace(/^_|_$/g,'').toLowerCase() || 'building';
const fileSlug = name => (name || 'door').replace(/[^A-Za-z0-9]+/g,'_').replace(/^_|_$/g,'').toLowerCase() || 'door';

export function isExteriorWall(building, wall) {
  if (wall.role === 'exterior') return true;
  if (wall.role === 'interior') return false;
  if (/\bexterior\b/i.test(wall.label || '')) return true;

  // Backwards compatibility for building JSON created before wall roles existed.
  // Walls lying directly on the old rectangular footprint bounds are treated as exterior.
  const b = boundsOfBuilding(building);
  const near = (a,bv) => Math.abs(a-bv) <= JOIN_EPS;
  return (
    (near(wall.a.x,b.minX) && near(wall.b.x,b.minX)) ||
    (near(wall.a.x,b.maxX) && near(wall.b.x,b.maxX)) ||
    (near(wall.a.z,b.minZ) && near(wall.b.z,b.minZ)) ||
    (near(wall.a.z,b.maxZ) && near(wall.b.z,b.maxZ))
  );
}

function endpointJoinOffset(building, wall, atStart) {
  const p = atStart ? wall.a : wall.b;
  const L = wallLength(wall);
  if (L < EPS) return 0;

  const sign = atStart ? 1 : -1;
  const dir = {
    x: ((wall.b.x - wall.a.x) / L) * sign,
    z: ((wall.b.z - wall.a.z) / L) * sign
  };

  let hasEndpointCorner = false;
  let teeTrim = null;

  for (const other of building.walls) {
    if (other === wall || other.id === wall.id) continue;
    const oL = wallLength(other);
    if (oL < EPS) continue;

    const tx = other.b.x - other.a.x;
    const tz = other.b.z - other.a.z;
    const t = Math.max(0, Math.min(1, ((p.x - other.a.x) * tx + (p.z - other.a.z) * tz) / (oL * oL)));
    const qx = other.a.x + tx * t;
    const qz = other.a.z + tz * t;
    if (Math.hypot(p.x - qx, p.z - qz) > JOIN_EPS) continue;

    const endpointTol = JOIN_EPS / Math.max(oL, EPS);
    if (t <= endpointTol || t >= 1 - endpointTol) {
      if(Math.abs(dir.x*tz-dir.z*tx)/oL>1e-4)hasEndpointCorner = true;
      continue;
    }

    const otx = tx / oL, otz = tz / oL;
    const onx = -otz, onz = otx;
    const crossing = Math.abs(dir.x * onx + dir.z * onz);
    if (crossing > 1e-4) {
      const hostHalfThickness = building.wallThickness / 2;
      const required = hostHalfThickness / crossing;
      const trim = Math.max(0, required - T_JUNCTION_OVERLAP);
      teeTrim = teeTrim == null ? trim : Math.max(teeTrim, trim);
    }
  }

  if (teeTrim != null) return 0; // union clipping resolves the receiving wall
  if (hasEndpointCorner) {
    const extension = building.wallThickness / 2;
    return atStart ? -extension : extension;
  }
  return 0;
}

function adjustedSegment(building, wall, seg) {
  const L = wallLength(wall);
  const startJoinOffset = endpointJoinOffset(building, wall, true);
  const endJoinOffset = endpointJoinOffset(building, wall, false);
  const s0 = seg.start + (seg.start <= EPS ? startJoinOffset : 0);
  const s1 = seg.end + (seg.end >= L - EPS ? endJoinOffset : 0);
  return { ...seg, start:s0, end:s1 };
}


function roundKey(v, step = 1e-4) {
  return Math.round(v / step) * step;
}

function canonicalAxis(dx, dz) {
  // Treat opposite directions as the same line orientation so we can merge
  // collision boxes even if walls were drawn in reverse.
  if (dx < -EPS || (Math.abs(dx) <= EPS && dz < -EPS)) return { x: -dx, z: -dz };
  return { x: dx, z: dz };
}

export function buildMergedWallCollisionBoxes(building) {
  const candidates = [];
  for (const wall of building.walls) {
    const L = wallLength(wall);
    if (L < EPS) continue;
    const dx = (wall.b.x - wall.a.x) / L;
    const dz = (wall.b.z - wall.a.z) / L;
    const axis = canonicalAxis(dx, dz);
    const normal = { x: -axis.z, z: axis.x };
    const exterior = isExteriorWall(building, wall);
    const segments = splitWallIntoSolidSegments(building, wall);
    const skirt=Math.max(0,Number(building.storyFloorSkirt ?? building.exteriorFloorSkirt)||0);
    if(skirt>EPS)segments.push({start:0,end:L,bottom:-skirt,top:0});
    for (const raw of segments) {
      const seg = adjustedSegment(building, wall, raw);
      const len = seg.end - seg.start;
      const h = seg.top - seg.bottom;
      if (len < EPS || h < EPS) continue;
      const mid = (seg.start + seg.end) / 2;
      const px = wall.a.x + dx * mid;
      const pz = wall.a.z + dz * mid;
      const py = (seg.bottom + seg.top) / 2;
      const s = px * axis.x + pz * axis.z;
      const d = px * normal.x + pz * normal.z;
      candidates.push({
        exterior,
        axis,
        normal,
        start: s - len / 2,
        end: s + len / 2,
        d,
        py,
        bottom: seg.bottom,
        top: seg.top,
        h,
        thickness: building.wallThickness
      });
    }
  }

  const groups = new Map();
  for (const c of candidates) {
    const key = [
      c.exterior ? 'E' : 'I',
      roundKey(c.axis.x),
      roundKey(c.axis.z),
      roundKey(c.d),
      roundKey(c.bottom),
      roundKey(c.top),
      roundKey(c.thickness)
    ].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }

  const merged = [];
  for (const list of groups.values()) {
    list.sort((a, b) => a.start - b.start);
    let cur = { ...list[0] };
    for (let i = 1; i < list.length; i++) {
      const next = list[i];
      if (next.start <= cur.end + JOIN_EPS) {
        cur.end = Math.max(cur.end, next.end);
      } else {
        merged.push(cur);
        cur = { ...next };
      }
    }
    merged.push(cur);
  }

  return merged.map((m, index) => {
    const len = m.end - m.start;
    const mid = (m.start + m.end) / 2;
    const px = m.axis.x * mid + m.normal.x * m.d;
    const pz = m.axis.z * mid + m.normal.z * m.d;
    const rotY = -Math.atan2(m.axis.z, m.axis.x);
    return {
      index,
      exterior: m.exterior,
      position: { x: px, y: m.py, z: pz },
      rotation: { x: 0, y: rotY, z: 0 },
      size: { x: len, y: m.h, z: m.thickness },
      bottom: m.bottom,
      top: m.top
    };
  });
}


function meshWriter() {
  const vertices=[];
  const normals=[];
  const uvs=[];
  const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
  const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
  const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
  const normalize=n=>{
    const l=Math.hypot(n.x,n.y,n.z)||1;
    return {x:n.x/l,y:n.y/l,z:n.z/l};
  };

  const face=(pts,faceUvs,desiredNormal)=>{
    if(!Array.isArray(pts) || pts.length<3) return;
    const suppliedUvs=Array.isArray(faceUvs)&&faceUvs.length===pts.length ? faceUvs : pts.map((_,i)=>({u:(i===1||i===2)?1:0,v:i>=2?1:0}));
    let p=pts.slice(), uv=suppliedUvs.slice();
    // Boolean clipping can introduce repeated or collinear boundary vertices.
    // Remove these before choosing winding or encoding flat normals.
    for(let i=p.length-1;i>=0&&p.length>=3;i--){
      const prev=p[(i+p.length-1)%p.length],next=p[(i+1)%p.length];
      const c=cross(sub(p[i],prev),sub(next,p[i]));
      if(Math.hypot(c.x,c.y,c.z)<1e-8){p.splice(i,1);uv.splice(i,1);}
    }
    if(p.length<3)return;
    let actual=normalize(cross(sub(p[1],p[0]),sub(p[2],p[0])));
    if(dot(actual,desiredNormal)<0){
      p=[p[0],...p.slice(1).reverse()];
      uv=[uv[0],...uv.slice(1).reverse()];
      actual={x:-actual.x,y:-actual.y,z:-actual.z};
    }

    // Godot uses clockwise front-face winding. The polygon above is ordered so
    // its mathematical cross product points along the outward normal, so flip
    // each emitted triangle while keeping the supplied outward normal.
    for(let i=1;i<p.length-1;i++){
      const tri=[0,i+1,i];
      const area=cross(sub(p[i],p[0]),sub(p[i+1],p[0]));
      if(Math.hypot(area.x,area.y,area.z)<1e-8)continue;
      for(const idx of tri){
        vertices.push({...p[idx]});
        normals.push({...actual});
        uvs.push({...uv[idx]});
      }
    }
  };
  return {vertices,normals,uvs,face};
}

function addLocalBoxToMesh(writer, size, center={x:0,y:0,z:0}) {
  const hx=size.x/2, hy=size.y/2, hz=size.z/2;
  if(hx<EPS || hy<EPS || hz<EPS) return;
  const x0=center.x-hx,x1=center.x+hx,y0=center.y-hy,y1=center.y+hy,z0=center.z-hz,z1=center.z+hz;
  const uv=(u,v)=>({u,v});
  writer.face([{x:x0,y:y0,z:z0},{x:x1,y:y0,z:z0},{x:x1,y:y1,z:z0},{x:x0,y:y1,z:z0}], [uv(x0,y0),uv(x1,y0),uv(x1,y1),uv(x0,y1)], {x:0,y:0,z:-1});
  writer.face([{x:x0,y:y0,z:z1},{x:x0,y:y1,z:z1},{x:x1,y:y1,z:z1},{x:x1,y:y0,z:z1}], [uv(x0,y0),uv(x0,y1),uv(x1,y1),uv(x1,y0)], {x:0,y:0,z:1});
  writer.face([{x:x0,y:y0,z:z0},{x:x0,y:y1,z:z0},{x:x0,y:y1,z:z1},{x:x0,y:y0,z:z1}], [uv(z0,y0),uv(z0,y1),uv(z1,y1),uv(z1,y0)], {x:-1,y:0,z:0});
  writer.face([{x:x1,y:y0,z:z0},{x:x1,y:y0,z:z1},{x:x1,y:y1,z:z1},{x:x1,y:y1,z:z0}], [uv(z0,y0),uv(z1,y0),uv(z1,y1),uv(z0,y1)], {x:1,y:0,z:0});
  writer.face([{x:x0,y:y1,z:z0},{x:x1,y:y1,z:z0},{x:x1,y:y1,z:z1},{x:x0,y:y1,z:z1}], [uv(x0,z0),uv(x1,z0),uv(x1,z1),uv(x0,z1)], {x:0,y:1,z:0});
  writer.face([{x:x0,y:y0,z:z0},{x:x0,y:y0,z:z1},{x:x1,y:y0,z:z1},{x:x1,y:y0,z:z0}], [uv(x0,z0),uv(x0,z1),uv(x1,z1),uv(x1,z0)], {x:0,y:-1,z:0});
}

function addLocalRotatedBoxToMesh(writer,size,center={x:0,y:0,z:0},rotationZ=0){
  const hx=size.x/2,hy=size.y/2,hz=size.z/2;
  if(hx<EPS||hy<EPS||hz<EPS)return;
  const c=Math.cos(rotationZ),s=Math.sin(rotationZ);
  const tx=p=>({x:center.x+p.x*c-p.y*s,y:center.y+p.x*s+p.y*c,z:center.z+p.z});
  const rn=n=>({x:n.x*c-n.y*s,y:n.x*s+n.y*c,z:n.z});
  const uv=(u,v)=>({u,v});
  const corners={
    nbl:{x:-hx,y:-hy,z:-hz},nbr:{x:hx,y:-hy,z:-hz},ntl:{x:-hx,y:hy,z:-hz},ntr:{x:hx,y:hy,z:-hz},
    fbl:{x:-hx,y:-hy,z:hz},fbr:{x:hx,y:-hy,z:hz},ftl:{x:-hx,y:hy,z:hz},ftr:{x:hx,y:hy,z:hz}
  };
  const face=(pts,n)=>writer.face(pts.map(tx),[uv(0,0),uv(1,0),uv(1,1),uv(0,1)],rn(n));
  face([corners.nbl,corners.nbr,corners.ntr,corners.ntl],{x:0,y:0,z:-1});
  face([corners.fbl,corners.ftl,corners.ftr,corners.fbr],{x:0,y:0,z:1});
  face([corners.nbl,corners.ntl,corners.ftl,corners.fbl],{x:-1,y:0,z:0});
  face([corners.nbr,corners.fbr,corners.ftr,corners.ntr],{x:1,y:0,z:0});
  face([corners.ntl,corners.ntr,corners.ftr,corners.ftl],{x:0,y:1,z:0});
  face([corners.nbl,corners.fbl,corners.fbr,corners.nbr],{x:0,y:-1,z:0});
}

function addLocalRotatedBoxXToMesh(writer,size,center={x:0,y:0,z:0},rotationX=0){
  const hx=size.x/2,hy=size.y/2,hz=size.z/2;
  if(hx<EPS||hy<EPS||hz<EPS)return;
  const c=Math.cos(rotationX),s=Math.sin(rotationX);
  const tx=p=>({x:center.x+p.x,y:center.y+p.y*c-p.z*s,z:center.z+p.y*s+p.z*c});
  const rn=n=>({x:n.x,y:n.y*c-n.z*s,z:n.y*s+n.z*c});
  const uv=(u,v)=>({u,v});
  const corners={
    nbl:{x:-hx,y:-hy,z:-hz},nbr:{x:hx,y:-hy,z:-hz},ntl:{x:-hx,y:hy,z:-hz},ntr:{x:hx,y:hy,z:-hz},
    fbl:{x:-hx,y:-hy,z:hz},fbr:{x:hx,y:-hy,z:hz},ftl:{x:-hx,y:hy,z:hz},ftr:{x:hx,y:hy,z:hz}
  };
  const face=(pts,n)=>writer.face(pts.map(tx),[uv(0,0),uv(1,0),uv(1,1),uv(0,1)],rn(n));
  face([corners.nbl,corners.nbr,corners.ntr,corners.ntl],{x:0,y:0,z:-1});
  face([corners.fbl,corners.ftl,corners.ftr,corners.fbr],{x:0,y:0,z:1});
  face([corners.nbl,corners.ntl,corners.ftl,corners.fbl],{x:-1,y:0,z:0});
  face([corners.nbr,corners.fbr,corners.ftr,corners.ntr],{x:1,y:0,z:0});
  face([corners.ntl,corners.ntr,corners.ftr,corners.ftl],{x:0,y:1,z:0});
  face([corners.nbl,corners.fbl,corners.fbr,corners.nbr],{x:0,y:-1,z:0});
}

function addUnderStairWedgeToMesh(writer,width,run,rise){
  const hw=width/2,hr=run/2;
  const lf={x:-hw,y:0,z:hr},rf={x:hw,y:0,z:hr};
  const lb={x:-hw,y:0,z:-hr},rb={x:hw,y:0,z:-hr};
  const lt={x:-hw,y:rise,z:-hr},rt={x:hw,y:rise,z:-hr};
  const uv=(u,v)=>({u,v});
  writer.face([lf,rf,rt,lt],[uv(-hw,0),uv(hw,0),uv(hw,run),uv(-hw,run)],{x:0,y:run,z:rise});
  writer.face([lf,lb,rb,rf],[uv(-hw,0),uv(-hw,run),uv(hw,run),uv(hw,0)],{x:0,y:-1,z:0});
  writer.face([lf,lt,lb],[uv(0,0),uv(run,rise),uv(run,0)],{x:-1,y:0,z:0});
  writer.face([rf,rb,rt],[uv(0,0),uv(run,0),uv(run,rise)],{x:1,y:0,z:0});
  writer.face([lb,lt,rt,rb],[uv(-hw,0),uv(-hw,rise),uv(hw,rise),uv(hw,0)],{x:0,y:0,z:-1});
}

export function buildWindowMeshData(building, opening) {
  if(!opening || opening.type!=='window') return null;
  const safe=constrainedOpening(building,opening);
  if(safe.windowStyle==='empty') return null;
  const cfg=building.windowMesh || {};
  const width=Math.max(.02,Number(safe.width)||1);
  const height=Math.max(.02,Number(safe.height)||1);
  const style=['plain','double_hung','four_pane'].includes(safe.windowStyle)?safe.windowStyle:'plain';
  const frameWidth=Math.min(Math.max(.02,Number(cfg.frameWidth)||.08), width*.45, height*.45);
  const frameDepth=Math.max(.02,Number(cfg.frameDepth)||Math.min(.12,building.wallThickness||.18));
  const glassThickness=Math.min(frameDepth*.75,Math.max(.005,Number(cfg.glassThickness)||.018));
  const innerWidth=Math.max(.02,width-frameWidth*2);
  const innerHeight=Math.max(.02,height-frameWidth*2);

  const frame=meshWriter();
  addLocalBoxToMesh(frame,{x:width,y:frameWidth,z:frameDepth},{x:0,y:(height-frameWidth)/2,z:0});
  addLocalBoxToMesh(frame,{x:width,y:frameWidth,z:frameDepth},{x:0,y:-(height-frameWidth)/2,z:0});
  addLocalBoxToMesh(frame,{x:frameWidth,y:innerHeight,z:frameDepth},{x:-(width-frameWidth)/2,y:0,z:0});
  addLocalBoxToMesh(frame,{x:frameWidth,y:innerHeight,z:frameDepth},{x:(width-frameWidth)/2,y:0,z:0});

  // Style-specific sash/muntin geometry. It stays on the frame surface so the
  // window remains a single frame ArrayMesh plus a single glass surface.
  const muntin=Math.max(.018,Math.min(frameWidth*.55,.045));
  if(style==='double_hung' || style==='four_pane'){
    addLocalBoxToMesh(frame,{x:innerWidth,y:muntin,z:frameDepth*.9},{x:0,y:0,z:0});
  }
  if(style==='four_pane'){
    addLocalBoxToMesh(frame,{x:muntin,y:innerHeight,z:frameDepth*.9},{x:0,y:0,z:0});
  }

  const glass=meshWriter();
  addLocalBoxToMesh(glass,{x:innerWidth,y:innerHeight,z:glassThickness},{x:0,y:0,z:0});
  return { frame, glass, style, width, height, frameWidth, frameDepth, glassThickness, innerWidth, innerHeight };
}


export function buildDoorMeshData(building, opening) {
  if(!opening || opening.type!=='door') return null;
  const safe=constrainedOpening(building,opening);
  if(safe.doorStyle==='empty') return null;
  if(openingShapeFor(building,safe)){
    const layout=shapedDoorLayout(building,safe);
    const extrude=(cells,depth)=>{const writer=meshWriter();for(const faces of Object.values(polygonSlabFaces(cells,depth,depth/2)))for(const f of faces)writer.face(f.points.map(p=>({x:p.x,y:p.z-safe.height/2,z:p.y})),f.uvs,{x:f.normal.x,y:f.normal.z,z:f.normal.y});return writer;};
    const xs=layout.inner.map(p=>p.x),ys=layout.inner.map(p=>p.z);
    return {...layout,custom:true,frame:extrude(layout.frameCells,layout.frameDepth),panel:extrude(layout.panelCells,layout.panelThickness),hardware:meshWriter(),width:safe.width,height:safe.height,style:safe.doorStyle||'room',innerWidth:Math.max(...xs)-Math.min(...xs),innerHeight:Math.max(...ys)-Math.min(...ys),panelCenterY:0};
  }
  const cfg=building.doorMesh || {};
  const width=Math.max(.02,Number(safe.width)||.9);
  const height=Math.max(.02,Number(safe.height)||2.1);
  const style=['exterior','room','closet'].includes(safe.doorStyle)?safe.doorStyle:'room';
  const styleFrameScale=style==='exterior'?1.15:style==='closet'?.78:.9;
  const stylePanelScale=style==='exterior'?1.18:style==='closet'?.72:1;
  const frameWidth=Math.min(Math.max(.03,(Number(cfg.frameWidth)||.09)*styleFrameScale),width*.28,height*.18);
  const frameDepth=Math.max(.03,(Number(cfg.frameDepth)||.14)*(style==='exterior'?1.08:style==='closet'?.82:.92));
  const panelThickness=Math.max(.02,(Number(cfg.panelThickness)||.045)*stylePanelScale);
  const detailDepth=Math.max(.005,Number(cfg.detailDepth)||.018);
  const innerWidth=Math.max(.08,width-frameWidth*2);
  const innerHeight=Math.max(.08,height-frameWidth);
  const panelCenterY=-frameWidth/2;

  const frame=meshWriter();
  addLocalBoxToMesh(frame,{x:width,y:frameWidth,z:frameDepth},{x:0,y:(height-frameWidth)/2,z:0});
  addLocalBoxToMesh(frame,{x:frameWidth,y:height-frameWidth,z:frameDepth},{x:-(width-frameWidth)/2,y:-frameWidth/2,z:0});
  addLocalBoxToMesh(frame,{x:frameWidth,y:height-frameWidth,z:frameDepth},{x:(width-frameWidth)/2,y:-frameWidth/2,z:0});

  const panel=meshWriter();
  const frontZ=panelThickness/2+detailDepth/2;
  const backZ=-frontZ;
  if(style==='closet'){
    const centerGap=Math.min(.025,innerWidth*.04);
    const leafWidth=Math.max(.03,(innerWidth-centerGap)/2);
    addLocalBoxToMesh(panel,{x:leafWidth,y:innerHeight,z:panelThickness},{x:-(leafWidth+centerGap)/2,y:panelCenterY,z:0});
    addLocalBoxToMesh(panel,{x:leafWidth,y:innerHeight,z:panelThickness},{x:(leafWidth+centerGap)/2,y:panelCenterY,z:0});
    const bandW=Math.max(.03,leafWidth*.78),bandH=Math.max(.018,Math.min(.035,innerHeight*.025));
    for(const sx of[-1,1]) for(let i=0;i<5;i++){
      const y=panelCenterY+innerHeight*.28-i*innerHeight*.075;
      addLocalBoxToMesh(panel,{x:bandW,y:bandH,z:detailDepth},{x:sx*(leafWidth+centerGap)/2,y,z:frontZ});
      addLocalBoxToMesh(panel,{x:bandW,y:bandH,z:detailDepth},{x:sx*(leafWidth+centerGap)/2,y,z:backZ});
    }
  }else{
    addLocalBoxToMesh(panel,{x:innerWidth,y:innerHeight,z:panelThickness},{x:0,y:panelCenterY,z:0});
    const panelW=innerWidth*(style==='exterior'?.34:.72);
    if(style==='exterior'){
      const panelH=Math.max(.06,innerHeight*.245);
      for(const x of[-innerWidth*.22,innerWidth*.22]){
        addLocalBoxToMesh(panel,{x:panelW,y:panelH,z:detailDepth},{x,y:panelCenterY+innerHeight*.22,z:frontZ});
        addLocalBoxToMesh(panel,{x:panelW,y:panelH,z:detailDepth},{x,y:panelCenterY+innerHeight*.22,z:backZ});
        addLocalBoxToMesh(panel,{x:panelW,y:panelH*1.12,z:detailDepth},{x,y:panelCenterY-innerHeight*.20,z:frontZ});
        addLocalBoxToMesh(panel,{x:panelW,y:panelH*1.12,z:detailDepth},{x,y:panelCenterY-innerHeight*.20,z:backZ});
      }
    }else{
      addLocalBoxToMesh(panel,{x:panelW,y:innerHeight*.24,z:detailDepth},{x:0,y:panelCenterY+innerHeight*.20,z:frontZ});
      addLocalBoxToMesh(panel,{x:panelW,y:innerHeight*.24,z:detailDepth},{x:0,y:panelCenterY+innerHeight*.20,z:backZ});
      addLocalBoxToMesh(panel,{x:panelW,y:innerHeight*.32,z:detailDepth},{x:0,y:panelCenterY-innerHeight*.22,z:frontZ});
      addLocalBoxToMesh(panel,{x:panelW,y:innerHeight*.32,z:detailDepth},{x:0,y:panelCenterY-innerHeight*.22,z:backZ});
    }
  }

  const hardware=meshWriter();
  if(style==='closet'){
    const handleX=Math.min(.08,innerWidth*.12),handleY=panelCenterY;
    const handleZ=panelThickness/2+.02;
    for(const z of [handleZ,-handleZ]){
      addLocalBoxToMesh(hardware,{x:.025,y:.18,z:.028},{x:-handleX,y:handleY,z});
      addLocalBoxToMesh(hardware,{x:.025,y:.18,z:.028},{x:handleX,y:handleY,z});
    }
  }else{
    const knobX=innerWidth/2-Math.min(.11,innerWidth*.14);
    const knobY=panelCenterY-Math.min(.08,innerHeight*.04);
    const k=style==='exterior'?.065:.055;
    const knobZ=panelThickness/2+k*.38;
    addLocalBoxToMesh(hardware,{x:k,y:k,z:k},{x:knobX,y:knobY,z:knobZ});
    addLocalBoxToMesh(hardware,{x:k,y:k,z:k},{x:knobX,y:knobY,z:-knobZ});
  }
  return { frame, panel, hardware, width, height, style, frameWidth, frameDepth, panelThickness, detailDepth, innerWidth, innerHeight, panelCenterY };
}


// Closet doors are exported as two independently hinged leaves. This helper
// rebuilds each half in hinge-local coordinates while retaining the same
// two-sided slat detailing and hardware used by the full-door preview mesh.
export function buildClosetDoorLeafMeshData(building, opening) {
  const base=buildDoorMeshData(building,opening);
  if(!base || base.style!=='closet') return null;
  const centerGap=Math.min(.025,base.innerWidth*.04);
  const leafWidth=Math.max(.03,(base.innerWidth-centerGap)/2);
  const makeLeaf=(side)=>{
    const panel=meshWriter();
    const hardware=meshWriter();
    addLocalBoxToMesh(panel,{x:leafWidth,y:base.innerHeight,z:base.panelThickness},{x:0,y:base.panelCenterY,z:0});

    const frontZ=base.panelThickness/2+base.detailDepth/2;
    const backZ=-frontZ;
    const bandW=Math.max(.03,leafWidth*.78);
    const bandH=Math.max(.018,Math.min(.035,base.innerHeight*.025));
    for(let i=0;i<5;i++){
      const y=base.panelCenterY+base.innerHeight*.28-i*base.innerHeight*.075;
      addLocalBoxToMesh(panel,{x:bandW,y:bandH,z:base.detailDepth},{x:0,y,z:frontZ});
      addLocalBoxToMesh(panel,{x:bandW,y:bandH,z:base.detailDepth},{x:0,y,z:backZ});
    }

    // Handle goes near the meeting edge: +X on the left leaf, -X on the right.
    const inset=Math.min(.08,leafWidth*.18);
    const handleX=side==='left' ? leafWidth/2-inset : -leafWidth/2+inset;
    const handleZ=base.panelThickness/2+.02;
    for(const z of [handleZ,-handleZ]){
      addLocalBoxToMesh(hardware,{x:.025,y:.18,z:.028},{x:handleX,y:base.panelCenterY,z});
    }
    return {panel,hardware};
  };
  return { ...base, centerGap, leafWidth, left:makeLeaf('left'), right:makeLeaf('right') };
}

function hasEndpointWallJoin(building, wall, atStart) {
  // Treat both endpoint-to-endpoint corners and T-junctions as joined. Visual
  // end caps at either kind of join can become a thin visible strip or z-fight
  // against the receiving wall, so the unified meshes omit them.
  const p=atStart?wall.a:wall.b;
  for(const other of building.walls){
    if(other===wall || other.id===wall.id) continue;
    const oL=wallLength(other);
    if(oL<EPS) continue;
    const tx=other.b.x-other.a.x, tz=other.b.z-other.a.z;
    const t=Math.max(0,Math.min(1,((p.x-other.a.x)*tx+(p.z-other.a.z)*tz)/(oL*oL)));
    const qx=other.a.x+tx*t, qz=other.a.z+tz*t;
    if(Math.hypot(p.x-qx,p.z-qz)<=JOIN_EPS) return true;
  }
  return false;
}

// Exterior walls that lie on closed endpoint-connected loops. Open chains
// (parapets ending against a tower, free-standing screens) would otherwise add
// stray crossings to the even/odd test and flip the outside side of unrelated
// walls. Floors without any closed loop keep every exterior wall, as before.
const loopWallCache=new WeakMap();
function exteriorLoopWalls(building){
  const cached=loopWallCache.get(building);
  if(cached&&cached.walls===building.walls)return cached.result;
  const exterior=building.walls.filter(w=>isExteriorWall(building,w)&&wallLength(w)>EPS);
  const key=p=>`${Math.round(p.x/JOIN_EPS)},${Math.round(p.z/JOIN_EPS)}`;
  const degree=new Map(),alive=new Set(exterior);
  for(const w of exterior)for(const p of [w.a,w.b])degree.set(key(p),(degree.get(key(p))||0)+1);
  for(let changed=true;changed;){
    changed=false;
    for(const w of alive)if(degree.get(key(w.a))<2||degree.get(key(w.b))<2){
      alive.delete(w);for(const p of [w.a,w.b])degree.set(key(p),degree.get(key(p))-1);changed=true;
    }
  }
  const result=alive.size?[...alive]:exterior;
  loopWallCache.set(building,{walls:building.walls,result});
  return result;
}

export function pointInExteriorFootprint(building, point) {
  // Even/odd ray casting works directly on the unordered exterior wall set,
  // so concave L/U-shaped footprints do not require a pre-sorted polygon loop.
  let inside=false;
  for(const edge of exteriorLoopWalls(building)){
    const a=edge.a,b=edge.b;
    if(Math.abs(a.z-b.z)<EPS) continue;
    const crosses=(a.z>point.z)!==(b.z>point.z);
    if(!crosses) continue;
    const x=a.x+(point.z-a.z)*(b.x-a.x)/(b.z-a.z);
    if(x>point.x) inside=!inside;
  }
  return inside;
}

export function exteriorWallOutsideSign(building, wall) {
  const L=wallLength(wall);
  if(L<EPS) return 1;
  const d={x:(wall.b.x-wall.a.x)/L,z:(wall.b.z-wall.a.z)/L};
  const n={x:-d.z,z:d.x};
  const mid={x:(wall.a.x+wall.b.x)/2,z:(wall.a.z+wall.b.z)/2};
  const probe=Math.max((Number(building.wallThickness)||.18)*.8,.05);
  const plus={x:mid.x+n.x*probe,z:mid.z+n.z*probe};
  const minus={x:mid.x-n.x*probe,z:mid.z-n.z*probe};
  const plusInside=pointInExteriorFootprint(building,plus);
  const minusInside=pointInExteriorFootprint(building,minus);

  // The side outside the closed exterior footprint is the siding face.
  if(plusInside!==minusInside) return plusInside ? -1 : 1;

  // Degenerate/open exterior wall sets cannot be classified by containment.
  // Keep the old bounds/centroid fallback so partially constructed buildings
  // still preview/export sensibly until their shell is closed.
  const b=boundsOfBuilding(building);
  const near=(a,v)=>Math.abs(a-v)<=JOIN_EPS;
  let outward=null;
  if(near(wall.a.x,b.minX)&&near(wall.b.x,b.minX)) outward={x:-1,z:0};
  else if(near(wall.a.x,b.maxX)&&near(wall.b.x,b.maxX)) outward={x:1,z:0};
  else if(near(wall.a.z,b.minZ)&&near(wall.b.z,b.minZ)) outward={x:0,z:-1};
  else if(near(wall.a.z,b.maxZ)&&near(wall.b.z,b.maxZ)) outward={x:0,z:1};
  if(!outward){
    const center={x:(b.minX+b.maxX)/2,z:(b.minZ+b.maxZ)/2};
    outward={x:mid.x-center.x,z:mid.z-center.z};
    const ol=Math.hypot(outward.x,outward.z)||1;
    outward.x/=ol; outward.z/=ol;
  }
  return (n.x*outward.x+n.z*outward.z)>=0 ? 1 : -1;
}

function addExteriorWallBoxToMeshes(outsideWriter, insideWriter, edgeWriter, building, wall, seg) {
  const L=wallLength(wall);
  if(L<EPS) return;
  const d={x:(wall.b.x-wall.a.x)/L,z:(wall.b.z-wall.a.z)/L};
  const n={x:-d.z,z:d.x};
  const ht=building.wallThickness/2;
  const s0=seg.start,s1=seg.end,y0=seg.bottom,y1=seg.top;
  if(s1-s0<EPS || y1-y0<EPS) return;
  const centerAt=s=>({x:wall.a.x+d.x*s,z:wall.a.z+d.z*s});
  const a=centerAt(s0), b=centerAt(s1);
  const p=(c,side,y)=>({x:c.x+n.x*ht*side,y,z:c.z+n.z*ht*side});
  const a0m=p(a,-1,y0), b0m=p(b,-1,y0), a1m=p(a,-1,y1), b1m=p(b,-1,y1);
  const a0p=p(a, 1,y0), b0p=p(b, 1,y0), a1p=p(a, 1,y1), b1p=p(b, 1,y1);
  const minusFace=[a0m,b0m,b1m,a1m];
  const minusUv=[{u:s0,v:y0},{u:s1,v:y0},{u:s1,v:y1},{u:s0,v:y1}];
  const plusFace=[a0p,a1p,b1p,b0p];
  const plusUv=[{u:s0,v:y0},{u:s0,v:y1},{u:s1,v:y1},{u:s1,v:y0}];
  const outsideSign=exteriorWallOutsideSign(building,wall);

  if(outsideSign<0){
    outsideWriter.face(minusFace,minusUv,{x:-n.x,y:0,z:-n.z},'side');
    insideWriter.face(plusFace,plusUv,{x:n.x,y:0,z:n.z},'side');
  }else{
    outsideWriter.face(plusFace,plusUv,{x:n.x,y:0,z:n.z},'side');
    insideWriter.face(minusFace,minusUv,{x:-n.x,y:0,z:-n.z},'side');
  }

  // Horizontal thickness faces and opening reveals/jambs deliberately live in
  // their own mesh. Assigning siding to OutsideFaces or plaster to InsideFaces
  // therefore cannot repaint the wall thickness around windows and doors.
  edgeWriter.face([a1m,b1m,b1p,a1p],[{u:s0,v:-ht},{u:s1,v:-ht},{u:s1,v:ht},{u:s0,v:ht}],{x:0,y:1,z:0},'cap');
  edgeWriter.face([a0m,a0p,b0p,b0m],[{u:s0,v:-ht},{u:s0,v:ht},{u:s1,v:ht},{u:s1,v:-ht}],{x:0,y:-1,z:0},'cap');

  const startsAtEndpoint=seg.start<=EPS || seg.start<0;
  const endsAtEndpoint=seg.end>=L-EPS || seg.end>L;
  {
    edgeWriter.face([a0m,a1m,a1p,a0p],[{u:-ht,v:y0},{u:-ht,v:y1},{u:ht,v:y1},{u:ht,v:y0}],{x:-d.x,y:0,z:-d.z},'end');
  }
  {
    edgeWriter.face([b0m,b0p,b1p,b1m],[{u:-ht,v:y0},{u:ht,v:y0},{u:ht,v:y1},{u:-ht,v:y1}],{x:d.x,y:0,z:d.z},'end');
  }
}

function addExteriorStorySkirt(outsideWriter, insideWriter, building, wall, depth) {
  const skirt=Math.max(0,Number(depth)||0);
  const L=wallLength(wall);
  if(skirt<=EPS||L<EPS)return;
  const d={x:(wall.b.x-wall.a.x)/L,z:(wall.b.z-wall.a.z)/L};
  const n={x:-d.z,z:d.x};
  const ht=building.wallThickness/2;
  // Match the normal wall corner/T-junction extension rules so the cover meets
  // cleanly at exterior corners without changing the actual wall collision.
  const s0=endpointJoinOffset(building,wall,true);
  const s1=L+endpointJoinOffset(building,wall,false);
  if(s1-s0<EPS)return;
  const centerAt=s=>({x:wall.a.x+d.x*s,z:wall.a.z+d.z*s});
  const a=centerAt(s0),b=centerAt(s1);
  const outsideSide=exteriorWallOutsideSign(building,wall);
  const y0=-skirt,y1=0;
  const uv=[{u:s0,v:y0},{u:s1,v:y0},{u:s1,v:y1},{u:s0,v:y1}];

  const faceAtSide=side=>{
    const point=(c,y)=>({x:c.x+n.x*ht*side,y,z:c.z+n.z*ht*side});
    return [point(a,y0),point(b,y0),point(b,y1),point(a,y1)];
  };

  // The slab-thickness band is part of the exterior shell visually, so cover
  // it on BOTH sides of an exterior wall. Previously only OutsideFaces got the
  // skirt, which made the facade correct but left a 1-floorThickness horizontal
  // hole when viewing the same exterior wall from indoors.
  outsideWriter.face(
    faceAtSide(outsideSide),uv,
    {x:n.x*outsideSide,y:0,z:n.z*outsideSide},'side'
  );
  insideWriter.face(
    faceAtSide(-outsideSide),uv,
    {x:-n.x*outsideSide,y:0,z:-n.z*outsideSide},'side'
  );
}

function addInteriorStorySkirt(sideAWriter, sideBWriter, building, wall, depth) {
  const skirt=Math.max(0,Number(depth)||0);
  const L=wallLength(wall);
  if(skirt<=EPS||L<EPS)return;
  const d={x:(wall.b.x-wall.a.x)/L,z:(wall.b.z-wall.a.z)/L};
  const n={x:-d.z,z:d.x};
  const ht=building.wallThickness/2;
  // Use the same endpoint extension/trim rules as the wall above so the seam
  // filler does not introduce little gaps at corners or T-junctions.
  const s0=endpointJoinOffset(building,wall,true);
  const s1=L+endpointJoinOffset(building,wall,false);
  if(s1-s0<EPS)return;
  const centerAt=s=>({x:wall.a.x+d.x*s,z:wall.a.z+d.z*s});
  const a=centerAt(s0),b=centerAt(s1),y0=-skirt,y1=0;
  const p=(c,side,y)=>({x:c.x+n.x*ht*side,y,z:c.z+n.z*ht*side});
  const a0m=p(a,-1,y0),b0m=p(b,-1,y0),a1m=p(a,-1,y1),b1m=p(b,-1,y1);
  const a0p=p(a,1,y0),b0p=p(b,1,y0),a1p=p(a,1,y1),b1p=p(b,1,y1);
  sideAWriter.face([a0m,b0m,b1m,a1m],[{u:s0,v:y0},{u:s1,v:y0},{u:s1,v:y1},{u:s0,v:y1}],{x:-n.x,y:0,z:-n.z},'side');
  sideBWriter.face([a0p,a1p,b1p,b0p],[{u:s0,v:y0},{u:s0,v:y1},{u:s1,v:y1},{u:s1,v:y0}],{x:n.x,y:0,z:n.z},'side');
}

function addStorySkirtToUnifiedWallMesh(writer, building, wall, depth) {
  const skirt=Math.max(0,Number(depth)||0);
  const L=wallLength(wall);
  if(skirt<=EPS||L<EPS)return;
  const d={x:(wall.b.x-wall.a.x)/L,z:(wall.b.z-wall.a.z)/L};
  const n={x:-d.z,z:d.x},ht=building.wallThickness/2;
  const s0=endpointJoinOffset(building,wall,true),s1=L+endpointJoinOffset(building,wall,false);
  if(s1-s0<EPS)return;
  const centerAt=s=>({x:wall.a.x+d.x*s,z:wall.a.z+d.z*s});
  const a=centerAt(s0),b=centerAt(s1),y0=-skirt,y1=0,p=(c,side,y)=>({x:c.x+n.x*ht*side,y,z:c.z+n.z*ht*side});
  const a0m=p(a,-1,y0),b0m=p(b,-1,y0),a1m=p(a,-1,y1),b1m=p(b,-1,y1),a0p=p(a,1,y0),b0p=p(b,1,y0),a1p=p(a,1,y1),b1p=p(b,1,y1);
  writer.face([a0m,b0m,b1m,a1m],[{u:s0,v:y0},{u:s1,v:y0},{u:s1,v:y1},{u:s0,v:y1}],{x:-n.x,y:0,z:-n.z});
  writer.face([a0p,a1p,b1p,b0p],[{u:s0,v:y0},{u:s0,v:y1},{u:s1,v:y1},{u:s1,v:y0}],{x:n.x,y:0,z:n.z});
}

function addWallBoxToMesh(writer, building, wall, seg) {
  const L=wallLength(wall);
  if(L<EPS) return;
  const d={x:(wall.b.x-wall.a.x)/L,z:(wall.b.z-wall.a.z)/L};
  const n={x:-d.z,z:d.x};
  const ht=building.wallThickness/2;
  const s0=seg.start,s1=seg.end,y0=seg.bottom,y1=seg.top;
  if(s1-s0<EPS || y1-y0<EPS) return;
  const centerAt=s=>({x:wall.a.x+d.x*s,z:wall.a.z+d.z*s});
  const a=centerAt(s0), b=centerAt(s1);
  const p=(c,side,y)=>({x:c.x+n.x*ht*side,y,z:c.z+n.z*ht*side});
  const a0m=p(a,-1,y0), b0m=p(b,-1,y0), a1m=p(a,-1,y1), b1m=p(b,-1,y1);
  const a0p=p(a, 1,y0), b0p=p(b, 1,y0), a1p=p(a, 1,y1), b1p=p(b, 1,y1);

  // Pieces above/below/beside an opening use the same wall-distance/height UV
  // frame, so a single wall texture does not restart at every generated piece.
  writer.face([a0m,b0m,b1m,a1m],[{u:s0,v:y0},{u:s1,v:y0},{u:s1,v:y1},{u:s0,v:y1}],{x:-n.x,y:0,z:-n.z});
  writer.face([a0p,a1p,b1p,b0p],[{u:s0,v:y0},{u:s0,v:y1},{u:s1,v:y1},{u:s1,v:y0}],{x:n.x,y:0,z:n.z});
  writer.face([a1m,b1m,b1p,a1p],[{u:s0,v:-ht},{u:s1,v:-ht},{u:s1,v:ht},{u:s0,v:ht}],{x:0,y:1,z:0});
  writer.face([a0m,a0p,b0p,b0m],[{u:s0,v:-ht},{u:s0,v:ht},{u:s1,v:ht},{u:s1,v:-ht}],{x:0,y:-1,z:0});

  // Wall-end caps are useful at a window/door jamb or a genuinely free wall
  // end. At an exterior corner they create the narrow material strip the user
  // was seeing, so omit them and let the two long wall faces meet directly.
  const startsAtEndpoint=seg.start<=EPS || seg.start<0;
  const endsAtEndpoint=seg.end>=L-EPS || seg.end>L;
  {
    writer.face([a0m,a1m,a1p,a0p],[{u:-ht,v:y0},{u:-ht,v:y1},{u:ht,v:y1},{u:ht,v:y0}],{x:-d.x,y:0,z:-d.z});
  }
  {
    writer.face([b0m,b0p,b1p,b1m],[{u:-ht,v:y0},{u:ht,v:y0},{u:ht,v:y1},{u:-ht,v:y1}],{x:d.x,y:0,z:d.z});
  }
}

function addGablePrismToMesh(writer, orient, fixedCoord, spanMin, spanMax, center, wallY, ridgeY, thickness) {
  const ht=thickness/2;
  if (orient === 'x') {
    for (const side of [-1,1]) {
      const x=fixedCoord+side*ht;
      writer.face([
        {x,y:wallY,z:spanMin},{x,y:wallY,z:spanMax},{x,y:ridgeY,z:center}
      ],[
        {u:spanMin,v:wallY},{u:spanMax,v:wallY},{u:center,v:ridgeY}
      ],{x:side,y:0,z:0});
    }
    const xm=fixedCoord-ht,xp=fixedCoord+ht;
    writer.face([{x:xm,y:wallY,z:spanMin},{x:xp,y:wallY,z:spanMin},{x:xp,y:ridgeY,z:center},{x:xm,y:ridgeY,z:center}],
      [{u:-ht,v:wallY},{u:ht,v:wallY},{u:ht,v:ridgeY},{u:-ht,v:ridgeY}],{x:0,y:0,z:-1});
    writer.face([{x:xm,y:wallY,z:spanMax},{x:xm,y:ridgeY,z:center},{x:xp,y:ridgeY,z:center},{x:xp,y:wallY,z:spanMax}],
      [{u:-ht,v:wallY},{u:-ht,v:ridgeY},{u:ht,v:ridgeY},{u:ht,v:wallY}],{x:0,y:0,z:1});
    writer.face([{x:xm,y:wallY,z:spanMin},{x:xm,y:wallY,z:spanMax},{x:xp,y:wallY,z:spanMax},{x:xp,y:wallY,z:spanMin}],
      [{u:spanMin,v:-ht},{u:spanMax,v:-ht},{u:spanMax,v:ht},{u:spanMin,v:ht}],{x:0,y:-1,z:0});
  } else {
    for (const side of [-1,1]) {
      const z=fixedCoord+side*ht;
      writer.face([
        {x:spanMin,y:wallY,z},{x:spanMax,y:wallY,z},{x:center,y:ridgeY,z}
      ],[
        {u:spanMin,v:wallY},{u:spanMax,v:wallY},{u:center,v:ridgeY}
      ],{x:0,y:0,z:side});
    }
    const zm=fixedCoord-ht,zp=fixedCoord+ht;
    writer.face([{x:spanMin,y:wallY,z:zm},{x:center,y:ridgeY,z:zm},{x:center,y:ridgeY,z:zp},{x:spanMin,y:wallY,z:zp}],
      [{u:-ht,v:wallY},{u:-ht,v:ridgeY},{u:ht,v:ridgeY},{u:ht,v:wallY}],{x:-1,y:0.5,z:0});
    writer.face([{x:spanMax,y:wallY,z:zm},{x:spanMax,y:wallY,z:zp},{x:center,y:ridgeY,z:zp},{x:center,y:ridgeY,z:zm}],
      [{u:-ht,v:wallY},{u:ht,v:wallY},{u:ht,v:ridgeY},{u:-ht,v:ridgeY}],{x:1,y:0.5,z:0});
    writer.face([{x:spanMin,y:wallY,z:zm},{x:spanMin,y:wallY,z:zp},{x:spanMax,y:wallY,z:zp},{x:spanMax,y:wallY,z:zm}],
      [{u:spanMin,v:-ht},{u:spanMin,v:ht},{u:spanMax,v:ht},{u:spanMax,v:-ht}],{x:0,y:-1,z:0});
  }
}

function addGablePrismToSplitMeshes(outsideWriter, insideWriter, edgeWriter, orient, fixedCoord, spanMin, spanMax, center, wallY, ridgeY, thickness, outsideSide) {
  const ht=thickness/2;
  if (orient === 'x') {
    const faces={};
    for (const side of [-1,1]) {
      const x=fixedCoord+side*ht;
      faces[side]=[
        {x,y:wallY,z:spanMin},{x,y:wallY,z:spanMax},{x,y:ridgeY,z:center}
      ];
    }
    const uv=[{u:spanMin,v:wallY},{u:spanMax,v:wallY},{u:center,v:ridgeY}];
    outsideWriter.face(faces[outsideSide],uv,{x:outsideSide,y:0,z:0});
    insideWriter.face(faces[-outsideSide],uv,{x:-outsideSide,y:0,z:0});

    const xm=fixedCoord-ht,xp=fixedCoord+ht;
    edgeWriter.face([{x:xm,y:wallY,z:spanMin},{x:xp,y:wallY,z:spanMin},{x:xp,y:ridgeY,z:center},{x:xm,y:ridgeY,z:center}],
      [{u:-ht,v:wallY},{u:ht,v:wallY},{u:ht,v:ridgeY},{u:-ht,v:ridgeY}],{x:0,y:0,z:-1});
    edgeWriter.face([{x:xm,y:wallY,z:spanMax},{x:xm,y:ridgeY,z:center},{x:xp,y:ridgeY,z:center},{x:xp,y:wallY,z:spanMax}],
      [{u:-ht,v:wallY},{u:-ht,v:ridgeY},{u:ht,v:ridgeY},{u:ht,v:wallY}],{x:0,y:0,z:1});
    edgeWriter.face([{x:xm,y:wallY,z:spanMin},{x:xm,y:wallY,z:spanMax},{x:xp,y:wallY,z:spanMax},{x:xp,y:wallY,z:spanMin}],
      [{u:spanMin,v:-ht},{u:spanMax,v:-ht},{u:spanMax,v:ht},{u:spanMin,v:ht}],{x:0,y:-1,z:0});
  } else {
    const faces={};
    for (const side of [-1,1]) {
      const z=fixedCoord+side*ht;
      faces[side]=[
        {x:spanMin,y:wallY,z},{x:spanMax,y:wallY,z},{x:center,y:ridgeY,z}
      ];
    }
    const uv=[{u:spanMin,v:wallY},{u:spanMax,v:wallY},{u:center,v:ridgeY}];
    outsideWriter.face(faces[outsideSide],uv,{x:0,y:0,z:outsideSide});
    insideWriter.face(faces[-outsideSide],uv,{x:0,y:0,z:-outsideSide});

    const zm=fixedCoord-ht,zp=fixedCoord+ht;
    edgeWriter.face([{x:spanMin,y:wallY,z:zm},{x:center,y:ridgeY,z:zm},{x:center,y:ridgeY,z:zp},{x:spanMin,y:wallY,z:zp}],
      [{u:-ht,v:wallY},{u:-ht,v:ridgeY},{u:ht,v:ridgeY},{u:ht,v:wallY}],{x:-1,y:0.5,z:0});
    edgeWriter.face([{x:spanMax,y:wallY,z:zm},{x:spanMax,y:wallY,z:zp},{x:center,y:ridgeY,z:zp},{x:center,y:ridgeY,z:zm}],
      [{u:-ht,v:wallY},{u:ht,v:wallY},{u:ht,v:ridgeY},{u:-ht,v:ridgeY}],{x:1,y:0.5,z:0});
    edgeWriter.face([{x:spanMin,y:wallY,z:zm},{x:spanMin,y:wallY,z:zp},{x:spanMax,y:wallY,z:zp},{x:spanMax,y:wallY,z:zm}],
      [{u:spanMin,v:-ht},{u:spanMin,v:ht},{u:spanMax,v:ht},{u:spanMax,v:-ht}],{x:0,y:-1,z:0});
  }
}

// Nonrectangular openings share the solid/union path with shaped walls.
export const hasProfileWalls=building=>building.walls.some(w=>!!wallTypeFor(building,w))||(building.openings||[]).some(o=>!!openingShapeFor(building,o));
export function openingAnchor(building,opening){
  const wall=findWall(building,opening.wallId),p=pointOnWall(wall,opening.t);if(!wallTypeFor(building,wall))return p;
  const state=profileWallState(building,wall,exteriorWallOutsideSign,isExteriorWall),y=(opening.type==='window'?(opening.sill||0):0)+opening.height/2;
  const shape=sampleWallType(state.type,y/state.height,building.wallThickness);
  return {x:p.x+state.n.x*shape.offset,z:p.z+state.n.z*shape.offset};
}
export function buildProfileMeshData(building){
  const meshes=Object.fromEntries(['outside','inside','exteriorEdges','sideA','sideB','interiorEdges'].map(k=>[k,meshWriter()]));
  const solids=profileWallSolids(building,exteriorWallOutsideSign,isExteriorWall);
  for(const solid of solids){
    const wall=building.walls[solid.wallIndex],length=wallLength(wall),raw={x:-(wall.b.z-wall.a.z)/length,z:(wall.b.x-wall.a.x)/length},sign=exteriorWallOutsideSign(building,wall);
    for(const face of solid.faces){
      let key=solid.exterior?'exteriorEdges':'interiorEdges';
      if(face.tag!=='edge')key=solid.exterior?((face.normal.x*raw.x+face.normal.z*raw.z)*sign>0?'outside':'inside'):(face.normal.x*raw.x+face.normal.z*raw.z<0?'sideA':'sideB');
      unionFaceWriter(meshes[key],solid.ownerIndex,solids).face(face.points,face.uvs,face.normal);
    }
  }
  return meshes;
}

function wallUnionSolids(building) {
  return building.walls.flatMap((wall,ownerIndex)=>{
    const segments=splitWallIntoSolidSegments(building,wall);
    const skirt=Number(building.storyFloorSkirt ?? building.exteriorFloorSkirt)||0;
    if(skirt>EPS)segments.push({start:0,end:wallLength(wall),bottom:-skirt,top:0});
    return segments.map(raw=>({ownerIndex,planes:wallSolidPlanes(wall,adjustedSegment(building,wall,raw),building.wallThickness)}));
  });
}

export function buildTrimmedGableMeshData(parts){
  const meshes={outside:meshWriter(),inside:meshWriter(),edges:meshWriter()};
  for(const part of parts)for(const face of part.faces){
    const isSide=offset=>face.points.every(p=>Math.abs(p[part.axis]-(part.at+offset*part.thickness/2))<1e-6);
    const key=isSide(part.side)?'outside':isSide(-part.side)?'inside':'edges';meshes[key].face(face.points,face.uvs,face.normal);
  }
  return meshes;
}
export function buildExteriorMeshData(building) {
  const profiled=hasProfileWalls(building)?buildProfileMeshData(building):null;
  const outside=profiled?.outside||meshWriter();
  const inside=profiled?.inside||meshWriter();
  const edges=profiled?.exteriorEdges||meshWriter();
  const exteriorWalls=building.walls.filter(w=>isExteriorWall(building,w));
  const storySkirt=Math.max(0,Number(building.storyFloorSkirt ?? building.exteriorFloorSkirt)||0);
  const solids=profiled?[]:wallUnionSolids(building);
  for(const wall of profiled?[]:exteriorWalls) {
    const clipped=[outside,inside,edges].map(w=>unionFaceWriter(w,building.walls.indexOf(wall),solids));
    for(const raw of splitWallIntoSolidSegments(building,wall)) {
      const seg=adjustedSegment(building,wall,raw);
      addExteriorWallBoxToMeshes(...clipped,building,wall,seg);
    }
    if(storySkirt>EPS) addExteriorStorySkirt(clipped[0],clipped[1],building,wall,storySkirt);
  }

  if(exteriorWalls.length && building.roof?.type !== 'none') {
    const explicit=(building.roofSections||[]).filter(rectValid);
    const sections=explicit.length?explicit:automaticRoofSections(building);
    for(const rs of sections){
      if((rs.type||building.roof.type)!=='gable') continue;
      const pitch=(Number(rs.pitch)||building.roof.pitch||35)*Math.PI/180;
      const w=rs.maxX-rs.minX,d=rs.maxZ-rs.minZ;
      if(w<=.05||d<=.05) continue;
      const dir=rs.direction|| (w>=d?'x':'z');
      const origin=building._roofOrigin||0,source=building._roofSource||building;
      const clipped=trimmedGableEnds({...rs,direction:dir,pitch:Number(rs.pitch)||building.roof.pitch||35},building.wallHeight,building.wallThickness,roofInteriorBlockers(source,rs,origin+building.wallHeight,origin));
      if(clipped){const m=buildTrimmedGableMeshData(clipped);for(const [target,data] of [[outside,m.outside],[inside,m.inside],[edges,m.edges]]){target.vertices.push(...data.vertices);target.normals.push(...data.normals);target.uvs.push(...data.uvs);}continue;}

      if(dir==='x'){
        const ridgeRise=(d/2)*Math.tan(pitch),ridgeY=building.wallHeight+ridgeRise,center=(rs.minZ+rs.maxZ)/2;
        if(!rs.suppressMin)addGablePrismToSplitMeshes(outside,inside,edges,'x',rs.minX,rs.minZ,rs.maxZ,center,building.wallHeight,ridgeY,building.wallThickness,-1);
        if(!rs.suppressMax)addGablePrismToSplitMeshes(outside,inside,edges,'x',rs.maxX,rs.minZ,rs.maxZ,center,building.wallHeight,ridgeY,building.wallThickness,1);
      }else{
        const ridgeRise=(w/2)*Math.tan(pitch),ridgeY=building.wallHeight+ridgeRise,center=(rs.minX+rs.maxX)/2;
        if(!rs.suppressMin)addGablePrismToSplitMeshes(outside,inside,edges,'z',rs.minZ,rs.minX,rs.maxX,center,building.wallHeight,ridgeY,building.wallThickness,-1);
        if(!rs.suppressMax)addGablePrismToSplitMeshes(outside,inside,edges,'z',rs.maxZ,rs.minX,rs.maxX,center,building.wallHeight,ridgeY,building.wallThickness,1);
      }
    }
  }
  for(const mesh of [outside,inside,edges])offsetWallUvs(mesh,building);
  return {outside,inside,edges};
}

function offsetWallUvs(mesh,building){
  // Continuous texture coordinates through the inter-story band; keep the
  // existing separate mesh instances for per-mesh lighting/material control.
  const elevation=Number(building.wallUvElevation)||0;
  mesh.uvs.forEach(uv=>{uv.v+=elevation;});
}

function addInteriorWallBoxToMeshes(sideAWriter, sideBWriter, edgeWriter, building, wall, seg) {
  const L=wallLength(wall); if(L<EPS)return;
  const d={x:(wall.b.x-wall.a.x)/L,z:(wall.b.z-wall.a.z)/L},n={x:-d.z,z:d.x},ht=building.wallThickness/2;
  const s0=seg.start,s1=seg.end,y0=seg.bottom,y1=seg.top;if(s1-s0<EPS||y1-y0<EPS)return;
  const centerAt=s=>({x:wall.a.x+d.x*s,z:wall.a.z+d.z*s}),a=centerAt(s0),b=centerAt(s1),p=(c,side,y)=>({x:c.x+n.x*ht*side,y,z:c.z+n.z*ht*side});
  const a0m=p(a,-1,y0),b0m=p(b,-1,y0),a1m=p(a,-1,y1),b1m=p(b,-1,y1),a0p=p(a,1,y0),b0p=p(b,1,y0),a1p=p(a,1,y1),b1p=p(b,1,y1);
  sideAWriter.face([a0m,b0m,b1m,a1m],[{u:s0,v:y0},{u:s1,v:y0},{u:s1,v:y1},{u:s0,v:y1}],{x:-n.x,y:0,z:-n.z},'side');
  sideBWriter.face([a0p,a1p,b1p,b0p],[{u:s0,v:y0},{u:s0,v:y1},{u:s1,v:y1},{u:s1,v:y0}],{x:n.x,y:0,z:n.z},'side');
  edgeWriter.face([a1m,b1m,b1p,a1p],[{u:s0,v:-ht},{u:s1,v:-ht},{u:s1,v:ht},{u:s0,v:ht}],{x:0,y:1,z:0},'cap');
  edgeWriter.face([a0m,a0p,b0p,b0m],[{u:s0,v:-ht},{u:s0,v:ht},{u:s1,v:ht},{u:s1,v:-ht}],{x:0,y:-1,z:0},'cap');
  const startsAtEndpoint=seg.start<=EPS||seg.start<0,endsAtEndpoint=seg.end>=L-EPS||seg.end>L;
  edgeWriter.face([a0m,a1m,a1p,a0p],[{u:-ht,v:y0},{u:-ht,v:y1},{u:ht,v:y1},{u:ht,v:y0}],{x:-d.x,y:0,z:-d.z},'end');
  edgeWriter.face([b0m,b0p,b1p,b1m],[{u:-ht,v:y0},{u:ht,v:y0},{u:ht,v:y1},{u:-ht,v:y1}],{x:d.x,y:0,z:d.z},'end');
}

export function buildInteriorSplitMeshData(building) {
  if(hasProfileWalls(building)){const m=buildProfileMeshData(building),out={sideA:m.sideA,sideB:m.sideB,edges:m.interiorEdges};for(const mesh of Object.values(out))offsetWallUvs(mesh,building);return out;}
  const sideA=meshWriter(),sideB=meshWriter(),edges=meshWriter();
  const storySkirt=Math.max(0,Number(building.storyFloorSkirt ?? building.exteriorFloorSkirt)||0);
  const solids=wallUnionSolids(building);
  for(const wall of building.walls.filter(w=>!isExteriorWall(building,w))){
    const clipped=[sideA,sideB,edges].map(w=>unionFaceWriter(w,building.walls.indexOf(wall),solids));
    for(const raw of splitWallIntoSolidSegments(building,wall))addInteriorWallBoxToMeshes(...clipped,building,wall,adjustedSegment(building,wall,raw));
    if(storySkirt>EPS)addInteriorStorySkirt(clipped[0],clipped[1],building,wall,storySkirt);
  }
  for(const mesh of [sideA,sideB,edges])offsetWallUvs(mesh,building);
  return {sideA,sideB,edges};
}

export function buildInteriorMeshData(building) {
  if(hasProfileWalls(building)){const meshes=Object.values(buildInteriorSplitMeshData(building));return {vertices:meshes.flatMap(m=>m.vertices),normals:meshes.flatMap(m=>m.normals),uvs:meshes.flatMap(m=>m.uvs)};}
  const writer=meshWriter();
  const interiorWalls=building.walls.filter(w=>!isExteriorWall(building,w));
  const storySkirt=Math.max(0,Number(building.storyFloorSkirt ?? building.exteriorFloorSkirt)||0);
  for(const wall of interiorWalls) {
    for(const raw of splitWallIntoSolidSegments(building,wall)) {
      const seg=adjustedSegment(building,wall,raw);
      addWallBoxToMesh(writer,building,wall,seg);
    }
    if(storySkirt>EPS)addStorySkirtToUnifiedWallMesh(writer,building,wall,storySkirt);
  }
  return writer;
}

function bytesToBase64(bytes){
  if(typeof Buffer!=='undefined') return Buffer.from(bytes).toString('base64');
  let out='';
  const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk) out+=String.fromCharCode(...bytes.subarray(i,i+chunk));
  return btoa(out);
}

function flatNormalsFromFinalTriangles(vertices){
  if(vertices.length%3!==0) throw new Error('Triangle mesh vertex count must be divisible by 3.');
  const out=new Array(vertices.length);
  for(let i=0;i<vertices.length;i+=3){
    const v0=vertices[i],v1=vertices[i+1],v2=vertices[i+2];
    // Godot treats clockwise triangles as front-facing. A conventional
    // (v1-v0)x(v2-v0) therefore points opposite the rendered front face for
    // the non-indexed clockwise triangles written by meshWriter(). Reverse
    // the operands so the stored flat normal points out of the visible face.
    const a={x:v2.x-v0.x,y:v2.y-v0.y,z:v2.z-v0.z};
    const b={x:v1.x-v0.x,y:v1.y-v0.y,z:v1.z-v0.z};
    let n={x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x};
    const len=Math.hypot(n.x,n.y,n.z);
    if(len<=EPS) n={x:0,y:1,z:0};
    else n={x:n.x/len,y:n.y/len,z:n.z/len};
    out[i]={...n};out[i+1]={...n};out[i+2]={...n};
  }
  return out;
}

// Matches Godot Vector3::octahedron_encode(): X/Y are stored in the encoded
// Vector2 and Z chooses the lower-hemisphere fold. The previous exporter used
// X/Z with Y as the fold axis, which remapped Z-facing wall normals onto Y and
// produced the broken flashlight lighting seen in-game.
export function encodeOctNormal(n){
  let x=n.x,y=n.y,z=n.z;
  const l=Math.hypot(x,y,z)||1;
  x/=l;y/=l;z/=l;
  const inv=1/(Math.abs(x)+Math.abs(y)+Math.abs(z)||1);
  x*=inv;y*=inv;z*=inv;
  let ox,oy;
  if(z>=0){
    ox=x;oy=y;
  }else{
    ox=(1-Math.abs(y))*(x>=0?1:-1);
    oy=(1-Math.abs(x))*(y>=0?1:-1);
  }
  ox=ox*.5+.5;
  oy=oy*.5+.5;
  const ux=Math.max(0,Math.min(65535,Math.trunc(ox*65535)));
  const uy=Math.max(0,Math.min(65535,Math.trunc(oy*65535)));
  return ((uy<<16)|ux)>>>0;
}

export function decodeOctNormal(value){
  const ux=value&0xffff,uy=(value>>>16)&0xffff;
  const fx=ux/65535*2-1,fy=uy/65535*2-1;
  let n={x:fx,y:fy,z:1-Math.abs(fx)-Math.abs(fy)};
  const t=Math.max(0,Math.min(1,-n.z));
  n.x+=n.x>=0?-t:t;
  n.y+=n.y>=0?-t:t;
  const l=Math.hypot(n.x,n.y,n.z)||1;
  return {x:n.x/l,y:n.y/l,z:n.z/l};
}

export function packExteriorMesh(mesh){
  const count=mesh.vertices.length;
  if(count===0) return null;
  if(mesh.uvs.length!==count) throw new Error('Mesh attribute count mismatch.');
  // Never trust precomputed/editor-space normals at the serialization boundary.
  // All ArrayMesh surfaces are non-indexed hard-surface triangles, so deriving
  // one normal per final triangle also preserves the intended flat shading.
  const finalNormals=flatNormalsFromFinalTriangles(mesh.vertices);

  // Godot 4.7's current ArrayMesh surface format stores float32 positions first
  // in vertex_data, then one octahedron-compressed uint32 normal per vertex.
  // UV1 remains two float32 values per vertex in attribute_data.
  const vertexBytes=new Uint8Array(count*16);
  const vv=new DataView(vertexBytes.buffer);
  for(let i=0;i<count;i++){
    const p=mesh.vertices[i];
    const o=i*12;
    vv.setFloat32(o,p.x,true);vv.setFloat32(o+4,p.y,true);vv.setFloat32(o+8,p.z,true);
  }
  const normalBase=count*12;
  for(let i=0;i<count;i++) vv.setUint32(normalBase+i*4,encodeOctNormal(finalNormals[i]),true);

  const attributeBytes=new Uint8Array(count*8);
  const av=new DataView(attributeBytes.buffer);
  for(let i=0;i<count;i++){
    av.setFloat32(i*8,mesh.uvs[i].u,true);
    av.setFloat32(i*8+4,mesh.uvs[i].v,true);
  }

  let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
  for(const p of mesh.vertices){
    minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);minZ=Math.min(minZ,p.z);
    maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);maxZ=Math.max(maxZ,p.z);
  }
  return {
    count,
    vertexBytes,
    attributeBytes,
    vertexBase64:bytesToBase64(vertexBytes),
    attributeBase64:bytesToBase64(attributeBytes),
    aabb:{x:minX,y:minY,z:minZ,w:maxX-minX,h:maxY-minY,d:maxZ-minZ}
  };
}

function surfaceObject(mesh, materialId, surfaceName){
  const packed=packExteriorMesh(mesh);
  if(!packed) return null;
  const format=34359738368 + 1 + 2 + 16;
  const a=packed.aabb;
  return {
    packed,
    text:`{
"aabb": AABB(${fmt(a.x)}, ${fmt(a.y)}, ${fmt(a.z)}, ${fmt(a.w)}, ${fmt(a.h)}, ${fmt(a.d)}),
"attribute_data": PackedByteArray("${packed.attributeBase64}"),
"format": ${format},
"material": SubResource("${materialId}"),
"name": "${surfaceName}",
"primitive": 3,
"uv_scale": Vector4(0, 0, 0, 0),
"vertex_count": ${packed.count},
"vertex_data": PackedByteArray("${packed.vertexBase64}")
}`
  };
}

function multiSurfaceArrayMeshResource(surfaceDefs, resourceId){
  const surfaces=surfaceDefs.map(d=>surfaceObject(d.mesh,d.materialId,d.surfaceName)).filter(Boolean);
  if(!surfaces.length) return null;
  return {
    packed:surfaces.map(s=>s.packed),
    text:`[sub_resource type="ArrayMesh" id="${resourceId}"]
_surfaces = [${surfaces.map(s=>s.text).join(',\n')} ]
blend_shape_mode = 0`
  };
}

function arrayMeshResource(mesh, materialId, resourceId, surfaceName){
  const result=multiSurfaceArrayMeshResource([{mesh,materialId,surfaceName}],resourceId);
  if(!result) return null;
  return { packed:result.packed[0], text:result.text };
}

function exteriorArrayMeshResources(building, outsideMaterialId, insideMaterialId, edgeMaterialId, prefix=''){
  const data=buildExteriorMeshData(building);
  return {
    data,
    outside:arrayMeshResource(data.outside,outsideMaterialId,`${prefix}ExteriorOutsideMesh`,'OutsideFaces'),
    inside:arrayMeshResource(data.inside,insideMaterialId,`${prefix}ExteriorInsideMesh`,'InsideFaces'),
    edges:arrayMeshResource(data.edges,edgeMaterialId,`${prefix}ExteriorEdgeMesh`,'EdgeFaces'),
    ids:{outside:`${prefix}ExteriorOutsideMesh`,inside:`${prefix}ExteriorInsideMesh`,edges:`${prefix}ExteriorEdgeMesh`}
  };
}

function interiorArrayMeshResource(building, materialId, prefix=''){
  return arrayMeshResource(buildInteriorMeshData(building), materialId, `${prefix}InteriorMesh`, 'InteriorWalls');
}

function interiorArrayMeshResources(building, sideAMaterialId, sideBMaterialId, edgeMaterialId, prefix=''){
  const data=buildInteriorSplitMeshData(building);
  return {data,sideA:arrayMeshResource(data.sideA,sideAMaterialId,`${prefix}InteriorSideAMesh`,'SideAFaces'),sideB:arrayMeshResource(data.sideB,sideBMaterialId,`${prefix}InteriorSideBMesh`,'SideBFaces'),edges:arrayMeshResource(data.edges,edgeMaterialId,`${prefix}InteriorEdgeMesh`,'EdgeFaces'),ids:{sideA:`${prefix}InteriorSideAMesh`,sideB:`${prefix}InteriorSideBMesh`,edges:`${prefix}InteriorEdgeMesh`}};
}

function windowArrayMeshResource(building, opening, frameMaterialId, glassMaterialId, resourceId){
  const data=buildWindowMeshData(building,opening);
  if(!data) return null;
  const resource=multiSurfaceArrayMeshResource([
    {mesh:data.frame,materialId:frameMaterialId,surfaceName:'Frame'},
    {mesh:data.glass,materialId:glassMaterialId,surfaceName:'Glass'}
  ],resourceId);
  return resource ? {...resource,data} : null;
}

function doorSceneDescriptors(building) {
  const cfg=building.doorMesh || {enabled:true};
  if(!cfg.enabled) return [];
  const base=fileBase(building.name);
  const floors=Array.isArray(building.floors)&&building.floors.length?building.floors:[{walls:building.walls||[],openings:building.openings||[],lights:building.lights||[],stairs:[]}];
  const out=[];
  for(let fi=0;fi<floors.length;fi++){
    const view=floorView(building,floors[fi],fi===floors.length-1);
    const floorDoors=view.openings.filter(o=>o.type==='door'&&o.doorStyle!=='empty'&&findWall(view,o.wallId));
    for(let di=0;di<floorDoors.length;di++){
      const opening=floorDoors[di];
      const fn=String(fi+1).padStart(2,'0');
      const dn=String(di+1).padStart(3,'0');
      const label=fileSlug(opening.label||opening.doorStyle||`door_${dn}`);
      out.push({
        opening,
        floorIndex:fi,
        view,
        index:di,
        number:dn,
        extId:`F${fn}_DoorScene_${dn}`,
        filename:`doors/${base}_f${fn}_door_${dn}_${label}.tscn`
      });
    }
  }
  return out;
}


export function buildStairMeshData(building, stair) {
  const width=Math.max(.5,Number(stair.width)||2.4);
  const run=Math.max(1,Number(stair.run)||6.5);
  const rise=storyHeight(building);
  const style=stair.style==='steps'?'steps':'ramp';
  const steps=Math.max(2,Math.round(Number(stair.steps)||12));
  const blockBelow=stair.blockBelow!==false;
  const writer=meshWriter();
  const rampThickness=Math.max(.06,Math.min(.18,Number(building.floorThickness)||.18));
  const slope=Math.hypot(run,rise),angle=Math.atan2(rise,run),c=Math.cos(angle),s=Math.sin(angle);
  const rampCenter={x:0,y:rise/2-rampThickness*c/2,z:-rampThickness*s/2};

  if(style==='steps'){
    // Treads + risers form the visible staircase while the collision remains a
    // smooth inclined box. The underside is genuinely open unless blockBelow
    // adds the separate triangular fill volume.
    const tread=run/steps,stepRise=rise/steps;
    const treadThickness=Math.max(.035,Math.min(.08,stepRise*.28));
    const riserDepth=Math.max(.025,Math.min(.055,tread*.18));
    for(let i=0;i<steps;i++){
      const top=rise*(i+1)/steps;
      const z=run/2-tread*(i+.5);
      addLocalBoxToMesh(writer,{x:width,y:treadThickness,z:tread+.006},{x:0,y:top-treadThickness/2,z});
      const boundary=run/2-tread*(i+1);
      addLocalBoxToMesh(writer,{x:width,y:stepRise,z:riserDepth},{x:0,y:top-stepRise/2,z:boundary+riserDepth/2});
    }
  }else{
    // A thin ramp slab. Closing the triangular space below it is controlled by
    // blockBelow rather than being baked into the ramp itself.
    addLocalRotatedBoxXToMesh(writer,{x:width,y:rampThickness,z:slope},rampCenter,angle);
  }

  let blockerMesh=null,blockerRise=0;
  if(blockBelow){
    blockerMesh=meshWriter();
    const clearance=Math.max(.035,rampThickness*.65);
    blockerRise=Math.max(.05,rise-clearance);
    addUnderStairWedgeToMesh(blockerMesh,width,run,blockerRise);
  }
  return {mesh:writer,blockerMesh,width,run,rise,style,steps,blockBelow,rampThickness,slope,angle,rampCenter,blockerRise};
}

function stairYaw(direction){
  if(direction==='south') return Math.PI;
  if(direction==='east') return -Math.PI/2;
  if(direction==='west') return Math.PI/2;
  return 0;
}

function clippedStairHoles(bounds, stairs, margin=.04){
  const out=[];
  for(const stair of stairs||[]){
    const h=stairOpeningFootprint(stair,margin);
    const minX=Math.max(bounds.minX,h.minX),maxX=Math.min(bounds.maxX,h.maxX);
    const minZ=Math.max(bounds.minZ,h.minZ),maxZ=Math.min(bounds.maxZ,h.maxZ);
    if(maxX-minX>EPS&&maxZ-minZ>EPS) out.push({minX,maxX,minZ,maxZ});
  }
  return out;
}

function clippedRectHoles(bounds, rects){
  const out=[];
  for(const r of rects||[]){
    if(!rectValid(r))continue;
    const minX=Math.max(bounds.minX,r.minX),maxX=Math.min(bounds.maxX,r.maxX);
    const minZ=Math.max(bounds.minZ,r.minZ),maxZ=Math.min(bounds.maxZ,r.maxZ);
    if(maxX-minX>EPS&&maxZ-minZ>EPS)out.push({minX,maxX,minZ,maxZ});
  }
  return out;
}

export function slabRectangles(bounds, holes=[]) {
  if(bounds.width<=EPS||bounds.depth<=EPS) return [];
  const clipped=holes.map(h=>({
    minX:Math.max(bounds.minX,h.minX),maxX:Math.min(bounds.maxX,h.maxX),
    minZ:Math.max(bounds.minZ,h.minZ),maxZ:Math.min(bounds.maxZ,h.maxZ)
  })).filter(h=>h.maxX-h.minX>EPS&&h.maxZ-h.minZ>EPS);
  if(!clipped.length) return [{minX:bounds.minX,maxX:bounds.maxX,minZ:bounds.minZ,maxZ:bounds.maxZ}];
  const xs=[bounds.minX,bounds.maxX],zs=[bounds.minZ,bounds.maxZ];
  for(const h of clipped){xs.push(h.minX,h.maxX);zs.push(h.minZ,h.maxZ);}
  xs.sort((a,b)=>a-b);zs.sort((a,b)=>a-b);
  const ux=xs.filter((v,i,a)=>i===0||Math.abs(v-a[i-1])>EPS);
  const uz=zs.filter((v,i,a)=>i===0||Math.abs(v-a[i-1])>EPS);
  const cells=[];
  for(let xi=0;xi<ux.length-1;xi++)for(let zi=0;zi<uz.length-1;zi++){
    const minX=ux[xi],maxX=ux[xi+1],minZ=uz[zi],maxZ=uz[zi+1];
    if(maxX-minX<=EPS||maxZ-minZ<=EPS)continue;
    const cx=(minX+maxX)/2,cz=(minZ+maxZ)/2;
    if(clipped.some(h=>cx>h.minX-EPS&&cx<h.maxX+EPS&&cz>h.minZ-EPS&&cz<h.maxZ+EPS))continue;
    cells.push({minX,maxX,minZ,maxZ});
  }
  // Merge neighboring cells horizontally, then vertically, to keep the exported scene tidy.
  let rows=[];
  cells.sort((a,b)=>a.minZ-b.minZ||a.maxZ-b.maxZ||a.minX-b.minX);
  for(const c of cells){
    const last=rows[rows.length-1];
    if(last&&Math.abs(last.minZ-c.minZ)<EPS&&Math.abs(last.maxZ-c.maxZ)<EPS&&Math.abs(last.maxX-c.minX)<EPS) last.maxX=c.maxX;
    else rows.push({...c});
  }
  const merged=[];
  rows.sort((a,b)=>a.minX-b.minX||a.maxX-b.maxX||a.minZ-b.minZ);
  for(const r of rows){
    const last=merged[merged.length-1];
    if(last&&Math.abs(last.minX-r.minX)<EPS&&Math.abs(last.maxX-r.maxX)<EPS&&Math.abs(last.maxZ-r.minZ)<EPS) last.maxZ=r.maxZ;
    else merged.push({...r});
  }
  return merged;
}


export function buildSlabFaceMeshData(rects, thickness, topY = 0) {
  const top=meshWriter(),bottom=meshWriter(),edges=meshWriter();
  const t=Math.max(.001,Number(thickness)||.18), y1=Number(topY)||0, y0=y1-t;
  if(rects.some(r=>r.polygon)){
    const faces=polygonSlabFaces(unionPolygonAreas(rects),t,y1);
    for(const [key,writer] of Object.entries({top,bottom,edges}))for(const f of faces[key])writer.face(f.points,f.uvs,f.normal);
    return {top,bottom,edges};
  }
  const uv=(u,v)=>({u,v});
  const pieces=unionRectangles(rects);
  for(const r of pieces){
    const x0=Number(r.minX),x1=Number(r.maxX),z0=Number(r.minZ),z1=Number(r.maxZ);
    if(x1-x0<=EPS||z1-z0<=EPS)continue;
    top.face([
      {x:x0,y:y1,z:z0},{x:x1,y:y1,z:z0},{x:x1,y:y1,z:z1},{x:x0,y:y1,z:z1}
    ],[uv(x0,z0),uv(x1,z0),uv(x1,z1),uv(x0,z1)],{x:0,y:1,z:0});
    bottom.face([
      {x:x0,y:y0,z:z0},{x:x0,y:y0,z:z1},{x:x1,y:y0,z:z1},{x:x1,y:y0,z:z0}
    ],[uv(x0,z0),uv(x0,z1),uv(x1,z1),uv(x1,z0)],{x:0,y:-1,z:0});
    // Only the union boundary is exposed. Slab decomposition around stairs
    // must not emit opposing internal faces (including partial T joins).
    for(const [axis,fixed,lo,hi,sign] of [['x',z0,x0,x1,-1],['x',z1,x0,x1,1],['z',x0,z0,z1,-1],['z',x1,z0,z1,1]]){
      let spans=[[lo,hi]];
      for(const q of pieces){
        if(q===r)continue;
        const across=fixed+sign*EPS*2;
        const covers=axis==='x'?across>q.minZ&&across<q.maxZ:across>q.minX&&across<q.maxX;
        if(!covers)continue;
        const qlo=axis==='x'?q.minX:q.minZ,qhi=axis==='x'?q.maxX:q.maxZ;
        spans=spans.flatMap(([a,b])=>qhi<=a||qlo>=b?[[a,b]]:[[a,Math.min(b,qlo)],[Math.max(a,qhi),b]].filter(([s,e])=>e-s>EPS));
      }
      for(const [a,b] of spans){
        const p=(s,y)=>axis==='x'?{x:s,y,z:fixed}:{x:fixed,y,z:s};
        edges.face([p(a,y0),p(b,y0),p(b,y1),p(a,y1)],[uv(a,y0),uv(b,y0),uv(b,y1),uv(a,y1)],axis==='x'?{x:0,y:0,z:sign}:{x:sign,y:0,z:0});
      }
    }
  }
  return {top,bottom,edges};
}



function floorBaseRects(view, bounds) {
  const rects=structuralFloorRectangles(view);
  return rects; // An empty result can be an intentional full-region cutout.
}

function unionRectangles(rects=[]) {
  const valid=(rects||[]).filter(r=>r&&r.maxX-r.minX>EPS&&r.maxZ-r.minZ>EPS);
  if(!valid.length) return [];
  const xs=[...new Set(valid.flatMap(r=>[r.minX,r.maxX]))].sort((a,b)=>a-b);
  const zs=[...new Set(valid.flatMap(r=>[r.minZ,r.maxZ]))].sort((a,b)=>a-b);
  const cells=[];
  for(let xi=0;xi<xs.length-1;xi++)for(let zi=0;zi<zs.length-1;zi++){
    const minX=xs[xi],maxX=xs[xi+1],minZ=zs[zi],maxZ=zs[zi+1];
    if(maxX-minX<=EPS||maxZ-minZ<=EPS) continue;
    const cx=(minX+maxX)/2,cz=(minZ+maxZ)/2;
    if(valid.some(r=>cx>r.minX-EPS&&cx<r.maxX+EPS&&cz>r.minZ-EPS&&cz<r.maxZ+EPS)) cells.push({minX,maxX,minZ,maxZ});
  }
  let rows=[];
  cells.sort((a,b)=>a.minZ-b.minZ||a.maxZ-b.maxZ||a.minX-b.minX);
  for(const c of cells){const last=rows[rows.length-1];if(last&&Math.abs(last.minZ-c.minZ)<EPS&&Math.abs(last.maxZ-c.maxZ)<EPS&&Math.abs(last.maxX-c.minX)<EPS)last.maxX=c.maxX;else rows.push({...c});}
  const merged=[];
  rows.sort((a,b)=>a.minX-b.minX||a.maxX-b.maxX||a.minZ-b.minZ);
  for(const r of rows){const last=merged[merged.length-1];if(last&&Math.abs(last.minX-r.minX)<EPS&&Math.abs(last.maxX-r.maxX)<EPS&&Math.abs(last.maxZ-r.minZ)<EPS)last.maxZ=r.maxZ;else merged.push({...r});}
  return merged;
}

function slabRectanglesForBases(bases, holes = []) {
  if(bases.some(r=>r.polygon))return subtractPolygonAreas(unionPolygonAreas(bases),holes);
  const out = [];
  for (const base of unionRectangles(bases)) out.push(...slabRectangles({ ...base, width: base.maxX-base.minX, depth: base.maxZ-base.minZ }, holes));
  return out;
}

export function floorRectanglesForView(view, belowStairs=[]) {
  const structureBounds=boundsOfStructuralFloor(view);
  if(structureBounds.width<=EPS||structureBounds.depth<=EPS)return [];
  const holes=[...clippedStairHoles(structureBounds,belowStairs,.06),...clippedRectHoles(structureBounds,view.platforms||[])];
  return slabRectanglesForBases(floorBaseRects(view,structureBounds),holes);
}

export function buildRailingMeshData(railing) {
  const len = Math.hypot(railing.b.x - railing.a.x, railing.b.z - railing.a.z);
  if (len <= EPS) return null;
  const writer = meshWriter();
  const h = Math.max(0.4, Number(railing.height) || 1.0);
  const style=['two_rail','picket','cross_brace'].includes(railing.style)?railing.style:'two_rail';
  const railW = 0.08;
  const postW = 0.08;
  const topY = h;
  const makeBox=(cx,cy,cz,sx,sy,sz)=>addLocalBoxToMesh(writer,{x:sx,y:sy,z:sz},{x:cx,y:cy,z:cz});

  // All variants keep a top rail and structural posts.
  makeBox(0,topY,0,len,0.06,railW);
  const posts=Math.max(2,Math.ceil(len/1.4)+1);
  for(let i=0;i<posts;i++){
    const t=posts===1?0:i/(posts-1),x=-len/2+len*t;
    makeBox(x,h/2,0,postW,h,postW);
  }

  if(style==='two_rail'){
    makeBox(0,h*.55,0,len,0.06,railW);
  }else if(style==='picket'){
    // Denser, slimmer balusters with a low bottom rail.
    makeBox(0,h*.18,0,len,0.055,railW*.8);
    const count=Math.max(3,Math.ceil(len/.28)+1);
    for(let i=1;i<count-1;i++){
      const x=-len/2+len*i/(count-1);
      makeBox(x,h*.56,0,.035,h*.76,.04);
    }
  }else if(style==='cross_brace'){
    // X braces between each structural post bay.
    for(let i=0;i<posts-1;i++){
      const x0=-len/2+len*i/(posts-1),x1=-len/2+len*(i+1)/(posts-1);
      const bay=x1-x0,cx=(x0+x1)/2,dy=h*.58,cy=h*.49;
      const braceLen=Math.hypot(bay,dy),angle=Math.atan2(dy,bay);
      addLocalRotatedBoxToMesh(writer,{x:braceLen,y:.055,z:.055},{x:cx,y:cy,z:0},angle);
      addLocalRotatedBoxToMesh(writer,{x:braceLen,y:.055,z:.055},{x:cx,y:cy,z:0},-angle);
    }
  }
  return {mesh:writer,style};
}


export function exportDoorTscn(building, opening, options={}) {
  const data=buildDoorMeshData(building,opening);
  const profile=exportProfile(building,options);
  if(!data) return null;
  const resources=[];
  const addRes=(type,id,props)=>resources.push(`[sub_resource type="${type}" id="${id}"]\n${props.join('\n')}`);
  const matFrame='Material_DoorFrame', matDoor='Material_Door', matHardware='Material_DoorHardware';
  const doorColor=data.style==='exterior'?'0.36, 0.20, 0.12':data.style==='closet'?'0.66, 0.61, 0.50':'0.55, 0.45, 0.31';
  const doorRoughness=data.style==='exterior'?'0.86':data.style==='closet'?'0.94':'0.92';
  addRes('StandardMaterial3D',matFrame,['albedo_color = Color(0.25, 0.20, 0.14, 1)','roughness = 0.9']);
  addRes('StandardMaterial3D',matDoor,[`albedo_color = Color(${doorColor}, 1)`,`roughness = ${doorRoughness}`]);
  addRes('StandardMaterial3D',matHardware,['albedo_color = Color(0.58, 0.48, 0.24, 1)','metallic = 0.45','roughness = 0.38']);

  const frameRes=arrayMeshResource(data.frame,matFrame,'DoorFrameMesh','Frame');
  if(frameRes) resources.push(frameRes.text);

  const nodes=[];
  const styleName=data.style==='exterior'?'Exterior':data.style==='closet'?'Closet':'Room';
  const isDouble=data.style==='closet';
  const hingeHint=data.custom?' Custom outline: Panel is the movable pivot. Add sliding or other movement in Godot; no movement script is included.':exportProfile(building,options).windowGroup==='scare_sight_transparent'
    ? (isDouble?' Set double_hinge = true; expected hinge paths: $Hinge and $Hinge2.':' Default single hinge; expected hinge path: $Hinge.')
    : (isDouble?' Two independent hinge pivots: Hinge and Hinge2.':' Single hinge pivot: Hinge.');
  // Get Probed doors use a stationary Area3D at the doorway root so the
  // interaction target remains available even when the moving leaf collider
  // is disabled while the door is open. The supplied in-game door scenes use
  // a 0.42 m deep box and pad the leaf clear width by the building wall
  // thickness.
  const interactionDepth=.42;
  const interactionWidthPadding=Math.max(.01,Number(building.wallThickness)||.18);
  let interactionWidth=data.innerWidth+interactionWidthPadding;
  let interactionHeight=data.innerHeight;
  let interactionY=data.innerHeight/2;
  nodes.push(`[node name="Door" type="Node3D"]\neditor_description = "${styleName} door. Attach your door script manually to this root.${hingeHint}"`);
  if(frameRes) nodes.push(`[node name="Frame" type="MeshInstance3D" parent="."]\nposition = ${v3(0,data.height/2,0)}\nmesh = SubResource("DoorFrameMesh")`);

  if(data.custom){
    const leafRes=arrayMeshResource(data.panel,matDoor,'DoorLeafMesh','Door');if(leafRes)resources.push(leafRes.text);
    nodes.push(`[node name="Panel" type="Node3D" parent="."]`);
    if(leafRes)nodes.push(`[node name="DoorMesh" type="MeshInstance3D" parent="Panel"]\nposition = ${v3(0,data.height/2,0)}\nmesh = SubResource("DoorLeafMesh")`);
    nodes.push(`[node name="AnimatableBody3D" type="AnimatableBody3D" parent="Panel"]\nsync_to_physics = false\ncollision_layer = ${profile.doorLayer}\ncollision_mask = ${profile.bodyMask}`);
    data.panelCells.forEach((cell,i)=>{
      const id=`DoorShape_${i+1}`,points=areaPoints(cell).flatMap(p=>[-1,1].map(side=>({x:p.x,y:p.z,z:side*data.panelThickness/2})));
      addRes('ConvexPolygonShape3D',id,[`points = ${packedV3(points)}`]);
      nodes.push(`[node name="Collision_${i+1}" type="CollisionShape3D" parent="Panel/AnimatableBody3D"]\nshape = SubResource("${id}")`);
    });
    if(data.frame.vertices.length){
      addRes('ConcavePolygonShape3D','FrameShape',[`data = ${packedV3(data.frame.vertices.map(p=>({...p,y:p.y+data.height/2})))}`,'backface_collision = true']);
      nodes.push(`[node name="FrameBody" type="StaticBody3D" parent="."]\ncollision_layer = ${profile.doorLayer}\ncollision_mask = ${profile.bodyMask}`);
      nodes.push(`[node name="CollisionShape3D" type="CollisionShape3D" parent="FrameBody"]\nshape = SubResource("FrameShape")`);
    }
  }else if(isDouble){
    const pair=buildClosetDoorLeafMeshData(building,opening);
    const leftRes=multiSurfaceArrayMeshResource([
      {mesh:pair.left.panel,materialId:matDoor,surfaceName:'Door'},
      {mesh:pair.left.hardware,materialId:matHardware,surfaceName:'Hardware'}
    ],'DoorLeafLeftMesh');
    const rightRes=multiSurfaceArrayMeshResource([
      {mesh:pair.right.panel,materialId:matDoor,surfaceName:'Door'},
      {mesh:pair.right.hardware,materialId:matHardware,surfaceName:'Hardware'}
    ],'DoorLeafRightMesh');
    if(leftRes) resources.push(leftRes.text);
    if(rightRes) resources.push(rightRes.text);
    addRes('BoxShape3D','DoorShapeLeft',[`size = ${v3(pair.leafWidth,pair.innerHeight,pair.panelThickness)}`]);
    addRes('BoxShape3D','DoorShapeRight',[`size = ${v3(pair.leafWidth,pair.innerHeight,pair.panelThickness)}`]);

    const leftHingeX=-pair.innerWidth/2;
    const rightHingeX=pair.innerWidth/2;
    const leftLeafX=pair.leafWidth/2;
    const rightLeafX=-pair.leafWidth/2;
    const leafY=pair.height/2;
    const collisionY=pair.height/2+pair.panelCenterY;
    interactionWidth=pair.innerWidth+interactionWidthPadding;
    interactionHeight=pair.innerHeight;
    interactionY=collisionY;

    nodes.push(`[node name="Hinge" type="Node3D" parent="."]\nposition = ${v3(leftHingeX,0,0)}`);
    if(leftRes) nodes.push(`[node name="DoorMesh" type="MeshInstance3D" parent="Hinge"]\nposition = ${v3(leftLeafX,leafY,0)}\nmesh = SubResource("DoorLeafLeftMesh")`);
    nodes.push(`[node name="AnimatableBody3D" type="AnimatableBody3D" parent="Hinge"]\ncollision_layer = ${profile.doorLayer}\ncollision_mask = ${profile.bodyMask}`);
    nodes.push(`[node name="CollisionShape3D" type="CollisionShape3D" parent="Hinge/AnimatableBody3D"]\nposition = ${v3(leftLeafX,collisionY,0)}\nshape = SubResource("DoorShapeLeft")`);

    nodes.push(`[node name="Hinge2" type="Node3D" parent="."]\nposition = ${v3(rightHingeX,0,0)}`);
    if(rightRes) nodes.push(`[node name="DoorMesh" type="MeshInstance3D" parent="Hinge2"]\nposition = ${v3(rightLeafX,leafY,0)}\nmesh = SubResource("DoorLeafRightMesh")`);
    nodes.push(`[node name="AnimatableBody3D" type="AnimatableBody3D" parent="Hinge2"]\ncollision_layer = ${profile.doorLayer}\ncollision_mask = ${profile.bodyMask}`);
    nodes.push(`[node name="CollisionShape3D" type="CollisionShape3D" parent="Hinge2/AnimatableBody3D"]\nposition = ${v3(rightLeafX,collisionY,0)}\nshape = SubResource("DoorShapeRight")`);
  }else{
    const leafRes=multiSurfaceArrayMeshResource([
      {mesh:data.panel,materialId:matDoor,surfaceName:'Door'},
      {mesh:data.hardware,materialId:matHardware,surfaceName:'Hardware'}
    ],'DoorLeafMesh');
    if(leafRes) resources.push(leafRes.text);
    addRes('BoxShape3D','DoorShape',[`size = ${v3(data.innerWidth,data.innerHeight,data.panelThickness)}`]);

    const hingeX=-data.innerWidth/2;
    const leafX=data.innerWidth/2;
    const leafY=data.height/2;
    const collisionY=data.height/2+data.panelCenterY;
    interactionY=collisionY;
    nodes.push(`[node name="Hinge" type="Node3D" parent="."]\nposition = ${v3(hingeX,0,0)}`);
    if(leafRes) nodes.push(`[node name="DoorMesh" type="MeshInstance3D" parent="Hinge"]\nposition = ${v3(leafX,leafY,0)}\nmesh = SubResource("DoorLeafMesh")`);
    nodes.push(`[node name="AnimatableBody3D" type="AnimatableBody3D" parent="Hinge"]\ncollision_layer = ${profile.doorLayer}\ncollision_mask = ${profile.bodyMask}`);
    nodes.push(`[node name="CollisionShape3D" type="CollisionShape3D" parent="Hinge/AnimatableBody3D"]\nposition = ${v3(leafX,collisionY,0)}\nshape = SubResource("DoorShape")`);
  }

  if(profile.interactionArea){
  addRes('BoxShape3D','DoorInteractionShape_GP',[`size = ${v3(interactionWidth,interactionHeight,interactionDepth)}`]);
  nodes.push(`[node name="InteractionArea" type="Area3D" parent="."]\neditor_description = "Stationary doorway interaction target. Remains targetable while the physical door leaf is open and its moving collider is disabled."\ncollision_layer = 4\ncollision_mask = 0`);
  nodes.push(`[node name="CollisionShape3D" type="CollisionShape3D" parent="InteractionArea"]\nposition = ${v3(0,interactionY,0)}\nshape = SubResource("DoorInteractionShape_GP")`);

  }

  const sceneNodes=options.collision===false?nodes.filter(n=>!/^\[node[^\n]*type="(?:StaticBody3D|AnimatableBody3D|CollisionShape3D|Area3D)"/.test(n)):nodes;
  const sceneResources=options.collision===false?resources.filter(r=>!/^\[sub_resource type="(?:BoxShape3D|ConvexPolygonShape3D|ConcavePolygonShape3D)"/.test(r)):resources;
  const loadSteps=sceneResources.length+1;
  return finalizeScene(`[gd_scene load_steps=${loadSteps} format=3]\n\n${sceneResources.join('\n\n')}\n\n${sceneNodes.join('\n\n')}\n`,options);
}

export function exportGodotTscn(building, options={collision:true, markers:true}, suppliedDoorScenes=null) {
  options={collision:true,markers:true,...options};
  assertValidBuilding(building);
  const profile=exportProfile(building,options);
  const floors=Array.isArray(building.floors)&&building.floors.length
    ? building.floors
    : [{id:'legacy_floor',label:'Floor 1',walls:building.walls||[],openings:building.openings||[],lights:building.lights||[],stairs:[]}];

  for(let fi=0;fi<floors.length;fi++){
    const view=floorView(building,floors[fi],fi===floors.length-1);
    const issues=validateOpeningLayout(view).filter(i=>i.type==='overlap'||i.type==='missing_wall');
    if(issues.length) throw new Error(`Floor ${fi+1}: ${issues[0].message}`);
  }

  const resources=[];
  const extResources=[];
  const nodes=[];
  let rid=0;
  const resId=prefix=>`${prefix}_${++rid}`;
  const addRes=(type,id,props)=>resources.push(`[sub_resource type="${type}" id="${id}"]\n${props.join('\n')}`);

  const matWall='Material_ExteriorWall', matExteriorInside='Material_ExteriorWallInside', matExteriorEdge='Material_ExteriorWallEdge';
  const matInteriorA='Material_InteriorWallA', matInteriorB='Material_InteriorWallB', matInteriorEdge='Material_InteriorWallEdge';
  const matFloorTop='Material_FloorTop', matFloorBottom='Material_FloorBottom', matFloorEdge='Material_FloorEdge';
  const matCeilingBottom='Material_CeilingBottom', matCeilingTop='Material_CeilingTop', matCeilingEdge='Material_CeilingEdge', matRoof='Material_Roof';
  const matWindowFrame='Material_WindowFrame', matWindowGlass='Material_WindowGlass', matStairs='Material_Stairs', matPlatform='Material_Platform', matPlatformSupport='Material_PlatformSupport', matRailing='Material_Railing';
  addRes('StandardMaterial3D',matWall,['albedo_color = Color(0.55, 0.50, 0.40, 1)','roughness = 0.9']);
  addRes('StandardMaterial3D',matExteriorInside,['albedo_color = Color(0.64, 0.61, 0.54, 1)','roughness = 0.95']);
  addRes('StandardMaterial3D',matExteriorEdge,['albedo_color = Color(0.58, 0.55, 0.49, 1)','roughness = 0.95']);
  addRes('StandardMaterial3D',matInteriorA,['albedo_color = Color(0.64, 0.61, 0.54, 1)','roughness = 0.95']);
  addRes('StandardMaterial3D',matInteriorB,['albedo_color = Color(0.64, 0.61, 0.54, 1)','roughness = 0.95']);
  addRes('StandardMaterial3D',matInteriorEdge,['albedo_color = Color(0.58, 0.55, 0.49, 1)','roughness = 0.95']);
  addRes('StandardMaterial3D',matFloorTop,['albedo_color = Color(0.32, 0.29, 0.23, 1)','roughness = 1.0']);
  addRes('StandardMaterial3D',matFloorBottom,['albedo_color = Color(0.70, 0.68, 0.61, 1)','roughness = 1.0']);
  addRes('StandardMaterial3D',matFloorEdge,['albedo_color = Color(0.42, 0.39, 0.33, 1)','roughness = 1.0']);
  addRes('StandardMaterial3D',matCeilingBottom,['albedo_color = Color(0.70, 0.68, 0.61, 1)','roughness = 1.0']);
  addRes('StandardMaterial3D',matCeilingTop,['albedo_color = Color(0.48, 0.46, 0.41, 1)','roughness = 1.0']);
  addRes('StandardMaterial3D',matCeilingEdge,['albedo_color = Color(0.58, 0.56, 0.51, 1)','roughness = 1.0']);
  addRes('StandardMaterial3D',matRoof,['albedo_color = Color(0.23, 0.18, 0.16, 1)','roughness = 0.95']);
  addRes('StandardMaterial3D',matWindowFrame,['albedo_color = Color(0.24, 0.20, 0.15, 1)','roughness = 0.88']);
  addRes('StandardMaterial3D',matWindowGlass,['transparency = 1','albedo_color = Color(0.30, 0.50, 0.58, 0.32)','roughness = 0.12']);
  addRes('StandardMaterial3D',matStairs,['albedo_color = Color(0.38, 0.31, 0.22, 1)','roughness = 0.95']);
  addRes('StandardMaterial3D',matPlatform,['albedo_color = Color(0.48, 0.41, 0.30, 1)','roughness = 0.97']);
  addRes('StandardMaterial3D',matPlatformSupport,['albedo_color = Color(0.37, 0.29, 0.20, 1)','roughness = 0.96']);
  addRes('StandardMaterial3D',matRailing,['albedo_color = Color(0.76, 0.70, 0.58, 1)','roughness = 0.9']);

  const doorScenes=suppliedDoorScenes||doorSceneDescriptors(building);
  for(const d of doorScenes) extResources.push(`[ext_resource type="PackedScene" path="${d.filename}" id="${d.extId}"]`);

  nodes.push(`[node name="${nodeClean(building.name)}" type="Node3D"]`);

  const addBoxNode=(parent,name,size,position,rotation,materialId,collisionParent=null)=>{
    const meshId=resId('BoxMesh');
    addRes('BoxMesh',meshId,[`material = SubResource("${materialId}")`,`size = ${v3(size.x,size.y,size.z)}`]);
    nodes.push(`[node name="${name}" type="MeshInstance3D" parent="${parent}"]\nposition = ${v3(position.x,position.y,position.z)}\nrotation = ${v3(rotation?.x||0,rotation?.y||0,rotation?.z||0)}\nmesh = SubResource("${meshId}")`);
    if(options.collision&&collisionParent){
      const shapeId=resId('BoxShape');
      addRes('BoxShape3D',shapeId,[`size = ${v3(size.x,size.y,size.z)}`]);
      nodes.push(`[node name="${name}_Collision" type="CollisionShape3D" parent="${collisionParent}"]\nposition = ${v3(position.x,position.y,position.z)}\nrotation = ${v3(rotation?.x||0,rotation?.y||0,rotation?.z||0)}\nshape = SubResource("${shapeId}")`);
    }
  };


  const addRoofBox=(parent,part,blockers,collisionParent)=>{
    const faces=trimRoofBox(part,blockers);
    if(faces===null){addBoxNode(parent,part.name,part.size,part.pos,part.rot,matRoof,collisionParent);return;}
    const mesh=meshWriter();
    for(const f of faces)mesh.face(f.points,f.uvs,f.normal);
    if(!mesh.vertices.length)return;
    const meshId=resId('RoofMesh'),res=arrayMeshResource(mesh,matRoof,meshId,'RoofFaces');
    if(!res)return;
    resources.push(res.text);
    nodes.push(`[node name="${part.name}" type="MeshInstance3D" parent="${parent}"]\nmesh = SubResource("${meshId}")`);
    if(options.collision&&collisionParent){
      const shapeId=resId('RoofShape');
      addRes('ConcavePolygonShape3D',shapeId,[`data = ${packedV3(mesh.vertices)}`,'backface_collision = true']);
      nodes.push(`[node name="${part.name}_Collision" type="CollisionShape3D" parent="${collisionParent}"]\nshape = SubResource("${shapeId}")`);
    }
  };


  const addClippedGableCollision=(parent,name,data)=>{
    if(!options.collision)return;const points=Object.values(data).flatMap(m=>m.vertices);if(!points.length)return;
    const shapeId=resId('GableShape');addRes('ConcavePolygonShape3D',shapeId,[`data = ${packedV3(points)}`,'backface_collision = true']);nodes.push(`[node name="${name}_Trimmed" type="CollisionShape3D" parent="${parent}"]\nshape = SubResource("${shapeId}")`);
  };
  const addGableCollision=(parent,name,rs,baseY,ridgeY,thickness)=>{
    const dir=rs.direction==='z'?'z':'x';
    const w=rs.maxX-rs.minX,d=rs.maxZ-rs.minZ,h=ridgeY-baseY;
    const ends=rs.gableEnds||'both';
    for(const side of ['min','max']){
      if(ends==='none'||(ends!=='both'&&ends!==side)||rs[side==='min'?'suppressMin':'suppressMax'])continue;
      const position={x:dir==='x'?rs[side==='min'?'minX':'maxX']:(rs.minX+rs.maxX)/2,
        y:baseY+h/2,z:dir==='z'?rs[side==='min'?'minZ':'maxZ']:(rs.minZ+rs.maxZ)/2};
      addPrismCollision(parent,name+'_'+side,{x:dir==='x'?d:w,y:h,z:thickness},position,{y:dir==='x'?Math.PI/2:0});
    }
  };

  const overlap1D=(a0,a1,b0,b1)=>Math.min(a1,b1)-Math.max(a0,b0)>EPS;
  const coveredPlatformSupportsForView=(view,plat)=>{
    if(!rectValid(plat) || plat.covered===false) return {sides:[],posts:[]};
    const rects=structuralFloorRectangles(view);
    const touching={
      west: rects.some(r=>Math.abs(r.maxX-plat.minX)<EPS && overlap1D(r.minZ,r.maxZ,plat.minZ,plat.maxZ)),
      east: rects.some(r=>Math.abs(r.minX-plat.maxX)<EPS && overlap1D(r.minZ,r.maxZ,plat.minZ,plat.maxZ)),
      north: rects.some(r=>Math.abs(r.maxZ-plat.minZ)<EPS && overlap1D(r.minX,r.maxX,plat.minX,plat.maxX)),
      south: rects.some(r=>Math.abs(r.minZ-plat.maxZ)<EPS && overlap1D(r.minX,r.maxX,plat.minX,plat.maxX)),
    };
    const sides=[];
    if(!touching.west) sides.push({axis:'z',x:plat.minX,z0:plat.minZ,z1:plat.maxZ});
    if(!touching.east) sides.push({axis:'z',x:plat.maxX,z0:plat.minZ,z1:plat.maxZ});
    if(!touching.north) sides.push({axis:'x',z:plat.minZ,x0:plat.minX,x1:plat.maxX});
    if(!touching.south) sides.push({axis:'x',z:plat.maxZ,x0:plat.minX,x1:plat.maxX});
    const posts=[];const seen=new Set();
    const addPost=(x,z)=>{const k=`${x.toFixed(4)},${z.toFixed(4)}`; if(seen.has(k)) return; seen.add(k); posts.push({x,z});};
    for(const s of sides){
      if(s.axis==='x'){ const len=Math.max(0,s.x1-s.x0),count=Math.max(2,Math.ceil(len/2.4)+1); for(let i=0;i<count;i++){const t=count===1?0:i/(count-1); addPost(s.x0+(s.x1-s.x0)*t,s.z);} }
      else { const len=Math.max(0,s.z1-s.z0),count=Math.max(2,Math.ceil(len/2.4)+1); for(let i=0;i<count;i++){const t=count===1?0:i/(count-1); addPost(s.x,s.z0+(s.z1-s.z0)*t);} }
    }
    return {sides,posts};
  };

  const addPrismCollision=(parent,name,size,position,rotation)=>{
    if(!options.collision)return;
    const hx=size.x/2,hy=size.y/2,hz=size.z/2;
    const shapeId=resId('ConvexShape');
    addRes('ConvexPolygonShape3D',shapeId,[`points = ${packedV3([
      {x:-hx,y:-hy,z:-hz},{x:hx,y:-hy,z:-hz},{x:0,y:hy,z:-hz},
      {x:-hx,y:-hy,z:hz},{x:hx,y:-hy,z:hz},{x:0,y:hy,z:hz}
    ])}`]);
    nodes.push(`[node name="${name}" type="CollisionShape3D" parent="${parent}"]\nposition = ${v3(position.x,position.y,position.z)}\nrotation = ${v3(rotation?.x||0,rotation?.y||0,rotation?.z||0)}\nshape = SubResource("${shapeId}")`);
  };

  for(let fi=0;fi<floors.length;fi++){
    const floor=floors[fi];
    const topFloor=fi===floors.length-1;
    const floorRoofSections=building.roof?.type!=='none'?roofSectionsForFloor(building,fi):[];
    const view=floorView(building,floor,floorRoofSections.length>0);
    view.roofSections=floorRoofSections;
    // Floor nodes are spaced by wall height + the default slab thickness. On
    // upper floors, cover the visible slab edge with exterior facade. If this
    // story uses a thicker manual floor at the same elevation, extend the skirt
    // far enough to cover that manual slab too.
    const storyTopY=floorElevation(building,fi),surfaceTol=Math.max(.05,(Number(view.floorThickness)||.18)*.6);
    const manualStoryFloorThickness=Math.max(0,...(building.manualFloors||[]).filter(r=>rectValid(r)&&Math.abs((Number(r.topY)||0)-storyTopY)<=surfaceTol).map(r=>Math.max(.01,Number(r.thickness)||0)));
    const automaticStoryFloorThickness=view.autoFloor!==false?Math.max(.01,Number(view.floorThickness)||.18):0;
    view.storyFloorSkirt=fi>0?Math.max(Number(view.floorThickness)||.18,automaticStoryFloorThickness,manualStoryFloorThickness):0;
    // Keep the old name as a compatibility alias for older helper code/tests.
    view.exteriorFloorSkirt=view.storyFloorSkirt;
    const exposedCeilingRects=exposedStructuralFloorRectangles(building,fi);
    const fn=String(fi+1).padStart(2,'0');
    const prefix=`F${fn}_`;
    const floorName=`Floor_${fn}`;
    const elevation=floorElevation(building,fi);
    view._roofSource=building;view._roofOrigin=elevation;
    const exteriorWalls=view.walls.filter(w=>isExteriorWall(view,w));
    const interiorWalls=view.walls.filter(w=>!isExteriorWall(view,w));

    nodes.push(`[node name="${floorName}" type="Node3D" parent="."]${elevation?`\nposition = ${v3(0,elevation,0)}`:''}\neditor_description = "${(floor.label||`Floor ${fi+1}`).replace(/"/g,'')}; elevation ${fmt(elevation)}m"`);
    // Editor metadata only: no region meshes, scripts, or gameplay markers.
    if(floor.regions?.length) nodes[nodes.length-1]+='\nmetadata/building_regions = '+JSON.stringify(floor.regions.map(r=>({id:r.id,label:r.label||'Region',kind:r.kind||'room',effect:r.effect||'label',minX:r.minX,maxX:r.maxX,minZ:r.minZ,maxZ:r.maxZ,...(r.polygon?{polygon:r.polygon}:{} )})));

    nodes.push(`[node name="Geometry" type="Node3D" parent="${floorName}"]`);
    nodes.push(`[node name="Walls" type="Node3D" parent="${floorName}/Geometry"]`);
    if(options.collision) nodes.push(`[node name="Collision" type="StaticBody3D" parent="${floorName}"]`);
    if(options.markers) nodes.push(`[node name="Openings" type="Node3D" parent="${floorName}"]`);
    // Authored references always export; options.markers controls only the
    // generated opening helpers. Notes are intentionally JSON-only.
    if(floor.markers?.length){
      nodes.push(`[node name="Markers" type="Node3D" parent="${floorName}"]`);
      floor.markers.forEach((marker,i)=>{
        const markerName=`Marker_${String(i+1).padStart(3,'0')}_${nodeClean(marker.label)}`,p=marker.position;
        nodes.push(`[node name="${markerName}" type="Marker3D" parent="${floorName}/Markers"]\nposition = ${v3(p.x,p.y,p.z)}\nmetadata/building_marker_id = ${JSON.stringify(marker.id||'')}\nmetadata/building_marker_name = ${JSON.stringify(marker.label)}`);
      });
    }

    const exteriorResources=exteriorWalls.length?exteriorArrayMeshResources(view,matWall,matExteriorInside,matExteriorEdge,prefix):null;
    const interiorResources=interiorWalls.length?interiorArrayMeshResources(view,matInteriorA,matInteriorB,matInteriorEdge,prefix):null;
    if(exteriorResources){
      if(exteriorResources.outside)resources.push(exteriorResources.outside.text);
      if(exteriorResources.inside)resources.push(exteriorResources.inside.text);
      if(exteriorResources.edges)resources.push(exteriorResources.edges.text);
      nodes.push(`[node name="ExteriorWalls" type="Node3D" parent="${floorName}/Geometry/Walls"]`);
      if(exteriorResources.outside)nodes.push(`[node name="OutsideFaces" type="MeshInstance3D" parent="${floorName}/Geometry/Walls/ExteriorWalls"]\nmesh = SubResource("${exteriorResources.ids.outside}")\neditor_description = "Outward-facing exterior faces."`);
      if(exteriorResources.inside)nodes.push(`[node name="InsideFaces" type="MeshInstance3D" parent="${floorName}/Geometry/Walls/ExteriorWalls"]\nmesh = SubResource("${exteriorResources.ids.inside}")\neditor_description = "Inward-facing faces of the exterior shell."`);
      if(exteriorResources.edges)nodes.push(`[node name="EdgeFaces" type="MeshInstance3D" parent="${floorName}/Geometry/Walls/ExteriorWalls"]\nmesh = SubResource("${exteriorResources.ids.edges}")\neditor_description = "Window/door reveals and wall-thickness faces."`);
    }
    if(interiorResources){
      if(interiorResources.sideA)resources.push(interiorResources.sideA.text);
      if(interiorResources.sideB)resources.push(interiorResources.sideB.text);
      if(interiorResources.edges)resources.push(interiorResources.edges.text);
      nodes.push(`[node name="InteriorWalls" type="Node3D" parent="${floorName}/Geometry/Walls"]`);
      if(interiorResources.sideA)nodes.push(`[node name="SideAFaces" type="MeshInstance3D" parent="${floorName}/Geometry/Walls/InteriorWalls"]
mesh = SubResource("${interiorResources.ids.sideA}")
editor_description = "One face direction of the baked interior walls."`);
      if(interiorResources.sideB)nodes.push(`[node name="SideBFaces" type="MeshInstance3D" parent="${floorName}/Geometry/Walls/InteriorWalls"]
mesh = SubResource("${interiorResources.ids.sideB}")
editor_description = "Opposite face direction of the baked interior walls."`);
      if(interiorResources.edges)nodes.push(`[node name="EdgeFaces" type="MeshInstance3D" parent="${floorName}/Geometry/Walls/InteriorWalls"]
mesh = SubResource("${interiorResources.ids.edges}")
editor_description = "Interior wall tops, bottoms, jambs, and exposed ends."`);
    }

    const windowCfg=building.windowMesh||{enabled:true};
    const windows=windowCfg.enabled?view.openings.filter(o=>o.type==='window'&&o.windowStyle!=='empty'&&findWall(view,o.wallId)):[];
    if(windows.length)nodes.push(`[node name="Windows" type="Node3D" parent="${floorName}/Geometry"]`);
    for(let wi=0;wi<windows.length;wi++){
      const opening=windows[wi], safe=constrainedOpening(view,opening);
      const resourceId=`${prefix}WindowMesh_${String(wi+1).padStart(3,'0')}`;
      const resource=windowArrayMeshResource(view,safe,matWindowFrame,matWindowGlass,resourceId);
      if(!resource)continue;
      resources.push(resource.text);
      const wall=findWall(view,safe.wallId),p=openingAnchor(view,safe),L=wallLength(wall),rotY=L>EPS?-Math.atan2(wall.b.z-wall.a.z,wall.b.x-wall.a.x):0;
      const y=safe.sill+safe.height/2;
      const name=`Window_${String(wi+1).padStart(3,'0')}${safe.label?'_'+nodeClean(safe.label):''}`;
      nodes.push(`[node name="${name}" type="MeshInstance3D" parent="${floorName}/Geometry/Windows"]\nposition = ${v3(p.x,y,p.z)}\nrotation = ${v3(0,rotY,0)}\nmesh = SubResource("${resourceId}")`);
      if(options.collision){
        const shapeId=resId('WindowShape'),depth=Math.max(.02,Math.min(resource.data.frameDepth,building.wallThickness||resource.data.frameDepth));
        addRes('BoxShape3D',shapeId,[`size = ${v3(resource.data.width,resource.data.height,depth)}`]);
        nodes.push(`[node name="${name}_Collision" type="CollisionShape3D" parent="${floorName}/Collision" groups=["${profile.windowGroup}"]]\nposition = ${v3(p.x,y,p.z)}\nrotation = ${v3(0,rotY,0)}\nshape = SubResource("${shapeId}")`);
      }
    }

    const floorDoors=doorScenes.filter(d=>d.floorIndex===fi);
    if(floorDoors.length)nodes.push(`[node name="Doors" type="Node3D" parent="${floorName}/Geometry"]`);
    for(const d of floorDoors){
      const safe=constrainedOpening(view,d.opening),wall=findWall(view,safe.wallId);if(!wall)continue;
      const p=openingAnchor(view,safe),L=wallLength(wall),rotY=L>EPS?-Math.atan2(wall.b.z-wall.a.z,wall.b.x-wall.a.x):0;
      const name=`Door_${d.number}${safe.label?'_'+nodeClean(safe.label):''}`;
      nodes.push(`[node name="${name}" parent="${floorName}/Geometry/Doors" instance=ExtResource("${d.extId}")]\nposition = ${v3(p.x,0,p.z)}\nrotation = ${v3(0,rotY,0)}`);
    }

    const lights=Array.isArray(floor.lights)?floor.lights:[];
    if(lights.length)nodes.push(`[node name="Lights" type="Node3D" parent="${floorName}"]`);
    for(let li=0;li<lights.length;li++){
      const light=lights[li]||{},pos=light.position||{x:0,y:2.2,z:0},c=light.color||{r:1,g:.65,b:.34,a:1};
      const energy=Math.max(0,Number.isFinite(Number(light.energy))?Number(light.energy):2.35),range=Math.max(.1,Number.isFinite(Number(light.range))?Number(light.range):8);
      const shadows=typeof light.shadows==='boolean'?light.shadows:true,group=lightGroupFor(light,profile);
      const name=`Light_${String(li+1).padStart(3,'0')}_${nodeClean(light.label||'Light')}`;
      nodes.push(`[node name="${name}" type="OmniLight3D" parent="${floorName}/Lights" groups=["${group}"]]\nposition = ${v3(Number(pos.x)||0,Number(pos.y)||0,Number(pos.z)||0)}\nlight_color = Color(${fmt(c.r??1)}, ${fmt(c.g??.65)}, ${fmt(c.b??.34)}, ${fmt(c.a??1)})\nlight_energy = ${fmt(energy)}\nshadow_enabled = ${shadows?'true':'false'}\nomni_range = ${Number.isInteger(range)?range.toFixed(1):fmt(range)}`);
    }

    if(options.collision){
      let ic=0,ec=0;
      if(hasProfileWalls(view)){
        const data=buildProfileMeshData(view),points=Object.values(data).flatMap(m=>m.vertices);
        if(points.length){const shapeId=resId('ProfileWallShape');addRes('ConcavePolygonShape3D',shapeId,[`data = ${packedV3(points)}`,'backface_collision = true']);nodes.push(`[node name="ShapedWallCollision" type="CollisionShape3D" parent="${floorName}/Collision"]\nshape = SubResource("${shapeId}")`);}
      }
      for(const box of hasProfileWalls(view)?[]:buildMergedWallCollisionBoxes(view)){
        const shapeId=resId('BoxShape');addRes('BoxShape3D',shapeId,[`size = ${v3(box.size.x,box.size.y,box.size.z)}`]);
        const name=box.exterior?`ExteriorCollision_${String(++ec).padStart(3,'0')}`:`WallCollision_${String(++ic).padStart(3,'0')}`;
        nodes.push(`[node name="${name}" type="CollisionShape3D" parent="${floorName}/Collision"]\nposition = ${v3(box.position.x,box.position.y,box.position.z)}\nrotation = ${v3(box.rotation.x,box.rotation.y,box.rotation.z)}\nshape = SubResource("${shapeId}")`);
      }
    }

    const bounds=boundsOfBuilding(view),structureBounds=boundsOfStructuralFloor(view),autoRoofBounds=boundsOfAutomaticRoof(view),cx=(bounds.minX+bounds.maxX)/2,cz=(bounds.minZ+bounds.maxZ)/2;
    if((view.walls.length||(view.slabs||[]).some(rectValid)||(view.regions||[]).some(r=>r.effect==='solid'&&rectValid(r)))&&structureBounds.width>.05&&structureBounds.depth>.05){
      const belowStairs=fi>0?(floors[fi-1].stairs||[]):[];
      const surfaceTol=Math.max(.05,(Number(view.floorThickness)||.18)*.6);
      if(view.autoFloor!==false){
        const manualFloorOverrides=manualFloorRectanglesAtLevel(building,elevation,surfaceTol);
        const floorRects=subtractRectAreas(floorRectanglesForView(view,belowStairs),manualFloorOverrides);
        const floorFaces=buildSlabFaceMeshData(floorRects,view.floorThickness,0);
        const floorMeshId=`${prefix}FloorMesh`;
        const floorRes=multiSurfaceArrayMeshResource([
          {mesh:floorFaces.top,materialId:matFloorTop,surfaceName:'TopFaces'},
          {mesh:floorFaces.bottom,materialId:matFloorBottom,surfaceName:'BottomFaces'},
          {mesh:floorFaces.edges,materialId:matFloorEdge,surfaceName:'EdgeFaces'}
        ],floorMeshId);
        if(floorRes)resources.push(floorRes.text);
        if(floorRes)nodes.push(`[node name="FloorSlab" type="MeshInstance3D" parent="${floorName}/Geometry"]
mesh = SubResource("${floorMeshId}")
editor_description = "Automatic floor mesh after independent manual-floor overrides. Surfaces: TopFaces, BottomFaces, EdgeFaces."`);
        if(options.collision){
          for(let pi=0;pi<floorRects.length;pi++){
            if(floorRects[pi].polygon){
              const shapeId=resId('FloorShape'),points=areaPoints(floorRects[pi]).flatMap(p=>[{...p,y:0},{...p,y:(0)-(view.floorThickness)}]);
              addRes('ConvexPolygonShape3D',shapeId,[`points = ${packedV3(points)}`]);
              nodes.push(`[node name="FloorCollision_${String(pi+1).padStart(3,'0')}" type="CollisionShape3D" parent="${floorName}/Collision"]\nshape = SubResource("${shapeId}")`);continue;
            }
            const r=floorRects[pi],w=r.maxX-r.minX,d=r.maxZ-r.minZ,px=(r.minX+r.maxX)/2,pz=(r.minZ+r.maxZ)/2,shapeId=resId('FloorShape');
            addRes('BoxShape3D',shapeId,[`size = ${v3(w,view.floorThickness,d)}`]);
            nodes.push(`[node name="FloorCollision_${String(pi+1).padStart(3,'0')}" type="CollisionShape3D" parent="${floorName}/Collision"]
position = ${v3(px,-view.floorThickness/2,pz)}
shape = SubResource("${shapeId}")`);
          }
        }
      }

      // Only exposed parts of a story receive an automatic ceiling. Manual
      // ceilings at the same absolute top height replace the overlapping area.
      const ceiling=building.ceiling||{thickness:.12};
      if(view.autoCeiling!==false&&exposedCeilingRects.length){
        const t=Math.max(.02,Number(ceiling.thickness)||.12),ceilingTopAbs=elevation+view.wallHeight;
        const manualCeilingOverrides=manualCeilingRectanglesAtLevel(building,ceilingTopAbs,Math.max(.05,t*.6));
        const ceilingRects=subtractRectAreas(exposedCeilingRects,manualCeilingOverrides);
        const ceilingFaces=buildSlabFaceMeshData(ceilingRects,t,view.wallHeight);
        const ceilingMeshId=`${prefix}CeilingMesh`;
        const ceilingRes=multiSurfaceArrayMeshResource([
          {mesh:ceilingFaces.bottom,materialId:matCeilingBottom,surfaceName:'RoomFaces'},
          {mesh:ceilingFaces.top,materialId:matCeilingTop,surfaceName:'RoofSideFaces'},
          {mesh:ceilingFaces.edges,materialId:matCeilingEdge,surfaceName:'EdgeFaces'}
        ],ceilingMeshId);
        if(ceilingRes)resources.push(ceilingRes.text);
        if(ceilingRes)nodes.push(`[node name="Ceiling" type="MeshInstance3D" parent="${floorName}/Geometry"]
mesh = SubResource("${ceilingMeshId}")
editor_description = "Automatic ceiling mesh after independent manual-ceiling overrides. Surfaces: RoomFaces, RoofSideFaces, EdgeFaces."`);
        if(options.collision){
          for(let pi=0;pi<ceilingRects.length;pi++){
            if(ceilingRects[pi].polygon){
              const shapeId=resId('CeilingShape'),points=areaPoints(ceilingRects[pi]).flatMap(p=>[{...p,y:view.wallHeight},{...p,y:(view.wallHeight)-(t)}]);
              addRes('ConvexPolygonShape3D',shapeId,[`points = ${packedV3(points)}`]);
              nodes.push(`[node name="CeilingCollision_${String(pi+1).padStart(3,'0')}" type="CollisionShape3D" parent="${floorName}/Collision"]\nshape = SubResource("${shapeId}")`);continue;
            }
            const r=ceilingRects[pi],w=r.maxX-r.minX,d=r.maxZ-r.minZ,px=(r.minX+r.maxX)/2,pz=(r.minZ+r.maxZ)/2,shapeId=resId('CeilingShape');
            addRes('BoxShape3D',shapeId,[`size = ${v3(w,t,d)}`]);
            nodes.push(`[node name="CeilingCollision_${String(pi+1).padStart(3,'0')}" type="CollisionShape3D" parent="${floorName}/Collision"]
position = ${v3(px,view.wallHeight-t/2,pz)}
shape = SubResource("${shapeId}")`);
          }
        }
      }
    }


    const platforms=Array.isArray(floor.platforms)?floor.platforms.filter(rectValid):[];
    if(platforms.length) nodes.push(`[node name="Platforms" type="Node3D" parent="${floorName}/Geometry"]`);
    for(let pi=0;pi<platforms.length;pi++){
      const plat=platforms[pi];
      const meshId=`${prefix}PlatformMesh_${String(pi+1).padStart(3,'0')}`;
      const faces=buildSlabFaceMeshData([plat],view.floorThickness,Number(plat.height)||0);
      const res=multiSurfaceArrayMeshResource([
        {mesh:faces.top,materialId:matPlatform,surfaceName:'TopFaces'},
        {mesh:faces.bottom,materialId:matFloorBottom,surfaceName:'BottomFaces'},
        {mesh:faces.edges,materialId:matFloorEdge,surfaceName:'EdgeFaces'}
      ],meshId);
      if(res) resources.push(res.text);
      const name=`${plat.kind==='deck'?'Deck':'Porch'}_${String(pi+1).padStart(3,'0')}${plat.label?'_'+nodeClean(plat.label):''}`;
      if(res) nodes.push(`[node name="${name}" type="MeshInstance3D" parent="${floorName}/Geometry/Platforms"]
mesh = SubResource("${meshId}")`);
      if(options.collision){
        const shapeId=resId('PlatformShape');
        addRes('BoxShape3D',shapeId,[`size = ${v3(plat.maxX-plat.minX,view.floorThickness,plat.maxZ-plat.minZ)}`]);
        nodes.push(`[node name="${name}_Collision" type="CollisionShape3D" parent="${floorName}/Collision"]
position = ${v3((plat.minX+plat.maxX)/2,(Number(plat.height)||0)-view.floorThickness/2,(plat.minZ+plat.maxZ)/2)}
shape = SubResource("${shapeId}")`);
      }
      const support=coveredPlatformSupportsForView(view,plat);
      if((support.posts||[]).length || (support.sides||[]).length){
        const supportParent=`${floorName}/Geometry/Platforms`;
        const topY=Number(plat.height)||0, postTop=view.wallHeight, postH=Math.max(0.2, postTop-topY), beamY=postTop-0.08;
        for(let si=0;si<support.posts.length;si++){
          const pt=support.posts[si];
          addBoxNode(supportParent,`${name}_Post_${String(si+1).padStart(3,'0')}`,{x:0.12,y:postH,z:0.12},{x:pt.x,y:topY+postH/2,z:pt.z},{x:0,y:0,z:0},matPlatformSupport,options.collision?`${floorName}/Collision`:null);
        }
        for(let si=0;si<support.sides.length;si++){
          const side=support.sides[si];
          if(side.axis==='x'){
            const len=side.x1-side.x0; if(len<=0.05) continue;
            addBoxNode(supportParent,`${name}_Beam_${String(si+1).padStart(3,'0')}`,{x:len+0.12,y:0.16,z:0.12},{x:(side.x0+side.x1)/2,y:beamY,z:side.z},{x:0,y:0,z:0},matPlatformSupport,options.collision?`${floorName}/Collision`:null);
          } else {
            const len=side.z1-side.z0; if(len<=0.05) continue;
            addBoxNode(supportParent,`${name}_Beam_${String(si+1).padStart(3,'0')}`,{x:0.12,y:0.16,z:len+0.12},{x:side.x,y:beamY,z:(side.z0+side.z1)/2},{x:0,y:0,z:0},matPlatformSupport,options.collision?`${floorName}/Collision`:null);
          }
        }
      }
    }

    const railings=Array.isArray(floor.railings)?floor.railings:[];
    if(railings.length) nodes.push(`[node name="Railings" type="Node3D" parent="${floorName}/Geometry"]`);
    for(let ri=0;ri<railings.length;ri++){
      const rail=railings[ri],len=Math.hypot(rail.b.x-rail.a.x, rail.b.z-rail.a.z); if(len<=EPS) continue;
      const railingData=buildRailingMeshData(rail); if(!railingData) continue;
      const mesh=railingData.mesh;
      const meshId=`${prefix}RailingMesh_${String(ri+1).padStart(3,'0')}`;
      const res=arrayMeshResource(mesh,matRailing,meshId,'Railing'); if(res) resources.push(res.text);
      const cx=(rail.a.x+rail.b.x)/2, cz=(rail.a.z+rail.b.z)/2, yaw=-Math.atan2(rail.b.z-rail.a.z, rail.b.x-rail.a.x);
      const name=`Railing_${String(ri+1).padStart(3,'0')}${rail.label?'_'+nodeClean(rail.label):''}`;
      if(res) nodes.push(`[node name="${name}" type="MeshInstance3D" parent="${floorName}/Geometry/Railings"]
position = ${v3(cx,0,cz)}
rotation = ${v3(0,yaw,0)}
mesh = SubResource("${meshId}")`);
      if(options.collision){
        const shapeId=resId('RailingShape');
        addRes('BoxShape3D',shapeId,[`size = ${v3(len, Math.max(0.4, Number(rail.height)||1), 0.12)}`]);
        nodes.push(`[node name="${name}_Collision" type="CollisionShape3D" parent="${floorName}/Collision"]
position = ${v3(cx,Math.max(0.4, Number(rail.height)||1)/2,cz)}
rotation = ${v3(0,yaw,0)}
shape = SubResource("${shapeId}")`);
      }
    }

    const stairs=Array.isArray(floor.stairs)?floor.stairs:[];
    if(stairs.length)nodes.push(`[node name="Stairs" type="Node3D" parent="${floorName}/Geometry"]`);
    for(let si=0;si<stairs.length;si++){
      const stair=stairs[si],data=buildStairMeshData(view,stair),sid=`${prefix}StairMesh_${String(si+1).padStart(3,'0')}`;
      const stairRes=arrayMeshResource(data.mesh,matStairs,sid,data.style==='steps'?'Steps':'Ramp');if(stairRes)resources.push(stairRes.text);
      const blockerId=`${prefix}UnderStairMesh_${String(si+1).padStart(3,'0')}`;
      const blockerRes=data.blockerMesh?arrayMeshResource(data.blockerMesh,matStairs,blockerId,'UnderStairFill'):null;if(blockerRes)resources.push(blockerRes.text);
      const name=`Staircase_${String(si+1).padStart(3,'0')}${stair.label?'_'+nodeClean(stair.label):''}`,yaw=stairYaw(stair.direction);
      nodes.push(`[node name="${name}" type="Node3D" parent="${floorName}/Geometry/Stairs"]
position = ${v3(Number(stair.x)||0,0,Number(stair.z)||0)}
rotation = ${v3(0,yaw,0)}`);
      if(stairRes)nodes.push(`[node name="${data.style==='steps'?'Steps':'RampMesh'}" type="MeshInstance3D" parent="${floorName}/Geometry/Stairs/${name}"]
mesh = SubResource("${sid}")
editor_description = "${data.style==='steps'?`Visible ${data.steps}-step staircase with smooth ramp walking collision.`:'Thin smooth ramp slab with matching walking collision.'}"`);
      if(blockerRes)nodes.push(`[node name="UnderStairBlockerMesh" type="MeshInstance3D" parent="${floorName}/Geometry/Stairs/${name}"]
mesh = SubResource("${blockerId}")
editor_description = "Visible fill closing the space beneath this ${data.style==='steps'?'staircase':'ramp'}."`);
      if(options.collision){
        const rampShapeId=resId('StairRampShape');
        addRes('BoxShape3D',rampShapeId,[`size = ${v3(data.width,data.rampThickness,data.slope)}`]);
        nodes.push(`[node name="WalkableRamp" type="StaticBody3D" parent="${floorName}/Geometry/Stairs/${name}"]
collision_layer = 1
collision_mask = ${profile.bodyMask}`);
        nodes.push(`[node name="CollisionShape3D" type="CollisionShape3D" parent="${floorName}/Geometry/Stairs/${name}/WalkableRamp"]
position = ${v3(data.rampCenter.x,data.rampCenter.y,data.rampCenter.z)}
rotation = ${v3(data.angle,0,0)}
shape = SubResource("${rampShapeId}")`);
        if(data.blockBelow){
          const blockerShapeId=resId('UnderStairShape'),hw=data.width/2,hr=data.run/2;
          addRes('ConvexPolygonShape3D',blockerShapeId,[`points = ${packedV3([
            {x:-hw,y:0,z:hr},{x:hw,y:0,z:hr},{x:-hw,y:0,z:-hr},{x:hw,y:0,z:-hr},
            {x:-hw,y:data.blockerRise,z:-hr},{x:hw,y:data.blockerRise,z:-hr}
          ])}`]);
          nodes.push(`[node name="UnderStairBlocker" type="StaticBody3D" parent="${floorName}/Geometry/Stairs/${name}"]
collision_layer = 1
collision_mask = ${profile.bodyMask}`);
          nodes.push(`[node name="CollisionShape3D" type="CollisionShape3D" parent="${floorName}/Geometry/Stairs/${name}/UnderStairBlocker"]
shape = SubResource("${blockerShapeId}")`);
        }
      }
    }

    if(options.markers){
      let oi=0;
      for(const raw of view.openings){
        const safe=constrainedOpening(view,raw),wall=findWall(view,safe.wallId);if(!wall)continue;
        const p=openingAnchor(view,safe),L=wallLength(wall),rotY=L>EPS?-Math.atan2(wall.b.z-wall.a.z,wall.b.x-wall.a.x):0;
        const y=safe.type==='door'?safe.height/2:safe.sill+safe.height/2;
        const name=`${safe.type==='door'?'Door':'Window'}_${String(++oi).padStart(3,'0')}${safe.label?'_'+nodeClean(safe.label):''}`;
        nodes.push(`[node name="${name}" type="Marker3D" parent="${floorName}/Openings"]\nposition = ${v3(p.x,y,p.z)}\nrotation = ${v3(0,rotY,0)}`);
      }
    }

    if(building.roof?.type!=='none'&&floorRoofSections.length){
      nodes.push(`[node name="Roof" type="Node3D" parent="${floorName}/Geometry"]`);
      const roofSections=floorRoofSections;
      for(let rsi=0;rsi<roofSections.length;rsi++){
        const rs=roofSections[rsi],dir=rs.direction||'x',type=rs.type||building.roof.type;
        const parts=roofBoxParts(rs,building.roof,view.wallHeight,rsi);
        if(!parts.length)continue;
        if(type==='gable'&&exteriorWalls.length){
          const rise=(dir==='x'?rs.maxZ-rs.minZ:rs.maxX-rs.minX)/2*Math.tan((Number(rs.pitch)||building.roof.pitch||35)*Math.PI/180);
          const gables=trimmedGableEnds({...rs,pitch:Number(rs.pitch)||building.roof.pitch||35},view.wallHeight,building.wallThickness,roofInteriorBlockers(building,rs,elevation+view.wallHeight,elevation));
          if(gables)addClippedGableCollision(`${floorName}/Collision`,`GableCollision_${rsi+1}`,buildTrimmedGableMeshData(gables));
          else addGableCollision(`${floorName}/Collision`,`GableCollision_${rsi+1}`,rs,view.wallHeight,view.wallHeight+rise,building.wallThickness);
        }
        const blockers=roofInteriorBlockers(building,rs,elevation+view.wallHeight,elevation);
        for(const part of parts)addRoofBox(`${floorName}/Geometry/Roof`,part,blockers,options.collision?`${floorName}/Collision`:null);
      }
    }
  }

  // Independent floor and ceiling slabs use absolute world heights, just like
  // manual roofs. They are not owned by Floor_XX and can span any footprint.
  const exportManualSlabs=(list,kind)=>{
    const items=(list||[]).filter(rectValid);if(!items.length)return;
    const isCeiling=kind==='ceiling',nodeName=isCeiling?'ManualCeilings':'ManualFloors',collisionName=isCeiling?'ManualCeilingCollision':'ManualFloorCollision';
    nodes.push(`[node name="${nodeName}" type="Node3D" parent="."]
editor_description = "Independent ${kind} slabs with absolute top heights; not owned by floors."`);
    if(options.collision)nodes.push(`[node name="${collisionName}" type="StaticBody3D" parent="."]`);
    for(let si=0;si<items.length;si++){
      const s=items[si],idx=String(si+1).padStart(3,'0'),t=Math.max(.01,Number(s.thickness)||(isCeiling?Number(building.ceiling?.thickness)||.12:Number(building.floorThickness)||.18)),topY=Number(s.topY)||0;
      const meshId=`${isCeiling?'ManualCeiling':'ManualFloor'}Mesh_${idx}`,faces=buildSlabFaceMeshData([s],t,topY);
      const res=multiSurfaceArrayMeshResource(isCeiling?[
        {mesh:faces.bottom,materialId:matCeilingBottom,surfaceName:'RoomFaces'},
        {mesh:faces.top,materialId:matCeilingTop,surfaceName:'TopFaces'},
        {mesh:faces.edges,materialId:matCeilingEdge,surfaceName:'EdgeFaces'}
      ]:[
        {mesh:faces.top,materialId:matFloorTop,surfaceName:'TopFaces'},
        {mesh:faces.bottom,materialId:matFloorBottom,surfaceName:'BottomFaces'},
        {mesh:faces.edges,materialId:matFloorEdge,surfaceName:'EdgeFaces'}
      ],meshId);
      if(res){resources.push(res.text);nodes.push(`[node name="${isCeiling?'ManualCeiling':'ManualFloor'}_${idx}${s.label?'_'+nodeClean(s.label):''}" type="MeshInstance3D" parent="${nodeName}"]
mesh = SubResource("${meshId}")`);}
      if(options.collision){const w=s.maxX-s.minX,d=s.maxZ-s.minZ,shapeId=resId(isCeiling?'ManualCeilingShape':'ManualFloorShape');addRes('BoxShape3D',shapeId,[`size = ${v3(w,t,d)}`]);nodes.push(`[node name="${isCeiling?'ManualCeiling':'ManualFloor'}Collision_${idx}" type="CollisionShape3D" parent="${collisionName}"]
position = ${v3((s.minX+s.maxX)/2,topY-t/2,(s.minZ+s.maxZ)/2)}
shape = SubResource("${shapeId}")`);}
    }
  };
  exportManualSlabs(building.manualFloors,'floor');
  exportManualSlabs(building.manualCeilings,'ceiling');

  // Manual roofs are building-level objects with their own absolute base height.
  // They intentionally live outside Floor_XX so a roof can cover any footprint
  // at any height without being repositioned by floor ownership.
  const manualRoofs=(building.roofSections||[]).filter(rectValid);
  if(manualRoofs.length){
    nodes.push(`[node name="ManualRoofs" type="Node3D" parent="."]\neditor_description = "Independent roof footprints with absolute base heights; not owned by floors."`);
    if(options.collision)nodes.push(`[node name="ManualRoofCollision" type="StaticBody3D" parent="."]`);
    for(let ri=0;ri<manualRoofs.length;ri++){
      const rs=manualRoofs[ri],idx=String(ri+1).padStart(3,'0'),cx=(rs.minX+rs.maxX)/2,cz=(rs.minZ+rs.maxZ)/2,w=rs.maxX-rs.minX,d=rs.maxZ-rs.minZ;
      if(w<=.05||d<=.05)continue;
      const type=['gable','shed','flat'].includes(rs.type)?rs.type:'gable',dir=rs.direction==='z'?'z':'x';
      const baseY=Number.isFinite(Number(rs.baseY))?Number(rs.baseY):(Number(building.wallHeight)||2.8);
      const pitch=Math.max(5,Math.min(70,Number(rs.pitch)||Number(building.roof?.pitch)||35))*Math.PI/180;
      const parent='ManualRoofs',collisionParent=options.collision?'ManualRoofCollision':null;
      const blockers=[...roofInteriorBlockers(building,rs,baseY),...roofAttachmentBlockers(building,rs)];
      for(const part of roofBoxParts(rs,building.roof||{},baseY,ri,true))addRoofBox(parent,part,blockers,collisionParent);
      if(type==='gable'){
        const clipped=trimmedGableEnds({...rs,direction:dir,pitch:pitch*180/Math.PI},baseY,Math.max(.04,Number(building.wallThickness)||.18),blockers);
        if(clipped){
          const data=buildTrimmedGableMeshData(clipped),group=`ManualRoof_${idx}_GableFill`;
          if(Object.values(data).some(m=>m.vertices.length))nodes.push(`[node name="${group}" type="Node3D" parent="ManualRoofs"]`);
          for(const [key,face,material] of [['outside','OutsideFaces',matWall],['inside','InsideFaces',matExteriorInside],['edges','EdgeFaces',matExteriorEdge]]){const gid=`ManualRoofGableMesh_${idx}_${face}`,res=arrayMeshResource(data[key],material,gid,face);if(res){resources.push(res.text);nodes.push(`[node name="${face}" type="MeshInstance3D" parent="ManualRoofs/${group}"]\nmesh = SubResource("${gid}")`);}}
          addClippedGableCollision('ManualRoofCollision',`ManualGableCollision_${idx}`,data);continue;
        }
        const ridgeY=baseY+(dir==='x'?d:w)/2*Math.tan(pitch);

        const ends=['both','min','max','none'].includes(rs.gableEnds)?rs.gableEnds:'both';
        if(ends!=='none'){
          const outside=meshWriter(),inside=meshWriter(),edges=meshWriter(),thickness=Math.max(.04,Number(building.wallThickness)||.18);
          if(dir==='x'){
            const center=(rs.minZ+rs.maxZ)/2;
            if(ends==='both'||ends==='min')addGablePrismToSplitMeshes(outside,inside,edges,'x',rs.minX,rs.minZ,rs.maxZ,center,baseY,ridgeY,thickness,-1);
            if(ends==='both'||ends==='max')addGablePrismToSplitMeshes(outside,inside,edges,'x',rs.maxX,rs.minZ,rs.maxZ,center,baseY,ridgeY,thickness,1);
          }else{
            const center=(rs.minX+rs.maxX)/2;
            if(ends==='both'||ends==='min')addGablePrismToSplitMeshes(outside,inside,edges,'z',rs.minZ,rs.minX,rs.maxX,center,baseY,ridgeY,thickness,-1);
            if(ends==='both'||ends==='max')addGablePrismToSplitMeshes(outside,inside,edges,'z',rs.maxZ,rs.minX,rs.maxX,center,baseY,ridgeY,thickness,1);
          }
          addGableCollision('ManualRoofCollision',`ManualGableCollision_${idx}`,rs,baseY,ridgeY,thickness);
          const group=`ManualRoof_${idx}_GableFill`;
          nodes.push(`[node name="${group}" type="Node3D" parent="ManualRoofs"]`);
          for(const [mesh,face,material] of [[outside,'OutsideFaces',matWall],[inside,'InsideFaces',matExteriorInside],[edges,'EdgeFaces',matExteriorEdge]]){
            const gid=`ManualRoofGableMesh_${idx}_${face}`,res=arrayMeshResource(mesh,material,gid,face);
            if(res){resources.push(res.text);nodes.push(`[node name="${face}" type="MeshInstance3D" parent="ManualRoofs/${group}"]\nmesh = SubResource("${gid}")`);}
          }
        }
      }
    }
  }

  const loadSteps=resources.length+extResources.length+1;
  const header=`[gd_scene load_steps=${loadSteps} format=3]\n\n`;
  const extBlock=extResources.length?extResources.join('\n')+'\n\n':'';
  return finalizeScene(header+extBlock+resources.join('\n\n')+'\n\n'+nodes.join('\n\n')+'\n',options);
}

// Colors in the browser are an authoring aid. Named surfaces stay available
// in Godot with empty slots by default; optional placeholders preserve old looks.
function finalizeScene(text,options){
  if(options.placeholderMaterials===true)return text;
  const blocks=text.split(/\n\n/).filter(b=>!b.startsWith('[sub_resource type="StandardMaterial3D"'));
  let result=blocks.join('\n\n').replace(/^"material": SubResource\("[^"]+"\),\n/gm,'').replace(/^material = SubResource\("[^"]+"\)\n/gm,'');
  const count=(result.match(/\[(?:sub_resource|ext_resource) /g)||[]).length+1;
  return result.replace(/load_steps=\d+/, 'load_steps='+count);
}

export function exportGodotFiles(building, options={collision:true,markers:true}) {
  options={collision:true,markers:true,...options};
  const validation=assertValidBuilding(building);
  const base=fileBase(building.name),tscnName=`${base}.tscn`;
  const doorScenes=doorSceneDescriptors(building);
  const doors=doorScenes.map(d=>({filename:d.filename,tscn:exportDoorTscn(d.view,d.opening,options),opening:d.opening,floorIndex:d.floorIndex}));
  return {base,tscnName,tscn:exportGodotTscn(building,options,doorScenes),doors,warnings:validation.warnings};
}


function downloadBlob(filename,blob,delay=500){
  const url=URL.createObjectURL(blob);
  try{
    const a=document.createElement('a');a.href=url;a.download=filename;a.click();
  }finally{
    // Keep the normal handoff delay, but also release failed downloads.
    setTimeout(()=>URL.revokeObjectURL(url),delay);
  }
}

export function downloadBinary(filename, blob) {
  downloadBlob(filename,blob,1000);
}

export function downloadText(filename, text, mime='text/plain') {
  downloadBlob(filename,new Blob([text],{type:mime}));
}

function crc32(bytes){
  let crc=0xffffffff;
  for(const b of bytes){
    crc^=b;
    for(let k=0;k<8;k++) crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  return (crc^0xffffffff)>>>0;
}
function u16(v){return [v&255,(v>>>8)&255];}
function u32(v){return [v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255];}
function dosDateTime(date=new Date()){
  const year=Math.max(1980,date.getFullYear());
  const time=(date.getHours()<<11)|(date.getMinutes()<<5)|(date.getSeconds()>>1);
  const day=(year-1980)<<9 | (date.getMonth()+1)<<5 | date.getDate();
  return {time,day};
}
export function makeStoredZip(files,{date=new Date()}={}){
  const enc=new TextEncoder();
  const local=[]; const central=[]; let offset=0;
  const {time,day}=dosDateTime(date);
  for(const f of files){
    const name=enc.encode(f.name);
    const data=typeof f.data==='string'?enc.encode(f.data):f.data;
    const crc=crc32(data);
    const lh=new Uint8Array([
      ...u32(0x04034b50),...u16(20),...u16(0x0800),...u16(0),...u16(time),...u16(day),
      ...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0),...name,...data
    ]);
    local.push(lh);
    const ch=new Uint8Array([
      ...u32(0x02014b50),...u16(20),...u16(20),...u16(0x0800),...u16(0),...u16(time),...u16(day),
      ...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset),...name
    ]);
    central.push(ch); offset+=lh.length;
  }
  const centralSize=central.reduce((n,a)=>n+a.length,0);
  const end=new Uint8Array([
    ...u32(0x06054b50),...u16(0),...u16(0),...u16(files.length),...u16(files.length),
    ...u32(centralSize),...u32(offset),...u16(0)
  ]);
  return new Blob([...local,...central,end],{type:'application/zip'});
}

export function downloadGodotPackage(building, options={collision:true,markers:true}) {
  const f=exportGodotFiles(building,options);
  const packageFiles=[{name:f.tscnName,data:f.tscn},...f.doors.map(d=>({name:d.filename,data:d.tscn}))];
  const blob=makeStoredZip(packageFiles);
  downloadBlob(`${f.base}_godot.zip`,blob,1000);
}

// Backwards-compatible name used by older editor code. The export is now a
// package because the building scene instances separate door .tscn files.
export const downloadGodotTscn = downloadGodotPackage;
