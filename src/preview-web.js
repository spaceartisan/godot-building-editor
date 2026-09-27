import { Preview3D } from './preview.js';
import { reviewScene, fitReviewCamera } from './preview-review.js';
import { drawPreviewOverlay } from './preview-overlays.js';
import { attachmentSummary } from './roof-diagnostics.js';
import {markerReviewGuides,drawMarkerGuides} from './markers.js';

// View state and cached geometry belong to the viewer, never to the blueprint.
export class WebPreview3D extends Preview3D {
  constructor(canvas,options={}){
    super(canvas,options);
    this.review={view:'building',overlay:'none'};
    this.scene=null;
  }
  rebuild(building,activeFloor=0){
    const changedFloor=this.activeFloor!==activeFloor;
    this.building=building;this.activeFloor=Math.max(0,Math.min(building.floors.length-1,activeFloor));
    if(this.review.roof&&!building.roofSections.some(r=>r.id===this.review.roof))delete this.review.roof;
    this.scene=reviewScene(building,{...this.review,floor:this.activeFloor+1});
    this.markerGuides=markerReviewGuides(building,this.review.view,this.activeFloor);
    this.sceneObjects=this.scene.objects;
    // Cutaways omit all light gizmos as well as the hidden story geometry.
    this.staticPreview=this.review.view!=='building';
    this.onReview?.();
    if(changedFloor&&(this.review.view==='floor'||this.review.overlay==='footprint'))this.fit();
    this.draw();
  }
  setReview(options){
    const next={...this.review,...options};
    if(next.overlay!=='attachments')delete next.roof;
    // Validate first so a rejected programmatic request leaves the view intact.
    reviewScene(this.building,{...next,floor:this.activeFloor+1});
    const changedView=next.view!==this.review.view;
    this.review=next;
    if(changedView)this.pitch=next.view==='floor'?-1.1:-.5;
    this.rebuild(this.building,this.activeFloor);this.fit();this.draw();
  }
  fit(){
    if(!this.scene)return;
    const {width,height}=this.canvas.getBoundingClientRect();
    this.needsFit=width<=0||height<=0;
    Object.assign(this,fitReviewCamera([this.scene,{objects:[],overlay:this.markerGuides}],{width:width||1100,height:height||760,yaw:this.yaw,pitch:this.pitch}));
  }
  frame(building=this.building,activeFloor=this.activeFloor){
    if(!building)return;
    this.rebuild(building,activeFloor);this.fit();this.draw();
  }
  resize(){
    const {width,height}=this.canvas.getBoundingClientRect();
    if(width<=0||height<=0){this.needsFit=true;return;}
    if(this.scene)this.fit();
    super.resize();
  }
  draw(){
    const {width,height}=this.canvas.getBoundingClientRect();
    if(width<=0||height<=0)return;
    super.draw();
    if(this.scene)drawPreviewOverlay(this.ctx,this,this.scene.overlay,width,height);
    drawMarkerGuides(this.ctx,this,this.markerGuides,width,height);
  }
}

export function webReviewDescription(scene){
  const s=scene.summary,o=s.overlay;
  const view=s.view==='floor'?`Floor ${s.floor}: ${s.floorLabel} · roofs and ceilings hidden`:s.view==='roofs'?'Roofs and gable fills':'Whole building';
  let status=s.empty?`${view} · No geometry in this view`:view;
  const notes=[];
  if(o.kind==='footprint'){
    status+=` · ${o.source} · ${o.area.toFixed(2)} m² structural coverage before stair/platform cutouts`;
    if(o.status!=='coverage')status+=' · '+o.status;
    if(o.reason)notes.push(o.reason);
    notes.push(`Automatic floor ${o.autoFloor?'on':'off'}; automatic ceiling ${o.autoCeiling?'on':'off'}.`,...o.notes);
  }else if(o.kind==='attachments'){
    status+=o.relationships.length?` · ${o.relationships.length} roof guide${o.relationships.length===1?'':'s'}`:` · ${o.status}`;
    const flagged=o.relationships.filter(r=>r.attachment&&r.attachment.status!=='effective').length;
    if(flagged)status+=` · ${flagged} attachment${flagged===1?' needs':'s need'} review`;
    for(const r of o.relationships)notes.push(`${r.label||r.roofId} → ${r.hostLabel||r.hostRoofId||'no host'}; ${r.flushEdges.length?`flush edges: ${r.flushEdges.join(', ')}`:'no flush edges'}.${r.gableReview?' Review the remaining exposed gable fills.':''}`);
    for(const r of o.relationships)if(r.attachment)notes.push(attachmentSummary(r.attachment));
    notes.push(...o.notes);
  }else notes.push('Software preview; materials are illustrative.');
  return {status,notes,legend:scene.overlay.legend};
}
