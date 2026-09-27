import { areaPoints, polygonBoundary } from './polygon-areas.js';
import { floorView, floorElevation, footprintInfo, structuralFloorRectangles, rectValid } from './model.js';
import { roofAttachmentBlockers } from './roof-geometry.js';
import { roofAttachmentDiagnostics } from './roof-diagnostics.js';

const palette={coverage:'#62e6d1',authored:'#ffce79',void:'#f899cc',envelope:'#62e6d1',flush:'#f899cc'};
const rectPoints=(r,y)=>[{x:r.minX,y,z:r.minZ},{x:r.maxX,y,z:r.minZ},{x:r.maxX,y,z:r.maxZ},{x:r.minX,y,z:r.maxZ}];
function loop(lines,points,kind,dashed=false){for(let i=0;i<points.length;i++)lines.push({a:points[i],b:points[(i+1)%points.length],kind,dashed});}

// Disjoint structural cells share edges. Split at all collinear endpoints and
// cancel opposite directions, retaining outer and courtyard boundaries only.
export function coverageBoundary(rectangles,y){
  if(rectangles.some(r=>r.polygon))return polygonBoundary(rectangles).map(({a,b})=>({a:{...a,y},b:{...b,y},kind:'coverage',dashed:false}));
  const groups=new Map();
  const add=(axis,fixed,low,high,sign)=>{
    const key=axis+':'+fixed;if(!groups.has(key))groups.set(key,{axis,fixed,events:new Map()});
    const events=groups.get(key).events;events.set(low,(events.get(low)||0)+sign);events.set(high,(events.get(high)||0)-sign);
  };
  for(const r of rectangles){add('x',r.minZ,r.minX,r.maxX,1);add('x',r.maxZ,r.minX,r.maxX,-1);add('z',r.minX,r.minZ,r.maxZ,1);add('z',r.maxX,r.minZ,r.maxZ,-1);}
  const lines=[];
  for(const {axis,fixed,events} of groups.values()){
    const positions=[...events.keys()].sort((a,b)=>a-b);let balance=0,start=null,lastSign=0;
    const point=v=>axis==='x'?{x:v,y,z:fixed}:{x:fixed,y,z:v};
    for(let i=0;i<positions.length;i++){
      const v=positions[i];balance+=events.get(v);const sign=Math.sign(balance);
      if(start!==null&&sign!==lastSign){lines.push({a:point(start),b:point(v),kind:'coverage',dashed:false});start=null;}
      if(sign&&start===null)start=v;lastSign=sign;
    }
  }
  return lines;
}

export function previewOverlay(building,{overlay='none',floor=1,roof}={}){
  if(!['none','footprint','attachments'].includes(overlay))throw new Error('Unknown preview overlay');
  if(!Number.isInteger(floor)||floor<1||floor>building.floors.length)throw new Error('Overlay floor does not exist');
  if(roof!==undefined&&overlay!=='attachments')throw new Error('--roof requires --overlay attachments');
  const lines=[],legend=[];
  if(overlay==='none')return {lines,legend,summary:{kind:'none'}};
  if(overlay==='footprint'){
    const view=floorView(building,floor-1),elevation=floorElevation(building,floor-1),rectangles=structuralFloorRectangles(view),info=footprintInfo(view);
    lines.push(...coverageBoundary(rectangles,elevation));
    const authored=[];
    for(const r of view.slabs||[])if(rectValid(r)){loop(lines,rectPoints(r,elevation),'authored',true);authored.push({id:r.id,type:'footprint',bounds:{minX:r.minX,maxX:r.maxX,minZ:r.minZ,maxZ:r.maxZ}});}
    for(const r of view.regions||[])if(rectValid(r)&&['solid','void'].includes(r.effect)){
      loop(lines,areaPoints(r).map(p=>({...p,y:elevation})),r.effect==='void'?'void':'authored',true);authored.push({id:r.id,type:r.effect+'-region',...(r.polygon?{polygon:r.polygon}:{}),bounds:{minX:r.minX,maxX:r.maxX,minZ:r.minZ,maxZ:r.maxZ}});
    }
    legend.push({kind:'coverage',text:'Structural coverage'},{kind:'authored',text:'Authored footprint / solid region',dashed:true},{kind:'void',text:'Authored void region',dashed:true});
    return {lines,legend,summary:{kind:overlay,floor,floorId:building.floors[floor-1].id,elevation,...info,coverageRectangles:rectangles,authored,
      autoFloor:view.autoFloor!==false,autoCeiling:view.autoCeiling!==false,lineCount:lines.length,
      notes:['Structural coverage precedes stair/platform slab cutouts; it is not walkable floor area.','Guides are drawn through surfaces; manual surfaces are independent.'],
      status:rectangles.length?'coverage':'No structural coverage'}};
  }
  const selected=roof===undefined?(building.roofSections||[]).filter(r=>r.hostRoofId||Object.values(r.edgeModes||{}).includes('flush')):(building.roofSections||[]).filter(r=>r.id===roof);
  if(roof!==undefined&&!selected.length)throw new Error(`Unknown manual roof ID: ${roof}`);
  const relationships=[],diagnostics=roofAttachmentDiagnostics(building);
  for(const r of selected){
    loop(lines,rectPoints(r,r.baseY),'authored',true);
    // Only finite solids are host envelopes. The other returned blockers are
    // huge half-space surrogates for flush edges; render their authored edges.
    const solids=roofAttachmentBlockers(building,r).filter(b=>b.solid),unique=new Set();
    for(const blocker of solids)for(const face of blocker.solid.faces)for(let i=0;i<face.points.length;i++){
      const a=face.points[i],b=face.points[(i+1)%face.points.length],key=[JSON.stringify(a),JSON.stringify(b)].sort().join('|');
      if(unique.has(key))continue;unique.add(key);lines.push({a:{...a},b:{...b},kind:'envelope',dashed:false});
    }
    for(const [edge,mode] of Object.entries(r.edgeModes||{}))if(mode==='flush'){
      const alongX=edge.endsWith('Z'),a=alongX?{x:r.minX,y:r.baseY,z:r[edge]}:{x:r[edge],y:r.baseY,z:r.minZ},b=alongX?{x:r.maxX,y:r.baseY,z:r[edge]}:{x:r[edge],y:r.baseY,z:r.maxZ};
      lines.push({a,b,kind:'flush',dashed:false});
    }
    const host=(building.roofSections||[]).find(h=>h.id===r.hostRoofId);
    relationships.push({roofId:r.id,label:r.label,hostRoofId:r.hostRoofId||null,hostLabel:host?.label||null,hostType:host?.type||null,hostEnvelopeFaces:solids.reduce((n,b)=>n+b.solid.faces.length,0),
      flushEdges:Object.entries(r.edgeModes||{}).filter(([,mode])=>mode==='flush').map(([edge])=>edge),
      gableReview:r.type==='gable'&&r.gableEnds!=='none'&&!!host,attachment:diagnostics.find(d=>d.roofId===r.id)||null});
  }
  legend.push({kind:'envelope',text:'Exact host clipping envelope'},{kind:'authored',text:'Authored roof footprint',dashed:true},{kind:'flush',text:'Flush edge at roof base'});
  return {lines,legend,summary:{kind:overlay,relationships,lineCount:lines.length,status:selected.length?'relationships':'No manual roof attachments or flush edges',
    notes:['Guides are drawn through surfaces; a host envelope is not a collision mesh.','Gable fills remain separate; automatic roof-to-wall blockers are not shown.']}};
}

export function drawPreviewOverlay(ctx,renderer,overlay,width,height){
  const camera=renderer.camera();ctx.save();
  // Clip each edge against the camera near plane before projecting. A manual
  // close-up must not connect across the camera or drop a crossing edge.
  for(const line of overlay.lines){
    let a=line.a,b=line.b;
    const depth=p=>(p.x-camera.pos.x)*camera.forward.x+(p.y-camera.pos.y)*camera.forward.y+(p.z-camera.pos.z)*camera.forward.z;
    let da=depth(a),db=depth(b);const near=.051;
    if(da<near&&db<near)continue;
    if(da<near||db<near){const t=(near-da)/(db-da),p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t};if(da<near)a=p;else b=p;}
    const pa=renderer.project(a,camera,width,height),pb=renderer.project(b,camera,width,height);if(!pa||!pb)continue;
    ctx.setLineDash(line.dashed?[7,5]:[]);ctx.lineWidth=4;ctx.strokeStyle='rgba(9,18,16,.85)';
    ctx.beginPath();ctx.moveTo(pa.x,pa.y);ctx.lineTo(pb.x,pb.y);ctx.stroke();ctx.lineWidth=2;ctx.strokeStyle=palette[line.kind];ctx.stroke();
  }
  ctx.restore();
}

export function drawOverlayLegend(ctx,overlay,x,y,width){
  ctx.save();ctx.beginPath();ctx.rect(x,y,width,90);ctx.clip();ctx.font='14px sans-serif';
  overlay.legend.forEach((entry,i)=>{
    const left=x+20+i*350;ctx.strokeStyle=palette[entry.kind];ctx.lineWidth=2;ctx.setLineDash(entry.dashed?[7,5]:[]);ctx.beginPath();ctx.moveTo(left,y+16);ctx.lineTo(left+24,y+16);ctx.stroke();
    ctx.fillStyle='#d7e2d8';ctx.fillText(entry.text,left+32,y+21);
  });
  ctx.setLineDash([]);ctx.fillStyle='#adb9af';ctx.font='13px sans-serif';
  const fit=text=>{text=String(text).replace(/[\r\n\t]/g,' ');if(ctx.measureText(text).width<=width-40)return text;while(text&&ctx.measureText(text+'…').width>width-40)text=text.slice(0,-1);return text+'…';};
  const s=overlay.summary;
  const detail=s.kind==='footprint'?`Floor ${s.floor}: ${s.source} · ${s.area.toFixed(2)} m² structural coverage · before stair/platform cutouts`:
    s.relationships.length===1?`${s.relationships[0].label} → ${s.relationships[0].hostLabel||'no host'}${s.relationships[0].attachment?' · '+s.relationships[0].attachment.status:''} · gable fills reviewed separately`:
    s.relationships.length?`${s.relationships.length} roof selections · ${s.relationships.filter(r=>r.hostRoofId).length} host links · gable fills reviewed separately`:s.status;
  ctx.fillText(fit(detail),x+20,y+46);
  ctx.fillText(fit(s.reason||s.notes[s.kind==='footprint'?1:0]),x+20,y+68);ctx.restore();
}
