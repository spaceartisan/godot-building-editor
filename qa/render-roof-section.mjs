// Measured cross-section from the same roof solid used by the exporter.
// This is a geometry diagram, not an engine or browser screenshot.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { roofSectionsForFloor } from '../src/model.js';
import { roofBoxParts, roofInteriorBlockers, trimRoofBox } from '../src/roof-geometry.js';
const require=createRequire(import.meta.url);
const {createCanvas}=require(process.env.CANVAS_MODULE||'@napi-rs/canvas');
const building=JSON.parse(fs.readFileSync('examples/farmhouse.building.json'));
const rs=roofSectionsForFloor(building,0)[1];
const part=roofBoxParts(rs,building.roof,building.wallHeight,1)[0];
// A distant subtractor tangent to nothing leaves null, so construct the
// original cross section directly from its four rotated slab corners.
const original=[];
for(const [sy,sz] of [[-1,-1],[-1,1],[1,1],[1,-1]]){
  const y=sy*part.size.y/2,z=sz*part.size.z/2,c=Math.cos(part.rot.x),s=Math.sin(part.rot.x);
  original.push({y:part.pos.y+c*y-s*z,z:part.pos.z+s*y+c*z});
}
const trimmed=trimRoofBox(part,roofInteriorBlockers(building,rs,building.wallHeight));
// Side faces project to the exact solid silhouette for this full-width join.
const polygons=trimmed.filter(f=>Math.abs(f.normal.x)>.99).map(f=>f.points);
const canvas=createCanvas(1240,690),ctx=canvas.getContext('2d');
ctx.fillStyle='#17211f';ctx.fillRect(0,0,1240,690);
ctx.fillStyle='#ecf0e9';ctx.font='bold 28px sans-serif';ctx.fillText('Porch roof at the farmhouse wall',34,46);
ctx.fillStyle='#b8c4bc';ctx.font='16px sans-serif';ctx.fillText('Measured export geometry · cross-section through the porch roof · metres',34,74);
const scale=275,top=150,bottom=565;
for(const [panel,label,color] of [[0,'Before','#e4a087'],[1,'After','#9dd4bb']]){
  const left=34+panel*618;
  const at=p=>({x:left+30+(p.z-5.4)*scale,y:bottom-(p.y-3.4)*scale});
  ctx.fillStyle='#202d29';ctx.fillRect(left,110,585,488);
  ctx.fillStyle=color;ctx.font='bold 22px sans-serif';ctx.fillText(label,left+22,143);
  ctx.save();ctx.beginPath();ctx.rect(left+16,top+10,553,bottom-top+10);ctx.clip();
  for(const y of [3.5,4,4.5]){
    const q=at({z:5.4,y});ctx.strokeStyle='#3a4942';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(left+20,q.y);ctx.lineTo(left+564,q.y);ctx.stroke();
    ctx.fillStyle='#aebdb3';ctx.font='13px sans-serif';ctx.fillText(y.toFixed(1),left+22,q.y-6);
  }
  const wallLeft=at({z:5.91,y:4}),wallRight=at({z:6.09,y:3.4});
  ctx.fillStyle='#b5a17b';ctx.fillRect(wallLeft.x,wallLeft.y,wallRight.x-wallLeft.x,wallRight.y-wallLeft.y);
  // Host roof, drawn from its exact box dimensions in the same orientation.
  const host=roofBoxParts(roofSectionsForFloor(building,0)[0],building.roof,4,0)[1];
  const hostPoints=[];
  for(const [sy,sz] of [[-1,-1],[-1,1],[1,1],[1,-1]]){
    const y=sy*host.size.y/2,z=sz*host.size.z/2,c=Math.cos(host.rot.x),s=Math.sin(host.rot.x);
    hostPoints.push({y:host.pos.y+c*y-s*z,z:host.pos.z+s*y+c*z});
  }
  function fill(poly,fill){ctx.fillStyle=fill;ctx.beginPath();poly.map(at).forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fill();}
  fill(hostPoints,'#74665a');
  for(const poly of panel?polygons:[original])fill(poly,panel?'#9b735c':'#c67e61');
  const inner=at({z:5.91,y:3.4});ctx.strokeStyle='#d4c6a6';ctx.setLineDash([4,5]);ctx.beginPath();ctx.moveTo(inner.x,top+12);ctx.lineTo(inner.x,bottom);ctx.stroke();ctx.setLineDash([]);
  ctx.restore();
  ctx.fillStyle='#d4ddd5';ctx.font='16px sans-serif';ctx.fillText('Room',left+56,579);ctx.fillText('Porch',left+340,579);
  ctx.fillStyle=color;ctx.font='17px sans-serif';ctx.fillText(panel?'Room clear · cut edge sealed':'Roof projects 33 cm past the inner wall',left+20,629);
}
ctx.fillStyle='#aebdb3';ctx.font='14px sans-serif';ctx.fillText('Wall and roof thickness shown to scale. Wall shells stay separate; collision follows the trimmed roof.',34,666);
const out=process.argv[2]||'qa/previews';fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'roof_wall_section.png'),canvas.toBuffer('image/png'));
console.log('Rendered measured roof-wall section');
