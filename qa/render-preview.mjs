// Runs the editor's actual canvas renderer under Node. This is not a browser
// layout test or a Godot render. Requires @napi-rs/canvas (not a runtime dependency).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Preview3D } from '../src/preview.js';
const require=createRequire(import.meta.url);
const canvasModule=process.env.CANVAS_MODULE||'@napi-rs/canvas';
const {createCanvas}=require(canvasModule);
globalThis.devicePixelRatio=1;
globalThis.ResizeObserver=class {observe(){}};
const output=process.argv[2];
if(!output)throw new Error('Usage: node qa/render-preview.mjs OUTPUT_DIRECTORY');
fs.mkdirSync(output,{recursive:true});
for(const [name,yaw,pitch,distance] of [['barn_v2',.32,-.23,39],['variable_levels',-.5,-.55,27],['twostory',.65,-.42,36],['farmhouse',.6,-.4,32],['roof_junctions',.7,-.5,23],['courtyard_regions',.6,-.85,25],['editable_junctions',.65,-.7,23],['roof_attachment',.55,-.5,23],['l_shaped_outline',.55,-.85,23],['u_shaped_outline',.55,-.85,23],['courtyard_outline',.55,-.95,23]]){
  const canvas=createCanvas(1100,760);
  canvas.addEventListener=()=>{};canvas.parentElement={};canvas.classList={add(){},remove(){}};
  canvas.getBoundingClientRect=()=>({width:1100,height:760});
  const preview=new Preview3D(canvas);
  const building=JSON.parse(fs.readFileSync(`examples/${name}.building.json`,'utf8'));
  preview.rebuild(building,0);preview.frame(building);
  preview.yaw=yaw;preview.pitch=pitch;preview.distance=distance;preview.draw();
  const ctx=canvas.getContext('2d');ctx.fillStyle='#d9dfd2';ctx.font='18px sans-serif';
  ctx.fillText(building.name+' · Editor canvas preview',20,30);
  fs.writeFileSync(path.join(output,`${name}.png`),canvas.toBuffer('image/png'));
  console.log('Rendered '+name);
}
