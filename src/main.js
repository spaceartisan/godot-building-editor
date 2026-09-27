import {createOpeningShapeEditor} from './opening-shape-editor.js';
import {diagnosticTargets,resolveDiagnosticTarget} from './diagnostic-targets.js';
import {profileWallState} from './wall-profile-geometry.js';
import {createWallTypeEditor} from './wall-type-editor.js';
import {wallTypeFor,wallTypeOpeningProblem} from './wall-types.js';
import { polygonRegion, regionPolygonProblem, regionBounds, regionLabelPoint, regionInteriorClearance, pointInRegion, wallOutlinePoints } from './regions.js';
import { areaPoints, areaSize } from './polygon-areas.js';
import { areaSelectionCandidates, stairPickDistance } from './selection.js';
import {selectionKey,groupEntity,selectionBounds,selectionInBox,selectableItems,proposeGroupMove,removeGroupSelection} from './group-edit.js';
import {proposeFloorStackEdit} from './floor-stack.js';
import {markerProblem} from './markers.js';
import { normalizeBuilding, normalizeFloor, parseJsonText } from './document.js';
import { EXAMPLE_CATALOG } from './examples.js';
import {
  REGION_KINDS, REGION_EFFECTS, footprintInfo, makeRegion, DEFAULT_OMNI_LIGHT, addRoom, applyOpeningConstraints, boundsOfBuilding, findOpeningConflict, findWall,
  floorElevation, floorWallHeight, floorSlabThickness, structuralEditImpact, removeTopFloor, floorView, makeEmptyBuilding, makeFarmhousePreset, makeFloor, makeManualSurface, makeOmniLight, makePlatform, makeRectArea, makeRailing, makeRoofSection, makeStair, openingsForWall,
  pointOnWall, projectToWall, rectValid, roofSectionsForFloor, stairFootprint, structuralFloorRectangles, splitWallIntoSolidSegments, uid, validateOpeningLayout, wallHeightFor, wallLength
} from './model.js';
import { downloadGodotTscn, downloadText, downloadBinary, makeStoredZip, exportGodotFiles, isExteriorWall, exteriorWallOutsideSign } from './exporter.js';
import { createCheckReport, checkReportFilename } from './check-report.js';
import { reachabilityWarnings, parseRouteStarts } from './reachability.js';
import { snapPlanPoint, samePoint, wallSegmentProblem, wallJunctions, proposePlatformUpdate, proposeCrenellation, CRENELLATION_DEFAULTS } from './authoring.js';
import { endpointMoveTargets, proposeEndpointMove } from './wall-edit.js';
import { WebPreview3D as Preview3D, webReviewDescription } from './preview-web.js';
import { createHistory } from './history.js';
import { assertValidBuilding, validateBuilding } from './validation.js';

let building=makeFarmhousePreset();
let activeFloorIndex=0;
let loadRequestVersion=0;
let tool='select';
let selected=null;
let multiSelection=[],selectionIntent=null,lastPick=null,groupDrag=null,selectionBox=null,moveArmed=false,keepGroupJoints=true;
function selectionItems(){
  if(!selected)return [];
  return multiSelection.some(s=>selectionKey(s)===selectionKey(selected))?multiSelection.filter(s=>groupEntity(building,activeFloorIndex,s)):[selected];
}
function setGroupSelection(items,keepCandidates=false){
  if(groupDrag||selectionBox)cancelDrawing();
  multiSelection=[...new Map(items.map(s=>[selectionKey(s),s])).values()];selected=multiSelection.at(-1)||null;
  if(!keepCandidates)clearSelectionCandidates();renderSelection(`${multiSelection.length} selected`);renderSelectionCandidates();
}
let wallStart=null,roomStart=null,roomCurrent=null,stairStart=null,stairCurrent=null,slabStart=null,slabCurrent=null,platformStart=null,platformCurrent=null,roofStart=null,roofCurrent=null,railingStart=null,railingCurrent=null,surfaceStart=null,surfaceCurrent=null;
let endpointDrag=null,moveConnected=true;
let wallOrigin=null,wallChainSegments=0,snapHit=null,regionStart=null,regionCurrent=null;
let newRegionKind='room',newRegionEffect='label',newRegionShape='rectangle',regionPoints=[],showJunctions=true;
let snap=true,newWallRole='exterior',newWallHeightMode='full',newDoorStyle='room',newWindowStyle='plain',newLightHeight=2.2,newStairWidth=2.4,newStairStyle='ramp',newStairSteps=12,newStairBlockBelow=true,newPlatformType='porch',newPlatformHeight=0,newRailingHeight=1.0,newRailingStyle='two_rail',newRoofSectionType='gable',newRoofDirection='x',newRoofBaseY=2.8,newRoofPitch=35,newRoofOverhang=.35,newRoofGableEnds='both',newManualFloorY=0,newManualFloorThickness=.18,newManualCeilingY=2.8,newManualCeilingThickness=.12;
let view={scale:55,panX:0,panY:0},panState=null,lastAreaSelection=null,selectionCandidates=[],selectionFilter='all';
let showFloorBelow=true;
let newMarkerHeight=0;
let newWallTypeId='',wallTypeEditor=null;
let newOpeningShapeId='',openingShapeEditor=null;
let crenelDraft={...CRENELLATION_DEFAULTS};
let routeResult=null,lastRenders=null;

const $=s=>document.querySelector(s);
const canvas=$('#plan-canvas'),ctx=canvas.getContext('2d');
const preview=new Preview3D($('#preview-canvas'));
preview.onReview=syncPreviewReview;

function syncPreviewReview(){
  const state=preview.review,description=webReviewDescription(preview.scene);
  const markerCount=preview.markerGuides?.labels.length||0;
  if(markerCount){description.status+=` · ${markerCount} named markers`;description.notes.push('Purple marker guides are shown through geometry for reference. Notes remain in the building JSON.');}
  $('#preview-mode').value=state.view;$('#preview-overlay').value=state.overlay;
  const floorSelect=$('#preview-floor');floorSelect.replaceChildren();
  building.floors.forEach((f,i)=>{const option=document.createElement('option');option.value=i;option.textContent=`${i+1}: ${f.label}`;floorSelect.appendChild(option);});
  floorSelect.value=preview.activeFloor;floorSelect.disabled=building.floors.length===1;
  $('#preview-floor-field').hidden=state.view!=='floor'&&state.overlay!=='footprint';
  const roofSelect=$('#preview-roof');roofSelect.replaceChildren();
  for(const [value,label] of [['','All constrained roofs'],...building.roofSections.map(r=>[r.id,`${r.label||r.id} · ${r.type}`])]){
    const option=document.createElement('option');option.value=value;option.textContent=label;roofSelect.appendChild(option);
  }
  roofSelect.value=state.roof||'';roofSelect.disabled=building.roofSections.length===0;
  $('#preview-roof-field').hidden=state.overlay!=='attachments';
  $('#preview-status').textContent=description.status;
  $('#preview-guide-scope').hidden=state.overlay==='none';
  const legend=$('#preview-legend');legend.replaceChildren();legend.hidden=state.overlay==='none';
  for(const entry of description.legend){const row=document.createElement('span'),swatch=document.createElement('i');swatch.className=`guide-${entry.kind}${entry.dashed?' guide-dashed':''}`;swatch.setAttribute('aria-hidden','true');row.append(swatch,document.createTextNode(entry.text));legend.appendChild(row);}
  const notes=$('#preview-notes');notes.replaceChildren();
  for(const text of description.notes){const p=document.createElement('p');p.textContent=text;notes.appendChild(p);}
}
$('#preview-mode').addEventListener('change',e=>preview.setReview({view:e.target.value}));
$('#preview-overlay').addEventListener('change',e=>preview.setReview({overlay:e.target.value}));
$('#preview-roof').addEventListener('change',e=>preview.setReview({roof:e.target.value||undefined}));
$('#preview-frame').addEventListener('click',()=>preview.frame(building,activeFloorIndex));
$('#preview-floor').addEventListener('change',e=>changeActiveFloor(e.target.value));
document.querySelectorAll('[data-view]').forEach(btn=>btn.addEventListener('click',()=>$('#preview-view').parentElement.classList.toggle('review-active',btn.dataset.view==='preview')));

const exampleGroups=new Map();
for(const entry of EXAMPLE_CATALOG){
  if(!exampleGroups.has(entry.group)){const group=document.createElement('optgroup');group.label=entry.group;$('#example-select').appendChild(group);exampleGroups.set(entry.group,group);}
  const option=document.createElement('option');option.value=entry.file.replace(/\.building\.json$/,'');option.textContent=entry.title;option.title=entry.description+(entry.expected.warnings.length?' Known warning: '+entry.expected.warnings.join('; '):'');exampleGroups.get(entry.group).appendChild(option);
}


building=normalizeBuilding(building);
const history=createHistory(building,100);
function floor(){return building.floors[activeFloorIndex];}
function defaultRoofBaseY(){return floorElevation(building,activeFloorIndex)+floorWallHeight(building,activeFloorIndex);}
function defaultManualFloorY(){return floorElevation(building,activeFloorIndex);}
function defaultManualCeilingY(){return floorElevation(building,activeFloorIndex)+floorWallHeight(building,activeFloorIndex);}
function syncManualSurfaceDefaults(){newManualFloorY=defaultManualFloorY();newManualFloorThickness=Number(building.floorThickness)||.18;newManualCeilingY=defaultManualCeilingY();newManualCeilingThickness=Number(building.ceiling?.thickness)||.12;}
function fb(index=activeFloorIndex){return floorView(building,building.floors[index],index===building.floors.length-1);}
function setStatus(t){$('#status-text').textContent=t;$('#status-text').title=t;}
function snapPoint(p,e={}){
  snapHit=snapPlanPoint(p,floor().walls,{enabled:snap,grid:building.gridSize,scale:view.scale,bypass:e.altKey,origin:tool==='wall'?wallOrigin:null,segments:wallChainSegments,start:wallStart});
  return snapHit.point;
}
function clearSelectionCandidates(){lastAreaSelection=null;selectionCandidates=[];const panel=$('#selection-candidates');if(panel){panel.hidden=true;panel.replaceChildren();}}
function cancelDrawing(keepCandidates=false){
  const pointerId=groupDrag?.pointerId??selectionBox?.pointerId;groupDrag=null;selectionBox=null;moveArmed=false;
  $('#move-selection-btn')?.setAttribute('aria-pressed','false');
  if(pointerId!==undefined&&canvas.hasPointerCapture?.(pointerId))canvas.releasePointerCapture(pointerId);
  if(!keepCandidates)clearSelectionCandidates();
  if(endpointDrag){const id=endpointDrag.pointerId;endpointDrag=null;if(canvas.hasPointerCapture?.(id))canvas.releasePointerCapture(id);canvas.classList.remove('is-editing-endpoint');}

  wallOrigin=null;wallChainSegments=0;snapHit=null;regionStart=regionCurrent=null;regionPoints=[];syncRegionDraft();panState=null;
  wallStart=roomStart=roomCurrent=stairStart=stairCurrent=slabStart=slabCurrent=surfaceStart=surfaceCurrent=platformStart=platformCurrent=roofStart=roofCurrent=railingStart=railingCurrent=null;
}
function selectedEndpointAt(screen){
  if(selectionItems().length>1||moveArmed)return null;
  if(selected?.type!=='wall'||!['all','wall'].includes(selectionFilter))return null;
  const w=findWall(fb(),selected.id);if(!w)return null;
  let hit=null;
  for(const end of ['a','b']){const p=worldToScreen(w[end]),d=Math.hypot(screen.x-p.x,screen.y-p.y);if(d<=11&&(!hit||d<hit.d))hit={wallId:w.id,end,d};}
  return hit;
}
function beginEndpointDrag(hit,e){
  const source=floor(),targets=endpointMoveTargets(source,hit.wallId,hit.end,moveConnected);
  const wall=source.walls.find(w=>w.id===hit.wallId);
  endpointDrag={...hit,pointerId:e.pointerId,floorIndex:activeFloorIndex,targets,connected:moveConnected,origin:{...wall[hit.end]},screenStart:pointerPos(e),moved:false,result:null};
  canvas.setPointerCapture(e.pointerId);canvas.classList.add('is-editing-endpoint');
  setStatus(moveConnected?'Drag connected corner · Esc cancels · Alt bypasses snapping':'Drag selected endpoint only — connections may detach · Esc cancels');
}
function updateEndpointDrag(e){
  const drag=endpointDrag;if(!drag||drag.pointerId!==e.pointerId)return;
  const screen=pointerPos(e);
  if(!drag.moved&&Math.hypot(screen.x-drag.screenStart.x,screen.y-drag.screenStart.y)<3)return;
  drag.moved=true;
  snapHit=snapPlanPoint(screenToWorld(screen),floor().walls,{enabled:snap,grid:building.gridSize,scale:view.scale,bypass:e.altKey,excludedEndpoints:drag.targets,excludedProjections:drag.targets.map(t=>t.wallId)});
  drag.point=snapHit.point;
  drag.result=proposeEndpointMove(building,drag.floorIndex,drag.wallId,drag.end,drag.point,{connected:drag.connected});
  setStatus(drag.result.ok?`Move ${drag.result.wallIds.length} wall(s) · release to apply · Esc cancels`:'Blocked: '+drag.result.reason);
  drawPlan();
}
function finishEndpointDrag(e){
  if(!endpointDrag||endpointDrag.pointerId!==e.pointerId)return;
  updateEndpointDrag(e);const drag=endpointDrag,result=drag.result;
  cancelDrawing();
  if(result?.ok&&result.changed){
    building.floors[drag.floorIndex]=result.floor;
    commit(`Moved ${result.wallIds.length} wall(s)${result.adjustedOpenings?'; opening centers adjusted to fit':''}. Review independent footprints and roofs.`);
  }else{drawPlan();setStatus(result&&!result.ok?'Move blocked: '+result.reason:'Endpoint unchanged');}
}
function editWallCoordinate(w,end,axis,value){
  cancelDrawing();
  const result=proposeEndpointMove(building,activeFloorIndex,w.id,end,{...w[end],[axis]:value},{connected:moveConnected});
  if(!result.ok){refreshSelection();setStatus('Move blocked: '+result.reason);return;}
  if(result.changed){building.floors[activeFloorIndex]=result.floor;commit('Wall coordinates updated; review independent footprints and roofs');}
}
function drawEndpointPreview(){
  const d=endpointDrag;if(!d?.result)return;
  ctx.save();ctx.strokeStyle=d.result.ok?'#7fe1bb':'#fb928b';ctx.lineWidth=3;ctx.setLineDash([7,4]);
  for(const w of d.result.floor.walls.filter(w=>d.result.wallIds.includes(w.id))){
    const a=worldToScreen(w.a),b=worldToScreen(w.b);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
    ctx.font='12px monospace';const label=`${wallLength(w).toFixed(2)} m`,lx=(a.x+b.x)/2+8,ly=(a.y+b.y)/2-9;
    ctx.fillStyle='#14231e';ctx.fillRect(lx-4,ly-13,ctx.measureText(label).width+8,18);ctx.fillStyle=ctx.strokeStyle;ctx.fillText(label,lx,ly);
    for(const o of d.result.floor.openings.filter(o=>o.wallId===w.id)){
      const p=worldToScreen(pointOnWall(w,o.t));ctx.strokeRect(p.x-5,p.y-5,10,10);
    }
  }
  ctx.setLineDash([]);const p=worldToScreen(d.point);ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.arc(p.x,p.y,7,0,Math.PI*2);ctx.fill();ctx.restore();
}
function drawAuthoringGuides(){
  ctx.save();
  if(showJunctions&&['wall','room','select'].includes(tool))for(const j of wallJunctions(floor().walls)){
    const p=worldToScreen(j.point);ctx.fillStyle=j.kind==='open'?'#edb76c':'#7ecbb8';ctx.strokeStyle='#10241e';ctx.lineWidth=1.5;
    ctx.beginPath();ctx.arc(p.x,p.y,j.kind==='junction'?4.5:3.5,0,Math.PI*2);ctx.fill();ctx.stroke();
  }
  if(snapHit&&(tool!=='select'||endpointDrag)&&['endpoint','wall','close'].includes(snapHit.kind)){
    const p=worldToScreen(snapHit.point);ctx.strokeStyle='#fff47b';ctx.lineWidth=2;ctx.strokeRect(p.x-7,p.y-7,14,14);
    const label=snapHit.kind==='close'?'Close loop':snapHit.kind==='wall'?'Wall junction':'Endpoint';
    ctx.font='12px ui-monospace, monospace';const w=ctx.measureText(label).width+12,{w:vw,h:vh}=dims(),x=Math.max(2,Math.min(p.x+13,vw-w-2)),y=Math.max(20,Math.min(p.y-10,vh-6));
    ctx.fillStyle='#18261f';ctx.fillRect(x,y-15,w,20);ctx.fillStyle='#fff4a0';ctx.fillText(label,x+6,y);
  }
  if(tool==='select'&&selectionItems().length===1&&selected?.type==='wall'&&!endpointDrag&&!groupDrag&&!moveArmed){const w=findWall(fb(),selected.id);if(w)for(const end of ['a','b']){const p=worldToScreen(w[end]);ctx.fillStyle='#fff47b';ctx.fillRect(p.x-5,p.y-5,10,10);ctx.fillStyle='#dce9db';ctx.font='11px monospace';ctx.fillText(end==='a'?'A':'B',p.x+9,p.y-9);}}
  drawEndpointPreview();
  drawGroupGuides();
  ctx.restore();
}
function tracePlanArea(r){ctx.beginPath();areaPoints(r).forEach((p,i)=>{const q=worldToScreen(p);i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y);});ctx.closePath();}
function syncRegionDraft(){
  $('#finish-region-btn').disabled=regionPoints.length<3;
  $('#undo-region-corner-btn').disabled=!regionPoints.length;
  $('#region-draft-status').textContent=newRegionShape==='polygon'?`${regionPoints.length} corners · click the first corner, press Enter, or Finish polygon to close. Escape cancels.`:'Drag opposite corners for a rectangle, or copy a closed wall outline.';
}
function addPolygonRegion(points){
  const problem=regionPolygonProblem(points);if(problem){setStatus(problem);return false;}
  const r=polygonRegion(points,{id:uid('region'),label:`${newRegionKind[0].toUpperCase()+newRegionKind.slice(1)} ${floor().regions.length+1}`,kind:newRegionKind,effect:newRegionEffect});
  cancelDrawing();floor().regions.push(r);selected={type:'region',id:r.id};multiSelection=[];commit('Polygon region added');return true;
}
function finishPolygonRegion(){return addPolygonRegion(regionPoints);}
function undoRegionCorner(){regionPoints.pop();regionCurrent=null;syncRegionDraft();drawPlan();}
function drawRegionDraft(){
  if(!regionPoints.length)return;
  const points=[...regionPoints,...(regionCurrent?[regionCurrent]:[])];ctx.save();ctx.strokeStyle='#8bddc9';ctx.fillStyle='rgba(90,185,162,.10)';ctx.lineWidth=2;ctx.setLineDash([6,4]);
  ctx.beginPath();points.forEach((p,i)=>{const q=worldToScreen(p);i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y);});if(points.length>=3){ctx.closePath();ctx.fill();}ctx.stroke();ctx.setLineDash([]);
  regionPoints.forEach((p,i)=>{const q=worldToScreen(p);ctx.beginPath();ctx.arc(q.x,q.y,i?4:7,0,Math.PI*2);ctx.fillStyle=i?'#8bddc9':'#fff47b';ctx.fill();});ctx.restore();
}
function drawRegion(r,isSelected=false,labelBoxes=[]){
  if(r.polygon){ctx.save();tracePlanArea(r);ctx.fillStyle=r.effect==='void'?'rgba(164,119,160,.08)':'rgba(90,185,162,.06)';ctx.fill();ctx.strokeStyle=isSelected?'#fff47b':r.effect==='void'?'#b590c1':'#63ac9a';ctx.lineWidth=isSelected?3:1.5;ctx.setLineDash([6,4]);ctx.stroke();ctx.restore();}
  else drawRectEntity(r,r.effect==='void'?'rgba(164,119,160,.08)':'rgba(90,185,162,.06)',r.effect==='void'?'#b590c1':'#63ac9a',isSelected,true);
  const a=worldToScreen({x:r.minX,z:r.minZ}),b=worldToScreen({x:r.maxX,z:r.maxZ}),anchor=r.polygon?worldToScreen(regionLabelPoint(r)):null,x=anchor?.x??(a.x+b.x)/2;
  const preferred=anchor?.y??(r.effect==='solid'?a.y+24:(a.y+b.y)/2);
  ctx.save();ctx.textAlign='center';ctx.font='12px monospace';
  const name=r.label||'Region',detail=`${areaSize(r).toFixed(1)} m² · ${r.effect||'label'}`;
  const width=Math.min(b.x-a.x-16,r.polygon?regionInteriorClearance(r,regionLabelPoint(r))*view.scale*2-12:Infinity,Math.max(ctx.measureText(name).width,ctx.measureText(detail).width)+12);
  if(width<30||b.y-a.y<38){ctx.restore();return;}
  // Nested regions should not paint their names on top of each other.
  const candidates=[preferred,preferred+36,preferred-36,a.y+24,b.y-24];
  const y=candidates.find(y=>(!r.polygon||[-1,1].every(sx=>[-1,1].every(sy=>pointInRegion(r,screenToWorld({x:x+sx*width/2,y:y+sy*18})))))&&y-18>=a.y&&y+18<=b.y&&!labelBoxes.some(q=>x-width/2<q.right&&x+width/2>q.left&&y-18<q.bottom&&y+18>q.top));
  if(y===undefined){ctx.restore();return;} // Still selectable in the region list.
  labelBoxes.push({left:x-width/2,right:x+width/2,top:y-18,bottom:y+18});
  ctx.fillStyle='#14231eda';ctx.fillRect(x-width/2,y-18,width,36);
  ctx.fillStyle=isSelected?'#fff47b':'#a4d4c7';ctx.fillText(name,x,y-3,width-8);
  ctx.font='10px monospace';ctx.fillStyle='#a3b5ac';ctx.fillText(detail,x,y+13,width-8);ctx.restore();
}
function syncRegionList(){
  const list=$('#region-list');list.replaceChildren();
  for(const r of floor().regions){
    const button=document.createElement('button');button.type='button';button.className='region-item';
    button.textContent=`${r.label} · ${r.kind} · ${areaSize(r).toFixed(1)} m²`;
    button.title=`${r.label} — ${r.effect}`;button.setAttribute('aria-pressed',String(selected?.type==='region'&&selected.id===r.id));
    button.addEventListener('click',()=>{setTool('select');chooseSelection({type:'region',id:r.id});});list.append(button);
  }
  $('#region-empty').hidden=!!floor().regions.length;
}
function resizePlan(){clearSelectionCandidates();const r=canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio,2);canvas.width=Math.max(1,Math.round(r.width*d));canvas.height=Math.max(1,Math.round(r.height*d));ctx.setTransform(d,0,0,d,0,0);drawPlan();}
new ResizeObserver(resizePlan).observe(canvas.parentElement);
function dims(){const r=canvas.getBoundingClientRect();return{w:r.width,h:r.height};}
function worldToScreen(p){const{w,h}=dims();return{x:w/2+view.panX+p.x*view.scale,y:h/2+view.panY+p.z*view.scale};}
function screenToWorld(p){const{w,h}=dims();return{x:(p.x-w/2-view.panX)/view.scale,z:(p.y-h/2-view.panY)/view.scale};}
function pointerPos(e){const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}

function drawGrid(){
  const{w,h}=dims();ctx.fillStyle='#0d120e';ctx.fillRect(0,0,w,h);const g=Math.max(.1,Number(building.gridSize)||.5),px=g*view.scale,majorEvery=Math.max(1,Math.round(1/g));
  const tl=screenToWorld({x:0,y:0}),br=screenToWorld({x:w,y:h});let count=0;
  for(let x=Math.floor(tl.x/g)*g;x<=Math.ceil(br.x/g)*g+1e-6;x+=g){const s=worldToScreen({x,z:0}),major=Math.abs(Math.round(x/g))%majorEvery===0;ctx.strokeStyle=major?'#293329':'#1c241d';ctx.lineWidth=major?1:.5;ctx.beginPath();ctx.moveTo(s.x,0);ctx.lineTo(s.x,h);ctx.stroke();if(++count>600)break;}
  count=0;for(let z=Math.floor(tl.z/g)*g;z<=Math.ceil(br.z/g)*g+1e-6;z+=g){const s=worldToScreen({x:0,z}),major=Math.abs(Math.round(z/g))%majorEvery===0;ctx.strokeStyle=major?'#293329':'#1c241d';ctx.lineWidth=major?1:.5;ctx.beginPath();ctx.moveTo(0,s.y);ctx.lineTo(w,s.y);ctx.stroke();if(++count>600)break;}
  const o=worldToScreen({x:0,z:0});ctx.strokeStyle='#4c594b';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(o.x-5,o.y);ctx.lineTo(o.x+5,o.y);ctx.moveTo(o.x,o.y-5);ctx.lineTo(o.x,o.y+5);ctx.stroke();
}
function openingScreenSpan(o){const b=fb(),w=findWall(b,o.wallId);if(!w)return null;const L=wallLength(w);if(L<1e-6)return null;const half=o.width/(2*L),a=pointOnWall(w,Math.max(0,o.t-half)),c=pointOnWall(w,Math.min(1,o.t+half));return{a:worldToScreen(a),b:worldToScreen(c),center:worldToScreen(pointOnWall(w,o.t))};}
function stairEndpoints(s){const half=s.run/2;let bottom={x:s.x,z:s.z},top={x:s.x,z:s.z};if(s.direction==='north'){bottom.z+=half;top.z-=half;}if(s.direction==='south'){bottom.z-=half;top.z+=half;}if(s.direction==='east'){bottom.x-=half;top.x+=half;}if(s.direction==='west'){bottom.x+=half;top.x-=half;}return{bottom,top};}
function drawStairWithStyle(s,style={}){
  const h=stairFootprint(s),a=worldToScreen({x:h.minX,z:h.minZ}),b=worldToScreen({x:h.maxX,z:h.maxZ});
  ctx.fillStyle=style.fill||'rgba(187,142,78,.14)';ctx.strokeStyle=style.stroke||'#b88b4e';ctx.lineWidth=style.lineWidth||2;
  if(style.dash)ctx.setLineDash(style.dash);
  ctx.fillRect(a.x,a.y,b.x-a.x,b.y-a.y);ctx.strokeRect(a.x,a.y,b.x-a.x,b.y-a.y);
  const ep=stairEndpoints(s),p0=worldToScreen(ep.bottom),p1=worldToScreen(ep.top);
  if(s.style==='steps'){
    const count=Math.max(2,Math.round(Number(s.steps)||12)),dx=ep.top.x-ep.bottom.x,dz=ep.top.z-ep.bottom.z,L=Math.hypot(dx,dz)||1,nx=-dz/L,nz=dx/L,hw=(Number(s.width)||2.4)/2;
    ctx.save();ctx.globalAlpha*=.58;ctx.lineWidth=1;
    for(let i=1;i<count;i++){const t=i/count,c={x:ep.bottom.x+dx*t,z:ep.bottom.z+dz*t},q0=worldToScreen({x:c.x-nx*hw,z:c.z-nz*hw}),q1=worldToScreen({x:c.x+nx*hw,z:c.z+nz*hw});ctx.beginPath();ctx.moveTo(q0.x,q0.y);ctx.lineTo(q1.x,q1.y);ctx.stroke();}
    ctx.restore();
  }
  ctx.beginPath();ctx.moveTo(p0.x,p0.y);ctx.lineTo(p1.x,p1.y);ctx.stroke();
  const ang=Math.atan2(p1.y-p0.y,p1.x-p0.x);ctx.beginPath();ctx.moveTo(p1.x,p1.y);ctx.lineTo(p1.x-Math.cos(ang-.55)*10,p1.y-Math.sin(ang-.55)*10);ctx.moveTo(p1.x,p1.y);ctx.lineTo(p1.x-Math.cos(ang+.55)*10,p1.y-Math.sin(ang+.55)*10);ctx.stroke();
  ctx.setLineDash([]);
}
function drawStair(s,isSel=false){drawStairWithStyle(s,isSel?{fill:'rgba(255,244,123,.18)',stroke:'#fff47b',lineWidth:3}:{fill:'rgba(187,142,78,.14)',stroke:'#b88b4e',lineWidth:2});}

function drawGhostFloor(index){
  if(index<0||index>=building.floors.length)return;
  const gf=building.floors[index],gv=floorView(building,gf,index===building.floors.length-1);
  for(const r of structuralFloorRectangles(gv)){ctx.fillStyle='rgba(95,107,82,.03)';ctx.beginPath();areaPoints(r).forEach((p,i)=>{const q=worldToScreen(p);i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y);});ctx.closePath();ctx.fill();}
  for(const r of gf.slabs||[]) drawRectEntity(r,'rgba(94,167,212,.035)','rgba(94,167,212,.32)',false);
  for(const r of gf.platforms||[]) drawRectEntity(r,(r.kind==='deck'?'rgba(134,116,92,.04)':'rgba(143,126,88,.05)'),r.kind==='deck'?'rgba(167,141,102,.35)':'rgba(183,158,104,.38)',false);
  for(const r of gf.railings||[]) drawRailingEntity(r,false);
  ctx.save();ctx.globalAlpha=0.42;ctx.lineCap='square';
  for(const w of gf.walls){const a=worldToScreen(w.a),c=worldToScreen(w.b),isHalf=wallHeightFor(gv,w)<gv.wallHeight-1e-4;ctx.strokeStyle=isHalf?'#b58f62':'#899182';ctx.lineWidth=Math.max(2,building.wallThickness*view.scale*.9);if(isHalf)ctx.setLineDash([8,4]);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(c.x,c.y);ctx.stroke();ctx.setLineDash([]);}
  for(const o of gf.openings){const sp=openingScreenSpanGhost(gv,o);if(!sp)continue;ctx.strokeStyle='rgba(13,18,14,.75)';ctx.lineWidth=Math.max(5,building.wallThickness*view.scale+3);ctx.beginPath();ctx.moveTo(sp.a.x,sp.a.y);ctx.lineTo(sp.b.x,sp.b.y);ctx.stroke();ctx.strokeStyle=o.type==='door'?'rgba(210,181,101,.72)':'rgba(111,174,178,.72)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(sp.a.x,sp.a.y);ctx.lineTo(sp.b.x,sp.b.y);ctx.stroke();}
  ctx.restore();
  for(const s of gf.stairs||[])drawStairWithStyle(s,{fill:'rgba(187,142,78,.07)',stroke:'rgba(184,139,78,.55)',lineWidth:2,dash:[5,4]});
  for(const light of gf.lights||[]){const p=worldToScreen(light.position);ctx.fillStyle='rgba(255,166,87,.38)';ctx.strokeStyle='rgba(90,58,30,.35)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fill();ctx.stroke();}
}

function openingScreenSpanGhost(viewData,o){const w=findWall(viewData,o.wallId);if(!w)return null;const L=wallLength(w);if(L<1e-6)return null;const half=o.width/(2*L),a=pointOnWall(w,Math.max(0,o.t-half)),c=pointOnWall(w,Math.min(1,o.t+half));return{a:worldToScreen(a),b:worldToScreen(c),center:worldToScreen(pointOnWall(w,o.t))};}
function drawRectEntity(r,fill,stroke,isSel=false,dashed=false){const a=worldToScreen({x:r.minX,z:r.minZ}),b=worldToScreen({x:r.maxX,z:r.maxZ});ctx.fillStyle=fill;ctx.strokeStyle=isSel?'#fff47b':stroke;ctx.lineWidth=isSel?3:2;if(dashed)ctx.setLineDash([6,4]);ctx.fillRect(a.x,a.y,b.x-a.x,b.y-a.y);ctx.strokeRect(a.x,a.y,b.x-a.x,b.y-a.y);ctx.setLineDash([]);}
function drawRailingEntity(r,isSel=false){const a=worldToScreen(r.a),b=worldToScreen(r.b);ctx.strokeStyle=isSel?'#fff47b':'#d8c7a1';ctx.lineWidth=isSel?4:3;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}

function nearestRailing(screen,maxPx=10){const p=screenToWorld(screen);let best=null;for(const rail of floor().railings||[]){const pr=projectToWall({a:rail.a,b:rail.b},p),d=pr.distance*view.scale;if(d<=maxPx&&(!best||d<best.d))best={rail,d};}return best;}
function drawPlan(){
  const b=fb(),f=floor(),highlights=new Set(groupDrag?.moved?[]:selectionItems().map(selectionKey));drawGrid();
  if(showFloorBelow&&activeFloorIndex>0) drawGhostFloor(activeFloorIndex-1);
  const bb=boundsOfBuilding(b);for(const r of structuralFloorRectangles(b)){ctx.fillStyle='rgba(95,107,82,.08)';ctx.beginPath();areaPoints(r).forEach((p,i)=>{const q=worldToScreen(p);i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y);});ctx.closePath();ctx.fill();}
  ctx.fillStyle='#6f7b70';ctx.font='11px ui-monospace, monospace';ctx.fillText(`${f.label} · level ${activeFloorIndex+1}/${building.floors.length}`,10,17);
  for(const r of f.slabs||[]) drawRectEntity(r,highlights.has('slab:'+r.id)?'rgba(255,244,123,.15)':'rgba(66,103,131,.14)','#5ea7d4',highlights.has('slab:'+r.id));
  const activeFloorY=defaultManualFloorY(),activeCeilingY=defaultManualCeilingY(),surfaceTol=Math.max(.1,building.floorThickness*.75);
  for(const r of building.manualFloors||[]){const isSel=highlights.has('manualFloor:'+r.id),same=Math.abs((Number(r.topY)||0)-activeFloorY)<=surfaceTol;drawRectEntity(r,isSel?'rgba(255,244,123,.16)':same?'rgba(63,143,158,.12)':'rgba(63,143,158,.025)',same?'#58afbc':'rgba(88,175,188,.34)',isSel,true);if(isSel||same){const p=worldToScreen({x:r.minX,z:r.minZ});ctx.fillStyle=isSel?'#fff47b':'#76c0ca';ctx.font='10px ui-monospace, monospace';ctx.fillText(`${r.label||'Manual Floor'} @ ${Number(r.topY).toFixed(2)}m`,p.x+4,p.y-5);}}
  for(const r of building.manualCeilings||[]){const isSel=highlights.has('manualCeiling:'+r.id),same=Math.abs((Number(r.topY)||0)-activeCeilingY)<=surfaceTol;drawRectEntity(r,isSel?'rgba(255,244,123,.16)':same?'rgba(142,111,167,.10)':'rgba(142,111,167,.022)',same?'#a788c2':'rgba(167,136,194,.32)',isSel,true);if(isSel||same){const p=worldToScreen({x:r.minX,z:r.maxZ});ctx.fillStyle=isSel?'#fff47b':'#b69bd0';ctx.font='10px ui-monospace, monospace';ctx.fillText(`${r.label||'Manual Ceiling'} @ ${Number(r.topY).toFixed(2)}m`,p.x+4,p.y+12);}}
  for(const r of f.platforms||[]) drawRectEntity(r,highlights.has('platform:'+r.id)?'rgba(255,244,123,.15)':(r.kind==='deck'?'rgba(134,116,92,.16)':'rgba(143,126,88,.16)'),r.kind==='deck'?'#a78d66':'#b79e68',highlights.has('platform:'+r.id));
  const activeRoofY=defaultRoofBaseY();
  for(const r of building.roofSections||[]){
    const isSel=highlights.has('roofSection:'+r.id), sameLevel=Math.abs((Number(r.baseY)||0)-activeRoofY)<=Math.max(.1,building.floorThickness*.75);
    drawRectEntity(r,isSel?'rgba(255,244,123,.14)':sameLevel?'rgba(120,71,62,.11)':'rgba(120,71,62,.035)',sameLevel?'#a56e66':'rgba(143,94,88,.38)',isSel,true);
    if(isSel||sameLevel){const p=worldToScreen({x:r.minX,z:r.minZ});ctx.fillStyle=isSel?'#fff47b':'#a98780';ctx.font='10px ui-monospace, monospace';ctx.fillText(`${r.label||'Roof'} @ ${Number(r.baseY).toFixed(2)}m`,p.x+4,p.y-5);}
  }
  const regionLabelBoxes=[];
  for(const r of f.regions||[])drawRegion(r,highlights.has('region:'+r.id),regionLabelBoxes);
  for(const r of f.railings||[]) drawRailingEntity(r,highlights.has('railing:'+r.id));
  ctx.lineCap='square';for(const w of f.walls){const a=worldToScreen(w.a),c=worldToScreen(w.b),isSel=highlights.has('wall:'+w.id),isHalf=wallHeightFor(b,w)<b.wallHeight-1e-4,baseWidth=Math.max(3,building.wallThickness*view.scale);if(isSel){ctx.save();ctx.strokeStyle='rgba(255,244,123,.26)';ctx.lineWidth=baseWidth+8;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(c.x,c.y);ctx.stroke();ctx.restore();}ctx.strokeStyle=isSel?'#fff47b':isHalf?'#d8a96d':'#b5bdad';ctx.lineWidth=isSel?baseWidth+2:baseWidth;if(isHalf)ctx.setLineDash([8,4]);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(c.x,c.y);ctx.stroke();ctx.setLineDash([]);if(isSel){ctx.fillStyle='#fff47b';ctx.strokeStyle='#4c4a22';ctx.lineWidth=1.5;for(const p of[a,c]){ctx.beginPath();ctx.arc(p.x,p.y,5,0,Math.PI*2);ctx.fill();ctx.stroke();}}}
  for(const w of f.walls.filter(w=>highlights.has('wall:'+w.id)&&w.wallTypeId)){
    const state=profileWallState(b,w,exteriorWallOutsideSign,isExteriorWall),a=worldToScreen(pointOnWall(w,.3)),n=state.n,c={x:a.x+n.x*38,y:a.y+n.z*38};ctx.save();ctx.strokeStyle='#8cdde9';ctx.fillStyle='#8cdde9';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(c.x,c.y);ctx.moveTo(c.x-n.x*8-n.z*5,c.y-n.z*8+n.x*5);ctx.lineTo(c.x,c.y);ctx.lineTo(c.x-n.x*8+n.z*5,c.y-n.z*8-n.x*5);ctx.stroke();ctx.font='11px sans-serif';ctx.fillText('+ inward',c.x+6,c.y-6);ctx.restore();
  }
  for(const o of f.openings){const sp=openingScreenSpan(o);if(!sp)continue;ctx.strokeStyle='#0d120e';ctx.lineWidth=Math.max(6,building.wallThickness*view.scale+4);ctx.beginPath();ctx.moveTo(sp.a.x,sp.a.y);ctx.lineTo(sp.b.x,sp.b.y);ctx.stroke();const isSel=highlights.has('opening:'+o.id);ctx.strokeStyle=isSel?'#fff47b':o.type==='door'?'#d2b565':'#6faeb2';ctx.lineWidth=isSel?5:3;ctx.beginPath();ctx.moveTo(sp.a.x,sp.a.y);ctx.lineTo(sp.b.x,sp.b.y);ctx.stroke();}
  for(const s of f.stairs||[])drawStair(s,highlights.has('stair:'+s.id));
  for(const light of f.lights||[]){const p=worldToScreen(light.position),isSel=highlights.has('light:'+light.id);if(isSel){ctx.strokeStyle='rgba(255,174,89,.22)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(p.x,p.y,Math.max(2,(light.range||8)*view.scale),0,Math.PI*2);ctx.stroke();}ctx.fillStyle=isSel?'#fff47b':'#ffa657';ctx.strokeStyle='#5a3a1e';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(p.x,p.y,isSel?7:5,0,Math.PI*2);ctx.fill();ctx.stroke();}
  if(wallStart){const a=worldToScreen(wallStart),c=worldToScreen(roomCurrent||wallStart);ctx.strokeStyle='#d8d36b';ctx.setLineDash([7,5]);ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(c.x,c.y);ctx.stroke();ctx.setLineDash([]);}
  if(roomStart&&roomCurrent){const a=worldToScreen(roomStart),c=worldToScreen(roomCurrent);ctx.strokeStyle='#d8d36b';ctx.setLineDash([7,5]);ctx.lineWidth=2;ctx.strokeRect(a.x,a.y,c.x-a.x,c.y-a.y);ctx.setLineDash([]);}
  if(stairStart&&stairCurrent){const s=makeStair(stairStart,stairCurrent,newStairWidth,newStairStyle,newStairSteps,'');s.blockBelow=newStairBlockBelow;drawStair(s,true);}
  if(slabStart&&slabCurrent) drawRectEntity(makeRectArea(slabStart,slabCurrent,''),'rgba(94,167,212,.12)','#5ea7d4',true);
  if(surfaceStart&&surfaceCurrent&&tool==='manual-floor') drawRectEntity(makeManualSurface(surfaceStart,surfaceCurrent,'floor',newManualFloorY,newManualFloorThickness,''),'rgba(63,143,158,.12)','#58afbc',true,true);
  if(surfaceStart&&surfaceCurrent&&tool==='manual-ceiling') drawRectEntity(makeManualSurface(surfaceStart,surfaceCurrent,'ceiling',newManualCeilingY,newManualCeilingThickness,''),'rgba(142,111,167,.11)','#a788c2',true,true);
  if(platformStart&&platformCurrent) drawRectEntity(makePlatform(platformStart,platformCurrent,newPlatformType,newPlatformHeight,''),'rgba(183,158,104,.12)','#b79e68',true);
  if(roofStart&&roofCurrent) drawRectEntity(makeRoofSection(roofStart,roofCurrent,newRoofSectionType,newRoofDirection,'',newRoofBaseY,newRoofPitch,newRoofOverhang),'rgba(143,94,88,.08)','#8f5e58',true,true);
  if(railingStart&&railingCurrent) drawRailingEntity(makeRailing(railingStart,railingCurrent,'',newRailingHeight,newRailingStyle),true);
  drawRegionDraft();
  if(regionStart&&regionCurrent)drawRegion(makeRegion(regionStart,regionCurrent,'New region',newRegionKind,newRegionEffect),true);
  drawPlanMarkers();
  drawRouteOverlay();
  drawSelectedArea();
  drawAuthoringGuides();
}

function nearestWall(p,maxPx=12){let best=null;for(const w of floor().walls){const pr=projectToWall(w,p),d=pr.distance*view.scale;if(d<=maxPx&&(!best||d<best.d))best={wall:w,...pr,d};}return best;}
function nearestOpening(screen,maxPx=13){let best=null;for(const o of floor().openings){const sp=openingScreenSpan(o);if(!sp)continue;const d=projectToWall({a:{x:sp.a.x,z:sp.a.y},b:{x:sp.b.x,z:sp.b.y}},{x:screen.x,z:screen.y}).distance;if(d<=maxPx&&(!best||d<best.d))best={opening:o,d};}return best;}
function nearestLight(screen,maxPx=12){let best=null;for(const light of floor().lights){const p=worldToScreen(light.position),d=Math.hypot(screen.x-p.x,screen.y-p.y);if(d<=maxPx&&(!best||d<best.d))best={light,d};}return best;}
function nearestStair(screen){const p=screenToWorld(screen);let best=null;for(const stair of floor().stairs){const d=stairPickDistance(stair,p,view.scale);if(d!==null&&(!best||d<best.d||(d===best.d&&String(stair.id)<String(best.stair.id))))best={stair,d};}return best;}
function selectedDescription(sel=selected){
  if(!sel)return 'Nothing selected';
  if(sel.type==='wall')return 'Wall';
  if(sel.type==='light')return 'Light';
  if(sel.type==='marker')return 'Marker';
  if(sel.type==='stair')return floor().stairs.find(s=>s.id===sel.id)?.style==='steps'?'Stair':'Ramp';
  if(sel.type==='region')return 'Region';
  if(sel.type==='slab')return 'Floor footprint';
  if(sel.type==='manualFloor')return 'Manual floor';
  if(sel.type==='manualCeiling')return 'Manual ceiling';
  if(sel.type==='platform')return 'Porch / deck';
  if(sel.type==='roofSection')return 'Roof section';
  if(sel.type==='railing')return 'Railing';
  if(sel.type==='opening'){
    const o=floor().openings.find(x=>x.id===sel.id);
    return o?.type==='window'?'Window':'Door';
  }
  return 'Object';
}
function renderSelection(statusText=null){
  syncRegionList();syncMarkerList();
  drawPlan();
  try{refreshSelection();}
  catch(err){console.error('Selection UI failed',err);const form=$('#selection-form'),empty=$('#selection-empty');if(empty)empty.hidden=true;if(form){form.hidden=false;form.innerHTML=`<div class="muted">${selectedDescription()} selected, but its property controls could not be rendered.</div>`;}setStatus(`Selection UI error: ${err.message}`);return;}
  if(statusText)setStatus(statusText);
}
function selectionEntity(sel=selected){
  if(!sel)return null;
  const list={wall:floor().walls,opening:floor().openings,light:floor().lights,marker:floor().markers||[],stair:floor().stairs,railing:floor().railings,region:floor().regions,slab:floor().slabs,platform:floor().platforms,manualFloor:building.manualFloors,manualCeiling:building.manualCeilings,roofSection:building.roofSections}[sel.type];
  return list?.find(o=>o.id===sel.id);
}
function selectionCaption(sel=selected){
  const entity=selectionEntity(sel);if(!entity)return selectedDescription(sel);
  const kind=selectedDescription(sel),name=entity.label||kind;
  const y=sel.type==='roofSection'?entity.baseY:['manualFloor','manualCeiling'].includes(sel.type)?entity.topY:null;
  return `${kind} · ${name}${Number.isFinite(y)?' @ '+y.toFixed(2)+' m':''}`;
}
function renderSelectionCandidates(){
  const panel=$('#selection-candidates');panel.replaceChildren();panel.hidden=selectionCandidates.length<2;
  if(panel.hidden)return;
  const help=document.createElement('p');help.className='muted compact-help';help.textContent=`${selectionCandidates.length} areas at this point. Choose one, or click the same spot to cycle. Shift-click a choice to add/remove it.`;panel.append(help);
  for(const candidate of selectionCandidates){
    const button=document.createElement('button');button.type='button';button.textContent=selectionCaption(candidate);
    button.setAttribute('aria-pressed',String(selectionItems().some(s=>selectionKey(s)===selectionKey(candidate))));
    button.addEventListener('click',e=>{selectionIntent={toggle:!!e.shiftKey};try{chooseSelection({type:candidate.type,id:candidate.id},true);}finally{selectionIntent=null;}});panel.append(button);
  }
}
function chooseSelection(next,keepCandidates=false){
  if(groupDrag||selectionBox)cancelDrawing();
  lastPick=next;
  if(selectionIntent?.toggle){const items=selectionItems(),key=next&&selectionKey(next);return setGroupSelection(!next?items:items.some(s=>selectionKey(s)===key)?items.filter(s=>selectionKey(s)!==key):[...items,next],keepCandidates);}
  if(selectionIntent?.preserve&&next&&selectionItems().some(s=>selectionKey(s)===selectionKey(next)))return;
  multiSelection=[];moveArmed=false;
  if(!keepCandidates)clearSelectionCandidates();
  selected=next;renderSelection(next?`Selected ${selectionCaption(next)}`:'Nothing selected');renderSelectionCandidates();
}
function drawSelectedArea(){
  if(selectionItems().length>1||groupDrag?.moved)return;
  if(!['slab','region','platform','roofSection','manualFloor','manualCeiling'].includes(selected?.type))return;
  const entity=selectionEntity();if(!entity||!rectValid(entity))return;
  const a=worldToScreen({x:entity.minX,z:entity.minZ}),b=worldToScreen({x:entity.maxX,z:entity.maxZ}),{w,h}=dims();
  ctx.save();ctx.setLineDash([]);ctx.strokeStyle='#111811';ctx.lineWidth=6;tracePlanArea(entity);ctx.stroke();ctx.strokeStyle='#fff47b';ctx.lineWidth=2;ctx.stroke();
  ctx.font='12px ui-monospace, monospace';let label=selectionCaption();const maxWidth=Math.max(24,w-36);
  while(label.length>1&&ctx.measureText(label).width>maxWidth)label=label.slice(0,-2)+'…';
  const width=ctx.measureText(label).width+16,x=Math.max(8,Math.min(w-width-8,a.x)),y=Math.max(28,Math.min(h-34,a.y-28));
  ctx.fillStyle='#111811';ctx.fillRect(x,y,width,24);ctx.strokeStyle='#fff47b';ctx.lineWidth=1;ctx.strokeRect(x,y,width,24);ctx.fillStyle='#fff47b';ctx.fillText(label,x+8,y+16);ctx.restore();
}
function selectAt(screen){
  const marker=nearestMarker(screen);if(marker&&['all','marker'].includes(selectionFilter))return chooseSelection({type:'marker',id:marker.id});
  // Selection priority is intentional: precise point/line entities win over large filled areas.
  const light=nearestLight(screen);if(light&&['all','light'].includes(selectionFilter))return chooseSelection({type:'light',id:light.light.id});
  const op=nearestOpening(screen);if(op&&['all','opening'].includes(selectionFilter))return chooseSelection({type:'opening',id:op.opening.id});
  const w=nearestWall(screenToWorld(screen));if(w&&['all','wall'].includes(selectionFilter))return chooseSelection({type:'wall',id:w.wall.id});
  const rail=nearestRailing(screen);if(rail&&['all','railing'].includes(selectionFilter))return chooseSelection({type:'railing',id:rail.rail.id});
  const stair=nearestStair(screen);if(stair&&['all','stair'].includes(selectionFilter))return chooseSelection({type:'stair',id:stair.stair.id});
  const groups=[],addArea=(type,list)=>{if(['all','areas',type].includes(selectionFilter))groups.push([type,list]);};
  addArea('region',floor().regions);addArea('slab',floor().slabs);addArea('platform',floor().platforms);addArea('manualFloor',building.manualFloors);addArea('manualCeiling',building.manualCeilings);addArea('roofSection',building.roofSections);
  const areaCandidates=areaSelectionCandidates(groups,screenToWorld(screen),view.scale,{roofSection:defaultRoofBaseY(),manualFloor:defaultManualFloorY(),manualCeiling:defaultManualCeilingY(),tolerance:Math.max(.1,building.floorThickness*.75)});
  if(areaCandidates.length){
    const key=areaCandidates.map(a=>`${a.type}:${a.id}`).sort().join('|');
    const same=lastAreaSelection&&lastAreaSelection.key===key&&Math.hypot(lastAreaSelection.x-screen.x,lastAreaSelection.y-screen.y)<=7;
    const previous=areaCandidates.findIndex(a=>a.type===selected?.type&&a.id===selected.id);
    const index=same&&previous>=0?(previous+1)%areaCandidates.length:0;
    if(!same)lastAreaSelection={x:screen.x,y:screen.y,key};
    selectionCandidates=areaCandidates.map(({type,id})=>({type,id}));
    return chooseSelection(selectionCandidates[index],true);
  }
  chooseSelection(null);
}
function deleteSelectedEntity(){cancelDrawing();if(!selected)return false;const group=selectionItems();if(group.length>1){building=removeGroupSelection(building,activeFloorIndex,group);multiSelection=[];selected=null;commit(`${group.length} selected objects deleted`);return true;}const label=selectedDescription(),f=floor();if(selected.type==='wall'){f.walls=f.walls.filter(w=>w.id!==selected.id);f.openings=f.openings.filter(o=>o.wallId!==selected.id);}else if(selected.type==='marker')f.markers=f.markers.filter(m=>m.id!==selected.id);else if(selected.type==='light')f.lights=f.lights.filter(l=>l.id!==selected.id);else if(selected.type==='stair')f.stairs=f.stairs.filter(s=>s.id!==selected.id);else if(selected.type==='region')f.regions=f.regions.filter(r=>r.id!==selected.id);else if(selected.type==='slab')f.slabs=f.slabs.filter(r=>r.id!==selected.id);else if(selected.type==='platform')f.platforms=f.platforms.filter(r=>r.id!==selected.id);else if(selected.type==='manualFloor')building.manualFloors=building.manualFloors.filter(r=>r.id!==selected.id);else if(selected.type==='manualCeiling')building.manualCeilings=building.manualCeilings.filter(r=>r.id!==selected.id);else if(selected.type==='roofSection'){building.roofSections=building.roofSections.filter(r=>r.id!==selected.id);for(const r of building.roofSections)if(r.hostRoofId===selected.id)delete r.hostRoofId;}else if(selected.type==='railing')f.railings=f.railings.filter(r=>r.id!==selected.id);else f.openings=f.openings.filter(o=>o.id!==selected.id);selected=null;commit(`${label} deleted`);return true;}
function beginSelectionGesture(e){
  const sp=pointerPos(e),prior=[...selectionItems()];
  if(moveArmed&&prior.length){groupDrag={pointerId:e.pointerId,origin:screenToWorld(sp),screen:sp,items:prior,moved:false,result:null};canvas.setPointerCapture(e.pointerId);return;}
  if(!e.shiftKey){const endpoint=selectedEndpointAt(sp);if(endpoint){beginEndpointDrag(endpoint,e);return;}}
  selectionIntent={toggle:!!e.shiftKey,preserve:prior.length>1};
  try{selectAt(sp);}finally{selectionIntent=null;}
  if(!lastPick){selectionBox={pointerId:e.pointerId,start:screenToWorld(sp),end:screenToWorld(sp),screen:sp,prior:e.shiftKey?prior:[],moved:false};canvas.setPointerCapture(e.pointerId);}
  else if(!e.shiftKey){groupDrag={pointerId:e.pointerId,origin:screenToWorld(sp),screen:sp,items:[...selectionItems()],moved:false,result:null};canvas.setPointerCapture(e.pointerId);}
}
function updateSelectionGesture(e){
  const drag=groupDrag||selectionBox;if(!drag||drag.pointerId!==e.pointerId)return;
  const sp=pointerPos(e);if(!drag.moved&&Math.hypot(sp.x-drag.screen.x,sp.y-drag.screen.y)<3)return;
  drag.moved=true;const point=screenToWorld(sp);
  if(selectionBox){drag.end=point;setStatus('Box-select fully enclosed objects · Shift adds · Esc cancels');}
  else{
    let x=point.x-drag.origin.x,z=point.z-drag.origin.z;
    if(snap&&!e.altKey){const grid=building.gridSize;x=Math.round(x/grid)*grid;z=Math.round(z/grid)*grid;}
    drag.result=proposeGroupMove(building,activeFloorIndex,drag.items,{x,z},{connected:keepGroupJoints});
    setStatus(drag.result.ok?`Move ${drag.items.length} selected · X ${x.toFixed(2)} m · Z ${z.toFixed(2)} m · release to apply`:'Move blocked: '+drag.result.reason);
  }
  drawPlan();
}
function finishSelectionGesture(e){
  const gesture=groupDrag||selectionBox;if(!gesture||gesture.pointerId!==e.pointerId)return;
  updateSelectionGesture(e);
  const box=selectionBox,result=groupDrag?.result;
  const items=box&&box.moved?selectionInBox(building,activeFloorIndex,{minX:Math.min(box.start.x,box.end.x),maxX:Math.max(box.start.x,box.end.x),minZ:Math.min(box.start.z,box.end.z),maxZ:Math.max(box.start.z,box.end.z)},selectionFilter):[];
  const prior=box?.prior||[];cancelDrawing(!box&&!gesture.moved);
  if(box)setGroupSelection([...prior,...items]);
  else if(result?.ok&&result.changed){building=result.building;commit(`Moved ${gesture.items.length} selected objects. Wall openings follow their hosts.`);}
  else{refreshSelection();drawPlan();if(result&&!result.ok)setStatus('Move blocked: '+result.reason);}
}
function drawGroupGuides(){
  const candidate=groupDrag?.result?.building||building,items=selectionItems();
  ctx.save();ctx.strokeStyle=groupDrag?.result&&!groupDrag.result.ok?'#fb928b':'#fff47b';ctx.lineWidth=3;
  ctx.lineCap='butt';if(groupDrag?.moved)ctx.setLineDash([7,6]);
  const outlines=[...items,...(groupDrag?.result?.wallIds||[]).filter(id=>!items.some(s=>s.type==='wall'&&s.id===id)).map(id=>({type:'wall',id}))];
  for(const s of outlines){
    const entity=groupEntity(candidate,activeFloorIndex,s),r=selectionBounds(candidate,activeFloorIndex,s);if(!entity||!r)continue;
    if(s.type==='wall'||s.type==='railing'){
      const a=worldToScreen(entity.a),b=worldToScreen(entity.b);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
    }else if(entity.polygon){tracePlanArea(entity);ctx.stroke();}else{const a=worldToScreen({x:r.minX,z:r.minZ}),b=worldToScreen({x:r.maxX,z:r.maxZ});ctx.strokeRect(a.x-3,a.y-3,Math.max(6,b.x-a.x+6),Math.max(6,b.y-a.y+6));}
  }
  if(selectionBox?.moved){const a=worldToScreen(selectionBox.start),b=worldToScreen(selectionBox.end);ctx.setLineDash([5,4]);ctx.strokeStyle='#7fe1bb';ctx.fillStyle='rgba(127,225,187,.08)';ctx.fillRect(a.x,a.y,b.x-a.x,b.y-a.y);ctx.strokeRect(a.x,a.y,b.x-a.x,b.y-a.y);}
  ctx.restore();
}
$('#select-all-btn').addEventListener('click',()=>{setTool('select');setGroupSelection(selectableItems(building,activeFloorIndex,selectionFilter));});
$('#clear-selection-btn').addEventListener('click',()=>{cancelDrawing();setGroupSelection([]);});
$('#delete-group-btn').addEventListener('click',deleteSelectedEntity);
$('#group-keep-joints').addEventListener('change',e=>{cancelDrawing();keepGroupJoints=e.target.checked;refreshSelection();drawPlan();});
$('#move-selection-btn').addEventListener('click',()=>{const armed=moveArmed;setTool('select');cancelDrawing();moveArmed=!armed&&selectionItems().length>0;refreshSelection();setStatus(moveArmed?'Drag anywhere on the plan to move the selection · Esc cancels':'Move tool cancelled');});
$('#apply-group-offset').addEventListener('click',()=>{
  cancelDrawing();const x=$('#group-dx'),z=$('#group-dz');
  if(x.value.trim()===''||z.value.trim()===''){setStatus('Enter both movement offsets');return;}
  const result=proposeGroupMove(building,activeFloorIndex,selectionItems(),{x:x.valueAsNumber,z:z.valueAsNumber},{connected:keepGroupJoints});
  if(!result.ok){setStatus('Move blocked: '+result.reason);return;}
  if(result.changed){building=result.building;x.value=z.value='0';commit('Selection moved');}
});
function nearestMarker(screen){
  let found=null,distance=12;for(const marker of floor().markers||[]){const p=worldToScreen(marker.position),d=Math.hypot(p.x-screen.x,p.y-screen.y);if(d<=distance){found=marker;distance=d;}}return found;
}
// Outline floor areas the route check could not reach on the active floor.
function drawRouteOverlay(){
  if(!routeResult||!$('#route-check-toggle').checked)return;
  const id=floor().id;ctx.save();ctx.setLineDash([6,4]);ctx.lineWidth=2;ctx.font='11px ui-monospace, monospace';
  for(const u of routeResult.unreachable.filter(q=>q.floorId===id)){
    const a=worldToScreen({x:u.bounds.minX,z:u.bounds.minZ}),c=worldToScreen({x:u.bounds.maxX,z:u.bounds.maxZ});
    ctx.fillStyle='rgba(255,107,107,.14)';ctx.fillRect(a.x,a.y,c.x-a.x,c.y-a.y);ctx.strokeStyle='#ff6b6b';ctx.strokeRect(a.x,a.y,c.x-a.x,c.y-a.y);
    ctx.fillStyle='#ff8f8f';ctx.fillText(`Unreachable ${u.area.toFixed(1)} m²`,a.x+4,a.y+13);
  }
  // Route start points on this floor: green if on walkable floor, red if not.
  ctx.setLineDash([]);
  for(const s of (routeResult.starts||[]).filter(q=>q.floorId===id)){
    const p=worldToScreen(s);ctx.beginPath();ctx.arc(p.x,p.y,6,0,Math.PI*2);ctx.fillStyle=s.ok?'#5ee08a':'#ff6b6b';ctx.fill();ctx.strokeStyle='#0b1418';ctx.stroke();
    ctx.fillStyle=s.ok?'#8ff0b0':'#ff8f8f';ctx.fillText('Route start',p.x+9,p.y+4);
  }
  ctx.restore();
}
function drawPlanMarkers(){
  ctx.save();ctx.setLineDash([]);ctx.font='12px sans-serif';
  for(const marker of floor().markers||[]){
    const p=worldToScreen(marker.position),isSelected=!groupDrag?.moved&&selectionItems().some(s=>s.type==='marker'&&s.id===marker.id);
    ctx.strokeStyle=isSelected?'#fff47b':'#d69cfa';ctx.fillStyle='#241730';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(p.x,p.y-8);ctx.lineTo(p.x+8,p.y);ctx.lineTo(p.x,p.y+8);ctx.lineTo(p.x-8,p.y);ctx.closePath();ctx.fill();ctx.stroke();
    let label=marker.label;while(label.length>1&&ctx.measureText(label).width>180)label=label.slice(0,-2)+'…';
    const width=ctx.measureText(label).width+10,{w,h}=dims(),x=Math.max(2,Math.min(w-width-2,p.x+12)),y=Math.max(20,Math.min(h-4,p.y-10));
    ctx.fillStyle='#17121e';ctx.fillRect(x,y-15,width,20);ctx.fillStyle=isSelected?'#fff47b':'#e3baff';ctx.fillText(label,x+5,y);
  }
  ctx.restore();
}
function syncMarkerList(){
  const list=$('#marker-list');list.replaceChildren();const markers=floor().markers||[];$('#marker-empty').hidden=markers.length>0;
  for(const marker of markers){
    const button=document.createElement('button');button.type='button';button.textContent=marker.label;button.title=marker.details||'Select marker';
    button.setAttribute('aria-pressed',String(selectionItems().some(s=>s.type==='marker'&&s.id===marker.id)));
    button.addEventListener('click',e=>{setTool('select');selectionIntent={toggle:!!e.shiftKey};try{chooseSelection({type:'marker',id:marker.id});}finally{selectionIntent=null;}});list.append(button);
  }
}
function markerNotesInput(value,onChange){
  const label=document.createElement('label');label.textContent='Notes (JSON only)';const input=document.createElement('textarea');input.value=value;input.rows=3;input.maxLength=2000;
  input.addEventListener('change',()=>onChange(input.value));label.append(input);return label;
}
function addMarkerAt(screen,e){
  const p=snapPoint(screenToWorld(screen),e),marker={id:uid('marker'),label:`Marker ${(floor().markers||[]).length+1}`,details:'',position:{x:p.x,y:newMarkerHeight,z:p.z}};
  const problem=markerProblem(marker);if(problem){setStatus(problem);return;}
  (floor().markers??=[]).push(marker);selected={type:'marker',id:marker.id};commit('Marker placed — name it and add optional JSON notes in Selection');
}
$('#new-marker-height').addEventListener('change',e=>{const v=e.target.valueAsNumber;if(e.target.value.trim()===''||!Number.isFinite(v)||Math.abs(v)>1e6){e.target.value=newMarkerHeight;setStatus('Enter a finite marker height within ±1,000,000 m');return;}newMarkerHeight=v;});
function addLightAt(screen,e){const p=snapPoint(screenToWorld(screen),e),light=makeOmniLight(p.x,p.z,newLightHeight,`Light ${floor().lights.length+1}`);floor().lights.push(light);selected={type:'light',id:light.id};commit('Omni light added');}
function updateOpening(o,patch,status='Opening updated'){const b=fb(),candidate={...o,...patch};applyOpeningConstraints(b,candidate);const conflict=findOpeningConflict(b,candidate,o.id);if(conflict){setStatus(`Opening blocked: overlaps ${conflict.label||conflict.type}`);refreshSelection();drawPlan();return false;}const wall=findWall(b,o.wallId),type=wallTypeFor(b,wall),problem=type&&wallTypeOpeningProblem(type,wallHeightFor(b,wall),candidate,b.wallThickness,b);if(problem){setStatus(problem);refreshSelection();return false;}if(candidate.shapeId||b.walls.some(w=>w.wallTypeId)){const proposed=structuredClone(building);Object.assign(proposed.floors[activeFloorIndex].openings.find(q=>q.id===o.id),candidate);const errors=validateBuilding(proposed).errors;if(errors.length){setStatus(errors[0].message);refreshSelection();return false;}}Object.assign(o,candidate);commit(status);return true;}
function addOpeningAt(type,screen){const b=fb(),hit=nearestWall(screenToWorld(screen));if(!hit)return;if(wallLength(hit.wall)<.08){setStatus('Wall is too short for an opening');return;}const o={id:uid(type),type,wallId:hit.wall.id,t:hit.t,width:type==='door'?1:1.3,height:type==='door'?2.1:1.05,label:type==='door'?'Door':'Window'};if(type==='window'){o.sill=.9;o.windowStyle=newWindowStyle;}if(type==='door'){o.doorStyle=newDoorStyle;if(newOpeningShapeId)o.shapeId=newOpeningShapeId;}applyOpeningConstraints(b,o);const conflict=findOpeningConflict(b,o,null);if(conflict){setStatus(`Cannot place opening here: overlaps ${conflict.label||conflict.type}`);return;}const typeProfile=wallTypeFor(b,hit.wall),problem=typeProfile&&wallTypeOpeningProblem(typeProfile,wallHeightFor(b,hit.wall),o,b.wallThickness,b);if(problem){setStatus(problem);return;}floor().openings.push(o);if(o.shapeId||b.walls.some(w=>w.wallTypeId)){const errors=validateBuilding(building).errors;if(errors.length){floor().openings.pop();setStatus(errors[0].message);return;}}selected={type:'opening',id:o.id};commit(`${type==='door'?'Door':'Window'} added`);}

canvas.addEventListener('pointerdown',e=>{if(endpointDrag||groupDrag||selectionBox)return;const sp=pointerPos(e);if(e.button===1){clearSelectionCandidates();e.preventDefault();panState={x:e.clientX,y:e.clientY,px:view.panX,py:view.panY};canvas.setPointerCapture(e.pointerId);return;}if(e.button!==0||endpointDrag)return;if(tool==='select'){beginSelectionGesture(e);return;}const wp=snapPoint(screenToWorld(sp),e);if(tool==='select')selectAt(sp);else if(tool==='door'||tool==='window')addOpeningAt(tool,sp);else if(tool==='light')addLightAt(sp,e);else if(tool==='marker')addMarkerAt(sp,e);else if(tool==='wall'){
  if(!wallStart){wallStart={...wp};wallOrigin={...wp};wallChainSegments=0;roomCurrent=wp;setStatus('Choose wall endpoint — snap to the first point to close the loop');drawPlan();}
  else{
    const problem=wallSegmentProblem(wallStart,wp,floor().walls);
    if(problem){setStatus(problem);return;}
    const w={id:uid('wall'),a:{...wallStart},b:{...wp},label:'',role:newWallRole,height:newWallHeightMode==='half'?fb().wallHeight/2:null};
    if(newWallTypeId)w.wallTypeId=newWallTypeId;
    floor().walls.push(w);const issues=validateBuilding(building).errors;if(issues.length){floor().walls.pop();setStatus(issues[0].message);return;}selected={type:'wall',id:w.id};wallChainSegments++;
    const closed=wallChainSegments>=3&&samePoint(wp,wallOrigin);
    if(closed)cancelDrawing();else{wallStart={...wp};roomCurrent=wp;}
    commit(closed?'Wall loop closed — click to start another':'Wall added — click next point, Esc to finish');
  }
}else if(tool==='region'){
  if(newRegionShape==='polygon'){
    if(regionPoints.length>=3&&Math.hypot(wp.x-regionPoints[0].x,wp.z-regionPoints[0].z)*view.scale<=10){finishPolygonRegion();return;}
    if(regionPoints.length>=256){setStatus('Polygon regions support at most 256 corners.');return;}
    if(regionPoints.some(p=>Math.hypot(p.x-wp.x,p.z-wp.z)<.001)){setStatus('Choose a different corner or finish the polygon.');return;}
    regionPoints.push({...wp});regionCurrent=null;syncRegionDraft();drawPlan();
  }else{regionStart=wp;regionCurrent=wp;canvas.setPointerCapture(e.pointerId);}
}else if(tool==='room'){roomStart=wp;roomCurrent=wp;canvas.setPointerCapture(e.pointerId);}else if(tool==='stair'){if(activeFloorIndex>=building.floors.length-1){setStatus('Add an upper floor before placing stairs');return;}stairStart=wp;stairCurrent=wp;canvas.setPointerCapture(e.pointerId);}else if(tool==='slab'){slabStart=wp;slabCurrent=wp;canvas.setPointerCapture(e.pointerId);}else if(tool==='manual-floor'||tool==='manual-ceiling'){surfaceStart=wp;surfaceCurrent=wp;canvas.setPointerCapture(e.pointerId);}else if(tool==='platform'){platformStart=wp;platformCurrent=wp;canvas.setPointerCapture(e.pointerId);}else if(tool==='roof'){roofStart=wp;roofCurrent=wp;canvas.setPointerCapture(e.pointerId);}else if(tool==='railing'){railingStart=wp;railingCurrent=wp;canvas.setPointerCapture(e.pointerId);}});
canvas.addEventListener('pointermove',e=>{if(groupDrag||selectionBox){updateSelectionGesture(e);return;}if(endpointDrag){updateEndpointDrag(e);return;}canvas.style.cursor=tool==='select'&&selectedEndpointAt(pointerPos(e))?'move':'';if(panState){view.panX=panState.px+(e.clientX-panState.x);view.panY=panState.py+(e.clientY-panState.y);drawPlan();return;}const wp=snapPoint(screenToWorld(pointerPos(e)),e);if(regionPoints.length||regionStart||snapHit||wallStart||roomStart||stairStart||slabStart||surfaceStart||platformStart||roofStart||railingStart){if(regionStart||regionPoints.length)regionCurrent=wp;if(wallStart||roomStart)roomCurrent=wp;if(stairStart)stairCurrent=wp;if(slabStart)slabCurrent=wp;if(surfaceStart)surfaceCurrent=wp;if(platformStart)platformCurrent=wp;if(roofStart)roofCurrent=wp;if(railingStart)railingCurrent=wp;drawPlan();}});
canvas.addEventListener('pointerup',e=>{if(groupDrag||selectionBox){finishSelectionGesture(e);return;}if(endpointDrag){finishEndpointDrag(e);return;}if(panState){panState=null;return;}const wp=snapPoint(screenToWorld(pointerPos(e)),e);if(tool==='region'&&regionStart){
  const r=makeRegion(regionStart,wp,`${newRegionKind[0].toUpperCase()+newRegionKind.slice(1)} ${floor().regions.length+1}`,newRegionKind,newRegionEffect);
  regionStart=regionCurrent=null;
  if(rectValid(r)){floor().regions.push(r);selected={type:'region',id:r.id};commit('Region added');}else{setStatus('Drag a region with positive width and depth');drawPlan();}
}if(tool==='room'&&roomStart){const before=structuredClone(building),walls=addRoom(fb(),roomStart,wp,newWallRole,newWallHeightMode==='half'?fb().wallHeight/2:null);if(newWallTypeId)for(const w of walls)w.wallTypeId=newWallTypeId;roomStart=null;roomCurrent=null;const errors=validateBuilding(building).errors;if(errors.length){building=before;setStatus(errors[0].message);drawPlan();}else commit('Room rectangle added');}if(tool==='stair'&&stairStart){const run=Math.max(Math.abs(wp.x-stairStart.x),Math.abs(wp.z-stairStart.z));if(run>=1){const label=`${newStairStyle==='steps'?'Staircase':'Ramp'} ${floor().stairs.length+1}`,stair=makeStair(stairStart,wp,newStairWidth,newStairStyle,newStairSteps,label);stair.blockBelow=newStairBlockBelow;floor().stairs.push(stair);selected={type:'stair',id:stair.id};commit(`${newStairStyle==='steps'?'Staircase':'Ramp'} added`);}else setStatus('Stair run must be at least 1 m');stairStart=null;stairCurrent=null;drawPlan();}if(tool==='slab'&&slabStart){const rect=makeRectArea(slabStart,wp,`Floor Footprint ${floor().slabs.length+1}`);if(rectValid(rect)){floor().slabs.push(rect);selected={type:'slab',id:rect.id};commit('Automatic floor footprint added');}slabStart=null;slabCurrent=null;drawPlan();}if((tool==='manual-floor'||tool==='manual-ceiling')&&surfaceStart){const isCeiling=tool==='manual-ceiling',list=isCeiling?building.manualCeilings:building.manualFloors,topY=isCeiling?newManualCeilingY:newManualFloorY,thickness=isCeiling?newManualCeilingThickness:newManualFloorThickness,kind=isCeiling?'ceiling':'floor';const rect=makeManualSurface(surfaceStart,wp,kind,topY,thickness,`${isCeiling?'Manual Ceiling':'Manual Floor'} ${list.length+1}`);if(rectValid(rect)){list.push(rect);selected={type:isCeiling?'manualCeiling':'manualFloor',id:rect.id};commit(`${isCeiling?'Manual ceiling':'Manual floor'} added`);}surfaceStart=null;surfaceCurrent=null;drawPlan();}if(tool==='platform'&&platformStart){const rect=makePlatform(platformStart,wp,newPlatformType,newPlatformHeight,`${newPlatformType==='deck'?'Deck':'Porch'} ${floor().platforms.length+1}`);addDrawnPlatform(rect);platformStart=null;platformCurrent=null;drawPlan();}if(tool==='roof'&&roofStart){const rect=makeRoofSection(roofStart,wp,newRoofSectionType,newRoofDirection,`Roof ${building.roofSections.length+1}`,newRoofBaseY,newRoofPitch,newRoofOverhang);rect.gableEnds=newRoofGableEnds;if(rectValid(rect)){building.roofSections.push(rect);selected={type:'roofSection',id:rect.id};commit('Independent roof added');}roofStart=null;roofCurrent=null;drawPlan();}if(tool==='railing'&&railingStart){const rail=makeRailing(railingStart,wp,`Railing ${floor().railings.length+1}`,newRailingHeight,newRailingStyle);if(wallLength({a:rail.a,b:rail.b})>=0.4){floor().railings.push(rail);selected={type:'railing',id:rail.id};commit('Railing added');}railingStart=null;railingCurrent=null;drawPlan();}});
canvas.addEventListener('contextmenu',e=>{e.preventDefault();cancelDrawing();drawPlan();setStatus('Drawing cancelled');});
canvas.addEventListener('lostpointercapture',e=>{if(groupDrag?.pointerId===e.pointerId||selectionBox?.pointerId===e.pointerId){cancelDrawing();drawPlan();setStatus('Move cancelled');}if(endpointDrag?.pointerId===e.pointerId){cancelDrawing();drawPlan();setStatus('Endpoint move cancelled');}});
window.addEventListener('blur',()=>{cancelDrawing();drawPlan();});
canvas.addEventListener('pointercancel',()=>{cancelDrawing();drawPlan();setStatus('Drawing cancelled');});
canvas.addEventListener('pointerleave',()=>{if(!panState&&!regionStart&&!roomStart&&!stairStart&&!slabStart&&!surfaceStart&&!platformStart&&!roofStart&&!railingStart){snapHit=null;drawPlan();}});
canvas.addEventListener('wheel',e=>{e.preventDefault();if(groupDrag||selectionBox||endpointDrag)return;clearSelectionCandidates();const before=screenToWorld(pointerPos(e)),factor=e.deltaY<0?1.12:.89;view.scale=Math.max(12,Math.min(180,view.scale*factor));const after=worldToScreen(before),p=pointerPos(e);view.panX+=p.x-after.x;view.panY+=p.y-after.y;drawPlan();},{passive:false});
window.addEventListener('keydown',e=>{if(wallTypeEditor?.isOpen()||openingShapeEditor?.isOpen())return;if(e.key!=='Escape'&&(e.target?.matches?.('input,select,textarea')||e.target?.isContentEditable))return;const mod=e.ctrlKey||e.metaKey;if(tool==='region'&&newRegionShape==='polygon'&&regionPoints.length&&!mod){if(e.key==='Enter'){e.preventDefault();finishPolygonRegion();return;}if(e.key==='Backspace'){e.preventDefault();undoRegionCorner();return;}}if(mod&&!e.altKey&&e.key.toLowerCase()==='z'){e.preventDefault();restoreHistory(e.shiftKey?'redo':'undo');return;}if(mod&&!e.altKey&&e.key.toLowerCase()==='y'){e.preventDefault();restoreHistory('redo');return;}if(e.key==='Delete'){const tag=e.target?.tagName?.toLowerCase();if(tag==='input'||tag==='select'||tag==='textarea'||e.target?.isContentEditable)return;if(selected){e.preventDefault();deleteSelectedEntity();}return;}if(e.key==='Escape'){$('.file-menu').open=false;cancelDrawing();if(tool!=='select'){setTool('select');}else{setStatus(selected?`Selected ${selectedDescription()}`:'Ready');drawPlan();}}});
function syncToolOptionVisibility(){const groups=[...document.querySelectorAll('.tool-default-group')];let any=false;for(const g of groups){const tools=(g.dataset.tools||'').split(/\s+/).filter(Boolean),show=tools.includes(tool);g.hidden=!show;if(show)any=true;}const section=$('#tool-defaults-section');section.hidden=!any;const label=$('#tool-defaults-tool');if(label)label.textContent=any?`· ${document.querySelector(`#tool-grid button[data-tool="${tool}"]`)?.textContent||tool}`:'';}
function setTool(next){tool=next;cancelDrawing();if(next!=='select'&&selected){selected=null;refreshSelection();}syncRegionList();syncMarkerList();document.querySelectorAll('#tool-grid button').forEach(b=>(b.classList.toggle('active',b.dataset.tool===tool),b.setAttribute('aria-pressed',String(b.dataset.tool===tool))));syncToolOptionVisibility();setStatus(next==='select'?'Select tool — click an object to edit it':`${next.replace(/-/g,' ').replace(/^./,c=>c.toUpperCase())} tool`);drawPlan();}
document.querySelectorAll('#tool-grid button').forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.tool)));

function numInput(label,value,onChange,step='.1'){const d=document.createElement('label');d.className='selection-row';d.textContent=label;const i=document.createElement('input');i.type='number';i.step=step;i.value=Number(value?.toFixed?.(4)??value);i.addEventListener('change',()=>{if(i.value.trim()!==''&&Number.isFinite(i.valueAsNumber))onChange(i.valueAsNumber);else{i.value=value;setStatus('Enter a finite number');}});d.appendChild(i);return d;}
function textInput(label,value,onChange){const d=document.createElement('label');d.className='selection-row';d.textContent=label;const i=document.createElement('input');i.value=value||'';i.addEventListener('change',()=>onChange(i.value));d.appendChild(i);return d;}
function selectInput(label,value,options,onChange){const d=document.createElement('label');d.className='selection-row';d.textContent=label;const i=document.createElement('select');for(const[v,t]of options){const o=document.createElement('option');o.value=v;o.textContent=t;o.selected=v===value;i.appendChild(o);}i.addEventListener('change',()=>onChange(i.value));d.appendChild(i);return d;}
function checkboxInput(label,value,onChange){const d=document.createElement('label');d.className='selection-row checkbox';const i=document.createElement('input');i.type='checkbox';i.checked=!!value;i.addEventListener('change',()=>onChange(i.checked));d.append(i,document.createTextNode(label));return d;}
function rgbHex(c){const h=v=>Math.round(Math.max(0,Math.min(1,Number(v)||0))*255).toString(16).padStart(2,'0');return`#${h(c?.r)}${h(c?.g)}${h(c?.b)}`;}
function hexRgb(hex){return{r:parseInt(hex.slice(1,3),16)/255,g:parseInt(hex.slice(3,5),16)/255,b:parseInt(hex.slice(5,7),16)/255,a:1};}
function colorInput(label,value,onChange){const d=document.createElement('label');d.className='selection-row';d.textContent=label;const i=document.createElement('input');i.type='color';i.value=rgbHex(value);i.addEventListener('change',()=>onChange({...hexRgb(i.value),a:Number.isFinite(Number(value?.a))?Number(value.a):1}));d.appendChild(i);return d;}
function addDrawnPlatform(platform){
  const result=proposePlatformUpdate(platform,{});
  if(!result.ok){setStatus(result.reason);return;}
  floor().platforms.push(result.platform);selected={type:'platform',id:platform.id};
  commit(`${platform.kind==='deck'?'Deck':'Porch'} added`);
}
function updatePlatformSettings(platform,patch){
  const result=proposePlatformUpdate(platform,patch);
  if(!result.ok){refreshSelection();setStatus(result.reason);return;}
  Object.assign(platform,result.platform);commit('Platform updated');
}
function updateRoofSettings(roof,patch,status){
  const before=structuredClone(roof);Object.assign(roof,patch);
  if(roof.hostRoofId===undefined)delete roof.hostRoofId;
  const errors=validateBuilding(building).errors;
  if(errors.length){for(const key of Object.keys(roof))delete roof[key];Object.assign(roof,before);setStatus(errors[0].message);refreshSelection();return;}
  commit(status);
}
function refreshSelection(){
  if(!selected)multiSelection=[];
  const items=selectionItems();$('#group-controls').hidden=!items.length;
  $('#delete-group-btn').hidden=items.length<2;
  $('#group-count').textContent=items.length===1?'1 selected':`${items.length} selected`;
  $('#move-selection-btn').setAttribute('aria-pressed',String(moveArmed));
  if(items.length>1){const form=$('#selection-form');form.innerHTML='';form.hidden=true;$('#selection-empty').hidden=true;return;}
  const form=$('#selection-form'),empty=$('#selection-empty');form.innerHTML='';if(!selected){form.hidden=true;empty.hidden=false;return;}empty.hidden=true;form.hidden=false;const f=floor(),b=fb();
  if(selected.type==='wall'){const w=findWall(b,selected.id);if(!w){selected=null;return refreshSelection();}form.append(selectInput('Wall type',w.wallTypeId||'',[['','Standard'],...(building.wallTypes||[]).map(t=>[t.id,t.label])],v=>applyWallType([w.id],v)),selectInput('Inward direction',w.inwardSide||'auto',[['auto','Auto (outside loop / interior Side A)'],['left','Left of A → B in plan'],['right','Right of A → B in plan']],v=>applyWallType([w.id],w.wallTypeId||'',v)));
    const editType=document.createElement('button');editType.type='button';editType.textContent=w.wallTypeId?'Edit shared wall type…':'Create wall type…';editType.addEventListener('click',()=>wallTypeEditor.open(w.wallTypeId||'',[w.id]));form.append(editType);
    const revalidateWallOpenings=()=>{for(const o of openingsForWall(b,w.id))applyOpeningConstraints(b,o);};form.append(textInput('Label',w.label,v=>{w.label=v;commit('Wall updated');}),selectInput('Wall role',isExteriorWall(b,w)?'exterior':'interior',[["exterior","Exterior"],["interior","Interior"]],v=>{w.role=v;commit('Wall role updated');}),checkboxInput('Full story height',w.height==null,v=>{w.height=v?null:b.wallHeight/2;revalidateWallOpenings();commit(v?'Wall set to full story':'Wall set to half height');}));if(w.height!=null)form.append(numInput('Wall height',wallHeightFor(b,w),v=>{w.height=Math.max(.1,Math.min(b.wallHeight,v));revalidateWallOpenings();commit('Wall height updated');}));form.append(checkboxInput('Move connected endpoints',moveConnected,v=>{moveConnected=v;setStatus(v?'Connected endpoints move together':'Selected endpoint only — moving may open a wall loop');}),numInput('Start X',w.a.x,v=>editWallCoordinate(w,'a','x',v)),numInput('Start Z',w.a.z,v=>editWallCoordinate(w,'a','z',v)),numInput('End X',w.b.x,v=>editWallCoordinate(w,'b','x',v)),numInput('End Z',w.b.z,v=>editWallCoordinate(w,'b','z',v)));const small=document.createElement('div');small.className='muted';small.textContent=`Drag handles A / B in Select mode. Length: ${wallLength(w).toFixed(2)} m · Height: ${wallHeightFor(b,w).toFixed(2)} m · Openings: ${openingsForWall(b,w.id).length}`;form.append(small);
    // Crenellation shares wall.crenellate's layout: empty top-open window openings.
    const crenelHelp=document.createElement('div');crenelHelp.className='muted';crenelHelp.textContent='Crenellation: evenly spaced top-open notches (empty windows), merlons at both ends.';
    const addCrenels=document.createElement('button');addCrenels.type='button';addCrenels.id='add-crenels-btn';addCrenels.textContent='Add crenels';
    addCrenels.addEventListener('click',()=>{
      const result=proposeCrenellation(w,wallHeightFor(b,w),f.openings,crenelDraft);
      if(!result.ok){setStatus(`Crenels not added: ${result.reason}`);return;}
      f.openings.push(...result.openings);
      const problem=validateBuilding(building).errors[0];
      if(problem){f.openings.splice(f.openings.length-result.openings.length);setStatus(`Crenels not added: ${problem.message}`);return;}
      commit(`Added ${result.openings.length} crenels`);
    });
    form.append(crenelHelp,numInput('Crenel width',crenelDraft.crenelWidth,v=>{crenelDraft.crenelWidth=v;}),numInput('Merlon width',crenelDraft.merlonWidth,v=>{crenelDraft.merlonWidth=v;}),numInput('Crenel depth',crenelDraft.depth,v=>{crenelDraft.depth=v;}),addCrenels);
  }else if(selected.type==='region'){
    const r=f.regions.find(x=>x.id===selected.id);if(!r){selected=null;return refreshSelection();}
    const update=(key,value)=>{const old=r[key];r[key]=value;if(!rectValid(r)){r[key]=old;setStatus('Region must have positive width and depth');refreshSelection();return;}commit('Region updated');};
    form.append(textInput('Region name',r.label,v=>update('label',v||'Region')),
      selectInput('Purpose',r.kind,REGION_KINDS.map(k=>[k,k[0].toUpperCase()+k.slice(1)]),v=>update('kind',v)),
      selectInput('Footprint effect',r.effect,[['label','Label only'],['solid','Define footprint'],['void','Cut automatic surfaces']],v=>update('effect',v)));
    if(r.polygon){
      const change=points=>{const problem=regionPolygonProblem(points);if(problem){refreshSelection();setStatus(problem);return;}Object.assign(r,polygonRegion(points,r));commit('Region corners updated');};
      const summary=document.createElement('p');summary.className='muted compact-help';summary.textContent=`Polygon · ${r.polygon.length} corners · ${areaSize(r).toFixed(1)} m². Move it by dragging in Select or using Move by distance.`;form.append(summary);
      r.polygon.forEach((point,i)=>{
        const row=document.createElement('div');row.className='region-corner-row';
        for(const axis of ['x','z'])row.append(numInput(`Corner ${i+1} ${axis.toUpperCase()}`,point[axis],v=>{const points=structuredClone(r.polygon);points[i][axis]=v;change(points);}));
        const add=document.createElement('button');add.type='button';add.textContent='Insert after';add.disabled=r.polygon.length>=256;add.addEventListener('click',()=>{const points=structuredClone(r.polygon),a=points[i],b=points[(i+1)%points.length];points.splice(i+1,0,{x:(a.x+b.x)/2,z:(a.z+b.z)/2});change(points);});
        const remove=document.createElement('button');remove.type='button';remove.textContent='Remove corner';remove.disabled=r.polygon.length<=3;remove.addEventListener('click',()=>change(r.polygon.filter((_,j)=>j!==i)));row.append(add,remove);form.append(row);
      });
    }else for(const [key,label] of [['minX','Min X'],['maxX','Max X'],['minZ','Min Z'],['maxZ','Max Z']])form.append(numInput(label,r[key],v=>update(key,v)));
    const help=document.createElement('p');help.className='muted';help.textContent='Regions never create or delete walls. Label only leaves geometry unchanged. Define footprint replaces wall-derived automatic areas unless Floor Footprints exist. Cut removes automatic floors, ceilings and roof footprints on this story; independent pieces stay untouched.';form.append(help);
  }else if(selected.type==='marker'){
    const marker=(f.markers||[]).find(m=>m.id===selected.id);if(!marker){selected=null;return refreshSelection();}
    const change=(patch)=>{const next={...marker,...patch},problem=markerProblem(next);if(problem){refreshSelection();setStatus(problem);return;}Object.assign(marker,next);commit('Marker updated');};
    form.append(textInput('Marker name',marker.label,v=>change({label:v})),markerNotesInput(marker.details||'',v=>change({details:v})));
    for(const [key,label] of [['x','Marker X'],['y','Height above floor (m)'],['z','Marker Z']])form.append(numInput(label,marker.position[key],v=>change({position:{...marker.position,[key]:v}})));
    const help=document.createElement('p');help.className='muted compact-help';help.textContent='Exports as Marker3D under this floor. Notes stay in the building JSON. World Y: '+(floorElevation(building,activeFloorIndex)+marker.position.y).toFixed(2)+' m';form.append(help);
  }else if(selected.type==='light'){const l=f.lights.find(x=>x.id===selected.id);if(!l){selected=null;return refreshSelection();}form.append(textInput('Name',l.label,v=>{l.label=v||'Light';commit('Light updated');}),numInput('X',l.position.x,v=>{l.position.x=v;commit('Light moved');}),numInput('Y / height',l.position.y,v=>{l.position.y=v;commit('Light moved');}),numInput('Z',l.position.z,v=>{l.position.z=v;commit('Light moved');}),colorInput('Color',l.color,v=>{l.color=v;commit('Light color updated');}),numInput('Energy',l.energy,v=>{l.energy=Math.max(0,v);commit('Light updated');},'.05'),numInput('Range',l.range,v=>{l.range=Math.max(.1,v);commit('Light updated');}),checkboxInput('Shadows enabled',l.shadows,v=>{l.shadows=v;commit('Light updated');}));
  }else if(selected.type==='stair'){const s=f.stairs.find(x=>x.id===selected.id);if(!s){selected=null;return refreshSelection();}form.append(textInput('Name',s.label,v=>{s.label=v||(s.style==='steps'?'Staircase':'Ramp');commit('Stair updated');}),selectInput('Style',s.style||'ramp',[['ramp','Ramp'],['steps','Steps']],v=>{s.style=v;commit('Stair style updated');refreshSelection();}),checkboxInput('Block space below',s.blockBelow!==false,v=>{s.blockBelow=v;commit('Under-stair blocking updated');refreshSelection();}),numInput('Center X',s.x,v=>{s.x=v;commit('Stair moved');}),numInput('Center Z',s.z,v=>{s.z=v;commit('Stair moved');}),numInput('Width',s.width,v=>{s.width=Math.max(.5,v);commit('Stair updated');}),numInput('Run',s.run,v=>{s.run=Math.max(1,v);commit('Stair updated');}));if(s.style==='steps')form.append(numInput('Step count',s.steps||12,v=>{s.steps=Math.max(2,Math.round(v));commit('Step count updated');},'1'));form.append(selectInput('Ascent direction',s.direction,[["north","North (-Z)"],["south","South (+Z)"],["east","East (+X)"],["west","West (-X)"]],v=>{s.direction=v;commit('Stair updated');}));const sm=document.createElement('div');sm.className='muted';sm.textContent=`${s.style==='steps'?'Visible steps':'Smooth ramp'} with a smooth WalkableRamp collision. ${s.blockBelow!==false?'A visible/collidable solid fill blocks the underside.':'The underside is open.'} Opens Floor ${activeFloorIndex+2} slab/ceiling.`;form.append(sm);
  }else if(selected.type==='slab'){const r=f.slabs.find(x=>x.id===selected.id);if(!r){selected=null;return refreshSelection();}form.append(textInput('Name',r.label,v=>{r.label=v||'Floor Footprint';commit('Floor footprint updated');}),numInput('Min X',r.minX,v=>{r.minX=v;commit('Floor footprint updated');}),numInput('Max X',r.maxX,v=>{r.maxX=v;commit('Floor footprint updated');}),numInput('Min Z',r.minZ,v=>{r.minZ=v;commit('Floor footprint updated');}),numInput('Max Z',r.maxZ,v=>{r.maxZ=v;commit('Floor footprint updated');}));const sm=document.createElement('div');sm.className='muted';sm.textContent='Overrides the automatic slab footprint on the active story. It remains tied to this floor elevation.';form.append(sm);
  }else if(selected.type==='manualFloor'||selected.type==='manualCeiling'){const isCeiling=selected.type==='manualCeiling',list=isCeiling?building.manualCeilings:building.manualFloors,r=list.find(x=>x.id===selected.id);if(!r){selected=null;return refreshSelection();}const kind=isCeiling?'Ceiling':'Floor';form.append(textInput('Name',r.label,v=>{r.label=v||`Manual ${kind}`;commit(`Manual ${kind.toLowerCase()} updated`);}),numInput('Top height Y',r.topY,v=>{r.topY=v;commit(`Manual ${kind.toLowerCase()} height updated`);}),numInput('Thickness',r.thickness,v=>{r.thickness=Math.max(.01,v);commit(`Manual ${kind.toLowerCase()} thickness updated`);},'.01'),numInput('Min X',r.minX,v=>{r.minX=v;commit(`Manual ${kind.toLowerCase()} footprint updated`);}),numInput('Max X',r.maxX,v=>{r.maxX=v;commit(`Manual ${kind.toLowerCase()} footprint updated`);}),numInput('Min Z',r.minZ,v=>{r.minZ=v;commit(`Manual ${kind.toLowerCase()} footprint updated`);}),numInput('Max Z',r.maxZ,v=>{r.maxZ=v;commit(`Manual ${kind.toLowerCase()} footprint updated`);}));const sm=document.createElement('div');sm.className='muted';sm.textContent=`Independent building-level ${kind.toLowerCase()} slab. Thickness extends downward from Top height Y; same-height overlap replaces automatic ${kind.toLowerCase()} geometry.`;form.append(sm);
  }else if(selected.type==='platform'){const r=f.platforms.find(x=>x.id===selected.id);if(!r){selected=null;return refreshSelection();}form.append(textInput('Name',r.label,v=>updatePlatformSettings(r,{label:v||'Platform'})),selectInput('Type',r.kind,[['porch','Porch'],['deck','Deck']],v=>updatePlatformSettings(r,{kind:v})),checkboxInput('Covered by roof',r.covered,v=>updatePlatformSettings(r,{covered:v})),numInput('Height offset',r.height||0,v=>updatePlatformSettings(r,{height:v})),numInput('Min X',r.minX,v=>updatePlatformSettings(r,{minX:v})),numInput('Max X',r.maxX,v=>updatePlatformSettings(r,{maxX:v})),numInput('Min Z',r.minZ,v=>updatePlatformSettings(r,{minZ:v})),numInput('Max Z',r.maxZ,v=>updatePlatformSettings(r,{maxZ:v})));
  }else if(selected.type==='roofSection'){const r=building.roofSections.find(x=>x.id===selected.id);if(!r){selected=null;return refreshSelection();}form.append(textInput('Name',r.label,v=>{r.label=v||'Roof';commit('Roof updated');}),selectInput('Type',r.type||'gable',[['gable','Gable'],['shed','Shed / Lean-to'],['flat','Flat']],v=>{r.type=v;commit('Roof updated');}),selectInput('Ridge / slope axis',r.direction||'x',[['x','X axis'],['z','Z axis']],v=>{r.direction=v;commit('Roof updated');}),numInput('Base height Y',r.baseY,v=>{r.baseY=v;commit('Roof height updated');}),numInput('Pitch °',r.pitch||building.roof.pitch,v=>{r.pitch=Math.max(5,Math.min(70,v));commit('Roof pitch updated');}),numInput('Overhang',r.overhang??building.roof.overhang,v=>{r.overhang=Math.max(0,v);commit('Roof overhang updated');}),selectInput('Gable end fill',r.gableEnds||'both',[['both','Both ends'],['min','Min-axis end only'],['max','Max-axis end only'],['none','No gable fill']],v=>{r.gableEnds=v;commit('Roof gable fill updated');}),numInput('Min X',r.minX,v=>{r.minX=v;commit('Roof footprint updated');}),numInput('Max X',r.maxX,v=>{r.maxX=v;commit('Roof footprint updated');}),numInput('Min Z',r.minZ,v=>{r.minZ=v;commit('Roof footprint updated');}),numInput('Max Z',r.maxZ,v=>{r.maxZ=v;commit('Roof footprint updated');}));const hosts=building.roofSections.filter(q=>q.id!==r.id&&!q.hostRoofId);
    form.append(selectInput('Trim to host roof',r.hostRoofId||'',[['','No roof attachment'],...hosts.map(q=>[q.id,q.label||q.id])],v=>updateRoofSettings(r,{hostRoofId:v||undefined},'Roof attachment updated')));
    for(const [edge,label] of [['minX','West edge'],['maxX','East edge'],['minZ','North edge'],['maxZ','South edge']])form.append(selectInput(label,r.edgeModes?.[edge]||'overhang',[['overhang','Use roof overhang'],['flush','Flush with footprint']],v=>updateRoofSettings(r,{edgeModes:{...(r.edgeModes||{}),[edge]:v}},'Roof edge updated')));
    const rm=document.createElement('div');rm.className='muted';rm.textContent='Attachment trims this roof’s slabs against the selected host. The host stays intact. Review gable end fills separately. Flush edges remove overhang including slab thickness.';form.append(rm);
  }else if(selected.type==='railing'){const r=f.railings.find(x=>x.id===selected.id);if(!r){selected=null;return refreshSelection();}form.append(textInput('Name',r.label,v=>{r.label=v||'Railing';commit('Railing updated');}),selectInput('Style',r.style||'two_rail',[['two_rail','Two rail'],['picket','Picket'],['cross_brace','Cross brace']],v=>{r.style=v;commit('Railing style updated');}),numInput('Start X',r.a.x,v=>{r.a.x=v;commit('Railing updated');}),numInput('Start Z',r.a.z,v=>{r.a.z=v;commit('Railing updated');}),numInput('End X',r.b.x,v=>{r.b.x=v;commit('Railing updated');}),numInput('End Z',r.b.z,v=>{r.b.z=v;commit('Railing updated');}),numInput('Height',r.height||1,v=>{r.height=Math.max(.4,v);commit('Railing updated');}));
  }else{const o=f.openings.find(x=>x.id===selected.id);if(!o){selected=null;return refreshSelection();}form.append(textInput('Label',o.label,v=>{o.label=v;commit('Opening updated');}),numInput('Position along wall %',o.t*100,v=>updateOpening(o,{t:v/100},'Opening moved'),'1'),numInput('Width',o.width,v=>updateOpening(o,{width:v},'Opening width updated')),numInput('Height',o.height,v=>updateOpening(o,{height:v},'Opening height updated')));if(o.type==='window')form.append(selectInput('Window style',o.windowStyle||'plain',[['plain','Plain'],['double_hung','Double-hung'],['four_pane','Four-pane'],['empty','Empty opening']] ,v=>{o.windowStyle=v;commit('Window style updated');}),numInput('Sill height',o.sill,v=>updateOpening(o,{sill:v},'Window sill updated')));if(o.type==='door'){form.append(selectInput('Doorway shape',o.shapeId||'',[['','Rectangle'],...(building.openingShapes||[]).map(s=>[s.id,s.label])],v=>updateOpening(o,{shapeId:v||undefined},'Doorway shape updated')));const edit=document.createElement('button');edit.type='button';edit.textContent=o.shapeId?'Edit shared doorway shape…':'Create doorway shape…';edit.addEventListener('click',()=>openingShapeEditor.open(o.shapeId||'',[o.id]));form.append(edit);}if(o.type==='door')form.append(selectInput('Door type',o.doorStyle||'room',[["exterior","Exterior door"],["room","Room door"],["closet","Closet door"],["empty","Empty opening"]],v=>updateOpening(o,{doorStyle:v},'Door type updated')));}
  const del=document.createElement('button');del.className='danger';del.textContent='Delete selection';del.style.marginTop='12px';del.title='Delete the selected item (Delete key)';del.addEventListener('click',deleteSelectedEntity);form.append(del);
}
function syncOpeningShapeControls(){
  if(!(building.openingShapes||[]).some(s=>s.id===newOpeningShapeId))newOpeningShapeId='';
  const select=$('#new-opening-shape');select.replaceChildren();
  for(const [value,label] of [['','Rectangle'],...(building.openingShapes||[]).map(s=>[s.id,s.label])]){const o=document.createElement('option');o.value=value;o.textContent=label;select.append(o);}select.value=newOpeningShapeId;
}
function saveOpeningShape(shape,targets,isNew){
  const candidate=structuredClone(building);candidate.openingShapes ||= [];candidate.version=10;
  if(isNew){shape.id=uid('opening_shape');candidate.openingShapes.push(shape);}else{const i=candidate.openingShapes.findIndex(s=>s.id===shape.id);if(i<0)return 'Shape no longer exists.';candidate.openingShapes[i]=shape;}
  for(const o of candidate.floors[activeFloorIndex].openings)if(targets.includes(o.id))o.shapeId=shape.id;
  const errors=validateBuilding(candidate).errors;if(errors.length)return errors[0].message;
  building=candidate;newOpeningShapeId=shape.id;commit('Doorway shape saved');return null;
}
function removeOpeningShape(id){
  const candidate=structuredClone(building);candidate.openingShapes=(candidate.openingShapes||[]).filter(s=>s.id!==id);if(!candidate.openingShapes.length){delete candidate.openingShapes;candidate.version=9;}
  for(const f of candidate.floors)for(const o of f.openings)if(o.shapeId===id)delete o.shapeId;
  const errors=validateBuilding(candidate).errors;if(errors.length)return errors[0].message;
  building=candidate;commit('Doorway shape deleted; its openings are rectangular');return null;
}
$('#new-opening-shape').addEventListener('change',e=>newOpeningShapeId=e.target.value);
$('#opening-shapes-btn').addEventListener('click',()=>openingShapeEditor.open(newOpeningShapeId));

function updateSummary(){const b=fb(),bb=boundsOfBuilding(b),f=floor(),doors=f.openings.filter(o=>o.type==='door').length,windows=f.openings.filter(o=>o.type==='window').length,segments=f.walls.reduce((n,w)=>n+splitWallIntoSolidSegments(b,w).length,0),ex=f.walls.filter(w=>isExteriorWall(b,w)).length,half=f.walls.filter(w=>wallHeightFor(b,w)<b.wallHeight-1e-4).length,totalDoors=building.floors.reduce((n,q)=>n+q.openings.filter(o=>o.type==='door').length,0);$('#scene-summary').innerHTML=`<dt>Active floor</dt><dd>${activeFloorIndex+1} / ${building.floors.length}</dd><dt>Footprint</dt><dd>${bb.width.toFixed(1)} × ${bb.depth.toFixed(1)} m</dd><dt>Regions</dt><dd>${f.regions.length}</dd><dt>Markers</dt><dd>${(f.markers||[]).length}</dd><dt>Walls</dt><dd>${f.walls.length}</dd><dt>Half/custom</dt><dd>${half}</dd><dt>Exterior</dt><dd>${ex}</dd><dt>Interior</dt><dd>${f.walls.length-ex}</dd><dt>Solid segments</dt><dd>${segments}</dd><dt>Doors</dt><dd>${doors} (${totalDoors} total)</dd><dt>Windows</dt><dd>${windows}</dd><dt>Lights</dt><dd>${f.lights.length}</dd><dt>Stairs / ramps</dt><dd>${f.stairs.length}</dd><dt>Auto floor here</dt><dd>${f.autoFloor?'on':'off'}</dd><dt>Floor footprint</dt><dd>${f.slabs.length||'wall-derived'}</dd><dt>Auto ceiling here</dt><dd>${f.autoCeiling?'on':'off'}</dd><dt>Manual floors</dt><dd>${building.manualFloors.length}</dd><dt>Manual ceilings</dt><dd>${building.manualCeilings.length}</dd><dt>Platforms</dt><dd>${f.platforms.length}</dd><dt>Railings</dt><dd>${f.railings.length}</dd><dt>Manual roofs</dt><dd>${building.roofSections.length}</dd><dt>Auto roofs here</dt><dd>${roofSectionsForFloor(building,activeFloorIndex).length}</dd>`;}
function syncFloorControls(){syncMarkerList();const info=footprintInfo(fb());$('#footprint-status').textContent=`${info.source} · ${info.area.toFixed(1)} m²${info.reason?' · '+info.reason:''}`;syncRegionList();const sel=$('#floor-select');sel.innerHTML='';building.floors.forEach((f,i)=>{const o=document.createElement('option');o.value=i;o.textContent=`${i+1}: ${f.label}`;o.selected=i===activeFloorIndex;sel.appendChild(o);});$('#delete-floor-btn').disabled=building.floors.length<=1;$('#move-floor-up-btn').disabled=activeFloorIndex===building.floors.length-1;$('#move-floor-down-btn').disabled=activeFloorIndex===0;$('#floor-label').value=floor().label;$('#floor-elevation').value=floor().elevation??'';$('#floor-wall-height').value=floor().wallHeight??'';$('#floor-slab-thickness').value=floor().floorThickness??'';$('#intentional-open-toggle').checked=floor().boundaryMode==='intentional_open';$('#floor-level-summary').textContent=`Base ${floorElevation(building,activeFloorIndex).toFixed(2)} m · wall top ${(floorElevation(building,activeFloorIndex)+fb().wallHeight).toFixed(2)} m. Blank fields use automatic/default values.`;$('#auto-floor-toggle').checked=floor().autoFloor!==false;$('#auto-ceiling-toggle').checked=floor().autoCeiling!==false;}
function syncWallTypeControls(){
  syncOpeningShapeControls();
  if(!(building.wallTypes||[]).some(t=>t.id===newWallTypeId))newWallTypeId='';
  const select=$('#new-wall-type');select.replaceChildren();
  for(const [value,label] of [['','Standard'],...(building.wallTypes||[]).map(t=>[t.id,t.label])]){const o=document.createElement('option');o.value=value;o.textContent=label;select.append(o);}select.value=newWallTypeId;
}
function applyWallType(ids,id,inwardSide){
  if(!ids.length){setStatus('Select one or more walls first.');return false;}
  const candidate=structuredClone(building);
  for(const w of candidate.floors[activeFloorIndex].walls.filter(w=>ids.includes(w.id))){if(id)w.wallTypeId=id;else delete w.wallTypeId;if(inwardSide)w.inwardSide=inwardSide;}
  const errors=validateBuilding(candidate).errors;if(errors.length){setStatus(errors[0].message);refreshSelection();return false;}
  building=candidate;commit(`Wall type applied to ${ids.length} walls`);return true;
}
function saveWallType(type,targets,isNew){
  const candidate=structuredClone(building);candidate.wallTypes ||= [];
  if(isNew){type.id=uid('wall_type');candidate.wallTypes.push(type);}else{const i=candidate.wallTypes.findIndex(t=>t.id===type.id);if(i<0)return 'Wall type no longer exists.';candidate.wallTypes[i]=type;}
  for(const w of candidate.floors[activeFloorIndex].walls)if(targets.includes(w.id))w.wallTypeId=type.id;
  const errors=validateBuilding(candidate).errors;if(errors.length)return errors[0].message;
  building=candidate;newWallTypeId=type.id;commit('Wall type saved');return null;
}
function removeWallType(id){
  const candidate=structuredClone(building);candidate.wallTypes=(candidate.wallTypes||[]).filter(t=>t.id!==id);
  if(!candidate.wallTypes.length)delete candidate.wallTypes;
  for(const f of candidate.floors)for(const w of f.walls)if(w.wallTypeId===id)delete w.wallTypeId;
  building=candidate;commit('Wall type deleted; its walls now use Standard');return null;
}
$('#new-wall-type').addEventListener('change',e=>{newWallTypeId=e.target.value;setStatus('Wall type set for new walls and rooms');});
$('#wall-types-btn').addEventListener('click',()=>wallTypeEditor.open(newWallTypeId));
$('#apply-wall-type-btn').addEventListener('click',()=>applyWallType(selectionItems().filter(s=>s.type==='wall').map(s=>s.id),newWallTypeId));

function syncControls(){normalizeBuilding(building);syncWallTypeControls();$('#new-region-shape').value=newRegionShape;syncRegionDraft();$('#export-profile').value=building.exportProfile;activeFloorIndex=Math.min(activeFloorIndex,building.floors.length-1);$('#show-floor-below').checked=showFloorBelow;$('#building-name').value=building.name;$('#wall-height').value=building.wallHeight;$('#wall-thickness').value=building.wallThickness;$('#floor-thickness').value=building.floorThickness;$('#grid-size').value=building.gridSize;$('#roof-type').value=building.roof.type;$('#roof-pitch').value=building.roof.pitch;$('#roof-overhang').value=building.roof.overhang;$('#ceiling-thickness').value=building.ceiling.thickness;$('#window-mesh-toggle').checked=building.windowMesh.enabled;$('#window-frame-width').value=building.windowMesh.frameWidth;$('#window-frame-depth').value=building.windowMesh.frameDepth;$('#window-glass-thickness').value=building.windowMesh.glassThickness;$('#door-mesh-toggle').checked=building.doorMesh.enabled;$('#door-frame-width').value=building.doorMesh.frameWidth;$('#door-frame-depth').value=building.doorMesh.frameDepth;$('#door-panel-thickness').value=building.doorMesh.panelThickness;$('#door-detail-depth').value=building.doorMesh.detailDepth;$('#new-wall-role').value=newWallRole;$('#new-wall-height').value=newWallHeightMode;$('#new-door-style').value=newDoorStyle;$('#new-window-style').value=newWindowStyle;$('#new-light-height').value=newLightHeight;$('#new-marker-height').value=newMarkerHeight;$('#new-stair-width').value=newStairWidth;$('#new-stair-style').value=newStairStyle;$('#new-stair-steps').value=newStairSteps;$('#new-stair-steps-row').hidden=newStairStyle!=='steps';$('#new-stair-block-below').checked=newStairBlockBelow;$('#new-platform-type').value=newPlatformType;$('#new-platform-height').value=newPlatformHeight;$('#new-railing-height').value=newRailingHeight;$('#new-railing-style').value=newRailingStyle;$('#new-roof-section-type').value=newRoofSectionType;$('#new-roof-direction').value=newRoofDirection;$('#new-roof-base-y').value=newRoofBaseY;$('#new-roof-pitch').value=newRoofPitch;$('#new-roof-overhang').value=newRoofOverhang;$('#new-roof-gable-ends').value=newRoofGableEnds;$('#new-manual-floor-y').value=newManualFloorY;$('#new-manual-floor-thickness').value=newManualFloorThickness;$('#new-manual-ceiling-y').value=newManualCeilingY;$('#new-manual-ceiling-thickness').value=newManualCeilingThickness;syncFloorControls();syncToolOptionVisibility();}
function updateHistoryButtons(){$('#undo-btn').disabled=!history.canUndo();$('#redo-btn').disabled=!history.canRedo();}
function renderEditorState(status='Updated',refreshSel=true){syncWallTypeControls();syncRegionList();showValidation();drawPlan();preview.rebuild(building,activeFloorIndex);updateSummary();syncFloorControls();if(refreshSel)refreshSelection();updateHistoryButtons();setStatus(status);}
function commit(status='Updated',refreshSel=true){invalidatePendingLoad();if(groupDrag||selectionBox)cancelDrawing();clearSelectionCandidates();history.record(building,status);renderEditorState(status,refreshSel);}
function restoreHistory(direction){invalidatePendingLoad();cancelDrawing();const r=direction==='undo'?history.undo():history.redo();if(!r){setStatus(direction==='undo'?'Nothing to undo':'Nothing to redo');return updateHistoryButtons();}building=normalizeBuilding(r.state);activeFloorIndex=Math.min(activeFloorIndex,building.floors.length-1);selected=null;cancelDrawing();syncControls();renderEditorState(`${direction==='undo'?'Undo':'Redo'}: ${r.action}`);}
function fitPlan(){let b=boundsOfBuilding(fb());for(const m of floor().markers||[]){b.minX=Math.min(b.minX,m.position.x);b.maxX=Math.max(b.maxX,m.position.x);b.minZ=Math.min(b.minZ,m.position.z);b.maxZ=Math.max(b.maxZ,m.position.z);}for(const r of [...(floor().regions||[]),...(building.roofSections||[]),...(building.manualFloors||[]),...(building.manualCeilings||[])]){if(!rectValid(r))continue;b={minX:Math.min(b.minX,r.minX),maxX:Math.max(b.maxX,r.maxX),minZ:Math.min(b.minZ,r.minZ),maxZ:Math.max(b.maxZ,r.maxZ)};}b.width=b.maxX-b.minX;b.depth=b.maxZ-b.minZ;const{w,h}=dims(),bw=Math.max(4,b.width+2),bd=Math.max(4,b.depth+2);view.scale=Math.max(18,Math.min(90,Math.min(w/bw,h/bd)));const cx=(b.minX+b.maxX)/2,cz=(b.minZ+b.maxZ)/2;view.panX=-cx*view.scale;view.panY=-cz*view.scale;drawPlan();}
function editStructure(change,status='Building settings updated'){
  const before=structuredClone(building);
  change();
  const result=validateBuilding(building);
  if(result.errors.length){building=before;syncControls();setStatus(result.errors[0].message);return;}
  for(let i=0;i<building.floors.length;i++){
    const view=fb(i);for(const o of view.openings)applyOpeningConstraints(view,o);
  }
  const constrainedResult=validateBuilding(building);
  if(constrainedResult.errors.length){building=before;syncControls();setStatus(constrainedResult.errors[0].message);return;}
  newRoofBaseY=defaultRoofBaseY();syncManualSurfaceDefaults();syncControls();
  const count=structuralEditImpact(building);
  commit(status+(count?`; ${count} independent surfaces kept at their absolute heights—review alignment`:''));
}
// Placement preferences do not edit the blueprint or create undo entries.
function bindPlacementNumber(id,get,set,min,max,integer=false){
  const input=$(id);input.min=String(min);input.max=String(max);
  input.addEventListener('change',()=>{
    const value=input.valueAsNumber;
    if(input.value.trim()===''||!Number.isFinite(value)||value<min||value>max||(integer&&!Number.isInteger(value))){
      input.value=String(get());
      setStatus(`Placement setting unchanged: enter a ${integer?'whole':'finite'} number between ${min} and ${max}.`);
      return;
    }
    set(value);input.value=String(value);
  });
}
function bindNum(id,set){$(id).addEventListener('change',e=>{
  if(e.target.value.trim()===''||!Number.isFinite(e.target.valueAsNumber)){syncControls();setStatus('Enter a finite number');return;}
  const v=e.target.valueAsNumber;
  if(['#wall-height','#floor-thickness','#door-frame-width','#door-frame-depth','#door-panel-thickness'].includes(id))editStructure(()=>set(v));
  else{
    const before=structuredClone(building);set(v);
    const result=validateBuilding(building);
    if(result.errors.length){building=before;syncManualSurfaceDefaults();syncControls();setStatus(`Setting unchanged: ${result.errors[0].message}`);return;}
    syncControls();commit('Building settings updated');
  }
});}

$('#building-name').addEventListener('change',e=>{building.name=e.target.value||'Building';commit('Building renamed');});
bindNum('#wall-height',v=>{building.wallHeight=Math.max(.2,v);newRoofBaseY=defaultRoofBaseY();syncManualSurfaceDefaults();$('#new-roof-base-y').value=newRoofBaseY;$('#new-manual-floor-y').value=newManualFloorY;$('#new-manual-ceiling-y').value=newManualCeilingY;});bindNum('#wall-thickness',v=>building.wallThickness=Math.max(.02,v));bindNum('#floor-thickness',v=>{building.floorThickness=Math.max(.02,v);syncManualSurfaceDefaults();newRoofBaseY=defaultRoofBaseY();$('#new-roof-base-y').value=newRoofBaseY;$('#new-manual-floor-y').value=newManualFloorY;$('#new-manual-floor-thickness').value=newManualFloorThickness;$('#new-manual-ceiling-y').value=newManualCeilingY;});bindNum('#grid-size',v=>building.gridSize=Math.max(.1,v));
$('#new-region-shape').addEventListener('change',e=>{cancelDrawing();newRegionShape=e.target.value;syncRegionDraft();drawPlan();});
$('#finish-region-btn').addEventListener('click',finishPolygonRegion);
$('#undo-region-corner-btn').addEventListener('click',undoRegionCorner);
$('#region-from-walls-btn').addEventListener('click',()=>{try{const walls=floor().walls.filter(w=>w.role==='exterior'||/\bexterior\b/i.test(w.label||''));addPolygonRegion(wallOutlinePoints(walls));}catch(error){setStatus(error.message);}});
$('#new-region-kind').addEventListener('change',e=>newRegionKind=e.target.value);
$('#new-region-effect').addEventListener('change',e=>newRegionEffect=e.target.value);
$('#junctions-toggle').addEventListener('change',e=>{showJunctions=e.target.checked;drawPlan();});
$('#snap-toggle').addEventListener('change',e=>{snap=e.target.checked;snapHit=null;drawPlan();});$('#new-wall-role').addEventListener('change',e=>newWallRole=e.target.value);$('#new-wall-height').addEventListener('change',e=>newWallHeightMode=e.target.value);$('#new-door-style').addEventListener('change',e=>newDoorStyle=e.target.value);$('#new-window-style').addEventListener('change',e=>newWindowStyle=e.target.value);
bindPlacementNumber('#new-light-height',()=>newLightHeight,v=>newLightHeight=v,0,1000000);
$('#new-stair-style').addEventListener('change',e=>{newStairStyle=e.target.value==='steps'?'steps':'ramp';$('#new-stair-steps-row').hidden=newStairStyle!=='steps';});bindPlacementNumber('#new-stair-width',()=>newStairWidth,v=>newStairWidth=v,0.5,10000);
bindPlacementNumber('#new-stair-steps',()=>newStairSteps,v=>newStairSteps=v,2,512,true);
$('#new-stair-block-below').addEventListener('change',e=>{newStairBlockBelow=e.target.checked;});$('#new-platform-type').addEventListener('change',e=>newPlatformType=e.target.value);bindPlacementNumber('#new-platform-height',()=>newPlatformHeight,v=>newPlatformHeight=v,-10000,10000);
bindPlacementNumber('#new-railing-height',()=>newRailingHeight,v=>newRailingHeight=v,0.4,10000);
$('#new-railing-style').addEventListener('change',e=>newRailingStyle=e.target.value);$('#new-roof-section-type').addEventListener('change',e=>newRoofSectionType=e.target.value);$('#new-roof-direction').addEventListener('change',e=>newRoofDirection=e.target.value);bindPlacementNumber('#new-roof-base-y',()=>newRoofBaseY,v=>newRoofBaseY=v,-1000000,1000000);
bindPlacementNumber('#new-roof-pitch',()=>newRoofPitch,v=>newRoofPitch=v,5,70);
bindPlacementNumber('#new-roof-overhang',()=>newRoofOverhang,v=>newRoofOverhang=v,0,100);
$('#new-roof-gable-ends').addEventListener('change',e=>newRoofGableEnds=e.target.value);
bindPlacementNumber('#new-manual-floor-y',()=>newManualFloorY,v=>newManualFloorY=v,-1000000,1000000);
bindPlacementNumber('#new-manual-floor-thickness',()=>newManualFloorThickness,v=>newManualFloorThickness=v,0.01,10000);
bindPlacementNumber('#new-manual-ceiling-y',()=>newManualCeilingY,v=>newManualCeilingY=v,-1000000,1000000);
bindPlacementNumber('#new-manual-ceiling-thickness',()=>newManualCeilingThickness,v=>newManualCeilingThickness=v,0.01,10000);

$('#roof-type').addEventListener('change',e=>{building.roof.type=e.target.value;commit('Roof updated');});bindNum('#roof-pitch',v=>building.roof.pitch=Math.max(5,Math.min(70,v)));bindNum('#roof-overhang',v=>building.roof.overhang=Math.max(0,v));
bindNum('#ceiling-thickness',v=>{building.ceiling.thickness=Math.max(.02,v);newManualCeilingThickness=building.ceiling.thickness;$('#new-manual-ceiling-thickness').value=newManualCeilingThickness;});
$('#window-mesh-toggle').addEventListener('change',e=>{building.windowMesh.enabled=e.target.checked;commit('Window meshes updated');});bindNum('#window-frame-width',v=>building.windowMesh.frameWidth=Math.max(.02,v));bindNum('#window-frame-depth',v=>building.windowMesh.frameDepth=Math.max(.02,v));bindNum('#window-glass-thickness',v=>building.windowMesh.glassThickness=Math.max(.005,v));
$('#door-mesh-toggle').addEventListener('change',e=>{editStructure(()=>building.doorMesh.enabled=e.target.checked,'Door meshes updated');});bindNum('#door-frame-width',v=>building.doorMesh.frameWidth=Math.max(.03,v));bindNum('#door-frame-depth',v=>building.doorMesh.frameDepth=Math.max(.03,v));bindNum('#door-panel-thickness',v=>building.doorMesh.panelThickness=Math.max(.02,v));bindNum('#door-detail-depth',v=>building.doorMesh.detailDepth=Math.max(.005,v));

function changeActiveFloor(value){cancelDrawing();activeFloorIndex=Math.max(0,Math.min(building.floors.length-1,Number(value)||0));selected=null;newRoofBaseY=defaultRoofBaseY();syncManualSurfaceDefaults();$('#new-roof-base-y').value=newRoofBaseY;$('#new-manual-floor-y').value=newManualFloorY;$('#new-manual-ceiling-y').value=newManualCeilingY;fitPlan();preview.frame(building,activeFloorIndex);renderEditorState(`Editing ${floor().label}`);}
$('#floor-select').addEventListener('change',e=>changeActiveFloor(e.target.value));
for(const [id,key] of [['floor-elevation','elevation'],['floor-wall-height','wallHeight'],['floor-slab-thickness','floorThickness']]){
  $('#'+id).addEventListener('change',e=>{
    if(e.target.value!==''&&!Number.isFinite(e.target.valueAsNumber)){syncFloorControls();return;}
    const value=e.target.value===''?null:e.target.valueAsNumber;
    editStructure(()=>{if(value==null)delete floor()[key];else floor()[key]=value;},'Floor dimensions updated');
  });
}
$('#intentional-open-toggle').addEventListener('change',e=>{floor().boundaryMode=e.target.checked?'intentional_open':'closed';commit('Exterior boundary intent updated');});
$('#floor-label').addEventListener('change',e=>{floor().label=e.target.value||`Floor ${activeFloorIndex+1}`;commit('Floor renamed');});
$('#auto-floor-toggle').addEventListener('change',e=>{floor().autoFloor=e.target.checked;commit(e.target.checked?'Automatic floor enabled':'Automatic floor disabled');});$('#auto-ceiling-toggle').addEventListener('change',e=>{floor().autoCeiling=e.target.checked;commit(e.target.checked?'Automatic ceiling enabled':'Automatic ceiling disabled');});
$('#show-floor-below').addEventListener('change',e=>{showFloorBelow=e.target.checked;drawPlan();setStatus(showFloorBelow?'Ghosted lower floor enabled':'Ghosted lower floor hidden');});
function editFloorStack(action){
  cancelDrawing();
  const removeAffectedStairs=$('#floor-remove-stairs').checked||action==='remove'&&activeFloorIndex===building.floors.length-1;
  const result=proposeFloorStackEdit(building,activeFloorIndex,action,{removeAffectedStairs});
  if(!result.ok){setStatus(result.reason);drawPlan();return;}
  building=result.building;activeFloorIndex=result.activeIndex;selected=null;$('#floor-remove-stairs').checked=false;
  newRoofBaseY=defaultRoofBaseY();syncManualSurfaceDefaults();syncControls();fitPlan();preview.frame(building,activeFloorIndex);
  const changes={above:'Floor added above',below:'Floor added below',duplicate:'Floor duplicated above (stairs omitted)',up:'Floor moved up',down:'Floor moved down',remove:'Floor deleted'};
  commit(changes[action]+`; ${result.affectedStairs.length} affected stairs removed.`+(result.independentSurfaces?' Independent roofs/manual slabs kept at absolute heights; review alignment.':'')+' Undo restores the complete edit.');
}
for(const [selector,action] of [['#add-floor-btn','above'],['#add-floor-below-btn','below'],['#duplicate-floor-btn','duplicate'],['#move-floor-up-btn','up'],['#move-floor-down-btn','down'],['#delete-floor-btn','remove']])$(selector).addEventListener('click',()=>editFloorStack(action));

$('#selection-filter').addEventListener('change',e=>{selectionFilter=e.target.value;setTool('select');chooseSelection(null);setStatus(`Pick ${e.target.options?.[e.target.selectedIndex]?.text||selectionFilter}`);});
$('#undo-btn').addEventListener('click',()=>restoreHistory('undo'));$('#redo-btn').addEventListener('click',()=>restoreHistory('redo'));
$('#new-btn').addEventListener('click',()=>{cancelDrawing();building=normalizeBuilding(makeEmptyBuilding());activeFloorIndex=0;selected=null;newRoofBaseY=defaultRoofBaseY();syncManualSurfaceDefaults();newRoofPitch=building.roof.pitch;newRoofOverhang=building.roof.overhang;syncControls();fitPlan();preview.frame(building);commit('New empty building');});
$('#farmhouse-btn').addEventListener('click',()=>{cancelDrawing();building=normalizeBuilding(makeFarmhousePreset());activeFloorIndex=0;selected=null;newRoofBaseY=defaultRoofBaseY();syncManualSurfaceDefaults();newRoofPitch=building.roof.pitch;newRoofOverhang=building.roof.overhang;syncControls();fitPlan();preview.frame(building);commit('Farmhouse preset loaded');});
$('#save-json-btn').addEventListener('click',()=>{
  try{
    downloadText(`${building.name.replace(/\s+/g,'_').toLowerCase()}.building.json`,JSON.stringify(building,null,2),'application/json');
    setStatus('Building JSON download requested. Check your browser downloads.');
  }catch(err){setStatus('Building JSON download failed: '+err.message);}
});
function loadBuildingData(data,status='Building JSON loaded'){
  if(!data||typeof data!=='object'||!Array.isArray(data.floors)&&!Array.isArray(data.walls))throw new Error('Not a building file');
  assertValidBuilding(data);
  const loaded=normalizeBuilding(data);assertValidBuilding(loaded);
  building=loaded;activeFloorIndex=0;selected=null;
  setTool('select');
  newRoofBaseY=defaultRoofBaseY();syncManualSurfaceDefaults();
  newRoofPitch=building.roof.pitch;newRoofOverhang=building.roof.overhang;
  syncControls();fitPlan();preview.frame(building);commit(status);
}
function invalidatePendingLoad(){
  loadRequestVersion++;
  $('#example-select').disabled=false;
  $('#example-select').value='';
}
$('#load-json-input').addEventListener('change',async e=>{
  const file=e.target.files?.[0];if(!file)return;
  invalidatePendingLoad();const request=loadRequestVersion;
  e.target.value='';setStatus('Loading building JSON…');
  try{
    const text=await file.text();
    if(request!==loadRequestVersion)return;
    loadBuildingData(parseJsonText(text));
  }catch(err){if(request===loadRequestVersion)setStatus('Load failed: '+err.message);}
});
$('#example-select').addEventListener('change',async e=>{
  const value=e.target.value;if(!value)return;
  invalidatePendingLoad();const request=loadRequestVersion;
  e.target.disabled=true;setStatus('Loading example…');
  try{
    const response=await fetch(value+'.building.json');
    if(request!==loadRequestVersion)return;
    if(!response.ok)throw new Error('Example file unavailable');
    const data=await response.json();
    if(request!==loadRequestVersion)return;
    loadBuildingData(data,'Example loaded; Undo returns to your previous building');
  }catch(err){if(request===loadRequestVersion)setStatus('Load failed: '+err.message);}
  finally{if(request===loadRequestVersion){e.target.disabled=false;e.target.value='';}}
});
document.querySelectorAll('.file-menu-body button').forEach(button=>button.addEventListener('click',()=>{$('.file-menu').open=false;}));
$('#load-json-input').addEventListener('change',()=>{$('.file-menu').open=false;});
document.addEventListener('pointerdown',e=>{const menu=$('.file-menu');if(menu.open&&!menu.contains(e.target))menu.open=false;});
$('#export-profile').addEventListener('change',e=>{building.exportProfile=e.target.value;commit('Export profile changed');});
function showValidation(){
  const r=validateBuilding(building,{roofDiagnostics:true}),list=$('#validation-results'),summary=$('#validation-summary'),review=$('#review-checks-btn');
  // Opt-in route check shared with the CLI (validate --reachability).
  routeResult=null;
  if($('#route-check-toggle').checked&&!r.errors.length){
    let starts=[];try{starts=parseRouteStarts($('#route-start').value,building);}catch(e){r.warnings=[...r.warnings,{path:'Route start',message:e.message}];}
    const route=reachabilityWarnings(building,{starts});routeResult=route.result;r.warnings=[...r.warnings,...route.warnings];
  }
  list.replaceChildren();
  for(const issue of [...r.errors,...r.warnings]){
    const li=document.createElement('li'),message=document.createElement('span');message.className='validation-message';message.textContent=issue.message;li.append(message);li.className=r.errors.includes(issue)?'validation-error':'validation-warning';
    const targets=diagnosticTargets(building,issue);
    if(targets.length){const actions=document.createElement('div');actions.className='validation-actions';for(const target of targets){const button=document.createElement('button');button.type='button';button.textContent=target.label;button.addEventListener('click',()=>visitDiagnosticTarget(target));actions.append(button);}li.append(actions);}
    list.append(li);
  }
  const counts=`${r.errors.length} errors, ${r.warnings.length} warnings`;
  summary.textContent=r.errors.length?`${counts}. Resolve errors before exporting.`:r.warnings.length?`${counts}. Export is allowed; review the authoring warnings.`:'No issues found by the current checks. Review your exported scene in Godot.';
  review.textContent=r.errors.length?`Checks: ${r.errors.length} error${r.errors.length===1?'':'s'}`:r.warnings.length?`Checks: ${r.warnings.length} warning${r.warnings.length===1?'':'s'}`:'Checks: clear';
  review.dataset.state=r.errors.length?'error':r.warnings.length?'warning':'clear';review.setAttribute('aria-label',`Review building checks: ${counts}`);
  return r;
}
function visitDiagnosticTarget(reference){
  if(!resolveDiagnosticTarget(building,reference)){setStatus('This diagnostic target no longer exists. Check the building again.');return;}
  cancelDrawing();
  const target=resolveDiagnosticTarget(building,reference);if(!target)return;
  setTool('select');selectionFilter='all';$('#selection-filter').value='all';
  if(target.floorId)changeActiveFloor(building.floors.findIndex(f=>f.id===target.floorId));
  document.querySelector('[data-view="plan"]').click();
  if(target.type==='floor'){
    chooseSelection(null);fitPlan();document.querySelector('details[data-section="floors"]').open=true;
    $('#floor-label').focus({preventScroll:true});$('#floor-label').scrollIntoView({block:'nearest'});
  }else{
    chooseSelection({type:target.type,id:target.id});
    const bounds=selectionBounds(building,activeFloorIndex,selected);
    if(bounds&&Object.values(bounds).every(Number.isFinite)){
      const {w,h}=dims();view.scale=Math.max(1,Math.min(90,Math.min(w/Math.max(4,bounds.maxX-bounds.minX+2),h/Math.max(4,bounds.maxZ-bounds.minZ+2))));
      view.panX=-(bounds.minX+bounds.maxX)/2*view.scale;view.panY=-(bounds.minZ+bounds.maxZ)/2*view.scale;drawPlan();
    }
    const form=$('#selection-form');form.focus({preventScroll:true});form.scrollIntoView({block:'nearest'});
  }
  setStatus(`${target.label.replace(/^Show /,'Reviewing ')}. Inspection only; no geometry changed.`);
}
function revealValidation(){const summary=$('#validation-summary');summary.focus({preventScroll:true});summary.scrollIntoView({block:'nearest'});}
$('#route-start').addEventListener('change',()=>{if(!$('#route-check-toggle').checked)return;showValidation();drawPlan();setStatus(`Route check from ${routeResult?.starts?.length||0} start point(s): ${routeResult?`${routeResult.unreachable.length} unreachable areas`:'resolve errors first'}.`);});
$('#route-check-toggle').addEventListener('change',e=>{
  const r=showValidation();drawPlan();
  setStatus(e.target.checked?`Route check on: ${routeResult?`${routeResult.unreachable.length} unreachable areas, ${routeResult.stairIssues.length} stair issues`:'resolve errors first'}. Inspection only; no geometry changed.`:'Route check off');
});
for(const id of ['#validate-btn','#review-checks-btn'])$(id).addEventListener('click',()=>{const r=showValidation();revealValidation();setStatus(`${r.errors.length} errors, ${r.warnings.length} warnings`);});
$('#download-check-report-btn').addEventListener('click',()=>{
  try{
    const result=showValidation(),report=createCheckReport([{building,...result}]);
    downloadText(checkReportFilename(building.name),JSON.stringify(report,null,2)+'\n','application/json');
    setStatus(`Check report downloaded: ${report.counts.errors} errors, ${report.counts.warnings} warnings. Save the building JSON separately.`);
  }catch(err){setStatus(`Check report download failed: ${err.message}`);}
});
// Godot renders go through the local server (server.mjs with GODOT_BIN), which
// applies the CLI's asset checks and godot-check --render views to this export.
async function renderInGodot(){
  const button=$('#godot-render-btn'),status=$('#godot-render-status'),report=text=>{status.textContent=text;setStatus(text);};
  const result=showValidation();
  if(result.errors.length){revealValidation();report(`Render blocked: ${result.errors[0].message}`);return;}
  const f=exportGodotFiles(building,{collision:$('#collision-toggle').checked,markers:$('#markers-toggle').checked,placeholderMaterials:$('#placeholder-materials-toggle').checked});
  const files=[{name:f.tscnName,text:f.tscn},...f.doors.map(d=>({name:d.filename,text:d.tscn}))];
  // The preview's projection uses focal = 0.78 × min(width, height): about a
  // 65° vertical field of view, which is also Godot's Camera3D convention.
  const extraViews=[];
  if($('#render-current-view-toggle').checked){const cam=preview.camera();extraViews.push({name:'current-view',eye:[cam.pos.x,cam.pos.y,cam.pos.z],look:[cam.pos.x+cam.forward.x*10,cam.pos.y+cam.forward.y*10,cam.pos.z+cam.forward.z*10],fov:65});}
  button.disabled=true;report('Rendering the current export in Godot…');
  let response,body;
  try{
    response=await fetch('/api/godot-render',{method:'POST',headers:{'Content-Type':'application/json','X-Building-Editor':'1'},body:JSON.stringify({files,extraViews,colorMode:$('#render-surface-colors-toggle').checked?'surfaces':'materials'})});
    body=await response.json();
  }catch{
    report('Godot rendering needs the local editor server: start it with GODOT_BIN=/path/to/godot node server.mjs and open the editor from that address.');return;
  }finally{button.disabled=false;}
  if(!response.ok||!body?.ok){report(`Godot render failed: ${body?.error||`HTTP ${response.status}`}`);return;}
  lastRenders={base:f.base,colorMode:body.colorMode,engineVersion:body.engineVersion,renderer:body.renderer,views:body.views,images:body.images};
  const gallery=$('#godot-render-results');gallery.replaceChildren();
  for(const image of body.images){
    const figure=document.createElement('figure'),img=document.createElement('img'),caption=document.createElement('figcaption');
    img.src=`data:image/png;base64,${image.png}`;img.alt=`Godot render: ${image.file}`;caption.textContent=image.file.replace(/\.png$/,'');
    figure.append(img,caption);gallery.append(figure);
  }
  $('#download-renders-btn').hidden=false;
  report(`${body.images.length} views rendered by Godot ${body.engineVersion}. Scenes are unmodified: empty materials render grey; only camera, sky, sun, ambient light and a camera headlamp were added (window glass renders clear).`);
}
$('#godot-render-btn').addEventListener('click',()=>renderInGodot());
$('#download-renders-btn').addEventListener('click',()=>{
  if(!lastRenders)return;
  try{
    const decode=b64=>Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
    const manifest={engineVersion:lastRenders.engineVersion,colorMode:lastRenders.colorMode,renderer:lastRenders.renderer,views:lastRenders.views,note:'Scenes loaded unmodified (empty materials render as default grey); only camera, sky, sun, ambient light and a camera headlamp were added; exported Glass surfaces render with a clear material.'};
    downloadBinary(`${lastRenders.base}_godot_renders.zip`,makeStoredZip([...lastRenders.images.map(i=>({name:i.file,data:decode(i.png)})),{name:'renders.json',data:JSON.stringify(manifest,null,2)+'\n'}]));
    setStatus('Godot renders download requested.');
  }catch(err){setStatus(`Render download failed: ${err.message}`);}
});
$('#export-btn').addEventListener('click',()=>{
  try{
    const result=showValidation();
    if(result.errors.length){revealValidation();setStatus(`Export blocked: ${result.errors[0].message}`);return;}
    downloadGodotTscn(building,{collision:$('#collision-toggle').checked,markers:$('#markers-toggle').checked,placeholderMaterials:$('#placeholder-materials-toggle').checked});
    if(result.warnings.length)revealValidation();
    setStatus(`Godot package exported. ${result.warnings.length} authoring warnings; see Godot Export.`);
  }catch(err){revealValidation();setStatus(`Export blocked: ${err.message}`);}
});
document.querySelectorAll('[data-view]').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b===btn));cancelDrawing();const plan=btn.dataset.view==='plan';$('#plan-view').classList.toggle('active',plan);$('#preview-view').classList.toggle('active',!plan);if(!plan){preview.resize();preview.rebuild(building,activeFloorIndex);}}));

function bindCollapsibleState(){for(const d of document.querySelectorAll('details.collapsible[data-section]')){const key=`building_studio_section_${d.dataset.section}`;try{const saved=localStorage.getItem(key)??localStorage.getItem(`get_probed_building_editor_section_${d.dataset.section}`);if(saved==='open')d.open=true;else if(saved==='closed')d.open=false;d.addEventListener('toggle',()=>localStorage.setItem(key,d.open?'open':'closed'));}catch{}}}
openingShapeEditor=createOpeningShapeEditor({document,$,getBuilding:()=>building,save:saveOpeningShape,remove:removeOpeningShape});
wallTypeEditor=createWallTypeEditor({document,$,getBuilding:()=>building,save:saveWallType,remove:removeWallType});
bindCollapsibleState();
newRoofBaseY=defaultRoofBaseY();syncManualSurfaceDefaults();newRoofPitch=building.roof.pitch;newRoofOverhang=building.roof.overhang;
syncControls();showValidation();resizePlan();fitPlan();preview.rebuild(building,activeFloorIndex);preview.frame(building);updateSummary();refreshSelection();updateHistoryButtons();
