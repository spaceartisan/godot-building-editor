// Actual interactive renderer with a canvas/event adapter, not a browser layout test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { WebPreview3D } from './src/preview-web.js';
import { Preview3D } from './src/preview.js';
import { drawPreviewOverlay } from './src/preview-overlays.js';
import { prepareDocument } from './src/diagnostics.js';
const require=createRequire(import.meta.url),{createCanvas}=require(process.env.CANVAS_MODULE||'@napi-rs/canvas');
const original=Object.fromEntries(['devicePixelRatio','ResizeObserver'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
const callbacks=[],events=new Map(),captured=new Set();
let size={width:0,height:0};
const canvas=createCanvas(1,1);
canvas.getBoundingClientRect=()=>size;
canvas.parentElement={};canvas.classList={add(){},remove(){}};
canvas.addEventListener=(type,handler)=>events.set(type,handler);
canvas.setPointerCapture=id=>captured.add(id);canvas.hasPointerCapture=id=>captured.has(id);canvas.releasePointerCapture=id=>captured.delete(id);
const event=(type,data={})=>events.get(type)({preventDefault(){},pointerId:1,button:0,...data});
const load=file=>prepareDocument(JSON.parse(fs.readFileSync(file,'utf8'))).building;
function save(name){
  if(!process.env.WEB_PREVIEW_IMAGE_DIR)return;
  fs.mkdirSync(process.env.WEB_PREVIEW_IMAGE_DIR,{recursive:true});
  fs.writeFileSync(path.join(process.env.WEB_PREVIEW_IMAGE_DIR,name+'.png'),canvas.toBuffer('image/png'),{flag:'wx'});
}
try{
  globalThis.devicePixelRatio=1;
  globalThis.ResizeObserver=class{constructor(fn){callbacks.push(fn);}observe(){}};
  const viewer=new WebPreview3D(canvas);
  const building=load('examples/roof_attachment.building.json'),before=JSON.stringify(building);
  viewer.rebuild(building);viewer.setReview({view:'roofs',overlay:'attachments',roof:'roofSections_8'});
  assert.equal(canvas.width,1,'hidden canvas must not be rasterized');
  size={width:1100,height:760};callbacks[0]();
  assert.equal(canvas.width,1100);assert.equal(viewer.needsFit,false);
  const expected=createCanvas(1100,760);expected.getBoundingClientRect=()=>size;
  const renderer=new Preview3D(expected,{interactive:false});
  Object.assign(renderer,{building,activeFloor:0,sceneObjects:viewer.scene.objects,target:viewer.target,yaw:viewer.yaw,pitch:viewer.pitch,distance:viewer.distance});
  renderer.draw();drawPreviewOverlay(expected.getContext('2d'),renderer,viewer.scene.overlay,1100,760);
  assert.deepEqual(canvas.toBuffer('image/png'),expected.toBuffer('image/png'),'web view pixels equal shared geometry/overlay renderer');
  save('web_roof_guides_canvas');
  const geometry=viewer.sceneObjects,initial=canvas.toBuffer('image/png'),yaw=viewer.yaw;
  event('pointerdown',{clientX:20,clientY:20});event('pointermove',{clientX:65,clientY:30});event('pointerup');
  assert.notEqual(viewer.yaw,yaw);assert.equal(captured.size,0);assert.notDeepEqual(canvas.toBuffer('image/png'),initial);
  const target={...viewer.target};
  event('pointerdown',{clientX:20,clientY:20,shiftKey:true});event('pointermove',{clientX:35,clientY:40});event('pointercancel');
  assert.notDeepEqual(viewer.target,target);assert.equal(viewer.drag,null);
  const distance=viewer.distance;event('wheel',{deltaY:1});assert.ok(viewer.distance>distance);
  assert.equal(viewer.sceneObjects,geometry,'orbit, pan and zoom reuse geometry');
  event('dblclick');assert.equal(JSON.stringify(building),before);
  // Backing resolution changes must not leave overlay coordinates in device pixels.
  globalThis.devicePixelRatio=2;size={width:390,height:360};callbacks[0]();
  assert.equal(canvas.width,780);assert.equal(canvas.height,720);
  for(const line of viewer.scene.overlay.lines)for(const point of [line.a,line.b]){
    const p=viewer.project(point,viewer.camera(),390,360);assert.ok(p&&p.x>=46&&p.x<=344&&p.y>=43&&p.y<=317,'guides stay inside fitted viewport at DPR 2');
  }
  const courtyard=load('examples/courtyard_regions.building.json');viewer.rebuild(courtyard);viewer.setReview({view:'floor',overlay:'footprint'});
  assert.equal(viewer.review.roof,undefined);
  assert.equal(viewer.scene.summary.overlay.area,152);
  globalThis.devicePixelRatio=1;size={width:1100,height:760};callbacks[0]();
  save('web_courtyard_guides_canvas');
  size={width:0,height:0};callbacks[0]();viewer.draw();assert.equal(viewer.needsFit,true);
  size={width:768,height:600};callbacks[0]();assert.equal(viewer.needsFit,false);
  console.log('PASS interactive canvas: shared pixels, orbit/pan/zoom/cancel, cached geometry, hidden/show resize, DPR 2 guide framing and document isolation');
  const marked=load('examples/basement_markers.building.json');viewer.frame(marked,0);viewer.setReview({view:'floor',overlay:'none'});
  assert.equal(viewer.markerGuides.labels.length,1);assert.equal(viewer.markerGuides.labels[0].text,'Storage reference');
  const markedPixels=canvas.toBuffer('image/png');const guides=viewer.markerGuides;viewer.markerGuides={lines:[],labels:[]};viewer.draw();assert.notDeepEqual(canvas.toBuffer('image/png'),markedPixels,'Marker gizmos must produce visible pixels');viewer.markerGuides=guides;
  const only=structuredClone(marked);for(const f of only.floors){for(const key of ['walls','openings','stairs','lights','slabs','regions','platforms','railings'])f[key]=[];}only.roof.type='none';only.floors[0].markers[0].position={x:1000,y:7,z:-1000};
  viewer.frame(only,0);for(const line of viewer.markerGuides.lines)for(const point of [line.a,line.b]){const p=viewer.project(point,viewer.camera(),768,600);assert.ok(p&&p.x>0&&p.x<768&&p.y>0&&p.y<600,'Marker-only scenes frame their distant reference points');}
  viewer.setReview({view:'roofs'});assert.equal(viewer.markerGuides.labels.length,0);
  console.log('PASS marker gizmo pixels, active-floor filtering, distant marker-only framing and roof-view suppression');
}finally{
  for(const [key,descriptor] of Object.entries(original)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
}
