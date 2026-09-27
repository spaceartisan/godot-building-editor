// Optional pixel and CLI checks; requires CANVAS_MODULE or @napi-rs/canvas.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { renderReview } from './src/preview-review.js';
import { prepareDocument } from './src/diagnostics.js';
import { makeEmptyBuilding } from './src/model.js';
const require=createRequire(import.meta.url),{createCanvas,loadImage}=require(process.env.CANVAS_MODULE||'@napi-rs/canvas');
const root=path.dirname(fileURLToPath(import.meta.url)),temp=fs.mkdtempSync(path.join(os.tmpdir(),'building-preview-'));
const source=path.join(root,'examples/roof_attachment.building.json'),bytes=fs.readFileSync(source);
const building=prepareDocument(JSON.parse(bytes)).building;
let calls=0;
function run(args,expected=0){const r=spawnSync(process.execPath,[path.join(root,'cli.mjs'),...args,'--json'],{cwd:temp,env:process.env,encoding:'utf8',timeout:60000});calls++;assert.equal(r.status,expected,r.stdout+r.stderr);return JSON.parse(r.stdout);}
try{
  const beforeGlobals={pixel:globalThis.devicePixelRatio,resize:globalThis.ResizeObserver};
  const same=renderReview([building,building],createCanvas,{view:'floor',floor:1,pitch:-1.1});
  assert.equal(same.canvas.width,2200);assert.equal(same.canvas.height,852);
  const ctx=same.canvas.getContext('2d');
  assert.deepEqual(ctx.getImageData(4,60,1090,760).data,ctx.getImageData(1104,60,1090,760).data,'Identical inputs have pixel-identical viewports');
  assert.deepEqual({pixel:globalThis.devicePixelRatio,resize:globalThis.ResizeObserver},beforeGlobals,'Headless renderer needs no browser-global shims');
  const empty=makeEmptyBuilding();empty.roof.type='none';assert.equal(renderReview([empty],createCanvas,{view:'roofs'}).report.panels[0].empty,true);
  const out=path.join(temp,'compare with spaces.png');const r=run(['preview',source,'--compare',source,'--view','floor','--out',out]);
  assert.equal(r.preview.panels.length,2);assert.equal(r.results.length,2);assert.equal(r.preview.camera.automaticDistance,true);
  const png=await loadImage(out);assert.equal(png.width,2200);assert.equal(png.height,852);
  const second=path.join(temp,'repeat.png');run(['preview',source,'--compare',source,'--view','floor','--out',second]);assert.deepEqual(fs.readFileSync(out),fs.readFileSync(second));
  run(['preview',source,'--out',out],3);
  for(const flags of [['--view','bad'],['--floor','2'],['--floor','1.5'],['--pitch','nan'],['--distance','0']])run(['preview',source,'--out',path.join(temp,'bad.png'),...flags],2);
  run(['preview',source,'--compare','missing.json','--out',path.join(temp,'bad.png')],3);
  fs.writeFileSync(path.join(temp,'bad.json'),'{bad');run(['preview',source,'--compare',path.join(temp,'bad.json'),'--out',path.join(temp,'bad.png')],1);
  run(['preview',path.join(root,'examples/twostory.building.json'),'--compare',source,'--floor','2','--out',path.join(temp,'bad.png')],2);
  assert.equal(fs.existsSync(path.join(temp,'bad.png')),false);
  const guides=renderReview([building,building],createCanvas,{view:'roofs',overlay:'attachments',roof:building.roofSections[1].id});
  assert.equal(guides.canvas.height,932);const gctx=guides.canvas.getContext('2d');
  assert.deepEqual(gctx.getImageData(4,60,1090,760).data,gctx.getImageData(1104,60,1090,760).data,'Identical guide views share projection and pixels');
  const guideFile=path.join(temp,'guides.png');const guided=run(['preview',source,'--view','roofs','--overlay','attachments','--roof',building.roofSections[1].id,'--out',guideFile]);
  assert.equal(guided.preview.height,932);assert.equal((await loadImage(guideFile)).height,932);assert.ok(guided.preview.panels[0].overlay.lineCount>0);
  const footprint=run(['preview',source,'--overlay','footprint','--view','floor','--out',path.join(temp,'footprint.png')]);assert.equal(footprint.preview.panels[0].overlay.area,96);
  for(const flags of [['--overlay','bogus'],['--roof','abc'],['--overlay','footprint','--roof','abc'],['--overlay','attachments','--roof','missing']])run(['preview',source,'--out',path.join(temp,'bad.png'),...flags],2);
  const removed=structuredClone(building);removed.roofSections.pop();const removedFile=path.join(temp,'removed.json');fs.writeFileSync(removedFile,JSON.stringify(removed));
  run(['preview',source,'--compare',removedFile,'--overlay','attachments','--roof',building.roofSections[1].id,'--out',path.join(temp,'bad.png')],2);
  assert.equal(fs.existsSync(path.join(temp,'bad.png')),false);
  assert.deepEqual(fs.readFileSync(source),bytes);
  console.log(`PASS ${calls} preview CLI calls: pixel equality, deterministic PNG, overlay geometry/legends, dimensions, empty views, selector/input failures, immutability and no overwrite`);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
