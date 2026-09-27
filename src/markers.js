import {floorElevation} from './model.js';

export function markerProblem(marker){
  if(typeof marker?.label!=='string'||!marker.label.trim()||marker.label.length>120||/[\u0000-\u001f\u007f]/.test(marker.label))return 'Marker name must be 1–120 characters on one line';
  if(marker.details!=null&&(typeof marker.details!=='string'||marker.details.length>2000||/\u0000/.test(marker.details)))return 'Marker notes must be text up to 2,000 characters';
  if(!['x','y','z'].every(k=>typeof marker.position?.[k]==='number'&&Number.isFinite(marker.position[k])&&Math.abs(marker.position[k])<=1e6))return 'Marker coordinates must be finite and within ±1,000,000 m';
  return null;
}

export function markerReviewGuides(building,view='building',activeFloor=0){
  if(view==='roofs')return {lines:[],labels:[]};
  const labels=building.floors.flatMap((floor,i)=>view==='floor'&&i!==activeFloor?[]:(floor.markers||[]).map(m=>({text:m.label,point:{...m.position,y:m.position.y+floorElevation(building,i)}})));
  const lines=labels.flatMap(({point:p})=>['x','y','z'].map(axis=>({a:{...p,[axis]:p[axis]-.2},b:{...p,[axis]:p[axis]+.2}})));
  return {lines,labels};
}

export function drawMarkerGuides(ctx,renderer,guides,width,height){
  if(!guides?.labels.length)return;
  const camera=renderer.camera(),project=p=>renderer.project(p,camera,width,height);
  ctx.save();ctx.strokeStyle='#d69cfa';ctx.lineWidth=2;ctx.setLineDash([]);
  for(const line of guides.lines){const a=project(line.a),b=project(line.b);if(!a||!b)continue;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
  ctx.font='12px sans-serif';const boxes=[];
  for(const label of guides.labels){
    const p=project(label.point);if(!p||p.x<0||p.x>width||p.y<0||p.y>height)continue;
    let text=label.text;while(text.length>1&&ctx.measureText(text).width>Math.min(220,width-32))text=text.slice(0,-2)+'…';
    const w=ctx.measureText(text).width+12,x=Math.max(4,Math.min(width-w-4,p.x+10));let y=Math.max(4,Math.min(height-24,p.y-22));
    for(let step=0;step<5&&boxes.some(r=>x<r.x+r.w&&x+w>r.x&&y<r.y+22&&y+22>r.y);step++)y+=24;
    if(y+22>height)continue;boxes.push({x,y,w});ctx.fillStyle='#17121e';ctx.fillRect(x,y,w,22);ctx.fillStyle='#e3baff';ctx.fillText(text,x+6,y+15);
  }
  ctx.restore();
}
