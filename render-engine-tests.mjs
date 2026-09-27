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
  assert.deepEqual(custom.render.files,['gate.png']);
  run(['godot-check','--assets','assets','--render','--out','custom'],3);
  console.log(`PASS render engine: ${names.length} automatic views and 1 custom view rendered by ${auto.engineVersion}`);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
