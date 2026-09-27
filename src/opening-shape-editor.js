import {openingShapeProblem,openingShapePreset,shapedDoorLayout} from './opening-shapes.js';
import {createHistory} from './history.js';

export function createOpeningShapeEditor({document,$,getBuilding,save,remove}){
  const dialog=$('#opening-shape-dialog'),canvas=$('#opening-shape-preview');
  let draft=null,targets=[],selected=0,drag=null,drawing=null,previousFocus=null,history=null;
  const message=text=>$('#opening-shape-message').textContent=text;
  const dimensions=()=>{
    const width=Number($('#opening-preview-width').value),height=Number($('#opening-preview-height').value);
    return {width,height,valid:[width,height].every(v=>Number.isFinite(v)&&v>=.1&&v<=1000)};
  };
  const transform=()=>{const size=dimensions(),width=size.valid?size.width:3,height=size.valid?size.height:2.4,s=Math.min(500/width,300/height);return {left:(600-width*s)/2,top:(380-height*s)/2,w:width*s,h:height*s};};
  const pixel=p=>{const t=transform();return {x:t.left+p.x*t.w,y:t.top+(1-p.y)*t.h};};
  const snapshot=()=>({draft:structuredClone(draft),drawing:structuredClone(drawing)});
  function record(rebuild=true){history.record(snapshot());rebuild?render():refreshState();}
  function cancelDrag(){
    if(!drag)return false;const previous=drag;drag=null;draft.points=previous.before;
    if(canvas.hasPointerCapture?.(previous.id))canvas.releasePointerCapture(previous.id);return true;
  }
  function restore(direction){
    if(cancelDrag()){render();return;}
    const entry=history[direction]();if(!entry)return;
    draft=entry.state.draft;drawing=entry.state.drawing;selected=Math.min(selected,draft.points.length-1);render();
  }
  function framePreview(){
    const feedback=$('#opening-shape-frame-status');feedback.dataset.fit='none';
    if(drawing){feedback.textContent='Finish drawing to preview the frame and panel.';return null;}
    if(!$('#opening-shape-frame-preview').checked){feedback.textContent='Outline only. The frame preview does not change your doorway style.';return null;}
    const problem=openingShapeProblem(draft);if(problem){feedback.textContent='Frame preview unavailable until the outline is valid.';return null;}
    const size=dimensions();if(!size.valid){feedback.dataset.fit='error';feedback.textContent='Enter preview dimensions between 0.1 and 1,000 metres.';return null;}
    try{
      const layout=shapedDoorLayout({...getBuilding(),openingShapes:[draft]},{shapeId:draft.id,width:size.width,height:size.height,doorStyle:'room'});
      feedback.dataset.fit='ok';feedback.textContent=`Frame fits the ${size.width} × ${size.height} m preview. Frame ${(layout.frameWidth*100).toFixed(1)} cm · panel gap 6 mm. Each affected doorway is validated at its own size when saved.`;
      return {layout,...size};
    }catch(error){feedback.dataset.fit='error';feedback.textContent=`Frame does not fit the ${size.width} × ${size.height} m preview: ${error.message} Empty passages can still use a valid outline.`;return null;}
  }
  function draw(){
    const ctx=canvas.getContext('2d');canvas.width=600;canvas.height=380;if(!ctx||!draft)return;
    ctx.fillStyle='#101b22';ctx.fillRect(0,0,600,380);const t=transform();
    ctx.strokeStyle='#263d48';ctx.lineWidth=1;
    for(let i=0;i<=10;i++){ctx.beginPath();ctx.moveTo(t.left+t.w*i/10,t.top);ctx.lineTo(t.left+t.w*i/10,t.top+t.h);ctx.moveTo(t.left,t.top+t.h*i/10);ctx.lineTo(t.left+t.w,t.top+t.h*i/10);ctx.stroke();}
    const problem=openingShapeProblem(draft),preview=framePreview(),outline=points=>{ctx.beginPath();let first=true;for(const p of points){if(!Number.isFinite(p.x)||!Number.isFinite(p.y))continue;const q=pixel(p);first?ctx.moveTo(q.x,q.y):ctx.lineTo(q.x,q.y);first=false;}ctx.closePath();};
    outline(drawing||draft.points);
    if(!drawing){ctx.fillStyle=problem?'#623f45':preview?'#526773':'#42677b';ctx.fill();}
    // An unfinished outline must not imply a closed final edge.
    if(drawing){ctx.beginPath();drawing.forEach((p,i)=>{const q=pixel(p);i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y);});}
    ctx.strokeStyle=problem&&!drawing?'#ffa3a3':'#a8d4e6';ctx.lineWidth=2;ctx.stroke();
    if(preview){
      const normalized=points=>points.map(p=>({x:p.x/preview.width+.5,y:p.z/preview.height}));
      outline(normalized(preview.layout.inner));ctx.fillStyle='#101b22';ctx.fill();ctx.strokeStyle='#7f9daa';ctx.lineWidth=1;ctx.stroke();
      outline(normalized(preview.layout.panel));ctx.fillStyle='#83b8c6';ctx.fill();ctx.strokeStyle='#bde8ef';ctx.stroke();
    }
    (drawing||draft.points).forEach((p,i)=>{if(!Number.isFinite(p.x)||!Number.isFinite(p.y))return;const q=pixel(p);ctx.beginPath();ctx.arc(q.x,q.y,i===selected?7:5,0,Math.PI*2);ctx.fillStyle=i===selected?'#fff1ac':'#f2bd68';ctx.fill();ctx.font='12px sans-serif';ctx.fillText(String(i+1),q.x+9,q.y-7);});
    ctx.fillStyle='#dce8ed';ctx.font='13px sans-serif';ctx.textAlign='center';ctx.fillText('Front view · left = wall A, right = wall B',300,18);ctx.fillText(preview?'Slate = frame · blue = panel · no raised threshold':'Floor level · no raised threshold',300,370);
  }
  function render(){
    $('#opening-shape-name').value=draft.label;
    const rows=$('#opening-shape-points');rows.replaceChildren();
    draft.points.forEach((p,i)=>{
      const row=document.createElement('div');row.className='opening-shape-point';row.dataset.selected=String(i===selected);
      const pick=document.createElement('button');pick.type='button';pick.textContent=String(i+1);pick.title='Select corner';pick.disabled=!!drawing;pick.setAttribute('aria-pressed',String(i===selected));pick.addEventListener('click',()=>{selected=i;refreshState();});row.append(pick);
      for(const k of ['x','y']){const label=document.createElement('label'),input=document.createElement('input');label.textContent=k==='x'?'Across %':'Height %';input.type='number';input.min=0;input.max=100;input.step=1;input.value=Number((p[k]*100).toFixed(3));input.dataset.corner=String(i);input.dataset.axis=k;input.disabled=!!drawing;input.addEventListener('change',()=>{p[k]=input.valueAsNumber/100;selected=i;record(false);});label.append(input);row.append(label);}rows.append(row);
    });
    refreshState();
  }
  function refreshState(){
    for(const [i,row] of [...$('#opening-shape-points').children].entries()){row.dataset.selected=String(i===selected);row.querySelector('button').setAttribute('aria-pressed',String(i===selected));}
    $('#opening-shape-add').disabled=!!drawing||draft.points.length>=32;$('#opening-shape-remove').disabled=!!drawing||draft.points.length<=3;$('#opening-shape-fit').disabled=!!drawing;
    $('#opening-shape-delete').disabled=!!drawing||!$('#opening-shape-choice').value;
    $('#opening-shape-copy').disabled=!!drawing||!$('#opening-shape-choice').value;
    $('#opening-shape-save').disabled=!!drawing;
    $('#opening-shape-save').textContent=$('#opening-shape-choice').value?'Save shared shape':'Save new shape';
    $('#opening-shape-finish').hidden=!drawing;$('#opening-shape-back').hidden=!drawing;$('#opening-shape-back').disabled=!drawing?.length;
    $('#opening-shape-undo').disabled=!history?.canUndo();$('#opening-shape-redo').disabled=!history?.canRedo();
    const count=getBuilding().floors.flatMap(f=>f.openings).filter(o=>o.shapeId===draft.id).length;
    $('#opening-shape-usage').textContent=`Used by ${count} openings. Saving updates this shared shape${targets.length?' and applies it to the selected doorway':''}. ${targets.length?'Save as new assigns an independent copy to the selected doorway.':'Save as new creates an independent shape for future doors.'} Width and height are set separately on each doorway.`;
    message(drawing?'Click corners in order, then Finish drawing. The last edge closes automatically.':openingShapeProblem(draft)||'Drag corners or edit their percentages. Add corner splits the edge after the selected point.');draw();
  }
  function load(id){cancelDrag();draft=structuredClone((getBuilding().openingShapes||[]).find(s=>s.id===id)||{id:'new',label:'New doorway shape',points:openingShapePreset('clipped')});drawing=null;selected=0;history=createHistory(snapshot());$('#opening-shape-preset').value='';render();}
  function close(){cancelDrag();drawing=null;if(dialog.close)dialog.close();else dialog.open=false;dialog.hidden=true;previousFocus?.focus?.();}
  function open(id='',ids=[]){
    previousFocus=document.activeElement;targets=[...ids];const select=$('#opening-shape-choice');select.replaceChildren();
    for(const [value,label] of [['','New doorway shape'],...(getBuilding().openingShapes||[]).map(s=>[s.id,s.label])]){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);}select.value=id;
    const o=getBuilding().floors.flatMap(f=>f.openings).find(o=>targets.includes(o.id));$('#opening-preview-width').value=o?.width||3;$('#opening-preview-height').value=o?.height||2.4;
    load(id);dialog.hidden=false;if(dialog.showModal)dialog.showModal();else dialog.open=true;$('#opening-shape-name').focus?.();draw();
  }
  $('#opening-shape-choice').addEventListener('change',e=>load(e.target.value));
  $('#opening-shape-name').addEventListener('change',e=>{draft.label=e.target.value;record(false);});
  $('#opening-shape-preset').addEventListener('change',e=>{if(!e.target.value)return;cancelDrag();draft.points=openingShapePreset(e.target.value);drawing=null;selected=0;e.target.value='';record();});
  for(const id of ['#opening-preview-width','#opening-preview-height','#opening-shape-frame-preview'])$(id).addEventListener('change',()=>{cancelDrag();draw();});
  $('#opening-shape-undo').addEventListener('click',()=>restore('undo'));$('#opening-shape-redo').addEventListener('click',()=>restore('redo'));
  // Text fields retain native text undo. Geometry shortcuts stay in this dialog
  // and cannot touch the building's separate undo stack.
  dialog.addEventListener('keydown',e=>{
    if(e.target?.matches?.('input,select,textarea')||e.target?.isContentEditable||e.altKey)return;
    if((e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();e.stopPropagation?.();restore(e.key.toLowerCase()==='y'||e.shiftKey?'redo':'undo');}
  });
  $('#opening-shape-add').addEventListener('click',()=>{if(drawing||draft.points.length>=32)return;const a=draft.points[selected],b=draft.points[(selected+1)%draft.points.length];draft.points.splice(++selected,0,{x:(a.x+b.x)/2,y:(a.y+b.y)/2});record();});
  $('#opening-shape-remove').addEventListener('click',()=>{if(drawing||draft.points.length<=3)return;draft.points.splice(selected,1);selected=Math.min(selected,draft.points.length-1);record();});
  $('#opening-shape-fit').addEventListener('click',()=>{if(drawing)return;const p=draft.points,minX=Math.min(...p.map(q=>q.x)),maxX=Math.max(...p.map(q=>q.x)),minY=Math.min(...p.map(q=>q.y)),maxY=Math.max(...p.map(q=>q.y));if(!Number.isFinite(maxX+maxY+minX+minY)||maxX-minX<.001||maxY-minY<.001){message('Outline needs finite width and height.');return;}draft.points=p.map(q=>({x:(q.x-minX)/(maxX-minX),y:(q.y-minY)/(maxY-minY)}));record();});
  $('#opening-shape-draw').addEventListener('click',()=>{cancelDrag();drawing=[];record();});
  $('#opening-shape-back').addEventListener('click',()=>{if(drawing?.length){drawing.pop();record();}});
  $('#opening-shape-finish').addEventListener('click',()=>{if(!drawing||drawing.length<3){message('Draw at least three corners.');return;}draft.points=drawing;drawing=null;selected=0;record();});
  function saveDraft(copy=false){
    if(drawing){message('Finish drawing before saving.');return;}
    cancelDrag();draft.label=$('#opening-shape-name').value;const next=structuredClone(draft);
    if(copy){const source=(getBuilding().openingShapes||[]).find(s=>s.id===$('#opening-shape-choice').value);if(!source)return;if(next.label===source.label)next.label=next.label.slice(0,115)+' copy';}
    const error=openingShapeProblem(next)||save(next,targets,copy||!$('#opening-shape-choice').value);if(error)message(error);else close();
  }
  $('#opening-shape-save').addEventListener('click',()=>saveDraft());$('#opening-shape-copy').addEventListener('click',()=>saveDraft(true));
  $('#opening-shape-delete').addEventListener('click',()=>{if(drawing||!$('#opening-shape-choice').value)return;const error=remove(draft.id);if(error)message(error);else close();});
  $('#opening-shape-cancel').addEventListener('click',close);dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  const rawPoint=e=>{const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*600/r.width,y:(e.clientY-r.top)*380/r.height};};
  const point=e=>{const p=rawPoint(e),t=transform(),snap=$('#opening-shape-snap').checked,clamp=v=>Math.max(0,Math.min(1,snap?Math.round(v*100)/100:v));return {x:clamp((p.x-t.left)/t.w),y:clamp(1-(p.y-t.top)/t.h)};};
  canvas.addEventListener('pointerdown',e=>{
    if(e.button!==0||drag)return;const raw=rawPoint(e),p=point(e),t=transform();canvas.focus?.();
    if(drawing){if(raw.x<t.left-1||raw.x>t.left+t.w+1||raw.y<t.top-1||raw.y>t.top+t.h+1)return;if(drawing.length<32){drawing.push(p);record();}else message('Maximum 32 corners.');return;}
    const index=draft.points.findIndex(v=>{const q=pixel(v);return Math.hypot(raw.x-q.x,raw.y-q.y)<13;});if(index<0)return;selected=index;drag={id:e.pointerId,before:structuredClone(draft.points)};canvas.setPointerCapture?.(e.pointerId);draw();
  });
  canvas.addEventListener('pointermove',e=>{if(drag?.id!==e.pointerId)return;draft.points[selected]=point(e);draw();});
  canvas.addEventListener('pointerup',e=>{if(drag?.id!==e.pointerId)return;const changed=JSON.stringify(drag.before)!==JSON.stringify(draft.points);drag=null;if(canvas.hasPointerCapture?.(e.pointerId))canvas.releasePointerCapture(e.pointerId);changed?record():render();});
  for(const event of ['pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{if(drag?.id===e.pointerId){cancelDrag();render();}});
  return {open,close,isOpen:()=>!!dialog.open};
}
