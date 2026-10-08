import {regionPolygonProblem,pointInRegion} from './regions.js';
import {cleanPolygon,wallPolygonAreas,areaPoints,areaSize,subtractPolygonAreas} from './polygon-areas.js';

// Front elevation, viewed along a wall from A to B: x left-to-right, y up.
// Normalized outlines scale with each opening's authored width and height.
export const openingShapeFor=(building,opening)=>(building.openingShapes||[]).find(s=>s.id===opening.shapeId)||null;
export function openingShapePreset(kind){
  if(kind==='clipped')return [[.16,0],[.84,0],[1,.2],[1,.8],[.88,1],[.12,1],[0,.8],[0,.2]].map(([x,y])=>({x,y}));
  if(kind==='arch')return [{x:0,y:0},{x:1,y:0},...Array.from({length:13},(_,i)=>({x:.5+.5*Math.cos(i*Math.PI/12),y:.65+.35*Math.sin(i*Math.PI/12)}))];
  return [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
}
export function openingShapeProblem(shape){
  if(!shape||typeof shape!=='object'||typeof shape.id!=='string'||!shape.id)return 'Doorway shape needs an ID.';
  if(typeof shape.label!=='string'||!shape.label.trim()||shape.label.length>120)return 'Doorway shape needs a name of 1–120 characters.';
  const p=shape.points;
  if(!Array.isArray(p)||p.length<3||p.length>32)return 'Use 3–32 outline corners.';
  if(p.some(q=>!q||!['x','y'].every(k=>typeof q[k]==='number'&&Number.isFinite(q[k])&&q[k]>=0&&q[k]<=1)))return 'Outline coordinates must be between 0% and 100%.';
  const problem=regionPolygonProblem(p.map(q=>({x:q.x,z:q.y})));
  if(problem)return problem.replaceAll('Region','Outline').replaceAll('region','outline');
  for(const k of ['x','y'])if(Math.min(...p.map(q=>q[k]))>1e-7||Math.max(...p.map(q=>q[k]))<1-1e-7)return 'Outline must reach all four bounds (0% and 100%); use Fit to bounds.';
  if(!p.some((q,i)=>q.y===0&&p[(i+1)%p.length].y===0&&Math.abs(q.x-p[(i+1)%p.length].x)>.01))return 'A doorway needs a flat bottom edge at floor level.';
  return null;
}
export function openingOutline(building,opening){
  return (openingShapeFor(building,opening)?.points||openingShapePreset('rectangle')).map(p=>({x:(p.x-.5)*opening.width,z:p.y*opening.height}));
}
export const outlineCells=points=>wallPolygonAreas(points.map((a,i)=>({a,b:points[(i+1)%points.length]})));

// Parallel edge inset with an unraised bottom edge, so no frame threshold is
// added across the walking route. Reject narrow/reentrant shapes whose inset
// folds over instead of silently substituting a rectangular panel.
function insetOutline(points,distance){
  const p=cleanPolygon(points),planes=p.map((a,i)=>{const b=p[(i+1)%p.length],l=Math.hypot(b.x-a.x,b.z-a.z),n={x:(b.z-a.z)/l,z:(a.x-b.x)/l};return {n,d:n.x*a.x+n.z*a.z-(a.z===0&&b.z===0?0:distance)};});
  const out=planes.map((b,i)=>{const a=planes[(i+planes.length-1)%planes.length],det=a.n.x*b.n.z-a.n.z*b.n.x;return {x:(a.d*b.n.z-a.n.z*b.d)/det,z:(a.n.x*b.d-a.d*b.n.x)/det};});
  if(regionPolygonProblem(out)||out.some(q=>!pointInRegion({polygon:p},q)))throw new Error('This outline is too narrow or sharply notched for the frame width. Reduce frame width, simplify the outline, or use an empty opening.');
  // Vertices inside alone do not catch an inset edge crossing a concave notch.
  const outside=subtractPolygonAreas(outlineCells(out),outlineCells(p));
  if(outside.reduce((n,a)=>n+areaSize(a),0)>1e-7)throw new Error('Frame inset crosses the outline. Simplify the notch or use an empty opening.');
  for(let i=0;i<p.length;i++)if((out[(i+1)%p.length].x-out[i].x)*(p[(i+1)%p.length].x-p[i].x)+(out[(i+1)%p.length].z-out[i].z)*(p[(i+1)%p.length].z-p[i].z)<=1e-8)throw new Error('Frame width collapses an outline edge. Reduce frame width or use an empty opening.');
  return out;
}
export function shapedDoorLayout(building,opening){
  const outline=cleanPolygon(openingOutline(building,opening)),cfg=building.doorMesh||{};
  const frameWidth=Math.max(.03,Number(cfg.frameWidth)||.09),frameDepth=Math.max(.03,Number(cfg.frameDepth)||.14),panelThickness=Math.max(.02,Number(cfg.panelThickness)||.045);
  const inner=insetOutline(outline,frameWidth),panel=insetOutline(outline,frameWidth+.006);
  const frameCells=subtractPolygonAreas(outlineCells(outline),outlineCells(inner)),panelCells=outlineCells(panel);
  return {outline,inner,panel,frameCells,panelCells,frameWidth,frameDepth,panelThickness};
}
// Door leaves: exterior and room doors take one (default) or two hinged
// leaves; closet doors always have two; custom outlines use one panel.
export const DOOR_LEAF_STYLES=['exterior','room'];
export function doorLeafCount(opening){
  if(opening?.type!=='door')return 0;
  if(opening.doorStyle==='closet')return 2;
  return opening.leaves===2&&DOOR_LEAF_STYLES.includes(opening.doorStyle||'room')&&!opening.shapeId?2:1;
}
export function doorLeavesProblem(opening){
  if(opening?.leaves===undefined)return null;
  if(opening.type!=='door')return 'Only doors have leaves.';
  if(opening.leaves!==1&&opening.leaves!==2)return 'Door leaves must be 1 or 2.';
  if(opening.doorStyle==='closet'&&opening.leaves===1)return 'Closet doors always have two leaves; choose Room or Exterior for a single leaf.';
  if(opening.leaves===2&&opening.shapeId)return 'Custom doorway outlines use a single panel; use one leaf or a Rectangle doorway.';
  if(opening.leaves===2&&opening.doorStyle==='rollup')return 'Roll-up doors have one curtain; leaves apply to exterior and room doors.';
  return null;
}
// Roll-up doors: openFraction 0 (closed) to 1 (open), rollup style only.
export function rollupDoorProblem(opening){
  if(opening?.openFraction!==undefined&&(opening.type!=='door'||opening.doorStyle!=='rollup'))return 'openFraction applies to roll-up doors only.';
  if(opening?.openFraction!==undefined&&!(Number(opening.openFraction)>=0&&Number(opening.openFraction)<=1))return 'openFraction must be from 0 (closed) to 1 (open).';
  if(opening?.doorStyle==='rollup'&&opening.shapeId)return 'Roll-up doors use a rectangular opening; choose Rectangle.';
  return null;
}
export function shapedOpeningProblem(building,opening){
  if(!opening.shapeId)return null;
  if(opening.type!=='door')return 'Custom doorway outlines are supported on doors and empty passages only.';
  if(!openingShapeFor(building,opening))return 'Opening references a missing doorway shape.';
  if(opening.doorStyle==='empty'||building.doorMesh?.enabled===false)return null;
  if(opening.doorStyle==='closet')return 'Custom outlines use a single panel. Choose Room, Exterior, or Empty opening.';
  try{shapedDoorLayout(building,opening);}catch(e){return e.message;}return null;
}

export function openingCutters(building,opening,length,direction,origin){
  const center=opening.t*length;
  return outlineCells(openingOutline(building,opening)).map(cell=>{
    const p=areaPoints(cell);
    return p.map((a,i)=>{const b=p[(i+1)%p.length],len=Math.hypot(b.x-a.x,b.z-a.z),nx=(b.z-a.z)/len,ny=(a.x-b.x)/len;
      return {n:{x:nx*direction.x,y:ny,z:nx*direction.z},d:nx*(origin.x*direction.x+origin.z*direction.z+center+a.x)+ny*a.z};});
  });
}
