// Render option parsing and usage (no Godot needed). The engine suite's
// render-engine-tests.mjs exercises actual Godot rendering.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseViews } from './godot-render.mjs';

const root=path.dirname(fileURLToPath(import.meta.url)),cli=path.join(root,'cli.mjs');
const good={views:[{name:'front',eye:[0,2,20],look:[0,2,0]},{name:'Top_2',eye:[0,40,1],look:[0,0,0],fov:40}]};
assert.deepEqual(parseViews(JSON.stringify(good)).map(v=>[v.name,v.fov]),[['front',60],['Top_2',40]]);
assert.equal(parseViews(JSON.stringify(good.views)).length,2,'a bare array is accepted');
for(const [bad,pattern] of [
  ['{',/invalid JSON/],[{views:[]},/1–200/],[{views:[{name:'../x',eye:[0,0,1],look:[0,0,0]}]},/slug/],
  [{views:[{name:'a',eye:[0,0,1],look:[0,0,0]},{name:'A',eye:[0,0,1],look:[0,0,0]}]},/unique/],
  [{views:[{name:'a',eye:[0,0],look:[0,0,0]}]},/finite/],[{views:[{name:'a',eye:[0,0,0],look:[0,0,0]}]},/must differ/],
  [{views:[{name:'a',eye:[0,0,1],look:[0,0,0],fov:5}]},/10–120/],[{views:[{name:'a',eye:[0,0,1],look:[0,0,0],size:1}]},/unknown field/]
])assert.throws(()=>parseViews(typeof bad==='string'?bad:JSON.stringify(bad)),pattern);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'building-render-usage-'));
const run=(args,expected)=>{const r=spawnSync(process.execPath,[cli,...args,'--json'],{cwd:temp,encoding:'utf8',timeout:30000});assert.equal(r.status,expected,r.stdout+r.stderr);return JSON.parse(r.stdout);};
try{
  assert.match(run(['godot-check','--render'],2).error,/requires --assets and --out/);
  assert.match(run(['godot-check','--assets','x','--out','y'],2).error,/require --render/);
  assert.match(run(['godot-check','--assets','x','--views','v.json'],2).error,/require --render/);
  fs.mkdirSync(path.join(temp,'exists'));
  run(['export',path.join(root,'examples/twostory.building.json'),'--out','assets'],0);
  assert.match(run(['godot-check','--assets','assets','--render','--out','exists','--godot','/nonexistent/godot'],3).error,/Destination already exists/,'destination is checked before Godot runs');
  fs.writeFileSync(path.join(temp,'bad-views.json'),'{"views":[]}');
  assert.match(run(['godot-check','--assets','assets','--render','--out','new','--views','bad-views.json','--godot','/nonexistent/godot'],2).error,/1–200/,'views are validated before Godot runs');
  assert.equal(fs.existsSync(path.join(temp,'new')),false);
  console.log('PASS render views/usage: view validation, required --assets/--out, protected destination');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
