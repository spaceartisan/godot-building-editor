import { Preview3D, previewObjectVertices } from './preview.js';
import { floorElevation, floorView } from './model.js';
import { previewOverlay, drawPreviewOverlay, drawOverlayLegend } from './preview-overlays.js';

// Generate with the complete building context before filtering. Removing floors
// from the document would change stair openings, roof blockers and elevations.
export function reviewScene(building,{view='building',floor=1,overlay='none',roof}={}){
  if(!['building','floor','roofs'].includes(view))throw new Error('Unknown preview view');
  if(!Number.isInteger(floor)||floor<1||floor>building.floors.length)throw new Error('Preview floor does not exist');
  const renderer=Object.create(Preview3D.prototype);
  renderer.building=building;renderer.activeFloor=floor-1;
  const all=renderer.objects(),elevation=floorElevation(building,floor-1),tolerance=Math.max(.05,floorView(building,floor-1).floorThickness*.6);
  const objects=all.filter(o=>view==='building'||(view==='roofs'?o.category==='roof':
    o.category==='story'&&o.floorIndex===floor-1||o.category==='manual-floor'&&Math.abs(o.topY-elevation)<=tolerance));
  const guide=previewOverlay(building,{overlay,floor,roof});
  return {objects,overlay:guide,summary:{view,floor,floorId:building.floors[floor-1].id,floorLabel:building.floors[floor-1].label,elevation,objectCount:objects.length,hiddenObjectCount:all.length-objects.length,overlay:guide.summary,
    categories:Object.fromEntries([...new Set(objects.map(o=>o.category))].map(k=>[k,objects.filter(o=>o.category===k).length])),
    empty:objects.length===0}};
}

export function fitReviewCamera(scenes,{width=1100,height=760,yaw=.6,pitch=-.5,distance}={}){
  const vertices=scenes.flatMap(s=>[...s.objects.flatMap(previewObjectVertices),...(s.overlay?.lines||[]).flatMap(l=>[l.a,l.b])]);
  let bounds=null;
  for(const p of vertices){
    if(![p.x,p.y,p.z].every(Number.isFinite))throw new Error('Non-finite preview geometry');
    if(!bounds)bounds={min:{...p},max:{...p}};
    else for(const k of ['x','y','z']){bounds.min[k]=Math.min(bounds.min[k],p[k]);bounds.max[k]=Math.max(bounds.max[k],p[k]);}
  }
  bounds ||= {min:{x:-2,y:0,z:-2},max:{x:2,y:2,z:2}};
  const target=Object.fromEntries(['x','y','z'].map(k=>[k,(bounds.min[k]+bounds.max[k])/2]));
  const dummy=Object.assign(Object.create(Preview3D.prototype),{target,yaw,pitch,distance:1});
  const cam=dummy.camera(),focal=Math.min(width,height)*.78;
  let fitted=3;
  // Fit both inputs to the SAME projection with 12% margins, including tall
  // shed roofs, offsets and independent surfaces that old plan bounds missed.
  for(const p of vertices){
    const d={x:p.x-target.x,y:p.y-target.y,z:p.z-target.z};
    const dot=v=>d.x*v.x+d.y*v.y+d.z*v.z,z=dot(cam.forward);
    fitted=Math.max(fitted,Math.abs(dot(cam.right))*focal/(width*.38)-z,Math.abs(dot(cam.up))*focal/(height*.38)-z,.1-z);
  }
  return {target,yaw,pitch,distance:distance??fitted,automaticDistance:distance===undefined,bounds};
}

// createCanvas is injected: the browser-safe geometry helpers need no optional
// dependency, and only the CLI renderer requires an installed canvas backend.
export function renderReview(buildings,createCanvas,options={}){
  if(!Array.isArray(buildings)||buildings.length<1||buildings.length>2)throw new Error('Preview requires one or two buildings');
  const width=1100,height=760,header=60,footer=options.overlay&&options.overlay!=='none'?112:32,scenes=buildings.map(b=>reviewScene(b,options));
  const camera=fitReviewCamera(scenes,{...options,width,height});
  const output=createCanvas(width*buildings.length,height+header+footer),ctx=output.getContext('2d');
  ctx.fillStyle='#18211e';ctx.fillRect(0,0,output.width,output.height);
  scenes.forEach((scene,i)=>{
    const canvas=createCanvas(width,height);canvas.getBoundingClientRect=()=>({width,height});
    const renderer=new Preview3D(canvas,{interactive:false});
    Object.assign(renderer,camera,{building:buildings[i],activeFloor:(options.floor||1)-1,sceneObjects:scene.objects});renderer.draw();
    drawPreviewOverlay(canvas.getContext('2d'),renderer,scene.overlay,width,height);
    const x=i*width;ctx.drawImage(canvas,x,header);
    ctx.save();ctx.beginPath();ctx.rect(x+16,0,width-32,header);ctx.clip();
    ctx.fillStyle='#e4e8df';ctx.font='bold 20px sans-serif';ctx.fillText(`${buildings.length===2?(i===0?'Before':'After'):'Preview'} · ${options.view||'building'}${options.view==='floor'?' '+(options.floor||1):''}`,x+20,26);
    ctx.fillStyle='#adb9af';ctx.font='14px sans-serif';ctx.fillText(buildings[i].name.replace(/[\r\n\t]/g,' '),x+20,48);ctx.restore();
    if(scene.summary.empty){ctx.fillStyle='#e4e8df';ctx.font='18px sans-serif';ctx.fillText('No geometry in this view',x+width/2-110,header+height/2);}
    if(scene.overlay.summary.kind!=='none')drawOverlayLegend(ctx,scene.overlay,x,header+height,width);
  });
  ctx.fillStyle='#adb9af';ctx.font='13px sans-serif';ctx.fillText(footer>32?'Software preview · guides drawn through surfaces · not a collision check':'Software preview · '+(buildings.length===2?'shared camera and scale · ':'')+'materials illustrative · '+(options.view==='floor'?'roofs and ceilings hidden':'resource and physics checks are separate'),20,output.height-11);
  if(buildings.length===2){ctx.fillStyle='#516258';ctx.fillRect(width-1,0,2,header+height);}
  return {canvas:output,report:{view:options.view||'building',width:output.width,height:output.height,camera,panels:scenes.map(s=>s.summary),note:'Software geometry review; not a Godot render, browser layout test or collision proof.'}};
}
