import {wallTypeProblem,wallTypePreset} from './wall-types.js';
export function createWallTypeEditor({document,$,getBuilding,save,remove}){
  const dialog=$('#wall-type-dialog'),plot=$('#wall-type-preview');let draft=null,targets=[],drag=null,transform=null;
  const message=text=>$('#wall-type-message').textContent=text;
  const used=id=>getBuilding().floors.flatMap(f=>f.walls).filter(w=>w.wallTypeId===id).length;
  function close(){drag=null;if(dialog.close)dialog.close();else dialog.open=false;dialog.hidden=true;}
  function draw(){
    const ctx=plot.getContext('2d');if(!ctx)return;const w=plot.width=600,h=plot.height=380;
    ctx.fillStyle='#101b22';ctx.fillRect(0,0,w,h);if(!draft||wallTypeProblem(draft))return;
    const points=draft.stations,lo=Math.min(-.3,...points.map(p=>p.offset-p.thickness/2))-.15,hi=Math.max(.3,...points.map(p=>p.offset+p.thickness/2))+.15;
    const t=drag?.transform||{scale:(w-100)/(hi-lo),origin:50-lo*(w-100)/(hi-lo),top:44,height:h-94};transform=t;
    const at=(offset,height)=>({x:t.origin+offset*t.scale,y:t.top+(1-height)*t.height});
    ctx.strokeStyle='#4c6978';ctx.setLineDash([5,5]);ctx.beginPath();const zero=at(0,0);ctx.moveTo(zero.x,30);ctx.lineTo(zero.x,h-35);ctx.stroke();ctx.setLineDash([]);
    const outline=[...points.map(p=>at(p.offset-p.thickness/2,p.height)),...points.slice().reverse().map(p=>at(p.offset+p.thickness/2,p.height))];
    ctx.beginPath();outline.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle='#456a7c';ctx.fill();ctx.strokeStyle='#a8d4e6';ctx.lineWidth=2;ctx.stroke();
    for(const [i,p] of points.entries()){const q=at(p.offset,p.height);ctx.beginPath();ctx.arc(q.x,q.y,6,0,Math.PI*2);ctx.fillStyle='#ffd477';ctx.fill();ctx.font='12px sans-serif';ctx.fillText(String(i+1),q.x+10,q.y-8);}
    ctx.font='14px sans-serif';ctx.textAlign='left';ctx.fillStyle='#dce8ed';ctx.fillText('Outward (−)',18,22);ctx.textAlign='right';ctx.fillText('Inward (+)',w-18,22);ctx.textAlign='center';ctx.fillText('Side-on wall section · dashed line = plan wall',w/2,h-12);
  }
  function render(){
    $('#wall-type-name').value=draft.label;
    const rows=$('#wall-type-levels');rows.replaceChildren();
    draft.stations.forEach((p,i)=>{
      const row=document.createElement('div');row.className='wall-profile-level';
      for(const [key,label,factor,step] of [['height','Height %',100,'1'],['offset','Offset m',1,'.05'],['thickness','Thickness m',1,'.01']]){
        const field=document.createElement('label'),input=document.createElement('input');field.textContent=`${i+1} · ${label}`;input.type='number';input.step=step;input.value=Number((p[key]*factor).toFixed(4));input.disabled=key==='height'&&(i===0||i===draft.stations.length-1);input.dataset.field=key;input.dataset.level=String(i);
        input.addEventListener('change',()=>{p[key]=input.value.trim()===''?NaN:input.valueAsNumber/factor;message(wallTypeProblem(draft)||'Profile ready to save.');draw();});field.append(input);row.append(field);
      }
      const button=document.createElement('button');button.type='button';button.textContent='Remove';button.disabled=i===0||i===draft.stations.length-1;button.addEventListener('click',()=>{draft.stations.splice(i,1);render();});row.append(button);rows.append(row);
    });
    $('#wall-type-add-level').disabled=draft.stations.length>=16;$('#wall-type-delete').disabled=!$('#wall-type-choice').value;
    $('#wall-type-usage').textContent=`Used by ${$('#wall-type-choice').value?used(draft.id):0} walls. Saving updates this shared type${targets.length?` and applies it to ${targets.length} selected walls`:''}. Deleting returns its walls to Standard.`;
    message(wallTypeProblem(draft)||'Drag the yellow dots to shape the profile, or edit the values.');draw();
  }
  function load(id){$('#wall-type-preset').value='';const b=getBuilding(),existing=(b.wallTypes||[]).find(t=>t.id===id);draft=existing?structuredClone(existing):{id:'new',label:'New wall type',stations:wallTypePreset('standard',b.wallThickness)};render();}
  function open(id='',wallIds=[]){targets=[...wallIds];const select=$('#wall-type-choice');select.replaceChildren();for(const [value,label] of [['','New wall type'],...(getBuilding().wallTypes||[]).map(t=>[t.id,t.label])]){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);}select.value=id;load(id);dialog.hidden=false;if(dialog.showModal)dialog.showModal();else dialog.open=true;draw();}
  $('#wall-type-choice').addEventListener('change',e=>load(e.target.value));
  $('#wall-type-name').addEventListener('input',e=>{draft.label=e.target.value;message(wallTypeProblem(draft)||'Profile ready to save.');});
  $('#wall-type-preset').addEventListener('change',e=>{if(!e.target.value)return;draft.stations=wallTypePreset(e.target.value,getBuilding().wallThickness);e.target.value='';render();});
  $('#wall-type-add-level').addEventListener('click',()=>{let i=0;for(let j=1;j<draft.stations.length-1;j++)if(draft.stations[j+1].height-draft.stations[j].height>draft.stations[i+1].height-draft.stations[i].height)i=j;const a=draft.stations[i],b=draft.stations[i+1];draft.stations.splice(i+1,0,{height:(a.height+b.height)/2,offset:(a.offset+b.offset)/2,thickness:(a.thickness+b.thickness)/2});render();});
  $('#wall-type-save').addEventListener('click',()=>{draft.label=$('#wall-type-name').value;const problem=wallTypeProblem(draft);if(problem){message(problem);return;}const error=save(structuredClone(draft),targets,!$('#wall-type-choice').value);if(error)message(error);else close();});
  $('#wall-type-delete').addEventListener('click',()=>{if(!$('#wall-type-choice').value)return;const error=remove(draft.id);if(error)message(error);else close();});
  $('#wall-type-cancel').addEventListener('click',close);dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  const point=e=>{const r=plot.getBoundingClientRect();return {x:(e.clientX-r.left)*600/r.width,y:(e.clientY-r.top)*380/r.height};};
  plot.addEventListener('pointerdown',e=>{if(e.button!==0||!transform||wallTypeProblem(draft))return;const p=point(e),i=draft.stations.findIndex(q=>Math.hypot(transform.origin+q.offset*transform.scale-p.x,transform.top+(1-q.height)*transform.height-p.y)<12);if(i<0)return;drag={i,before:structuredClone(draft.stations),transform:{...transform},id:e.pointerId};plot.setPointerCapture?.(e.pointerId);});
  plot.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;const p=point(e),t=drag.transform,i=drag.i,q=draft.stations[i];q.offset=Math.max(-10,Math.min(10,(p.x-t.origin)/t.scale));if(i>0&&i<draft.stations.length-1)q.height=Math.max(draft.stations[i-1].height+.001,Math.min(draft.stations[i+1].height-.001,1-(p.y-t.top)/t.height));draw();});
  plot.addEventListener('pointerup',e=>{if(!drag||e.pointerId!==drag.id)return;const id=drag.id;drag=null;if(plot.hasPointerCapture?.(id))plot.releasePointerCapture(id);render();});
  plot.addEventListener('pointercancel',e=>{if(drag&&e.pointerId===drag.id){draft.stations=drag.before;drag=null;render();}});
  return {open,close,isOpen:()=>!!dialog.open};
}
