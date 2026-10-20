import { rectValid, structuralFloorRectangles, roofSectionsForFloor } from './model.js';
import { roofBoxParts, roofWithSupport, roofPartPoints } from './roof-geometry.js';

// Covered porches either extend the automatic roof over themselves
// (roofStyle "extend", the default) or get their own lean-to: a shed roof that
// starts at the wall below the main eave and slopes away from the building.
// The exporter, preview and validation all use these helpers.
export const PLATFORM_ROOF_STYLES=['extend','lean-to'];
export const LEAN_TO_THICKNESS=.12, LEAN_TO_OVERHANG=.25, LEAN_TO_GAP=.03, LEAN_TO_MIN_HEADROOM=2;
const EPS=1e-5, DEG=Math.PI/180, POST=.12;
const overlap=(a0,a1,b0,b1)=>Math.max(0,Math.min(a1,b1)-Math.max(a0,b0));

export const isLeanTo=p=>!!p&&p.covered!==false&&p.roofStyle==='lean-to';

// Length of each platform edge that meets the floor's structural footprint.
export function platformTouching(view,plat){
  const rects=structuralFloorRectangles(view),len=(test,a0,a1,b0,b1)=>rects.reduce((sum,r)=>test(r)?sum+overlap(r[a0],r[a1],plat[b0],plat[b1]):sum,0);
  return {
    west:len(r=>Math.abs(r.maxX-plat.minX)<EPS,'minZ','maxZ','minZ','maxZ'),
    east:len(r=>Math.abs(r.minX-plat.maxX)<EPS,'minZ','maxZ','minZ','maxZ'),
    north:len(r=>Math.abs(r.maxZ-plat.minZ)<EPS,'minX','maxX','minX','maxX'),
    south:len(r=>Math.abs(r.minZ-plat.maxZ)<EPS,'minX','maxX','minX','maxX'),
  };
}

// Posts at the open edges of a covered platform, at most 2.4 m apart, and a
// beam along each open edge.
export function coveredPlatformSupports(view,plat){
  if(!rectValid(plat)||plat.covered===false)return {sides:[],posts:[]};
  const touching=platformTouching(view,plat),sides=[];
  if(touching.west<=EPS)sides.push({axis:'z',x:plat.minX,z0:plat.minZ,z1:plat.maxZ});
  if(touching.east<=EPS)sides.push({axis:'z',x:plat.maxX,z0:plat.minZ,z1:plat.maxZ});
  if(touching.north<=EPS)sides.push({axis:'x',z:plat.minZ,x0:plat.minX,x1:plat.maxX});
  if(touching.south<=EPS)sides.push({axis:'x',z:plat.maxZ,x0:plat.minX,x1:plat.maxX});
  const posts=[],seen=new Set();
  const addPost=(x,z)=>{const k=`${x.toFixed(4)},${z.toFixed(4)}`;if(seen.has(k))return;seen.add(k);posts.push({x,z});};
  for(const s of sides){
    const [lo,hi]=s.axis==='x'?[s.x0,s.x1]:[s.z0,s.z1],count=Math.max(2,Math.ceil(Math.max(0,hi-lo)/2.4)+1);
    for(let i=0;i<count;i++){const v=lo+(hi-lo)*i/(count-1);if(s.axis==='x')addPost(v,s.z);else addPost(s.x,v);}
  }
  return {sides,posts};
}

// Edge descriptors: the high (wall) side of a lean-to and the way it slopes.
const SIDES={
  west:{axis:'x',sign:1,edge:'minX',far:'maxX'},east:{axis:'x',sign:-1,edge:'maxX',far:'minX'},
  north:{axis:'z',sign:1,edge:'minZ',far:'maxZ'},south:{axis:'z',sign:-1,edge:'maxZ',far:'minZ'},
};

// The lowest point of this floor's automatic roof, in floor-local metres.
function mainRoofLowY(building,floorIndex,wallTop){
  if(building.roof?.type==='none')return Infinity;
  let low=Infinity;
  for(const [i,rs] of roofSectionsForFloor(building,floorIndex).entries())
    for(const part of roofBoxParts(rs,roofWithSupport(building),wallTop,i))
      if(!/Ridge/.test(part.name))for(const p of roofPartPoints(part))low=Math.min(low,p.y);
  return low;
}

// The lean-to roof of a covered platform, or null. It slopes away from the
// longest wall the platform touches (a freestanding platform slopes across
// its short side, away from the building). Its high edge sits just below the
// main roof's lowest eave, so the two never intersect. The pitch defaults to
// the steepest of 5 to 15 degrees that keeps 2.2 m under the roof at the posts.
export function leanToRoof(building,floorIndex,view,plat){
  if(!rectValid(plat)||!isLeanTo(plat))return null;
  const touching=platformTouching(view,plat),th=Math.max(0,Number(building.wallThickness)||0),T=LEAN_TO_THICKNESS,OV=LEAN_TO_OVERHANG;
  let high=Object.keys(SIDES).filter(k=>touching[k]>EPS).sort((a,b)=>touching[b]-touching[a])[0];
  const attached=!!high;
  if(!high){
    const rects=structuralFloorRectangles(view),w=plat.maxX-plat.minX,d=plat.maxZ-plat.minZ,axis=w<=d?'x':'z';
    let centre=axis==='x'?(plat.minX+plat.maxX)/2:(plat.minZ+plat.maxZ)/2;
    if(rects.length){const lo=Math.min(...rects.map(r=>axis==='x'?r.minX:r.minZ)),hi=Math.max(...rects.map(r=>axis==='x'?r.maxX:r.maxZ));centre=(lo+hi)/2;}
    const mid=axis==='x'?(plat.minX+plat.maxX)/2:(plat.minZ+plat.maxZ)/2;
    high=axis==='x'?(centre<=mid?'west':'east'):(centre<=mid?'north':'south');
  }
  const {axis,sign,edge,far}=SIDES[high],cross=axis==='x'?['minZ','maxZ']:['minX','maxX'];
  const crossTouch=axis==='x'?[touching.north,touching.south]:[touching.west,touching.east];
  const c0=plat[cross[0]]+(crossTouch[0]>EPS?th/2:-OV),c1=plat[cross[1]]+(crossTouch[1]>EPS?-th/2:OV);
  const deck=Number(plat.height)||0,wallTop=Number(view.wallHeight)||0;
  const highY=Math.min(wallTop,mainRoofLowY(building,floorIndex,wallTop))-LEAN_TO_GAP;
  const start=plat[edge]+sign*(attached?th/2:-OV),postLine=plat[far],end=postLine+sign*OV,postRun=Math.abs(postLine-start);
  const explicit=Number(plat.roofPitch);
  const pitch=Number.isFinite(explicit)&&plat.roofPitch!=null?Math.max(3,Math.min(45,explicit)):
    Math.max(5,Math.min(15,postRun>EPS?Math.atan((highY-deck-T-2.2)/postRun)/DEG:15));
  const p=pitch*DEG,tan=Math.tan(p);
  // The slab's end face is square to the slope, so its lower corner leans
  // into the wall; keep that corner inside the wall's outer half.
  const a0=start+(attached?sign*Math.max(0,T*Math.sin(p)-th/2+.005):0),run=Math.abs(end-a0);
  if(run<=.05||c1-c0<=.05)return null;
  const underside=a=>highY-Math.max(0,sign*(a-a0))*tan-T/Math.cos(p);
  const centreA=a0+sign*(run/2-T/2*Math.sin(p)),centreY=highY-run/2*tan-T/2*Math.cos(p),centreC=(c0+c1)/2,length=run/Math.cos(p);
  const part={name:'Roof',size:axis==='x'?{x:length,y:T,z:c1-c0}:{x:c1-c0,y:T,z:length},
    pos:axis==='x'?{x:centreA,y:centreY,z:centreC}:{x:centreC,y:centreY,z:centreA},
    rot:axis==='x'?{x:0,y:0,z:-sign*p}:{x:sign*p,y:0,z:0}};
  // Posts and beams reach the roof's underside on their high side, so they
  // tuck into the slab rather than leaving a wedge of light.
  const at=pt=>axis==='x'?pt.x:pt.z;
  const postTop=pt=>Math.max(deck+.2,underside(at(pt)-sign*POST/2));
  const beamTop=side=>{
    const along=(side.axis==='x')===(axis==='x');
    if(!along)return postTop(side.axis==='x'?{x:0,z:side.z}:{x:side.x,z:0});
    return postTop(axis==='x'?{x:postLine,z:0}:{x:0,z:postLine});
  };
  // undersideAt/topAt take the coordinate along the slope axis (x or z).
  return {part,highSide:high,attached,axis,pitch,highY,lowY:highY-run*tan,headroom:underside(postLine)-deck,undersideAt:underside,topAt:a=>underside(a)+T/Math.cos(p),postTop,beamTop};
}

// Validation and inspection: a lean-to too low to walk under.
export function leanToProblem(building,floorIndex,view,plat){
  const roof=leanToRoof(building,floorIndex,view,plat);
  if(!roof||roof.headroom>=LEAN_TO_MIN_HEADROOM-1e-6)return null;
  return `lean-to roof leaves ${roof.headroom.toFixed(2)} m headroom at the porch edge (under ${LEAN_TO_MIN_HEADROOM} m). Lower the deck, raise the walls, shorten the porch or set a lower roofPitch.`;
}
