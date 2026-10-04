// Optional engine suite: renders an exported example in Godot through the CLI.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url)),cli=path.join(root,'cli.mjs');
if(!process.env.GODOT_BIN)throw new Error('Set GODOT_BIN for the engine suite');
if(!process.env.DISPLAY&&spawnSync('xvfb-run',['--help']).error){console.log('SKIP render engine test: no DISPLAY and no xvfb-run');process.exit(0);}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'building-render-engine-'));
const run=(args,expected=0)=>{const r=spawnSync(process.execPath,[cli,...args,'--json'],{cwd:temp,env:process.env,encoding:'utf8',timeout:600000,maxBuffer:32e6});assert.equal(r.status,expected,r.stdout+r.stderr);return JSON.parse(r.stdout);};
const png=file=>{const b=fs.readFileSync(file);assert.equal(b.subarray(1,4).toString(),'PNG');return {width:b.readUInt32BE(16),height:b.readUInt32BE(20)};};
try{
  run(['export',path.join(root,'examples/courtyard_regions.building.json'),'--out','assets']);
  const auto=run(['godot-check','--assets','assets','--render','--out','auto','--require-collision']);
  assert.equal(auto.ok,true);
  const manifest=JSON.parse(fs.readFileSync(path.join(temp,'auto/renders.json'),'utf8'));
  const names=manifest.views.map(v=>v.file);
  for(const n of ['exterior-ne.png','exterior-se.png','exterior-sw.png','exterior-nw.png','aerial.png','floor-01-open-courtyard.png','floor-01-west-workshop.png'])assert.ok(names.includes(n),`${n} in ${names}`);
  assert.equal(auto.render.images,names.length);
  for(const n of names)assert.deepEqual(png(path.join(temp,'auto',n)),{width:1280,height:800});
  // Pixels differ between an exterior and an aerial view (the camera actually moved).
  assert.notDeepEqual(fs.readFileSync(path.join(temp,'auto/exterior-ne.png')),fs.readFileSync(path.join(temp,'auto/aerial.png')));
  fs.writeFileSync(path.join(temp,'views.json'),JSON.stringify({views:[{name:'gate',eye:[0,1.7,12],look:[0,1.5,0],fov:60}]}));
  const custom=run(['godot-check','--assets','assets','--render','--out','custom','--views','views.json']);
  const colored=run(['godot-check','--assets','assets','--render','--surface-colors','--out','colored','--views','views.json']);
  assert.equal(JSON.parse(fs.readFileSync(path.join(temp,'colored/renders.json'),'utf8')).colorMode,'surfaces');
  assert.notDeepEqual(fs.readFileSync(path.join(temp,'colored/gate.png')),fs.readFileSync(path.join(temp,'custom/gate.png')),'surface colours change the pixels');
  assert.deepEqual(custom.render.files,['gate.png']);
  // Feedback: preview without @napi-rs/canvas falls back to a Godot aerial render.
  const fallback=spawnSync(process.execPath,[cli,'preview',path.join(root,'examples/courtyard_regions.building.json'),'--out','fallback.png','--json'],{cwd:temp,env:{...process.env,CANVAS_MODULE:path.join(temp,'no-canvas')},encoding:'utf8',timeout:600000,maxBuffer:32e6});
  assert.equal(fallback.status,0,fallback.stdout+fallback.stderr);assert.equal(JSON.parse(fallback.stdout).preview.renderer,'godot');
  assert.deepEqual(png(path.join(temp,'fallback.png')),{width:1280,height:800});
  // Halcyon: a manual roof that meets nothing exports as an unnamed BoxMesh;
  // the surface-colour mode still paints it as a roof instead of leaving the
  // default grey (which reads as wall siding).
  {
    const { applyTransaction } = await import('./src/transactions.js'), { prepareDocument } = await import('./src/diagnostics.js'), { makeEmptyBuilding } = await import('./src/model.js');
    const b0=makeEmptyBuilding();b0.floors[0].id='floor_1';b0.name='Lone roof';
    const r=applyTransaction(prepareDocument(b0).building,{version:1,operations:[{op:'building.update',value:{roof:{type:'none'}}},{op:'roof.add',id:'lone',value:{type:'flat',minX:-4,maxX:4,minZ:-4,maxZ:4,baseY:3,overhang:0}}]});assert.equal(r.ok,true,JSON.stringify(r.errors));
    fs.writeFileSync(path.join(temp,'lone.building.json'),JSON.stringify(r.building));run(['export','lone.building.json','--out','lone']);
    assert.match(fs.readFileSync(path.join(temp,'lone/lone_roof.tscn'),'utf8'),/\[node name="ManualRoof_001_Flat"[^\n]*\]\n[^\n]*\n[^\n]*\nmesh = SubResource\("BoxMesh_/,'the lone roof is a BoxMesh primitive');
    fs.writeFileSync(path.join(temp,'top.json'),JSON.stringify({views:[{name:'top',eye:[0,12,0.01],look:[0,3,0],fov:30}]}));
    run(['godot-check','--assets','lone','--render','--out','lone-plain','--views','top.json']);run(['godot-check','--assets','lone','--render','--surface-colors','--out','lone-colored','--views','top.json']);
    assert.notDeepEqual(fs.readFileSync(path.join(temp,'lone-colored/top.png')),fs.readFileSync(path.join(temp,'lone-plain/top.png')),'a BoxMesh manual roof gets the roof colour');
  }
  run(['godot-check','--assets','assets','--render','--out','custom'],3);
  console.log(`PASS render engine: ${names.length} automatic views and 1 custom view rendered by ${auto.engineVersion}`);
  // Web editor route: the local server renders the web export with the same views.
  const { spawn } = await import('node:child_process');
  const { createEditorHarness } = await import('./qa/editor-harness.mjs');
  const server=spawn(process.execPath,[path.join(root,'server.mjs')],{env:{...process.env,PORT:'0'},stdio:['ignore','pipe','pipe']});
  try{
    const base=await new Promise((resolve,reject)=>{let out='';server.stdout.on('data',d=>{out+=d;const m=/http:\/\/\S+/.exec(out);if(m)resolve(m[0]);});server.on('exit',c=>reject(new Error(`server exited ${c}`)));setTimeout(()=>reject(new Error('server start timeout')),10000);});
    const e=await createEditorHarness({fetch:(url,init)=>fetch(base+url,init)});
    await e.loadBuildingData(JSON.parse(fs.readFileSync(path.join(root,'examples/courtyard_regions.building.json'),'utf8')));
    await e.$('#godot-render-btn').click();
    const gallery=e.$('#godot-render-results').children.map(f=>f.children[1].textContent+'.png');
    assert.deepEqual(gallery,[...names,'current-view.png'],'web renders the godot-check --render views plus the current 3D preview camera');
    if(process.env.RENDER_SAMPLE_OUT){fs.writeFileSync(process.env.RENDER_SAMPLE_OUT,Buffer.from(e.$('#godot-render-results').children.at(-1).children[0].src.split(',')[1],'base64'));}
    assert.match(e.$('#godot-render-status').textContent,new RegExp(`${names.length+1} views rendered by Godot 4\\.`));
    assert.deepEqual(e.errors,[]);
    console.log(`PASS web render: ${gallery.length} views through the local server match the CLI`);
  }finally{server.kill();}
}finally{fs.rmSync(temp,{recursive:true,force:true});}
