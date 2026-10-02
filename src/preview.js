import { polygonSlabFaces } from './polygon-geometry.js';
import { roofBoxParts, roofInteriorBlockers, roofAttachmentBlockers, trimRoofBox, trimmedGableEnds } from './roof-geometry.js';
import { boundsOfBuilding, boundsOfStructuralFloor, constrainedOpening, floorElevation, floorView, findWall, manualCeilingRectanglesAtLevel, manualFloorRectanglesAtLevel, pointOnWall, rectValid, roofSectionsForFloor, stairFootprint, storyHeight, structuralFloorRectangles, subtractRectAreas, splitWallIntoSolidSegments, wallLength } from './model.js';

import { stairOpeningFootprint } from './model.js';
import { buildExteriorMeshData, buildProfileMeshData, hasProfileWalls, openingAnchor, floorRectanglesForView, buildDoorMeshData, storyCeilingRectangles } from './exporter.js';
import {openingShapeFor} from './opening-shapes.js';
// Every edit rebuilds the whole preview; shaped-wall meshes are the slowest
// part, so reuse them while a floor's content (ignoring labels) is unchanged.
const profileMeshCache=new Map();
function cachedProfileMeshData(view){
  const key=JSON.stringify(view,(k,v)=>k==='label'?undefined:v);
  let data=profileMeshCache.get(key);
  if(!data){data=buildProfileMeshData(view);if(profileMeshCache.size>=32)profileMeshCache.delete(profileMeshCache.keys().next().value);profileMeshCache.set(key,data);}
  return data;
}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const norm=v=>{const l=Math.hypot(v.x,v.y,v.z)||1;return{x:v.x/l,y:v.y/l,z:v.z/l};};
function rotate(v,r){let{x,y,z}=v;if(r.x){const c=Math.cos(r.x),s=Math.sin(r.x);[y,z]=[y*c-z*s,y*s+z*c];}if(r.y){const c=Math.cos(r.y),s=Math.sin(r.y);[x,z]=[x*c+z*s,-x*s+z*c];}if(r.z){const c=Math.cos(r.z),s=Math.sin(r.z);[x,y]=[x*c-y*s,x*s+y*c];}return{x,y,z};}
function boxVertices(o){const hx=o.size.x/2,hy=o.size.y/2,hz=o.size.z/2,out=[];for(const y of[-hy,hy])for(const z of[-hz,hz])for(const x of[-hx,hx]){const q=rotate({x,y,z},o.rot||{x:0,y:0,z:0});out.push({x:q.x+o.pos.x,y:q.y+o.pos.y,z:q.z+o.pos.z});}return out;}
function objectVertices(o){if(!Array.isArray(o.vertices))return boxVertices(o);return o.vertices.map(v=>{const q=rotate(v,o.rot||{x:0,y:0,z:0});return{x:q.x+o.pos.x,y:q.y+o.pos.y,z:q.z+o.pos.z};});}
export const previewObjectVertices=o=>o.mesh?.vertices||objectVertices(o);
const boxFaces=[[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]];
const rgbOf=hex=>{const n=parseInt(hex.slice(1),16);return[(n>>16)&255,(n>>8)&255,n&255];};
// Per-channel tinted shading returns raw RGB so the software rasterizer can
// blend/write it directly; a warm key light and a cool sky-fill light blend
// into one multiplier per face, then fog mixes toward the background.
const FOG_RGB=rgbOf('#171f19');
const shadeRGB=(hex,tint,fog=0)=>{const c=rgbOf(hex);return[0,1,2].map(i=>{const lit=clamp(c[i]*tint[i],0,255);return lit+(FOG_RGB[i]-lit)*fog;});};
const KEY_LIGHT=norm({x:-.42,y:.86,z:.30});
const FILL_LIGHT=norm({x:.55,y:.32,z:-.6});
const KEY_TINT=[1.05,.97,.84];
const FILL_TINT=[.58,.68,.9];
function surfaceTint(n){
  const key=Math.max(0,dot(n,KEY_LIGHT)),fill=Math.max(0,dot(n,FILL_LIGHT)),up=Math.max(0,n.y);
  return[0,1,2].map(i=>.30+KEY_TINT[i]*key*.62+FILL_TINT[i]*fill*.30+up*.16);
}
// Small deterministic per-object brightness jitter so flat siding doesn't look plastic.
function hashJitter(seed,spread=.06){
  let h=0;for(let i=0;i<seed.length;i++)h=(h*31+seed.charCodeAt(i))|0;
  return 1-spread+((h>>>0)%1000)/1000*spread*2;
}
function stairYaw(d){return d==='south'?Math.PI:d==='east'?-Math.PI/2:d==='west'?Math.PI/2:0;}
function applyYaw(x,z,yaw){const c=Math.cos(yaw),s=Math.sin(yaw);return{x:x*c+z*s,z:-x*s+z*c};}

function splitRectByHoles(base, stairs=[], rectHoles=[]){
  const holes=[...(stairs||[]).map(s=>stairOpeningFootprint(s,.06)),...(rectHoles||[]).filter(rectValid)].map(h=>({minX:Math.max(base.minX,h.minX),maxX:Math.min(base.maxX,h.maxX),minZ:Math.max(base.minZ,h.minZ),maxZ:Math.min(base.maxZ,h.maxZ)})).filter(h=>h.maxX>h.minX&&h.maxZ>h.minZ);
  if(!holes.length)return[{minX:base.minX,maxX:base.maxX,minZ:base.minZ,maxZ:base.maxZ}];
  const xs=[base.minX,base.maxX],zs=[base.minZ,base.maxZ];for(const h of holes){xs.push(h.minX,h.maxX);zs.push(h.minZ,h.maxZ);}xs.sort((a,b)=>a-b);zs.sort((a,b)=>a-b);
  const ux=xs.filter((v,i,a)=>i===0||Math.abs(v-a[i-1])>1e-5),uz=zs.filter((v,i,a)=>i===0||Math.abs(v-a[i-1])>1e-5),out=[];
  for(let xi=0;xi<ux.length-1;xi++)for(let zi=0;zi<uz.length-1;zi++){const r={minX:ux[xi],maxX:ux[xi+1],minZ:uz[zi],maxZ:uz[zi+1]},cx=(r.minX+r.maxX)/2,cz=(r.minZ+r.maxZ)/2;if(holes.some(h=>cx>h.minX&&cx<h.maxX&&cz>h.minZ&&cz<h.maxZ))continue;out.push(r);}return out;
}
function unionRects(rects=[]){
  const valid=(rects||[]).filter(rectValid);if(!valid.length)return[];
  const xs=[...new Set(valid.flatMap(r=>[r.minX,r.maxX]))].sort((a,b)=>a-b),zs=[...new Set(valid.flatMap(r=>[r.minZ,r.maxZ]))].sort((a,b)=>a-b),cells=[];
  for(let xi=0;xi<xs.length-1;xi++)for(let zi=0;zi<zs.length-1;zi++){const r={minX:xs[xi],maxX:xs[xi+1],minZ:zs[zi],maxZ:zs[zi+1]},cx=(r.minX+r.maxX)/2,cz=(r.minZ+r.maxZ)/2;if(valid.some(v=>cx>=v.minX&&cx<=v.maxX&&cz>=v.minZ&&cz<=v.maxZ))cells.push(r);}
  let rows=[];cells.sort((a,b)=>a.minZ-b.minZ||a.maxZ-b.maxZ||a.minX-b.minX);for(const c of cells){const q=rows[rows.length-1];if(q&&Math.abs(q.minZ-c.minZ)<1e-5&&Math.abs(q.maxZ-c.maxZ)<1e-5&&Math.abs(q.maxX-c.minX)<1e-5)q.maxX=c.maxX;else rows.push({...c});}
  const out=[];rows.sort((a,b)=>a.minX-b.minX||a.maxX-b.maxX||a.minZ-b.minZ);for(const r of rows){const q=out[out.length-1];if(q&&Math.abs(q.minX-r.minX)<1e-5&&Math.abs(q.maxX-r.maxX)<1e-5&&Math.abs(q.maxZ-r.minZ)<1e-5)q.maxZ=r.maxZ;else out.push({...r});}return out;
}
function slabRectsForView(view,bounds,stairs=[]){
  const bases=structuralFloorRectangles(view);
  if(!bases.length) return [];
  if(bases.some(r=>r.polygon))return floorRectanglesForView(view,stairs);
  return bases.flatMap(r=>splitRectByHoles(r,stairs,view.platforms||[]));
}

function unionBounds(building){let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity,any=false;for(let i=0;i<building.floors.length;i++){const b=boundsOfBuilding(floorView(building,building.floors[i],i===building.floors.length-1));if(!building.floors[i].walls.length&&!building.floors[i].slabs?.length&&!building.floors[i].regions?.some(r=>r.effect==='solid'))continue;any=true;minX=Math.min(minX,b.minX);maxX=Math.max(maxX,b.maxX);minZ=Math.min(minZ,b.minZ);maxZ=Math.max(maxZ,b.maxZ);}for(const r of building.roofSections||[]){if(!rectValid(r))continue;any=true;const o=Math.max(0,Number(r.overhang)||0);minX=Math.min(minX,r.minX-o);maxX=Math.max(maxX,r.maxX+o);minZ=Math.min(minZ,r.minZ-o);maxZ=Math.max(maxZ,r.maxZ+o);}for(const r of [...(building.manualFloors||[]),...(building.manualCeilings||[])]){if(!rectValid(r))continue;any=true;minX=Math.min(minX,r.minX);maxX=Math.max(maxX,r.maxX);minZ=Math.min(minZ,r.minZ);maxZ=Math.max(maxZ,r.maxZ);}return any?{minX,maxX,minZ,maxZ,width:maxX-minX,depth:maxZ-minZ}:{minX:-2,maxX:2,minZ:-2,maxZ:2,width:4,depth:4};}

function overlap1D(a0,a1,b0,b1){return Math.min(a1,b1)-Math.max(a0,b0)>1e-5;}
function coveredPlatformSupports(view, plat){
  if(!rectValid(plat) || plat.covered===false) return [];
  const rects=structuralFloorRectangles(view);
  const sides=[];
  const touching={
    west: rects.some(r=>Math.abs(r.maxX-plat.minX)<1e-5 && overlap1D(r.minZ,r.maxZ,plat.minZ,plat.maxZ)),
    east: rects.some(r=>Math.abs(r.minX-plat.maxX)<1e-5 && overlap1D(r.minZ,r.maxZ,plat.minZ,plat.maxZ)),
    north: rects.some(r=>Math.abs(r.maxZ-plat.minZ)<1e-5 && overlap1D(r.minX,r.maxX,plat.minX,plat.maxX)),
    south: rects.some(r=>Math.abs(r.minZ-plat.maxZ)<1e-5 && overlap1D(r.minX,r.maxX,plat.minX,plat.maxX)),
  };
  if(!touching.west) sides.push({axis:'z',x:plat.minX,z0:plat.minZ,z1:plat.maxZ});
  if(!touching.east) sides.push({axis:'z',x:plat.maxX,z0:plat.minZ,z1:plat.maxZ});
  if(!touching.north) sides.push({axis:'x',z:plat.minZ,x0:plat.minX,x1:plat.maxX});
  if(!touching.south) sides.push({axis:'x',z:plat.maxZ,x0:plat.minX,x1:plat.maxX});
  const posts=[]; const seen=new Set();
  const addPost=(x,z)=>{const k=`${x.toFixed(4)},${z.toFixed(4)}`; if(seen.has(k)) return; seen.add(k); posts.push({x,z});};
  for(const s of sides){
    if(s.axis==='x'){
      const len=Math.max(0,s.x1-s.x0); const count=Math.max(2,Math.ceil(len/2.4)+1);
      for(let i=0;i<count;i++){const t=count===1?0:i/(count-1); addPost(s.x0+(s.x1-s.x0)*t, s.z);}
    } else {
      const len=Math.max(0,s.z1-s.z0); const count=Math.max(2,Math.ceil(len/2.4)+1);
      for(let i=0;i<count;i++){const t=count===1?0:i/(count-1); addPost(s.x, s.z0+(s.z1-s.z0)*t);}
    }
  }
  return {sides, posts};
}

const addObj=(objs,size,pos,rot,color,extra={})=>objs.push({size,pos,rot,color,...extra});
function pushPolygonSlab(objs,areas,t,topY,color,category='story'){
  const mesh={vertices:[],faces:[]};
  for(const f of Object.values(polygonSlabFaces(areas,t,topY)).flat()){const start=mesh.vertices.length;mesh.vertices.push(...f.points);mesh.faces.push(f.points.map((_,i)=>start+i));}
  if(mesh.vertices.length)objs.push({mesh,color,category,strokeAlpha:0,uniformFog:true});
}
function pushRoofPreview(objs,part,blockers,floorIndex=null){
  const faces=trimRoofBox(part,blockers),color=part.name.includes('Ridge')?'#825c4e':'#60443a';
  const extra={roofPart:part.name,roofFloor:floorIndex,strokeAlpha:.35};
  if(faces===null){objs.push({...part,color,...extra});return;}
  const mesh={vertices:[],faces:[]};
  for(const f of faces){const start=mesh.vertices.length;mesh.vertices.push(...f.points);mesh.faces.push(f.points.map((_,i)=>start+i));}
  if(mesh.vertices.length)objs.push({mesh,color,...extra});
}
function gablePrismPreviewMesh(orient,fixedCoord,spanMin,spanMax,center,baseY,ridgeY,thickness){
  const ht=Math.max(.02,thickness/2);
  if(orient==='x'){
    const xm=fixedCoord-ht,xp=fixedCoord+ht;
    return {vertices:[{x:xm,y:baseY,z:spanMin},{x:xm,y:baseY,z:spanMax},{x:xm,y:ridgeY,z:center},{x:xp,y:baseY,z:spanMin},{x:xp,y:baseY,z:spanMax},{x:xp,y:ridgeY,z:center}],faces:[[0,1,2],[3,5,4],[0,3,4,1],[1,4,5,2],[2,5,3,0]]};
  }
  const zm=fixedCoord-ht,zp=fixedCoord+ht;
  return {vertices:[{x:spanMin,y:baseY,z:zm},{x:spanMax,y:baseY,z:zm},{x:center,y:ridgeY,z:zm},{x:spanMin,y:baseY,z:zp},{x:spanMax,y:baseY,z:zp},{x:center,y:ridgeY,z:zp}],faces:[[0,2,1],[3,4,5],[0,1,4,3],[1,2,5,4],[2,0,3,5]]};
}


function pushWindowPreview(objs,view,o,wall,elevation){
  if(o.windowStyle==='empty') return;
  const L=wallLength(wall);if(L<1e-6)return;
  const dx=(wall.b.x-wall.a.x)/L,dz=(wall.b.z-wall.a.z)/L,ry=-Math.atan2(dz,dx),p=openingAnchor(view,o);
  const fw=Math.min(Math.max(.02,view.windowMesh?.frameWidth||.08),o.width*.45,o.height*.45),fd=Math.max(.02,view.windowMesh?.frameDepth||.12),cy=elevation+o.sill+o.height/2,innerW=Math.max(.02,o.width-fw*2),innerH=Math.max(.02,o.height-fw*2);
  const style=['plain','double_hung','four_pane'].includes(o.windowStyle)?o.windowStyle:'plain';
  const at=(x,y)=>({x:p.x+dx*x,y:cy+y,z:p.z+dz*x});
  const add=(sx,sy,x,y)=>objs.push({size:{x:sx,y:sy,z:fd},pos:at(x,y),rot:{x:0,y:ry,z:0},color:'#504233'});
  add(o.width,fw,0,(o.height-fw)/2);add(o.width,fw,0,-(o.height-fw)/2);add(fw,innerH,-(o.width-fw)/2,0);add(fw,innerH,(o.width-fw)/2,0);
  const muntin=Math.max(.018,Math.min(fw*.55,.045));
  if(style==='double_hung'||style==='four_pane')add(innerW,muntin,0,0);
  if(style==='four_pane')add(muntin,innerH,0,0);
  const glassDepth=Math.max(.006,Math.min(fd*.35,view.windowMesh?.glassThickness||.018));
  objs.push({size:{x:innerW,y:innerH,z:glassDepth},pos:at(0,0),rot:{x:0,y:ry,z:0},color:'#78a7b2',alpha:.34,doubleSided:true,strokeAlpha:.16,castShadow:false,glass:true});
}

function pushRailingPreview(objs,r,elevation){
  const dx=r.b.x-r.a.x,dz=r.b.z-r.a.z,len=Math.hypot(dx,dz);if(len<1e-4)return;
  const ux=dx/len,uz=dz/len,yaw=-Math.atan2(dz,dx),cx=(r.a.x+r.b.x)/2,cz=(r.a.z+r.b.z)/2,h=Math.max(.4,Number(r.height)||1),style=['two_rail','picket','cross_brace'].includes(r.style)?r.style:'two_rail';
  const addRail=(y,th=.06)=>objs.push({size:{x:len,y:th,z:.08},pos:{x:cx,y:elevation+y,z:cz},rot:{x:0,y:yaw,z:0},color:'#d8c7a1'});
  addRail(h);
  const posts=Math.max(2,Math.ceil(len/1.4)+1);
  for(let i=0;i<posts;i++){const t=posts===1?0:i/(posts-1),x=r.a.x+dx*t,z=r.a.z+dz*t;objs.push({size:{x:.08,y:h,z:.08},pos:{x,y:elevation+h/2,z},rot:{x:0,y:0,z:0},color:'#c3b287'});}
  if(style==='two_rail')addRail(h*.55);
  else if(style==='picket'){
    addRail(h*.18,.055);
    const count=Math.max(3,Math.ceil(len/.28)+1);
    for(let i=1;i<count-1;i++){const t=i/(count-1),x=r.a.x+dx*t,z=r.a.z+dz*t;objs.push({size:{x:.035,y:h*.76,z:.04},pos:{x,y:elevation+h*.56,z},rot:{x:0,y:0,z:0},color:'#d0c19e'});}
  }else if(style==='cross_brace'){
    for(let i=0;i<posts-1;i++){
      const t0=i/(posts-1),t1=(i+1)/(posts-1),x0=r.a.x+dx*t0,z0=r.a.z+dz*t0,x1=r.a.x+dx*t1,z1=r.a.z+dz*t1,bay=Math.hypot(x1-x0,z1-z0),rise=h*.58,braceLen=Math.hypot(bay,rise),angle=Math.atan2(rise,bay),bx=(x0+x1)/2,bz=(z0+z1)/2,by=elevation+h*.49;
      objs.push({size:{x:braceLen,y:.055,z:.055},pos:{x:bx,y:by,z:bz},rot:{x:0,y:yaw,z:angle},color:'#d0c19e'},{size:{x:braceLen,y:.055,z:.055},pos:{x:bx,y:by,z:bz},rot:{x:0,y:yaw,z:-angle},color:'#d0c19e'});
    }
  }
}

export class Preview3D{
  constructor(canvas,{interactive=true}={}){
    this.canvas=canvas;this.ctx=canvas.getContext('2d',{willReadFrequently:true});this.building=null;this.activeFloor=0;this.yaw=Math.PI*.25;this.pitch=-Math.PI*.18;this.distance=22;this.target={x:0,y:1.4,z:0};this.drag=null;
    this.staticPreview=!interactive;
    if(!interactive)return;
    const endDrag=e=>{if(this.drag&&e?.pointerId!=null&&canvas.hasPointerCapture?.(e.pointerId))canvas.releasePointerCapture(e.pointerId);this.drag=null;canvas.classList.remove('is-dragging');};
    canvas.addEventListener('pointerdown',e=>{
      if(![0,1,2].includes(e.button))return;
      const pan=e.button===1||e.button===2||(e.button===0&&e.shiftKey);
      const cam=this.camera();
      this.drag={mode:pan?'pan':'orbit',x:e.clientX,y:e.clientY,yaw:this.yaw,pitch:this.pitch,target:{...this.target},cam};
      canvas.classList.add('is-dragging');canvas.setPointerCapture(e.pointerId);e.preventDefault();
    });
    canvas.addEventListener('pointermove',e=>{
      if(!this.drag)return;
      const dx=e.clientX-this.drag.x,dy=e.clientY-this.drag.y;
      if(this.drag.mode==='orbit'){
        this.yaw=this.drag.yaw-dx*.008;this.pitch=clamp(this.drag.pitch-dy*.008,-1.25,.15);
      }else{
        const rect=canvas.getBoundingClientRect(),scale=this.distance/Math.max(260,Math.min(rect.width,rect.height))*1.65;
        const right=this.drag.cam.right,fw=this.drag.cam.forward,flat=norm({x:fw.x,y:0,z:fw.z});
        this.target.x=this.drag.target.x-right.x*dx*scale+flat.x*dy*scale;
        this.target.z=this.drag.target.z-right.z*dx*scale+flat.z*dy*scale;
      }
      this.draw();
    });
    canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);canvas.addEventListener('contextmenu',e=>e.preventDefault());
    canvas.addEventListener('wheel',e=>{e.preventDefault();this.distance=clamp(this.distance*(e.deltaY<0?.9:1.1),3.5,120);this.draw();},{passive:false});
    canvas.addEventListener('dblclick',()=>{if(this.building)this.frame(this.building);});
    new ResizeObserver(()=>this.resize()).observe(canvas.parentElement);this.resize();
  }
  resize(){const r=this.canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio,2);this.canvas.width=Math.max(1,Math.round(r.width*d));this.canvas.height=Math.max(1,Math.round(r.height*d));this.ctx.setTransform(d,0,0,d,0,0);this.draw();}
  rebuild(building,activeFloor=0){this.building=building;this.activeFloor=activeFloor;this.draw();}
  frame(building){const b=unionBounds(building),storyTop=floorElevation(building,Math.max(1,building.floors?.length||1)),manualRoofTop=Math.max(0,...(building.roofSections||[]).map(r=>{const span=(r.direction==='z'?r.maxX-r.minX:r.maxZ-r.minZ)/2,p=(Number(r.pitch)||35)*Math.PI/180;return(Number(r.baseY)||0)+((r.type||'gable')==='gable'?Math.max(0,span)*Math.tan(p):0);})),manualSurfaceTop=Math.max(0,...[...(building.manualFloors||[]),...(building.manualCeilings||[])].map(r=>Number(r.topY)||0)),height=Math.max(storyTop,manualRoofTop,manualSurfaceTop);this.target={x:(b.minX+b.maxX)/2,y:height*.45,z:(b.minZ+b.maxZ)/2};this.distance=Math.max(8,Math.max(b.width,b.depth,height)*1.7);this.draw();}
  camera(){const cp=Math.cos(this.pitch),sp=Math.sin(this.pitch),cy=Math.cos(this.yaw),sy=Math.sin(this.yaw),pos={x:this.target.x+this.distance*cp*sy,y:this.target.y-this.distance*sp,z:this.target.z+this.distance*cp*cy},forward=norm(sub(this.target,pos)),right=norm(cross(forward,{x:0,y:1,z:0})),up=cross(right,forward);return{pos,forward,right,up};}
  project(p,cam,w,h){const r=sub(p,cam.pos),x=dot(r,cam.right),y=dot(r,cam.up),z=dot(r,cam.forward);if(z<=.05)return null;const f=Math.min(w,h)*.78;return{x:w/2+x*f/z,y:h/2-y*f/z,z};}
  floorObjects(view,elevation,active,belowStairs=[],ceilingRects=[],floorIndex=0){
    const objs=[];
    const wallExterior=active?'#9a896d':'#817563';
    const wallInterior=active?'#847b70':'#6f6a61';
    const trimExterior='#c0b39c';
    const trimInterior='#9c9588';
    const baseStone='#5b544a';
    const floorBody=active?'#4f493c':'#484338';
    const floorTop=active?'#726758':'#655d51';
    const deckBody='#705842';
    const deckTop='#977556';
    const porchBody='#7f6c4d';
    const porchTop='#a58b61';
    const railWood='#d8c7a1';

    const profiled=hasProfileWalls(view);
    if(profiled){
      const data=cachedProfileMeshData(view);
      for(const [key,m] of Object.entries(data))if(m.vertices.length){const vertices=m.vertices.map(p=>({...p,y:p.y+elevation})),faces=[];for(let i=0;i<vertices.length;i+=3)faces.push([i,i+2,i+1]);objs.push({mesh:{vertices,faces},color:key==='outside'?wallExterior:key.toLowerCase().includes('edge')?trimExterior:wallInterior,strokeAlpha:0,uniformFog:true});}
    }
    for(const wall of profiled?[]:view.walls){
      const L=wallLength(wall); if(L<1e-6) continue;
      const dx=(wall.b.x-wall.a.x)/L, dz=(wall.b.z-wall.a.z)/L, ry=-Math.atan2(dz,dx);
      const isExterior=wall.role!=='interior';
      const wallColor=isExterior?wallExterior:wallInterior;
      const trimColor=isExterior?trimExterior:trimInterior;
      for(const s of splitWallIntoSolidSegments(view,wall)){
        const len=s.end-s.start, h=s.top-s.bottom, mid=(s.start+s.end)/2;
        const pos={x:wall.a.x+dx*mid, y:elevation+(s.bottom+s.top)/2, z:wall.a.z+dz*mid};
        const variation=hashJitter(`${wall.id}:${mid.toFixed(2)}`);
        addObj(objs,{x:len,y:h,z:view.wallThickness},pos,{x:0,y:ry,z:0},wallColor,{strokeAlpha:.56,variation,siding:isExterior?.22:false});
        if(h>.16){
          const baseH=Math.min(0.12, Math.max(0.06, h*0.16));
          addObj(objs,{x:Math.max(0.08,len),y:baseH,z:view.wallThickness+0.035},{x:pos.x,y:elevation+s.bottom+baseH/2,z:pos.z},{x:0,y:ry,z:0},baseStone,{strokeAlpha:.35});
        }
        if(h>.45){
          const capH=Math.min(0.065, Math.max(0.038, h*0.06));
          addObj(objs,{x:Math.max(0.08,len),y:capH,z:view.wallThickness+0.03},{x:pos.x,y:elevation+s.top-capH/2,z:pos.z},{x:0,y:ry,z:0},trimColor,{strokeAlpha:.3});
        }
      }
      if(floorIndex>0){
        const tol=Math.max(.05,(Number(view.floorThickness)||.18)*.6),manualT=Math.max(0,...(view.manualFloors||[]).filter(r=>rectValid(r)&&Math.abs((Number(r.topY)||0)-elevation)<=tol).map(r=>Math.max(.01,Number(r.thickness)||0))),skirtH=Math.max(Number(view.floorThickness)||.18,manualT);
        if(skirtH>0)addObj(objs,{x:L,y:skirtH,z:view.wallThickness},{x:(wall.a.x+wall.b.x)/2,y:elevation-skirtH/2,z:(wall.a.z+wall.b.z)/2},{x:0,y:ry,z:0},isExterior?wallExterior:wallInterior,{strokeAlpha:0,castShadow:false});
      }
    }

    for(const raw of view.openings){
      const o=constrainedOpening(view,raw), wall=findWall(view,o.wallId); if(!wall) continue;
      const L=wallLength(wall); if(L<1e-6) continue;
      const dx=(wall.b.x-wall.a.x)/L, dz=(wall.b.z-wall.a.z)/L, nx=-dz, nz=dx;
      const ry=-Math.atan2(dz,dx), p=openingAnchor(view,o);
      if(o.type==='window'&&view.windowMesh?.enabled!==false){
        pushWindowPreview(objs,view,o,wall,elevation);
      }else if(o.type==='door'&&o.doorStyle!=='empty'&&view.doorMesh?.enabled!==false){
        if(openingShapeFor(view,o)){
          // The validation panel explains an invalid frame inset. Keep the
          // rest of an in-progress document visible while the user fixes it.
          let data;try{data=buildDoorMeshData(view,o);}catch{continue;}
          for(const [key,color] of [['frame','#617681'],['panel','#acbfc5']]){const m=data[key],vertices=m.vertices.map(q=>({x:p.x+dx*q.x+nx*q.z,y:elevation+o.height/2+q.y,z:p.z+dz*q.x+nz*q.z})),faces=[];for(let i=0;i<vertices.length;i+=3)faces.push([i,i+2,i+1]);objs.push({mesh:{vertices,faces},color,strokeAlpha:0,uniformFog:true});}
          continue;
        }
        const t=Math.max(.025,view.doorMesh?.panelThickness||.045), fw=Math.max(.05,view.doorMesh?.frameWidth||.09), inner=Math.max(.05,o.width-fw*2);
        const frameColor=o.doorStyle==='exterior'?'#574033':'#6f6250';
        const panelColor=o.doorStyle==='closet'?'#b0a690':o.doorStyle==='exterior'?'#74442b':'#937a58';
        const at=(lx,ly,oz=0)=>({x:p.x+dx*lx+nx*oz, y:elevation+ly, z:p.z+dz*lx+nz*oz});
        addObj(objs,{x:inner,y:o.height-fw,z:t},at(0,(o.height-fw)/2),{x:0,y:ry,z:0},panelColor,{strokeAlpha:.4});
        addObj(objs,{x:fw,y:o.height,z:t*.95},at(-(o.width-fw)/2,o.height/2),{x:0,y:ry,z:0},frameColor,{strokeAlpha:.35});
        addObj(objs,{x:fw,y:o.height,z:t*.95},at((o.width-fw)/2,o.height/2),{x:0,y:ry,z:0},frameColor,{strokeAlpha:.35});
        addObj(objs,{x:o.width,y:fw,z:t*.95},at(0,o.height-fw/2),{x:0,y:ry,z:0},frameColor,{strokeAlpha:.35});
        const knobSide=o.doorStyle==='closet'?0.2:0.36;
        addObj(objs,{x:.045,y:.045,z:.025},at(inner*knobSide, o.height*0.48, t/2+.012),{x:0,y:ry,z:0},'#d2b57b',{strokeAlpha:.15,castShadow:false});
      }
    }

    const bb=boundsOfStructuralFloor(view);
    if((view.walls.length||(view.slabs||[]).some(rectValid)||(view.regions||[]).some(r=>r.effect==='solid'&&rectValid(r)))&&bb.width>.05&&bb.depth>.05){
      if(view.autoFloor!==false){
        const overrides=manualFloorRectanglesAtLevel(view,elevation,Math.max(.05,(Number(view.floorThickness)||.18)*.6));
        const areas=subtractRectAreas(slabRectsForView(view,bb,belowStairs),overrides),polygonal=areas.some(r=>r.polygon);
        if(polygonal)pushPolygonSlab(objs,areas,view.floorThickness,elevation,floorTop);
        for(const r of polygonal?[]:areas){
          const w=r.maxX-r.minX,d=r.maxZ-r.minZ,capT=Math.min(.03,Math.max(.018,view.floorThickness*.18));
          addObj(objs,{x:w,y:view.floorThickness,z:d},{x:(r.minX+r.maxX)/2,y:elevation-view.floorThickness/2,z:(r.minZ+r.maxZ)/2},{x:0,y:0,z:0},floorBody,{strokeAlpha:.48});
          addObj(objs,{x:Math.max(.08,w-.05),y:capT,z:Math.max(.08,d-.05)},{x:(r.minX+r.maxX)/2,y:elevation-capT/2,z:(r.minZ+r.maxZ)/2},{x:0,y:0,z:0},floorTop,{strokeAlpha:.18,castShadow:false});
        }
      }
      if(view.autoCeiling!==false&&ceilingRects.length){
        const t=Math.max(.02,view.ceiling?.thickness||.12),topAbs=elevation+view.wallHeight,overrides=manualCeilingRectanglesAtLevel(view,topAbs,Math.max(.05,t*.6));
        const areas=subtractRectAreas(ceilingRects,overrides),polygonal=areas.some(r=>r.polygon);
        if(polygonal)pushPolygonSlab(objs,areas,t,topAbs,'#b4b09f','ceiling');
        for(const r of polygonal?[]:areas){
          const w=r.maxX-r.minX,d=r.maxZ-r.minZ;
          addObj(objs,{x:w,y:t,z:d},{x:(r.minX+r.maxX)/2,y:topAbs-t/2,z:(r.minZ+r.maxZ)/2},{x:0,y:0,z:0},'#b4b09f',{strokeAlpha:.32,category:'ceiling'});
        }
      }
    }

    for(const p of view.platforms||[]){
      if(!rectValid(p)) continue;
      const w=p.maxX-p.minX,d=p.maxZ-p.minZ,topY=elevation+(Number(p.height)||0),y=topY-view.floorThickness/2;
      const body=p.kind==='deck'?deckBody:porchBody, top=p.kind==='deck'?deckTop:porchTop, capT=Math.min(.03,Math.max(.018,view.floorThickness*.18));
      addObj(objs,{x:w,y:view.floorThickness,z:d},{x:(p.minX+p.maxX)/2,y,z:(p.minZ+p.maxZ)/2},{x:0,y:0,z:0},body,{strokeAlpha:.46});
      addObj(objs,{x:Math.max(.08,w-.05),y:capT,z:Math.max(.08,d-.05)},{x:(p.minX+p.maxX)/2,y:topY-capT/2,z:(p.minZ+p.maxZ)/2},{x:0,y:0,z:0},top,{strokeAlpha:.16,castShadow:false});
      const support=coveredPlatformSupports(view,p);
      if(support&&support.posts?.length){
        const postTop=elevation+view.wallHeight,postH=Math.max(.2,postTop-topY),beamY=postTop-.08;
        for(const pt of support.posts) addObj(objs,{x:0.12,y:postH,z:0.12},{x:pt.x,y:topY+postH/2,z:pt.z},{x:0,y:0,z:0},'#6a523b',{strokeAlpha:.3});
        for(const s of support.sides){
          if(s.axis==='x'){
            const len=s.x1-s.x0; if(len>0.05) addObj(objs,{x:len+.12,y:0.16,z:0.12},{x:(s.x0+s.x1)/2,y:beamY,z:s.z},{x:0,y:0,z:0},'#5a4330',{strokeAlpha:.25});
          } else {
            const len=s.z1-s.z0; if(len>0.05) addObj(objs,{x:0.12,y:0.16,z:len+.12},{x:s.x,y:beamY,z:(s.z0+s.z1)/2},{x:0,y:0,z:0},'#5a4330',{strokeAlpha:.25});
          }
        }
      }
    }

    for(const stair of view.stairs||[]){
      const width=Math.max(.5,Number(stair.width)||2.4),run=Math.max(1,Number(stair.run)||6.5),rise=storyHeight(view),yaw=stairYaw(stair.direction),style=stair.style==='steps'?'steps':'ramp',blockBelow=stair.blockBelow!==false;
      const rampThickness=Math.max(.06,Math.min(.18,Number(view.floorThickness)||.18)),slope=Math.hypot(run,rise),angle=Math.atan2(rise,run),c=Math.cos(angle),sn=Math.sin(angle);
      const rampCenter={x:0,y:rise/2-rampThickness*c/2,z:-rampThickness*sn/2};
      if(style==='steps'){
        const steps=Math.max(2,Math.round(Number(stair.steps)||12)),tread=run/steps,stepRise=rise/steps,treadThickness=Math.max(.035,Math.min(.08,stepRise*.28)),riserDepth=Math.max(.025,Math.min(.055,tread*.18));
        for(let i=0;i<steps;i++){
          const top=rise*(i+1)/steps,zLocal=run/2-tread*(i+.5),q=applyYaw(0,zLocal,yaw);
          addObj(objs,{x:width,y:treadThickness,z:tread+.006},{x:(Number(stair.x)||0)+q.x,y:elevation+top-treadThickness/2,z:(Number(stair.z)||0)+q.z},{x:0,y:yaw,z:0},'#765e43',{strokeAlpha:.44,variation:.96+((i%2)*.035)});
          const boundary=run/2-tread*(i+1),rq=applyYaw(0,boundary+riserDepth/2,yaw);
          addObj(objs,{x:width,y:stepRise,z:riserDepth},{x:(Number(stair.x)||0)+rq.x,y:elevation+top-stepRise/2,z:(Number(stair.z)||0)+rq.z},{x:0,y:yaw,z:0},'#6e573e',{strokeAlpha:.38});
        }
      }else{
        const q=applyYaw(rampCenter.x,rampCenter.z,yaw);
        addObj(objs,{x:width,y:rampThickness,z:slope},{x:(Number(stair.x)||0)+q.x,y:elevation+rampCenter.y,z:(Number(stair.z)||0)+q.z},{x:angle,y:yaw,z:0},'#715a40',{strokeAlpha:.48});
      }
      if(blockBelow){
        const clearance=Math.max(.035,rampThickness*.65),blockerRise=Math.max(.05,rise-clearance),hw=width/2,hr=run/2;
        addObj(objs,{x:width,y:blockerRise,z:run},{x:Number(stair.x)||0,y:elevation,z:Number(stair.z)||0},{x:0,y:yaw,z:0},'#554432',{
          vertices:[
            {x:-hw,y:0,z:hr},{x:hw,y:0,z:hr},{x:-hw,y:0,z:-hr},{x:hw,y:0,z:-hr},{x:-hw,y:blockerRise,z:-hr},{x:hw,y:blockerRise,z:-hr}
          ],
          faces:[[0,1,5,4],[0,2,3,1],[0,4,2],[1,3,5],[2,4,5,3]],strokeAlpha:.42
        });
      }
    }

    for(const r of view.railings||[]) pushRailingPreview(objs,r,elevation);
    return objs;
  }
  objects(){
    if(!this.building) return [];
    const b=this.building, objs=[];
    for(let i=0;i<b.floors.length;i++){
      const sections=b.roof?.type!=='none'?roofSectionsForFloor(b,i):[];
      const view=floorView(b,b.floors[i],sections.length>0); view.roofSections=sections;
      const e=floorElevation(b,i), ceilingRects=storyCeilingRectangles(b,i);
      objs.push(...this.floorObjects(view,e,i===this.activeFloor,i?b.floors[i-1].stairs:[],ceilingRects,i).map(o=>({...o,category:o.category||'story',floorIndex:i})));
      const roofStart=objs.length;
      if(sections.length){
        // Display the same gable faces as the exporter, including suppressed
        // joined ends. Previously the preview drew only automatic roof slopes.
        view._roofSource=b;view._roofOrigin=e;const gables=buildExteriorMeshData(view);
        for(const mesh of Object.values(gables)){
          const vertices=[],faces=[];
          for(let vi=0;vi<mesh.vertices.length;vi+=3){
            const tri=mesh.vertices.slice(vi,vi+3);
            if(!tri.some(p=>p.y>view.wallHeight+1e-5))continue;
            const base=vertices.length;
            vertices.push(...tri.map(p=>({...p,y:p.y+e})));
            // Godot winding is clockwise; the canvas renderer uses CCW.
            faces.push([base,base+2,base+1]);
          }
          if(vertices.length)objs.push({mesh:{vertices,faces},color:'#877654',alpha:1,castShadow:false});
        }
        for(const [rsi,rs] of sections.entries()){
          const baseY=e+view.wallHeight,blockers=roofInteriorBlockers(b,rs,baseY);
          for(const part of roofBoxParts(rs,b.roof,baseY,rsi))pushRoofPreview(objs,part,blockers,i);
        }
      }
      for(let n=roofStart;n<objs.length;n++){objs[n].category='roof';objs[n].floorIndex=i;}
    }

    // Independent floor/ceiling slabs use absolute world-space top heights.
    for(let si=0;si<(b.manualFloors||[]).length;si++){
      const s=b.manualFloors[si];if(!rectValid(s))continue;const start=objs.length,t=Math.max(.01,Number(s.thickness)||Number(b.floorThickness)||.18),topY=Number(s.topY)||0,w=s.maxX-s.minX,d=s.maxZ-s.minZ,capT=Math.min(.03,Math.max(.018,t*.18));
      addObj(objs,{x:w,y:t,z:d},{x:(s.minX+s.maxX)/2,y:topY-t/2,z:(s.minZ+s.maxZ)/2},{x:0,y:0,z:0},'#45636b',{strokeAlpha:.48,variation:hashJitter(`manual-floor-${si}`)});addObj(objs,{x:Math.max(.08,w-.05),y:capT,z:Math.max(.08,d-.05)},{x:(s.minX+s.maxX)/2,y:topY-capT/2,z:(s.minZ+s.maxZ)/2},{x:0,y:0,z:0},'#6f8e91',{strokeAlpha:.16,castShadow:false});
      for(let n=start;n<objs.length;n++)Object.assign(objs[n],{category:'manual-floor',topY,surfaceId:s.id});
    }
    for(let si=0;si<(b.manualCeilings||[]).length;si++){
      const s=b.manualCeilings[si];if(!rectValid(s))continue;const t=Math.max(.01,Number(s.thickness)||Number(b.ceiling?.thickness)||.12),topY=Number(s.topY)||0,w=s.maxX-s.minX,d=s.maxZ-s.minZ;addObj(objs,{x:w,y:t,z:d},{x:(s.minX+s.maxX)/2,y:topY-t/2,z:(s.minZ+s.maxZ)/2},{x:0,y:0,z:0},'#a8a2b3',{strokeAlpha:.34,variation:hashJitter(`manual-ceiling-${si}`)});
      Object.assign(objs.at(-1),{category:'manual-ceiling',topY,surfaceId:s.id});
    }

    // Independent manual roofs use absolute height rather than floor ownership.
    for(let ri=0;ri<(b.roofSections||[]).length;ri++){
      const rs=b.roofSections[ri];if(!rectValid(rs))continue;const start=objs.length;
      const type=['gable','shed','flat','hip'].includes(rs.type)?rs.type:'gable',dir=rs.direction==='z'?'z':'x',baseY=Number.isFinite(Number(rs.baseY))?Number(rs.baseY):(Number(b.wallHeight)||2.8);
      const p=Math.max(5,Math.min(70,Number(rs.pitch)||Number(b.roof?.pitch)||35))*Math.PI/180;
      const cx=(rs.minX+rs.maxX)/2,cz=(rs.minZ+rs.maxZ)/2,w=rs.maxX-rs.minX,d=rs.maxZ-rs.minZ;if(w<=.05||d<=.05)continue;
      const blockers=[...roofInteriorBlockers(b,rs,baseY),...roofAttachmentBlockers(b,rs)];
      for(const part of roofBoxParts(rs,b.roof||{},baseY,ri,true))pushRoofPreview(objs,part,blockers);
      if(type==='gable'){
        const clipped=trimmedGableEnds({...rs,direction:dir,pitch:p*180/Math.PI},baseY,Math.max(.04,Number(b.wallThickness)||.18),blockers);
        if(clipped){for(const part of clipped){const vertices=[],faces=[];for(const f of part.faces){const start=vertices.length;vertices.push(...f.points);faces.push(f.points.map((_,i)=>start+i));}if(vertices.length)objs.push({mesh:{vertices,faces},color:'#93836b',doubleSided:true,castShadow:false,variation:1,uniformFog:true});}}
        else {
        const ridgeY=baseY+(dir==='x'?d:w)/2*Math.tan(p);
        const ends=['both','min','max','none'].includes(rs.gableEnds)?rs.gableEnds:'both',th=Math.max(.04,Number(b.wallThickness)||.18);
        if(ends!=='none'){
          if(dir==='x'){const center=(rs.minZ+rs.maxZ)/2;if(ends==='both'||ends==='min')objs.push({mesh:gablePrismPreviewMesh('x',rs.minX,rs.minZ,rs.maxZ,center,baseY,ridgeY,th),color:'#93836b',doubleSided:true,castShadow:false,variation:1});if(ends==='both'||ends==='max')objs.push({mesh:gablePrismPreviewMesh('x',rs.maxX,rs.minZ,rs.maxZ,center,baseY,ridgeY,th),color:'#93836b',doubleSided:true,castShadow:false,variation:1});}
          else{const center=(rs.minX+rs.maxX)/2;if(ends==='both'||ends==='min')objs.push({mesh:gablePrismPreviewMesh('z',rs.minZ,rs.minX,rs.maxX,center,baseY,ridgeY,th),color:'#93836b',doubleSided:true,castShadow:false,variation:1});if(ends==='both'||ends==='max')objs.push({mesh:gablePrismPreviewMesh('z',rs.maxZ,rs.minX,rs.maxX,center,baseY,ridgeY,th),color:'#93836b',doubleSided:true,castShadow:false,variation:1});}
        }
      }
      }
      for(let n=start;n<objs.length;n++)Object.assign(objs[n],{category:'roof',roofId:rs.id});
    }
    return objs;
  }
  draw(){
    const r=this.canvas.getBoundingClientRect(),w=r.width,h=r.height,ctx=this.ctx;
    ctx.clearRect(0,0,w,h);
    const cam=this.camera();

    // Neutral studio gradient: a lighter cool sky up top fading to the dark
    // ground so the building reads with good contrast.
    const bg=ctx.createLinearGradient(0,0,0,h);
    bg.addColorStop(0,'#44525a');bg.addColorStop(.42,'#313d3f');bg.addColorStop(.72,'#1b2622');bg.addColorStop(1,'#0c110e');
    ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
    const glow=ctx.createRadialGradient(w*.5,h*.04,0,w*.5,h*.04,Math.max(w,h)*.6);
    glow.addColorStop(0,'rgba(214,222,226,.10)');glow.addColorStop(.6,'rgba(190,204,210,.03)');glow.addColorStop(1,'rgba(190,204,210,0)');
    ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
    const vignette=ctx.createRadialGradient(w/2,h*.42,Math.min(w,h)*.18,w/2,h*.42,Math.max(w,h)*.78);vignette.addColorStop(.55,'rgba(0,0,0,0)');vignette.addColorStop(1,'rgba(0,0,0,.26)');ctx.fillStyle=vignette;ctx.fillRect(0,0,w,h);
    if(!this.building)return;

    const ground=[{x:-35,y:0,z:-35},{x:35,y:0,z:-35},{x:35,y:0,z:35},{x:-35,y:0,z:35}].map(p=>this.project(p,cam,w,h));
    if(!this.staticPreview&&ground.every(Boolean)){
      const gg=ctx.createLinearGradient(0,h*.35,0,h);gg.addColorStop(0,'rgba(25,36,28,.40)');gg.addColorStop(1,'rgba(10,14,11,.88)');
      ctx.fillStyle=gg;ctx.beginPath();ctx.moveTo(ground[0].x,ground[0].y);for(let i=1;i<ground.length;i++)ctx.lineTo(ground[i].x,ground[i].y);ctx.closePath();ctx.fill();
    }

    // Perspective ground grid with distance fade.
    ctx.lineWidth=1;
    for(let i=-24;i<=24;i++)for(const axis of[0,1]){
      const a=axis?{x:-24,y:.002,z:i}:{x:i,y:.002,z:-24},b=axis?{x:24,y:.002,z:i}:{x:i,y:.002,z:24},pa=this.project(a,cam,w,h),pb=this.project(b,cam,w,h);if(!pa||!pb)continue;
      const fade=1-clamp(Math.abs(i)/26,0,.82),major=i===0||i%5===0;
      ctx.strokeStyle=i===0?`rgba(106,127,105,${.48*fade})`:major?`rgba(56,72,58,${.38*fade})`:`rgba(39,52,42,${.27*fade})`;
      ctx.lineWidth=i===0?1.2:major?.8:.55;ctx.beginPath();ctx.moveTo(pa.x,pa.y);ctx.lineTo(pb.x,pb.y);ctx.stroke();
    }

    const objects=this.sceneObjects||this.objects();

    // Cheap contact/cast shadows: a soft outer penumbra plus a tighter core
    // fakes a blur pass without actually blurring anything.
    ctx.save();
    for(const o of objects){
      if(o.castShadow===false||o.alpha<.9||o.mesh||Array.isArray(o.vertices))continue;
      const hx=o.size.x/2,hz=o.size.z/2,avgY=Math.max(0,o.pos.y),shadowShift={x:avgY*.10,z:-avgY*.08};
      const base=[[-hx,-hz],[hx,-hz],[hx,hz],[-hx,hz]].map(([x,z])=>{const q=rotate({x,y:0,z},o.rot||{x:0,y:0,z:0});return{x:q.x+o.pos.x+shadowShift.x,z:q.z+o.pos.z+shadowShift.z};});
      const cx=(base[0].x+base[1].x+base[2].x+base[3].x)/4,cz=(base[0].z+base[1].z+base[2].z+base[3].z)/4;
      const soft=base.map(p=>this.project({x:cx+(p.x-cx)*1.4,y:.004,z:cz+(p.z-cz)*1.4},cam,w,h));
      const core=base.map(p=>this.project({x:p.x,y:.004,z:p.z},cam,w,h));
      if(soft.some(p=>!p)||core.some(p=>!p))continue;
      const area=Math.max(.01,o.size.x*o.size.z),alpha=Math.min(.15,.026+Math.log1p(area)*.017);
      ctx.fillStyle=`rgba(0,0,0,${alpha*.4})`;ctx.beginPath();ctx.moveTo(soft[0].x,soft[0].y);for(let i=1;i<4;i++)ctx.lineTo(soft[i].x,soft[i].y);ctx.closePath();ctx.fill();
      ctx.fillStyle=`rgba(0,0,0,${alpha})`;ctx.beginPath();ctx.moveTo(core[0].x,core[0].y);for(let i=1;i<4;i++)ctx.lineTo(core[i].x,core[i].y);ctx.closePath();ctx.fill();
    }
    ctx.restore();

    // Real per-pixel z-buffer rasterizer. Painter's sorting cannot resolve a
    // large roof quad that partially covers and is partially covered by walls,
    // so the building is composited over the ctx sky/grid/shadows with a depth
    // test instead. Sky, grid, and contact shadows above stay ctx-drawn.
    const W=this.canvas.width,H=this.canvas.height,dpr=W/w;
    const zbuf=new Float32Array(W*H);
    const img=ctx.getImageData(0,0,W,H),data=img.data;
    const nearFog=this.distance*.56,fogSpan=this.distance*1.42;

    const collect=wantGlass=>{
      const tris=[];
      for(const o of objects){
        const isGlass=(o.alpha??1)<.999;
        if(isGlass!==wantGlass) continue;
        let vs,faceList;
        if(o.mesh){
          vs=o.mesh.vertices||[];
          faceList=o.mesh.faces||[];
        }else if(Array.isArray(o.vertices)){
          // Custom preview geometry such as the solid stair ramp stores local
          // vertices/faces directly on the object. Transform those vertices
          // exactly like a box before rasterizing them.
          vs=objectVertices(o);
          faceList=Array.isArray(o.faces)?o.faces:[];
        }else{
          vs=boxVertices(o);
          faceList=boxFaces;
        }
        const variation=o.variation||1,alpha=o.alpha??1;
        // Boolean slab cells share a surface; face-center fog would reveal
        // their decomposition as false seams across an otherwise flat floor.
        const uniformDepth=o.uniformFog?vs.reduce((sum,p)=>sum+(this.project(p,cam,w,h)?.z||0),0)/vs.length:null;
        let minWY=Infinity,maxWY=-Infinity;for(const v of vs){if(v.y<minWY)minWY=v.y;if(v.y>maxWY)maxWY=v.y;}
        for(let fi=0;fi<faceList.length;fi++){
          const f=faceList[fi],P=f.map(i=>vs[i]);if(P.length<3)continue;
          let n=norm(cross(sub(P[1],P[0]),sub(P[2],P[0])));
          const center=P.reduce((q,p)=>({x:q.x+p.x/P.length,y:q.y+p.y/P.length,z:q.z+p.z/P.length}),{x:0,y:0,z:0});
          const facing=dot(n,norm(sub(cam.pos,center)));
          if(facing<=0&&!o.doubleSided)continue;
          if(facing<0)n={x:-n.x,y:-n.y,z:-n.z};
          const proj=P.map(p=>this.project(p,cam,w,h));if(proj.some(p=>!p))continue;
          const V=proj.map((p,k)=>({x:p.x*dpr,y:p.y*dpr,inv:1/p.z,wy:P[k].y}));
          const avgz=uniformDepth??proj.reduce((s,p)=>s+p.z,0)/proj.length,fog=clamp((avgz-nearFog)/fogSpan,0,.44);
          const tint=surfaceTint(n).map(v=>v*variation),vertical=Math.abs(n.y)<.6;
          const flat=shadeRGB(o.color,tint,fog);
          const top=vertical?shadeRGB(o.color,tint.map(v=>v*1.12),fog):flat;
          const bot=vertical?shadeRGB(o.color,tint.map(v=>v*.82),fog):flat;
          const siding=(!o.mesh&&o.siding&&(fi===2||fi===3))?(typeof o.siding==='number'?o.siding:.24):0;
          const shade={top,bot,flat,vertical,minWY,maxWY,siding,alpha,glass:!!o.glass};
          for(let k=1;k<V.length-1;k++)tris.push([V[0],V[k],V[k+1],shade]);
        }
      }
      return tris;
    };

    const raster=(tris,write)=>{
      for(const[A,B,C,s]of tris){
        let minX=Math.max(0,Math.floor(Math.min(A.x,B.x,C.x))),maxX=Math.min(W-1,Math.ceil(Math.max(A.x,B.x,C.x)));
        let minY=Math.max(0,Math.floor(Math.min(A.y,B.y,C.y))),maxY=Math.min(H-1,Math.ceil(Math.max(A.y,B.y,C.y)));
        if(minX>maxX||minY>maxY)continue;
        let area=(B.x-A.x)*(C.y-A.y)-(B.y-A.y)*(C.x-A.x);
        if(Math.abs(area)<1e-6)continue;
        const inv=1/area;
        const dSpan=Math.max(1e-4,s.maxWY-s.minWY);
        for(let y=minY;y<=maxY;y++){
          const py=y+.5;
          for(let x=minX;x<=maxX;x++){
            const px=x+.5;
            let b0=((B.x-px)*(C.y-py)-(B.y-py)*(C.x-px))*inv;
            let b1=((C.x-px)*(A.y-py)-(C.y-py)*(A.x-px))*inv;
            let b2=1-b0-b1;
            if(b0<0||b1<0||b2<0)continue;
            const invz=b0*A.inv+b1*B.inv+b2*C.inv;
            const idx=y*W+x;
            if(invz<=zbuf[idx])continue;
            const wy=(b0*A.wy*A.inv+b1*B.wy*B.inv+b2*C.wy*C.inv)/invz;
            let rgb;
            if(s.vertical){
              const t=clamp((wy-s.minWY)/dSpan,0,1);
              rgb=[s.bot[0]+(s.top[0]-s.bot[0])*t,s.bot[1]+(s.top[1]-s.bot[1])*t,s.bot[2]+(s.top[2]-s.bot[2])*t];
            }else rgb=s.flat;
            let r=rgb[0],g=rgb[1],bl=rgb[2];
            if(s.siding){
              const fr=wy/s.siding-Math.floor(wy/s.siding);
              if(fr<.11){r*=.8;g*=.8;bl*=.8;}
            }
            const o4=idx*4;
            if(write){
              zbuf[idx]=invz;
              data[o4]=r;data[o4+1]=g;data[o4+2]=bl;data[o4+3]=255;
            }else{
              const a=s.alpha,ia=1-a;
              data[o4]=r*a+data[o4]*ia;data[o4+1]=g*a+data[o4+1]*ia;data[o4+2]=bl*a+data[o4+2]*ia;data[o4+3]=255;
            }
          }
        }
      }
    };

    raster(collect(false),true);
    raster(collect(true),false);
    ctx.putImageData(img,0,0);

    if(this.staticPreview)return;
    // Light gizmos get a soft glow rather than a bare ring.
    for(let fi=0;fi<this.building.floors.length;fi++){
      const floor=this.building.floors[fi],e=floorElevation(this.building,fi),view=floorView(this.building,floor,fi===this.building.floors.length-1);
      for(const l of floor.lights||[]){
        const p={x:l.position.x,y:e+l.position.y,z:l.position.z},c=this.project(p,cam,w,h);if(!c)continue;
        const active=fi===this.activeFloor,rg=ctx.createRadialGradient(c.x,c.y,1,c.x,c.y,active?18:13);rg.addColorStop(0,active?'rgba(255,206,121,.38)':'rgba(179,139,85,.23)');rg.addColorStop(1,'rgba(255,190,100,0)');ctx.fillStyle=rg;ctx.beginPath();ctx.arc(c.x,c.y,active?18:13,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle=active?'#ffc77b':'#9a754e';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(c.x,c.y,active?6:5,0,Math.PI*2);ctx.stroke();
      }
    }

    // Compact HUD so controls stay discoverable as the editor grows.
    ctx.font='11px ui-monospace, monospace';
    const help=w<400?'Drag orbit · Shift+drag pan':w<620?'Drag orbit · Shift+drag pan · wheel zoom':'LMB orbit · MMB/RMB or Shift+LMB pan · wheel zoom · double-click frame';
    const tw=ctx.measureText(help).width;ctx.fillStyle='rgba(8,12,9,.64)';ctx.fillRect(8,h-29,tw+16,21);ctx.fillStyle='#a7b1a3';ctx.fillText(help,16,h-15);
    const floorLabel=`floor ${this.activeFloor+1}/${this.building.floors.length}`;const fw=ctx.measureText(floorLabel).width;ctx.fillStyle='rgba(8,12,9,.58)';ctx.fillRect(w-fw-24,9,fw+16,21);ctx.fillStyle='#b3bdad';ctx.fillText(floorLabel,w-fw-16,23);
  }
}
